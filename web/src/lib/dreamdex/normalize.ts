import { minimumMarketHeadroomSeconds } from './trade-safety'
import type {
  BinaryMarket,
  BinaryMarketStatus,
  Erc20Metadata,
} from '@somnia-chain/markets-sdk'

import type { PumpyEventMarket, PumpyMarketStatus } from './types'

const STATUS_MAP: Record<BinaryMarketStatus, PumpyMarketStatus> = {
  Listed: 'upcoming',
  Trading: 'trading',
  Locked: 'locked',
  Settling: 'settling',
  Resolved: 'resolved',
  Voided: 'voided',
  Finalized: 'finalized',
}

function lifecycleAt(
  market: BinaryMarket,
  nowSeconds: number,
): PumpyMarketStatus {
  const startsAt = Number(market.tradingStart)
  const expiresAt = Number(market.expiry)

  // Listed -> Trading -> Settling can happen by time without a status event.
  if (market.status === 'Listed' || market.status === 'Trading') {
    if (nowSeconds < startsAt) return 'upcoming'
    if (nowSeconds < expiresAt) return 'trading'
    return 'settling'
  }

  return STATUS_MAP[market.status]
}

function isTradingAt(market: PumpyEventMarket, nowSeconds: number): boolean {
  return (
    (market.status === 'trading' || market.status === 'upcoming') &&
    market.tradingStartsAt <= nowSeconds &&
    market.expiresAt > nowSeconds
  )
}

export function normalizeBinaryMarket(
  market: BinaryMarket,
  nowSeconds = Math.floor(Date.now() / 1_000),
  collateral?: Pick<Erc20Metadata, 'symbol' | 'decimals'>,
  openingPriceRaw?: string | null,
): PumpyEventMarket {
  const intervalSeconds = market.intervalSec
    ? Number(market.intervalSec)
    : Number(market.expiry) - Number(market.tradingStart)

  return {
    marketId: market.marketId,
    poolAddress: market.poolAddress,
    marketAddress: market.marketAddress,
    asset: market.asset,
    question: market.question,
    oracleQuestion: market.oracleQuestion,
    reference: market.strike === '0' ? 'opening-price' : 'fixed-strike',
    strikeRaw: market.strike,
    targetPriceRaw:
      market.strike === '0' ? (openingPriceRaw ?? null) : market.strike,
    status: lifecycleAt(market, nowSeconds),
    tradingStartsAt: Number(market.tradingStart),
    expiresAt: Number(market.expiry),
    intervalLabel: market.interval ?? `${intervalSeconds}s`,
    intervalSeconds: Number.isFinite(intervalSeconds) ? intervalSeconds : null,
    operatorId: market.operatorId ?? null,
    venueId: market.venueId ?? null,
    collateralAddress: market.collateral,
    // A decimal count cannot identify a token. Discovery reads ERC-20 metadata
    // from the market's actual collateral address and passes it here.
    collateralSymbol: collateral?.symbol || 'Collateral',
    collateralDecimals: collateral?.decimals ?? market.quoteDecimals,
    yesTokenId: market.yesTokenId,
    noTokenId: market.noTokenId,
  }
}

export function selectPumpyMarket(
  markets: ReadonlyArray<PumpyEventMarket>,
  asset: string,
  nowSeconds = Math.floor(Date.now() / 1_000),
): PumpyEventMarket | null {
  return (
    markets
      .filter(
        (market) =>
          market.asset === asset &&
          isTradingAt(market, nowSeconds) &&
          market.expiresAt >
            nowSeconds + minimumMarketHeadroomSeconds(market.intervalSeconds),
      )
      .sort((a, b) => {
        // Pumpy's clearest arcade prompt is the opening-reference contract. This
        // is a product preference, never a hard-coded venue, pool, or cadence.
        if (a.reference !== b.reference) {
          return a.reference === 'opening-price' ? -1 : 1
        }
        return a.expiresAt - b.expiresAt
      })[0] ?? null
  )
}

export function selectClosingPumpyMarket(
  markets: ReadonlyArray<PumpyEventMarket>,
  asset: string,
  nowSeconds = Math.floor(Date.now() / 1_000),
): PumpyEventMarket | null {
  return (
    markets
      .filter(
        (market) =>
          market.asset === asset &&
          isTradingAt(market, nowSeconds) &&
          market.expiresAt > nowSeconds &&
          market.expiresAt <=
            nowSeconds + minimumMarketHeadroomSeconds(market.intervalSeconds),
      )
      .sort((a, b) => a.expiresAt - b.expiresAt)[0] ?? null
  )
}

export function selectNextPumpyMarket(
  markets: ReadonlyArray<PumpyEventMarket>,
  asset: string,
  nowSeconds = Math.floor(Date.now() / 1_000),
): PumpyEventMarket | null {
  return (
    markets
      .filter(
        (market) =>
          market.asset === asset &&
          market.status === 'upcoming' &&
          market.tradingStartsAt > nowSeconds,
      )
      .sort((a, b) => a.tradingStartsAt - b.tradingStartsAt)[0] ?? null
  )
}

export function marketAssets(
  markets: ReadonlyArray<PumpyEventMarket>,
): Array<string> {
  return [...new Set(markets.map((market) => market.asset))].sort()
}
