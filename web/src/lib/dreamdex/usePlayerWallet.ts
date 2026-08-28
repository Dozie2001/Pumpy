import { useCallback, useEffect, useRef, useState } from 'react'

import { SHANNON_CHAIN_ID } from './network'
import {
  bindPlayerWallet,
  clearPlayerWallet,
  getInjectedWallet,
  readInjectedWallet,
  requestPlayerWallet,
  switchInjectedWalletToShannon,
  watchInjectedWallet,
} from './wallet'
import type { InjectedWalletProvider } from './wallet'
import type { PlayerWalletState } from './types'

const DISCONNECTED: PlayerWalletState = {
  status: 'disconnected',
  address: null,
  chainId: null,
  error: null,
  session: null,
}

const WALLET_NOT_FOUND =
  'No injected EVM wallet was found. Open Pumpy in a wallet browser or install a browser wallet.'
const MANUAL_DISCONNECT_KEY = 'pumpy:wallet:manually-disconnected'

function readManualDisconnect(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(MANUAL_DISCONNECT_KEY) === '1'
  } catch {
    return false
  }
}

function writeManualDisconnect(disconnected: boolean): void {
  if (typeof window === 'undefined') return
  try {
    if (disconnected) window.localStorage.setItem(MANUAL_DISCONNECT_KEY, '1')
    else window.localStorage.removeItem(MANUAL_DISCONNECT_KEY)
  } catch {
    // Wallet operation remains usable when browser storage is unavailable.
  }
}

function walletError(error: unknown): string {
  if (
    typeof error === 'object' &&
    error &&
    'code' in error &&
    Number(error.code) === 4_001
  ) {
    return 'Wallet request was rejected'
  }
  return error instanceof Error ? error.message : 'Wallet request failed'
}

export function usePlayerWallet() {
  const intentionallyDisconnected = useRef(readManualDisconnect())
  const [state, setState] = useState<PlayerWalletState>(() =>
    getInjectedWallet()
      ? DISCONNECTED
      : {
          ...DISCONNECTED,
          status: 'unavailable',
          error: WALLET_NOT_FOUND,
        },
  )

  const sync = useCallback(async (provided?: InjectedWalletProvider) => {
    const provider = provided ?? getInjectedWallet()
    if (!provider) {
      clearPlayerWallet()
      setState({
        ...DISCONNECTED,
        status: 'unavailable',
        error: WALLET_NOT_FOUND,
      })
      return
    }
    if (intentionallyDisconnected.current) {
      clearPlayerWallet()
      setState(DISCONNECTED)
      return
    }

    try {
      const snapshot = await readInjectedWallet(provider)
      if (!snapshot.address) {
        clearPlayerWallet()
        setState(DISCONNECTED)
      } else if (snapshot.chainId !== SHANNON_CHAIN_ID) {
        clearPlayerWallet()
        setState({
          status: 'wrong-network',
          address: snapshot.address,
          chainId: snapshot.chainId,
          error: null,
          session: null,
        })
      } else {
        const session = bindPlayerWallet(
          provider,
          snapshot.address,
          snapshot.chainId,
        )
        setState({
          status: 'connected',
          address: session.address,
          chainId: session.chainId,
          error: null,
          session,
        })
      }
    } catch (error) {
      clearPlayerWallet()
      setState({
        ...DISCONNECTED,
        status: 'error',
        error: walletError(error),
      })
    }
  }, [])

  useEffect(() => {
    let activeProvider: InjectedWalletProvider | null = null
    let removeProviderListeners = () => undefined

    const attach = (provider: InjectedWalletProvider) => {
      if (provider === activeProvider) return
      removeProviderListeners()
      activeProvider = provider

      const onAccountsChanged = () => void sync(provider)
      const onChainChanged = () => void sync(provider)
      const onDisconnect = () => {
        clearPlayerWallet()
        setState(DISCONNECTED)
      }

      provider.on('accountsChanged', onAccountsChanged)
      provider.on('chainChanged', onChainChanged)
      provider.on('disconnect', onDisconnect)
      removeProviderListeners = () => {
        provider.removeListener('accountsChanged', onAccountsChanged)
        provider.removeListener('chainChanged', onChainChanged)
        provider.removeListener('disconnect', onDisconnect)
      }
      void sync(provider)
    }

    const stopWatching = watchInjectedWallet(attach)
    const initialProvider = getInjectedWallet()
    if (initialProvider) attach(initialProvider)
    else {
      setState({
        ...DISCONNECTED,
        status: 'unavailable',
        error: WALLET_NOT_FOUND,
      })
    }

    return () => {
      stopWatching()
      removeProviderListeners()
    }
  }, [sync])

  const connect = useCallback(async () => {
    const provider = getInjectedWallet()
    if (!provider) {
      setState({
        ...DISCONNECTED,
        status: 'unavailable',
        error: WALLET_NOT_FOUND,
      })
      return
    }

    setState((current) => ({ ...current, status: 'connecting', error: null }))
    try {
      const session = await requestPlayerWallet(provider)
      intentionallyDisconnected.current = false
      writeManualDisconnect(false)
      setState({
        status: 'connected',
        address: session.address,
        chainId: session.chainId,
        error: null,
        session,
      })
    } catch (error) {
      clearPlayerWallet()
      setState((current) => ({
        ...current,
        status: current.address ? 'wrong-network' : 'error',
        error: walletError(error),
        session: null,
      }))
    }
  }, [])

  const switchNetwork = useCallback(async () => {
    const provider = getInjectedWallet()
    if (!provider) return
    setState((current) => ({ ...current, status: 'connecting', error: null }))
    try {
      await switchInjectedWalletToShannon(provider)
      await sync()
    } catch (error) {
      setState((current) => ({
        ...current,
        status: 'wrong-network',
        error: walletError(error),
      }))
    }
  }, [sync])

  const disconnect = useCallback(() => {
    intentionallyDisconnected.current = true
    writeManualDisconnect(true)
    clearPlayerWallet()
    setState(DISCONNECTED)
  }, [])

  return { ...state, connect, switchNetwork, disconnect }
}

export type PlayerWalletControls = ReturnType<typeof usePlayerWallet>
