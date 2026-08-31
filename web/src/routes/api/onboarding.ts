import { createFileRoute } from '@tanstack/react-router'
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  getAddress,
  http,
  parseAbi,
  parseEther,
  parseUnits,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

const SHANNON_CHAIN_ID = 50_312
const DEFAULT_RPC_URL = 'https://dream-rpc.somnia.network'
const DEFAULT_COLLATERAL = '0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E'
const WINDOW_MS = 60 * 60 * 1_000
const MAX_IP_REQUESTS_PER_WINDOW = 4
const MAX_WALLET_REQUESTS_PER_WINDOW = 1

const tokenAbi = parseAbi([
  'function balanceOf(address account) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function faucet(uint256 amount)',
  'function transfer(address to, uint256 amount) returns (bool)',
])

type LimitState = { count: number; resetAt: number }
type FundingResult = {
  status: 'already-ready' | 'funded'
  nativeHash: `0x${string}` | null
  collateralHash: `0x${string}` | null
  nativeBalance: string
  collateralBalance: string
}

const ipLimits = new Map<string, LimitState>()
const walletLimits = new Map<string, LimitState>()
let fundingQueue: Promise<void> = Promise.resolve()

function json(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json',
    },
  })
}

function takeLimit(
  store: Map<string, LimitState>,
  key: string,
  maximum: number,
): boolean {
  const now = Date.now()
  const current = store.get(key)
  if (!current || current.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + WINDOW_MS })
    return true
  }
  if (current.count >= maximum) return false
  current.count += 1
  return true
}

function clientIp(request: Request): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  )
}

function privateKey(): `0x${string}` {
  const value = process.env.ONBOARDING_FAUCET_PRIVATE_KEY
  if (!value || !/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error('Automatic testnet onboarding is not configured')
  }
  return value as `0x${string}`
}

async function serialized<T>(task: () => Promise<T>): Promise<T> {
  const previous = fundingQueue
  let release: () => void = () => {}
  fundingQueue = new Promise<void>((resolve) => {
    release = resolve
  })
  await previous
  try {
    return await task()
  } finally {
    release()
  }
}

