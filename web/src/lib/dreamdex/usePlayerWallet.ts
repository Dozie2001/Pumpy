import { useCallback, useEffect, useState } from 'react'

import { SHANNON_CHAIN_ID } from './network'
import {
  bindPlayerWallet,
  clearPlayerWallet,
  getInjectedWallet,
  readInjectedWallet,
  requestPlayerWallet,
  switchInjectedWalletToShannon,
} from './wallet'
import type { PlayerWalletState } from './types'

const DISCONNECTED: PlayerWalletState = {
  status: 'disconnected',
  address: null,
  chainId: null,
  error: null,
  session: null,
}

function walletError(error: unknown): string {
  if (
    typeof error === 'object' &&
    error &&
    'code' in error &&
    error.code === 4_001
  ) {
    return 'Wallet request was rejected'
  }
  return error instanceof Error ? error.message : 'Wallet request failed'
}

export function usePlayerWallet() {
  const [state, setState] = useState<PlayerWalletState>(() =>
    getInjectedWallet()
      ? DISCONNECTED
      : { ...DISCONNECTED, status: 'unavailable' },
  )

  const sync = useCallback(async () => {
    const provider = getInjectedWallet()
    if (!provider) {
      clearPlayerWallet()
      setState({ ...DISCONNECTED, status: 'unavailable' })
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
    const provider = getInjectedWallet()
    if (!provider) return

    const onAccountsChanged = () => void sync()
    const onChainChanged = () => void sync()
    const onDisconnect = () => {
      clearPlayerWallet()
      setState(DISCONNECTED)
    }

    provider.on('accountsChanged', onAccountsChanged)
    provider.on('chainChanged', onChainChanged)
    provider.on('disconnect', onDisconnect)
    void sync()

    return () => {
      provider.removeListener('accountsChanged', onAccountsChanged)
      provider.removeListener('chainChanged', onChainChanged)
      provider.removeListener('disconnect', onDisconnect)
    }
  }, [sync])

  const connect = useCallback(async () => {
    const provider = getInjectedWallet()
    if (!provider) {
      setState({ ...DISCONNECTED, status: 'unavailable' })
      return
    }

    setState((current) => ({ ...current, status: 'connecting', error: null }))
    try {
      const session = await requestPlayerWallet(provider)
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
    clearPlayerWallet()
    setState(DISCONNECTED)
  }, [])

  return { ...state, connect, switchNetwork, disconnect }
}
