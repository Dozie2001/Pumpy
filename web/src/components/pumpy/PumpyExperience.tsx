import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Bot,
  Check,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  ExternalLink,
  LoaderCircle,
  LockKeyhole,
  Radio,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Trophy,
  WalletCards,
  WifiOff,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { formatUnits } from 'viem'
import type { ConsoleControls } from '@/components/console/controls'
import type {
  EventMarketsState,
  PlayerOrderOutcome,
  PlayerSide,
  PreparedPlayerTrade,
  PumpyEventMarket,
  PumpyGameMode,
} from '@/lib/dreamdex/types'
import { useConsoleControls } from '@/components/console/controls'
import { GameScreen } from '@/components/game/screen'
import { shannonExplorerTxUrl } from '@/lib/dreamdex/network'
import { placePreparedPlayerTrade } from '@/lib/dreamdex/trade'
import { useEventMarkets } from '@/lib/dreamdex/useEventMarkets'
import { usePlayerQuote } from '@/lib/dreamdex/usePlayerQuote'
import { useQuickCallRound } from '@/lib/dreamdex/useQuickCallRound'
import { useTestCollateral } from '@/lib/dreamdex/useTestCollateral'
import { usePlayerWallet } from '@/lib/dreamdex/usePlayerWallet'
import { haptic } from '@/lib/haptics'
import { cnm } from '@/utils/style'

type Screen = 'home' | 'rivals' | 'round' | 'confirm' | 'position'
type Side = PlayerSide
type OrderPhase = 'idle' | 'submitting' | PlayerOrderOutcome['status'] | 'error'

type Rival = {
  name: string
  shortName: string
  signal: string
  description: string
  accent: string
}

const RIVALS: ReadonlyArray<Rival> = [
  {
    name: 'Momentum Max',
    shortName: 'MAX',
    signal: 'Momentum',
    description:
      'Follows short-window price movement when the signal clears its risk threshold.',
    accent: 'text-pumpy-cyan',
  },
  {
    name: 'Reversal Rita',
    shortName: 'RITA',
    signal: 'Mean reversion',
    description:
      'Looks for an overextended move, then takes the measured opposite side.',
    accent: 'text-pumpy-accent',
  },
  {
    name: 'Crowd Fader',
    shortName: 'FADER',
    signal: 'Independent value',
    description:
      'Challenges the market only when its own estimate materially disagrees.',
    accent: 'text-pumpy-coral',
  },
] as const

const STAKES = [1, 5, 10, 25, 50] as const
const TOKEN_LOGOS = {
  BTC: '/assets/images/coins/btc-logo.png',
  ETH: '/assets/images/coins/eth-logo.png',
} as const
const RIM = 'px-[var(--screen-rim,24px)]'
const RIM_TOP = 'pt-[calc(var(--screen-rim,24px)+4px)]'
const RIM_BOTTOM = 'pb-[calc(var(--screen-rim,24px)+var(--screen-notch,0px))]'
type PlayerWalletControls = ReturnType<typeof usePlayerWallet>
type TestCollateralControls = ReturnType<typeof useTestCollateral>
type QuickCallControls = ReturnType<typeof useQuickCallRound>

