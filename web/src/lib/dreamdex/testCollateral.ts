import { getAddress, parseUnits } from 'viem'

import { getDreamDexExchange } from './client'
import { SHANNON_CHAIN_ID, dreamdexNetwork } from './network'
import type { Address, Hash } from 'viem'
import type { PlayerWalletSession } from './types'

export const TEST_COLLATERAL_GRANT = '20'
export const DREAMDEX_TEST_COLLATERAL_ADDRESS = getAddress(
  dreamdexNetwork.testCollateralAddress,
)

export type TestCollateralSnapshot = {
  address: Address
  symbol: string
  decimals: number
  balanceRaw: bigint
  nativeBalanceRaw: bigint
  grantRaw: bigint
}

export type TestCollateralMintResult = TestCollateralSnapshot & {
  hash: Hash
  balanceBeforeRaw: bigint
}

export function isDreamDexTestCollateral(address: Address): boolean {
  return getAddress(address) === DREAMDEX_TEST_COLLATERAL_ADDRESS
}

export function testCollateralGrantRaw(decimals: number): bigint {
  return parseUnits(TEST_COLLATERAL_GRANT, decimals)
}

export async function readTestCollateral(
  collateralAddress: Address,
  account: Address,
): Promise<TestCollateralSnapshot> {
  if (!isDreamDexTestCollateral(collateralAddress)) {
    throw new Error('The selected market does not use the test tUSDC faucet')
  }

  const client = getDreamDexExchange().client
  const metadata = await client.getErc20Metadata(collateralAddress)
  const [balanceRaw, nativeBalanceRaw] = await Promise.all([
    client.getErc20Balance(collateralAddress, account),
    client.getNativeBalance(account),
  ])

  return {
    address: collateralAddress,
    symbol: metadata.symbol,
    decimals: metadata.decimals,
    balanceRaw,
    nativeBalanceRaw,
    grantRaw: testCollateralGrantRaw(metadata.decimals),
  }
}

export async function mintTestCollateral(
  collateralAddress: Address,
  session: PlayerWalletSession,
): Promise<TestCollateralMintResult> {
  if (session.chainId !== SHANNON_CHAIN_ID) {
    throw new Error('Switch your wallet to Somnia Shannon Testnet')
  }
  const activeChainId = await session.walletClient.getChainId()
  if (activeChainId !== SHANNON_CHAIN_ID) {
    throw new Error('Your wallet changed networks. Switch back to Shannon')
  }

  const before = await readTestCollateral(collateralAddress, session.address)
  if (before.nativeBalanceRaw === 0n) {
    throw new Error('You need a little STT in this wallet to pay faucet gas')
  }

  const trader = getDreamDexExchange().client.createTrader({
    walletClient: session.walletClient,
    decimals: before.decimals,
  })
  const transaction = await trader.faucet({
    amount: before.grantRaw,
    testUsdc: collateralAddress,
  })

  if (transaction.receipt.status !== 'success') {
    throw new Error('The tUSDC faucet transaction reverted')
  }

  const after = await readTestCollateral(collateralAddress, session.address)
  if (after.balanceRaw < before.balanceRaw + before.grantRaw) {
    throw new Error(
      'The faucet transaction succeeded, but the expected tUSDC balance was not observed',
    )
  }

  return {
    ...after,
    hash: transaction.hash,
    balanceBeforeRaw: before.balanceRaw,
  }
}
