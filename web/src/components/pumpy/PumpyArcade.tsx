import {
  Activity,
  CandlestickChart,
  CircleDollarSign,
  Clock3,
  Gamepad2,
  LoaderCircle,
  Sparkles,
  WalletCards,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { formatUnits } from 'viem'

import type { ConsoleControls } from '@/components/console/controls'
import type { LiveAssetPriceState } from '@/lib/dreamdex/useLiveAssetPrice'
import type {
  PlayerOrderOutcome,
  PlayerSide,
  PreparedPlayerTrade,
  PumpyEventMarket,
} from '@/lib/dreamdex/types'
import { useConsoleControls } from '@/components/console/controls'
import { LivePrice } from '@/components/game/LivePrice'
import { LivePriceChart } from '@/components/game/LivePriceChart'
import { LuckyWheels } from '@/components/game/LuckyWheels'
import { GameScreen, SCREEN_STATES, ScreenMessage } from '@/components/game/screen'
import { TestCollateralCard } from '@/components/pumpy/PumpyExperience'
import { useEventMarkets } from '@/lib/dreamdex/useEventMarkets'
import { useLiveAssetPrice } from '@/lib/dreamdex/useLiveAssetPrice'
import { usePlayerQuote } from '@/lib/dreamdex/usePlayerQuote'
import { usePlayerWallet } from '@/lib/dreamdex/usePlayerWallet'
import { useQuickCallRound } from '@/lib/dreamdex/useQuickCallRound'
import { useTestCollateral } from '@/lib/dreamdex/useTestCollateral'
import { placePreparedPlayerTrade } from '@/lib/dreamdex/trade'
import { haptic, hapticPattern } from '@/lib/haptics'
import { recordPlayerTrade } from '@/lib/pumpy/playerProfile'
import { slotPick, slotSpin } from '@/lib/sound'
import { cnm } from '@/utils/style'

type ArcadeScreen = 'hub' | 'lucky' | 'position' | 'candle-hop'
type LuckyPhase = 'idle' | 'spinning' | 'dealt' | 'submitting' | 'error'

const STAKES = [1, 5, 10, 25, 50] as const
const RIM = 'px-[var(--screen-rim,24px)]'
const RIM_TOP = 'pt-[calc(var(--screen-rim,24px)+6px)]'
const RIM_BOTTOM = 'pb-[calc(var(--screen-rim,24px)+var(--screen-notch,0px))]'

const GAMES = [
  {
    id: 'lucky',
    name: 'I Feel Lucky',
    description: 'Spin a direction. DreamDEX sets the real odds.',
    kind: 'LIVE',
    icon: Sparkles,
    enabled: true,
  },
  {
    id: 'candle-hop',
    name: 'Candle Hop',
    description: 'One-button arcade. No funds, just score.',
    kind: 'ARCADE',
    icon: CandlestickChart,
    enabled: true,
  },
  {
    id: 'line-rider',
    name: 'Line Rider',
    description: 'Ride the market line with the big wheel.',
    kind: 'NEXT',
    icon: Activity,
    enabled: false,
  },
  {
    id: 'range',
    name: 'Range',
    description: 'Binary composition under protocol review.',
    kind: 'LAB',
    icon: Gamepad2,
    enabled: false,
  },
] as const

export function PumpyArcade({ homeSignal = 0 }: { homeSignal?: number }) {
  const [screen, setScreen] = useState<ArcadeScreen>('hub')
  const [asset, setAsset] = useState('BTC')
  const [selectedGame, setSelectedGame] = useState(0)
  const [stakeIndex, setStakeIndex] = useState(1)
  const [luckyPhase, setLuckyPhase] = useState<LuckyPhase>('idle')
  const [side, setSide] = useState<PlayerSide | null>(null)
  const [orderError, setOrderError] = useState<string | null>(null)
  const [lastOrder, setLastOrder] = useState<PlayerOrderOutcome | null>(null)
  const spinStartedAt = useRef(0)
  const settleTimerRef = useRef<number | null>(null)

  const markets = useEventMarkets(asset)
  const livePrice = useLiveAssetPrice(asset)
  const wallet = usePlayerWallet()
  const market = markets.selected
  const stake = STAKES[stakeIndex]
  const quickCall = useQuickCallRound({
    address: wallet.address,
    session: wallet.session,
  })
  const testCollateral = useTestCollateral({ market, wallet })
  const quote = usePlayerQuote({
    market,
    side,
    stake,
    account: wallet.address,
    enabled: luckyPhase === 'spinning' || luckyPhase === 'dealt',
  })
  const multiplier = quote.quote ? quoteMultiplier(quote.quote) : undefined

  const go = useCallback((next: ArcadeScreen) => {
    haptic('selection')
    setScreen(next)
  }, [])

  useEffect(() => {
    if (homeSignal === 0) return
    setScreen('hub')
  }, [homeSignal])

  useEffect(() => () => {
    if (settleTimerRef.current) window.clearTimeout(settleTimerRef.current)
  }, [])

  useEffect(() => {
    if (luckyPhase !== 'spinning' || quote.phase !== 'ready') return
    const elapsed = Date.now() - spinStartedAt.current
    const wait = Math.max(1020, 1320 - elapsed)
    settleTimerRef.current = window.setTimeout(() => {
      slotPick()
      haptic('low')
      setLuckyPhase('dealt')
    }, wait)
    return () => {
      if (settleTimerRef.current) window.clearTimeout(settleTimerRef.current)
      settleTimerRef.current = null
    }
  }, [luckyPhase, quote.phase])

  useEffect(() => {
    setLuckyPhase('idle')
    setSide(null)
    setOrderError(null)
    setLastOrder(null)
  }, [market?.marketId])

  const launchSelected = useCallback((index = selectedGame) => {
    const selected = GAMES[index]
    if (!selected.enabled) {
      haptic('warning')
      return
    }
    if (selected.id === 'lucky') go('lucky')
    if (selected.id === 'candle-hop') go('candle-hop')
  }, [go, selectedGame])

  const spin = useCallback(() => {
    if (!market || markets.connection !== 'live' || luckyPhase !== 'idle') return
    const bytes = new Uint8Array(1)
    crypto.getRandomValues(bytes)
    setSide(bytes[0] % 2 === 0 ? 'UP' : 'DOWN')
    setOrderError(null)
    setLastOrder(null)
    spinStartedAt.current = Date.now()
    setLuckyPhase('spinning')
    slotSpin()
  }, [luckyPhase, market, markets.connection])

  const reroll = useCallback(() => {
    setSide(null)
    setLuckyPhase('idle')
    setOrderError(null)
    setLastOrder(null)
  }, [])

  const submit = useCallback(async () => {
    if (wallet.status === 'wrong-network') {
      await wallet.switchNetwork()
      return
    }
    if (wallet.status !== 'connected' || !wallet.session) {
      await wallet.connect()
      return
    }
    if (!market || !quote.quote || !side || luckyPhase !== 'dealt') {
      quote.refresh()
      return
    }

    setLuckyPhase('submitting')
    setOrderError(null)
    try {
      const outcome = await placePreparedPlayerTrade({
        trade: quote.quote,
        market,
        wallet: wallet.session,
        mode: 'quick-call',
      })
      setLastOrder(outcome)
      if (outcome.status === 'filled' || outcome.status === 'partial') {
        quickCall.recordOrder({ market, trade: quote.quote, outcome })
        recordPlayerTrade({
          storage: window.localStorage,
          account: wallet.address!,
          market,
          trade: quote.quote,
          outcome,
        })
        void testCollateral.refresh()
        haptic('success')
        go('position')
      } else {
        haptic('warning')
        setOrderError(
          outcome.status === 'open'
            ? 'The remainder is resting on DreamDEX. Review it before retrying.'
            : 'The live price moved before the IOC order could fill. Spin again.',
        )
        setLuckyPhase('error')
      }
    } catch (cause) {
      if (isWalletRejection(cause)) {
        setLuckyPhase('dealt')
        return
      }
      hapticPattern('lose')
      setOrderError(
        cause instanceof Error ? cause.message : 'The order did not complete',
      )
      setLuckyPhase('error')
    }
  }, [go, luckyPhase, market, quote, quickCall, side, testCollateral, wallet])

  const controls = useMemo<ConsoleControls>(() => {
    if (screen === 'hub') {
      return {
        action1: {
          label: 'PREV',
          color: 'neutral',
          onPress: () => setSelectedGame((value) => Math.max(0, value - 1)),
        },
        action2: {
          label: 'NEXT',
          color: 'neutral',
          onPress: () =>
            setSelectedGame((value) => Math.min(GAMES.length - 1, value + 1)),
        },
        knob: {
          label: 'GAME',
          min: 0,
          max: GAMES.length - 1,
          step: 1,
          value: GAMES.length - 1 - selectedGame,
          onChange: (value) => setSelectedGame(GAMES.length - 1 - value),
          format: (value) => `${GAMES.length - value}/${GAMES.length}`,
        },
        main: {
          label:
            quickCall.round && selectedGame === 0
              ? 'RESUME'
              : GAMES[selectedGame].enabled
                ? 'PLAY'
                : 'LOCKED',
          color: GAMES[selectedGame].enabled ? 'amber' : 'neutral',
          onPress: () => {
            if (quickCall.round && selectedGame === 0) go('position')
            else launchSelected()
          },
        },
        status: {
          left: `${asset} · SHANNON`,
          right: markets.connection.toUpperCase(),
        },
      }
    }

    if (screen === 'lucky') {
      const ready = luckyPhase === 'dealt' && quote.phase === 'ready'
      return {
        action1: {
          label: luckyPhase === 'idle' ? 'HOME' : 'REROLL',
          color: 'neutral',
          onPress: () => (luckyPhase === 'idle' ? go('hub') : reroll()),
        },
        action2: {
          label: asset,
          color: 'neutral',
          display: {
            mode: 'token',
            ticker: asset,
            logoSrc: `/assets/images/coins/${asset.toLowerCase()}-logo.png`,
          },
          onPress: () => setAsset((value) => (value === 'BTC' ? 'ETH' : 'BTC')),
        },
        numberWheel: {
          label: market?.collateralSymbol.toUpperCase() ?? 'AMOUNT',
          min: 0,
          max: STAKES.length - 1,
          step: 1,
          value: stakeIndex,
          onChange: setStakeIndex,
          format: (value) => `$${STAKES[value]}`,
        },
        main: {
          label:
            luckyPhase === 'idle'
              ? 'SPIN'
              : luckyPhase === 'spinning'
                ? 'DEALING'
                : luckyPhase === 'submitting'
                  ? 'SIGNING'
                  : wallet.status === 'wrong-network'
                    ? 'SWITCH'
                    : wallet.status !== 'connected'
                      ? 'CONNECT'
                      : ready
                        ? 'LOCK IN'
                        : luckyPhase === 'error'
                          ? 'TRY AGAIN'
                          : 'QUOTING',
          color: luckyPhase === 'dealt' ? 'up' : 'amber',
          loading: luckyPhase === 'spinning' || luckyPhase === 'submitting',
          onPress: () => {
            if (luckyPhase === 'idle') spin()
            else if (luckyPhase === 'error') reroll()
            else if (luckyPhase === 'dealt') void submit()
          },
        },
        status: {
          left: 'I FEEL LUCKY',
          right: luckyPhase.toUpperCase(),
        },
      }
    }

    if (screen === 'position') {
      const canClaim = quickCall.snapshot?.phase === 'claimable'
      return {
        action1: { label: 'HOME', color: 'neutral', onPress: () => go('hub') },
        action2: {
          label: 'REFRESH',
          color: 'neutral',
          onPress: () => void quickCall.refresh(),
        },
        main: {
          label: canClaim ? 'CLAIM' : 'CHECK CHAIN',
          color: canClaim ? 'amber' : 'neutral',
          loading: quickCall.phase === 'loading' || quickCall.phase === 'claiming',
          onPress: () => canClaim ? void quickCall.claim() : void quickCall.refresh(),
        },
        status: {
          left: quickCall.round?.asset ?? 'LUCKY',
          right: (quickCall.snapshot?.phase ?? quickCall.phase).toUpperCase(),
        },
      }
    }

    return {}
  }, [
    asset,
    go,
    launchSelected,
    luckyPhase,
    market,
    markets.connection,
    quickCall,
    quote.phase,
    reroll,
    screen,
    selectedGame,
    spin,
    stakeIndex,
    submit,
    wallet.status,
  ])

  if (screen === 'candle-hop') {
    return <CandleHop onExit={() => go('hub')} />
  }

  return (
    <GameScreen>
      <ArcadeControlBinding controls={controls} />
      {screen === 'hub' && (
        <GameHub
          asset={asset}
          selected={selectedGame}
          market={market}
          connection={markets.connection}
          loading={markets.phase === 'loading'}
          wallet={wallet}
          collateral={testCollateral}
          hasRound={Boolean(quickCall.round)}
          onAsset={setAsset}
          onSelect={setSelectedGame}
          onLaunch={(index) => {
            setSelectedGame(index)
            launchSelected(index)
          }}
        />
      )}
      {screen === 'lucky' && (
        <LuckyGame
          asset={asset}
          market={market}
          marketPhase={markets.phase}
          phase={luckyPhase}
          side={side}
          stake={stake}
          quote={quote.quote}
          quotePhase={quote.phase}
          quoteError={quote.error}
          multiplier={multiplier}
          livePrice={livePrice}
          collateral={testCollateral}
          orderError={orderError}
          order={lastOrder}
        />
      )}
      {screen === 'position' && quickCall.round && (
        <LuckyPosition
          round={quickCall.round}
          snapshot={quickCall.snapshot}
          phase={quickCall.phase}
          error={quickCall.error}
        />
      )}
    </GameScreen>
  )
}

function ArcadeControlBinding({ controls }: { controls: ConsoleControls }) {
  useConsoleControls(controls)
  return null
}

function GameHub({
  asset,
  selected,
  market,
  connection,
  loading,
  wallet,
  collateral,
  hasRound,
  onAsset,
  onSelect,
  onLaunch,
}: {
  asset: string
  selected: number
  market: PumpyEventMarket | null
  connection: string
  loading: boolean
  wallet: ReturnType<typeof usePlayerWallet>
  collateral: ReturnType<typeof useTestCollateral>
  hasRound: boolean
  onAsset: (asset: string) => void
  onSelect: (index: number) => void
  onLaunch: (index: number) => void
}) {
  return (
    <div className="flex h-full flex-col">
      <div className={cnm('flex items-center justify-between pb-2.5', RIM, RIM_TOP)}>
        <div className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-text-2">
          <span className={cnm('h-2 w-2', connection === 'live' ? 'bg-up' : 'bg-pumpy-caution')} />
          DreamDEX {connection}
        </div>
        <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-brand-500">Pumpy Arcade</span>
      </div>
      <div className="h-px bg-line-strong" />

      <div className={cnm('flex items-center justify-between py-3', RIM)}>
        <div>
          <div className="font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-text-3">Market deck</div>
          <div className="mt-0.5 text-[20px] font-black uppercase leading-none text-text">Choose a game</div>
        </div>
        <div className="flex gap-1.5">
          {['BTC', 'ETH'].map((ticker) => (
            <button
              key={ticker}
              type="button"
              data-console-tap
              aria-pressed={asset === ticker}
              onClick={() => onAsset(ticker)}
              className={cnm(
                'h-9 border px-2.5 font-mono text-[10px] font-black',
                asset === ticker
                  ? 'border-brand-500 bg-brand-500/15 text-brand-500'
                  : 'border-line-strong text-text-3',
              )}
            >
              {ticker}
            </button>
          ))}
        </div>
      </div>
      <div className="h-px bg-line-strong" />

      <div className="min-h-0 flex-1 overflow-y-auto">
        {GAMES.map((game, index) => {
          const Icon = game.icon
          const active = index === selected
          return (
            <button
              key={game.id}
              type="button"
              data-console-tap
              onClick={() => {
                onSelect(index)
                if (game.enabled) onLaunch(index)
              }}
              className={cnm(
                'relative flex w-full items-center gap-3 border-b border-line-strong py-3 text-left',
                RIM,
                active && 'bg-brand-500/[0.12]',
              )}
            >
              {active && <span className="absolute inset-y-0 left-0 w-1 bg-brand-500" />}
              <span className={cnm('font-mono text-[12px] font-black', active ? 'text-brand-500' : 'text-text-3')}>
                {String(index + 1).padStart(2, '0')}
              </span>
              <Icon className={cnm('h-7 w-7 shrink-0', active ? 'text-brand-500' : 'text-text-3')} aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className={cnm('block text-[16px] font-black uppercase leading-none', active ? 'text-text' : 'text-text-2')}>
                  {game.name}
                </span>
                <span className="mt-1 block truncate font-mono text-[9px] uppercase tracking-[0.08em] text-text-3">
                  {game.description}
                </span>
              </span>
              <span className={cnm('font-mono text-[9px] font-black tracking-[0.1em]', game.enabled ? 'text-up' : 'text-text-3')}>
                {game.kind}
              </span>
            </button>
          )
        })}
      </div>

      <div className={cnm('border-t border-line-strong bg-black pt-3', RIM, RIM_BOTTOM)}>
        <div className="max-w-[62%]">
          {hasRound ? (
            <div className="flex items-center gap-2 text-pumpy-cyan">
              <Clock3 className="h-4 w-4" aria-hidden="true" />
              <span className="font-mono text-[10px] font-black uppercase tracking-[0.12em]">Live position · press resume</span>
            </div>
          ) : (
            <div className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-text-3">
              {loading ? 'Loading Event Contracts…' : market ? `${asset} · ${market.intervalLabel} · ${market.collateralSymbol}` : `No ${asset} game live`}
            </div>
          )}
          <div className="mt-2 flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.08em] text-text-3">
            <WalletCards className="h-3.5 w-3.5" aria-hidden="true" />
            {wallet.address ? shortId(wallet.address) : 'Wallet connects when you lock a play'}
          </div>
          {wallet.address && <TestCollateralCard collateral={collateral} />}
        </div>
      </div>
    </div>
  )
}

function LuckyGame({
  asset,
  market,
  marketPhase,
  phase,
  side,
  stake,
  quote,
  quotePhase,
  quoteError,
  multiplier,
  livePrice,
  collateral,
  orderError,
  order,
}: {
  asset: string
  market: PumpyEventMarket | null
  marketPhase: string
  phase: LuckyPhase
  side: PlayerSide | null
  stake: number
  quote: PreparedPlayerTrade | null
  quotePhase: string
  quoteError: string | null
  multiplier?: number
  livePrice: LiveAssetPriceState
  collateral: ReturnType<typeof useTestCollateral>
  orderError: string | null
  order: PlayerOrderOutcome | null
}) {
  if (marketPhase === 'loading') {
    return <ScreenMessage title="Loading the reels" body="Finding a live DreamDEX Event Contract." hint="Syncing" />
  }
  if (!market) return <ScreenMessage {...SCREEN_STATES.noMarket} />

  const payout = quote
    ? formatUnits(quote.quantityRaw, quote.collateralDecimals)
    : null
  const premium = quote
    ? formatUnits(quote.escrowRaw, quote.collateralDecimals)
    : null
  const spinning = phase === 'spinning'
  const dealt = phase === 'dealt' || phase === 'submitting' || phase === 'error'
  const available = collateral.snapshot
    ? formatUnits(collateral.snapshot.balanceRaw, collateral.snapshot.decimals)
    : null

  return (
    <div className="relative flex h-full flex-col">
      <div className={cnm('flex shrink-0 items-start justify-between gap-3 bg-black pb-2.5', RIM, RIM_TOP)}>
        <div className="min-w-0">
          <div className="font-mono text-[9px] font-black uppercase tracking-[0.16em] text-text-3">{asset} / USD</div>
          <div className="mt-0.5 overflow-hidden text-[34px] font-black leading-none text-text tabular-nums">
            <LivePrice price={livePrice.price} />
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="font-mono text-[9px] font-black uppercase tracking-[0.14em] text-text-3">Available</div>
          <div className="mt-0.5 text-[20px] font-black leading-none text-text-2 tabular-nums">
            {available == null ? '—' : `$${formatMoney(available)}`}
          </div>
        </div>
      </div>

      <div
        className="relative shrink-0 overflow-hidden border-y border-line-strong bg-black transition-[height] duration-500 ease-out"
        style={{ height: dealt ? 68 : 180 }}
      >
        <div
          className="absolute inset-0 transition-[opacity,transform] duration-300"
          style={{
            opacity: dealt ? 0 : 1,
            transform: dealt ? 'translateY(-10px) scale(.76)' : 'translateY(0) scale(1)',
            transformOrigin: 'center top',
          }}
        >
          <LuckyWheels
            side={side ?? undefined}
            multiplier={multiplier}
            spinning={spinning}
            landing={spinning && quotePhase === 'ready'}
          />
        </div>
        <div
          className="absolute inset-0 flex items-center justify-center gap-8 px-[var(--screen-rim,24px)] transition-opacity duration-300"
          style={{ opacity: dealt ? 1 : 0 }}
        >
          {side && (
            <>
              <div className="text-center">
                <div className="font-mono text-[9px] font-black uppercase tracking-[0.15em] text-text-3">Direction</div>
                <div className={cnm('mt-1 text-[25px] font-black leading-none', side === 'UP' ? 'text-up' : 'text-down')}>
                  {side === 'UP' ? '▲ UP' : '▼ DOWN'}
                </div>
              </div>
              <div className="h-9 w-px bg-line-strong" />
              <div className="text-center">
                <div className="font-mono text-[9px] font-black uppercase tracking-[0.15em] text-text-3">Live odds</div>
                <div className="mt-1 text-[25px] font-black leading-none text-brand-500">
                  {multiplier ? `${multiplier.toFixed(2)}×` : '—'}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <LivePriceChart state={livePrice} className="flex-1" />

      <div className={cnm('min-h-[var(--screen-notch,21%)] shrink-0 border-t border-line-strong bg-black pt-3.5', RIM, RIM_BOTTOM)}>
        <div className="max-w-[60%]">
          {phase === 'idle' && (
            <>
              <div className="font-mono text-[9px] font-black uppercase tracking-[0.14em] text-text-3">Lucky</div>
              <div className="mt-0.5 text-[22px] font-black uppercase leading-none text-text">I Feel Lucky</div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-[30px] font-black leading-none text-brand-500 tabular-nums">${stake}</span>
                <span className="font-mono text-[9px] font-black uppercase tracking-[0.12em] text-text-3">Amount</span>
              </div>
              <div className="mt-2.5 font-mono text-[9px] font-bold uppercase leading-snug tracking-[0.08em] text-text-2">Press the button on the right to spin</div>
            </>
          )}
          {spinning && (
            <>
              <div className="font-mono text-[9px] font-black uppercase tracking-[0.14em] text-text-3">Dealing</div>
              <div className="mt-1 text-[28px] font-black uppercase leading-none text-brand-500">Spinning…</div>
              <div className="mt-2 font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-text-2">
                {quotePhase === 'loading' ? 'Reading live odds' : 'Deal ready'}
              </div>
            </>
          )}
          {dealt && (
            <>
              <div className="font-mono text-[9px] font-black uppercase tracking-[0.14em] text-text-3">Wallet-signed play</div>
              {quote ? (
                <div className="mt-2 grid grid-cols-3 gap-2">
                  <Readout label="Cost" value={`$${formatMoney(premium)}`} />
                  <Readout label="Payout" value={`$${formatMoney(payout)}`} />
                  <Readout label="Loss" value={`$${formatMoney(premium)}`} />
                </div>
              ) : (
                <div className="mt-2 flex items-center gap-2 font-mono text-[9px] font-bold uppercase text-text-3">
                  <LoaderCircle className="h-4 w-4 animate-spin" /> Refreshing odds
                </div>
              )}
              <div className="mt-2.5 font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-text-2">Review, then lock in</div>
            </>
          )}
          {(orderError || quoteError) && (
            <div className="mt-2 border-l-2 border-down pl-2 font-mono text-[8px] uppercase leading-[1.4] text-down">
              {orderError ?? quoteError}{order?.hash ? ` · ${shortId(order.hash)}` : ''}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function LuckyPosition({
  round,
  snapshot,
  phase,
  error,
}: {
  round: NonNullable<ReturnType<typeof useQuickCallRound>['round']>
  snapshot: ReturnType<typeof useQuickCallRound>['snapshot']
  phase: ReturnType<typeof useQuickCallRound>['phase']
  error: string | null
}) {
  const result = snapshot?.phase
  const tone = result === 'won' || result === 'claimable' || result === 'claimed'
    ? 'text-up'
    : result === 'lost'
      ? 'text-down'
      : 'text-brand-500'
  return (
    <div className="flex h-full flex-col">
      <div className={cnm('flex items-center justify-between pb-3', RIM, RIM_TOP)}>
        <div className="font-mono text-[10px] font-black uppercase tracking-[0.15em] text-text-3">Lucky position</div>
        <div className="font-mono text-[10px] font-black uppercase tracking-[0.15em] text-brand-500">Onchain</div>
      </div>
      <div className="h-px bg-line-strong" />
      <div className={cnm('flex min-h-0 flex-1 flex-col justify-center', RIM)}>
        <div className="font-mono text-[10px] font-black uppercase tracking-[0.16em] text-text-3">{round.asset} · {round.side}</div>
        <div className={cnm('mt-2 text-[42px] font-black uppercase leading-none', tone)}>
          {(result ?? phase).replaceAll('_', ' ')}
        </div>
        <p className="mt-3 max-w-[36ch] text-[12px] font-semibold leading-[1.45] text-text-2">{round.question}</p>
        <div className="mt-5 grid grid-cols-2 gap-4 border-y border-line-strong py-3">
          <Readout label="Filled" value={formatMoney(formatUnits(BigInt(round.filledQuantityRaw), round.collateralDecimals))} />
          <Readout label="Escrow" value={`$${formatMoney(formatUnits(BigInt(round.escrowRaw), round.collateralDecimals))}`} />
          <Readout label="Expires" value={new Date(round.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} />
          <Readout label="Order" value={shortId(round.orderHash)} />
        </div>
        {snapshot?.claimableRaw && snapshot.claimableRaw > 0n ? (
          <div className="mt-4 flex items-center gap-2 text-up">
            <CircleDollarSign className="h-5 w-5" />
            <span className="font-mono text-[11px] font-black uppercase tracking-[0.1em]">Payout ready to claim</span>
          </div>
        ) : null}
        {error && <p className="mt-4 font-mono text-[9px] uppercase leading-[1.4] text-down">{error}</p>}
      </div>
      <div className={cnm('border-t border-line-strong pt-3', RIM, RIM_BOTTOM)}>
        <div className="max-w-[62%] font-mono text-[9px] uppercase leading-[1.45] tracking-[0.08em] text-text-3">
          Resolution and claims come from DreamDEX. A submitted order is not shown as a win until the market resolves.
        </div>
      </div>
    </div>
  )
}

function CandleHop({ onExit }: { onExit: () => void }) {
  const [phase, setPhase] = useState<'title' | 'playing' | 'over'>('title')
  const [score, setScore] = useState(0)
  const [best, setBest] = useState(() => {
    if (typeof window === 'undefined') return 0
    return Number(window.localStorage.getItem('pumpy:candle-hop:best') ?? 0)
  })
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const engineRef = useRef<SimpleCandleHop | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const engine = new SimpleCandleHop(canvas, {
      onScore: setScore,
      onEnd: (finalScore) => {
        setScore(finalScore)
        setPhase('over')
        setBest((current) => {
          const next = Math.max(current, finalScore)
          window.localStorage.setItem('pumpy:candle-hop:best', String(next))
          return next
        })
        hapticPattern(finalScore > best ? 'achievement' : 'lose')
      },
    })
    engineRef.current = engine
    return () => engine.destroy()
  }, [best])

  const start = useCallback(() => {
    setScore(0)
    setPhase('playing')
    engineRef.current?.start()
    haptic('high')
  }, [])
  const jump = useCallback(() => {
    engineRef.current?.jump()
    haptic('low')
  }, [])

  useConsoleControls({
    action1: phase === 'playing' ? null : { label: 'HOME', color: 'neutral', onPress: onExit },
    main: phase === 'playing'
      ? { label: 'HOP', color: 'amber', onPress: jump }
      : { label: phase === 'over' ? 'PLAY AGAIN' : 'PLAY', color: 'amber', onPress: start },
    lightShow: phase === 'playing',
    status: { left: 'CANDLE HOP', right: `BEST ${best}` },
  })

  return (
    <GameScreen>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      {phase === 'playing' && (
        <div className={cnm('pointer-events-none absolute left-0 top-0', RIM, RIM_TOP)}>
          <div className="font-mono text-[9px] font-black uppercase tracking-[0.15em] text-text-3">Score</div>
          <div className="text-[38px] font-black leading-none text-text">{score}</div>
        </div>
      )}
      {phase !== 'playing' && (
        <div className={cnm('absolute inset-0 z-10 flex flex-col justify-center bg-black/92', RIM)}>
          <CandlestickChart className="h-8 w-8 text-brand-500" />
          <div className="mt-3 text-[38px] font-black uppercase leading-[0.92] text-text">Candle<br />Hop</div>
          <p className="mt-3 max-w-[31ch] text-[13px] font-semibold leading-[1.4] text-text-2">
            Tap the big button to pump through the candlestick gaps. One hit ends the run.
          </p>
          <div className="mt-5 font-mono text-[10px] font-black uppercase tracking-[0.14em] text-brand-500">
            {phase === 'over' ? `Score ${score} · Best ${best}` : `Best ${best}`}
          </div>
        </div>
      )}
      <div className={cnm('pointer-events-none absolute bottom-0 left-0 max-w-[62%]', RIM, RIM_BOTTOM)}>
        <div className="font-mono text-[9px] font-black uppercase tracking-[0.14em] text-text-3">No funds</div>
        <div className="mt-1 text-[17px] font-black uppercase text-text">Pure arcade warm-up</div>
      </div>
    </GameScreen>
  )
}

class SimpleCandleHop {
  private context: CanvasRenderingContext2D
  private canvas: HTMLCanvasElement
  private callbacks: { onScore: (score: number) => void; onEnd: (score: number) => void }
  private observer: ResizeObserver
  private raf = 0
  private running = false
  private width = 0
  private height = 0
  private y = 0.45
  private velocity = 0
  private score = 0
  private last = 0
  private obstacles: Array<{ x: number; gap: number; passed: boolean }> = []

  constructor(canvas: HTMLCanvasElement, callbacks: { onScore: (score: number) => void; onEnd: (score: number) => void }) {
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Canvas is unavailable')
    this.canvas = canvas
    this.context = context
    this.callbacks = callbacks
    this.observer = new ResizeObserver(() => this.measure())
    this.observer.observe(canvas)
    this.measure()
    this.draw()
  }

  private measure() {
    const rect = this.canvas.getBoundingClientRect()
    if (!rect.width || !rect.height) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    this.width = rect.width
    this.height = rect.height
    this.canvas.width = Math.round(rect.width * dpr)
    this.canvas.height = Math.round(rect.height * dpr)
    this.context.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  start() {
    this.y = 0.45
    this.velocity = -0.9
    this.score = 0
    this.obstacles = []
    for (let index = 0; index < 5; index++) {
      this.obstacles.push({ x: this.width + 100 + index * 185, gap: 0.28 + Math.random() * 0.42, passed: false })
    }
    this.running = true
    this.last = performance.now()
    cancelAnimationFrame(this.raf)
    this.raf = requestAnimationFrame(this.frame)
  }

  jump() {
    if (this.running) this.velocity = -1.35
  }

  destroy() {
    this.running = false
    cancelAnimationFrame(this.raf)
    this.observer.disconnect()
  }

  private frame = (now: number) => {
    if (!this.running) return
    let ended = false
    const dt = Math.min(0.05, (now - this.last) / 1000)
    this.last = now
    this.velocity = Math.min(2.4, this.velocity + 5.2 * dt)
    this.y += this.velocity * dt
    const speed = 132 + Math.min(80, this.score * 4)
    const playerX = this.width * 0.27
    const playerY = this.y * this.height
    const gapHalf = Math.max(48, this.height * 0.14)

    for (const obstacle of this.obstacles) {
      obstacle.x -= speed * dt
      if (!obstacle.passed && obstacle.x < playerX) {
        obstacle.passed = true
        this.score += 1
        this.callbacks.onScore(this.score)
        haptic('low')
      }
      if (obstacle.x < -40) {
        obstacle.x = Math.max(...this.obstacles.map((entry) => entry.x)) + 185
        obstacle.gap = 0.25 + Math.random() * 0.5
        obstacle.passed = false
      }
      const gapY = obstacle.gap * this.height
      if (Math.abs(obstacle.x - playerX) < 25 && (playerY < gapY - gapHalf || playerY > gapY + gapHalf)) {
        this.end()
        ended = true
        break
      }
    }
    if (this.y < 0.05 || this.y > 0.95) {
      this.end()
      ended = true
    }
    this.draw()
    if (!ended) this.raf = requestAnimationFrame(this.frame)
  }

  private end() {
    if (!this.running) return
    this.running = false
    this.callbacks.onEnd(this.score)
  }

  private draw() {
    const context = this.context
    context.clearRect(0, 0, this.width, this.height)
    context.fillStyle = '#000'
    context.fillRect(0, 0, this.width, this.height)
    context.strokeStyle = 'rgba(255,255,255,.055)'
    context.lineWidth = 1
    for (let x = 0; x < this.width; x += 28) {
      context.beginPath()
      context.moveTo(x, 0)
      context.lineTo(x, this.height)
      context.stroke()
    }
    for (let y = 0; y < this.height; y += 28) {
      context.beginPath()
      context.moveTo(0, y)
      context.lineTo(this.width, y)
      context.stroke()
    }

    const gapHalf = Math.max(48, this.height * 0.14)
    for (const obstacle of this.obstacles) {
      const gapY = obstacle.gap * this.height
      context.fillStyle = '#ff5a4d'
      context.fillRect(obstacle.x - 15, 0, 30, Math.max(0, gapY - gapHalf))
      context.fillStyle = '#34d399'
      context.fillRect(obstacle.x - 15, gapY + gapHalf, 30, this.height - gapY - gapHalf)
      context.strokeStyle = '#f5f7fb'
      context.beginPath()
      context.moveTo(obstacle.x, Math.max(0, gapY - gapHalf - 14))
      context.lineTo(obstacle.x, gapY - gapHalf)
      context.moveTo(obstacle.x, gapY + gapHalf)
      context.lineTo(obstacle.x, gapY + gapHalf + 14)
      context.stroke()
    }

    const playerX = this.width * 0.27
    const playerY = this.y * this.height
    context.save()
    context.translate(playerX, playerY)
    context.rotate(Math.max(-0.35, Math.min(0.55, this.velocity * 0.18)))
    context.fillStyle = '#b8ff4a'
    context.shadowColor = '#b8ff4a'
    context.shadowBlur = 18
    context.beginPath()
    context.arc(0, 0, 17, 0, Math.PI * 2)
    context.fill()
    context.shadowBlur = 0
    context.fillStyle = '#101807'
    context.font = '900 14px Gabarito, sans-serif'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText('P', 0, 1)
    context.restore()
  }
}

function Readout({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="font-mono text-[8px] font-black uppercase tracking-[0.12em] text-text-3">{label}</div>
      <div className="mt-1 truncate font-mono text-[12px] font-black text-text">{value}</div>
    </div>
  )
}

function quoteMultiplier(quote: PreparedPlayerTrade): number | undefined {
  if (quote.escrowRaw <= 0n || quote.quantityRaw <= 0n) return undefined
  return Number((quote.quantityRaw * 10_000n) / quote.escrowRaw) / 10_000
}

function formatMoney(value: string | null): string {
  const parsed = Number(value ?? 0)
  if (!Number.isFinite(parsed)) return '—'
  return parsed.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })
}

function shortId(value: string): string {
  return `${value.slice(0, 6)}…${value.slice(-4)}`
}

function isWalletRejection(cause: unknown): boolean {
  if (!cause || typeof cause !== 'object') return false
  if ('code' in cause && cause.code === 4_001) return true
  if ('cause' in cause) return isWalletRejection(cause.cause)
  return false
}
