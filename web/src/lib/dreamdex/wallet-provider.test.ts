// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'

import { getInjectedWallet, watchInjectedWallet } from './wallet'
import type { InjectedWalletProvider } from './wallet'

describe('injected wallet discovery', () => {
  it('discovers providers announced after the app has mounted', () => {
    const provider = {
      request: vi.fn(),
      on: vi.fn(),
      removeListener: vi.fn(),
    } as unknown as InjectedWalletProvider
    const onProvider = vi.fn()
    const stop = watchInjectedWallet(onProvider)

    window.dispatchEvent(
      new CustomEvent('eip6963:announceProvider', {
        detail: { provider },
      }),
    )

    expect(onProvider).toHaveBeenCalledWith(provider)
    expect(getInjectedWallet()).toBe(provider)
    stop()
  })
})
