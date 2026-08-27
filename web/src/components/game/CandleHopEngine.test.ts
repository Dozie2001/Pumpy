import { describe, expect, it } from 'vitest'

import { candleHopOutcome } from './CandleHopEngine'

describe('candleHopOutcome', () => {
  it('uses one loss outcome when the run does not beat the personal best', () => {
    expect(candleHopOutcome(4, 7)).toEqual({
      score: 4,
      best: 7,
      isBest: false,
      badge: null,
      pattern: 'lose',
    })
  })

  it('uses the achievement outcome for a genuine new best', () => {
    expect(candleHopOutcome(3, 2)).toMatchObject({
      best: 3,
      isBest: true,
      pattern: 'achievement',
    })
  })

  it('reports only the highest newly crossed badge threshold', () => {
    expect(candleHopOutcome(6, 4).badge).toBe('Candle Spark')
    expect(candleHopOutcome(22, 7).badge).toBe('Pump Pilot')
    expect(candleHopOutcome(24, 22).badge).toBeNull()
  })
})
