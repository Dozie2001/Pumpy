import { parseUnits } from 'viem'

import { getDreamDexExchange } from './client'
import { lcm, rangeMaximumLoss } from './range'
import {
  PLAYER_QUOTE_TTL_MS,
  minimumMarketHeadroomSeconds,
} from './trade-safety'
import type { Address } from 'viem'
import type {
  PreparedPlayerRangeTrade,
  PumpyEventMarket,
  PumpyRangePair,
} from './types'

export class PlayerRangeTradeError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'BOOK_NOT_LIVE'
      | 'INVALID_PAIR'
      | 'MARKET_NOT_TRADING'
      | 'MARKET_CHANGED'
      | 'MARKET_CLOSING'
      | 'NO_LIQUIDITY',
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'PlayerRangeTradeError'
  }
}

function ceilDiv(numerator: bigint, denominator: bigint): bigint {
  return (numerator + denominator - 1n) / denominator
}

function minBigInt(...values: Array<bigint>): bigint {
  return values.reduce((smallest, value) =>
    value < smallest ? value : smallest,
  )
}

function assertCompatiblePair(pair: PumpyRangePair): void {
  const { lower, upper } = pair
  if (
    lower.reference !== 'fixed-strike' ||
    upper.reference !== 'fixed-strike' ||
    BigInt(lower.strikeRaw) >= BigInt(upper.strikeRaw) ||
    lower.asset !== upper.asset ||
    lower.expiresAt !== upper.expiresAt ||
    lower.poolAddress.toLowerCase() === upper.poolAddress.toLowerCase() ||
    lower.collateralAddress.toLowerCase() !==
      upper.collateralAddress.toLowerCase() ||
    lower.collateralDecimals !== upper.collateralDecimals ||
    lower.venueId == null ||
    upper.venueId == null ||
    lower.venueId.toLowerCase() !== upper.venueId.toLowerCase() ||
    lower.operatorId == null ||
    upper.operatorId == null ||
    lower.operatorId !== upper.operatorId
  ) {
    throw new PlayerRangeTradeError(
      'These Event Contracts cannot form one settlement-safe range',
      'INVALID_PAIR',
    )
  }
}

function assertLiveBook(market: PumpyEventMarket): void {
  const client = getDreamDexExchange().client
  if (
    client.getWatchStatus(market.poolAddress) !== 'live' ||
    !client.getLiveStatus().wsConnected
  ) {
    throw new PlayerRangeTradeError(
      `The ${market.asset} range book is not live yet`,
      'BOOK_NOT_LIVE',
    )
  }
}

async function assertMarketWritable(
  market: PumpyEventMarket,
  nowSeconds: number,
) {
  const onchain = await getDreamDexExchange().client.getMarketOnchain(
    market.marketId,
  )
  if (onchain.pool.toLowerCase() !== market.poolAddress.toLowerCase()) {
    throw new PlayerRangeTradeError(
      'A Range pool has rolled over to a different market',
      'MARKET_CHANGED',
    )
  }
  if (onchain.status !== 1) {
    throw new PlayerRangeTradeError(
      'One of the Range Event Contracts is no longer trading',
      'MARKET_NOT_TRADING',
    )
  }
  const headroom = minimumMarketHeadroomSeconds(market.intervalSeconds)
  if (Number(onchain.expiry) - nowSeconds <= headroom) {
    throw new PlayerRangeTradeError(
      'This Range is too close to market lock; wait for the next pair',
      'MARKET_CLOSING',
    )
  }
  return onchain
}

/**
 * Quote equal quantities across BUY_YES(lower) and BUY_NO(upper). The maximum
 * cost is the sum of both protective limits, while estimated cost walks the
 * currently materialized books. No write is performed here.
 */
