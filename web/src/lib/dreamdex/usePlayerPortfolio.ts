import { useCallback, useEffect, useRef, useState } from 'react'
import { getDreamDexExchange } from './client'
import type { ClaimablePosition, Portfolio } from '@somnia-chain/markets-sdk'
import type { Address } from 'viem'


export type PlayerPortfolioState = {
  phase: 'idle' | 'loading' | 'ready' | 'error'
  portfolio: Portfolio | null
  claimable: Array<ClaimablePosition>
  refreshedAt: number | null
  error: string | null
}

const EMPTY: PlayerPortfolioState = {
  phase: 'idle',
  portfolio: null,
  claimable: [],
  refreshedAt: null,
  error: null,
}

/**
 * Read-only DreamDEX portfolio adapter for Pumpy's player menu. Financial data
 * stays sourced from the venue indexer and contracts; the menu never infers a
 * position from its own animation or local game state.
 */
export function usePlayerPortfolio(address: Address | null, enabled = true) {
  const [state, setState] = useState<PlayerPortfolioState>(EMPTY)
  const requestRef = useRef(0)

  const refresh = useCallback(async () => {
    if (!address || !enabled) return
    const request = ++requestRef.current
    setState((current) => ({ ...current, phase: current.portfolio ? 'ready' : 'loading', error: null }))
    try {
      const client = getDreamDexExchange().client
      const [portfolio, claimable] = await Promise.all([
        client.getPortfolio(address, { ordersLimit: 20, tradesLimit: 40 }),
        client.getClaimable(address),
      ])
      if (request !== requestRef.current) return
      setState({
        phase: 'ready',
        portfolio,
        claimable,
        refreshedAt: Date.now(),
        error: null,
      })
    } catch (cause) {
      if (request !== requestRef.current) return
      setState((current) => ({
        ...current,
        phase: 'error',
        error: cause instanceof Error ? cause.message : 'Could not load DreamDEX portfolio',
      }))
    }
  }, [address, enabled])

  useEffect(() => {
    if (!address || !enabled) {
      requestRef.current += 1
      setState(EMPTY)
      return
    }
    void refresh()
    const timer = window.setInterval(() => void refresh(), 15_000)
    return () => window.clearInterval(timer)
  }, [address, enabled, refresh])

  return { ...state, refresh }
}
