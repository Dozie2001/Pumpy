import type { PlayerSide, PreparedPlayerTrade } from './types'

/** Long Shot always calls the out-of-the-money side of the selected strike. */
export function longShotSideForTarget(
  livePrice: number,
  targetPrice: number,
): PlayerSide {
  return livePrice <= targetPrice ? 'UP' : 'DOWN'
}

export function longShotDistancePercent(
  livePrice: number,
  targetPrice: number,
): number | null {
  if (
    !Number.isFinite(livePrice) ||
    !Number.isFinite(targetPrice) ||
    livePrice <= 0 ||
    targetPrice <= 0
  )
    return null
  return (Math.abs(targetPrice - livePrice) / livePrice) * 100
}

/** Gross winning return divided by the executable collateral debit. */
export function longShotReturnMultiplier(
  quote: PreparedPlayerTrade | null,
): number | null {
  if (!quote || quote.escrowRaw <= 0n || quote.quantityRaw <= 0n) return null
  return Number((quote.quantityRaw * 10_000n) / quote.escrowRaw) / 10_000
}