export async function preparePlayerRangeTrade(params: {
  pair: PumpyRangePair
  budget: string
  account?: Address
}): Promise<PreparedPlayerRangeTrade> {
  assertCompatiblePair(params.pair)
  assertLiveBook(params.pair.lower)
  assertLiveBook(params.pair.upper)

  const { lower, upper } = params.pair
  const nowSeconds = Math.floor(Date.now() / 1_000)
  const [lowerOnchain, upperOnchain] = await Promise.all([
    assertMarketWritable(lower, nowSeconds),
    assertMarketWritable(upper, nowSeconds),
  ])
  if (
    lowerOnchain.collateral.toLowerCase() !==
      upperOnchain.collateral.toLowerCase() ||
    lowerOnchain.decimals !== upperOnchain.decimals ||
    lowerOnchain.expiry !== upperOnchain.expiry
  ) {
    throw new PlayerRangeTradeError(
      'The live contracts no longer share compatible settlement terms',
      'INVALID_PAIR',
    )
  }

  const client = getDreamDexExchange().client
  const decimals = lowerOnchain.decimals
  const one = 10n ** BigInt(decimals)
  const budgetRaw = parseUnits(params.budget, decimals)
  const [lowerSeed, upperSeed, lowerGrid, upperGrid] = await Promise.all([
    client.quoteBinaryStake({
      marketId: lower.marketId,
      side: 'BUY_YES',
      stake: budgetRaw,
    }),
    client.quoteBinaryStake({
      marketId: upper.marketId,
      side: 'BUY_NO',
      stake: budgetRaw,
    }),
    client.getBinaryBookParams(lowerOnchain.pool),
    client.getBinaryBookParams(upperOnchain.pool),
  ])
  if (!lowerSeed || !upperSeed) {
    throw new PlayerRangeTradeError(
      'Both sides need executable DreamDEX liquidity for this Range',
      'NO_LIQUIDITY',
    )
  }

  const commonLot = lcm(lowerGrid.lotSize, upperGrid.lotSize)
  if (commonLot <= 0n) {
    throw new PlayerRangeTradeError(
      'The two books do not expose a compatible quantity grid',
      'INVALID_PAIR',
    )
  }
  const combinedLimitPrice = lowerSeed.limitPrice + upperSeed.limitPrice
  const affordableQuantity =
    combinedLimitPrice > 0n ? (budgetRaw * one) / combinedLimitPrice : 0n
  let quantity = minBigInt(
    lowerSeed.quantity,
    upperSeed.quantity,
    affordableQuantity,
  )
  quantity = (quantity / commonLot) * commonLot
  if (
    quantity <= 0n ||
    quantity < lowerGrid.minQuantity ||
    quantity < upperGrid.minQuantity
  ) {
    throw new PlayerRangeTradeError(
      'This amount is below the shared minimum size of the two books',
      'NO_LIQUIDITY',
    )
  }

  const lowerBook = client.quoteBinaryOrder({
    marketId: lower.marketId,
    side: 'BUY_YES',
    quantity,
  })
  const upperBook = client.quoteBinaryOrder({
    marketId: upper.marketId,
    side: 'BUY_NO',
    quantity,
  })
  if (
    lowerBook.filledQuantity !== quantity ||
    upperBook.filledQuantity !== quantity
  ) {
    throw new PlayerRangeTradeError(
      'The live books cannot fill both equal Range legs completely',
      'NO_LIQUIDITY',
    )
  }

  const lowerEscrow = ceilDiv(quantity * lowerSeed.limitPrice, one)
  const upperEscrow = ceilDiv(quantity * upperSeed.limitPrice, one)
  const maximumCostRaw = lowerEscrow + upperEscrow
  const estimatedCostRaw = lowerBook.cost + upperBook.cost
  const walletBalanceRaw = params.account
    ? await client.getErc20Balance(lowerOnchain.collateral, params.account)
    : null
  const observedAt = Date.now()

  return {
    pair: params.pair,
    collateralAddress: lowerOnchain.collateral,
    collateralSymbol: lower.collateralSymbol,
    collateralDecimals: decimals,
    budgetRaw,
    quantityRaw: quantity,
    lowerLeg: {
      marketId: lower.marketId,
      poolAddress: lowerOnchain.pool,
      orderSide: 'BUY_YES',
      yesLimitPriceRaw: lowerSeed.yesPrice,
      outcomeLimitPriceRaw: lowerSeed.limitPrice,
      estimatedCostRaw: lowerBook.cost,
      escrowRaw: lowerEscrow,
    },
    upperLeg: {
      marketId: upper.marketId,
      poolAddress: upperOnchain.pool,
      orderSide: 'BUY_NO',
      yesLimitPriceRaw: upperSeed.yesPrice,
      outcomeLimitPriceRaw: upperSeed.limitPrice,
      estimatedCostRaw: upperBook.cost,
      escrowRaw: upperEscrow,
    },
    estimatedCostRaw,
    maximumCostRaw,
    outsidePayoutRaw: quantity,
    insidePayoutRaw: quantity * 2n,
    maximumLossRaw: rangeMaximumLoss(maximumCostRaw, quantity),
    walletBalanceRaw,
    hasEnoughBalance:
      walletBalanceRaw === null ? null : walletBalanceRaw >= maximumCostRaw,
    observedAt,
    validUntil: observedAt + PLAYER_QUOTE_TTL_MS,
  }
}
