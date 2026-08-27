import { describe, expect, it } from 'vitest'

import {
  RANGE_TIERS,
  createRangeArcadeBand,
  settleRangeArcadeBand,
} from './rangeArcade'

describe('Range arcade mechanics', () => {
  it('builds a symmetric band from basis-point width', () => {
    const band = createRangeArcadeBand({
      id: 'one',
      price: 80_000,
      tier: RANGE_TIERS[1],
      now: 1_000,
    })

    expect(band.lower).toBe(79_952)
    expect(band.upper).toBe(80_048)
    expect(band.points).toBe(250)
  })

  it('scores only a fresh price inside the band at expiry', () => {
    const band = createRangeArcadeBand({
      id: 'one',
      price: 2_500,
      tier: RANGE_TIERS[0],
      now: 1_000,
      durationMs: 1_000,
    })

    expect(
      settleRangeArcadeBand({ band, price: 2_501, fresh: true, now: 2_000 })
        .status,
    ).toBe('won')
    expect(
      settleRangeArcadeBand({ band, price: 2_510, fresh: true, now: 2_000 })
        .status,
    ).toBe('lost')
    expect(
      settleRangeArcadeBand({ band, price: 2_500, fresh: false, now: 2_000 })
        .status,
    ).toBe('void')
  })

  it('does not resolve before the local arcade timer expires', () => {
    const band = createRangeArcadeBand({
      id: 'one',
      price: 100,
      tier: RANGE_TIERS[2],
      now: 1_000,
    })

    expect(
      settleRangeArcadeBand({ band, price: 100, fresh: true, now: 1_500 }),
    ).toBe(band)
  })
})

