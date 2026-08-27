import { describe, expect, it } from 'vitest'

import {
  createQuickCallRound,
  deriveQuickCallSnapshot,
  readQuickCallRound,
  writeQuickCallRound,
} from './quickCall'
import type {
  PlayerOrderOutcome,
  PreparedPlayerTrade,
  PumpyEventMarket,
} from './types'

const address = '0x1111111111111111111111111111111111111111' as const
const market = {
  marketId: `0x${'22'.repeat(32)}`,
  poolAddress: '0x3333333333333333333333333333333333333333',
  marketAddress: '0x4444444444444444444444444444444444444444',
  asset: 'BTC',
  question: 'Will BTC close up?',
  collateralSymbol: 'tUSDC',
  operatorId: 7,
  venueId: `0x${'55'.repeat(32)}`,
  expiresAt: 2_000,
  intervalSeconds: 900,
  reference: 'opening-price',
  strikeRaw: '0',
  targetPriceRaw: '8031395',
} as unknown as PumpyEventMarket
const trade = {
  side: 'UP',
  collateralDecimals: 6,
  escrowRaw: 5_000_000n,
} as PreparedPlayerTrade
const outcome = {
  status: 'filled',
  hash: `0x${'66'.repeat(32)}`,
  requestedQuantityRaw: 8_000_000n,
  filledQuantityRaw: 8_000_000n,
  filledCostRaw: 4_800_000n,
} as PlayerOrderOutcome

describe('Quick Call persistence and reconciliation', () => {
  it('round-trips bigint fields as strings', () => {
    const values = new Map<string, string>()
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    }
    const round = createQuickCallRound({
      account: address,
      market,
      trade,
      outcome,
      now: 1_000,
    })
    writeQuickCallRound(storage, round)
    expect(readQuickCallRound(storage, address)).toEqual(round)
    expect(round.filledQuantityRaw).toBe('8000000')
    expect(round.escrowRaw).toBe('4800000')
    expect(round.game).toBe('lucky')
  })

  it('keeps the originating game for resume and result copy', () => {
    const round = createQuickCallRound({
      account: address,
      game: 'long-shot',
      market,
      trade,
      outcome,
    })

    expect(round.game).toBe('long-shot')
  })

  it('ignores malformed browser storage instead of hydrating it', () => {
    const storage = {
      getItem: () => '{"version":1,"account":"not-an-address"}',
    }
    expect(readQuickCallRound(storage, address)).toBeNull()
  })

  it('refuses to persist an unfilled order as a position', () => {
    expect(() =>
      createQuickCallRound({
        account: address,
        market,
        trade,
        outcome: { ...outcome, status: 'unfilled', filledQuantityRaw: 0n },
      }),
    ).toThrow('Only a filled Quick Call')
  })

  it('distinguishes indexing, live, claimable, loss, and claimed states', () => {
    const round = createQuickCallRound({
      account: address,
      market,
      trade,
      outcome,
    })
    const snapshot = (
      overrides: Partial<Parameters<typeof deriveQuickCallSnapshot>[0]>,
    ) =>
      deriveQuickCallSnapshot({
        round,
        positionRaw: 0n,
        claimableRaw: 0n,
        estimatedPayoutRaw: 0n,
        winningOutcome: null,
        voided: false,
        resolutionHash: null,
        ...overrides,
      })

    expect(snapshot({}).phase).toBe('indexing')
    expect(snapshot({ positionRaw: 8n }).phase).toBe('live')
    expect(snapshot({ claimableRaw: 8n, winningOutcome: 0 }).phase).toBe(
      'claimable',
    )
    expect(snapshot({ claimableRaw: 8n, voided: true }).phase).toBe('voided')
    expect(snapshot({ positionRaw: 8n, winningOutcome: 1 }).phase).toBe('lost')
    expect(snapshot({ round: { ...round, claimedAt: 5 } }).phase).toBe(
      'claimed',
    )
    expect(snapshot({ round: { ...round, cashedOutAt: 5 } }).phase).toBe(
      'cashed-out',
    )
  })
})
