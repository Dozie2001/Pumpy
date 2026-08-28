import {
  CandlestickChart,
  Clock3,
  Gamepad2,
  LoaderCircle,
  Rocket,
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
import type { PlayerWalletControls } from '@/lib/dreamdex/usePlayerWallet'
import { useConsoleControls } from '@/components/console/controls'
import {
  CandleHopEngine,
  candleHopOutcome,
} from '@/components/game/CandleHopEngine'
import { GameSettlementScreen } from '@/components/game/GameSettlementScreen'
import { LivePrice } from '@/components/game/LivePrice'
import { LivePriceChart } from '@/components/game/LivePriceChart'
import { LuckyWheels } from '@/components/game/LuckyWheels'
import { RangeArcadeGame } from '@/components/game/RangeArcadeGame'
import {
  GameReadout,
  GameScreen,
  GameStage,
  SCREEN_STATES,
  ScreenCRT,
  ScreenMessage,
  ScreenOverlay,
} from '@/components/game/screen'
import { TestCollateralCard } from '@/components/pumpy/PumpyExperience'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { useEventMarkets } from '@/lib/dreamdex/useEventMarkets'
import {
  liveCashoutButtonLabel,
  liveCashoutGuidance,
} from '@/lib/dreamdex/cashoutUi'
import { useLiveAssetPrice } from '@/lib/dreamdex/useLiveAssetPrice'
import {
  isCallCurrentlyWinning,
  resolveOracleTargetPrice,
} from '@/lib/dreamdex/oracleTarget'
import { selectFixedStrikePumpyMarkets } from '@/lib/dreamdex/normalize'
import { usePlayerCashout } from '@/lib/dreamdex/usePlayerCashout'
import {
  longShotDistancePercent,
  longShotSideForTarget,
} from '@/lib/dreamdex/longShot'
import { usePlayerQuote } from '@/lib/dreamdex/usePlayerQuote'
import { useQuickCallRound } from '@/lib/dreamdex/useQuickCallRound'
import { useTestCollateral } from '@/lib/dreamdex/useTestCollateral'
import { eventSecondsRemaining } from '@/lib/dreamdex/eventCountdown'
import {
  PlayerTradeError,
  placePreparedPlayerTrade,
} from '@/lib/dreamdex/trade'
import { haptic, hapticPattern } from '@/lib/haptics'
import { recordPlayerTrade } from '@/lib/pumpy/playerProfile'
import {
  achievementUnlock,
  chipsGranted,
  hopLose,
  hopResetCombo,
  hopScore,
  luckyCashout,
  luckyLose,
  luckyWin,
  moonshotCashout,
  moonshotFire,
  moonshotLose,
  moonshotWin,
  slotPick,
  slotSpin,
  sound,
  startBgm,
  stopBgm,
} from '@/lib/sound'
import { cnm } from '@/utils/style'

type ArcadeScreen =
  'hub' | 'lucky' | 'long-shot' | 'position' | 'range' | 'candle-hop'
type LuckyPhase = 'idle' | 'spinning' | 'dealt' | 'submitting' | 'error'
type LongShotPhase = 'idle' | 'review' | 'submitting' | 'error'
type WalletStep = 'preparing' | 'approving' | 'refreshing' | 'placing' | null

const STAKES = [1, 5, 10, 25, 50] as const
const RIM = 'px-[var(--screen-rim,24px)]'
const RIM_TOP = 'pt-[calc(var(--screen-rim,24px)+6px)]'
const RIM_BOTTOM = 'pb-[calc(var(--screen-rim,24px)+var(--screen-notch,0px))]'
const LEFT_READOUT_BOTTOM = 'pb-[var(--screen-rim,24px)]'

const GAMES = [
  {
    id: 'lucky',
    name: 'I Feel Lucky',
    description: 'Spin a direction. DreamDEX sets the real odds.',
    kind: 'LIVE',
    icon: Sparkles,
  },
  {
    id: 'long-shot',
    name: 'Long Shot',
    description: 'Hit a real fixed strike. Bigger target, live odds.',
    kind: 'LIVE',
    icon: Rocket,
  },
  {
    id: 'range',
    name: 'Range',
    description: 'Two fixed strikes. One real DreamDEX range.',
    kind: 'LIVE',
    icon: Gamepad2,
  },
  {
    id: 'candle-hop',
    name: 'Candle Hop',
    description: 'One-button arcade. No funds, just score.',
    kind: 'ARCADE',
    icon: CandlestickChart,
  },
] as const

export function PumpyArcade({
  homeSignal = 0,
  wallet,
}: {
  homeSignal?: number
  wallet: PlayerWalletControls
}) {
  const [screen, setScreen] = useState<ArcadeScreen>('hub')
  const [asset, setAsset] = useState('BTC')
  const [selectedGame, setSelectedGame] = useState(0)
  const [stakeIndex, setStakeIndex] = useState(1)
  const [luckyPhase, setLuckyPhase] = useState<LuckyPhase>('idle')
  const [side, setSide] = useState<PlayerSide | null>(null)
  const [orderError, setOrderError] = useState<string | null>(null)
  const [quoteNotice, setQuoteNotice] = useState<string | null>(null)
  const [walletStep, setWalletStep] = useState<WalletStep>(null)
  const [repriceFromObservedAt, setRepriceFromObservedAt] = useState<
    number | null
  >(null)
  const [lastOrder, setLastOrder] = useState<PlayerOrderOutcome | null>(null)
  const [luckyHowTo, setLuckyHowTo] = useState(false)
  const [longShotTargetIndex, setLongShotTargetIndex] = useState(0)
  const [longShotPhase, setLongShotPhase] = useState<LongShotPhase>('idle')
  const [longShotSide, setLongShotSide] = useState<PlayerSide | null>(null)
  const [longShotError, setLongShotError] = useState<string | null>(null)
  const [longShotNotice, setLongShotNotice] = useState<string | null>(null)
  const [longShotWalletStep, setLongShotWalletStep] = useState<WalletStep>(null)
  const [longShotRepriceAt, setLongShotRepriceAt] = useState<number | null>(
    null,
  )
  const [longShotHowTo, setLongShotHowTo] = useState(false)
  const [longShotOrder, setLongShotOrder] = useState<PlayerOrderOutcome | null>(
    null,
  )
  const spinStartedAt = useRef(0)
  const settleTimerRef = useRef<number | null>(null)
  const refreshedClaimBalance = useRef<string | null>(null)

  const markets = useEventMarkets(asset)
  const longShotMarkets = useEventMarkets(asset, {
    reference: 'fixed-strike',
    selectionIndex: longShotTargetIndex,
  })
  const livePrice = useLiveAssetPrice(asset)
  const market = markets.selected
  const stake = STAKES[stakeIndex]
  const quickCall = useQuickCallRound({
    address: wallet.address,
    session: wallet.session,
  })
  const cashout = usePlayerCashout({
    round: quickCall.round,
    positionRaw: quickCall.snapshot?.positionRaw ?? 0n,
    session: wallet.session,
    enabled: screen === 'position' && quickCall.snapshot?.phase === 'live',
  })
  const testCollateral = useTestCollateral({ market, wallet })
  const quote = usePlayerQuote({
    market,
    side,
    stake,
    account: wallet.address,
    enabled: luckyPhase === 'spinning' || luckyPhase === 'dealt',
  })
  const longShotMarket = longShotMarkets.selected
  const longShotCollateral = useTestCollateral({
    market: longShotMarket,
    wallet,
  })
  const longShotCandidates = useMemo(
    () => selectFixedStrikePumpyMarkets(longShotMarkets.markets, asset),
    [asset, longShotMarkets.markets],
  )
  const longShotTarget = resolveOracleTargetPrice(
    longShotMarket?.targetPriceRaw,
    livePrice.price,
  )?.price
  const longShotQuote = usePlayerQuote({
    market: longShotMarket,
    side: longShotSide,
    stake,
    account: wallet.address,
    enabled:
      screen === 'long-shot' &&
      (longShotPhase === 'review' || longShotPhase === 'submitting'),
  })
  const multiplier = quote.quote ? quoteMultiplier(quote.quote) : undefined

  useEffect(() => {
    const claimHash = quickCall.round?.claimHash
    if (!claimHash || refreshedClaimBalance.current === claimHash) return
    refreshedClaimBalance.current = claimHash
    void testCollateral.refresh()
    void longShotCollateral.refresh()
  }, [quickCall.round?.claimHash, longShotCollateral, testCollateral])

  const go = useCallback((next: ArcadeScreen) => {
    haptic('selection')
    setScreen(next)
  }, [])

  useEffect(() => {
    if (homeSignal === 0) return
    setScreen('hub')
  }, [homeSignal])

  useEffect(
    () => () => {
      if (settleTimerRef.current) window.clearTimeout(settleTimerRef.current)
    },
    [],
  )

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
    setQuoteNotice(null)
    setWalletStep(null)
    setRepriceFromObservedAt(null)
    setLastOrder(null)
  }, [market?.marketId])

  useEffect(() => {
    setLongShotPhase('idle')
    setLongShotSide(null)
    setLongShotError(null)
    setLongShotNotice(null)
    setLongShotWalletStep(null)
    setLongShotRepriceAt(null)
    setLongShotOrder(null)
  }, [longShotMarket?.marketId])

  useEffect(() => {
    if (longShotTargetIndex < longShotCandidates.length) return
    setLongShotTargetIndex(Math.max(0, longShotCandidates.length - 1))
  }, [longShotCandidates.length, longShotTargetIndex])

  useEffect(() => {
    if (
      repriceFromObservedAt === null ||
      quote.phase !== 'ready' ||
      !quote.quote ||
      quote.quote.observedAt <= repriceFromObservedAt
    )
      return

    setRepriceFromObservedAt(null)
    setQuoteNotice(
      'Odds changed. Updated terms are shown — press LOCK IN again.',
    )
  }, [quote.phase, quote.quote, repriceFromObservedAt])

  useEffect(() => {
    if (
      longShotRepriceAt === null ||
      longShotQuote.phase !== 'ready' ||
      !longShotQuote.quote ||
      longShotQuote.quote.observedAt <= longShotRepriceAt
    )
      return
    setLongShotRepriceAt(null)
    setLongShotNotice(
      'Odds changed. Updated terms are shown — press LOCK IN again.',
    )
  }, [longShotQuote.phase, longShotQuote.quote, longShotRepriceAt])

  const launchSelected = useCallback(
    (index = selectedGame) => {
      const selected = GAMES[index]
      if (
        quickCall.round &&
        (selected.id === 'lucky' || selected.id === 'long-shot')
      ) {
        go('position')
        return
      }
      if (selected.id === 'lucky') go('lucky')
      if (selected.id === 'long-shot') go('long-shot')
      if (selected.id === 'range') go('range')
      if (selected.id === 'candle-hop') go('candle-hop')
    },
    [go, quickCall.round, selectedGame],
  )

  const spin = useCallback(() => {
    if (!market || markets.connection !== 'live' || luckyPhase !== 'idle')
      return
    const bytes = new Uint8Array(1)
    crypto.getRandomValues(bytes)
    setSide(bytes[0] % 2 === 0 ? 'UP' : 'DOWN')
    setOrderError(null)
    setQuoteNotice(null)
    setWalletStep(null)
    setRepriceFromObservedAt(null)
    setLastOrder(null)
    spinStartedAt.current = Date.now()
    setLuckyPhase('spinning')
    slotSpin()
  }, [luckyPhase, market, markets.connection])

  const reroll = useCallback(() => {
    setSide(null)
    setLuckyPhase('idle')
    setOrderError(null)
    setQuoteNotice(null)
    setWalletStep(null)
    setRepriceFromObservedAt(null)
    setLastOrder(null)
  }, [])

  const playAgain = useCallback(() => {
    const nextScreen =
      quickCall.round?.game === 'long-shot' ? 'long-shot' : 'lucky'
    quickCall.clear()
    setSide(null)
    setLuckyPhase('idle')
    setOrderError(null)
    setQuoteNotice(null)
    setWalletStep(null)
    setLastOrder(null)
    setLongShotPhase('idle')
    setLongShotSide(null)
    setLongShotError(null)
    setLongShotNotice(null)
    go(nextScreen)
  }, [go, quickCall])

  const reviewLongShot = useCallback(() => {
    if (
      !longShotMarket ||
      longShotTarget == null ||
      livePrice.price == null ||
      longShotMarkets.connection !== 'live'
    ) {
      haptic('warning')
      return
    }
    setLongShotSide(longShotSideForTarget(livePrice.price, longShotTarget))
    setLongShotPhase('review')
    setLongShotError(null)
    setLongShotNotice(null)
    setLongShotWalletStep(null)
    setLongShotRepriceAt(null)
    setLongShotOrder(null)
    haptic('heavy')
  }, [
    livePrice.price,
    longShotMarket,
    longShotMarkets.connection,
    longShotTarget,
  ])

  const cancelLongShot = useCallback(() => {
    setLongShotSide(null)
    setLongShotPhase('idle')
    setLongShotError(null)
    setLongShotNotice(null)
    setLongShotWalletStep(null)
    setLongShotRepriceAt(null)
    setLongShotOrder(null)
  }, [])

  const submitLongShot = useCallback(async () => {
    if (wallet.status === 'wrong-network') {
      await wallet.switchNetwork()
      return
    }
    if (wallet.status !== 'connected' || !wallet.session) {
      await wallet.connect()
      return
    }
    if (
      !longShotMarket ||
      !longShotQuote.quote ||
      !longShotSide ||
      longShotPhase !== 'review'
    ) {
      longShotQuote.refresh()
      return
    }

    setLongShotPhase('submitting')
    setLongShotError(null)
    setLongShotNotice(null)
    setLongShotWalletStep('preparing')
    try {
      const outcome = await placePreparedPlayerTrade({
        trade: longShotQuote.quote,
        market: longShotMarket,
        wallet: wallet.session,
        mode: 'quick-call',
        onWalletStep: setLongShotWalletStep,
      })
      setLongShotWalletStep(null)
      setLongShotOrder(outcome)
      if (outcome.status === 'filled' || outcome.status === 'partial') {
        quickCall.recordOrder({
          game: 'long-shot',
          market: longShotMarket,
          trade: longShotQuote.quote,
          outcome,
        })
        recordPlayerTrade({
          storage: window.localStorage,
          account: wallet.address!,
          game: 'long-shot',
          market: longShotMarket,
          trade: longShotQuote.quote,
          outcome,
        })
        void longShotCollateral.refresh()
        moonshotFire()
        haptic('success')
        go('position')
      } else {
        haptic('warning')
        setLongShotError(
          outcome.status === 'open'
            ? 'The remainder is resting on DreamDEX. Review it before retrying.'
            : 'The fixed-strike IOC did not fill. Choose a fresh target.',
        )
        setLongShotPhase('error')
      }
    } catch (cause) {
      if (isWalletRejection(cause)) {
        setLongShotWalletStep(null)
        setLongShotPhase('review')
        return
      }
      if (cause instanceof PlayerTradeError && cause.code === 'STALE_QUOTE') {
        haptic('warning')
        setLongShotWalletStep(null)
        setLongShotRepriceAt(longShotQuote.quote.observedAt)
        setLongShotNotice(`${cause.message} Refreshing executable terms…`)
        setLongShotPhase('review')
        longShotQuote.refresh()
        return
      }
      setLongShotWalletStep(null)
      haptic('warning')
      setLongShotError(
        cause instanceof Error ? cause.message : 'The order did not complete',
      )
      setLongShotPhase('error')
    }
  }, [
    go,
    longShotMarket,
    longShotPhase,
    longShotQuote,
    longShotSide,
    quickCall,
    longShotCollateral,
    wallet,
  ])

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
    setQuoteNotice(null)
    setWalletStep('preparing')
    try {
      const outcome = await placePreparedPlayerTrade({
        trade: quote.quote,
        market,
        wallet: wallet.session,
        mode: 'quick-call',
        onWalletStep: setWalletStep,
      })
      setWalletStep(null)
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
        setWalletStep(null)
        setLuckyPhase('dealt')
        return
      }
      if (cause instanceof PlayerTradeError && cause.code === 'STALE_QUOTE') {
        haptic('warning')
        setWalletStep(null)
        setRepriceFromObservedAt(quote.quote.observedAt)
        setQuoteNotice(`${cause.message} Refreshing executable terms…`)
        setLuckyPhase('dealt')
        quote.refresh()
        return
      }
      setWalletStep(null)
      haptic('warning')
      setOrderError(
        cause instanceof Error ? cause.message : 'The order did not complete',
      )
      setLuckyPhase('error')
    }
  }, [go, luckyPhase, market, quote, quickCall, side, testCollateral, wallet])

  const performCashout = useCallback(async () => {
    const outcome = await cashout.cashOut()
    if (!outcome) return
    if (outcome.status === 'filled') {
      quickCall.recordCashout(outcome)
      void testCollateral.refresh()
    } else {
      void quickCall.refresh()
    }
  }, [cashout, quickCall, testCollateral])

  const controls = useMemo<ConsoleControls>(() => {
    if (screen === 'hub') {
      const selectedIsWalletGame = selectedGame === 0 || selectedGame === 1
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
          label: quickCall.round && selectedIsWalletGame ? 'RESUME' : 'PLAY',
          color: 'amber',
          onPress: () => {
            if (quickCall.round && selectedIsWalletGame) go('position')
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
      const ready =
        luckyPhase === 'dealt' &&
        quote.phase === 'ready' &&
        repriceFromObservedAt === null
      return {
        action1: {
          label: luckyHowTo
            ? 'CLOSE'
            : luckyPhase === 'idle'
              ? 'HOW TO'
              : 'REROLL',
          color: 'neutral',
          onPress: () => {
            if (luckyHowTo) setLuckyHowTo(false)
            else if (luckyPhase === 'idle') setLuckyHowTo(true)
            else reroll()
          },
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
          label: luckyHowTo
            ? 'HELP OPEN'
            : luckyPhase === 'idle' && !market
              ? 'WAIT'
              : luckyPhase === 'idle'
                ? 'SPIN'
                : luckyPhase === 'spinning'
                  ? 'DEALING'
                  : luckyPhase === 'submitting'
                    ? walletStep === 'approving'
                      ? 'APPROVE'
                      : walletStep === 'placing'
                        ? 'SIGN ORDER'
                        : 'CHECKING'
                    : wallet.status === 'wrong-network'
                      ? 'SWITCH'
                      : wallet.status === 'unavailable'
                        ? 'NO WALLET'
                        : wallet.status === 'error'
                          ? 'RETRY'
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
            if (luckyHowTo) haptic('warning')
            else if (luckyPhase === 'idle' && !market) haptic('warning')
            else if (luckyPhase === 'idle') spin()
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

    if (screen === 'long-shot') {
      const ready =
        longShotPhase === 'review' &&
        longShotQuote.phase === 'ready' &&
        longShotRepriceAt === null
      return {
        action1: {
          label: longShotHowTo
            ? 'CLOSE'
            : longShotPhase === 'idle'
              ? 'HOW TO'
              : 'CANCEL',
          color: 'neutral',
          onPress: () => {
            if (longShotHowTo) setLongShotHowTo(false)
            else if (longShotPhase === 'idle') setLongShotHowTo(true)
            else cancelLongShot()
          },
        },
        action2: {
          label: asset,
          color: 'neutral',
          display: {
            mode: 'token',
            ticker: asset,
            logoSrc: `/assets/images/coins/${asset.toLowerCase()}-logo.png`,
          },
          onPress: () => {
            if (longShotPhase !== 'idle') {
              haptic('warning')
              return
            }
            setLongShotTargetIndex(0)
            setAsset((value) => (value === 'BTC' ? 'ETH' : 'BTC'))
          },
        },
        knob: {
          label: 'TARGET',
          min: 0,
          max: Math.max(0, longShotCandidates.length - 1),
          step: 1,
          value: Math.max(
            0,
            longShotCandidates.length - 1 - longShotTargetIndex,
          ),
          onChange: (value) => {
            if (longShotPhase !== 'idle') return
            setLongShotTargetIndex(
              Math.max(0, longShotCandidates.length - 1 - value),
            )
          },
          format: (value) =>
            longShotCandidates.length
              ? `${longShotCandidates.length - value}/${longShotCandidates.length}`
              : 'NONE',
        },
        numberWheel: {
          label: longShotMarket?.collateralSymbol.toUpperCase() ?? 'AMOUNT',
          min: 0,
          max: STAKES.length - 1,
          step: 1,
          value: stakeIndex,
          onChange: setStakeIndex,
          format: (value) => `$${STAKES[value]}`,
        },
        main: {
          label: longShotHowTo
            ? 'HELP OPEN'
            : longShotPhase === 'idle'
              ? longShotMarket
                ? 'REVIEW'
                : 'WAIT'
              : longShotPhase === 'submitting'
                ? longShotWalletStep === 'approving'
                  ? 'APPROVE'
                  : longShotWalletStep === 'placing'
                    ? 'SIGN ORDER'
                    : 'CHECKING'
                : wallet.status === 'wrong-network'
                  ? 'SWITCH'
                  : wallet.status === 'unavailable'
                    ? 'NO WALLET'
                    : wallet.status === 'error'
                      ? 'RETRY'
                      : wallet.status !== 'connected'
                        ? 'CONNECT'
                        : ready
                          ? 'LOCK IN'
                          : longShotPhase === 'error'
                            ? 'TRY AGAIN'
                            : 'QUOTING',
          color:
            ready && !longShotHowTo
              ? 'up'
              : longShotMarket && !longShotHowTo
                ? 'amber'
                : 'neutral',
          loading: longShotPhase === 'submitting',
          onPress: () => {
            if (longShotHowTo) haptic('warning')
            else if (longShotPhase === 'idle') reviewLongShot()
            else if (longShotPhase === 'error') cancelLongShot()
            else if (longShotPhase === 'review') void submitLongShot()
          },
        },
        status: {
          left: 'LONG SHOT',
          right: longShotPhase.toUpperCase(),
        },
      }
    }

    if (screen === 'position') {
      const result = quickCall.snapshot?.phase
      const canClaim =
        (result === 'claimable' || result === 'voided') &&
        (quickCall.snapshot?.claimableRaw ?? 0n) > 0n
      const canPlayAgain =
        result === 'lost' ||
        result === 'claimed' ||
        result === 'cashed-out' ||
        (result === 'voided' && !canClaim)
      const cashoutBusy =
        cashout.phase === 'checking' ||
        cashout.phase === 'batching' ||
        cashout.phase === 'approving' ||
        cashout.phase === 'refreshing' ||
        cashout.phase === 'submitting'
      const claimBusy =
        quickCall.phase === 'authorizing-claim' ||
        quickCall.phase === 'claiming'
      const canCashout =
        result === 'live' &&
        cashout.phase === 'ready' &&
        cashout.fullExitAvailable
      return {
        action1: { label: 'HOME', color: 'neutral', onPress: () => go('hub') },
        action2: {
          label: result === 'live' ? 'REPRICE' : 'REFRESH',
          color: 'neutral',
          onPress: () =>
            result === 'live'
              ? void cashout.refresh()
              : void quickCall.refresh(),
        },
        main: {
          label: canClaim
            ? quickCall.phase === 'authorizing-claim'
              ? 'AUTHORIZE'
              : quickCall.phase === 'claiming'
                ? 'CLAIMING'
                : 'CLAIM'
            : canPlayAgain
              ? 'PLAY AGAIN'
              : result === 'live'
                ? liveCashoutButtonLabel({
                    phase: cashout.phase,
                    fullExitAvailable: cashout.fullExitAvailable,
                    authorizationRequired: cashout.authorizationRequired,
                  })
                : 'CHECK CHAIN',
          color: canClaim || canPlayAgain || canCashout ? 'amber' : 'neutral',
          loading: quickCall.phase === 'loading' || claimBusy || cashoutBusy,
          onPress: () => {
            if (canClaim) void quickCall.claim()
            else if (canPlayAgain) playAgain()
            else if (canCashout) void performCashout()
            else if (result === 'live') void cashout.refresh()
            else void quickCall.refresh()
          },
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
    cancelLongShot,
    longShotCandidates.length,
    longShotHowTo,
    longShotMarket,
    longShotPhase,
    longShotQuote.phase,
    longShotRepriceAt,
    longShotTargetIndex,
    longShotWalletStep,
    luckyPhase,
    luckyHowTo,
    market,
    markets.connection,
    quickCall,
    quote.phase,
    repriceFromObservedAt,
    reroll,
    reviewLongShot,
    screen,
    selectedGame,
    spin,
    stakeIndex,
    submit,
    submitLongShot,
    cashout,
    walletStep,
    wallet.status,
    playAgain,
    performCashout,
  ])

  if (screen === 'candle-hop') {
    return <CandleHop onExit={() => go('hub')} />
  }
  if (screen === 'range') {
    return (
      <RangeArcadeGame
        asset={asset}
        livePrice={livePrice}
        markets={markets.markets}
        walletAddress={wallet.address}
        walletStatus={wallet.status}
        onAsset={setAsset}
      />
    )
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
          closingMarket={markets.closing}
          nextMarket={markets.next}
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
          walletStatus={wallet.status}
          walletError={wallet.error}
          walletStep={walletStep}
          orderError={orderError}
          quoteNotice={quoteNotice}
          repricePending={repriceFromObservedAt !== null}
          order={lastOrder}
          howToOpen={luckyHowTo}
        />
      )}
      {screen === 'long-shot' && (
        <LongShotGame
          asset={asset}
          market={longShotMarket}
          marketPhase={longShotMarkets.phase}
          connection={longShotMarkets.connection}
          targetIndex={longShotTargetIndex}
          targetCount={longShotCandidates.length}
          targetPrice={longShotTarget}
          phase={longShotPhase}
          side={longShotSide}
          stake={stake}
          quote={longShotQuote.quote}
          quotePhase={longShotQuote.phase}
          quoteError={longShotQuote.error}
          livePrice={livePrice}
          collateral={longShotCollateral}
          walletStatus={wallet.status}
          walletError={wallet.error}
          walletStep={longShotWalletStep}
          orderError={longShotError}
          quoteNotice={longShotNotice}
          repricePending={longShotRepriceAt !== null}
          order={longShotOrder}
          howToOpen={longShotHowTo}
        />
      )}
      {screen === 'position' && quickCall.round && (
        <LuckyPosition
          round={quickCall.round}
          snapshot={quickCall.snapshot}
          phase={quickCall.phase}
          error={quickCall.error}
          livePrice={livePrice}
          cashout={cashout}
          onRefresh={quickCall.refresh}
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
  wallet: PlayerWalletControls
  collateral: ReturnType<typeof useTestCollateral>
  hasRound: boolean
  onAsset: (asset: string) => void
  onSelect: (index: number) => void
  onLaunch: (index: number) => void
}) {
  return (
    <div className="flex h-full flex-col">
      <div
        className={cnm(
          'flex items-center justify-between pb-2.5',
          RIM,
          RIM_TOP,
        )}
      >
        <div className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-text-2">
          <span
            className={cnm(
              'h-2 w-2',
              connection === 'live' ? 'bg-up' : 'bg-pumpy-caution',
            )}
          />
          DreamDEX {connection}
        </div>
        <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-brand-500">
          Pumpy Arcade
        </span>
      </div>
      <div className="h-px bg-line-strong" />

      <div className={cnm('flex items-center justify-between py-3', RIM)}>
        <div>
          <div className="font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-text-3">
            Market deck
          </div>
          <div className="mt-0.5 text-[20px] font-black uppercase leading-none text-text">
            Choose a game
          </div>
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
                onLaunch(index)
              }}
              className={cnm(
                'relative flex w-full items-center gap-3 border-b border-line-strong py-3 text-left',
                RIM,
                active && 'bg-brand-500/[0.12]',
              )}
            >
              {active && (
                <span className="absolute inset-y-0 left-0 w-1 bg-brand-500" />
              )}
              <span
                className={cnm(
                  'font-mono text-[12px] font-black',
                  active ? 'text-brand-500' : 'text-text-3',
                )}
              >
                {String(index + 1).padStart(2, '0')}
              </span>
              <Icon
                className={cnm(
                  'h-7 w-7 shrink-0',
                  active ? 'text-brand-500' : 'text-text-3',
                )}
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1">
                <span
                  className={cnm(
                    'block text-[16px] font-black uppercase leading-none',
                    active ? 'text-text' : 'text-text-2',
                  )}
                >
                  {game.name}
                </span>
                <span className="mt-1 block truncate font-mono text-[9px] uppercase tracking-[0.08em] text-text-3">
                  {game.description}
                </span>
              </span>
              <span
                className={cnm(
                  'font-mono text-[9px] font-black tracking-[0.1em]',
                  game.kind === 'LIVE' ? 'text-up' : 'text-pumpy-cyan',
                )}
              >
                {game.kind}
              </span>
            </button>
          )
        })}
      </div>

      <div
        className={cnm(
          'border-t border-line-strong bg-black pt-3',
          RIM,
          RIM_BOTTOM,
        )}
      >
        <div className="max-w-[62%]">
          {hasRound ? (
            <div className="flex items-center gap-2 text-pumpy-cyan">
              <Clock3 className="h-4 w-4" aria-hidden="true" />
              <span className="font-mono text-[10px] font-black uppercase tracking-[0.12em]">
                Live position · press resume
              </span>
            </div>
          ) : (
            <div className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-text-3">
              {loading
                ? 'Loading Event Contracts…'
                : market
                  ? `${asset} · ${market.intervalLabel} · ${market.collateralSymbol}`
                  : `No ${asset} game live`}
            </div>
          )}
          <div className="mt-2 flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.08em] text-text-3">
            <WalletCards className="h-3.5 w-3.5" aria-hidden="true" />
            {wallet.address
              ? shortId(wallet.address)
              : 'Wallet connects when you lock a play'}
          </div>
          {wallet.address && <TestCollateralCard collateral={collateral} />}
        </div>
      </div>
    </div>
  )
}

