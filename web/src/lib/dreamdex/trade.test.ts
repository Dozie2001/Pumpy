import { describe, expect, it } from 'vitest'

import {
  PLAYER_QUOTE_TTL_MS,
  classifyPlayerOrder,
  hasRequiredBotCommitment,
  isPreparedTradeFresh,
  minimumMarketHeadroomSeconds,
} from './trade-safety'
import type { PreparedPlayerTrade } from './types'

const prepared = {
  validUntil: 20_000,
} as PreparedPlayerTrade

describe('player trade safety', () => {
  it('scales lock headroom with the market interval and caps it', () => {
    expect(minimumMarketHeadroomSeconds(null)).toBe(30)
    expect(minimumMarketHeadroomSeconds(60)).toBe(15)
    expect(minimumMarketHeadroomSeconds(900)).toBe(90)
    expect(minimumMarketHeadroomSeconds(7_200)).toBe(120)
  })

  it('treats a prepared quote as valid only through its deadline', () => {
    expect(isPreparedTradeFresh(prepared, 20_000)).toBe(true)
    expect(isPreparedTradeFresh(prepared, 20_001)).toBe(false)
    expect(PLAYER_QUOTE_TTL_MS).toBe(12_000)
  })

  it('never labels an unfilled or partially filled receipt as filled', () => {
    expect(
      classifyPlayerOrder({
        orderId: null,
        requestedQuantityRaw: 100n,
        filledQuantityRaw: 0n,
      }),
    ).toBe('unfilled')
    expect(
      classifyPlayerOrder({
        orderId: null,
        requestedQuantityRaw: 100n,
        filledQuantityRaw: 40n,
      }),
    ).toBe('partial')
    expect(
      classifyPlayerOrder({
        orderId: null,
        requestedQuantityRaw: 100n,
        filledQuantityRaw: 100n,
      }),
    ).toBe('filled')
    expect(
      classifyPlayerOrder({
        orderId: 7n,
        requestedQuantityRaw: 100n,
        filledQuantityRaw: 0n,
      }),
    ).toBe('open')
  })

  it('proof-gates Bot Battle without blocking bot-free Quick Call', () => {
    expect(hasRequiredBotCommitment('quick-call', undefined)).toBe(true)
    expect(hasRequiredBotCommitment('bot-battle', false)).toBe(false)
    expect(hasRequiredBotCommitment('bot-battle', true)).toBe(true)
  })
})