export function PumpyExperience() {
  const [screen, setScreen] = useState<Screen>('home')
  const [mode, setMode] = useState<PumpyGameMode>('quick-call')
  const [rivalIndex, setRivalIndex] = useState(0)
  const [side, setSide] = useState<Side | null>(null)
  const [stakeIndex, setStakeIndex] = useState(1)
  const [asset, setAsset] = useState('BTC')
  const [orderPhase, setOrderPhase] = useState<OrderPhase>('idle')
  const [orderError, setOrderError] = useState<string | null>(null)
  const [lastOrder, setLastOrder] = useState<PlayerOrderOutcome | null>(null)
  const eventMarkets = useEventMarkets(asset)
  const wallet = usePlayerWallet()
  const quickCall = useQuickCallRound({
    address: wallet.address,
    session: wallet.session,
  })

  const rival = RIVALS[rivalIndex]
  const stake = STAKES[stakeIndex]
  const market = eventMarkets.selected
  const testCollateral = useTestCollateral({ market, wallet })
  const playerQuote = usePlayerQuote({
    market,
    side,
    stake,
    account: wallet.address,
    enabled: screen === 'confirm' && eventMarkets.connection === 'live',
  })

  useEffect(() => {
    setSide(null)
    setOrderPhase('idle')
    setOrderError(null)
    setLastOrder(null)
    setScreen((current) =>
      current === 'confirm' && !quickCall.round ? 'round' : current,
    )
  }, [market?.marketId])

  const moveRival = useCallback((delta: number) => {
    setRivalIndex((current) =>
      Math.max(0, Math.min(RIVALS.length - 1, current + delta)),
    )
  }, [])

  const go = useCallback((next: Screen) => {
    haptic('selection')
    setScreen(next)
  }, [])

  const beginQuickCall = useCallback(() => {
    setMode('quick-call')
    setSide(null)
    setOrderPhase('idle')
    setOrderError(null)
    go('round')
  }, [go])

  const beginBotBattle = useCallback(() => {
    setMode('bot-battle')
    setSide(null)
    setOrderPhase('idle')
    setOrderError(null)
    go('rivals')
  }, [go])

  const submitQuickCall = useCallback(async () => {
    if (wallet.status === 'wrong-network') {
      await wallet.switchNetwork()
      return
    }
    if (wallet.status !== 'connected' || !wallet.session) {
      await wallet.connect()
      return
    }
    if (!market || !playerQuote.quote || !side) {
      playerQuote.refresh()
      return
    }

    setOrderPhase('submitting')
    setOrderError(null)
    setLastOrder(null)
    try {
      const outcome = await placePreparedPlayerTrade({
        trade: playerQuote.quote,
        market,
        wallet: wallet.session,
        mode: 'quick-call',
      })
      setLastOrder(outcome)
      setOrderPhase(outcome.status)
      if (outcome.status === 'filled' || outcome.status === 'partial') {
        quickCall.recordOrder({
          market,
          trade: playerQuote.quote,
          outcome,
        })
        haptic('success')
        go('position')
      } else {
        playerQuote.refresh()
      }
    } catch (cause) {
      if (isWalletRejection(cause)) {
        setOrderPhase('idle')
        return
      }
      setOrderPhase('error')
      setOrderError(
        cause instanceof Error ? cause.message : 'The order did not complete',
      )
    }
  }, [go, market, playerQuote, quickCall, side, wallet])

  const controls = useMemo<ConsoleControls>(() => {
    if (screen === 'home') {
      return {
        action1: {
          label: 'BTC',
          color: 'neutral' as const,
          onPress: () => setAsset('BTC'),
          display: {
            mode: 'token' as const,
            ticker: 'BTC',
            logoSrc: TOKEN_LOGOS.BTC,
          },
        },
        action2: {
          label: 'ETH',
          color: 'neutral' as const,
          onPress: () => setAsset('ETH'),
          display: {
            mode: 'token' as const,
            ticker: 'ETH',
            logoSrc: TOKEN_LOGOS.ETH,
          },
        },
        main: {
          label: quickCall.round ? 'RESUME' : 'QUICK CALL',
          color: 'amber' as const,
          loading: eventMarkets.phase === 'loading',
          onPress: () => {
            if (quickCall.round) go('position')
            else if (market) beginQuickCall()
          },
        },
        status: {
          left: `${asset} · SHANNON`,
          right: market
            ? eventMarkets.connection.toUpperCase()
            : eventMarkets.phase.toUpperCase(),
        },
      }
    }

    if (screen === 'rivals') {
      return {
        action1: {
          label: 'PREV',
          color: 'neutral' as const,
          onPress: () => moveRival(-1),
        },
        action2: {
          label: 'NEXT',
          color: 'neutral' as const,
          onPress: () => moveRival(1),
        },
        knob: {
          label: 'RIVAL',
          min: 0,
          max: RIVALS.length - 1,
          step: 1,
          value: rivalIndex,
          onChange: (value: number) => setRivalIndex(value),
          format: (value: number) => `${value + 1}/${RIVALS.length}`,
        },
        main: {
          label: 'SELECT',
          color: 'amber' as const,
          onPress: () => go('round'),
        },
        status: { left: 'CHOOSE RIVAL', right: `${rivalIndex + 1}/3` },
      }
    }

    if (screen === 'round') {
      return {
        action1: {
          label: 'UP',
          color: 'up' as const,
          onPress: () => setSide('UP'),
        },
        action2: {
          label: 'DOWN',
          color: 'down' as const,
          onPress: () => setSide('DOWN'),
        },
        numberWheel: {
          label: market?.collateralSymbol.toUpperCase() ?? 'COLLATERAL',
          min: 0,
          max: STAKES.length - 1,
          step: 1,
          value: stakeIndex,
          onChange: (value: number) => setStakeIndex(value),
          format: (value: number) => `$${STAKES[value]}`,
        },
        main: {
          label: side ? 'REVIEW' : 'PICK SIDE',
          color: 'amber' as const,
          onPress: () => {
            if (side) go('confirm')
          },
        },
        status: {
          left:
            mode === 'quick-call'
              ? 'QUICK CALL'
              : (market?.intervalLabel ?? 'NO MARKET'),
          right: `${stake} ${market?.collateralSymbol ?? ''}`,
        },
      }
    }

    if (screen === 'position') {
      const canClaim = quickCall.snapshot?.phase === 'claimable'
      return {
        action1: {
          label: 'HOME',
          color: 'neutral' as const,
          onPress: () => go('home'),
        },
        action2: {
          label: 'REFRESH',
          color: 'neutral' as const,
          onPress: () => void quickCall.refresh(),
        },
        main: {
          label: canClaim
            ? quickCall.phase === 'claiming'
              ? 'CLAIMING'
              : 'CLAIM'
            : 'CHECK CHAIN',
          color: canClaim ? ('amber' as const) : ('neutral' as const),
          loading:
            quickCall.phase === 'loading' || quickCall.phase === 'claiming',
          onPress: () =>
            canClaim ? void quickCall.claim() : void quickCall.refresh(),
        },
        status: {
          left: quickCall.round?.asset ?? 'QUICK CALL',
          right: (quickCall.snapshot?.phase ?? quickCall.phase).toUpperCase(),
        },
      }
    }

    return {
      action1: {
        label: 'BACK',
        color: 'neutral' as const,
        onPress: () => go('round'),
      },
      action2: {
        label: mode === 'bot-battle' ? 'PROOF' : 'QUOTE',
        color: 'neutral' as const,
        onPress: () => undefined,
      },
      main: {
        label:
          orderPhase === 'submitting'
            ? 'SIGNING'
            : wallet.status === 'connected'
              ? mode === 'bot-battle'
                ? 'PROOF NEXT'
                : playerQuote.phase === 'ready'
                  ? 'LOCK IN'
                  : 'REFRESH'
              : wallet.status === 'wrong-network'
                ? 'SWITCH'
                : wallet.status === 'connecting'
                  ? 'CHECK WALLET'
                  : 'CONNECT',
        color:
          wallet.status === 'connected' && mode === 'bot-battle'
            ? ('neutral' as const)
            : ('amber' as const),
        loading: wallet.status === 'connecting' || orderPhase === 'submitting',
        onPress: () => {
          if (mode === 'quick-call') void submitQuickCall()
          else if (wallet.status === 'wrong-network')
            void wallet.switchNetwork()
          else if (wallet.status !== 'connected') void wallet.connect()
        },
      },
      status: {
        left: playerQuote.phase === 'ready' ? 'QUOTE READY' : 'REVIEW',
        right:
          wallet.status === 'connected'
            ? shortId(wallet.address!)
            : wallet.status.toUpperCase(),
      },
    }
  }, [
    asset,
    beginQuickCall,
    eventMarkets.connection,
    eventMarkets.phase,
    go,
    market,
    mode,
    moveRival,
    orderPhase,
    quickCall,
    rivalIndex,
    screen,
    side,
    stake,
    stakeIndex,
    submitQuickCall,
    wallet,
    playerQuote.phase,
  ])

  useConsoleControls(controls)

  return (
    <GameScreen>
      {screen === 'home' && (
        <HomeScreen
          asset={asset}
          marketState={eventMarkets}
          wallet={wallet}
          testCollateral={testCollateral}
          onAsset={setAsset}
          hasRound={Boolean(quickCall.round)}
          onQuickCall={() => market && beginQuickCall()}
          onBotBattle={() => market && beginBotBattle()}
          onResume={() => go('position')}
        />
      )}
      {screen === 'rivals' && (
        <RivalScreen
          selected={rivalIndex}
          onSelect={setRivalIndex}
          onBack={() => go('home')}
          onContinue={() => go('round')}
        />
      )}
      {screen === 'round' && market && (
        <RoundScreen
          mode={mode}
          market={market}
          rival={rival}
          side={side}
          stake={stake}
          onSide={setSide}
          onBack={() => go(mode === 'quick-call' ? 'home' : 'rivals')}
          onContinue={() => side && go('confirm')}
        />
      )}
      {screen === 'confirm' && side && market && (
        <ConfirmScreen
          mode={mode}
          market={market}
          quote={playerQuote.quote}
          quotePhase={playerQuote.phase}
          quoteError={playerQuote.error}
          onRefreshQuote={playerQuote.refresh}
          wallet={wallet}
          rival={rival}
          side={side}
          stake={stake}
          orderPhase={orderPhase}
          orderError={orderError}
          order={lastOrder}
          onSubmit={() => void submitQuickCall()}
          onBack={() => go('round')}
        />
      )}
      {screen === 'position' && quickCall.round && (
        <QuickCallPositionScreen
          state={quickCall}
          onHome={() => go('home')}
          onNewRound={() => {
            quickCall.clear()
            beginQuickCall()
          }}
        />
      )}
    </GameScreen>
  )
}

