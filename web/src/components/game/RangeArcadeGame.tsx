import NumberFlow from '@number-flow/react'
import { useEffect, useMemo, useState } from 'react'
import { formatUnits } from 'viem'

import type { ConsoleControls } from '@/components/console/controls'
import type { LiveAssetPriceState } from '@/lib/dreamdex/useLiveAssetPrice'
import type {
  PlayerWalletStatus,
  PumpyEventMarket,
  PumpyRangePair,
} from '@/lib/dreamdex/types'
import { LivePrice } from '@/components/game/LivePrice'
import { LivePriceChart } from '@/components/game/LivePriceChart'
import { ScreenOverlay } from '@/components/game/screen'
import { useConsoleControls } from '@/components/console/controls'
import { selectFixedStrikeRangePairs } from '@/lib/dreamdex/range'
import { resolveOracleTargetPrice } from '@/lib/dreamdex/oracleTarget'
import { usePlayerRangeQuote } from '@/lib/dreamdex/usePlayerRangeQuote'
import { haptic } from '@/lib/haptics'
import { cnm } from '@/utils/style'

const RANGE_BUDGETS = [1, 5, 10, 25, 50] as const
const RIM = 'px-[var(--screen-rim,24px)]'
const RIM_TOP = 'pt-[calc(var(--screen-rim,24px)+6px)]'
const RIM_BOTTOM = 'pb-[calc(var(--screen-rim,24px)+var(--screen-notch,0px))]'

function pairDisplayPrices(
  pair: PumpyRangePair,
  livePrice: number | null,
): { lower: number; upper: number } | null {
  const lower = resolveOracleTargetPrice(pair.lower.strikeRaw, livePrice)?.price
  const upper = resolveOracleTargetPrice(pair.upper.strikeRaw, livePrice)?.price
  return lower != null && upper != null && lower < upper
    ? { lower, upper }
    : null
}

function chooseDisplayedPair(
  pairs: ReadonlyArray<PumpyRangePair>,
  livePrice: number | null,
): PumpyRangePair | null {
  if (!pairs.length) return null
  if (livePrice == null) return pairs[0]
  return (
    pairs.find((pair) => {
      const display = pairDisplayPrices(pair, livePrice)
      return (
        display != null &&
        livePrice >= display.lower &&
        livePrice < display.upper
      )
    }) ?? pairs[0]
  )
}

function rawAmount(raw: bigint | undefined, decimals: number | undefined) {
  if (raw == null || decimals == null) return null
  return Number(formatUnits(raw, decimals))
}

function MoneyFlow({ value }: { value: number | null }) {
  if (value == null) return <span>—</span>
  return (
    <NumberFlow
      value={value}
      prefix="$"
      format={{ minimumFractionDigits: 2, maximumFractionDigits: 2 }}
      transformTiming={{
        duration: 420,
        easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
      }}
      spinTiming={{
        duration: 420,
        easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
      }}
      trend={0}
    />
  )
}

