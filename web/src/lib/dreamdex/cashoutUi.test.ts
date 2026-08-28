import { describe, expect, it } from 'vitest'

import {
  cashoutPnlDirection,
  liveCashoutButtonLabel,
  liveCashoutGuidance,
} from './cashoutUi'

describe('cash-out presentation', () => {
  it('classifies realized exits by proceeds versus actual filled cost', () => {
    expect(cashoutPnlDirection({ proceedsRaw: 12n, costRaw: 10n })).toBe(
      'profit',
    )
    expect(cashoutPnlDirection({ proceedsRaw: 8n, costRaw: 10n })).toBe('loss')
    expect(cashoutPnlDirection({ proceedsRaw: 10n, costRaw: 10n })).toBe('even')
  })

  it('offers one cash-out action as soon as the automatic quote is ready', () => {
    expect(
      liveCashoutButtonLabel({
        phase: 'ready',
        fullExitAvailable: true,
        authorizationRequired: null,
      }),
    ).toBe('CASH OUT')
  })

  it('explains the one-time authorization and sale as two wallet steps', () => {
    expect(
      liveCashoutButtonLabel({
        phase: 'approving',
        fullExitAvailable: true,
        authorizationRequired: true,
      }),
    ).toBe('1/2 ENABLE')
    expect(
      liveCashoutButtonLabel({
        phase: 'submitting',
        fullExitAvailable: true,
        authorizationRequired: true,
      }),
    ).toBe('2/2 SELL')
    expect(
      liveCashoutGuidance({
        phase: 'submitting',
        fullExitAvailable: true,
        authorizationRequired: true,
        heldPayout: '10.00',
      }),
    ).toContain('Wallet 2 of 2')
  })

  it('shows one confirmation when the wallet supports atomic calls', () => {
    expect(
      liveCashoutButtonLabel({
        phase: 'batching',
        fullExitAvailable: true,
        authorizationRequired: true,
      }),
    ).toBe('1/1 EXIT')
    expect(
      liveCashoutGuidance({
        phase: 'batching',
        fullExitAvailable: true,
        authorizationRequired: true,
        heldPayout: '10.00',
      }),
    ).toContain('sell, and revoke atomically')
  })

  it('uses one sell confirmation when the pool is already authorized', () => {
    expect(
      liveCashoutButtonLabel({
        phase: 'submitting',
        fullExitAvailable: true,
        authorizationRequired: false,
      }),
    ).toBe('SELL NOW')
  })
})
