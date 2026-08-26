import { ORDER_TYPE } from '@somnia-chain/markets-sdk'
import { parseUnits } from 'viem'

import { getDreamDexExchange } from './client'
import { SHANNON_CHAIN_ID } from './network'
import {
  PLAYER_QUOTE_TTL_MS,
  classifyPlayerOrder,
  isPreparedTradeFresh,
  minimumMarketHeadroomSeconds,
} from './trade-safety'
import type { Address } from 'viem'
import type {
  PlayerOrderOutcome,
  PlayerSide,
  PlayerWalletSession,
  PreparedPlayerTrade,
  PumpyEventMarket,
} from './types'

export class PlayerTradeError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'BOOK_NOT_LIVE'
      | 'MARKET_NOT_TRADING'
      | 'MARKET_CHANGED'
      | 'MARKET_CLOSING'
      | 'NO_LIQUIDITY'
      | 'INSUFFICIENT_BALANCE'
      | 'STALE_QUOTE'
      | 'WRONG_NETWORK'
      | 'WALLET_CHANGED',
  ) {
    super(message)
    this.name = 'PlayerTradeError'
  }
}

function assertLiveBook(pool: Address): void {
  const client = getDreamDexExchange().client
  if (
    client.getWatchStatus(pool) !== 'live' ||
    !client.getLiveStatus().wsConnected
  ) {
    throw new PlayerTradeError(
      'The DreamDEX order book is not live yet',
      'BOOK_NOT_LIVE',
    )
  }
}

async function assertMarketWritable(market: PumpyEventMarket, now: number) {
  const onchain = await getDreamDexExchange().client.getMarketOnchain(
    market.marketId,
  )
  if (onchain.pool.toLowerCase() !== market.poolAddress.toLowerCase()) {
    throw new PlayerTradeError(
      'This pool has rolled over to a different market',
      'MARKET_CHANGED',
    )
  }
  if (onchain.status !== 1) {
    throw new PlayerTradeError(
      'This Event Contract is no longer trading',
      'MARKET_NOT_TRADING',
    )
  }

  const headroom = minimumMarketHeadroomSeconds(market.intervalSeconds)
  if (Number(onchain.expiry) - now <= headroom) {
    throw new PlayerTradeError(
      'This round is too close to market lock; choose the next one',
      'MARKET_CLOSING',
    )
  }
  return onchain
}

export async function preparePlayerTrade(params: {
  market: PumpyEventMarket
  side: PlayerSide
  stake: string
  account?: Address
}): Promise<PreparedPlayerTrade> {
  return preparePlayerTradeRaw({
    market: params.market,
    side: params.side,
    stakeRaw: parseUnits(params.stake, params.market.collateralDecimals),
    account: params.account,
  })
}

function sameExecutionTerms(
  previous: PreparedPlayerTrade,
  next: PreparedPlayerTrade,
): boolean {
  return (
    previous.marketId === next.marketId &&
    previous.orderSide === next.orderSide &&
    previous.stakeRaw === next.stakeRaw &&
    previous.escrowRaw === next.escrowRaw &&
    previous.quantityRaw === next.quantityRaw &&
    previous.yesLimitPriceRaw === next.yesLimitPriceRaw
  )
}

