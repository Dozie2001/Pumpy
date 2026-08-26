import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nitro } from 'nitro/vite'

// Origin of a configured URL, or '' when it is unset/malformed (a bad value must not silently widen the policy).
const originOf = (url: string | undefined): string => {
  try {
    return new URL(url as string).origin
  } catch {
    return ''
  }
}

// Content Security Policy, built at build time because the API and chain origins come from env.
//
// script-src keeps 'unsafe-inline': TanStack Start emits the hydration payload as an inline script with no
// nonce hook, so the win here is frame-ancestors, connect-src and object-src, not full XSS containment.
const ROOT_ENV_DIR = fileURLToPath(new URL('..', import.meta.url))

function contentSecurityPolicy(environment: NodeJS.ProcessEnv): string {
  const api = originOf(environment.VITE_API_URL)
  const apiWs = api.replace(/^http/, 'ws')
  const somniaRpc =
    originOf(environment.VITE_SOMNIA_RPC_URL) ||
    'https://dream-rpc.somnia.network'
  const somniaWs =
    originOf(environment.VITE_SOMNIA_WS_RPC_URL) ||
    'wss://api.infra.testnet.somnia.network'
  const dreamdexIndexer =
    originOf(environment.VITE_DREAMDEX_INDEXER_URL) ||
    'https://dev.smk.somnia.host'

  const connect = [
    "'self'",
    api,
    apiWs,
    somniaRpc,
    somniaWs,
    dreamdexIndexer,
  ].filter(Boolean)

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "manifest-src 'self'",
    "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://challenges.cloudflare.com",
    "style-src 'self' 'unsafe-inline'",
    // Token logos come from whatever URL the coin's metadata points at, so images stay open to https.
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "media-src 'self' data: blob:",
    "worker-src 'self' blob:",
    "child-src 'none'",
    "frame-src 'none'",
    `connect-src ${connect.join(' ')}`,
  ].join('; ')
}

const baseSecurityHeaders: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
}

const config = defineConfig(({ command, mode }) => {
  // Vite normally looks beside vite.config.ts. Pumpy keeps one repository-root
  // environment file shared by the web, contracts, and future bot workspaces.
  // Shell/deployment variables override local file values.
  const environment = {
    ...loadEnv(mode, ROOT_ENV_DIR, ['VITE_', 'CSP_MODE']),
    ...process.env,
  }
  // report = log violations, enforce = block, off = omit CSP. The setting is
  // read after the root .env so local and deployed builds behave consistently.
  const cspMode = environment.CSP_MODE || 'report'
  const cspHeader =
    cspMode === 'enforce'
      ? 'Content-Security-Policy'
      : 'Content-Security-Policy-Report-Only'
  const buildSecurityHeaders: Record<string, string> = {
    ...(cspMode === 'off'
      ? {}
      : { [cspHeader]: contentSecurityPolicy(environment) }),
    ...baseSecurityHeaders,
  }

  return {
    envDir: ROOT_ENV_DIR,
    resolve: { tsconfigPaths: true },
    // markets-sdk 0.25.0 publishes extensionless ESM imports (for example
    // `./errors`). Vite resolves those correctly when it bundles the package,
    // while Node's development SSR loader does not when the dependency is
    // externalized. Keep it inside the SSR graph rather than patching node_modules.
    ssr: { noExternal: ['@somnia-chain/markets-sdk'] },
    // The release stamps itself: Vercel injects the sha at build time, `dev` locally. Never hand-maintained,
    // because a stale release string blames the wrong deploy for a regression.
    define: {
      __RELEASE__: JSON.stringify(
        (process.env.VERCEL_GIT_COMMIT_SHA || 'dev').slice(0, 7),
      ),
    },
    // Build only: a strict policy in dev would block Vite's HMR client and eval'd module graph for no gain.
    ...(command === 'build'
      ? {
          nitro: {
            routeRules: { '/**': { headers: buildSecurityHeaders } },
          },
        }
      : {}),
    plugins: [nitro(), tailwindcss(), tanstackStart(), viteReact()],
  }
})

export default config
