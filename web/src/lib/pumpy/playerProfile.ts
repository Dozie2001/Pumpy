import type { Address, Hash, Hex } from 'viem'

import type {
  PlayerOrderOutcome,
  PreparedPlayerTrade,
  PumpyEventMarket,
} from '@/lib/dreamdex/types'

const PROFILE_VERSION = 1
const STORAGE_PREFIX = 'pumpy:player-profile:v1'

export type PumpyPlayRecord = {
  id: Hash
  marketId: Hex
  asset: string
  game?: 'lucky' | 'long-shot'
  side: 'UP' | 'DOWN'
  collateralSymbol: string
  collateralDecimals: number
  premiumRaw: string
  payoutRaw: string
  filledQuantityRaw: string
  status: PlayerOrderOutcome['status']
  submittedAt: number
}

export type PumpyPlayerProfile = {
  version: 1
  account: Address
  plays: Array<PumpyPlayRecord>
}

export type PumpyAchievement = {
  id: string
  name: string
  description: string
  unlocked: boolean
  progress: string
}

export function playerProfileKey(account: Address): string {
  return `${STORAGE_PREFIX}:${account.toLowerCase()}`
}

export function readPlayerProfile(
  storage: Pick<Storage, 'getItem'>,
  account: Address,
): PumpyPlayerProfile {
  const empty: PumpyPlayerProfile = {
    version: PROFILE_VERSION,
    account,
    plays: [],
  }
  const raw = storage.getItem(playerProfileKey(account))
  if (!raw) return empty
  try {
    const parsed = JSON.parse(raw) as Partial<PumpyPlayerProfile>
    if (
      parsed.version !== PROFILE_VERSION ||
      parsed.account?.toLowerCase() !== account.toLowerCase() ||
      !Array.isArray(parsed.plays)
    )
      return empty
    return { ...empty, plays: parsed.plays.filter(isPlayRecord).slice(0, 100) }
  } catch {
    return empty
  }
}

export function recordPlayerTrade(params: {
  storage: Pick<Storage, 'getItem' | 'setItem'>
  account: Address
  game?: PumpyPlayRecord['game']
  market: PumpyEventMarket
  trade: PreparedPlayerTrade
  outcome: PlayerOrderOutcome
  now?: number
}): PumpyPlayerProfile {
  const current = readPlayerProfile(params.storage, params.account)
  const record: PumpyPlayRecord = {
    id: params.outcome.hash,
    marketId: params.market.marketId,
    asset: params.market.asset,
    game: params.game ?? 'lucky',
    side: params.trade.side,
    collateralSymbol: params.trade.collateralSymbol,
    collateralDecimals: params.trade.collateralDecimals,
    premiumRaw: params.outcome.filledCostRaw.toString(),
    payoutRaw: params.outcome.filledQuantityRaw.toString(),
    filledQuantityRaw: params.outcome.filledQuantityRaw.toString(),
    status: params.outcome.status,
    submittedAt: params.now ?? Date.now(),
  }
  const next: PumpyPlayerProfile = {
    ...current,
    plays: [
      record,
      ...current.plays.filter((play) => play.id !== record.id),
    ].slice(0, 100),
  }
  params.storage.setItem(playerProfileKey(params.account), JSON.stringify(next))
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('pumpy:profile-updated'))
  }
  return next
}

export function profileVolumeRaw(profile: PumpyPlayerProfile): bigint {
  return profile.plays.reduce(
    (total, play) => total + BigInt(play.premiumRaw),
    0n,
  )
}

export function profileAchievements(
  profile: PumpyPlayerProfile,
  candleBest: number,
  rangeBest = 0,
  rangeMaxStack = 0,
): Array<PumpyAchievement> {
  const sides = new Set(profile.plays.map((play) => play.side))
  const volume = profile.plays.reduce(
    (total, play) =>
      total + Number(play.premiumRaw) / 10 ** play.collateralDecimals,
    0,
  )
  return [
    {
      id: 'first-pump',
      name: 'First Pump',
      description: 'Fill your first DreamDEX arcade play.',
      unlocked: profile.plays.length >= 1,
      progress: `${Math.min(profile.plays.length, 1)}/1`,
    },
    {
      id: 'two-way-player',
      name: 'Two-Way Player',
      description: 'Play both UP and DOWN through the lucky deal.',
      unlocked: sides.has('UP') && sides.has('DOWN'),
      progress: `${sides.size}/2 sides`,
    },
    {
      id: 'chain-proof',
      name: 'Chain Proof',
      description: 'Land a wallet-signed Event Contract order.',
      unlocked: profile.plays.some((play) => play.id.startsWith('0x')),
      progress: profile.plays.length ? 'Verified' : '0/1',
    },
    {
      id: 'volume-ten',
      name: 'Volume 10',
      description: 'Put 10 test collateral through the arcade.',
      unlocked: volume >= 10,
      progress: `$${Math.min(10, volume).toFixed(2)}/$10`,
    },
    {
      id: 'candle-five',
      name: 'Candle Spark',
      description: 'Clear five gaps in Candle Hop.',
      unlocked: candleBest >= 5,
      progress: `${Math.min(candleBest, 5)}/5`,
    },
    {
      id: 'candle-twenty',
      name: 'Pump Pilot',
      description: 'Clear twenty gaps in one Candle Hop run.',
      unlocked: candleBest >= 20,
      progress: `${Math.min(candleBest, 20)}/20`,
    },
    {
      id: 'range-keeper',
      name: 'Range Keeper',
      description: 'Score 500 points in one Range session.',
      unlocked: rangeBest >= 500,
      progress: `${Math.min(rangeBest, 500)}/500`,
    },
    {
      id: 'full-stack',
      name: 'Full Stack',
      description: 'Ride four live Range bands at once.',
      unlocked: rangeMaxStack >= 4,
      progress: `${Math.min(rangeMaxStack, 4)}/4`,
    },
  ]
}

function isPlayRecord(value: unknown): value is PumpyPlayRecord {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return (
    typeof record.id === 'string' &&
    /^0x[0-9a-fA-F]{64}$/.test(record.id) &&
    typeof record.marketId === 'string' &&
    typeof record.asset === 'string' &&
    (record.game === undefined ||
      record.game === 'lucky' ||
      record.game === 'long-shot') &&
    (record.side === 'UP' || record.side === 'DOWN') &&
    typeof record.collateralSymbol === 'string' &&
    Number.isInteger(record.collateralDecimals) &&
    typeof record.premiumRaw === 'string' &&
    /^\d+$/.test(record.premiumRaw) &&
    typeof record.payoutRaw === 'string' &&
    /^\d+$/.test(record.payoutRaw) &&
    typeof record.filledQuantityRaw === 'string' &&
    /^\d+$/.test(record.filledQuantityRaw) &&
    typeof record.submittedAt === 'number'
  )
}
