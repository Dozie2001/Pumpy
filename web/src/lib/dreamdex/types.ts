import type { Address, Hash, Hex, WalletClient } from 'viem'

export type PumpyMarketStatus =
  | 'upcoming'
  | 'trading'
  | 'locked'
  | 'settling'
  | 'resolved'
  | 'voided'
  | 'finalized'

export type PumpyEventMarket = {
  marketId: Hex
  poolAddress: Address
  marketAddress: Address
  asset: string
  question: string
  oracleQuestion: string | null
  reference: 'opening-price' | 'fixed-strike'
  strikeRaw: string
  /** Raw oracle value for the actual line this market resolves against. */
  targetPriceRaw: string | null
  status: PumpyMarketStatus
  tradingStartsAt: number
  expiresAt: number
  intervalLabel: string
  intervalSeconds: number | null
  operatorId: number | null
  venueId: Hex | null
  collateralAddress: Address
  collateralSymbol: string
  collateralDecimals: number
  yesTokenId: string
  noTokenId: string
}

export type PumpyBookQuote = {
  yesAsk: number | null
  noAsk: number | null
  observedAt: number
}

export type MarketConnection = 'indexer' | 'live' | 'stale'

export type EventMarketsState = {
  phase: 'loading' | 'ready' | 'empty' | 'error'
  markets: Array<PumpyEventMarket>
  selected: PumpyEventMarket | null
  closing: PumpyEventMarket | null
  next: PumpyEventMarket | null
  quote: PumpyBookQuote | null
  connection: MarketConnection
  error: string | null
  retry: () => void
}

export type PlayerWalletStatus =
  | 'unavailable'
  | 'disconnected'
  | 'connecting'
  | 'wrong-network'
  | 'connected'
  | 'error'

export type PlayerWalletSession = {
  address: Address
  chainId: number
  walletClient: WalletClient
}

export type PlayerWalletState = {
  status: PlayerWalletStatus
  address: Address | null
  chainId: number | null
  error: string | null
  session: PlayerWalletSession | null
}

export type PlayerSide = 'UP' | 'DOWN'

export type PumpyPlayerGame = 'lucky' | 'long-shot'

export type PumpyGameMode = 'quick-call' | 'bot-battle'

export type PreparedPlayerTrade = {
  marketId: Hex
  poolAddress: Address
  collateralAddress: Address
  collateralSymbol: string
  collateralDecimals: number
  side: PlayerSide
  orderSide: 'BUY_YES' | 'BUY_NO'
  stakeRaw: bigint
  escrowRaw: bigint
  quantityRaw: bigint
  yesLimitPriceRaw: bigint
  outcomeLimitPriceRaw: bigint
  walletBalanceRaw: bigint | null
  hasEnoughBalance: boolean | null
  observedAt: number
  validUntil: number
  marketExpiresAt: number
}

export type PlayerOrderOutcome = {
  status: 'filled' | 'partial' | 'unfilled' | 'open'
  hash: Hash
  orderId: bigint | null
  requestedQuantityRaw: bigint
  filledQuantityRaw: bigint
  filledCostRaw: bigint
}

export type PreparedPlayerCashout = {
  marketId: Hex
  poolAddress: Address
  side: PlayerSide
  orderSide: 'SELL_YES' | 'SELL_NO'
  positionRaw: bigint
  quantityRaw: bigint
  fillableQuantityRaw: bigint
  yesLimitPriceRaw: bigint
  outcomeLimitPriceRaw: bigint
  estimatedProceedsRaw: bigint
  collateralDecimals: number
  observedAt: number
  validUntil: number
  marketExpiresAt: number
}

export type PlayerCashoutOutcome = {
  status: 'filled' | 'partial' | 'unfilled'
  hash: Hash
  requestedQuantityRaw: bigint
  filledQuantityRaw: bigint
  proceedsRaw: bigint
}

export type QuickCallRound = {
  version: 1
  game: PumpyPlayerGame
  account: Address
  marketId: Hex
  poolAddress: Address
  marketAddress: Address
  asset: string
  question: string
  side: PlayerSide
  outcomeIndex: 0 | 1
  collateralSymbol: string
  collateralDecimals: number
  operatorId: number | null
  venueId: Hex | null
  expiresAt: number
  intervalSeconds: number | null
  reference: 'opening-price' | 'fixed-strike'
  strikeRaw: string
  targetPriceRaw: string | null
  orderStatus: PlayerOrderOutcome['status']
  orderHash: Hash
  requestedQuantityRaw: string
  filledQuantityRaw: string
  escrowRaw: string
  submittedAt: number
  claimHash: Hash | null
  claimedAt: number | null
  cashoutHash: Hash | null
  cashoutProceedsRaw: string | null
  cashedOutAt: number | null
}
