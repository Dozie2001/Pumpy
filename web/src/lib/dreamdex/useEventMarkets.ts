import { useCallback, useEffect, useMemo, useState } from 'react'

import { discoverEventMarkets, watchEventMarket } from './adapter'
import { selectPumpyMarket } from './normalize'
import type {
  EventMarketsState,
  MarketConnection,
  PumpyBookQuote,
  PumpyEventMarket,
} from './types'

const DISCOVERY_REFRESH_MS = 15_000
const STALE_AFTER_MS = 35_000

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'DreamDEX market discovery failed'
}

export function useEventMarkets(asset: string): EventMarketsState {
  const [markets, setMarkets] = useState<PumpyEventMarket[]>([])
  const [phase, setPhase] = useState<EventMarketsState['phase']>('loading')
  const [error, setError] = useState<string | null>(null)
  const [quote, setQuote] = useState<PumpyBookQuote | null>(null)
  const [connection, setConnection] = useState<MarketConnection>('indexer')
  const [refreshToken, setRefreshToken] = useState(0)

  const refresh = useCallback(async (showLoading = false) => {
    if (showLoading) setPhase('loading')
    try {
      const next = await discoverEventMarkets()
      setMarkets(next)
      setPhase(next.length > 0 ? 'ready' : 'empty')
      setError(null)
    } catch (cause) {
      setError(errorMessage(cause))
      setPhase((current) => (markets.length > 0 ? current : 'error'))
    }
  }, [markets.length])

  useEffect(() => {
    void refresh(true)
    const interval = window.setInterval(() => void refresh(), DISCOVERY_REFRESH_MS)
    return () => window.clearInterval(interval)
  }, [refresh, refreshToken])

  const selected = useMemo(
    () => selectPumpyMarket(markets, asset),
    [asset, markets],
  )

  useEffect(() => {
    setQuote(null)
    setConnection('indexer')
    if (!selected) return

    let stopped = false
    let stopWatch: (() => void) | undefined
    let lastLiveUpdate = Date.now()
    const staleTimer = window.setInterval(() => {
      if (Date.now() - lastLiveUpdate > STALE_AFTER_MS) setConnection('stale')
    }, 5_000)

    void watchEventMarket(selected, (snapshot) => {
      if (stopped) return
      lastLiveUpdate = Date.now()
      setConnection(snapshot.live ? 'live' : 'stale')
      setQuote(snapshot.quote)
      setMarkets((current) =>
        current.map((market) =>
          market.marketId === snapshot.market.marketId
            ? snapshot.market
            : market,
        ),
      )
    })
      .then((stop) => {
        if (stopped) stop()
        else stopWatch = stop
      })
      .catch(() => {
        if (!stopped) setConnection('stale')
      })

    return () => {
      stopped = true
      window.clearInterval(staleTimer)
      stopWatch?.()
    }
  }, [selected?.marketId])

  return {
    phase: phase === 'ready' && !selected ? 'empty' : phase,
    markets,
    selected,
    quote,
    connection,
    error,
    retry: () => setRefreshToken((value) => value + 1),
  }
}