export function RangeArcadeGame({
  asset,
  livePrice,
  markets,
  walletAddress,
  walletStatus,
  onAsset,
}: {
  asset: string
  livePrice: LiveAssetPriceState
  markets: ReadonlyArray<PumpyEventMarket>
  walletAddress: `0x${string}` | null
  walletStatus: PlayerWalletStatus
  onAsset: (asset: string) => void
}) {
  const [budgetIndex, setBudgetIndex] = useState(1)
  const [howToOpen, setHowToOpen] = useState(false)
  const [reviewPair, setReviewPair] = useState<PumpyRangePair | null>(null)
  const [nowSeconds, setNowSeconds] = useState(() =>
    Math.floor(Date.now() / 1_000),
  )
  const budget = RANGE_BUDGETS[budgetIndex]
  const pairs = useMemo(
    () => selectFixedStrikeRangePairs(markets, asset, nowSeconds),
    [asset, markets, nowSeconds],
  )
  const automaticPair = useMemo(
    () => chooseDisplayedPair(pairs, livePrice.price),
    [livePrice.price, pairs],
  )
  const pair = reviewPair ?? automaticPair
  const display = pair ? pairDisplayPrices(pair, livePrice.price) : null
  const rangeQuote = usePlayerRangeQuote({
    pair,
    budget,
    account: walletAddress,
    enabled: Boolean(pair),
  })
  const quote = rangeQuote.quote
  const decimals = quote?.collateralDecimals
  const estimatedCost = rawAmount(quote?.estimatedCostRaw, decimals)
  const maximumCost = rawAmount(quote?.maximumCostRaw, decimals)
  const outsidePayout = rawAmount(quote?.outsidePayoutRaw, decimals)
  const insidePayout = rawAmount(quote?.insidePayoutRaw, decimals)
  const maximumLoss = rawAmount(quote?.maximumLossRaw, decimals)
  const secondsLeft = pair ? Math.max(0, pair.expiresAt - nowSeconds) : null

  useEffect(() => {
    const timer = window.setInterval(
      () => setNowSeconds(Math.floor(Date.now() / 1_000)),
      1_000,
    )
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    setReviewPair(null)
  }, [asset, budgetIndex])

  const reviewing = reviewPair != null
  const controls = useMemo<ConsoleControls>(
    () => ({
      action1: {
        label: howToOpen ? 'CLOSE' : 'HOW TO',
        color: 'neutral',
        onPress: () => setHowToOpen((current) => !current),
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
          if (reviewing) {
            haptic('warning')
            return
          }
          onAsset(asset === 'BTC' ? 'ETH' : 'BTC')
        },
      },
      knob: {
        label: 'AMOUNT',
        min: 0,
        max: RANGE_BUDGETS.length - 1,
        step: 1,
        value: budgetIndex,
        onChange: (value) => {
          if (reviewing) return
          setBudgetIndex(value)
        },
        format: (value) => `$${RANGE_BUDGETS[value]}`,
      },
      main: {
        label: howToOpen
          ? 'HELP OPEN'
          : reviewing
            ? 'BACK TO QUOTE'
            : rangeQuote.phase === 'ready'
              ? 'REVIEW RANGE'
              : pair
                ? 'QUOTING'
                : 'NO PAIR',
        color: !howToOpen && rangeQuote.phase === 'ready' ? 'amber' : 'neutral',
        loading:
          rangeQuote.phase === 'watching' || rangeQuote.phase === 'loading',
        onPress: () => {
          if (howToOpen) {
            haptic('warning')
            return
          }
          if (reviewing) {
            setReviewPair(null)
            haptic('selection')
            return
          }
          if (rangeQuote.phase === 'ready' && pair) {
            setReviewPair(pair)
            haptic('heavy')
          }
        },
      },
      lightShow: reviewing,
      status: {
        left: `RANGE · ${asset}`,
        right: pair
          ? `${pairs.length} PAIR${pairs.length === 1 ? '' : 'S'}`
          : 'WAITING',
      },
    }),
    [
      asset,
      budgetIndex,
      howToOpen,
      onAsset,
      pair,
      pairs.length,
      rangeQuote.phase,
      reviewing,
    ],
  )
  useConsoleControls(controls)

  const quoteMessage =
    rangeQuote.phase === 'error'
      ? rangeQuote.error
      : !pair
        ? `No matching ${asset} fixed strikes share a safe live expiry right now.`
        : !display
          ? 'DreamDEX did not expose enough oracle scale information to display this band safely.'
          : rangeQuote.phase !== 'ready'
            ? 'Watching both DreamDEX books and building an equal-share quote…'
            : null

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-black text-text">
      <div
        className={cnm(
          'flex shrink-0 items-start justify-between gap-3 pb-2.5',
          RIM,
          RIM_TOP,
        )}
      >
        <div>
          <div className="font-mono text-[9px] font-black uppercase tracking-[0.16em] text-text-3">
            Range · {asset} / USD
          </div>
          <div className="mt-0.5 overflow-hidden text-[34px] font-black leading-none text-text tabular-nums">
            <LivePrice price={livePrice.price} />
          </div>
        </div>
        <div className="text-right">
          <div className="font-mono text-[9px] font-black uppercase tracking-[0.14em] text-text-3">
            Market lock
          </div>
          <div className="mt-0.5 font-mono text-[22px] font-black leading-none text-brand-500 tabular-nums">
            {secondsLeft == null
              ? '—'
              : `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')}`}
          </div>
          <div className="mt-1 font-mono text-[8px] font-bold uppercase tracking-[0.1em] text-text-3">
            {rangeQuote.live ? '2 books live' : 'syncing books'}
          </div>
        </div>
      </div>

      <div className="grid h-[54px] shrink-0 grid-cols-[1fr_auto_1fr] border-y border-line-strong bg-black px-[var(--screen-rim,24px)]">
        <RangeStrike label="Lower · buy yes" value={display?.lower ?? null} />
        <div className="flex items-center px-3 font-mono text-[9px] font-black uppercase tracking-[0.12em] text-brand-500">
          Inside pays 2×
        </div>
        <RangeStrike
          label="Upper · buy no"
          value={display?.upper ?? null}
          align="right"
        />
      </div>

      <div className="relative min-h-0 flex-1">
        <LivePriceChart
          state={livePrice}
          className="absolute inset-0"
          eventCountdown={secondsLeft == null ? null : String(secondsLeft)}
          rangeBands={
            display
              ? [
                  {
                    lower: display.lower,
                    upper: display.upper,
                    status: 'active',
                    label: 'DREAMDEX RANGE',
                  },
                ]
              : []
          }
        />
        {quoteMessage && (
          <div className="absolute inset-x-[18%] top-1/2 z-10 -translate-y-1/2 border border-line-strong bg-black/90 px-4 py-3 text-center font-mono text-[9px] font-bold uppercase leading-[1.5] tracking-[0.08em] text-text-2">
            {quoteMessage}
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
        <div className="max-w-[62%]">
          <div className="flex items-end justify-between gap-3">
            <div>
              <div className="font-mono text-[8px] font-black uppercase tracking-[0.14em] text-text-3">
                Maximum cost
              </div>
              <div className="mt-0.5 text-[28px] font-black leading-none text-brand-500 tabular-nums">
                <MoneyFlow value={maximumCost ?? budget} />
              </div>
            </div>
            <div className="pb-0.5 text-right font-mono text-[8px] font-bold uppercase leading-[1.35] tracking-[0.08em] text-text-3">
              {walletStatus === 'connected'
                ? quote?.hasEnoughBalance === false
                  ? 'Balance too low'
                  : 'Wallet checked'
                : 'Connect to trade'}
            </div>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <RangeReadout label="Est. premium" value={estimatedCost} />
            <RangeReadout label="Outside pays" value={outsidePayout} />
            <RangeReadout label="Inside pays" value={insidePayout} />
          </div>
          <div className="mt-2 font-mono text-[8px] uppercase leading-[1.4] tracking-[0.06em] text-text-3">
            Max loss <MoneyFlow value={maximumLoss} />. Equal shares on two
            native Event Contracts; the band is lower-inclusive and
            upper-exclusive.
          </div>
        </div>
      </div>

      {reviewing && quote && display && (
        <ScreenOverlay title="Review Range" subtitle="Two native DreamDEX legs">
          <div className="space-y-3 font-mono text-[10px] font-semibold leading-[1.45] text-text-2">
            <ReviewLeg
              marker="01"
              title={`YES · ${asset} ≥ $${display.lower.toLocaleString()}`}
              detail="Lower fixed-strike Event Contract"
            />
            <ReviewLeg
              marker="02"
              title={`NO · ${asset} ≥ $${display.upper.toLocaleString()}`}
              detail="Upper fixed-strike Event Contract"
            />
            <div className="grid grid-cols-2 gap-3 border-t border-line-strong pt-3">
              <RangeReadout label="Maximum cost" value={maximumCost} />
              <RangeReadout label="Maximum loss" value={maximumLoss} />
              <RangeReadout label="Outside payout" value={outsidePayout} />
              <RangeReadout label="Inside payout" value={insidePayout} />
            </div>
            <p className="border-t border-line-strong pt-3 text-text-3">
              This screen is quote-only until Pumpy's binary EIP-7702 executor
              passes Shannon all-or-nothing tests. No wallet request is made
              yet.
            </p>
          </div>
        </ScreenOverlay>
      )}

      {howToOpen && (
        <ScreenOverlay
          title="How to play"
          subtitle="Range · two Event Contracts"
        >
          <div className="space-y-4 font-mono text-[11px] font-semibold leading-[1.5] text-text-2">
            <HowToRow
              step="01"
              title="Choose money"
              body="Turn AMOUNT. The rolling dollar display is your maximum collateral budget, not points."
            />
            <HowToRow
              step="02"
              title="Read the band"
              body="Pumpy pairs YES on the lower fixed strike with NO on the upper strike. Both contracts use the same asset, expiry, venue, and collateral."
            />
            <HowToRow
              step="03"
              title="Know the payout"
              body="Inside the band both legs win. Outside it one leg wins, creating the displayed floor payout. The exact upper boundary counts as outside."
            />
            <HowToRow
              step="04"
              title="Review both legs"
              body="Premium, maximum cost, maximum loss, both payouts, expiry, and book freshness appear before Pumpy enables an atomic wallet signature."
            />
          </div>
        </ScreenOverlay>
      )}
    </div>
  )
}