function LongShotGame({
  asset,
  market,
  marketPhase,
  connection,
  targetIndex,
  targetCount,
  targetPrice,
  phase,
  side,
  stake,
  quote,
  quotePhase,
  quoteError,
  livePrice,
  collateral,
  walletStatus,
  walletError,
  walletStep,
  orderError,
  quoteNotice,
  repricePending,
  order,
  howToOpen,
}: {
  asset: string
  market: PumpyEventMarket | null
  marketPhase: string
  connection: string
  targetIndex: number
  targetCount: number
  targetPrice: number | null | undefined
  phase: LongShotPhase
  side: PlayerSide | null
  stake: number
  quote: PreparedPlayerTrade | null
  quotePhase: string
  quoteError: string | null
  livePrice: LiveAssetPriceState
  collateral: ReturnType<typeof useTestCollateral>
  walletStatus: PlayerWalletControls['status']
  walletError: string | null
  walletStep: WalletStep
  orderError: string | null
  quoteNotice: string | null
  repricePending: boolean
  order: PlayerOrderOutcome | null
  howToOpen: boolean
}) {
  const secondsLeft = useEventSeconds(market?.expiresAt ?? null)
  if (marketPhase === 'loading') {
    return (
      <ScreenMessage
        title="Loading targets"
        body="Finding live fixed-strike DreamDEX Event Contracts."
        hint="Syncing"
      />
    )
  }
  if (!market) {
    return (
      <ScreenMessage
        title="No Long Shot target"
        body={`DreamDEX has no safely tradable fixed-strike ${asset} contract right now. Nothing was charged.`}
        hint="Watching for the next target"
      />
    )
  }

  const available = collateral.snapshot
    ? formatUnits(collateral.snapshot.balanceRaw, collateral.snapshot.decimals)
    : null
  const premium = quote
    ? formatUnits(quote.escrowRaw, quote.collateralDecimals)
    : null
  const payout = quote
    ? formatUnits(quote.quantityRaw, quote.collateralDecimals)
    : null
  const previewSide =
    side ??
    (targetPrice != null && livePrice.price != null
      ? longShotSideForTarget(livePrice.price, targetPrice)
      : null)
  const distancePct =
    targetPrice != null && livePrice.price != null
      ? longShotDistancePercent(livePrice.price, targetPrice)
      : null
  const reviewing =
    phase === 'review' || phase === 'submitting' || phase === 'error'
  const nextAction =
    phase === 'submitting'
      ? walletStep === 'approving'
        ? `Approve ${market.collateralSymbol} in your wallet`
        : walletStep === 'placing'
          ? 'Confirm the fixed-strike order in your wallet'
          : walletStep === 'refreshing'
            ? 'Rechecking the target after approval'
            : 'Checking the final live terms'
      : repricePending || quotePhase === 'loading'
        ? 'Refreshing executable odds'
        : walletStatus === 'wrong-network'
          ? 'Press SWITCH to use Shannon'
          : walletStatus === 'unavailable'
            ? 'Open Pumpy in a wallet browser'
            : walletStatus === 'error'
              ? 'Press RETRY to reconnect'
              : walletStatus !== 'connected'
                ? 'Press CONNECT to continue'
                : 'Press LOCK IN to sign'

  return (
    <div className="relative flex h-full flex-col">
      <div
        className={cnm(
          'flex shrink-0 items-start justify-between gap-3 bg-black pb-2.5',
          RIM,
          RIM_TOP,
        )}
      >
        <div className="min-w-0">
          <div className="font-mono text-[9px] font-black uppercase tracking-[0.16em] text-text-3">
            Long Shot · {asset} / USD
          </div>
          <div className="mt-0.5 overflow-hidden text-[34px] font-black leading-none text-text tabular-nums">
            <LivePrice price={livePrice.price} />
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="font-mono text-[9px] font-black uppercase tracking-[0.14em] text-text-3">
            Available
          </div>
          <div className="mt-0.5 text-[20px] font-black leading-none text-text-2 tabular-nums">
            {available == null ? '—' : `$${formatMoney(available)}`}
          </div>
        </div>
      </div>

      <div className="grid h-[68px] shrink-0 grid-cols-[1fr_auto_1fr] items-center border-y border-line-strong bg-black px-[var(--screen-rim,24px)]">
        <div className="min-w-0 pr-5 text-left">
          <div className="font-mono text-[9px] font-black uppercase tracking-[0.15em] text-text-3">
            Target {targetCount ? `${targetIndex + 1}/${targetCount}` : ''}
          </div>
          <div className="mt-1 text-[24px] font-black leading-none text-brand-500 tabular-nums">
            {targetPrice == null ? 'Syncing' : `$${formatPrice(targetPrice)}`}
          </div>
        </div>
        <div className="h-9 w-px bg-line-strong" />
        <div className="min-w-0 pl-5 text-right">
          <div className="font-mono text-[9px] font-black uppercase tracking-[0.15em] text-text-3">
            Call
          </div>
          <div
            className={cnm(
              'mt-1 text-[24px] font-black leading-none',
              previewSide === 'UP' ? 'text-up' : 'text-down',
            )}
          >
            {previewSide === 'UP' ? '▲ REACH UP' : '▼ REACH DOWN'}
          </div>
        </div>
      </div>

      <LivePriceChart
        state={livePrice}
        className="min-h-[104px] flex-1"
        eventCountdown={secondsLeft == null ? null : String(secondsLeft)}
        targetPrice={targetPrice}
        side={previewSide}
      />

      <div
        className={cnm(
          'min-h-[var(--screen-notch,21%)] shrink-0 border-t border-line-strong bg-black pt-3.5',
          RIM,
          LEFT_READOUT_BOTTOM,
        )}
      >
        <div className="max-w-[64%]">
          {!reviewing ? (
            <>
              <div className="font-mono text-[9px] font-black uppercase tracking-[0.14em] text-text-3">
                Fixed-strike contract
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-[25px] font-black uppercase leading-none text-brand-500">
                  {distancePct == null
                    ? 'Syncing'
                    : `${distancePct.toFixed(3)}%`}
                </span>
                <span className="font-mono text-[9px] font-black uppercase tracking-[0.1em] text-text-2">
                  to target
                </span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
                <Readout label="Amount" value={`$${stake}`} />
                <Readout
                  label="Ends"
                  value={secondsLeft == null ? '—' : `${secondsLeft}s`}
                />
              </div>
              <div className="mt-2.5 border-t border-line pt-2 font-mono text-[8px] uppercase leading-[1.4] tracking-[0.06em] text-text-3">
                DreamDEX {connection} · Turn TARGET, then press REVIEW.
              </div>
            </>
          ) : (
            <>
              <div className="font-mono text-[9px] font-black uppercase tracking-[0.14em] text-text-3">
                Wallet-signed play · quote {quotePhase}
              </div>
              {quote ? (
                <div className="mt-2 grid grid-cols-2 gap-x-4">
                  <Readout label="Cost" value={`$${formatMoney(premium)}`} />
                  <Readout label="Payout" value={`$${formatMoney(payout)}`} />
                </div>
              ) : (
                <div className="mt-2 flex items-center gap-2 font-mono text-[9px] font-bold uppercase text-text-3">
                  <LoaderCircle className="h-4 w-4 animate-spin" /> Reading the
                  fixed-strike book
                </div>
              )}
              <div className="mt-2.5 font-mono text-[9px] font-black uppercase tracking-[0.08em] text-brand-500">
                {nextAction}
              </div>
              <div className="mt-2 border-t border-line pt-2 font-mono text-[8px] uppercase leading-[1.35] tracking-[0.06em] text-text-3">
                Maximum loss ${formatMoney(premium)} · Wins only if {asset}{' '}
                settles {previewSide === 'UP' ? 'at or above' : 'below'}{' '}
                {targetPrice == null
                  ? 'the target'
                  : `$${formatPrice(targetPrice)}`}{' '}
                · nothing is placed until you approve
              </div>
            </>
          )}
          {(orderError || quoteError || walletError) && (
            <div
              className="mt-2 truncate whitespace-nowrap border-l-2 border-down pl-2 font-mono text-[8px] uppercase leading-[1.4] text-down"
              title={orderError ?? quoteError ?? walletError ?? undefined}
            >
              {orderError ?? quoteError ?? walletError}
              {order?.hash ? ` · ${shortId(order.hash)}` : ''}
            </div>
          )}
          {quoteNotice && !orderError && !quoteError && !walletError && (
            <div
              className="mt-2 border-l-2 border-pumpy-caution pl-2 font-mono text-[8px] font-black uppercase leading-[1.4] text-pumpy-caution"
              role="status"
            >
              {quoteNotice}
            </div>
          )}
        </div>
      </div>

      {howToOpen && (
        <ScreenOverlay title="How to play" subtitle="Long Shot · real trade">
          <div className="space-y-4 font-mono text-[11px] font-semibold leading-[1.5] text-text-2">
            <LongShotHowToRow
              step="01"
              title="Choose a target"
              body="Turn the big TARGET wheel. Every line is a live fixed-strike DreamDEX Event Contract."
            />
            <LongShotHowToRow
              step="02"
              title="Review the reach"
              body="Pumpy calls the side that must cross the strike. Review the exact cost, payout, maximum loss, and expiry."
            />
            <LongShotHowToRow
              step="03"
              title="Lock it in"
              body="Your wallet approves collateral if needed, then signs its own IOC order. The bot never touches your funds."
            />
            <LongShotHowToRow
              step="04"
              title="Exit or settle"
              body="Cash out against the live book before lock, or hold for DreamDEX resolution and claim a winning payout."
            />
          </div>
        </ScreenOverlay>
      )}
    </div>
  )
}

