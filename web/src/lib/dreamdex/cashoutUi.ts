import type { CashoutPhase } from './usePlayerCashout'

export type CashoutPnlDirection = 'profit' | 'loss' | 'even'

export function cashoutPnlDirection(params: {
  proceedsRaw: bigint
  costRaw: bigint
}): CashoutPnlDirection {
  if (params.proceedsRaw > params.costRaw) return 'profit'
  if (params.proceedsRaw < params.costRaw) return 'loss'
  return 'even'
}

export function liveCashoutButtonLabel(params: {
  phase: CashoutPhase
  fullExitAvailable: boolean
  authorizationRequired: boolean | null
}): string {
  if (params.phase === 'checking') return 'CHECKING'
  if (params.phase === 'batching') return '1/1 EXIT'
  if (params.phase === 'approving') return '1/2 ENABLE'
  if (params.phase === 'refreshing') return '2/2 CHECK'
  if (params.phase === 'submitting') {
    return params.authorizationRequired ? '2/2 SELL' : 'SELL NOW'
  }
  if (params.phase === 'error') return 'RETRY EXIT'
  if (params.phase === 'unavailable') return 'NO EXIT'
  if (params.phase === 'ready') {
    return params.fullExitAvailable ? 'CASH OUT' : 'NO EXIT'
  }
  return 'PRICING'
}

export function liveCashoutGuidance(params: {
  phase: CashoutPhase
  fullExitAvailable: boolean
  authorizationRequired: boolean | null
  heldPayout: string
}): string {
  if (params.phase === 'checking') {
    return 'Checking your active wallet, position balance, and final exit price'
  }
  if (params.phase === 'batching') {
    return 'Wallet 1 of 1 · Temporarily enable, sell, and revoke atomically'
  }
  if (params.phase === 'approving') {
    return 'Wallet 1 of 2 · Enable this DreamDEX pool to sell your position'
  }
  if (params.phase === 'refreshing') {
    return 'Authorization confirmed · Rechecking the live exit book'
  }
  if (params.phase === 'submitting') {
    return params.authorizationRequired
      ? 'Wallet 2 of 2 · Confirm the position sale'
      : 'Confirm the position sale in your wallet'
  }
  if (params.fullExitAvailable) {
    return `Full exit quoted from the live book · payout if held: $${params.heldPayout}`
  }
  return 'Cash out needs enough live bid liquidity for the full position'
}
