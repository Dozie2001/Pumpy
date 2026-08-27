import { describe, expect, it } from 'vitest'

import { eventSecondsRemaining, formatEventCountdown } from './eventCountdown'

describe('DreamDEX Event Contract countdown', () => {
  it('converts the contract expiry in seconds against a browser clock in milliseconds', () => {
    expect(eventSecondsRemaining(1_120, 1_000_000)).toBe(120)
  })

  it('never displays negative time after the contract locks', () => {
    expect(eventSecondsRemaining(900, 1_000_000)).toBe(0)
  })

  it('formats short and long contract intervals', () => {
    expect(formatEventCountdown(9)).toBe('00:09')
    expect(formatEventCountdown(125)).toBe('02:05')
    expect(formatEventCountdown(3_725)).toBe('1:02:05')
  })
})
