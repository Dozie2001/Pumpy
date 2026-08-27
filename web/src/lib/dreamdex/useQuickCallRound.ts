import { SOMNIA_TESTNET_ADDRESSES, erc6909Abi } from '@somnia-chain/markets-sdk'
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
  PlayerCashoutOutcome,
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
  phase:
    'idle' | 'loading' | 'ready' | 'authorizing-claim' | 'claiming' | 'error'
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
        targetPriceRaw:
          round.reference === 'fixed-strike'
            ? round.strikeRaw
            : (resolution?.openingAnswer?.numericValue ??
              round.targetPriceRaw ??
              null),
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
      game?: QuickCallRound['game']
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
      const client = getDreamDexExchange().client
      const module = SOMNIA_TESTNET_ADDRESSES.binaryModule
      if (!module) throw new Error('DreamDEX claim module is not configured')
      const onchain = await client.getMarketOnchain(round.marketId)
      const publicClient = client.getViemClient()
      const isOperator = await publicClient.readContract({
        address: onchain.outcomeToken,
        abi: erc6909Abi,
        functionName: 'isOperator',
        args: [params.session.address, module],
      })
      if (!isOperator) {
        setState((current) => ({
          ...current,
          phase: 'authorizing-claim',
          error: null,
        }))
        const approvalHash = await params.session.walletClient.writeContract({
          account: params.session.address,
          chain: params.session.walletClient.chain,
          address: onchain.outcomeToken,
          abi: erc6909Abi,
          functionName: 'setOperator',
          args: [module, true],
        })
        const approvalReceipt = await publicClient.waitForTransactionReceipt({
          hash: approvalHash,
        })
        if (approvalReceipt.status !== 'success') {
          throw new Error('The one-time claim authorization reverted')
        }
        const stillClaimable = await client.getClaimable(params.session.address)
        const refreshedClaim = stillClaimable.find(
          (entry) =>
            entry.marketId.toLowerCase() === round.marketId.toLowerCase() &&
            entry.outcomeIdx === round.outcomeIndex,
        )
        if (!refreshedClaim || refreshedClaim.amount < snapshot.claimableRaw) {
          throw new Error(
            'Claimability changed after authorization; refresh the position',
          )
        }
        setState((current) => ({
          ...current,
          phase: 'claiming',
          error: null,
        }))
      }

      const trader = client.createTrader({
        walletClient: params.session.walletClient,
        decimals: round.collateralDecimals,
      })
      const result = await trader.redeem({
        marketId: round.marketId,
        amount: snapshot.claimableRaw,
        outcomeIdx: round.outcomeIndex,
        operatorId: round.operatorId ?? undefined,
        venueId: round.venueId ?? undefined,
        outcomeToken: onchain.outcomeToken,
        autoApprove: false,
      })
      if (result.receipt.status !== 'success') {
        throw new Error('The DreamDEX claim transaction reverted')
      }
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

  const recordCashout = useCallback((outcome: PlayerCashoutOutcome) => {
    const round = stateRef.current.round
    if (
      !round ||
      outcome.status !== 'filled' ||
      outcome.filledQuantityRaw < BigInt(round.filledQuantityRaw) ||
      typeof window === 'undefined'
    )
      return
    const cashedOut: QuickCallRound = {
      ...round,
      cashoutHash: outcome.hash,
      cashoutProceedsRaw: outcome.proceedsRaw.toString(),
      cashedOutAt: Date.now(),
    }
    writeQuickCallRound(window.localStorage, cashedOut)
    setState((current) => ({
      ...current,
      round: cashedOut,
      snapshot: current.snapshot
        ? { ...current.snapshot, positionRaw: 0n, phase: 'cashed-out' }
        : null,
      phase: 'ready',
      error: null,
    }))
  }, [])

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
    recordCashout,
    clear,
  }
}

function isWalletRejection(cause: unknown): boolean {
  if (!cause || typeof cause !== 'object') return false
  if ('code' in cause && cause.code === 4_001) return true
  if ('cause' in cause) return isWalletRejection(cause.cause)
  return false
}