async function fundTestWallet(recipient: `0x${string}`): Promise<FundingResult> {
  const rpcUrl =
    process.env.SOMNIA_RPC_URL ||
    process.env.VITE_SOMNIA_RPC_URL ||
    DEFAULT_RPC_URL
  const collateral = getAddress(
    process.env.DREAMDEX_TEST_COLLATERAL_ADDRESS ||
      process.env.VITE_DREAMDEX_TEST_COLLATERAL_ADDRESS ||
      DEFAULT_COLLATERAL,
  )
  const chain = defineChain({
    id: SHANNON_CHAIN_ID,
    name: 'Somnia Shannon Testnet',
    nativeCurrency: { name: 'Somnia Test Token', symbol: 'STT', decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
    testnet: true,
  })
  const transport = http(rpcUrl, { timeout: 15_000 })
  const publicClient = createPublicClient({ chain, transport })
  const account = privateKeyToAccount(privateKey())
  const walletClient = createWalletClient({ account, chain, transport })
  const sttGrant = parseEther(process.env.ONBOARDING_STT_GRANT || '0.05')
  const sttFloor = parseEther(process.env.ONBOARDING_STT_FLOOR || '0.005')
  const decimals = await publicClient.readContract({
    address: collateral,
    abi: tokenAbi,
    functionName: 'decimals',
  })
  const collateralGrant = parseUnits(
    process.env.ONBOARDING_TUSDC_GRANT || '20',
    decimals,
  )

  let [nativeBalance, collateralBalance] = await Promise.all([
    publicClient.getBalance({ address: recipient }),
    publicClient.readContract({
      address: collateral,
      abi: tokenAbi,
      functionName: 'balanceOf',
      args: [recipient],
    }),
  ])
  if (nativeBalance >= sttFloor && collateralBalance >= collateralGrant) {
    return {
      status: 'already-ready',
      nativeHash: null,
      collateralHash: null,
      nativeBalance: nativeBalance.toString(),
      collateralBalance: collateralBalance.toString(),
    }
  }

  let nativeHash: `0x${string}` | null = null
  let collateralHash: `0x${string}` | null = null

  if (nativeBalance < sttFloor) {
    const senderBalance = await publicClient.getBalance({
      address: account.address,
    })
    if (senderBalance <= sttGrant) {
      throw new Error('The Pumpy testnet onboarding wallet needs more STT')
    }
    nativeHash = await walletClient.sendTransaction({
      account,
      chain,
      to: recipient,
      value: sttGrant,
    })
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: nativeHash,
    })
    if (receipt.status !== 'success') throw new Error('STT top-up reverted')
  }

  if (collateralBalance < collateralGrant) {
    let senderCollateral = await publicClient.readContract({
      address: collateral,
      abi: tokenAbi,
      functionName: 'balanceOf',
      args: [account.address],
    })
    if (senderCollateral < collateralGrant) {
      const faucetHash = await walletClient.writeContract({
        account,
        chain,
        address: collateral,
        abi: tokenAbi,
        functionName: 'faucet',
        args: [collateralGrant],
      })
      const receipt = await publicClient.waitForTransactionReceipt({
        hash: faucetHash,
      })
      if (receipt.status !== 'success') {
        throw new Error('The DreamDEX tUSDC faucet transaction reverted')
      }
      senderCollateral = await publicClient.readContract({
        address: collateral,
        abi: tokenAbi,
        functionName: 'balanceOf',
        args: [account.address],
      })
    }
    if (senderCollateral < collateralGrant) {
      throw new Error('The Pumpy onboarding wallet needs more test tUSDC')
    }
    collateralHash = await walletClient.writeContract({
      account,
      chain,
      address: collateral,
      abi: tokenAbi,
      functionName: 'transfer',
      args: [recipient, collateralGrant],
    })
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: collateralHash,
    })
    if (receipt.status !== 'success') throw new Error('tUSDC top-up reverted')
  }

  ;[nativeBalance, collateralBalance] = await Promise.all([
    publicClient.getBalance({ address: recipient }),
    publicClient.readContract({
      address: collateral,
      abi: tokenAbi,
      functionName: 'balanceOf',
      args: [recipient],
    }),
  ])
  return {
    status: 'funded',
    nativeHash,
    collateralHash,
    nativeBalance: nativeBalance.toString(),
    collateralBalance: collateralBalance.toString(),
  }
}

export const Route = createFileRoute('/api/onboarding')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const allowedOrigin = process.env.ONBOARDING_ALLOWED_ORIGIN
        const origin = request.headers.get('origin')
        if (allowedOrigin && origin !== allowedOrigin) {
          return json({ error: 'Origin is not allowed' }, 403)
        }

        let recipient: `0x${string}`
        try {
          const body = (await request.json()) as { address?: unknown }
          if (typeof body.address !== 'string') {
            throw new Error('Missing address')
          }
          recipient = getAddress(body.address)
        } catch {
          return json({ error: 'A valid EVM wallet address is required' }, 400)
        }

        const ip = clientIp(request)
        if (!takeLimit(ipLimits, ip, MAX_IP_REQUESTS_PER_WINDOW)) {
          return json(
            { error: 'Too many onboarding requests. Try again later.' },
            429,
          )
        }
        if (
          !takeLimit(
            walletLimits,
            recipient.toLowerCase(),
            MAX_WALLET_REQUESTS_PER_WINDOW,
          )
        ) {
          return json(
            { error: 'This wallet was already checked recently.' },
            429,
          )
        }

        try {
          return json(await serialized(() => fundTestWallet(recipient)))
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : 'Automatic testnet onboarding failed'
          const unavailable = message.includes('not configured')
          return json({ error: message }, unavailable ? 503 : 500)
        }
      },
    },
  },
})
