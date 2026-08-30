// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TestCollateralCard } from './PumpyExperience'
import type { ComponentProps } from 'react'

afterEach(cleanup)

describe('Pumpy tUSDC balance card', () => {
  it('shows a funded balance and refreshes it without a mint action', () => {
    const refresh = vi.fn()
    const mint = vi.fn()
    const collateral = {
      phase: 'ready',
      snapshot: {
        address: '0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E',
        symbol: 'tUSDC',
        decimals: 6,
        balanceRaw: 20_000_000n,
        nativeBalanceRaw: 10n ** 18n,
        grantRaw: 20_000_000n,
      },
      error: null,
      lastHash: null,
      canMint: false,
      mint,
      refresh,
      autoFunding: false,
      onboardingError: null,
    } satisfies ComponentProps<typeof TestCollateralCard>['collateral']

    render(<TestCollateralCard collateral={collateral} />)

    expect(screen.getByText('20 tUSDC')).toBeTruthy()
    expect(screen.getByText('Ready')).toBeTruthy()
    expect(
      screen.queryByRole('button', { name: 'Get 20 test tUSDC' }),
    ).toBeNull()

    fireEvent.click(
      screen.getByRole('button', { name: 'Refresh tUSDC balance' }),
    )
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(mint).not.toHaveBeenCalled()
  })
})
