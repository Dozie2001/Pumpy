import { createEnv } from '@t3-oss/env-core'
import { z } from 'zod'

// Injected by the `define` in vite.config.ts: Vercel's commit sha in prod, 'dev' locally. Never typed by
// hand, so an error group always points at the deploy that actually shipped it.
declare global {
  const __RELEASE__: string
}

// Typed, validated client env. Import from here, never from import.meta.env directly.
export const env = createEnv({
  clientPrefix: 'VITE_',

  client: {
    VITE_API_URL: z.string().url().default('http://localhost:3780'),
    // Pumpy's public Somnia/DreamDEX read endpoints. Shannon is Somnia's testnet.
    // These values ship in the browser, so never put keyed provider URLs here.
    VITE_SOMNIA_NETWORK: z.enum(['testnet']).default('testnet'),
    VITE_SOMNIA_RPC_URL: z
      .string()
      .url()
      .default('https://dream-rpc.somnia.network'),
    VITE_SOMNIA_WS_RPC_URL: z
      .string()
      .url()
      .default('wss://api.infra.testnet.somnia.network/ws'),
    VITE_DREAMDEX_INDEXER_URL: z
      .string()
      .url()
      .default('https://dev.smk.somnia.host/v1/graphql'),
    VITE_DREAMDEX_MARKET_CREATOR_ADDRESS: z
      .string()
      .regex(/^0x[0-9a-fA-F]{40}$/, 'must be an EVM address')
      .default('0x5Ce69567dB39C8fBAd7e048bEfdbcCdfE67B44e6'),
    VITE_DREAMDEX_TEST_COLLATERAL_ADDRESS: z
      .string()
      .regex(/^0x[0-9a-fA-F]{40}$/, 'must be an EVM address')
      .default('0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E'),
    VITE_APP_NAME: z.string().min(1).default('Pumpy'),
    VITE_APP_URL: z.string().url().optional(),
  },

  runtimeEnv: {
    VITE_API_URL: import.meta.env.VITE_API_URL,
    VITE_SOMNIA_NETWORK: import.meta.env.VITE_SOMNIA_NETWORK,
    VITE_SOMNIA_RPC_URL: import.meta.env.VITE_SOMNIA_RPC_URL,
    VITE_SOMNIA_WS_RPC_URL: import.meta.env.VITE_SOMNIA_WS_RPC_URL,
    VITE_DREAMDEX_INDEXER_URL: import.meta.env.VITE_DREAMDEX_INDEXER_URL,
    VITE_DREAMDEX_MARKET_CREATOR_ADDRESS: import.meta.env
      .VITE_DREAMDEX_MARKET_CREATOR_ADDRESS,
    VITE_DREAMDEX_TEST_COLLATERAL_ADDRESS: import.meta.env
      .VITE_DREAMDEX_TEST_COLLATERAL_ADDRESS,
    VITE_APP_NAME: import.meta.env.VITE_APP_NAME,
    VITE_APP_URL: import.meta.env.VITE_APP_URL,
  },

  // Treat empty strings as unset so optionals/defaults behave.
  emptyStringAsUndefined: true,
})
