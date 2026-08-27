export type RangeTier = {
  id: 'wide' | 'tight' | 'needle'
  label: string
  halfWidthBps: number
  points: number
}

export type RangeArcadeBand = {
  id: string
  center: number
  lower: number
  upper: number
  points: number
  openedAt: number
  expiresAt: number
  status: 'active' | 'won' | 'lost' | 'void'
  resolvedAt: number | null
}

export const RANGE_TIERS: ReadonlyArray<RangeTier> = [
  { id: 'wide', label: 'Wide', halfWidthBps: 12, points: 100 },
  { id: 'tight', label: 'Tight', halfWidthBps: 6, points: 250 },
  { id: 'needle', label: 'Needle', halfWidthBps: 3, points: 500 },
]

export const RANGE_ROUND_MS = 12_000
export const RANGE_MAX_BANDS = 4

export function createRangeArcadeBand(params: {
  id: string
  price: number
  tier: RangeTier
  now: number
  durationMs?: number
}): RangeArcadeBand {
  if (!Number.isFinite(params.price) || params.price <= 0) {
    throw new Error('A live positive price is required to lock a range')
  }
  const halfWidth = params.price * (params.tier.halfWidthBps / 10_000)
  return {
    id: params.id,
    center: params.price,
    lower: params.price - halfWidth,
    upper: params.price + halfWidth,
    points: params.tier.points,
    openedAt: params.now,
    expiresAt: params.now + (params.durationMs ?? RANGE_ROUND_MS),
    status: 'active',
    resolvedAt: null,
  }
}

export function settleRangeArcadeBand(params: {
  band: RangeArcadeBand
  price: number | null
  fresh: boolean
  now: number
}): RangeArcadeBand {
  if (params.band.status !== 'active' || params.now < params.band.expiresAt) {
    return params.band
  }
  if (!params.fresh || params.price == null || !Number.isFinite(params.price)) {
    return {
      ...params.band,
      status: 'void',
      resolvedAt: params.now,
    }
  }
  const won = params.price > params.band.lower && params.price <= params.band.upper
  return {
    ...params.band,
    status: won ? 'won' : 'lost',
    resolvedAt: params.now,
  }
}

