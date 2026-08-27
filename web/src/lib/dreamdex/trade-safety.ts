import type { PreparedPlayerTrade, PumpyGameMode } from './types'

export const PLAYER_QUOTE_TTL_MS = 12_000

export function minimumMarketHeadroomSeconds(
  intervalSeconds: number | null,
): number {
  if (!intervalSeconds) return 30
  return Math.max(15, Math.min(120, Math.floor(intervalSeconds / 10)))
}

export function isPreparedTradeFresh(
  trade: PreparedPlayerTrade,
  nowMs = Date.now(),
): boolean {
  return nowMs <= trade.validUntil
}

export function hasRequiredBotCommitment(
  mode: PumpyGameMode,
  botCommitmentVerified: boolean | undefined,
): boolean {
  return mode === 'quick-call' || botCommitmentVerified === true
}

export function filledOrderCostRaw(params: {
  side: 'UP' | 'DOWN'
  collateralDecimals: number
  fills: ReadonlyArray<{ quantityFilled: bigint; fillPrice: bigint }>
}): bigint {
  const base = 10n ** BigInt(params.collateralDecimals)
  return params.fills.reduce((total, fill) => {
    const outcomePrice =
      params.side === 'UP' ? fill.fillPrice : base - fill.fillPrice
    const numerator = fill.quantityFilled * outcomePrice
    return total + (numerator + base - 1n) / base
  }, 0n)
}

export function filledSellProceedsRaw(params: {
  side: 'UP' | 'DOWN'
  collateralDecimals: number
  fills: ReadonlyArray<{ quantityFilled: bigint; fillPrice: bigint }>
}): bigint {
  const base = 10n ** BigInt(params.collateralDecimals)
  return params.fills.reduce((total, fill) => {
    const outcomePrice =
      params.side === 'UP' ? fill.fillPrice : base - fill.fillPrice
    return total + (fill.quantityFilled * outcomePrice) / base
  }, 0n)
}

export function isFullCashoutQuote(params: {
  positionRaw: bigint
  quotedQuantityRaw: bigint
  fillableQuantityRaw: bigint
}): boolean {
  return (
    params.positionRaw > 0n &&
    params.quotedQuantityRaw === params.positionRaw &&
    params.fillableQuantityRaw >= params.quotedQuantityRaw
  )
}

export function classifyPlayerOrder(params: {
  orderId: bigint | null
  requestedQuantityRaw: bigint
  filledQuantityRaw: bigint
  remainderCanRest?: boolean
}): 'filled' | 'partial' | 'unfilled' | 'open' {
  if (
    params.remainderCanRest &&
    params.orderId !== null &&
    params.filledQuantityRaw < params.requestedQuantityRaw
  )
    return 'open'
  if (params.filledQuantityRaw === 0n) return 'unfilled'
  if (params.filledQuantityRaw < params.requestedQuantityRaw) return 'partial'
  return 'filled'
}
