import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  DREAMDEX_TEST_COLLATERAL_ADDRESS,
  isDreamDexTestCollateral,
  mintTestCollateral,
  testCollateralGrantRaw,
} from './testCollateral'
import type { PlayerWalletSession } from './types'
import type { WalletClient } from 'viem'

const mocks = vi.hoisted(() => ({
  getErc20Metadata: vi.fn(),
  getErc20Balance: vi.fn(),
  getNativeBalance: vi.fn(),
  waitForTransactionReceipt: vi.fn(),
}))

vi.mock('./client', () => ({
  getDreamDexExchange: () => ({
    client: {
      getErc20Metadata: mocks.getErc20Metadata,
      getErc20Balance: mocks.getErc20Balance,
      getNativeBalance: mocks.getNativeBalance,
      getViemClient: () => ({
        waitForTransactionReceipt: mocks.waitForTransactionReceipt,
      }),
    },
  }),
}))

const ACCOUNT = '0xa6133B31d1F72E0300fa0bFbD2e0a7a78E6a4A28'
const HASH = `0x${'12'.repeat(32)}` as const

describe('DreamDEX test collateral safety', () => {
  beforeEach(() => {
    mocks.getErc20Metadata.mockReset().mockResolvedValue({
      symbol: 'tUSDC',
      decimals: 6,
    })
    mocks.getErc20Balance.mockReset()
    mocks.getNativeBalance.mockReset().mockResolvedValue(10n ** 18n)
    mocks.waitForTransactionReceipt
      .mockReset()
      .mockResolvedValue({ status: 'success' })
  })

  it('recognizes only the configured Event Contracts faucet token', () => {
    expect(
      isDreamDexTestCollateral('0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E'),
    ).toBe(true)
    expect(
      isDreamDexTestCollateral('0x0000000000000000000000000000000000000001'),
    ).toBe(false)
  })

  it('derives 20 tokens from runtime ERC-20 decimals', () => {
    expect(testCollateralGrantRaw(6)).toBe(20_000_000n)
    expect(testCollateralGrantRaw(18)).toBe(20_000_000_000_000_000_000n)
  })

  it('uses the documented wallet-signed faucet call and verifies the balance', async () => {
    const walletClient = {
      chain: { id: 50_312 },
      getChainId: vi.fn().mockResolvedValue(50_312),
      getAddresses: vi.fn().mockResolvedValue([ACCOUNT]),
      writeContract: vi.fn().mockResolvedValue(HASH),
    } as unknown as WalletClient
    const session: PlayerWalletSession = {
      address: ACCOUNT,
      chainId: 50_312,
      walletClient,
    }
    mocks.getErc20Balance
      .mockResolvedValueOnce(0n)
      .mockResolvedValueOnce(20_000_000n)

    const result = await mintTestCollateral(
      DREAMDEX_TEST_COLLATERAL_ADDRESS,
      session,
    )

    expect(walletClient.writeContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: DREAMDEX_TEST_COLLATERAL_ADDRESS,
        functionName: 'faucet',
        args: [20_000_000n],
      }),
    )
    expect(mocks.waitForTransactionReceipt).toHaveBeenCalledWith({ hash: HASH })
    expect(result.hash).toBe(HASH)
    expect(result.balanceRaw).toBe(20_000_000n)
  })
})
