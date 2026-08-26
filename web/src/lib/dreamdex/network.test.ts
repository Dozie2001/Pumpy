import { describe, expect, it } from 'vitest'

import {
  SHANNON_CHAIN_ID,
  SHANNON_DEFAULTS,
  dreamdexNetwork,
  isShannonChainId,
  shannonExplorerTxUrl,
  somniaShannon,
} from './network'

describe('Somnia Shannon configuration', () => {
  it('uses the official Somnia testnet identity', () => {
    expect(somniaShannon.id).toBe(50_312)
    expect(somniaShannon.testnet).toBe(true)
    expect(somniaShannon.nativeCurrency).toEqual({
      name: 'Somnia Test Token',
      symbol: 'STT',
      decimals: 18,
    })
  })

  it('defaults to the official public Shannon and DreamDEX endpoints', () => {
    expect(dreamdexNetwork.network).toBe('testnet')
    expect(dreamdexNetwork.rpcUrl).toBe(SHANNON_DEFAULTS.rpcUrl)
    expect(dreamdexNetwork.webSocketRpcUrl).toBe(
      SHANNON_DEFAULTS.webSocketRpcUrl,
    )
    expect(dreamdexNetwork.indexerUrl).toBe(SHANNON_DEFAULTS.dreamdexIndexerUrl)
    expect(dreamdexNetwork.marketCreatorAddress).toBe(
      SHANNON_DEFAULTS.dreamdexMarketCreatorAddress,
    )
    expect(dreamdexNetwork.testCollateralAddress).toBe(
      SHANNON_DEFAULTS.dreamdexTestCollateralAddress,
    )
  })

  it('recognizes Shannon and creates explorer transaction links', () => {
    const hash = `0x${'12'.repeat(32)}` as const
    expect(isShannonChainId(SHANNON_CHAIN_ID)).toBe(true)
    expect(isShannonChainId(5_031)).toBe(false)
    expect(shannonExplorerTxUrl(hash)).toBe(
      `${SHANNON_DEFAULTS.explorerUrl}/tx/${hash}`,
    )
  })
})
