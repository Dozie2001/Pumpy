import { describe, expect, it } from 'vitest'

import {
  isCallCurrentlyWinning,
  resolveOracleTargetPrice,
} from './oracleTarget'

describe('DreamDEX oracle target formatting', () => {
  it('infers the power-of-ten scale from the official live feed', () => {
    expect(resolveOracleTargetPrice('8031395', 80_250)).toEqual({
      price: 80_313.95,
      decimals: 2,
    })
    expect(resolveOracleTargetPrice('252233', 2_518)).toEqual({
      price: 2_522.33,
      decimals: 2,
    })
  })

  it('refuses malformed or implausibly scaled values', () => {
    expect(resolveOracleTargetPrice(null, 80_000)).toBeNull()
    expect(resolveOracleTargetPrice('abc', 80_000)).toBeNull()
    expect(resolveOracleTargetPrice('1', 80_000)).toBeNull()
  })

  it('uses the market at-or-above rule for UP and below rule for DOWN', () => {
    expect(
      isCallCurrentlyWinning({ side: 'UP', livePrice: 100, targetPrice: 100 }),
    ).toBe(true)
    expect(
      isCallCurrentlyWinning({ side: 'DOWN', livePrice: 100, targetPrice: 100 }),
    ).toBe(false)
    expect(
      isCallCurrentlyWinning({ side: 'DOWN', livePrice: 99, targetPrice: 100 }),
    ).toBe(true)
  })
})
