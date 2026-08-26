import type { PreparedPlayerTrade } from './types'

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

export function classifyPlayerOrder(params: {
  orderId: bigint | null
  requestedQuantityRaw: bigint
  filledQuantityRaw: bigint
}): 'filled' | 'partial' | 'unfilled' | 'open' {
  if (params.orderId !== null) return 'open'
  if (params.filledQuantityRaw === 0n) return 'unfilled'
  if (params.filledQuantityRaw < params.requestedQuantityRaw) return 'partial'
  return 'filled'
}
