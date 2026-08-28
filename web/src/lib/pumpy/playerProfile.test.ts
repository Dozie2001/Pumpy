import { describe, expect, it } from 'vitest'

import {
  profileAchievements,
  readPlayerProfile,
  recordPlayerTrade,
} from './playerProfile'
import type {
  PlayerOrderOutcome,
  PreparedPlayerTrade,
  PumpyEventMarket,
} from '@/lib/dreamdex/types'

const account = '0x1111111111111111111111111111111111111111' as const
const market: PumpyEventMarket = {
  marketId: `0x${'22'.repeat(32)}`,
  poolAddress: '0x3333333333333333333333333333333333333333',
  marketAddress: '0x4444444444444444444444444444444444444444',
  asset: 'BTC',
  question: 'BTC UP or DOWN?',
  oracleQuestion: null,
  reference: 'opening-price',
  strikeRaw: '0',
  targetPriceRaw: '8031395',
  status: 'trading',
  tradingStartsAt: 1,
  expiresAt: 2,
  intervalLabel: '5m',
  intervalSeconds: 300,
  operatorId: 1,
  venueId: `0x${'55'.repeat(32)}`,
  collateralAddress: '0x6666666666666666666666666666666666666666',
  collateralSymbol: 'tUSDC',
  collateralDecimals: 6,
  yesTokenId: 'yes',
  noTokenId: 'no',
}

function trade(side: 'UP' | 'DOWN'): PreparedPlayerTrade {
  return {
    marketId: market.marketId,
    poolAddress: market.poolAddress,
    collateralAddress: market.collateralAddress,
    collateralSymbol: market.collateralSymbol,
    collateralDecimals: 6,
    side,
    orderSide: side === 'UP' ? 'BUY_YES' : 'BUY_NO',
    stakeRaw: 5_000_000n,
    escrowRaw: 5_000_000n,
    quantityRaw: 8_000_000n,
    yesLimitPriceRaw: 625_000n,
    outcomeLimitPriceRaw: 625_000n,
    walletBalanceRaw: 20_000_000n,
    hasEnoughBalance: true,
    observedAt: 1,
    validUntil: 2,
    marketExpiresAt: 3,
  }
}

function outcome(byte: string): PlayerOrderOutcome {
  return {
    status: 'filled',
    hash: `0x${byte.repeat(64)}`,
    orderId: 1n,
    requestedQuantityRaw: 8_000_000n,
    filledQuantityRaw: 8_000_000n,
    filledCostRaw: 5_000_000n,
  }
}

function storage() {
  const rows = new Map<string, string>()
  return {
    getItem: (key: string) => rows.get(key) ?? null,
    setItem: (key: string, value: string) => rows.set(key, value),
  }
}

describe('Pumpy player profile', () => {
  it('records wallet-signed fills newest first and deduplicates by transaction', () => {
    const store = storage()
    recordPlayerTrade({
      storage: store,
      account,
      market,
      trade: trade('UP'),
      outcome: outcome('a'),
      now: 1,
    })
    recordPlayerTrade({
      storage: store,
      account,
      market,
      trade: trade('DOWN'),
      outcome: outcome('b'),
      now: 2,
    })
    recordPlayerTrade({
      storage: store,
      account,
      market,
      trade: trade('DOWN'),
      outcome: outcome('b'),
      now: 3,
    })

    const profile = readPlayerProfile(store, account)
    expect(profile.plays).toHaveLength(2)
    expect(profile.plays.map((play) => play.side)).toEqual(['DOWN', 'UP'])
  })

  it('derives achievements from actual fills and arcade score', () => {
    const store = storage()
    recordPlayerTrade({
      storage: store,
      account,
      market,
      trade: trade('UP'),
      outcome: outcome('a'),
    })
    recordPlayerTrade({
      storage: store,
      account,
      market,
      trade: trade('DOWN'),
      outcome: outcome('b'),
    })

    const achievements = profileAchievements(
      readPlayerProfile(store, account),
      6,
    )
    expect(
      achievements.find((badge) => badge.id === 'two-way-player')?.unlocked,
    ).toBe(true)
    expect(
      achievements.find((badge) => badge.id === 'volume-ten')?.unlocked,
    ).toBe(true)
    expect(
      achievements.find((badge) => badge.id === 'candle-five')?.unlocked,
    ).toBe(true)
    expect(
      achievements.find((badge) => badge.id === 'candle-twenty')?.unlocked,
    ).toBe(false)
  })

  it('derives Range badges from recorded arcade bests', () => {
    const achievements = profileAchievements(
      readPlayerProfile(storage(), account),
      0,
      750,
      4,
    )

    expect(
      achievements.find((badge) => badge.id === 'range-keeper')?.unlocked,
    ).toBe(true)
    expect(
      achievements.find((badge) => badge.id === 'full-stack')?.unlocked,
    ).toBe(true)
  })

  it('uses verified DreamDEX metrics for trade-earned badges', () => {
    const achievements = profileAchievements(
      readPlayerProfile(storage(), account),
      0,
      0,
      0,
      {
        plays: 3,
        volume: 12,
        hasUp: true,
        hasDown: true,
        hasChainProof: true,
      },
    )

    expect(
      achievements.find((badge) => badge.id === 'first-pump')?.unlocked,
    ).toBe(true)
    expect(
      achievements.find((badge) => badge.id === 'two-way-player')?.unlocked,
    ).toBe(true)
    expect(
      achievements.find((badge) => badge.id === 'chain-proof')?.unlocked,
    ).toBe(true)
    expect(
      achievements.find((badge) => badge.id === 'volume-ten')?.unlocked,
    ).toBe(true)
  })
})
