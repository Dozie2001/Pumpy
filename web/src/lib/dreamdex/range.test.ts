import { describe, expect, it } from 'vitest'

import {
  lcm,
  rangeMaximumLoss,
  rangePayoffAtSettlement,
  selectFixedStrikeRangePairs,
} from './range'
import type { PumpyEventMarket } from './types'

const NOW = 1_787_864_000

function market(
  strikeRaw: string,
  suffix: string,
  overrides: Partial<PumpyEventMarket> = {},
): PumpyEventMarket {
  return {
    marketId: `0x${suffix.padStart(64, '0')}`,
    poolAddress: `0x${suffix.padStart(40, '0')}`,
    marketAddress: `0x${`1${suffix}`.padStart(40, '0')}`,
    asset: 'BTC',
    question: 'structured data is authoritative',
    oracleQuestion: null,
    reference: 'fixed-strike',
    strikeRaw,
    targetPriceRaw: strikeRaw,
    status: 'trading',
    tradingStartsAt: NOW - 60,
    expiresAt: NOW + 600,
    intervalLabel: '5m',
    intervalSeconds: 300,
    operatorId: 7,
    venueId: `0x${'ab'.repeat(32)}`,
    collateralAddress: `0x${'cd'.repeat(20)}`,
    collateralSymbol: 'tUSDC',
    collateralDecimals: 6,
    yesTokenId: `1${suffix}`,
    noTokenId: `2${suffix}`,
    ...overrides,
  }
}

describe('DreamDEX Range composition', () => {
  it('pairs adjacent fixed strikes only when their settlement terms match', () => {
    const lower = market('7997690', '1')
    const middle = market('8000585', '2')
    const upper = market('8010000', '3')
    const wrongExpiry = market('8020000', '4', { expiresAt: NOW + 900 })
    const wrongCollateral = market('8030000', '5', {
      collateralAddress: `0x${'ef'.repeat(20)}`,
    })

    const pairs = selectFixedStrikeRangePairs(
      [upper, wrongExpiry, lower, wrongCollateral, middle],
      'BTC',
      NOW,
    )

    expect(pairs).toHaveLength(2)
    expect(
      pairs.map((pair) => [pair.lower.strikeRaw, pair.upper.strikeRaw]),
    ).toEqual([
      ['7997690', '8000585'],
      ['8000585', '8010000'],
    ])
  })

  it('rejects opening-price, locked, closing, and cross-venue markets', () => {
    const lower = market('7997690', '1')
    const opening = market('0', '2', { reference: 'opening-price' })
    const locked = market('8000585', '3', { status: 'locked' })
    const closing = market('8010000', '4', { expiresAt: NOW + 10 })
    const otherVenue = market('8020000', '5', {
      venueId: `0x${'ef'.repeat(32)}`,
    })
    const unknownVenue = market('8030000', '6', { venueId: null })

    expect(
      selectFixedStrikeRangePairs(
        [lower, opening, locked, closing, otherVenue, unknownVenue],
        'BTC',
        NOW,
      ),
    ).toEqual([])
  })

  it('pays one share outside and two shares inside the half-open band', () => {
    const input = {
      lowerStrikeRaw: 100n,
      upperStrikeRaw: 110n,
      quantityRaw: 5n,
    }

    expect(rangePayoffAtSettlement({ ...input, settlementPriceRaw: 99n })).toBe(
      5n,
    )
    expect(
      rangePayoffAtSettlement({ ...input, settlementPriceRaw: 100n }),
    ).toBe(10n)
    expect(
      rangePayoffAtSettlement({ ...input, settlementPriceRaw: 109n }),
    ).toBe(10n)
    expect(
      rangePayoffAtSettlement({ ...input, settlementPriceRaw: 110n }),
    ).toBe(5n)
  })

  it('derives maximum loss from maximum debit rather than hiding the floor payout', () => {
    expect(rangeMaximumLoss(1_130_000n, 1_000_000n)).toBe(130_000n)
    expect(rangeMaximumLoss(990_000n, 1_000_000n)).toBe(0n)
  })

  it('finds a common quantity grid for two pools', () => {
    expect(lcm(25n, 40n)).toBe(200n)
  })
})
