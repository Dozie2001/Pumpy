import { defineChain } from 'viem'

import { env } from '@/env'

export const SHANNON_CHAIN_ID = 50_312

export const SHANNON_DEFAULTS = Object.freeze({
  rpcUrl: 'https://dream-rpc.somnia.network',
  webSocketRpcUrl: 'wss://api.infra.testnet.somnia.network/ws',
  explorerUrl: 'https://shannon-explorer.somnia.network',
  faucetUrl: 'https://testnet.somnia.network',
  dreamdexIndexerUrl: 'https://dev.smk.somnia.host/v1/graphql',
  dreamdexMarketCreatorAddress: '0x5Ce69567dB39C8fBAd7e048bEfdbcCdfE67B44e6',
  dreamdexTestCollateralAddress: '0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E',
})

/**
 * The one EVM chain Pumpy supports during the hackathon MVP.
 *
 * Shannon is the proper name of Somnia's testnet. Runtime endpoints are
 * overridable for reliability, while identity and currency stay fixed.
 */
export const somniaShannon = defineChain({
  id: SHANNON_CHAIN_ID,
  name: 'Somnia Shannon Testnet',
  nativeCurrency: {
    name: 'Somnia Test Token',
    symbol: 'STT',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: [env.VITE_SOMNIA_RPC_URL],
      webSocket: [env.VITE_SOMNIA_WS_RPC_URL],
    },
  },
  blockExplorers: {
    default: {
      name: 'Somnia Shannon Explorer',
      url: SHANNON_DEFAULTS.explorerUrl,
    },
  },
  testnet: true,
})

export const dreamdexNetwork = Object.freeze({
  network: env.VITE_SOMNIA_NETWORK,
  chain: somniaShannon,
  rpcUrl: env.VITE_SOMNIA_RPC_URL,
  webSocketRpcUrl: env.VITE_SOMNIA_WS_RPC_URL,
  indexerUrl: env.VITE_DREAMDEX_INDEXER_URL,
  marketCreatorAddress: env.VITE_DREAMDEX_MARKET_CREATOR_ADDRESS,
  testCollateralAddress: env.VITE_DREAMDEX_TEST_COLLATERAL_ADDRESS,
  explorerUrl: SHANNON_DEFAULTS.explorerUrl,
  faucetUrl: SHANNON_DEFAULTS.faucetUrl,
})

export function shannonExplorerTxUrl(hash: `0x${string}`): string {
  return `${dreamdexNetwork.explorerUrl}/tx/${hash}`
}

export function isShannonChainId(chainId: number): boolean {
  return chainId === SHANNON_CHAIN_ID
}
