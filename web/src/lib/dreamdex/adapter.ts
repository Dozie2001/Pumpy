import { isBinaryMarket } from '@somnia-chain/markets-sdk'
import { getDreamDexExchange } from './client'
import { normalizeBinaryMarket } from './normalize'
import type { Erc20Metadata, WatchHandle } from '@somnia-chain/markets-sdk'
import type { Address } from 'viem'

import type { PumpyBookQuote, PumpyEventMarket } from './types'

const DISCOVERY_LIMIT = 100
const collateralMetadata = new Map<string, Promise<Erc20Metadata>>()

function readCollateralMetadata(address: Address): Promise<Erc20Metadata> {
  const key = address.toLowerCase()
  const cached = collateralMetadata.get(key)
  if (cached) return cached

  const request = getDreamDexExchange()
    .client.getErc20Metadata(address)
    .catch((error) => {
      collateralMetadata.delete(key)
      throw error
    })
  collateralMetadata.set(key, request)
  return request
}

export async function discoverEventMarkets(): Promise<Array<PumpyEventMarket>> {
  const rows = await getDreamDexExchange().client.listLiveBinaryMarkets({
    limit: DISCOVERY_LIMIT,
    orderBy: 'closingSoon',
  })
  const nowSeconds = Math.floor(Date.now() / 1_000)

  const normalized = await Promise.all(
    rows.map(async (row) => {
      const metadata = await readCollateralMetadata(row.collateral).catch(
        () => undefined,
      )
      return normalizeBinaryMarket(row, nowSeconds, metadata)
    }),
  )

  return normalized.filter(
    (market) => market.status === 'trading' || market.status === 'upcoming',
  )
}

function probabilityFromRaw(raw: bigint, decimals: number): number {
  return Number(raw) / 10 ** decimals
}

export type MarketWatchSnapshot = {
  market: PumpyEventMarket
  quote: PumpyBookQuote
  live: boolean
}

export async function watchEventMarket(
  market: PumpyEventMarket,
  listener: (snapshot: MarketWatchSnapshot) => void,
): Promise<() => void> {
  const client = getDreamDexExchange().client
  let handle: WatchHandle | null = await client.watchMarket(market.poolAddress)

  const emit = () => {
    const liveMarket = client.getLiveMarketByPool(market.poolAddress)
    if (
      !liveMarket ||
      !isBinaryMarket(liveMarket) ||
      liveMarket.marketId !== market.marketId
    ) {
      return
    }

    const book = client.getLiveBinaryOrderBookByMarket(market.marketId, {
      depth: 1,
    })
    listener({
      market: normalizeBinaryMarket(liveMarket, undefined, {
        symbol: market.collateralSymbol,
        decimals: market.collateralDecimals,
      }),
      quote: {
        yesAsk: book.yesAsks[0]
          ? probabilityFromRaw(book.yesAsks[0].price, liveMarket.quoteDecimals)
          : null,
        noAsk: book.noAsks[0]
          ? probabilityFromRaw(book.noAsks[0].price, liveMarket.quoteDecimals)
          : null,
        observedAt: Date.now(),
      },
      live: client.getLiveStatus().wsConnected,
    })
  }

  const unsubscribe = client.subscribeLive(emit)
  emit()

  return () => {
    unsubscribe()
    handle?.stop()
    handle = null
  }
}
