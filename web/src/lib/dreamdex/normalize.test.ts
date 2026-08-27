import { describe, expect, it } from 'vitest'

import {
  normalizeBinaryMarket,
  selectClosingPumpyMarket,
  selectNextPumpyMarket,
  selectPumpyMarket,
} from './normalize'
import type { BinaryMarket } from '@somnia-chain/markets-sdk'

const NOW = 1_787_343_000

function binaryMarket(overrides: Partial<BinaryMarket> = {}): BinaryMarket {
  return {
    id: `0x${'01'.repeat(32)}`,
    marketType: 'BINARY',
    marketId: `0x${'01'.repeat(32)}`,
    poolAddress: `0x${'02'.repeat(20)}`,
    marketAddress: `0x${'03'.repeat(20)}`,
    yesTokenId: '1',
    noTokenId: '2',
    collateral: `0x${'04'.repeat(20)}`,
    asset: 'BTC',
    question: 'BTC closes at or above its opening price',
    oracleQuestion: 'BTC closes at or above its opening price',
    strike: '0',
    status: 'Trading',
    tradingStart: String(NOW - 300),
    expiry: String(NOW + 600),
    winningOutcome: null,
    resolvedAtBlock: null,
    resolvedAtTimestamp: null,
    createdByTx: null,
    voided: false,
    backing: '0',
    intervalSec: '900',
    interval: '15m',
    operatorId: 2,
    venueId: `0x${'05'.repeat(32)}`,
    lastPrice: null,
    lastTradeAt: null,
    cumulativeBaseVolume: '0',
    cumulativeQuoteVolume: '0',
    tradeCount: '0',
    baseDecimals: 6,
    quoteDecimals: 6,
    createdAtTimestamp: String(NOW - 300),
    ...overrides,
  }
}

describe('DreamDEX binary market normalization', () => {
  it('keeps a zero strike as an opening-price market', () => {
    const market = normalizeBinaryMarket(
      binaryMarket(),
      NOW,
      { symbol: 'tUSDC', decimals: 6 },
      '8031395',
    )

    expect(market.reference).toBe('opening-price')
    expect(market.strikeRaw).toBe('0')
    expect(market.targetPriceRaw).toBe('8031395')
    expect(market.marketId).toBe(`0x${'01'.repeat(32)}`)
    expect(market.collateralSymbol).toBe('tUSDC')
  })

  it('does not guess a collateral symbol from its decimals', () => {
    const market = normalizeBinaryMarket(
      binaryMarket({ quoteDecimals: 6 }),
      NOW,
    )

    expect(market.collateralSymbol).toBe('Collateral')
    expect(market.collateralDecimals).toBe(6)
  })

  it('uses metadata read from the market collateral contract', () => {
    const market = normalizeBinaryMarket(binaryMarket(), NOW, {
      symbol: 'TEST',
      decimals: 8,
    })

    expect(market.collateralSymbol).toBe('TEST')
    expect(market.collateralDecimals).toBe(8)
  })

  it('derives timestamp lifecycle instead of trusting a stale status event', () => {
    const ended = normalizeBinaryMarket(
      binaryMarket({ status: 'Trading', expiry: String(NOW - 1) }),
      NOW,
    )

    expect(ended.status).toBe('settling')
  })

  it('follows the closest compatible successor without pinning a pool or cadence', () => {
    const oneHour = normalizeBinaryMarket(
      binaryMarket({
        marketId: `0x${'10'.repeat(32)}`,
        poolAddress: `0x${'11'.repeat(20)}`,
        expiry: String(NOW + 3_600),
        interval: '1h',
        intervalSec: '3600',
      }),
      NOW,
    )
    const fifteenMinutes = normalizeBinaryMarket(
      binaryMarket({
        marketId: `0x${'20'.repeat(32)}`,
        poolAddress: `0x${'21'.repeat(20)}`,
        expiry: String(NOW + 900),
      }),
      NOW,
    )

    expect(selectPumpyMarket([oneHour, fifteenMinutes], 'BTC', NOW)).toEqual(
      fifteenMinutes,
    )
  })

  it('prefers the clearer opening-reference round over a fixed-strike market', () => {
    const fixedStrike = normalizeBinaryMarket(
      binaryMarket({ strike: '7725105', expiry: String(NOW + 300) }),
      NOW,
    )
    const opening = normalizeBinaryMarket(
      binaryMarket({
        marketId: `0x${'30'.repeat(32)}`,
        expiry: String(NOW + 900),
      }),
      NOW,
    )

    expect(selectPumpyMarket([fixedStrike, opening], 'BTC', NOW)).toEqual(
      opening,
    )
  })

  it('uses the fixed strike itself as the target', () => {
    const market = normalizeBinaryMarket(
      binaryMarket({ strike: '7725105' }),
      NOW,
    )

    expect(market.reference).toBe('fixed-strike')
    expect(market.targetPriceRaw).toBe('7725105')
  })

  it('never selects a market inside the same safety window used by placement', () => {
    const closing = normalizeBinaryMarket(
      binaryMarket({ expiry: String(NOW + 80), intervalSec: '900' }),
      NOW,
    )
    const successor = normalizeBinaryMarket(
      binaryMarket({
        marketId: `0x${'40'.repeat(32)}`,
        poolAddress: `0x${'41'.repeat(20)}`,
        expiry: String(NOW + 900),
        intervalSec: '900',
      }),
      NOW,
    )

    expect(selectPumpyMarket([closing, successor], 'BTC', NOW)).toEqual(
      successor,
    )
    expect(selectClosingPumpyMarket([closing, successor], 'BTC', NOW)).toEqual(
      closing,
    )
  })

  it('exposes the next listed round without allowing it to be traded early', () => {
    const upcoming = normalizeBinaryMarket(
      binaryMarket({
        status: 'Listed',
        tradingStart: String(NOW + 30),
        expiry: String(NOW + 930),
      }),
      NOW,
    )

    expect(selectPumpyMarket([upcoming], 'BTC', NOW)).toBeNull()
    expect(selectNextPumpyMarket([upcoming], 'BTC', NOW)).toEqual(upcoming)
    expect(selectPumpyMarket([upcoming], 'BTC', NOW + 31)).toEqual(upcoming)
  })
})
