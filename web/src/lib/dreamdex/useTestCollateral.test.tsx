// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  DREAMDEX_TEST_COLLATERAL_ADDRESS,
  TEST_COLLATERAL_GRANT,
} from './testCollateral'
import { useTestCollateral } from './useTestCollateral'
import type { WalletClient } from 'viem'
import type {
  PlayerWalletSession,
  PlayerWalletState,
  PumpyEventMarket,
} from './types'
import type {
  TestCollateralMintResult,
  TestCollateralSnapshot,
} from './testCollateral'

const mocks = vi.hoisted(() => ({
  address: '0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E' as const,
  readTestCollateral: vi.fn(),
  mintTestCollateral: vi.fn(),
}))

vi.mock('./testCollateral', () => ({
  DREAMDEX_TEST_COLLATERAL_ADDRESS: mocks.address,
  TEST_COLLATERAL_GRANT: '20',
  isDreamDexTestCollateral: (address: string) =>
    address.toLowerCase() === mocks.address.toLowerCase(),
  readTestCollateral: mocks.readTestCollateral,
  mintTestCollateral: mocks.mintTestCollateral,
}))

const ACCOUNT = '0xa6133B31d1F72E0300fa0bFbD2e0a7a78E6a4A28'
const SESSION: PlayerWalletSession = {
  address: ACCOUNT,
  chainId: 50_312,
  walletClient: {} as WalletClient,
}
const CONNECTED_WALLET: PlayerWalletState = {
  status: 'connected',
  address: ACCOUNT,
  chainId: 50_312,
  error: null,
  session: SESSION,
}
const SNAPSHOT: TestCollateralSnapshot = {
  address: DREAMDEX_TEST_COLLATERAL_ADDRESS,
  symbol: 'tUSDC',
  decimals: 6,
  balanceRaw: 20_000_000n,
  nativeBalanceRaw: 10n ** 18n,
  grantRaw: 20_000_000n,
}

function compatibleMarket(): PumpyEventMarket {
  return {
    collateralAddress: DREAMDEX_TEST_COLLATERAL_ADDRESS,
  } as PumpyEventMarket
}

describe('tUSDC balance onboarding', () => {
  beforeEach(() => {
    mocks.readTestCollateral.mockReset().mockResolvedValue(SNAPSHOT)
    mocks.mintTestCollateral.mockReset()
  })

  it('reads the configured tUSDC balance before a market is discovered', async () => {
    const { result } = renderHook(() =>
      useTestCollateral({ market: null, wallet: CONNECTED_WALLET }),
    )

    await waitFor(() => expect(result.current.phase).toBe('ready'))

    expect(mocks.readTestCollateral).toHaveBeenCalledWith(
      DREAMDEX_TEST_COLLATERAL_ADDRESS,
      ACCOUNT,
    )
    expect(result.current.snapshot?.balanceRaw).toBe(20_000_000n)
    expect(result.current.canMint).toBe(false)
  })

  it('automatically prepares an empty connected test wallet', async () => {
    const empty = {
      ...SNAPSHOT,
      balanceRaw: 0n,
      nativeBalanceRaw: 0n,
    }
    mocks.readTestCollateral
      .mockReset()
      .mockResolvedValueOnce(empty)
      .mockResolvedValue(SNAPSHOT)
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ status: 'funded' }), { status: 200 }),
      )
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() =>
      useTestCollateral({ market: null, wallet: CONNECTED_WALLET }),
    )

    await waitFor(() => expect(result.current.phase).toBe('ready'))
    expect(fetchMock).toHaveBeenCalledWith('/api/onboarding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: ACCOUNT }),
    })
    expect(result.current.snapshot?.nativeBalanceRaw).toBe(10n ** 18n)
    expect(result.current.snapshot?.balanceRaw).toBe(20_000_000n)
    expect(result.current.onboardingError).toBeNull()

    vi.unstubAllGlobals()
  })

  it('refreshes the balance without invoking a wallet write', async () => {
    const { result } = renderHook(() =>
      useTestCollateral({ market: null, wallet: CONNECTED_WALLET }),
    )
    await waitFor(() => expect(result.current.phase).toBe('ready'))

    await act(async () => result.current.refresh())

    expect(mocks.readTestCollateral).toHaveBeenCalledTimes(2)
    expect(mocks.mintTestCollateral).not.toHaveBeenCalled()
    expect(result.current.snapshot?.balanceRaw).toBe(20_000_000n)
  })

  it('only enables minting when the selected market uses test tUSDC', async () => {
    const market = compatibleMarket()
    const mintResult: TestCollateralMintResult = {
      ...SNAPSHOT,
      balanceRaw: 40_000_000n,
      balanceBeforeRaw: SNAPSHOT.balanceRaw,
      hash: `0x${'12'.repeat(32)}`,
    }
    mocks.mintTestCollateral.mockResolvedValue(mintResult)

    const { result } = renderHook(() =>
      useTestCollateral({ market, wallet: CONNECTED_WALLET }),
    )
    await waitFor(() => expect(result.current.phase).toBe('ready'))
    expect(result.current.canMint).toBe(true)

    await act(async () => result.current.mint())

    expect(mocks.mintTestCollateral).toHaveBeenCalledWith(
      DREAMDEX_TEST_COLLATERAL_ADDRESS,
      SESSION,
    )
    expect(result.current.phase).toBe('success')
    expect(result.current.snapshot?.balanceRaw).toBe(40_000_000n)
    expect(TEST_COLLATERAL_GRANT).toBe('20')
  })
})