function StatusRail({ step }: { step: string }) {
  return (
    <div
      className={cnm(
        'flex items-center justify-between pb-3 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-text-2',
        RIM,
        RIM_TOP,
      )}
    >
      <span className="flex items-center gap-2">
        <span
          className="h-2 w-2 rounded-full bg-pumpy-accent"
          aria-hidden="true"
        />
        Shannon testnet
      </span>
      <span>{step}</span>
    </div>
  )
}

function MarketBadge({ state }: { state: EventMarketsState }) {
  const isLive = state.connection === 'live'
  const Icon = isLive
    ? Sparkles
    : state.connection === 'stale'
      ? WifiOff
      : LoaderCircle
  return (
    <span
      className={cnm(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.12em]',
        isLive
          ? 'border-up/40 bg-up/10 text-up'
          : 'border-pumpy-caution/40 bg-pumpy-caution/10 text-pumpy-caution',
      )}
    >
      <Icon
        className={cnm('h-3 w-3', state.phase === 'loading' && 'animate-spin')}
        aria-hidden="true"
      />
      {isLive
        ? 'DreamDEX live'
        : state.connection === 'stale'
          ? 'Live feed stale'
          : 'Syncing market'}
    </span>
  )
}

function HomeScreen({
  asset,
  marketState,
  wallet,
  testCollateral,
  hasRound,
  onAsset,
  onQuickCall,
  onBotBattle,
  onResume,
}: {
  asset: string
  marketState: EventMarketsState
  wallet: PlayerWalletControls
  testCollateral: TestCollateralControls
  hasRound: boolean
  onAsset: (asset: string) => void
  onQuickCall: () => void
  onBotBattle: () => void
  onResume: () => void
}) {
  const market = marketState.selected
  return (
    <div className="flex h-full flex-col">
      <StatusRail step="READY" />
      <div className="h-px bg-line" />
      <div className={cnm('flex min-h-0 flex-1 flex-col', RIM, RIM_BOTTOM)}>
        <div className="flex flex-1 flex-col justify-center py-5">
          {market && <MarketBadge state={marketState} />}
          <div className="mt-5 flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center overflow-hidden rounded-[18px]">
              <img
                src="/pumpy-mark.svg"
                width="48"
                height="48"
                alt=""
                className="h-12 w-12"
              />
            </div>
            <div>
              <p className="text-[28px] font-black uppercase leading-none tracking-[-0.02em] text-text">
                Pumpy
              </p>
              <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.16em] text-text-3">
                Prediction arcade on DreamDEX
              </p>
            </div>
          </div>

          <h1 className="mt-6 max-w-[18ch] text-[25px] font-black leading-[1.02] tracking-[-0.025em] text-text">
            Beat the market. Then beat the bot.
          </h1>
          <p className="mt-3 max-w-[36ch] text-[12px] font-medium leading-[1.55] text-text-2">
            Make a fast market call now, or enter a transparent bot battle.
          </p>

          <div className="mt-4 grid grid-cols-2 gap-2">
            {['BTC', 'ETH'].map((ticker) => (
              <button
                key={ticker}
                type="button"
                data-console-tap
                aria-pressed={asset === ticker}
                onClick={() => onAsset(ticker)}
                className={cnm(
                  'min-h-11 rounded-[13px] border font-mono text-[11px] font-black focus-visible:ring-2 focus-visible:ring-pumpy-accent',
                  asset === ticker
                    ? 'border-pumpy-accent/55 bg-pumpy-accent/10 text-text'
                    : 'border-line bg-surface text-text-3',
                )}
              >
                {ticker}
              </button>
            ))}
          </div>

          {marketState.phase === 'loading' && <MarketNotice kind="loading" />}
          {marketState.phase === 'error' && (
            <MarketNotice kind="error" onRetry={marketState.retry} />
          )}
          {marketState.phase === 'empty' && <MarketNotice kind="empty" />}
          {market && (
            <div className="mt-3 rounded-[15px] border border-line bg-surface/60 px-3 py-2.5">
              <p className="line-clamp-2 text-[11px] font-bold leading-[1.4] text-text">
                {market.question}
              </p>
              <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.1em] text-text-3">
                {market.intervalLabel} · operator{' '}
                {market.operatorId ?? 'unknown'} · {market.collateralSymbol}
              </p>
            </div>
          )}

          <WalletCard wallet={wallet} />
          <TestCollateralCard collateral={testCollateral} />

          {hasRound ? (
            <button
              type="button"
              data-console-tap
              onClick={onResume}
              className="mt-4 flex min-h-11 w-full items-center justify-between rounded-[18px] border border-pumpy-cyan/45 bg-pumpy-cyan/10 px-4 py-3 text-left text-sm font-bold text-text focus-visible:ring-2 focus-visible:ring-pumpy-cyan"
            >
              Resume Quick Call
              <Clock3 className="h-5 w-5 text-pumpy-cyan" aria-hidden="true" />
            </button>
          ) : (
            <button
              type="button"
              data-console-tap
              disabled={!market}
              onClick={onQuickCall}
              className="mt-4 flex min-h-11 w-full items-center justify-between rounded-[18px] border border-pumpy-accent/45 bg-pumpy-accent/10 px-4 py-3 text-left text-sm font-bold text-text disabled:cursor-not-allowed disabled:border-line disabled:bg-surface disabled:text-text-3 focus-visible:ring-2 focus-visible:ring-pumpy-accent"
            >
              Quick Call · Play now
              <ChevronRight
                className="h-5 w-5 text-pumpy-accent"
                aria-hidden="true"
              />
            </button>
          )}
          <button
            type="button"
            data-console-tap
            disabled={!market || hasRound}
            onClick={onBotBattle}
            className="mt-2 flex min-h-10 w-full items-center justify-between rounded-[15px] border border-line bg-surface px-3 text-left text-[11px] font-bold text-text-2 disabled:cursor-not-allowed disabled:text-text-3 focus-visible:ring-2 focus-visible:ring-pumpy-cyan"
          >
            Bot Battle · Proof mode
            <Bot className="h-4 w-4 text-pumpy-cyan" aria-hidden="true" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <ProofPill icon={Radio} label="Real Event Contracts" />
          <ProofPill icon={WalletCards} label="You keep custody" />
        </div>
      </div>
    </div>
  )
}

