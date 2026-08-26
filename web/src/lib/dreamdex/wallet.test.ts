import { describe, expect, it } from 'vitest'

import { parseWalletChainId } from './wallet-utils'

describe('injected wallet helpers', () => {
  it('parses Shannon chain ID from the EIP-1193 hexadecimal value', () => {
    expect(parseWalletChainId('0xc488')).toBe(50_312)
  })

  it('rejects malformed chain IDs', () => {
    expect(() => parseWalletChainId('not-a-chain')).toThrow(
      'Wallet returned an invalid chain ID',
    )
  })
})
