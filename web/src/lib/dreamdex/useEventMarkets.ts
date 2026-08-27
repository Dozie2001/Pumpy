import { useCallback, useEffect, useMemo, useState } from 'react'

import { discoverEventMarkets, watchEventMarket } from './adapter'
import {
  selectClosingPumpyMarket,
  selectFixedStrikePumpyMarket,
  selectNextPumpyMarket,
  selectPumpyMarket,
} from './normalize'
import type {
  EventMarketsState,
  MarketConnection,
  PumpyBookQuote,
  PumpyEventMarket,
} from './types'

const DISCOVERY_REFRESH_MS = 15_000
const STALE_AFTER_MS = 35_000

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'DreamDEX market discovery failed'
}

export function useEventMarkets(
  asset: string,
  options: {
    reference?: 'default' | 'fixed-strike'
    selectionIndex?: number
  } = {},
): EventMarketsState {
  const [markets, setMarkets] = useState<Array<PumpyEventMarket>>([])
  const [phase, setPhase] = useState<EventMarketsState['phase']>('loading')
  const [error, setError] = useState<string | null>(null)
  const [quote, setQuote] = useState<PumpyBookQuote | null>(null)
  const [connection, setConnection] = useState<MarketConnection>('indexer')
  const [refreshToken, setRefreshToken] = useState(0)
  const [nowSeconds, setNowSeconds] = useState(() =>
    Math.floor(Date.now() / 1_000),
  )

  useEffect(() => {
    const timer = window.setInterval(
      () => setNowSeconds(Math.floor(Date.now() / 1_000)),
      1_000,
    )
    return () => window.clearInterval(timer)
  }, [])

  const refresh = useCallback(
    async (showLoading = false) => {
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
    },
    [markets.length],
  )

  useEffect(() => {
    void refresh(true)
    const interval = window.setInterval(
      () => void refresh(),
      DISCOVERY_REFRESH_MS,
    )
    return () => window.clearInterval(interval)
  }, [refresh, refreshToken])

  const selected = useMemo(
    () =>
      options.reference === 'fixed-strike'
        ? selectFixedStrikePumpyMarket(
            markets,
            asset,
            options.selectionIndex,
            nowSeconds,
          )
        : selectPumpyMarket(markets, asset, nowSeconds),
    [
      asset,
      markets,
      nowSeconds,
      options.reference,
      options.selectionIndex,
    ],
  )
  const closing = useMemo(
    () => selectClosingPumpyMarket(markets, asset, nowSeconds),
    [asset, markets, nowSeconds],
  )
  const next = useMemo(
    () => selectNextPumpyMarket(markets, asset, nowSeconds),
    [asset, markets, nowSeconds],
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
    closing,
    next,
    quote,
    connection,
    error,
    retry: () => setRefreshToken((value) => value + 1),
  }
}
