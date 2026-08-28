// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { usePlayerWallet } from './usePlayerWallet'
import type { InjectedWalletProvider } from './wallet'

const setSigner = vi.fn()

vi.mock('./client', () => ({
  getDreamDexExchange: () => ({ setSigner }),
}))

describe('player wallet reconnect', () => {
  beforeEach(() => {
    window.localStorage.clear()
    setSigner.mockClear()
  })

  it('stays disconnected across provider events and reconnects the current account', async () => {
    let account = '0x1111111111111111111111111111111111111111'
    const handlers = new Map<string, () => void>()
    const provider = {
      request: vi.fn(({ method }: { method: string }) => {
        if (method === 'eth_accounts' || method === 'eth_requestAccounts') {
          return Promise.resolve([account])
        }
        if (method === 'eth_chainId') return Promise.resolve('0xc488')
        return Promise.reject(new Error(`Unexpected wallet method: ${method}`))
      }),
      on: vi.fn((event: string, handler: () => void) => {
        handlers.set(event, handler)
      }),
      removeListener: vi.fn(),
    } as unknown as InjectedWalletProvider
    Object.defineProperty(window, 'ethereum', {
      configurable: true,
      value: provider,
    })

    const { result, unmount } = renderHook(() => usePlayerWallet())
    await waitFor(() => expect(result.current.status).toBe('connected'))

    act(() => result.current.disconnect())
    expect(result.current.status).toBe('disconnected')

    account = '0x2222222222222222222222222222222222222222'
    act(() => handlers.get('accountsChanged')?.())
    await waitFor(() => expect(result.current.status).toBe('disconnected'))

    await act(async () => result.current.connect())
    expect(result.current.status).toBe('connected')
    expect(result.current.address).toBe(account)
    expect(provider.request).toHaveBeenCalledWith({
      method: 'eth_requestAccounts',
    })

    unmount()
    Reflect.deleteProperty(window, 'ethereum')
  })
})
