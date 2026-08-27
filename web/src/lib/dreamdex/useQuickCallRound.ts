import { useCallback, useEffect, useRef, useState } from 'react'

import { getDreamDexExchange } from './client'
import {
  createQuickCallRound,
  deriveQuickCallSnapshot,
  readQuickCallRound,
  removeQuickCallRound,
  writeQuickCallRound,
} from './quickCall'
import type { QuickCallChainSnapshot } from './quickCall'
import type {
  PlayerOrderOutcome,
  PlayerWalletSession,
  PreparedPlayerTrade,
  PumpyEventMarket,
  QuickCallRound,
} from './types'
import type { Address } from 'viem'

type QuickCallState = {
  round: QuickCallRound | null
  snapshot: QuickCallChainSnapshot | null
  phase: 'idle' | 'loading' | 'ready' | 'claiming' | 'error'
  error: string | null
}

const EMPTY: QuickCallState = {
  round: null,
  snapshot: null,
  phase: 'idle',
  error: null,
}

export function useQuickCallRound(params: {
  address: Address | null
  session: PlayerWalletSession | null
}) {
  const [state, setState] = useState<QuickCallState>(EMPTY)
  const stateRef = useRef(state)
  stateRef.current = state

  const reconcile = useCallback(async () => {
    const round = stateRef.current.round
    if (!round || !params.address) return
    setState((current) => ({
      ...current,
      phase: current.snapshot ? 'ready' : 'loading',
      error: null,
    }))
    try {
      const client = getDreamDexExchange().client
      const [portfolio, claimable, resolution] = await Promise.all([
        client.getPortfolio(params.address, {
          ordersLimit: 0,
          tradesLimit: 0,
        }),
        client.getClaimable(params.address).catch(() => []),
        client.getMarketResolution(round.marketId).catch(() => null),
      ])
      const positions = portfolio.positions.filter(
        (position) =>
          position.market.id.toLowerCase() === round.marketId.toLowerCase() &&
          position.outcomeIndex === round.outcomeIndex,
      )
      const claim = claimable.find(
        (entry) =>
          entry.marketId.toLowerCase() === round.marketId.toLowerCase() &&
          entry.outcomeIdx === round.outcomeIndex,
      )
      const event = resolution
        ? [...resolution.events]
            .reverse()
            .find((entry) => entry.kind.toLowerCase() === 'resolved')
        : undefined
      const snapshot = deriveQuickCallSnapshot({
        round,
        positionRaw: positions.reduce(
          (total, position) => total + BigInt(position.balance),
          0n,
        ),
        claimableRaw: claim?.amount ?? 0n,
        estimatedPayoutRaw: claim?.estPayout ?? 0n,
        winningOutcome: event?.winningOutcome ?? null,
        voided: event?.voided === true,
        resolutionHash: event?.txHash ?? null,
      })
      setState({ round, snapshot, phase: 'ready', error: null })
    } catch (cause) {
      setState((current) => ({
        ...current,
        phase: 'error',
        error:
          cause instanceof Error
            ? cause.message
            : 'Could not refresh this position',
      }))
    }
  }, [params.address])

  useEffect(() => {
    if (!params.address || typeof window === 'undefined') {
      setState(EMPTY)
      return
    }
    const round = readQuickCallRound(window.localStorage, params.address)
    setState(round ? { ...EMPTY, round, phase: 'loading' } : EMPTY)
  }, [params.address])

  useEffect(() => {
    if (!state.round) return
    void reconcile()
    const timer = window.setInterval(() => void reconcile(), 10_000)
    return () => window.clearInterval(timer)
  }, [reconcile, state.round?.marketId])

  const recordOrder = useCallback(
    (input: {
      market: PumpyEventMarket
      trade: PreparedPlayerTrade
      outcome: PlayerOrderOutcome
    }) => {
      if (!params.address || typeof window === 'undefined') return
      const round = createQuickCallRound({
        account: params.address,
        ...input,
      })
      writeQuickCallRound(window.localStorage, round)
      setState({ round, snapshot: null, phase: 'loading', error: null })
    },
    [params.address],
  )

  const claim = useCallback(async () => {
    const { round, snapshot } = stateRef.current
    if (!round || !snapshot || !params.session) return
    if (
      (snapshot.phase !== 'claimable' && snapshot.phase !== 'voided') ||
      snapshot.claimableRaw <= 0n
    )
      return
    setState((current) => ({ ...current, phase: 'claiming', error: null }))
    try {
      const trader = getDreamDexExchange().client.createTrader({
        walletClient: params.session.walletClient,
        decimals: round.collateralDecimals,
      })
      const result = await trader.redeem({
        marketId: round.marketId,
        amount: snapshot.claimableRaw,
        outcomeIdx: round.outcomeIndex,
        operatorId: round.operatorId ?? undefined,
        venueId: round.venueId ?? undefined,
        autoApprove: true,
      })
      const claimed = {
        ...round,
        claimHash: result.hash,
        claimedAt: Date.now(),
      }
      writeQuickCallRound(window.localStorage, claimed)
      setState({
        round: claimed,
        snapshot: { ...snapshot, phase: 'claimed' },
        phase: 'ready',
        error: null,
      })
    } catch (cause) {
      if (isWalletRejection(cause)) {
        setState((current) => ({ ...current, phase: 'ready', error: null }))
        return
      }
      setState((current) => ({
        ...current,
        phase: 'error',
        error: cause instanceof Error ? cause.message : 'Claim failed',
      }))
    }
  }, [params.session])

  const clear = useCallback(() => {
    if (params.address && typeof window !== 'undefined') {
      removeQuickCallRound(window.localStorage, params.address)
    }
    setState(EMPTY)
  }, [params.address])

  return {
    ...state,
    recordOrder,
    refresh: reconcile,
    claim,
    clear,
  }
}

function isWalletRejection(cause: unknown): boolean {
  if (!cause || typeof cause !== 'object') return false
  if ('code' in cause && cause.code === 4_001) return true
  if ('cause' in cause) return isWalletRejection(cause.cause)
  return false
}
