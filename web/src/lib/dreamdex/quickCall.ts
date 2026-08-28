import type { Address, Hash } from 'viem'

import type {
  PlayerOrderOutcome,
  PreparedPlayerTrade,
  PumpyEventMarket,
  QuickCallRound,
} from './types'

const STORAGE_PREFIX = 'pumpy:quick-call:v2'
const LEGACY_STORAGE_PREFIX = 'pumpy:quick-call:v1'
type StoredQuickCallRound = Omit<QuickCallRound, 'game'> & {
  game?: QuickCallRound['game']
}

export type QuickCallChainSnapshot = {
  phase:
    | 'indexing'
    | 'live'
    | 'claimable'
    | 'won'
    | 'lost'
    | 'voided'
    | 'claimed'
    | 'cashed-out'
  positionRaw: bigint
  claimableRaw: bigint
  estimatedPayoutRaw: bigint
  winningOutcome: 0 | 1 | null
  resolutionHash: Hash | null
  targetPriceRaw: string | null
}

export function quickCallStorageKey(
  account: Address,
  game: QuickCallRound['game'] = 'lucky',
): string {
  return `${STORAGE_PREFIX}:${account.toLowerCase()}:${game}`
}

function legacyQuickCallStorageKey(account: Address): string {
  return `${LEGACY_STORAGE_PREFIX}:${account.toLowerCase()}`
}

export function createQuickCallRound(params: {
  account: Address
  game?: QuickCallRound['game']
  market: PumpyEventMarket
  trade: PreparedPlayerTrade
  outcome: PlayerOrderOutcome
  now?: number
}): QuickCallRound {
  if (
    (params.outcome.status !== 'filled' &&
      params.outcome.status !== 'partial') ||
    params.outcome.filledQuantityRaw <= 0n
  ) {
    throw new Error('Only a filled Quick Call can become an active round')
  }
  return {
    version: 1,
    game: params.game ?? 'lucky',
    account: params.account,
    marketId: params.market.marketId,
    poolAddress: params.market.poolAddress,
    marketAddress: params.market.marketAddress,
    asset: params.market.asset,
    question: params.market.question,
    side: params.trade.side,
    outcomeIndex: params.trade.side === 'UP' ? 0 : 1,
    collateralSymbol: params.market.collateralSymbol,
    collateralDecimals: params.trade.collateralDecimals,
    operatorId: params.market.operatorId,
    venueId: params.market.venueId,
    expiresAt: params.market.expiresAt,
    intervalSeconds: params.market.intervalSeconds,
    reference: params.market.reference,
    strikeRaw: params.market.strikeRaw,
    targetPriceRaw: params.market.targetPriceRaw,
    orderStatus: params.outcome.status,
    orderHash: params.outcome.hash,
    requestedQuantityRaw: params.outcome.requestedQuantityRaw.toString(),
    filledQuantityRaw: params.outcome.filledQuantityRaw.toString(),
    escrowRaw: params.outcome.filledCostRaw.toString(),
    submittedAt: params.now ?? Date.now(),
    claimHash: null,
    claimedAt: null,
    cashoutHash: null,
    cashoutProceedsRaw: null,
    cashedOutAt: null,
  }
}

export function readQuickCallRound(
  storage: Pick<Storage, 'getItem'>,
  account: Address,
  game: QuickCallRound['game'] = 'lucky',
): QuickCallRound | null {
  const current = parseStoredQuickCallRound(
    storage.getItem(quickCallStorageKey(account, game)),
    account,
  )
  if (current?.game === game) return current

  const legacy = parseStoredQuickCallRound(
    storage.getItem(legacyQuickCallStorageKey(account)),
    account,
  )
  return legacy?.game === game ? legacy : null
}

function parseStoredQuickCallRound(
  raw: string | null,
  account: Address,
): QuickCallRound | null {
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    return isStoredQuickCallRound(parsed, account)
      ? { ...parsed, game: parsed.game ?? 'lucky' }
      : null
  } catch {
    return null
  }
}

