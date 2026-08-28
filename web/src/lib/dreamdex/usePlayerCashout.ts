import { useCallback, useEffect, useRef, useState } from 'react'

import { getDreamDexExchange } from './client'
import { isFullCashoutQuote } from './trade-safety'
import {
  PlayerCashoutError,
  placePreparedPlayerCashout,
  preparePlayerCashout,
} from './trade'
import type {
  PlayerCashoutOutcome,
  PlayerWalletSession,
  PreparedPlayerCashout,
  QuickCallRound,
} from './types'

export type CashoutPhase =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'checking'
  | 'batching'
  | 'approving'
  | 'refreshing'
  | 'submitting'
  | 'unavailable'
  | 'error'

type CashoutState = {
  phase: CashoutPhase
  quote: PreparedPlayerCashout | null
  outcome: PlayerCashoutOutcome | null
  error: string | null
  authorizationRequired: boolean | null
}

const EMPTY: CashoutState = {
  phase: 'idle',
  quote: null,
  outcome: null,
  error: null,
  authorizationRequired: null,
}

function isBusyPhase(phase: CashoutPhase): boolean {
  return (
    phase === 'checking' ||
    phase === 'batching' ||
    phase === 'approving' ||
    phase === 'refreshing' ||
    phase === 'submitting'
  )
}

export function usePlayerCashout(params: {
  round: QuickCallRound | null
  positionRaw: bigint
  session: PlayerWalletSession | null
  enabled: boolean
}) {
  const [state, setState] = useState<CashoutState>(EMPTY)
  const stateRef = useRef(state)
  const refreshing = useRef(false)
  stateRef.current = state

  const refresh = useCallback(async () => {
    if (!params.enabled || !params.round || params.positionRaw <= 0n) {
      setState(EMPTY)
      return
    }
    if (isBusyPhase(stateRef.current.phase)) return
    if (refreshing.current) return
    refreshing.current = true
    setState((current) => ({
      ...current,
      phase: current.quote ? 'ready' : 'loading',
      error: null,
      authorizationRequired: null,
    }))
    try {
      const quote = await preparePlayerCashout({
        round: params.round,
        positionRaw: params.positionRaw,
      })
      setState((current) => ({
        phase: 'ready',
        quote,
        outcome: current.outcome,
        error: null,
        authorizationRequired: null,
      }))
    } catch (cause) {
      const unavailable =
        cause instanceof PlayerCashoutError &&
        (cause.code === 'NO_LIQUIDITY' || cause.code === 'BOOK_NOT_LIVE')
      setState((current) => ({
        ...current,
        phase: unavailable ? 'unavailable' : 'error',
        quote: unavailable ? null : current.quote,
        error:
          cause instanceof Error
            ? cause.message
            : 'Could not read the live exit book',
        authorizationRequired: null,
      }))
    } finally {
      refreshing.current = false
    }
  }, [params.enabled, params.positionRaw, params.round])

  useEffect(() => {
    if (!params.enabled || !params.round) {
      setState(EMPTY)
      return
    }
    const client = getDreamDexExchange().client
    let stopped = false
    let stopWatch: (() => void) | undefined
    void client
      .watchMarket(params.round.poolAddress)
      .then((handle) => {
        if (stopped) handle.stop()
        else {
          stopWatch = () => handle.stop()
          void refresh()
        }
      })
      .catch(() => {
        if (!stopped) {
          setState({
            ...EMPTY,
            phase: 'unavailable',
            error: 'The DreamDEX exit book is not live yet',
          })
        }
      })
    const timer = window.setInterval(() => void refresh(), 3_000)
    return () => {
      stopped = true
      window.clearInterval(timer)
      stopWatch?.()
    }
  }, [params.enabled, params.round?.marketId, refresh])

  const cashOut =
    useCallback(async (): Promise<PlayerCashoutOutcome | null> => {
      const quote = stateRef.current.quote
      if (!params.round || !params.session || !quote) return null
      if (isBusyPhase(stateRef.current.phase)) return null
      if (
        !isFullCashoutQuote({
          positionRaw: quote.positionRaw,
          quotedQuantityRaw: quote.quantityRaw,
          fillableQuantityRaw: quote.fillableQuantityRaw,
        })
      ) {
        setState((current) => ({
          ...current,
          phase: 'unavailable',
          error: 'The live book cannot absorb the full position yet',
        }))
        return null
      }

      setState((current) => ({
        ...current,
        phase: 'checking',
        outcome: null,
        error: null,
        authorizationRequired: null,
      }))
      try {
        const outcome = await placePreparedPlayerCashout({
          cashout: quote,
          round: params.round,
          wallet: params.session,
          onWalletStep: (step) =>
            setState((current) => ({
              ...current,
              phase:
                step === 'batching'
                  ? 'batching'
                  : step === 'approving'
                    ? 'approving'
                    : step === 'refreshing'
                      ? 'refreshing'
                      : 'submitting',
              authorizationRequired:
                step === 'batching'
                  ? true
                  : step === 'approving'
                    ? true
                    : step === 'placing'
                      ? (current.authorizationRequired ?? false)
                      : current.authorizationRequired,
            })),
        })
        if (outcome.status !== 'filled') {
          setState((current) => ({
            ...current,
            phase: 'error',
            outcome,
            error:
              outcome.status === 'partial'
                ? 'Only part of the position sold. Refreshing the remaining onchain balance.'
                : 'The exit order did not fill. Your position remains open.',
            authorizationRequired: null,
          }))
          return outcome
        }
        setState({
          phase: 'ready',
          quote: null,
          outcome,
          error: null,
          authorizationRequired: null,
        })
        return outcome
      } catch (cause) {
        if (isWalletRejection(cause)) {
          setState((current) => ({
            ...current,
            phase: 'ready',
            error: null,
            authorizationRequired: null,
          }))
          return null
        }
        setState((current) => ({
          ...current,
          phase: 'error',
          error:
            cause instanceof Error
              ? cause.message
              : 'The cash out did not complete',
          authorizationRequired: null,
        }))
        if (
          cause instanceof PlayerCashoutError &&
          cause.code === 'STALE_QUOTE'
        ) {
          window.setTimeout(() => void refresh(), 0)
        }
        return null
      }
    }, [params.round, params.session, refresh])

  return {
    ...state,
    fullExitAvailable:
      state.quote !== null &&
      isFullCashoutQuote({
        positionRaw: state.quote.positionRaw,
        quotedQuantityRaw: state.quote.quantityRaw,
        fillableQuantityRaw: state.quote.fillableQuantityRaw,
      }),
    refresh,
    cashOut,
  }
}

function isWalletRejection(cause: unknown): boolean {
  if (!cause || typeof cause !== 'object') return false
  if ('code' in cause && cause.code === 4_001) return true
  return 'cause' in cause ? isWalletRejection(cause.cause) : false
}
