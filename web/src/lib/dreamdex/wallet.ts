import { createWalletClient, custom, getAddress } from 'viem'

import { getDreamDexExchange } from './client'
import { SHANNON_CHAIN_ID, dreamdexNetwork, somniaShannon } from './network'
import { parseWalletChainId } from './wallet-utils'
import type { Address, EIP1193Provider, WalletClient } from 'viem'
import type { PlayerWalletSession } from './types'

export type InjectedWalletProvider = EIP1193Provider

declare global {
  interface Window {
    ethereum?: InjectedWalletProvider
  }
}

type Eip6963Detail = {
  provider?: InjectedWalletProvider
}

let announcedProvider: InjectedWalletProvider | null = null

const SHANNON_CHAIN_HEX = `0x${SHANNON_CHAIN_ID.toString(16)}`

function providerErrorCode(error: unknown): number | null {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return null
  }
  return typeof error.code === 'number' ? error.code : null
}

export function getInjectedWallet(): InjectedWalletProvider | null {
  return typeof window === 'undefined'
    ? null
    : (window.ethereum ?? announcedProvider)
}

/**
 * Watch both legacy injection and EIP-6963 announcements. Production bundles
 * can hydrate before a wallet extension injects `window.ethereum`; listening
 * here prevents that timing difference from permanently leaving the UI in an
 * unavailable state.
 */
export function watchInjectedWallet(
  onProvider: (provider: InjectedWalletProvider) => void,
): () => void {
  if (typeof window === 'undefined') return () => undefined

  const publishCurrent = () => {
    const provider = getInjectedWallet()
    if (provider) onProvider(provider)
  }
  const onAnnounce = (event: Event) => {
    const detail = (event as CustomEvent<Eip6963Detail | undefined>).detail
    if (!detail?.provider) return
    announcedProvider ??= detail.provider
    publishCurrent()
  }

  window.addEventListener('eip6963:announceProvider', onAnnounce)
  window.addEventListener('ethereum#initialized', publishCurrent)
  window.dispatchEvent(new Event('eip6963:requestProvider'))

  const poll = window.setInterval(publishCurrent, 250)
  const stopPolling = window.setTimeout(() => window.clearInterval(poll), 2_000)

  return () => {
    window.removeEventListener('eip6963:announceProvider', onAnnounce)
    window.removeEventListener('ethereum#initialized', publishCurrent)
    window.clearInterval(poll)
    window.clearTimeout(stopPolling)
  }
}

export async function readInjectedWallet(
  provider: InjectedWalletProvider,
): Promise<{ address: Address | null; chainId: number }> {
  const [accounts, chainHex] = await Promise.all([
    provider.request({ method: 'eth_accounts' }),
    provider.request({ method: 'eth_chainId' }),
  ])

  return {
    address: accounts[0] ? getAddress(accounts[0]) : null,
    chainId: parseWalletChainId(chainHex),
  }
}

export async function switchInjectedWalletToShannon(
  provider: InjectedWalletProvider,
): Promise<void> {
  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: SHANNON_CHAIN_HEX }],
    })
  } catch (error) {
    if (providerErrorCode(error) !== 4_902) throw error

    await provider.request({
      method: 'wallet_addEthereumChain',
      params: [
        {
          chainId: SHANNON_CHAIN_HEX,
          chainName: somniaShannon.name,
          nativeCurrency: somniaShannon.nativeCurrency,
          rpcUrls: [dreamdexNetwork.rpcUrl],
          blockExplorerUrls: [dreamdexNetwork.explorerUrl],
        },
      ],
    })
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: SHANNON_CHAIN_HEX }],
    })
  }
}

function walletClientFor(
  provider: InjectedWalletProvider,
  address: Address,
): WalletClient {
  return createWalletClient({
    account: address,
    chain: somniaShannon,
    transport: custom(provider),
  })
}

export function bindPlayerWallet(
  provider: InjectedWalletProvider,
  address: Address,
  chainId: number,
): PlayerWalletSession {
  if (chainId !== SHANNON_CHAIN_ID) {
    throw new Error('Switch your wallet to Somnia Shannon Testnet')
  }

  const session = {
    address,
    chainId,
    walletClient: walletClientFor(provider, address),
  }
  getDreamDexExchange().setSigner({ walletClient: session.walletClient })
  return session
}

export function clearPlayerWallet(): void {
  getDreamDexExchange().setSigner({})
}

export async function requestPlayerWallet(
  provider: InjectedWalletProvider,
): Promise<PlayerWalletSession> {
  const accounts = await provider.request({ method: 'eth_requestAccounts' })
  if (!accounts[0]) throw new Error('No wallet account was selected')

  let chainId = parseWalletChainId(
    await provider.request({ method: 'eth_chainId' }),
  )
  if (chainId !== SHANNON_CHAIN_ID) {
    await switchInjectedWalletToShannon(provider)
    chainId = parseWalletChainId(
      await provider.request({ method: 'eth_chainId' }),
    )
  }

  return bindPlayerWallet(provider, getAddress(accounts[0]), chainId)
}
