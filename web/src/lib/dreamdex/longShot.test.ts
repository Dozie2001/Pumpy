import { describe, expect, it } from 'vitest'

import { longShotDistancePercent, longShotSideForTarget } from './longShot'

describe('Long Shot target mechanics', () => {
  it('calls UP for a strike above spot and DOWN for one below spot', () => {
    expect(longShotSideForTarget(80_000, 80_500)).toBe('UP')
    expect(longShotSideForTarget(80_000, 79_500)).toBe('DOWN')
  })

  it('reports the truthful target distance from the live oracle price', () => {
    expect(longShotDistancePercent(80_000, 80_400)).toBeCloseTo(0.5)
    expect(longShotDistancePercent(0, 80_400)).toBeNull()
  })
})

