import {
  ContractRevertError,
  ORDER_TYPE,
  erc6909Abi,
} from '@somnia-chain/markets-sdk'
import { erc20Abi, maxUint256, parseUnits } from 'viem'

import { getDreamDexExchange } from './client'
import { SHANNON_CHAIN_ID } from './network'
import {
  PLAYER_QUOTE_TTL_MS,
  classifyPlayerOrder,
  filledOrderCostRaw,
  filledSellProceedsRaw,
  hasRequiredBotCommitment,
  isFullCashoutQuote,
  isPreparedTradeFresh,
  minimumMarketHeadroomSeconds,
} from './trade-safety'
import type { Address } from 'viem'
import type {
  PlayerCashoutOutcome,
  PlayerOrderOutcome,
  PlayerSide,
  PlayerWalletSession,
  PreparedPlayerCashout,
  PreparedPlayerTrade,
  PumpyEventMarket,
  PumpyGameMode,
  QuickCallRound,
} from './types'

const CASHOUT_QUOTE_TTL_MS = 8_000

export class PlayerCashoutError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'BOOK_NOT_LIVE'
      | 'MARKET_NOT_TRADING'
      | 'MARKET_CHANGED'
      | 'MARKET_CLOSING'
      | 'NO_LIQUIDITY'
      | 'PARTIAL_LIQUIDITY'
      | 'NO_POSITION'
      | 'STALE_QUOTE'
      | 'WRONG_NETWORK'
      | 'WALLET_CHANGED'
      | 'ORDER_REJECTED',
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'PlayerCashoutError'
  }
}

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
      | 'WALLET_CHANGED'
      | 'ORDER_REJECTED',
    options?: ErrorOptions,
  ) {
    super(message, options)
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

export async function preparePlayerCashout(params: {
  round: QuickCallRound
  positionRaw: bigint
}): Promise<PreparedPlayerCashout> {
  if (params.positionRaw <= 0n) {
    throw new PlayerCashoutError(
      'No open position is available to sell',
      'NO_POSITION',
    )
  }
  try {
    assertLiveBook(params.round.poolAddress)
  } catch (cause) {
    throw new PlayerCashoutError(
      'The DreamDEX exit book is not live yet',
      'BOOK_NOT_LIVE',
      { cause },
    )
  }

  const orderSide = params.round.side === 'UP' ? 'SELL_YES' : 'SELL_NO'
  const quote = await getDreamDexExchange().client.quoteBinarySell({
    marketId: params.round.marketId,
    side: orderSide,
    quantity: params.positionRaw,
  })
  if (!quote || quote.fillableQuantity <= 0n) {
    throw new PlayerCashoutError(
      'No executable cash-out liquidity is available right now',
      'NO_LIQUIDITY',
    )
  }

  const observedAt = Date.now()
  return {
    marketId: params.round.marketId,
    poolAddress: params.round.poolAddress,
    side: params.round.side,
    orderSide,
    positionRaw: params.positionRaw,
    quantityRaw: quote.quantity,
    fillableQuantityRaw: quote.fillableQuantity,
    yesLimitPriceRaw: quote.yesPrice,
    outcomeLimitPriceRaw: quote.limitPrice,
    estimatedProceedsRaw: quote.estProceeds,
    collateralDecimals: params.round.collateralDecimals,
    observedAt,
    validUntil: observedAt + CASHOUT_QUOTE_TTL_MS,
    marketExpiresAt: params.round.expiresAt,
  }
}

function sameCashoutTerms(
  previous: PreparedPlayerCashout,
  next: PreparedPlayerCashout,
): boolean {
  return (
    previous.marketId === next.marketId &&
    previous.orderSide === next.orderSide &&
    previous.quantityRaw === next.quantityRaw &&
    previous.fillableQuantityRaw === next.fillableQuantityRaw &&
    previous.yesLimitPriceRaw === next.yesLimitPriceRaw &&
    previous.estimatedProceedsRaw === next.estimatedProceedsRaw
  )
}

export async function placePreparedPlayerCashout(params: {
  cashout: PreparedPlayerCashout
  round: QuickCallRound
  wallet: PlayerWalletSession
  onWalletStep?: (step: 'approving' | 'refreshing' | 'placing') => void
}): Promise<PlayerCashoutOutcome> {
  const client = getDreamDexExchange().client
  const activeChainId = await params.wallet.walletClient.getChainId()
  if (
    params.wallet.chainId !== SHANNON_CHAIN_ID ||
    activeChainId !== SHANNON_CHAIN_ID
  ) {
    throw new PlayerCashoutError(
      'Switch your wallet to Somnia Shannon Testnet',
      'WRONG_NETWORK',
    )
  }
  if (Date.now() > params.cashout.validUntil) {
    throw new PlayerCashoutError(
      'The cash-out quote expired; review the new amount',
      'STALE_QUOTE',
    )
  }

  const accounts = await params.wallet.walletClient.getAddresses()
  if (accounts[0]?.toLowerCase() !== params.wallet.address.toLowerCase()) {
    throw new PlayerCashoutError(
      'The active wallet account changed',
      'WALLET_CHANGED',
    )
  }

  const onchain = await client.getMarketOnchain(params.round.marketId)
  if (onchain.pool.toLowerCase() !== params.round.poolAddress.toLowerCase()) {
    throw new PlayerCashoutError(
      'This pool has rolled over to a different market',
      'MARKET_CHANGED',
    )
  }
  if (onchain.status !== 1) {
    throw new PlayerCashoutError(
      'This Event Contract is no longer trading',
      'MARKET_NOT_TRADING',
    )
  }
  const nowSeconds = Math.floor(Date.now() / 1_000)
  const cashoutHeadroom = Math.max(
    8,
    Math.min(
      30,
      minimumMarketHeadroomSeconds(params.round.intervalSeconds ?? null),
    ),
  )
  if (Number(onchain.expiry) - nowSeconds <= cashoutHeadroom) {
    throw new PlayerCashoutError(
      'This market is too close to lock for a safe cash out',
      'MARKET_CLOSING',
    )
  }

  const outcomeId =
    params.round.outcomeIndex === 0 ? onchain.yesId : onchain.noId
  const positionRaw = await client.getOutcomeBalance({
    outcomeToken: onchain.outcomeToken,
    account: params.wallet.address,
    id: outcomeId,
  })
  if (positionRaw < params.cashout.quantityRaw) {
    throw new PlayerCashoutError(
      'Your live outcome balance changed; refresh the cash-out quote',
      'STALE_QUOTE',
    )
  }

  let refreshed = await preparePlayerCashout({
    round: params.round,
    positionRaw: params.cashout.quantityRaw,
  })
  if (!sameCashoutTerms(params.cashout, refreshed)) {
    throw new PlayerCashoutError(
      'The exit price changed; review the new cash-out amount',
      'STALE_QUOTE',
    )
  }
  if (
    !isFullCashoutQuote({
      positionRaw: params.cashout.positionRaw,
      quotedQuantityRaw: refreshed.quantityRaw,
      fillableQuantityRaw: refreshed.fillableQuantityRaw,
    })
  ) {
    throw new PlayerCashoutError(
      'The live book cannot absorb the full position yet',
      'PARTIAL_LIQUIDITY',
    )
  }

  const publicClient = client.getViemClient()
  const isOperator = await publicClient.readContract({
    address: onchain.outcomeToken,
    abi: erc6909Abi,
    functionName: 'isOperator',
    args: [params.wallet.address, params.round.poolAddress],
  })
  if (!isOperator) {
    params.onWalletStep?.('approving')
    const approvalHash = await params.wallet.walletClient.writeContract({
      account: params.wallet.address,
      chain: params.wallet.walletClient.chain,
      address: onchain.outcomeToken,
      abi: erc6909Abi,
      functionName: 'setOperator',
      args: [params.round.poolAddress, true],
    })
    const approvalReceipt = await publicClient.waitForTransactionReceipt({
      hash: approvalHash,
    })
    if (approvalReceipt.status !== 'success') {
      throw new PlayerCashoutError(
        'The one-time position authorization reverted',
        'ORDER_REJECTED',
      )
    }
    params.onWalletStep?.('refreshing')
    refreshed = await preparePlayerCashout({
      round: params.round,
      positionRaw: params.cashout.quantityRaw,
    })
    if (!sameCashoutTerms(params.cashout, refreshed)) {
      throw new PlayerCashoutError(
        'Position access was approved, but the exit price changed; review the updated cash-out amount',
        'STALE_QUOTE',
      )
    }
  }

  const orderExpirySeconds = Math.min(
    Number(onchain.expiry) - 1,
    Math.floor(Date.now() / 1_000) + 60,
  )
  const trader = client.createTrader({
    walletClient: params.wallet.walletClient,
    decimals: params.round.collateralDecimals,
  })
  params.onWalletStep?.('placing')
  let result: Awaited<ReturnType<typeof trader.placeOrder>>
  try {
    result = await trader.placeOrder({
      pool: params.round.poolAddress,
      side: refreshed.orderSide,
      price: refreshed.yesLimitPriceRaw,
      quantity: refreshed.quantityRaw,
      outcomeToken: onchain.outcomeToken,
      yesId: onchain.yesId,
      noId: onchain.noId,
      expireTimestampNs: BigInt(orderExpirySeconds) * 1_000_000_000n,
      orderType: ORDER_TYPE.MARKET,
      autoApprove: false,
    })
  } catch (cause) {
    if (isWalletRejection(cause)) throw cause
    throw new PlayerCashoutError(
      'DreamDEX could not execute the cash out. Your remaining position is unchanged.',
      'ORDER_REJECTED',
      { cause },
    )
  }

  const filledQuantityRaw = result.fills.reduce(
    (total, fill) => total + fill.quantityFilled,
    0n,
  )
  const proceedsRaw = filledSellProceedsRaw({
    side: refreshed.side,
    collateralDecimals: refreshed.collateralDecimals,
    fills: result.fills,
  })
  const status =
    filledQuantityRaw <= 0n
      ? 'unfilled'
      : filledQuantityRaw < refreshed.quantityRaw
        ? 'partial'
        : 'filled'

  return {
    status,
    hash: result.hash,
    requestedQuantityRaw: refreshed.quantityRaw,
    filledQuantityRaw,
    proceedsRaw,
  }
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
  mode: PumpyGameMode
  botCommitmentVerified?: boolean
  onWalletStep?: (step: 'approving' | 'refreshing' | 'placing') => void
}): Promise<PlayerOrderOutcome> {
  if (!hasRequiredBotCommitment(params.mode, params.botCommitmentVerified)) {
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

  let exactRefreshed = await preparePlayerTradeRaw({
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

  const client = getDreamDexExchange().client
  const allowance = await client.getErc20Allowance(
    exactRefreshed.collateralAddress,
    params.wallet.address,
    exactRefreshed.poolAddress,
  )
  if (allowance < exactRefreshed.escrowRaw) {
    params.onWalletStep?.('approving')
    const approvalHash = await params.wallet.walletClient.writeContract({
      account: params.wallet.address,
      chain: params.wallet.walletClient.chain,
      address: exactRefreshed.collateralAddress,
      abi: erc20Abi,
      functionName: 'approve',
      args: [exactRefreshed.poolAddress, maxUint256],
    })
    const approvalReceipt = await client
      .getViemClient()
      .waitForTransactionReceipt({ hash: approvalHash })
    if (approvalReceipt.status !== 'success') {
      throw new PlayerTradeError(
        `The ${exactRefreshed.collateralSymbol} approval reverted`,
        'ORDER_REJECTED',
      )
    }

    params.onWalletStep?.('refreshing')
    exactRefreshed = await preparePlayerTradeRaw({
      market: params.market,
      side: params.trade.side,
      stakeRaw: params.trade.stakeRaw,
      account: params.wallet.address,
    })
    if (!sameExecutionTerms(params.trade, exactRefreshed)) {
      throw new PlayerTradeError(
        'Collateral was approved, but the live odds changed; review the updated quote before signing the order',
        'STALE_QUOTE',
      )
    }
    if (exactRefreshed.hasEnoughBalance === false) {
      throw new PlayerTradeError(
        `Not enough ${params.trade.collateralSymbol} for this trade`,
        'INSUFFICIENT_BALANCE',
      )
    }
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

  const trader = client.createTrader({
    walletClient: params.wallet.walletClient,
    decimals: exactRefreshed.collateralDecimals,
  })
  params.onWalletStep?.('placing')
  let result: Awaited<ReturnType<typeof trader.placeOrder>>
  try {
    result = await trader.placeOrder({
      pool: exactRefreshed.poolAddress,
      side: exactRefreshed.orderSide,
      price: exactRefreshed.yesLimitPriceRaw,
      quantity: exactRefreshed.quantityRaw,
      collateral: exactRefreshed.collateralAddress,
      expireTimestampNs: BigInt(orderExpirySeconds) * 1_000_000_000n,
      orderType: ORDER_TYPE.MARKET,
      autoApprove: false,
    })
  } catch (cause) {
    if (isWalletRejection(cause)) throw cause
    throw await classifyPlacementFailure({
      cause,
      market: params.market,
      trade: exactRefreshed,
      account: params.wallet.address,
    })
  }

  const filledQuantityRaw = result.fills.reduce(
    (total, fill) => total + fill.quantityFilled,
    0n,
  )
  const status = classifyPlayerOrder({
    orderId: result.orderId ?? null,
    requestedQuantityRaw: exactRefreshed.quantityRaw,
    filledQuantityRaw,
    remainderCanRest: false,
  })
  const filledCostRaw = filledOrderCostRaw({
    side: exactRefreshed.side,
    collateralDecimals: exactRefreshed.collateralDecimals,
    fills: result.fills,
  })

  return {
    status,
    hash: result.hash,
    orderId: result.orderId ?? null,
    requestedQuantityRaw: exactRefreshed.quantityRaw,
    filledQuantityRaw,
    filledCostRaw,
  }
}

async function classifyPlacementFailure(params: {
  cause: unknown
  market: PumpyEventMarket
  trade: PreparedPlayerTrade
  account: Address
}): Promise<PlayerTradeError> {
  const errorName = findContractErrorName(params.cause)
  if (
    errorName === 'ERC20InsufficientAllowance' ||
    errorName === 'ERC20InsufficientBalance' ||
    errorName === 'InsufficientBalance'
  ) {
    return new PlayerTradeError(
      `Not enough approved ${params.trade.collateralSymbol} for this trade`,
      'INSUFFICIENT_BALANCE',
      { cause: params.cause },
    )
  }

  try {
    const latest = await preparePlayerTradeRaw({
      market: params.market,
      side: params.trade.side,
      stakeRaw: params.trade.stakeRaw,
      account: params.account,
    })
    if (!sameExecutionTerms(params.trade, latest)) {
      return new PlayerTradeError(
        'The live book changed before the order landed; review the updated quote',
        'STALE_QUOTE',
        { cause: params.cause },
      )
    }
  } catch (diagnostic) {
    if (diagnostic instanceof PlayerTradeError) {
      return new PlayerTradeError(diagnostic.message, diagnostic.code, {
        cause: params.cause,
      })
    }
  }

  console.error('[Pumpy] DreamDEX placement rejected', {
    sdkError: errorName ?? null,
    message:
      params.cause instanceof Error
        ? params.cause.message
        : String(params.cause),
    marketId: params.market.marketId,
    pool: params.trade.poolAddress,
    side: params.trade.side,
    quoteObservedAt: params.trade.observedAt,
    marketExpiresAt: params.trade.marketExpiresAt,
  })
  return new PlayerTradeError(
    'DreamDEX rejected the order without exposing a contract reason. No position was opened; refresh and try the next live quote.',
    'ORDER_REJECTED',
    { cause: params.cause },
  )
}

function findContractErrorName(cause: unknown): string | undefined {
  if (!cause || typeof cause !== 'object') return undefined
  if (cause instanceof ContractRevertError) return cause.errorName
  if ('errorName' in cause && typeof cause.errorName === 'string') {
    return cause.errorName
  }
  return 'cause' in cause ? findContractErrorName(cause.cause) : undefined
}

function isWalletRejection(cause: unknown): boolean {
  if (!cause || typeof cause !== 'object') return false
  if ('code' in cause && cause.code === 4_001) return true
  return 'cause' in cause ? isWalletRejection(cause.cause) : false
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
