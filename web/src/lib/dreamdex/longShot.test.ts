import { describe, expect, it } from 'vitest'

import {
  longShotDistancePercent,
  longShotReturnMultiplier,
  longShotSideForTarget,
} from './longShot'
import type { PreparedPlayerTrade } from './types'

describe('Long Shot target mechanics', () => {
  it('calls UP for a strike above spot and DOWN for one below spot', () => {
    expect(longShotSideForTarget(80_000, 80_500)).toBe('UP')
    expect(longShotSideForTarget(80_000, 79_500)).toBe('DOWN')
  })

  it('reports the truthful target distance from the live oracle price', () => {
    expect(longShotDistancePercent(80_000, 80_400)).toBeCloseTo(0.5)
    expect(longShotDistancePercent(0, 80_400)).toBeNull()
  })

  it('derives the gross return multiple from executable cost and payout', () => {
    const quote = {
      escrowRaw: 2_000_000n,
      quantityRaw: 9_640_000n,
    } as PreparedPlayerTrade

    expect(longShotReturnMultiplier(quote)).toBe(4.82)
  })

  it('does not invent a multiplier without an executable debit and payout', () => {
    expect(longShotReturnMultiplier(null)).toBeNull()
    expect(
      longShotReturnMultiplier({
        escrowRaw: 0n,
        quantityRaw: 10_000_000n,
      } as PreparedPlayerTrade),
    ).toBeNull()
  })
})
