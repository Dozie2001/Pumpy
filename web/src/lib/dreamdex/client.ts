import {
  SOMNIA_TESTNET_ADDRESSES,
  SomniaMarkets,
} from '@somnia-chain/markets-sdk'
import type { Address } from 'viem'

import { dreamdexNetwork } from './network'

let exchange: SomniaMarkets | null = null

/** Read-only SDK instance. A signer is intentionally not configured here. */
export function getDreamDexExchange(): SomniaMarkets {
  exchange ??= new SomniaMarkets({
    chain: dreamdexNetwork.chain,
    indexerUrl: dreamdexNetwork.indexerUrl,
    wsRpcUrl: dreamdexNetwork.webSocketRpcUrl,
    addresses: {
      ...SOMNIA_TESTNET_ADDRESSES,
      marketCreator: dreamdexNetwork.marketCreatorAddress as Address,
    },
  })

  return exchange
}
