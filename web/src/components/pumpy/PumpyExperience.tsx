import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Bot,
  Check,
  ChevronRight,
  CircleDollarSign,
  ExternalLink,
  LoaderCircle,
  LockKeyhole,
  Radio,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  WalletCards,
  WifiOff,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { formatUnits } from 'viem'
import type { ConsoleControls } from '@/components/console/controls'
import type {
  EventMarketsState,
  PlayerSide,
  PreparedPlayerTrade,
  PumpyEventMarket,
} from '@/lib/dreamdex/types'
import { useConsoleControls } from '@/components/console/controls'
import { GameScreen } from '@/components/game/screen'
import { shannonExplorerTxUrl } from '@/lib/dreamdex/network'
import { useEventMarkets } from '@/lib/dreamdex/useEventMarkets'
import { usePlayerQuote } from '@/lib/dreamdex/usePlayerQuote'
import { useTestCollateral } from '@/lib/dreamdex/useTestCollateral'
import { usePlayerWallet } from '@/lib/dreamdex/usePlayerWallet'
import { haptic } from '@/lib/haptics'
import { cnm } from '@/utils/style'

type Screen = 'home' | 'rivals' | 'round' | 'confirm'
type Side = PlayerSide

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

export function PumpyExperience() {
  const [screen, setScreen] = useState<Screen>('home')
  const [rivalIndex, setRivalIndex] = useState(0)
  const [side, setSide] = useState<Side | null>(null)
  const [stakeIndex, setStakeIndex] = useState(1)
  const [asset, setAsset] = useState('BTC')
  const eventMarkets = useEventMarkets(asset)
  const wallet = usePlayerWallet()

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
    setScreen((current) => (current === 'confirm' ? 'round' : current))
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
          label: 'PLAY',
          color: 'amber' as const,
          loading: eventMarkets.phase === 'loading',
          onPress: () => {
            if (market) go('rivals')
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
          left: market?.intervalLabel ?? 'NO MARKET',
          right: `${stake} ${market?.collateralSymbol ?? ''}`,
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
        label: 'PROOF',
        color: 'neutral' as const,
        onPress: () => undefined,
      },
      main: {
        label:
          wallet.status === 'connected'
            ? 'PROOF NEXT'
            : wallet.status === 'wrong-network'
              ? 'SWITCH'
              : wallet.status === 'connecting'
                ? 'CHECK WALLET'
                : 'CONNECT',
        color:
          wallet.status === 'connected'
            ? ('neutral' as const)
            : ('amber' as const),
        loading: wallet.status === 'connecting',
        onPress: () => {
          if (wallet.status === 'wrong-network') void wallet.switchNetwork()
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
    eventMarkets.connection,
    eventMarkets.phase,
    go,
    market,
    moveRival,
    rivalIndex,
    screen,
    side,
    stake,
    stakeIndex,
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
          onContinue={() => market && go('rivals')}
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
          market={market}
          rival={rival}
          side={side}
          stake={stake}
          onSide={setSide}
          onBack={() => go('rivals')}
          onContinue={() => side && go('confirm')}
        />
      )}
      {screen === 'confirm' && side && market && (
        <ConfirmScreen
          market={market}
          quote={playerQuote.quote}
          quotePhase={playerQuote.phase}
          quoteError={playerQuote.error}
          onRefreshQuote={playerQuote.refresh}
          wallet={wallet}
          rival={rival}
          side={side}
          stake={stake}
          onBack={() => go('round')}
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
  onAsset,
  onContinue,
}: {
  asset: string
  marketState: EventMarketsState
  wallet: PlayerWalletControls
  testCollateral: TestCollateralControls
  onAsset: (asset: string) => void
  onContinue: () => void
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
                Player vs transparent bot
              </p>
            </div>
          </div>

          <h1 className="mt-6 max-w-[18ch] text-[25px] font-black leading-[1.02] tracking-[-0.025em] text-text">
            Beat the market. Then beat the bot.
          </h1>
          <p className="mt-3 max-w-[36ch] text-[12px] font-medium leading-[1.55] text-text-2">
            Your wallet. The bot’s public call. One DreamDEX market decides the
            round.
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

          <button
            type="button"
            data-console-tap
            disabled={!market}
            onClick={onContinue}
            className="mt-4 flex min-h-11 w-full items-center justify-between rounded-[18px] border border-pumpy-accent/45 bg-pumpy-accent/10 px-4 py-3 text-left text-sm font-bold text-text disabled:cursor-not-allowed disabled:border-line disabled:bg-surface disabled:text-text-3 focus-visible:ring-2 focus-visible:ring-pumpy-accent"
          >
            Choose your rival
            <ChevronRight
              className="h-5 w-5 text-pumpy-accent"
              aria-hidden="true"
            />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <ProofPill icon={LockKeyhole} label="Bot commits first" />
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
  market,
  rival,
  side,
  stake,
  onSide,
  onBack,
  onContinue,
}: {
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
      <StatusRail step="2 · CALL" />
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
            Short-window momentum remains positive while volatility stays inside
            the strategy cap.
          </p>
          <p className="mt-2 font-mono text-[8.5px] uppercase tracking-[0.08em] text-text-3">
            A real trade stays locked until this call has an on-chain proof.
          </p>
        </div>

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
  market,
  quote,
  quotePhase,
  quoteError,
  onRefreshQuote,
  wallet,
  rival,
  side,
  stake,
  onBack,
}: {
  market: PumpyEventMarket
  quote: PreparedPlayerTrade | null
  quotePhase: 'idle' | 'loading' | 'ready' | 'error'
  quoteError: string | null
  onRefreshQuote: () => void
  wallet: PlayerWalletControls
  rival: Rival
  side: Side
  stake: number
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
    wallet.status === 'wrong-network'
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
                : 'Bot proof required'
          : wallet.status === 'unavailable'
            ? 'Install an EVM wallet'
            : 'Connect wallet'
  const walletActionDisabled =
    wallet.status === 'unavailable' ||
    wallet.status === 'connecting' ||
    (wallet.status === 'connected' && quotePhase !== 'error')

  return (
    <div className="flex h-full flex-col">
      <StatusRail step="3 · REVIEW" />
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
              Against
            </p>
            <p className="mt-1 text-[13px] font-bold text-text">{rival.name}</p>
            <p className="font-mono text-[9px] uppercase text-up">Bot: UP</p>
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
            disabled={walletActionDisabled}
            onClick={() => {
              if (wallet.status === 'wrong-network') void wallet.switchNetwork()
              else if (wallet.status === 'connected') onRefreshQuote()
              else void wallet.connect()
            }}
            className="min-h-11 rounded-[16px] bg-pumpy-accent px-4 text-sm font-black text-pumpy-accent-ink disabled:cursor-not-allowed disabled:bg-surface-raised disabled:text-text-3"
          >
            {walletAction}
          </button>
        </div>
      </div>
    </div>
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
