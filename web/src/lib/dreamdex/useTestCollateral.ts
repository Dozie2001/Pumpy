import { useCallback, useEffect, useState } from 'react'
import {
  DREAMDEX_TEST_COLLATERAL_ADDRESS,
  isDreamDexTestCollateral,
  mintTestCollateral,
  readTestCollateral,
} from './testCollateral'
import type { Hash } from 'viem'

import type { TestCollateralSnapshot } from './testCollateral'
import type { PlayerWalletState, PumpyEventMarket } from './types'

type TestCollateralPhase =
  'idle' | 'loading' | 'ready' | 'minting' | 'success' | 'error'

function faucetError(error: unknown): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    Number(error.code) === 4_001
  ) {
    return 'The tUSDC transaction was rejected in your wallet'
  }
  if (typeof error === 'object' && error !== null && 'cause' in error) {
    const nested = faucetError(error.cause)
    if (nested !== 'Could not get test tUSDC') return nested
  }
  if (
    typeof error === 'object' &&
    error !== null &&
    'shortMessage' in error &&
    typeof error.shortMessage === 'string'
  ) {
    return error.shortMessage
  }
  return error instanceof Error ? error.message : 'Could not get test tUSDC'
}

export function useTestCollateral({
  market,
  wallet,
}: {
  market: PumpyEventMarket | null
  wallet: PlayerWalletState
}) {
  const collateralAddress = DREAMDEX_TEST_COLLATERAL_ADDRESS
  const canMint = market
    ? isDreamDexTestCollateral(market.collateralAddress)
    : false
  const account = wallet.address
  const session = wallet.session
  const [phase, setPhase] = useState<TestCollateralPhase>('idle')
  const [snapshot, setSnapshot] = useState<TestCollateralSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lastHash, setLastHash] = useState<Hash | null>(null)

  const refresh = useCallback(async () => {
    if (!account || wallet.status !== 'connected') {
      setPhase('idle')
      setSnapshot(null)
      return
    }

    setPhase('loading')
    setError(null)
    try {
      const next = await readTestCollateral(collateralAddress, account)
      setSnapshot(next)
      setPhase('ready')
    } catch (cause) {
      setError(faucetError(cause))
      setPhase('error')
    }
  }, [account, wallet.status])

  useEffect(() => {
    let active = true
    if (!account || wallet.status !== 'connected') {
      setPhase('idle')
      setSnapshot(null)
      return
    }

    setPhase('loading')
    setError(null)
    setLastHash(null)
    void readTestCollateral(collateralAddress, account)
      .then((next) => {
        if (!active) return
        setSnapshot(next)
        setPhase('ready')
      })
      .catch((cause) => {
        if (!active) return
        setError(faucetError(cause))
        setPhase('error')
      })
    return () => {
      active = false
    }
  }, [account, wallet.status])

  const mint = useCallback(async () => {
    if (!canMint || !session || wallet.status !== 'connected') return
    setPhase('minting')
    setError(null)
    try {
      const result = await mintTestCollateral(collateralAddress, session)
      setSnapshot(result)
      setLastHash(result.hash)
      setPhase('success')
    } catch (cause) {
      setError(faucetError(cause))
      setPhase('error')
    }
  }, [canMint, collateralAddress, session, wallet.status])

  return { phase, snapshot, error, lastHash, canMint, mint, refresh }
}
