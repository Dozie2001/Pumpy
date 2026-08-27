import { useCallback, useEffect, useState } from 'react'

import { watchEventMarket } from './adapter'
import { preparePlayerRangeTrade } from './rangeTrade'
import type { Address } from 'viem'
import type { PreparedPlayerRangeTrade, PumpyRangePair } from './types'

export type PlayerRangeQuoteState = {
  phase: 'idle' | 'watching' | 'loading' | 'ready' | 'error'
  quote: PreparedPlayerRangeTrade | null
  error: string | null
  live: boolean
  refresh: () => void
}

export function usePlayerRangeQuote(params: {
  pair: PumpyRangePair | null
  budget: number
  account: Address | null
  enabled: boolean
}): PlayerRangeQuoteState {
  const [phase, setPhase] = useState<PlayerRangeQuoteState['phase']>('idle')
  const [quote, setQuote] = useState<PreparedPlayerRangeTrade | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lowerLive, setLowerLive] = useState(false)
  const [upperLive, setUpperLive] = useState(false)
  const [refreshToken, setRefreshToken] = useState(0)
  const refresh = useCallback(() => setRefreshToken((value) => value + 1), [])

  useEffect(() => {
    setQuote(null)
    setError(null)
    setLowerLive(false)
    setUpperLive(false)
    if (!params.enabled || !params.pair) {
      setPhase('idle')
      return
    }

    setPhase('watching')
    let stopped = false
    const stops: Array<() => void> = []
    const watch = async () => {
      try {
        const [stopLower, stopUpper] = await Promise.all([
          watchEventMarket(params.pair!.lower, (snapshot) => {
            if (stopped) return
            setLowerLive(snapshot.live)
          }),
          watchEventMarket(params.pair!.upper, (snapshot) => {
            if (stopped) return
            setUpperLive(snapshot.live)
          }),
        ])
        if (stopped) {
          stopLower()
          stopUpper()
        } else {
          stops.push(stopLower, stopUpper)
        }
      } catch (cause) {
        if (!stopped) {
          setPhase('error')
          setError(
            cause instanceof Error
              ? cause.message
              : 'Could not watch both Range books',
          )
        }
      }
    }
    void watch()
    return () => {
      stopped = true
      stops.forEach((stop) => stop())
    }
  }, [params.enabled, params.pair?.lower.marketId, params.pair?.upper.marketId])

  useEffect(() => {
    if (!params.enabled || !params.pair || !lowerLive || !upperLive) return
    let stopped = false
    const load = async () => {
      setPhase('loading')
      try {
        const next = await preparePlayerRangeTrade({
          pair: params.pair!,
          budget: String(params.budget),
          account: params.account ?? undefined,
        })
        if (!stopped) {
          setQuote(next)
          setError(null)
          setPhase('ready')
        }
      } catch (cause) {
        if (!stopped) {
          setQuote(null)
          setError(
            cause instanceof Error
              ? cause.message
              : 'Could not prepare the two-leg Range quote',
          )
          setPhase('error')
        }
      }
    }
    void load()
    const timer = window.setInterval(load, 10_000)
    return () => {
      stopped = true
      window.clearInterval(timer)
    }
  }, [
    lowerLive,
    params.account,
    params.budget,
    params.enabled,
    params.pair?.lower.marketId,
    params.pair?.upper.marketId,
    refreshToken,
    upperLive,
  ])

  return {
    phase,
    quote,
    error,
    live: lowerLive && upperLive,
    refresh,
  }
}