function RangeStrike({
  label,
  value,
  align = 'left',
}: {
  label: string
  value: number | null
  align?: 'left' | 'right'
}) {
  return (
    <div
      className={cnm(
        'flex flex-col justify-center',
        align === 'right' && 'text-right',
      )}
    >
      <span className="font-mono text-[7px] font-black uppercase tracking-[0.1em] text-text-3">
        {label}
      </span>
      <span className="mt-0.5 font-mono text-[12px] font-black text-text tabular-nums">
        {value == null ? '—' : `$${value.toLocaleString()}`}
      </span>
    </div>
  )
}

function RangeReadout({
  label,
  value,
}: {
  label: string
  value: number | null
}) {
  return (
    <div>
      <div className="font-mono text-[7px] font-black uppercase tracking-[0.1em] text-text-3">
        {label}
      </div>
      <div className="mt-1 font-mono text-[11px] font-black text-text tabular-nums">
        <MoneyFlow value={value} />
      </div>
    </div>
  )
}

function ReviewLeg({
  marker,
  title,
  detail,
}: {
  marker: string
  title: string
  detail: string
}) {
  return (
    <div className="grid grid-cols-[28px_1fr] gap-3 border-t border-line-strong pt-3 first:border-t-0 first:pt-0">
      <span className="text-brand-500">{marker}</span>
      <div>
        <div className="font-black uppercase tracking-[0.08em] text-text">
          {title}
        </div>
        <div className="mt-1 text-text-3">{detail}</div>
      </div>
    </div>
  )
}

function HowToRow({
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