export async function placePreparedPlayerTrade(params: {
  trade: PreparedPlayerTrade
  market: PumpyEventMarket
  wallet: PlayerWalletSession
  botCommitmentVerified: boolean
}): Promise<PlayerOrderOutcome> {
  if (!params.botCommitmentVerified) {
    throw new Error(
      'A verified on-chain bot commitment is required before the player trade',
    )
  }
  const activeChainId = await params.wallet.walletClient.getChainId()
  if (
    params.wallet.chainId !== SHANNON_CHAIN_ID ||
    activeChainId !== SHANNON_CHAIN_ID
  ) {
    throw new PlayerTradeError(
      'Switch your wallet to Somnia Shannon Testnet',
      'WRONG_NETWORK',
    )
  }
  if (!isPreparedTradeFresh(params.trade)) {
    throw new PlayerTradeError(
      'The quote expired; review fresh terms',
      'STALE_QUOTE',
    )
  }

  const accounts = await params.wallet.walletClient.getAddresses()
  if (accounts[0]?.toLowerCase() !== params.wallet.address.toLowerCase()) {
    throw new PlayerTradeError(
      'The active wallet account changed',
      'WALLET_CHANGED',
    )
  }

  const exactRefreshed = await preparePlayerTradeRaw({
    market: params.market,
    side: params.trade.side,
    stakeRaw: params.trade.stakeRaw,
    account: params.wallet.address,
  })
  if (!sameExecutionTerms(params.trade, exactRefreshed)) {
    throw new PlayerTradeError(
      'The live book changed; review the new quote before signing',
      'STALE_QUOTE',
    )
  }
  if (exactRefreshed.hasEnoughBalance === false) {
    throw new PlayerTradeError(
      `Not enough ${params.trade.collateralSymbol} for this trade`,
      'INSUFFICIENT_BALANCE',
    )
  }

  const nowSeconds = Math.floor(Date.now() / 1_000)
  const orderExpirySeconds = Math.min(
    exactRefreshed.marketExpiresAt - 1,
    nowSeconds + 60,
  )
  if (orderExpirySeconds <= nowSeconds) {
    throw new PlayerTradeError(
      'This Event Contract is about to lock',
      'MARKET_CLOSING',
    )
  }

  const trader = getDreamDexExchange().client.createTrader({
    walletClient: params.wallet.walletClient,
    decimals: exactRefreshed.collateralDecimals,
  })
  const result = await trader.placeOrder({
    pool: exactRefreshed.poolAddress,
    side: exactRefreshed.orderSide,
    price: exactRefreshed.yesLimitPriceRaw,
    quantity: exactRefreshed.quantityRaw,
    collateral: exactRefreshed.collateralAddress,
    expireTimestampNs: BigInt(orderExpirySeconds) * 1_000_000_000n,
    orderType: ORDER_TYPE.MARKET,
    autoApprove: true,
  })

  const filledQuantityRaw = result.fills.reduce(
    (total, fill) => total + fill.quantityFilled,
    0n,
  )
  const status = classifyPlayerOrder({
    orderId: result.orderId ?? null,
    requestedQuantityRaw: exactRefreshed.quantityRaw,
    filledQuantityRaw,
  })

  return {
    status,
    hash: result.hash,
    orderId: result.orderId ?? null,
    requestedQuantityRaw: exactRefreshed.quantityRaw,
    filledQuantityRaw,
  }
}

async function preparePlayerTradeRaw(params: {
  market: PumpyEventMarket
  side: PlayerSide
  stakeRaw: bigint
  account?: Address
}): Promise<PreparedPlayerTrade> {
  assertLiveBook(params.market.poolAddress)
  const nowSeconds = Math.floor(Date.now() / 1_000)
  const onchain = await assertMarketWritable(params.market, nowSeconds)
  const orderSide = params.side === 'UP' ? 'BUY_YES' : 'BUY_NO'
  const quote = await getDreamDexExchange().client.quoteBinaryStake({
    marketId: params.market.marketId,
    side: orderSide,
    stake: params.stakeRaw,
  })
  if (!quote) {
    throw new PlayerTradeError(
      'No executable liquidity is available for this stake',
      'NO_LIQUIDITY',
    )
  }
  const walletBalanceRaw = params.account
    ? await getDreamDexExchange().client.getErc20Balance(
        onchain.collateral,
        params.account,
      )
    : null
  const observedAt = Date.now()
  return {
    marketId: params.market.marketId,
    poolAddress: onchain.pool,
    collateralAddress: onchain.collateral,
    collateralSymbol: params.market.collateralSymbol,
    collateralDecimals: onchain.decimals,
    side: params.side,
    orderSide,
    stakeRaw: params.stakeRaw,
    escrowRaw: quote.escrow,
    quantityRaw: quote.quantity,
    yesLimitPriceRaw: quote.yesPrice,
    outcomeLimitPriceRaw: quote.limitPrice,
    walletBalanceRaw,
    hasEnoughBalance:
      walletBalanceRaw === null ? null : walletBalanceRaw >= quote.escrow,
    observedAt,
    validUntil: observedAt + PLAYER_QUOTE_TTL_MS,
    marketExpiresAt: Number(onchain.expiry),
  }
}