function MarketNotice({
  kind,
  onRetry,
}: {
  kind: 'loading' | 'empty' | 'error'
  onRetry?: () => void
}) {
  const copy = {
    loading: 'Finding live Event Contracts on Shannon…',
    empty:
      'No live market for this asset. Pumpy will follow the next contract automatically.',
    error: 'DreamDEX could not be reached. Your funds are unaffected.',
  }[kind]

  return (
    <div className="mt-3 flex items-center justify-between gap-3 rounded-[15px] border border-line bg-surface/65 px-3 py-2.5">
      <p className="text-[10.5px] leading-[1.4] text-text-2">{copy}</p>
      {onRetry && (
        <button
          type="button"
          aria-label="Retry DreamDEX market discovery"
          onClick={onRetry}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-surface-raised text-pumpy-accent"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      )}
    </div>
  )
}

function WalletCard({ wallet }: { wallet: PlayerWalletControls }) {
  const connected = wallet.status === 'connected'
  const wrongNetwork = wallet.status === 'wrong-network'
  const label = connected
    ? shortId(wallet.address!)
    : wrongNetwork
      ? 'Switch to Shannon'
      : wallet.status === 'connecting'
        ? 'Check wallet…'
        : wallet.status === 'unavailable'
          ? 'Install an EVM wallet'
          : 'Connect player wallet'

  return (
    <button
      type="button"
      data-console-tap
      disabled={
        wallet.status === 'unavailable' || wallet.status === 'connecting'
      }
      onClick={() => {
        if (wrongNetwork) void wallet.switchNetwork()
        else if (connected) wallet.disconnect()
        else void wallet.connect()
      }}
      className={cnm(
        'mt-3 flex min-h-10 w-full items-center justify-between rounded-[15px] border px-3 text-left focus-visible:ring-2 focus-visible:ring-pumpy-accent disabled:cursor-not-allowed',
        connected
          ? 'border-up/35 bg-up/[0.07] text-up'
          : 'border-line bg-surface text-text-2',
      )}
    >
      <span className="flex items-center gap-2 text-[11px] font-bold">
        <WalletCards className="h-4 w-4" aria-hidden="true" />
        {label}
      </span>
      <span className="font-mono text-[8px] font-bold uppercase tracking-[0.1em] text-text-3">
        {connected ? 'Disconnect' : 'Player only'}
      </span>
    </button>
  )
}

export function TestCollateralCard({
  collateral,
}: {
  collateral: TestCollateralControls
}) {
  if (collateral.phase === 'idle') {
    return null
  }

  const snapshot = collateral.snapshot
  const balance = snapshot
    ? formatDisplayUnits(snapshot.balanceRaw, snapshot.decimals)
    : null
  const funded = snapshot ? snapshot.balanceRaw >= snapshot.grantRaw : false
  const hasGas = snapshot ? snapshot.nativeBalanceRaw > 0n : true
  const busy = collateral.phase === 'loading' || collateral.phase === 'minting'

  return (
    <div className="mt-2 rounded-[15px] border border-pumpy-cyan/30 bg-pumpy-cyan/[0.06] px-3 py-2.5">
      <div
        className="flex items-center justify-between gap-2"
        aria-live="polite"
      >
        <span className="flex min-w-0 items-center gap-2 text-[10.5px] font-bold text-text">
          <CircleDollarSign
            className="h-4 w-4 text-pumpy-cyan"
            aria-hidden="true"
          />
          <span className="truncate">
            {balance === null
              ? collateral.phase === 'error'
                ? 'tUSDC balance unavailable'
                : 'Checking tUSDC balance…'
              : `${balance} ${snapshot?.symbol ?? 'tUSDC'}`}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          {funded && (
            <span className="font-mono text-[8px] font-bold uppercase tracking-[0.1em] text-up">
              Ready
            </span>
          )}
          <button
            type="button"
            data-console-tap
            aria-label="Refresh tUSDC balance"
            disabled={busy}
            onClick={() => void collateral.refresh()}
            className="grid h-7 w-7 place-items-center rounded-[9px] bg-surface-raised text-pumpy-cyan focus-visible:ring-2 focus-visible:ring-pumpy-cyan disabled:cursor-wait disabled:text-text-3"
          >
            <RefreshCw
              className={cnm('h-3.5 w-3.5', busy && 'animate-spin')}
              aria-hidden="true"
            />
          </button>
        </span>
      </div>

      {collateral.error && (
        <p className="mt-1.5 text-[9px] leading-[1.35] text-pumpy-caution">
          {collateral.error}
        </p>
      )}

      {!hasGas && (
        <p className="mt-1.5 text-[9px] leading-[1.35] text-pumpy-caution">
          Get STT from the hackathon faucet first so your wallet can pay gas.
        </p>
      )}

      {collateral.canMint && !funded && collateral.phase !== 'loading' && (
        <button
          type="button"
          data-console-tap
          disabled={busy || !hasGas}
          onClick={() => void collateral.mint()}
          className="mt-2 min-h-9 w-full rounded-[12px] bg-pumpy-cyan px-3 font-mono text-[9px] font-black uppercase tracking-[0.08em] text-bg disabled:cursor-not-allowed disabled:bg-surface-raised disabled:text-text-3"
        >
          {collateral.phase === 'minting'
            ? 'Confirming tUSDC…'
            : 'Get 20 test tUSDC'}
        </button>
      )}

      {collateral.lastHash && (
        <a
          href={shannonExplorerTxUrl(collateral.lastHash)}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex items-center gap-1 font-mono text-[8px] font-bold uppercase tracking-[0.08em] text-pumpy-cyan underline-offset-2 hover:underline"
        >
          Verified faucet transaction
          <ExternalLink className="h-3 w-3" aria-hidden="true" />
        </a>
      )}
    </div>
  )
}

function RivalScreen({
  selected,
  onSelect,
  onBack,
  onContinue,
}: {
  selected: number
  onSelect: (index: number) => void
  onBack: () => void
  onContinue: () => void
}) {
  return (
    <div className="flex h-full flex-col">
      <StatusRail step="1 · RIVAL" />
      <div className={cnm('flex items-center justify-between pb-3', RIM)}>
        <div>
          <h1 className="text-[22px] font-black leading-none text-text">
            Pick your opponent
          </h1>
          <p className="mt-1.5 text-[11px] text-text-2">
            Each bot publishes a fixed strategy.
          </p>
        </div>
        <Bot className="h-7 w-7 text-pumpy-cyan" aria-hidden="true" />
      </div>
      <div className="h-px bg-line" />

      <div
        className={cnm(
          'flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto py-3',
          RIM,
        )}
      >
        {RIVALS.map((rival, index) => {
          const active = selected === index
          return (
            <button
              key={rival.name}
              type="button"
              data-console-tap
              aria-pressed={active}
              onClick={() => onSelect(index)}
              className={cnm(
                'flex min-h-[74px] w-full items-center gap-3 rounded-[18px] border px-3 py-3 text-left focus-visible:ring-2 focus-visible:ring-pumpy-accent',
                active
                  ? 'border-pumpy-accent/55 bg-pumpy-accent/10'
                  : 'border-line bg-surface/55',
              )}
            >
              <span
                className={cnm(
                  'grid h-11 w-11 shrink-0 place-items-center rounded-[15px] bg-surface-raised font-mono text-[11px] font-black',
                  rival.accent,
                )}
              >
                {rival.shortName}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-[15px] font-extrabold text-text">
                    {rival.name}
                  </span>
                  {active && (
                    <Check
                      className="h-4 w-4 shrink-0 text-pumpy-accent"
                      aria-hidden="true"
                    />
                  )}
                </span>
                <span className="mt-1 block font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-text-3">
                  {rival.signal}
                </span>
              </span>
            </button>
          )
        })}
      </div>

      <div
        className={cnm('grid grid-cols-[auto_1fr] gap-2 pt-2', RIM, RIM_BOTTOM)}
      >
        <IconButton label="Back" onClick={onBack} icon={ArrowLeft} />
        <button
          type="button"
          data-console-tap
          onClick={onContinue}
          className="min-h-11 rounded-[16px] bg-pumpy-accent px-4 text-sm font-black text-pumpy-accent-ink focus-visible:ring-2 focus-visible:ring-white"
        >
          Face {RIVALS[selected].name}
        </button>
      </div>
    </div>
  )
}

function RoundScreen({
  mode,
  market,
  rival,
  side,
  stake,
  onSide,
  onBack,
  onContinue,
}: {
  mode: PumpyGameMode
  market: PumpyEventMarket
  rival: Rival
  side: Side | null
  stake: number
  onSide: (side: Side) => void
  onBack: () => void
  onContinue: () => void
}) {
  const countdown = useCountdown(market.expiresAt)
  return (
    <div className="flex h-full flex-col">
      <StatusRail
        step={mode === 'quick-call' ? '1 · QUICK CALL' : '2 · CALL'}
      />
      <div className={cnm('flex items-start justify-between pb-3', RIM)}>
        <div>
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.13em] text-text-3">
            {market.asset} ·{' '}
            {market.reference === 'opening-price'
              ? 'Opening price'
              : 'Fixed strike'}{' '}
            · {market.intervalLabel}
          </p>
          <h1 className="mt-1 line-clamp-2 text-[20px] font-black leading-tight text-text">
            {market.question}
          </h1>
        </div>
        <div className="text-right">
          <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-text-3">
            Closes in
          </p>
          <p className="font-mono text-[17px] font-bold text-pumpy-caution">
            {countdown}
          </p>
        </div>
      </div>
      <div className="h-px bg-line" />

      <div
        className={cnm('flex min-h-0 flex-1 flex-col py-3', RIM, RIM_BOTTOM)}
      >
        {mode === 'bot-battle' ? (
          <div className="rounded-[18px] border border-pumpy-cyan/35 bg-pumpy-cyan/[0.08] p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <ShieldCheck
                  className="h-4 w-4 text-pumpy-cyan"
                  aria-hidden="true"
                />
                <span className="text-[12px] font-bold text-text">
                  {rival.name} strategy preview
                </span>
              </div>
              <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-pumpy-caution">
                Not committed
              </span>
            </div>
            <div className="mt-3 flex items-end justify-between gap-3">
              <div>
                <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-text-3">
                  Bot call
                </p>
                <p className="mt-0.5 text-[23px] font-black text-up">UP</p>
              </div>
              <div className="text-right">
                <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-text-3">
                  Estimate
                </p>
                <p className="mt-0.5 font-mono text-[18px] font-bold text-text">
                  64%
                </p>
              </div>
            </div>
            <p className="mt-2 text-[10.5px] leading-[1.45] text-text-2">
              Short-window momentum remains positive while volatility stays
              inside the strategy cap.
            </p>
            <p className="mt-2 font-mono text-[8.5px] uppercase tracking-[0.08em] text-text-3">
              A real trade stays locked until this call has an on-chain proof.
            </p>
          </div>
        ) : (
          <div className="rounded-[18px] border border-pumpy-accent/35 bg-pumpy-accent/[0.07] p-3">
            <div className="flex items-center gap-2">
              <Radio className="h-4 w-4 text-pumpy-accent" aria-hidden="true" />
              <span className="text-[12px] font-bold text-text">
                One live market. One call.
              </span>
            </div>
            <p className="mt-2 text-[10.5px] leading-[1.45] text-text-2">
              Pick UP or DOWN. Pumpy fetches executable terms before your wallet
              signs a native DreamDEX position.
            </p>
            <p className="mt-2 font-mono text-[8.5px] uppercase tracking-[0.08em] text-text-3">
              No bot is involved in Quick Call
            </p>
          </div>
        )}

        <p className="mt-4 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-text-3">
          Your call · {stake} {market.collateralSymbol}
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <SideButton
            side="UP"
            active={side === 'UP'}
            onClick={() => onSide('UP')}
          />
          <SideButton
            side="DOWN"
            active={side === 'DOWN'}
            onClick={() => onSide('DOWN')}
          />
        </div>

        <div className="mt-auto grid grid-cols-[auto_1fr] gap-2 pt-4">
          <IconButton label="Back" onClick={onBack} icon={ArrowLeft} />
          <button
            type="button"
            data-console-tap
            disabled={!side}
            onClick={onContinue}
            className="min-h-11 rounded-[16px] bg-pumpy-accent px-4 text-sm font-black text-pumpy-accent-ink disabled:cursor-not-allowed disabled:bg-surface-raised disabled:text-text-3 focus-visible:ring-2 focus-visible:ring-white"
          >
            {side ? `Review ${side}` : 'Choose UP or DOWN'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ConfirmScreen({
  mode,
  market,
  quote,
  quotePhase,
  quoteError,
  onRefreshQuote,
  wallet,
  rival,
  side,
  stake,
  orderPhase,
  orderError,
  order,
  onSubmit,
  onBack,
}: {
  mode: PumpyGameMode
  market: PumpyEventMarket
  quote: PreparedPlayerTrade | null
  quotePhase: 'idle' | 'loading' | 'ready' | 'error'
  quoteError: string | null
  onRefreshQuote: () => void
  wallet: PlayerWalletControls
  rival: Rival
  side: Side
  stake: number
  orderPhase: OrderPhase
  orderError: string | null
  order: PlayerOrderOutcome | null
  onSubmit: () => void
  onBack: () => void
}) {
  const decimals = quote?.collateralDecimals ?? market.collateralDecimals
  const price = quote
    ? Number(formatUnits(quote.outcomeLimitPriceRaw, decimals))
    : null
  const payout = quote ? formatDisplayUnits(quote.quantityRaw, decimals) : null
  const maxLoss = quote
    ? formatDisplayUnits(quote.escrowRaw, decimals)
    : stake.toFixed(2)
  const walletAction =
    orderPhase === 'submitting'
      ? 'Waiting for confirmation…'
      : wallet.status === 'wrong-network'
        ? 'Switch to Shannon'
        : wallet.status === 'connecting'
          ? 'Check wallet…'
          : wallet.status === 'connected'
            ? quotePhase === 'loading'
              ? 'Refreshing quote…'
              : quotePhase === 'error'
                ? 'Refresh quote'
                : quote?.hasEnoughBalance === false
                  ? `Need ${market.collateralSymbol}`
                  : mode === 'quick-call'
                    ? `Lock in ${side}`
                    : 'Bot proof required'
            : wallet.status === 'unavailable'
              ? 'Install an EVM wallet'
              : 'Connect wallet'
  const walletActionDisabled =
    wallet.status === 'unavailable' ||
    wallet.status === 'connecting' ||
    orderPhase === 'submitting' ||
    (wallet.status === 'connected' &&
      (mode === 'bot-battle' ||
        (quotePhase !== 'ready' && quotePhase !== 'error') ||
        quote?.hasEnoughBalance === false))

  return (
    <div className="flex h-full flex-col">
      <StatusRail step={mode === 'quick-call' ? '2 · REVIEW' : '3 · REVIEW'} />
      <div className={cnm('flex items-center justify-between pb-3', RIM)}>
        <div>
          <h1 className="text-[21px] font-black text-text">Check the trade</h1>
          <p className="mt-1 text-[10.5px] text-text-2">
            Exact live terms. Your wallet signs the player trade.
          </p>
        </div>
        <LockKeyhole className="h-6 w-6 text-pumpy-accent" aria-hidden="true" />
      </div>
      <div className="h-px bg-line" />

      <div
        className={cnm('flex min-h-0 flex-1 flex-col py-3', RIM, RIM_BOTTOM)}
      >
        <div className="flex items-center justify-between rounded-[18px] bg-surface-raised p-3">
          <div>
            <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-text-3">
              Your side
            </p>
            <p
              className={cnm(
                'mt-1 text-[24px] font-black',
                side === 'UP' ? 'text-up' : 'text-down',
              )}
            >
              {side}
            </p>
          </div>
          <ArrowRight className="h-5 w-5 text-text-3" aria-hidden="true" />
          <div className="text-right">
            <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-text-3">
              {mode === 'quick-call' ? 'On' : 'Against'}
            </p>
            <p className="mt-1 text-[13px] font-bold text-text">
              {mode === 'quick-call'
                ? `${market.asset} Event Contract`
                : rival.name}
            </p>
            <p className="font-mono text-[9px] uppercase text-text-3">
              {mode === 'quick-call' ? market.intervalLabel : 'Bot: UP'}
            </p>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-[18px] bg-line">
          <Readout
            label="Stake"
            value={`${stake.toFixed(2)} ${market.collateralSymbol}`}
          />
          <Readout
            label="Possible payout"
            value={
              payout
                ? `${payout} ${market.collateralSymbol}`
                : quotePhase === 'loading'
                  ? 'Quoting…'
                  : 'Unavailable'
            }
          />
          <Readout
            label="Maximum loss"
            value={`${maxLoss} ${market.collateralSymbol}`}
          />
          <Readout
            label="Protected limit"
            value={price ? `${formatCents(price)}¢` : 'No liquidity'}
          />
        </div>

        {quoteError && (
          <div className="mt-3 flex items-center justify-between gap-2 rounded-[14px] border border-pumpy-caution/35 bg-pumpy-caution/[0.08] px-3 py-2">
            <p className="text-[9.5px] leading-[1.35] text-pumpy-caution">
              {quoteError}
            </p>
            <button
              type="button"
              aria-label="Refresh executable quote"
              onClick={onRefreshQuote}
              className="grid h-7 w-7 shrink-0 place-items-center rounded-[9px] bg-surface-raised"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        )}

        {(orderError || orderPhase === 'unfilled' || orderPhase === 'open') && (
          <div className="mt-2 rounded-[14px] border border-pumpy-caution/35 bg-pumpy-caution/[0.08] px-3 py-2">
            <p className="text-[9.5px] leading-[1.35] text-pumpy-caution">
              {orderError ??
                (orderPhase === 'unfilled'
                  ? 'The order landed but found no fill. Your choice was not counted; refresh and try again.'
                  : 'The order is still open on the book. Review the transaction before trying again.')}
            </p>
            {order && (
              <a
                href={shannonExplorerTxUrl(order.hash)}
                target="_blank"
                rel="noreferrer"
                className="mt-1.5 inline-flex min-h-10 items-center gap-1 font-mono text-[8px] font-bold uppercase text-pumpy-cyan underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-pumpy-cyan"
              >
                View submitted order
                <ExternalLink className="h-3 w-3" aria-hidden="true" />
              </a>
            )}
          </div>
        )}

        {quote?.walletBalanceRaw !== null && quote && (
          <p className="mt-2 font-mono text-[8.5px] uppercase tracking-[0.08em] text-text-3">
            Wallet balance ·{' '}
            {formatDisplayUnits(quote.walletBalanceRaw, decimals)}{' '}
            {market.collateralSymbol}
          </p>
        )}

        <div className="mt-3 rounded-[16px] border border-line px-3 py-2.5">
          <div className="flex items-center gap-2">
            <Radio className="h-4 w-4 text-pumpy-caution" aria-hidden="true" />
            <p className="text-[11px] font-bold text-text">Settlement</p>
          </div>
          <p className="mt-1.5 text-[10px] leading-[1.45] text-text-2">
            DreamDEX market {shortId(market.marketId)} settles this exact
            question: {market.question}
          </p>
        </div>

        <div className="mt-auto grid grid-cols-[auto_1fr] gap-2 pt-4">
          <IconButton label="Back" onClick={onBack} icon={ArrowLeft} />
          <button
            type="button"
            data-console-tap
            disabled={walletActionDisabled}
            onClick={() => {
              if (wallet.status === 'wrong-network') void wallet.switchNetwork()
              else if (wallet.status === 'connected') {
                if (quotePhase === 'error') onRefreshQuote()
                else if (mode === 'quick-call') onSubmit()
              } else void wallet.connect()
            }}
            aria-busy={orderPhase === 'submitting'}
            className="min-h-11 rounded-[16px] bg-pumpy-accent px-4 text-sm font-black text-pumpy-accent-ink motion-safe:transition-transform motion-safe:duration-100 active:translate-y-px disabled:cursor-not-allowed disabled:bg-surface-raised disabled:text-text-3 focus-visible:ring-2 focus-visible:ring-white"
          >
            {walletAction}
          </button>
        </div>
      </div>
    </div>
  )
}

function QuickCallPositionScreen({
  state,
  onHome,
  onNewRound,
}: {
  state: QuickCallControls
  onHome: () => void
  onNewRound: () => void
}) {
  const round = state.round!
  const snapshot = state.snapshot
  const chainPhase = snapshot?.phase ?? 'indexing'
  const isTerminal = ['claimed', 'lost'].includes(chainPhase)
  const title = {
    indexing: 'Order confirmed',
    live: 'Your call is live',
    claimable: 'You called it',
    won: 'Winning call detected',
    lost: 'Market called it differently',
    voided: 'Market voided',
    claimed: 'Payout claimed',
  }[chainPhase]
  const message = {
    indexing:
      'DreamDEX is indexing the filled position. The receipt is already final.',
    live: 'The position is onchain. Pumpy will follow it through resolution.',
    claimable:
      'DreamDEX reports this position as claimable. Claim sends the payout to your wallet.',
    won: 'The market resolved in your direction. Claimability is still syncing.',
    lost: 'This position has resolved with no payout to claim.',
    voided: 'Both sides may redeem according to the market’s void payout rule.',
    claimed:
      'The claim receipt is confirmed and the payout was routed to your wallet.',
  }[chainPhase]
  const phaseColor =
    chainPhase === 'lost'
      ? 'text-down'
      : chainPhase === 'claimable' || chainPhase === 'claimed'
        ? 'text-up'
        : 'text-pumpy-cyan'

  return (
    <div className="flex h-full flex-col">
      <StatusRail step="3 · POSITION" />
      <div className={cnm('flex items-start justify-between pb-3', RIM)}>
        <div>
          <p className="font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-text-3">
            {round.asset} · Quick Call
          </p>
          <h1 className={cnm('mt-1 text-[21px] font-black', phaseColor)}>
            {title}
          </h1>
        </div>
        {state.phase === 'loading' || state.phase === 'claiming' ? (
          <LoaderCircle
            className="h-6 w-6 animate-spin text-pumpy-cyan motion-reduce:animate-none"
            aria-label="Refreshing position"
          />
        ) : (
          <Trophy className="h-6 w-6 text-pumpy-accent" aria-hidden="true" />
        )}
      </div>
      <div className="h-px bg-line" />

      <div
        className={cnm('flex min-h-0 flex-1 flex-col py-3', RIM, RIM_BOTTOM)}
      >
        <div className="rounded-[18px] border border-line bg-surface/70 p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-text-3">
                Your call
              </p>
              <p
                className={cnm(
                  'mt-0.5 text-[24px] font-black',
                  round.side === 'UP' ? 'text-up' : 'text-down',
                )}
              >
                {round.side}
              </p>
            </div>
            <div className="text-right">
              <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-text-3">
                Fill
              </p>
              <p className="mt-1 font-mono text-[14px] font-bold text-text">
                {formatDisplayUnits(
                  BigInt(round.filledQuantityRaw),
                  round.collateralDecimals,
                )}{' '}
                shares
              </p>
              <p className="font-mono text-[8px] uppercase text-text-3">
                {round.orderStatus}
              </p>
            </div>
          </div>
          <p className="mt-2 line-clamp-2 text-[10.5px] leading-[1.45] text-text-2">
            {round.question}
          </p>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-[18px] bg-line">
          <Readout
            label="Position"
            value={
              snapshot
                ? `${formatDisplayUnits(snapshot.positionRaw, round.collateralDecimals)} shares`
                : 'Syncing…'
            }
          />
          <Readout
            label="Est. payout"
            value={
              snapshot?.estimatedPayoutRaw
                ? `${formatDisplayUnits(snapshot.estimatedPayoutRaw, round.collateralDecimals)} ${round.collateralSymbol}`
                : '—'
            }
          />
        </div>

        <div
          className="mt-3 rounded-[16px] border border-pumpy-cyan/30 bg-pumpy-cyan/[0.06] px-3 py-2.5"
          aria-live="polite"
        >
          <p className="text-[11px] font-bold text-text">{title}</p>
          <p className="mt-1 text-[9.5px] leading-[1.4] text-text-2">
            {message}
          </p>
          {state.error && (
            <p className="mt-1.5 text-[9.5px] text-pumpy-caution">
              {state.error} Try refresh again; your onchain position is
              unchanged.
            </p>
          )}
        </div>

        <div className="mt-2 flex flex-wrap gap-2">
          <ProofLink hash={round.orderHash} label="Order receipt" />
          {snapshot?.resolutionHash && (
            <ProofLink hash={snapshot.resolutionHash} label="Resolution" />
          )}
          {round.claimHash && (
            <ProofLink hash={round.claimHash} label="Claim" />
          )}
        </div>

        <div className="mt-auto grid grid-cols-[auto_1fr] gap-2 pt-4">
          <IconButton label="Home" onClick={onHome} icon={ArrowLeft} />
          {snapshot?.phase === 'claimable' ? (
            <button
              type="button"
              data-console-tap
              disabled={state.phase === 'claiming'}
              onClick={() => void state.claim()}
              aria-busy={state.phase === 'claiming'}
              className="min-h-11 rounded-[16px] bg-pumpy-accent px-4 text-sm font-black text-pumpy-accent-ink disabled:cursor-wait disabled:bg-surface-raised disabled:text-text-3 focus-visible:ring-2 focus-visible:ring-white"
            >
              {state.phase === 'claiming'
                ? 'Confirming claim…'
                : 'Claim payout'}
            </button>
          ) : isTerminal ? (
            <button
              type="button"
              data-console-tap
              onClick={onNewRound}
              className="min-h-11 rounded-[16px] bg-pumpy-accent px-4 text-sm font-black text-pumpy-accent-ink focus-visible:ring-2 focus-visible:ring-white"
            >
              New Quick Call
            </button>
          ) : (
            <button
              type="button"
              data-console-tap
              disabled={state.phase === 'loading'}
              onClick={() => void state.refresh()}
              className="min-h-11 rounded-[16px] border border-line bg-surface px-4 text-sm font-black text-text disabled:cursor-wait disabled:text-text-3 focus-visible:ring-2 focus-visible:ring-pumpy-cyan"
            >
              Refresh chain state
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function ProofLink({ hash, label }: { hash: `0x${string}`; label: string }) {
  return (
    <a
      href={shannonExplorerTxUrl(hash)}
      target="_blank"
      rel="noreferrer"
      className="inline-flex min-h-10 items-center gap-1 rounded-[12px] border border-line bg-surface px-2.5 font-mono text-[8px] font-bold uppercase tracking-[0.08em] text-pumpy-cyan focus-visible:ring-2 focus-visible:ring-pumpy-cyan"
    >
      {label}
      <ExternalLink className="h-3 w-3" aria-hidden="true" />
    </a>
  )
}

function formatDisplayUnits(value: bigint, decimals: number): string {
  const [whole, fraction = ''] = formatUnits(value, decimals).split('.')
  const trimmed = fraction.slice(0, 3).replace(/0+$/, '')
  return trimmed ? `${whole}.${trimmed}` : whole
}

function formatCents(price: number): string {
  return (price * 100).toFixed(price < 0.1 ? 1 : 0)
}

function isWalletRejection(cause: unknown): boolean {
  if (!cause || typeof cause !== 'object') return false
  if ('code' in cause && cause.code === 4_001) return true
  if ('cause' in cause) return isWalletRejection(cause.cause)
  return false
}

function shortId(value: string): string {
  return `${value.slice(0, 6)}…${value.slice(-4)}`
}

function useCountdown(expiresAt: number): string {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1_000))

  useEffect(() => {
    const timer = window.setInterval(
      () => setNow(Math.floor(Date.now() / 1_000)),
      1_000,
    )
    return () => window.clearInterval(timer)
  }, [])

  const seconds = Math.max(0, expiresAt - now)
  const hours = Math.floor(seconds / 3_600)
  const minutes = Math.floor((seconds % 3_600) / 60)
  const remainder = seconds % 60
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
}

function ProofPill({
  icon: Icon,
  label,
}: {
  icon: typeof LockKeyhole
  label: string
}) {
  return (
    <div className="flex min-h-12 items-center gap-2 rounded-[15px] border border-line bg-surface/65 px-3">
      <Icon className="h-4 w-4 shrink-0 text-pumpy-cyan" aria-hidden="true" />
      <span className="text-[10px] font-bold leading-tight text-text-2">
        {label}
      </span>
    </div>
  )
}

function SideButton({
  side,
  active,
  onClick,
}: {
  side: Side
  active: boolean
  onClick: () => void
}) {
  const isUp = side === 'UP'
  const Icon = isUp ? ArrowRight : ArrowDown
  return (
    <button
      type="button"
      data-console-tap
      aria-pressed={active}
      onClick={onClick}
      className={cnm(
        'flex min-h-[64px] items-center justify-between rounded-[18px] border px-3 focus-visible:ring-2 focus-visible:ring-white',
        isUp
          ? active
            ? 'border-up bg-up/[0.18] text-up'
            : 'border-up/30 bg-up/[0.06] text-up'
          : active
            ? 'border-down bg-down/[0.18] text-down'
            : 'border-down/30 bg-down/[0.06] text-down',
      )}
    >
      <span className="text-[19px] font-black">{side}</span>
      <Icon
        className={cnm('h-5 w-5', isUp && '-rotate-45')}
        aria-hidden="true"
      />
    </button>
  )
}

function IconButton({
  label,
  icon: Icon,
  onClick,
}: {
  label: string
  icon: typeof ArrowLeft
  onClick: () => void
}) {
  return (
    <button
      type="button"
      data-console-tap
      aria-label={label}
      onClick={onClick}
      className="grid h-11 w-11 place-items-center rounded-[15px] border border-line bg-surface text-text-2 focus-visible:ring-2 focus-visible:ring-pumpy-accent"
    >
      <Icon className="h-5 w-5" aria-hidden="true" />
    </button>
  )
}

function Readout({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface px-3 py-2.5">
      <p className="font-mono text-[9px] uppercase tracking-[0.11em] text-text-3">
        {label}
      </p>
      <p className="mt-1 font-mono text-[15px] font-bold text-text">{value}</p>
    </div>
  )
}