function isStoredQuickCallRound(
  value: unknown,
  account: Address,
): value is StoredQuickCallRound {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  const isAddress = (entry: unknown) =>
    typeof entry === 'string' && /^0x[0-9a-fA-F]{40}$/.test(entry)
  const isBytes32 = (entry: unknown) =>
    typeof entry === 'string' && /^0x[0-9a-fA-F]{64}$/.test(entry)
  const isRawAmount = (entry: unknown) =>
    typeof entry === 'string' && /^\d+$/.test(entry)
  return (
    candidate.version === 1 &&
    (candidate.game === undefined ||
      candidate.game === 'lucky' ||
      candidate.game === 'long-shot') &&
    typeof candidate.account === 'string' &&
    candidate.account.toLowerCase() === account.toLowerCase() &&
    isAddress(candidate.account) &&
    isBytes32(candidate.marketId) &&
    isAddress(candidate.poolAddress) &&
    isAddress(candidate.marketAddress) &&
    typeof candidate.asset === 'string' &&
    typeof candidate.question === 'string' &&
    (candidate.side === 'UP' || candidate.side === 'DOWN') &&
    (candidate.outcomeIndex === 0 || candidate.outcomeIndex === 1) &&
    (candidate.side === 'UP'
      ? candidate.outcomeIndex === 0
      : candidate.outcomeIndex === 1) &&
    typeof candidate.collateralSymbol === 'string' &&
    Number.isInteger(candidate.collateralDecimals) &&
    Number(candidate.collateralDecimals) >= 0 &&
    Number(candidate.collateralDecimals) <= 255 &&
    (candidate.operatorId === null || Number.isInteger(candidate.operatorId)) &&
    (candidate.venueId === null || isBytes32(candidate.venueId)) &&
    typeof candidate.expiresAt === 'number' &&
    (candidate.intervalSeconds === undefined ||
      candidate.intervalSeconds === null ||
      typeof candidate.intervalSeconds === 'number') &&
    (candidate.reference === undefined ||
      candidate.reference === 'opening-price' ||
      candidate.reference === 'fixed-strike') &&
    (candidate.strikeRaw === undefined || isRawAmount(candidate.strikeRaw)) &&
    (candidate.targetPriceRaw === undefined ||
      candidate.targetPriceRaw === null ||
      isRawAmount(candidate.targetPriceRaw)) &&
    (candidate.orderStatus === 'filled' ||
      candidate.orderStatus === 'partial') &&
    isBytes32(candidate.orderHash) &&
    isRawAmount(candidate.requestedQuantityRaw) &&
    isRawAmount(candidate.filledQuantityRaw) &&
    BigInt(candidate.filledQuantityRaw as string) > 0n &&
    isRawAmount(candidate.escrowRaw) &&
    typeof candidate.submittedAt === 'number' &&
    (candidate.claimHash === null || isBytes32(candidate.claimHash)) &&
    (candidate.claimedAt === null || typeof candidate.claimedAt === 'number') &&
    (candidate.cashoutHash === undefined ||
      candidate.cashoutHash === null ||
      isBytes32(candidate.cashoutHash)) &&
    (candidate.cashoutProceedsRaw === undefined ||
      candidate.cashoutProceedsRaw === null ||
      isRawAmount(candidate.cashoutProceedsRaw)) &&
    (candidate.cashedOutAt === undefined ||
      candidate.cashedOutAt === null ||
      typeof candidate.cashedOutAt === 'number')
  )
}

export function writeQuickCallRound(
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>,
  round: QuickCallRound,
): void {
  storage.setItem(
    quickCallStorageKey(round.account, round.game),
    JSON.stringify(round),
  )
  const legacy = parseStoredQuickCallRound(
    storage.getItem(legacyQuickCallStorageKey(round.account)),
    round.account,
  )
  if (legacy?.game === round.game) {
    storage.removeItem(legacyQuickCallStorageKey(round.account))
  }
}

export function removeQuickCallRound(
  storage: Pick<Storage, 'getItem' | 'removeItem'>,
  account: Address,
  game: QuickCallRound['game'] = 'lucky',
): void {
  storage.removeItem(quickCallStorageKey(account, game))
  const legacy = parseStoredQuickCallRound(
    storage.getItem(legacyQuickCallStorageKey(account)),
    account,
  )
  if (legacy?.game === game) {
    storage.removeItem(legacyQuickCallStorageKey(account))
  }
}

export function deriveQuickCallSnapshot(params: {
  round: QuickCallRound
  positionRaw: bigint
  claimableRaw: bigint
  estimatedPayoutRaw: bigint
  winningOutcome: number | null
  voided: boolean
  resolutionHash: string | null
  targetPriceRaw?: string | null
}): QuickCallChainSnapshot {
  const winningOutcome: 0 | 1 | null =
    params.winningOutcome === 0 || params.winningOutcome === 1
      ? params.winningOutcome
      : null
  const base = {
    positionRaw: params.positionRaw,
    claimableRaw: params.claimableRaw,
    estimatedPayoutRaw: params.estimatedPayoutRaw,
    winningOutcome,
    resolutionHash: params.resolutionHash as Hash | null,
    targetPriceRaw:
      params.targetPriceRaw ?? params.round.targetPriceRaw ?? null,
  }

  if (params.round.cashedOutAt) return { ...base, phase: 'cashed-out' }
  if (params.round.claimedAt) return { ...base, phase: 'claimed' }
  if (params.voided) return { ...base, phase: 'voided' }
  if (params.claimableRaw > 0n) return { ...base, phase: 'claimable' }
  if (winningOutcome !== null) {
    return {
      ...base,
      phase: winningOutcome === params.round.outcomeIndex ? 'won' : 'lost',
    }
  }
  if (params.positionRaw > 0n) return { ...base, phase: 'live' }
  return { ...base, phase: 'indexing' }
}
