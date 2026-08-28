import { getAddress, parseAbi, parseUnits } from 'viem'

import { getDreamDexExchange } from './client'
import { SHANNON_CHAIN_ID, dreamdexNetwork } from './network'
import type { Address, Hash } from 'viem'
import type { PlayerWalletSession } from './types'

export const TEST_COLLATERAL_GRANT = '20'
export const DREAMDEX_TEST_COLLATERAL_ADDRESS = getAddress(
  dreamdexNetwork.testCollateralAddress,
)
const TEST_COLLATERAL_FAUCET_ABI = parseAbi(['function faucet(uint256 amount)'])
const BALANCE_RECONCILE_ATTEMPTS = 5
const BALANCE_RECONCILE_DELAY_MS = 600

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

  const accounts = await session.walletClient.getAddresses()
  if (accounts[0]?.toLowerCase() !== session.address.toLowerCase()) {
    throw new Error('The active wallet account changed')
  }

  // Match DreamDEX's documented faucet(uint256) call directly. Let the injected
  // wallet estimate gas instead of inheriting the SDK writer's 10M gas ceiling.
  const hash = await session.walletClient.writeContract({
    account: session.address,
    chain: session.walletClient.chain,
    address: collateralAddress,
    abi: TEST_COLLATERAL_FAUCET_ABI,
    functionName: 'faucet',
    args: [before.grantRaw],
  })
  const receipt = await getDreamDexExchange()
    .client.getViemClient()
    .waitForTransactionReceipt({ hash })

  if (receipt.status !== 'success') {
    throw new Error('The tUSDC faucet transaction reverted')
  }

  let after = before
  for (let attempt = 0; attempt < BALANCE_RECONCILE_ATTEMPTS; attempt += 1) {
    after = await readTestCollateral(collateralAddress, session.address)
    if (after.balanceRaw >= before.balanceRaw + before.grantRaw) break
    if (attempt < BALANCE_RECONCILE_ATTEMPTS - 1) {
      await new Promise((resolve) =>
        setTimeout(resolve, BALANCE_RECONCILE_DELAY_MS),
      )
    }
  }

  if (after.balanceRaw < before.balanceRaw + before.grantRaw) {
    throw new Error(
      'The faucet transaction succeeded, but the expected tUSDC balance was not observed',
    )
  }

  return {
    ...after,
    hash,
    balanceBeforeRaw: before.balanceRaw,
  }
}