function LongShotHowToRow({
  step,
  title,
  body,
}: {
  step: string
  title: string
  body: string
}) {
  return (
    <div className="grid grid-cols-[28px_1fr] gap-3 border-t border-line-strong pt-3 first:border-t-0 first:pt-0">
      <span className="text-brand-500">{step}</span>
      <div>
        <div className="font-black uppercase tracking-[0.1em] text-text">
          {title}
        </div>
        <p className="mt-1 text-text-3">{body}</p>
      </div>
    </div>
  )
}

function LuckyGame({
  asset,
  market,
  closingMarket,
  nextMarket,
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
  walletStatus,
  walletError,
  walletStep,
  orderError,
  quoteNotice,
  repricePending,
  order,
  howToOpen,
}: {
  asset: string
  market: PumpyEventMarket | null
  closingMarket: PumpyEventMarket | null
  nextMarket: PumpyEventMarket | null
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
  walletStatus: PlayerWalletControls['status']
  walletError: string | null
  walletStep: WalletStep
  orderError: string | null
  quoteNotice: string | null
  repricePending: boolean
  order: PlayerOrderOutcome | null
  howToOpen: boolean
}) {
  const nextStartsIn = useEventSeconds(nextMarket?.tradingStartsAt ?? null)

  if (marketPhase === 'loading') {
    return (
      <ScreenMessage
        title="Loading the reels"
        body="Finding a live DreamDEX Event Contract."
        hint="Syncing"
      />
    )
  }
  if (!market && (closingMarket || nextMarket)) {
    return (
      <ScreenMessage
        title={nextMarket ? 'Next round loading' : 'Round closing'}
        body={
          nextMarket
            ? `${asset} trading opens in ${nextStartsIn ?? 0}s. Pumpy will select it automatically.`
            : `The current ${asset} Event Contract is inside the safety window. Waiting for DreamDEX to list its successor.`
        }
        hint="No wallet action needed"
      />
    )
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
  const targetPrice = resolveOracleTargetPrice(
    market.targetPriceRaw,
    livePrice.price,
  )?.price
  const nextAction =
    phase === 'submitting'
      ? walletStep === 'approving'
        ? `Approve ${market.collateralSymbol} in your wallet`
        : walletStep === 'placing'
          ? 'Confirm the order in your wallet'
          : walletStep === 'refreshing'
            ? 'Rechecking the market after approval'
            : 'Checking the final live terms'
      : repricePending || quotePhase === 'loading'
        ? 'Refreshing executable odds'
        : walletStatus === 'wrong-network'
          ? 'Press SWITCH to use Shannon'
          : walletStatus === 'unavailable'
            ? 'Open Pumpy in a wallet browser'
            : walletStatus === 'error'
              ? 'Press RETRY to reconnect'
              : walletStatus !== 'connected'
                ? 'Press CONNECT to continue'
                : 'Press LOCK IN to sign'

  return (
    <div className="relative flex h-full flex-col">
      <div
        className={cnm(
          'flex shrink-0 items-start justify-between gap-3 bg-black pb-2.5',
          RIM,
          RIM_TOP,
        )}
      >
        <div className="min-w-0">
          <div className="font-mono text-[9px] font-black uppercase tracking-[0.16em] text-text-3">
            {asset} / USD
          </div>
          <div className="mt-0.5 overflow-hidden text-[34px] font-black leading-none text-text tabular-nums">
            <LivePrice price={livePrice.price} />
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="font-mono text-[9px] font-black uppercase tracking-[0.14em] text-text-3">
            Available
          </div>
          <div className="mt-0.5 text-[20px] font-black leading-none text-text-2 tabular-nums">
            {available == null ? '—' : `$${formatMoney(available)}`}
          </div>
        </div>
      </div>

      <div
        className="relative shrink-0 overflow-hidden border-y border-line-strong bg-black transition-[height] duration-500 ease-out"
        style={{ height: dealt ? 68 : 164 }}
      >
        <div
          className="absolute inset-0 transition-[opacity,transform] duration-300"
          style={{
            opacity: dealt ? 0 : 1,
            transform: dealt
              ? 'translateY(-10px) scale(.76)'
              : 'translateY(0) scale(1)',
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
          className="absolute inset-0 grid grid-cols-[1fr_auto_1fr] items-center px-[var(--screen-rim,24px)] transition-opacity duration-300"
          style={{ opacity: dealt ? 1 : 0 }}
        >
          {side && (
            <>
              <div className="min-w-0 pr-5 text-left">
                <div className="font-mono text-[9px] font-black uppercase tracking-[0.15em] text-text-3">
                  Direction
                </div>
                <div
                  className={cnm(
                    'mt-1 text-[25px] font-black leading-none',
                    side === 'UP' ? 'text-up' : 'text-down',
                  )}
                >
                  {side === 'UP' ? '▲ UP' : '▼ DOWN'}
                </div>
              </div>
              <div className="h-9 w-px bg-line-strong" />
              <div className="min-w-0 pl-5 text-right">
                <div className="font-mono text-[9px] font-black uppercase tracking-[0.15em] text-text-3">
                  Live odds
                </div>
                <div className="mt-1 text-[25px] font-black leading-none text-brand-500">
                  {multiplier ? `${multiplier.toFixed(2)}×` : '—'}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <LivePriceChart
        state={livePrice}
        className="min-h-[104px] flex-1"
        targetPrice={targetPrice}
        side={dealt ? side : null}
      />

      <div
        className={cnm(
          'min-h-[var(--screen-notch,21%)] shrink-0 border-t border-line-strong bg-black pt-3.5',
          RIM,
          LEFT_READOUT_BOTTOM,
        )}
      >
        <div className="max-w-[64%]">
          {phase === 'idle' && (
            <>
              <div className="font-mono text-[9px] font-black uppercase tracking-[0.14em] text-text-3">
                Lucky
              </div>
              <div className="mt-0.5 text-[22px] font-black uppercase leading-none text-text">
                I Feel Lucky
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-[30px] font-black leading-none text-brand-500 tabular-nums">
                  ${stake}
                </span>
                <span className="font-mono text-[9px] font-black uppercase tracking-[0.12em] text-text-3">
                  Amount
                </span>
              </div>
              <div className="mt-2.5 font-mono text-[9px] font-bold uppercase leading-snug tracking-[0.08em] text-text-2">
                Press the button on the right to spin
              </div>
            </>
          )}
          {spinning && (
            <>
              <div className="font-mono text-[9px] font-black uppercase tracking-[0.14em] text-text-3">
                Dealing
              </div>
              <div className="mt-1 text-[28px] font-black uppercase leading-none text-brand-500">
                Spinning…
              </div>
              <div className="mt-2 font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-text-2">
                {quotePhase === 'loading' ? 'Reading live odds' : 'Deal ready'}
              </div>
            </>
          )}
          {dealt && (
            <>
              <div className="font-mono text-[9px] font-black uppercase tracking-[0.14em] text-text-3">
                Wallet-signed play
              </div>
              {quote ? (
                <div className="mt-2 grid grid-cols-2 gap-x-4">
                  <Readout label="Cost" value={`$${formatMoney(premium)}`} />
                  <Readout label="Payout" value={`$${formatMoney(payout)}`} />
                </div>
              ) : (
                <div className="mt-2 flex items-center gap-2 font-mono text-[9px] font-bold uppercase text-text-3">
                  <LoaderCircle className="h-4 w-4 animate-spin" /> Refreshing
                  odds
                </div>
              )}
              <div className="mt-2.5 font-mono text-[9px] font-black uppercase tracking-[0.08em] text-brand-500">
                {nextAction}
              </div>
              <div className="mt-2 border-t border-line pt-2 font-mono text-[8px] uppercase tracking-[0.06em] text-text-3">
                Maximum loss ${formatMoney(premium)} · Nothing is placed until
                you approve
              </div>
            </>
          )}
          {(orderError || quoteError || walletError) && (
            <div
              className="mt-2 truncate whitespace-nowrap border-l-2 border-down pl-2 font-mono text-[8px] uppercase leading-[1.4] text-down"
              title={orderError ?? quoteError ?? walletError ?? undefined}
            >
              {orderError ?? quoteError ?? walletError}
              {order?.hash ? ` · ${shortId(order.hash)}` : ''}
            </div>
          )}
          {quoteNotice && !orderError && !quoteError && !walletError && (
            <div
              className="mt-2 border-l-2 border-pumpy-caution pl-2 font-mono text-[8px] font-black uppercase leading-[1.4] text-pumpy-caution"
              role="status"
            >
              {quoteNotice}
            </div>
          )}
        </div>
      </div>

      {howToOpen && (
        <ScreenOverlay title="How to play" subtitle="I Feel Lucky · real trade">
          <div className="space-y-4 font-mono text-[11px] font-semibold leading-[1.5] text-text-2">
            <LongShotHowToRow
              step="01"
              title="Set the amount"
              body="Use the number wheel to choose how much test collateral to put at risk."
            />
            <LongShotHowToRow
              step="02"
              title="Spin"
              body="Pumpy transparently deals UP or DOWN, then reads the executable odds from DreamDEX."
            />
            <LongShotHowToRow
              step="03"
              title="Review and lock"
              body="Check cost, potential payout, maximum loss, target, and expiry before your wallet signs."
            />
            <LongShotHowToRow
              step="04"
              title="Exit or claim"
              body="Cash out against the live book before lock, or wait for the onchain result and claim a win."
            />
          </div>
        </ScreenOverlay>
      )}
    </div>
  )
}

function LuckyPosition({
  round,
  snapshot,
  phase,
  error,
  livePrice,
  cashout,
  onRefresh,
}: {
  round: NonNullable<ReturnType<typeof useQuickCallRound>['round']>
  snapshot: ReturnType<typeof useQuickCallRound>['snapshot']
  phase: ReturnType<typeof useQuickCallRound>['phase']
  error: string | null
  livePrice: LiveAssetPriceState
  cashout: ReturnType<typeof usePlayerCashout>
  onRefresh: () => void | Promise<void>
}) {
  const result = snapshot?.phase
  const isLongShot = round.game === 'long-shot'
  const announced = useRef<string | null>(null)
  const refreshedAtExpiry = useRef<string | null>(null)
  const secondsLeft = useEventSeconds(round.expiresAt) ?? 0
  const expired = secondsLeft <= 0
  const resolved =
    result === 'claimable' ||
    result === 'won' ||
    result === 'lost' ||
    result === 'voided' ||
    result === 'claimed' ||
    result === 'cashed-out'
  const frozenPrice = useRef<LiveAssetPriceState | null>(null)
  if (!expired) {
    frozenPrice.current = { ...livePrice, points: [...livePrice.points] }
  }
  const chartState = expired ? (frozenPrice.current ?? livePrice) : livePrice
  const targetPrice = resolveOracleTargetPrice(
    snapshot?.targetPriceRaw ?? round.targetPriceRaw,
    chartState.price,
  )?.price
  const currentlyWinning =
    !expired && chartState.price != null && targetPrice != null
      ? isCallCurrentlyWinning({
          side: round.side,
          livePrice: chartState.price,
          targetPrice,
        })
      : null
  const costRaw = BigInt(round.escrowRaw)
  const filledPayoutRaw = BigInt(round.filledQuantityRaw)
  const payoutRaw =
    snapshot && snapshot.estimatedPayoutRaw > 0n
      ? snapshot.estimatedPayoutRaw
      : filledPayoutRaw
  const profitRaw = payoutRaw > costRaw ? payoutRaw - costRaw : 0n
  const refundRaw =
    snapshot && snapshot.claimableRaw > 0n
      ? snapshot.estimatedPayoutRaw > 0n
        ? snapshot.estimatedPayoutRaw
        : snapshot.claimableRaw
      : costRaw
  const cost = moneyFromRaw(costRaw, round.collateralDecimals)
  const payout = moneyFromRaw(payoutRaw, round.collateralDecimals)
  const profit = moneyFromRaw(profitRaw, round.collateralDecimals)
  const refund = moneyFromRaw(refundRaw, round.collateralDecimals)
  const exitProceedsRaw = cashout.quote?.estimatedProceedsRaw ?? null
  const exitProceeds =
    exitProceedsRaw == null
      ? null
      : moneyFromRaw(exitProceedsRaw, round.collateralDecimals)
  const exitPnlRaw = exitProceedsRaw == null ? null : exitProceedsRaw - costRaw
  const exitPnl =
    exitPnlRaw == null
      ? null
      : `${exitPnlRaw >= 0n ? '+' : '−'}$${moneyFromRaw(
          exitPnlRaw >= 0n ? exitPnlRaw : -exitPnlRaw,
          round.collateralDecimals,
        )}`

  useEffect(() => {
    if (!expired || resolved || refreshedAtExpiry.current === round.marketId)
      return
    refreshedAtExpiry.current = round.marketId
    void onRefresh()
  }, [expired, onRefresh, resolved, round.marketId])

  useEffect(() => {
    let key: string | null = null
    if (result === 'won' || result === 'claimable')
      key = `${round.marketId}:win`
    else if (result === 'lost') key = `${round.marketId}:loss`
    else if (result === 'claimed') key = `${round.marketId}:claimed`
    else if (result === 'cashed-out') key = `${round.marketId}:cashed-out`
    if (!key || announced.current === key) return
    announced.current = key
    if (result === 'won' || result === 'claimable') {
      hapticPattern('win')
      if (isLongShot) moonshotWin()
      else luckyWin()
    } else if (result === 'lost') {
      hapticPattern('lose')
      if (isLongShot) moonshotLose()
      else luckyLose()
    } else if (result === 'claimed') {
      hapticPattern('cashOut')
      chipsGranted()
    } else if (result === 'cashed-out') {
      hapticPattern('cashOut')
      if (isLongShot) moonshotCashout()
      else luckyCashout()
    }
  }, [isLongShot, result, round.marketId])

  if (!resolved) {
    return (
      <div className="relative flex h-full flex-col">
        <div
          className={cnm(
            'flex shrink-0 items-start justify-between gap-3 bg-black pb-2.5',
            RIM,
            RIM_TOP,
          )}
        >
          <div className="min-w-0">
            <div className="font-mono text-[9px] font-black uppercase tracking-[0.16em] text-text-3">
              {round.asset} / USD
            </div>
            <div className="mt-0.5 overflow-hidden text-[34px] font-black leading-none text-text tabular-nums">
              <LivePrice price={chartState.price} />
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="font-mono text-[9px] font-black uppercase tracking-[0.14em] text-text-3">
              Target
            </div>
            <div className="mt-0.5 text-[20px] font-black leading-none text-text-2 tabular-nums">
              {targetPrice == null ? 'Syncing' : `$${formatPrice(targetPrice)}`}
            </div>
          </div>
        </div>

        <div className="flex h-[68px] shrink-0 items-center justify-center gap-8 border-y border-line-strong bg-black px-[var(--screen-rim,24px)]">
          <div className="text-center">
            <div className="font-mono text-[9px] font-black uppercase tracking-[0.15em] text-text-3">
              Direction
            </div>
            <div
              className={cnm(
                'mt-1 text-[25px] font-black leading-none',
                round.side === 'UP' ? 'text-up' : 'text-down',
              )}
            >
              {round.side === 'UP' ? '▲ UP' : '▼ DOWN'}
            </div>
          </div>
          <div className="h-9 w-px bg-line-strong" />
          <div className="text-center">
            <div className="font-mono text-[9px] font-black uppercase tracking-[0.15em] text-text-3">
              {currentlyWinning === null
                ? 'Line to beat'
                : currentlyWinning
                  ? 'Currently ahead'
                  : 'Currently behind'}
            </div>
            <div
              className={cnm(
                'mt-1 text-[25px] font-black leading-none',
                currentlyWinning === false ? 'text-down' : 'text-brand-500',
              )}
            >
              {targetPrice == null || chartState.price == null
                ? '—'
                : `${currentlyWinning ? '▲' : '▼'} $${formatPrice(
                    Math.abs(chartState.price - targetPrice),
                  )}`}
            </div>
          </div>
        </div>

        <div className="relative min-h-0 flex-1">
          <LivePriceChart
            state={chartState}
            className="absolute inset-0"
            eventCountdown={String(secondsLeft)}
            targetPrice={targetPrice}
            side={round.side}
          />
          {expired && (
            <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-black/35">
              <div className="border border-brand-500/50 bg-black/85 px-4 py-2 text-center shadow-[0_0_24px_rgba(184,255,74,.12)]">
                <div className="font-mono text-[9px] font-black uppercase tracking-[0.18em] text-brand-500">
                  Settling
                </div>
                <div className="mt-1 font-mono text-[8px] font-bold uppercase tracking-[0.08em] text-text-2">
                  Waiting for DreamDEX
                </div>
              </div>
            </div>
          )}
        </div>

        <div
          className={cnm(
            'min-h-[var(--screen-notch,21%)] shrink-0 border-t border-line-strong bg-black pt-3.5',
            RIM,
            RIM_BOTTOM,
          )}
        >
          <div className="max-w-[64%]">
            <div className="font-mono text-[9px] font-black uppercase tracking-[0.14em] text-text-3">
              {expired ? 'Oracle resolution' : 'Position open'}
            </div>
            <div className="mt-1 text-[25px] font-black uppercase leading-none text-brand-500">
              {expired
                ? 'Settling'
                : currentlyWinning === true
                  ? 'On target'
                  : currentlyWinning === false
                    ? 'Off target'
                    : 'In play'}
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <Readout label="Cost" value={`$${cost}`} />
              <Readout
                label="Cash out"
                value={exitProceeds == null ? '—' : `$${exitProceeds}`}
              />
              <Readout label="Exit P/L" value={exitPnl ?? '—'} />
            </div>
            <div className="mt-2 font-mono text-[8px] uppercase leading-[1.4] tracking-[0.06em] text-text-3">
              {expired
                ? 'No result is shown until DreamDEX resolves onchain'
                : liveCashoutGuidance({
                    phase: cashout.phase,
                    fullExitAvailable: cashout.fullExitAvailable,
                    authorizationRequired: cashout.authorizationRequired,
                    heldPayout: payout,
                  })}
            </div>
            {!expired && cashout.error && (
              <div className="mt-2 border-l-2 border-pumpy-caution pl-2 font-mono text-[8px] uppercase leading-[1.4] text-pumpy-caution">
                {cashout.error}
              </div>
            )}
            {error && (
              <div className="mt-2 border-l-2 border-down pl-2 font-mono text-[8px] uppercase leading-[1.4] text-down">
                {error}
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  const presentation =
    result === 'claimable'
      ? {
          tone: 'win' as const,
          kicker: 'Resolved onchain',
          title: 'You won',
          value: `+$${profit}`,
          body: `Your total payout is $${payout}. Press CLAIM to send it to your wallet.`,
        }
      : result === 'won'
        ? {
            tone: 'win' as const,
            kicker: 'Outcome confirmed',
            title: 'You won',
            value: `+$${profit}`,
            body: 'The Event Contract resolved in your direction. Claimability is still syncing.',
          }
        : result === 'lost'
          ? {
              tone: 'loss' as const,
              kicker: 'Resolved onchain',
              title: 'Missed',
              value: `−$${cost}`,
              body: `DreamDEX resolved against ${round.side}. Your actual filled cost was $${cost}.`,
            }
          : result === 'claimed'
            ? {
                tone: 'claimed' as const,
                kicker: 'Claim confirmed',
                title: 'Paid out',
                value: `$${payout}`,
                body: 'The payout claim was confirmed and sent to your wallet.',
              }
            : result === 'cashed-out'
              ? {
                  tone: 'claimed' as const,
                  kicker: 'Exit filled onchain',
                  title: 'Cashed out',
                  value: `${
                    BigInt(round.cashoutProceedsRaw ?? '0') >= costRaw
                      ? '+'
                      : '−'
                  }$${moneyFromRaw(
                    BigInt(round.cashoutProceedsRaw ?? '0') >= costRaw
                      ? BigInt(round.cashoutProceedsRaw ?? '0') - costRaw
                      : costRaw - BigInt(round.cashoutProceedsRaw ?? '0'),
                    round.collateralDecimals,
                  )}`,
                  body: `DreamDEX sold the position before expiry for $${moneyFromRaw(
                    BigInt(round.cashoutProceedsRaw ?? '0'),
                    round.collateralDecimals,
                  )}. No settlement claim is required.`,
                }
              : {
                  tone: 'claimed' as const,
                  kicker: 'Market voided',
                  title: 'Returned',
                  value: `$${refund}`,
                  body:
                    (snapshot?.claimableRaw ?? 0n) > 0n
                      ? 'DreamDEX voided this market. Press CLAIM to retrieve the available refund.'
                      : 'DreamDEX voided this market. Refund availability is still syncing.',
                }

  return (
    <div className="flex h-full flex-col">
      <div
        className={cnm('flex items-center justify-between pb-3', RIM, RIM_TOP)}
      >
        <div className="font-mono text-[10px] font-black uppercase tracking-[0.15em] text-text-3">
          {isLongShot ? 'Long Shot position' : 'Lucky position'}
        </div>
        <div className="font-mono text-[10px] font-black uppercase tracking-[0.15em] text-brand-500">
          Onchain
        </div>
      </div>
      <div className="h-px bg-line-strong" />
      <GameSettlementScreen {...presentation}>
        <div className="mx-auto mt-5 grid max-w-[280px] grid-cols-3 gap-4 border-y border-white/10 py-3 text-left">
          <Readout label="Cost" value={`$${cost}`} />
          <Readout
            label={result === 'voided' ? 'Refund' : 'Payout'}
            value={
              result === 'lost'
                ? '$0.00'
                : result === 'cashed-out'
                  ? `$${moneyFromRaw(
                      BigInt(round.cashoutProceedsRaw ?? '0'),
                      round.collateralDecimals,
                    )}`
                  : result === 'voided'
                    ? `$${refund}`
                    : `$${payout}`
            }
          />
          <Readout
            label={result === 'lost' ? 'Lost' : 'Profit'}
            value={
              result === 'lost'
                ? `−$${cost}`
                : result === 'cashed-out'
                  ? presentation.value
                  : `+$${profit}`
            }
          />
        </div>
        {error && (
          <p className="mx-auto mt-3 max-w-[32ch] font-mono text-[8px] uppercase leading-[1.4] text-down">
            {error}
          </p>
        )}
        {round.claimHash && (
          <p className="mx-auto mt-3 font-mono text-[8px] uppercase tracking-[0.1em] text-text-3">
            Claim {shortId(round.claimHash)}
          </p>
        )}
        {round.cashoutHash && (
          <p className="mx-auto mt-3 font-mono text-[8px] uppercase tracking-[0.1em] text-text-3">
            Exit {shortId(round.cashoutHash)}
          </p>
        )}
      </GameSettlementScreen>
      <div className={cnm('border-t border-line-strong pt-3', RIM, RIM_BOTTOM)}>
        <div className="max-w-[62%] font-mono text-[9px] uppercase leading-[1.45] tracking-[0.08em] text-text-3">
          {result === 'claimable'
            ? 'Payout ready · press claim'
            : result === 'voided' && (snapshot?.claimableRaw ?? 0n) > 0n
              ? 'Refund ready · press claim'
              : result === 'claimed'
                ? 'Claim recorded onchain'
                : result === 'cashed-out'
                  ? 'Exit receipt confirmed · no claim needed'
                  : phase === 'loading' || result === 'won'
                    ? 'Refreshing Event Contract state'
                    : 'Press the big button to play again'}
        </div>
      </div>
    </div>
  )
}

function CandleHop({ onExit }: { onExit: () => void }) {
  const reducedMotion = useReducedMotion()
  const [phase, setPhase] = useState<'title' | 'playing' | 'over'>('title')
  const [score, setScore] = useState(0)
  const [result, setResult] = useState<{
    score: number
    isBest: boolean
    badge: string | null
  } | null>(null)
  const [best, setBest] = useState(() => {
    if (typeof window === 'undefined') return 0
    return Number(window.localStorage.getItem('pumpy:candle-hop:best') ?? 0)
  })
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const engineRef = useRef<CandleHopEngine | null>(null)
  const bestRef = useRef(best)
  const endRef = useRef<(score: number) => void>(() => {})
  bestRef.current = best

  endRef.current = (finalScore) => {
    const previousBest = bestRef.current
    const outcome = candleHopOutcome(finalScore, previousBest)
    bestRef.current = outcome.best
    setScore(finalScore)
    setBest(outcome.best)
    setResult(outcome)
    setPhase('over')
    window.localStorage.setItem('pumpy:candle-hop:best', String(outcome.best))
    window.dispatchEvent(new CustomEvent('pumpy:profile-updated'))
    hapticPattern(outcome.pattern)
    if (outcome.isBest) {
      achievementUnlock()
      sound('win')
    }
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const engine = new CandleHopEngine(canvas, {
      reduced: reducedMotion,
      onScore: (nextScore) => {
        setScore(nextScore)
        haptic('low')
        hopScore()
      },
      onCrash: () => {
        stopBgm()
        hopLose()
      },
      onEnd: (finalScore) => endRef.current(finalScore),
    })
    engineRef.current = engine
    return () => {
      engine.destroy()
      stopBgm()
    }
  }, [reducedMotion])

  const start = useCallback(() => {
    setScore(0)
    setResult(null)
    setPhase('playing')
    hopResetCombo()
    startBgm()
    engineRef.current?.start()
    haptic('high')
  }, [])
  const hop = useCallback(() => {
    engineRef.current?.hop()
    haptic('low')
  }, [])

  useConsoleControls({
    action1:
      phase === 'playing'
        ? null
        : { label: 'HOME', color: 'neutral', onPress: onExit },
    main:
      phase === 'playing'
        ? { label: 'HOP', color: 'amber', onPress: hop }
        : {
            label: phase === 'over' ? 'PLAY AGAIN' : 'PLAY',
            color: 'amber',
            onPress: start,
          },
    lightShow: phase === 'playing',
    status: { left: 'CANDLE HOP', right: `BEST ${best}` },
  })

  return (
    <GameScreen>
      <GameStage
        top={
          phase === 'playing' ? (
            <div className="pt-3">
              <div className="font-mono text-[9px] font-black uppercase tracking-[0.15em] text-text-3">
                Score
              </div>
              <div className="text-[38px] font-black leading-none text-text tabular-nums">
                {score}
              </div>
              <div className="mt-1 font-mono text-[9px] font-black uppercase tracking-[0.12em] text-text-3">
                Best{' '}
                <span className="text-text-2">{Math.max(best, score)}</span>
              </div>
            </div>
          ) : null
        }
      >
        <canvas
          ref={canvasRef}
          className="absolute inset-0 block h-full w-full"
        />
      </GameStage>
      <GameReadout>
        <div className="flex items-center gap-3">
          <CandlestickChart className="h-7 w-7 shrink-0 text-brand-500" />
          <div>
            <div className="text-[18px] font-black uppercase leading-none text-text">
              Candle Hop
            </div>
            <div className="mt-1 font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-text-2">
              Tap the big button to fly
            </div>
          </div>
        </div>
      </GameReadout>
      <ScreenCRT />
      {phase === 'title' && <CandleHopTitle best={best} />}
      {phase === 'over' && result && (
        <CandleHopResult result={result} best={best} />
      )}
    </GameScreen>
  )
}

function CandleHopTitle({ best }: { best: number }) {
  return (
    <div className="absolute inset-0 z-20 flex flex-col justify-center bg-black/94 p-[var(--screen-rim,24px)] backdrop-blur-[1px]">
      <div className="flex items-center gap-3">
        <img
          src="/pumpy-mark.svg"
          alt=""
          className="h-12 w-12 rounded-[14px]"
        />
        <div>
          <div className="font-mono text-[9px] font-black uppercase tracking-[0.18em] text-brand-500">
            Pumpy arcade
          </div>
          <h1 className="mt-1 text-[34px] font-black uppercase leading-none text-text">
            Candle Hop
          </h1>
        </div>
      </div>
      <p className="mt-4 max-w-[82%] text-[13px] font-semibold leading-[1.4] text-text-2">
        Tap to lift Pumpy, let it fall, and slip through the candle gaps. One
        bad line ends the run.
      </p>
      <div className="mt-6 border-y border-white/10 py-4">
        <div className="font-mono text-[9px] font-black uppercase tracking-[0.14em] text-text-3">
          Personal best
        </div>
        <div className="mt-1 text-[42px] font-black leading-none text-brand-500 tabular-nums">
          {best}
        </div>
      </div>
      <div className="mt-4 font-mono text-[10px] font-black uppercase tracking-[0.12em] text-text-3">
        Press the <span className="text-brand-500">big button</span> to play
      </div>
    </div>
  )
}

function CandleHopResult({
  result,
  best,
}: {
  result: { score: number; isBest: boolean; badge: string | null }
  best: number
}) {
  return (
    <div className="absolute inset-0 z-20 flex flex-col justify-center overflow-hidden bg-black/95 p-[var(--screen-rim,24px)]">
      {result.isBest && (
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(184,255,74,.18),transparent_42%)]" />
      )}
      <div className="welcome-pop relative">
        <div
          className={cnm(
            'font-mono text-[10px] font-black uppercase tracking-[0.2em]',
            result.isBest ? 'text-brand-500' : 'text-down',
          )}
        >
          {result.isBest ? '★ New best' : 'Run over'}
        </div>
        <div className="mt-1 text-[58px] font-black leading-none text-text tabular-nums">
          {result.score}
        </div>
        <div className="mt-1 font-mono text-[10px] font-black uppercase tracking-[0.12em] text-text-3">
          Best {best}
        </div>
        {result.badge && (
          <div className="mt-5 flex items-center gap-3 border-y border-brand-500/25 bg-brand-500/[0.06] py-3">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-brand-500/40 bg-brand-500/12 shadow-[0_0_22px_rgba(184,255,74,.16)]">
              <img
                src="/pumpy-mark.svg"
                alt=""
                className="h-9 w-9 rounded-[10px]"
              />
            </div>
            <div>
              <div className="font-mono text-[8px] font-black uppercase tracking-[0.16em] text-brand-500">
                Badge unlocked
              </div>
              <div className="mt-1 text-[17px] font-black uppercase leading-none text-text">
                {result.badge}
              </div>
            </div>
          </div>
        )}
        <div className="mt-6 font-mono text-[10px] font-black uppercase tracking-[0.12em] text-text-3">
          Press the <span className="text-brand-500">big button</span> to play
          again
        </div>
      </div>
    </div>
  )
}

function Readout({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="font-mono text-[8px] font-black uppercase tracking-[0.12em] text-text-3">
        {label}
      </div>
      <div className="mt-1 truncate font-mono text-[12px] font-black text-text">
        {value}
      </div>
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
  return parsed.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  })
}

function formatPrice(value: number): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function moneyFromRaw(value: bigint, decimals: number): string {
  return formatMoney(formatUnits(value, decimals))
}

function shortId(value: string): string {
  return `${value.slice(0, 6)}…${value.slice(-4)}`
}

function useEventSeconds(expiresAtSeconds: number | null): number | null {
  const [now, setNow] = useState(Date.now)

  useEffect(() => {
    if (expiresAtSeconds === null) return
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(timer)
  }, [expiresAtSeconds])

  if (expiresAtSeconds === null) return null
  return eventSecondsRemaining(expiresAtSeconds, now)
}

function isWalletRejection(cause: unknown): boolean {
  if (!cause || typeof cause !== 'object') return false
  if ('code' in cause && cause.code === 4_001) return true
  if ('cause' in cause) return isWalletRejection(cause.cause)
  return false
}
