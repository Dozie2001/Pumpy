import { useCallback, useEffect, useRef, useState } from 'react'
import { parseEther } from 'viem'
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

const MINIMUM_PLAY_GAS = parseEther('0.005')
const ONBOARDING_RECONCILE_ATTEMPTS = 5
const ONBOARDING_RECONCILE_DELAY_MS = 700

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
  const [autoFunding, setAutoFunding] = useState(false)
  const [onboardingError, setOnboardingError] = useState<string | null>(null)
  const onboardingAttempt = useRef<string | null>(null)

  const automaticallyFund = useCallback(
    async (current: TestCollateralSnapshot) => {
      if (
        current.nativeBalanceRaw >= MINIMUM_PLAY_GAS &&
        current.balanceRaw >= current.grantRaw
      ) {
        setOnboardingError(null)
        return current
      }
      if (!account || onboardingAttempt.current === account.toLowerCase()) {
        return current
      }

      onboardingAttempt.current = account.toLowerCase()
      setAutoFunding(true)
      setOnboardingError(null)
      try {
        const response = await fetch('/api/onboarding', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address: account }),
        })
        const result = (await response.json().catch(() => null)) as {
          error?: string
        } | null
        if (!response.ok) {
          throw new Error(result?.error || 'Automatic testnet top-up failed')
        }

        let funded = current
        for (
          let attempt = 0;
          attempt < ONBOARDING_RECONCILE_ATTEMPTS;
          attempt += 1
        ) {
          funded = await readTestCollateral(collateralAddress, account)
          if (
            funded.nativeBalanceRaw >= MINIMUM_PLAY_GAS &&
            funded.balanceRaw >= funded.grantRaw
          ) {
            return funded
          }
          if (attempt < ONBOARDING_RECONCILE_ATTEMPTS - 1) {
            await new Promise((resolve) =>
              setTimeout(resolve, ONBOARDING_RECONCILE_DELAY_MS),
            )
          }
        }
        return funded
      } catch (cause) {
        setOnboardingError(faucetError(cause))
        return current
      } finally {
        setAutoFunding(false)
      }
    },
    [account, collateralAddress],
  )

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
      .then(automaticallyFund)
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
  }, [account, automaticallyFund, collateralAddress, wallet.status])

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

  return {
    phase,
    snapshot,
    error,
    lastHash,
    canMint,
    mint,
    refresh,
    autoFunding,
    onboardingError,
  }
}
