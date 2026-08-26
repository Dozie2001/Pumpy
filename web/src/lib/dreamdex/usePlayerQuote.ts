import { useCallback, useEffect, useState } from 'react'
import { preparePlayerTrade } from './trade'
import type { Address } from 'viem'

import type { PlayerSide, PreparedPlayerTrade, PumpyEventMarket } from './types'

type PlayerQuoteState = {
  phase: 'idle' | 'loading' | 'ready' | 'error'
  quote: PreparedPlayerTrade | null
  error: string | null
  refresh: () => void
}

export function usePlayerQuote(params: {
  market: PumpyEventMarket | null
  side: PlayerSide | null
  stake: number
  account: Address | null
  enabled: boolean
}): PlayerQuoteState {
  const [phase, setPhase] = useState<PlayerQuoteState['phase']>('idle')
  const [quote, setQuote] = useState<PreparedPlayerTrade | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refreshToken, setRefreshToken] = useState(0)

  const refresh = useCallback(() => setRefreshToken((value) => value + 1), [])

  useEffect(() => {
    if (!params.enabled || !params.market || !params.side) {
      setPhase('idle')
      setQuote(null)
      setError(null)
      return
    }

    let stopped = false
    const load = async () => {
      setPhase('loading')
      try {
        const next = await preparePlayerTrade({
          market: params.market!,
          side: params.side!,
          stake: String(params.stake),
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
            cause instanceof Error ? cause.message : 'Could not prepare trade',
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
    params.account,
    params.enabled,
    params.market?.marketId,
    params.side,
    params.stake,
    refreshToken,
  ])

  return { phase, quote, error, refresh }
}
