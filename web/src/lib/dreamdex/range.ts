import { minimumMarketHeadroomSeconds } from './trade-safety'
import type {
  PreparedPlayerRangeTrade,
  PumpyEventMarket,
  PumpyRangePair,
} from './types'

function isTradingAt(market: PumpyEventMarket, nowSeconds: number): boolean {
  return (
    market.status === 'trading' &&
    market.tradingStartsAt <= nowSeconds &&
    market.expiresAt >
      nowSeconds + minimumMarketHeadroomSeconds(market.intervalSeconds)
  )
}

function sameNullable<T>(left: T | null, right: T | null): boolean {
  return left === right
}

function rangeGroupKey(market: PumpyEventMarket): string {
  return [
    market.asset,
    market.expiresAt,
    market.collateralAddress.toLowerCase(),
    market.collateralDecimals,
    market.venueId?.toLowerCase() ?? 'none',
    market.operatorId ?? 'none',
  ].join('|')
}

/**
 * Return adjacent, compatible fixed strikes. Adjacency avoids overlapping
 * bands and ensures a venue with three strikes yields the two truthful ranges
 * it actually lists rather than inventing every possible visual combination.
 */
export function selectFixedStrikeRangePairs(
  markets: ReadonlyArray<PumpyEventMarket>,
  asset: string,
  nowSeconds = Math.floor(Date.now() / 1_000),
): Array<PumpyRangePair> {
  const groups = new Map<string, Array<PumpyEventMarket>>()

  for (const market of markets) {
    if (
      market.asset !== asset ||
      market.reference !== 'fixed-strike' ||
      !/^\d+$/.test(market.strikeRaw) ||
      BigInt(market.strikeRaw) <= 0n ||
      !isTradingAt(market, nowSeconds)
    ) {
      continue
    }
    const key = rangeGroupKey(market)
    groups.set(key, [...(groups.get(key) ?? []), market])
  }

  const pairs: Array<PumpyRangePair> = []
  for (const group of groups.values()) {
    const ordered = [...group].sort((left, right) => {
      const leftStrike = BigInt(left.strikeRaw)
      const rightStrike = BigInt(right.strikeRaw)
      return leftStrike < rightStrike ? -1 : leftStrike > rightStrike ? 1 : 0
    })

    for (let index = 0; index < ordered.length - 1; index += 1) {
      const lower = ordered[index]
      const upper = ordered[index + 1]
      if (
        lower.marketId === upper.marketId ||
        lower.poolAddress.toLowerCase() === upper.poolAddress.toLowerCase() ||
        lower.expiresAt !== upper.expiresAt ||
        lower.collateralAddress.toLowerCase() !==
          upper.collateralAddress.toLowerCase() ||
        lower.collateralDecimals !== upper.collateralDecimals ||
        !sameNullable(lower.venueId, upper.venueId) ||
        !sameNullable(lower.operatorId, upper.operatorId)
      ) {
        continue
      }
      pairs.push({ lower, upper, expiresAt: lower.expiresAt })
    }
  }

  return [...pairs].sort(
    (left, right) =>
      left.expiresAt - right.expiresAt ||
      (BigInt(left.upper.strikeRaw) - BigInt(left.lower.strikeRaw) <
      BigInt(right.upper.strikeRaw) - BigInt(right.lower.strikeRaw)
        ? -1
        : 1),
  )
}

export function rangePayoffAtSettlement(params: {
  lowerStrikeRaw: bigint
  upperStrikeRaw: bigint
  settlementPriceRaw: bigint
  quantityRaw: bigint
}): bigint {
  const inside =
    params.settlementPriceRaw >= params.lowerStrikeRaw &&
    params.settlementPriceRaw < params.upperStrikeRaw
  return inside ? params.quantityRaw * 2n : params.quantityRaw
}

export function rangeMaximumLoss(
  maximumCostRaw: bigint,
  outsidePayoutRaw: bigint,
): bigint {
  return maximumCostRaw > outsidePayoutRaw
    ? maximumCostRaw - outsidePayoutRaw
    : 0n
}

export function isPreparedRangeTradeFresh(
  trade: PreparedPlayerRangeTrade,
  nowMs = Date.now(),
): boolean {
  return nowMs <= trade.validUntil
}

export function gcd(left: bigint, right: bigint): bigint {
  let a = left < 0n ? -left : left
  let b = right < 0n ? -right : right
  while (b !== 0n) [a, b] = [b, a % b]
  return a
}

export function lcm(left: bigint, right: bigint): bigint {
  if (left === 0n || right === 0n) return 0n
  return (left / gcd(left, right)) * right
}
