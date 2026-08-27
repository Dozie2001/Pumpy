import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  RANGE_MAX_BANDS,
  RANGE_ROUND_MS,
  RANGE_TIERS,
  createRangeArcadeBand,
  settleRangeArcadeBand,
} from './rangeArcade'
import type { RangeArcadeBand } from './rangeArcade'
import type { ConsoleControls } from '@/components/console/controls'
import type { LiveAssetPriceState } from '@/lib/dreamdex/useLiveAssetPrice'
import { LivePrice } from '@/components/game/LivePrice'
import { LivePriceChart } from '@/components/game/LivePriceChart'
import { ScreenOverlay } from '@/components/game/screen'
import { useConsoleControls } from '@/components/console/controls'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { haptic, hapticPattern } from '@/lib/haptics'
import {
  rangeBuzzer,
  rangeCross,
  rangeLock,
  rangeLose,
  rangeWin,
  startRangeBgm,
  stopRangeBgm,
} from '@/lib/sound'
import { cnm } from '@/utils/style'

const RESULT_HOLD_MS = 2_600
const PRICE_FRESHNESS_MS = 15_000
const RIM = 'px-[var(--screen-rim,24px)]'
const RIM_TOP = 'pt-[calc(var(--screen-rim,24px)+6px)]'
const RIM_BOTTOM =
  'pb-[calc(var(--screen-rim,24px)+var(--screen-notch,0px))]'

type RangeWave = {
  id: string
  status: 'won' | 'lost' | 'void'
  points: number
}

export function RangeArcadeGame({
  asset,
  livePrice,
  onAsset,
}: {
  asset: string
  livePrice: LiveAssetPriceState
  onAsset: (asset: string) => void
}) {
  const reducedMotion = useReducedMotion()
  const [tierIndex, setTierIndex] = useState(1)
  const [bands, setBands] = useState<Array<RangeArcadeBand>>([])
  const [score, setScore] = useState(0)
  const [now, setNow] = useState(Date.now)
  const [wave, setWave] = useState<RangeWave | null>(null)
  const [howToOpen, setHowToOpen] = useState(false)
  const [best, setBest] = useState(() => {
    if (typeof window === 'undefined') return 0
    return Number(window.localStorage.getItem('pumpy:range:best') ?? 0)
  })
  const sequence = useRef(0)
  const resolved = useRef(new Set<string>())
  const buzzed = useRef(new Set<string>())
  const inside = useRef(new Map<string, boolean>())
  const activeBands = bands.filter((band) => band.status === 'active')
  const tier = RANGE_TIERS[tierIndex]

  useEffect(() => {
    const timer = window.setInterval(
      () => setNow(Date.now()),
      reducedMotion ? 250 : 100,
    )
    return () => window.clearInterval(timer)
  }, [reducedMotion])

  useEffect(() => {
    if (!activeBands.length) {
      stopRangeBgm()
      return
    }
    startRangeBgm()
    return () => stopRangeBgm()
  }, [activeBands.length])

  useEffect(() => {
    const price = livePrice.price
    for (const band of activeBands) {
      const remaining = band.expiresAt - now
      if (remaining <= 1_000 && remaining > 0 && !buzzed.current.has(band.id)) {
        buzzed.current.add(band.id)
        rangeBuzzer()
      }
      if (remaining > 0 || resolved.current.has(band.id)) continue
      resolved.current.add(band.id)
      const fresh =
        livePrice.phase === 'live' &&
        livePrice.observedAt != null &&
        Math.abs(now - livePrice.observedAt) <= PRICE_FRESHNESS_MS
      const settled = settleRangeArcadeBand({ band, price, fresh, now })
      if (settled.status === 'active') continue
      setBands((current) =>
        current.map((entry) => (entry.id === band.id ? settled : entry)),
      )
      setWave({ id: band.id, status: settled.status, points: settled.points })
      if (settled.status === 'won') {
        setScore((currentScore) => {
          const nextScore = currentScore + settled.points
          setBest((currentBest) => {
            const nextBest = Math.max(currentBest, nextScore)
            window.localStorage.setItem(
              'pumpy:range:best',
              String(nextBest),
            )
            window.dispatchEvent(new CustomEvent('pumpy:profile-updated'))
            return nextBest
          })
          return nextScore
        })
        hapticPattern('win')
        rangeWin()
      } else if (settled.status === 'lost') {
        hapticPattern('lose')
        rangeLose()
      } else {
        haptic('warning')
      }
    }
  }, [activeBands, livePrice, now])

  useEffect(() => {
    setBands((current) =>
      {
        const next = current.filter(
          (band) =>
          band.status === 'active' ||
          band.resolvedAt == null ||
          now - band.resolvedAt <= RESULT_HOLD_MS,
        )
        return next.length === current.length ? current : next
      },
    )
  }, [now])

  useEffect(() => {
    if (!wave) return
    const timer = window.setTimeout(() => setWave(null), RESULT_HOLD_MS)
    return () => window.clearTimeout(timer)
  }, [wave])

  useEffect(() => {
    if (livePrice.price == null) return
    for (const band of activeBands) {
      const next =
        livePrice.price > band.lower && livePrice.price <= band.upper
      const previous = inside.current.get(band.id)
      inside.current.set(band.id, next)
      if (previous !== undefined && previous !== next) {
        haptic('low')
        rangeCross(next)
      }
    }
  }, [activeBands, livePrice.price])

  const lockBand = useCallback(() => {
    if (
      livePrice.phase !== 'live' ||
      livePrice.price == null ||
      activeBands.length >= RANGE_MAX_BANDS
    ) {
      haptic('warning')
      return
    }
    const band = createRangeArcadeBand({
      id: `range-${Date.now()}-${sequence.current++}`,
      price: livePrice.price,
      tier,
      now: Date.now(),
    })
    setBands((current) => [...current, band])
    const nextStack = activeBands.length + 1
    const previousStack = Number(
      window.localStorage.getItem('pumpy:range:max-stack') ?? 0,
    )
    if (nextStack > previousStack) {
      window.localStorage.setItem('pumpy:range:max-stack', String(nextStack))
      window.dispatchEvent(new CustomEvent('pumpy:profile-updated'))
    }
    haptic('heavy')
    rangeLock()
  }, [activeBands.length, livePrice.phase, livePrice.price, tier])

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
          if (activeBands.length) {
            haptic('warning')
            return
          }
          onAsset(asset === 'BTC' ? 'ETH' : 'BTC')
        },
      },
      knob: {
        label: 'WIDTH',
        min: 0,
        max: RANGE_TIERS.length - 1,
        step: 1,
        value: RANGE_TIERS.length - 1 - tierIndex,
        onChange: (value) =>
          setTierIndex(RANGE_TIERS.length - 1 - value),
        format: (value) =>
          RANGE_TIERS[RANGE_TIERS.length - 1 - value].label.toUpperCase(),
      },
      main: {
        label:
          howToOpen
            ? 'HELP OPEN'
            : activeBands.length >= RANGE_MAX_BANDS
            ? 'MAX 4'
            : livePrice.phase === 'live'
              ? 'LOCK BAND'
              : 'WAIT',
        color:
          livePrice.phase === 'live' &&
          activeBands.length < RANGE_MAX_BANDS
            ? 'amber'
            : 'neutral',
        onPress: () => {
          if (howToOpen) {
            haptic('warning')
            return
          }
          lockBand()
        },
      },
      lightShow: activeBands.length > 0,
      status: { left: `RANGE · ${asset}`, right: `BEST ${best}` },
    }),
    [asset, activeBands.length, best, howToOpen, livePrice.phase, lockBand, onAsset, tierIndex],
  )
  useConsoleControls(controls)

  const visibleBands = bands.slice(-RANGE_MAX_BANDS)
  const chartBands = bands.map((band) => ({
    lower: band.lower,
    upper: band.upper,
    status: band.status,
    label: `+${band.points}`,
  }))
  const shortestRemaining = activeBands.length
    ? Math.max(
        0,
        Math.ceil(
          Math.min(...activeBands.map((band) => band.expiresAt - now)) / 1_000,
        ),
      )
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
            Score
          </div>
          <div className="mt-0.5 text-[25px] font-black leading-none text-brand-500 tabular-nums">
            {score}
          </div>
          <div className="mt-1 font-mono text-[8px] font-bold uppercase tracking-[0.1em] text-text-3">
            Best {best}
          </div>
        </div>
      </div>

      <div className="grid h-[46px] shrink-0 grid-cols-4 border-y border-line-strong bg-black">
        {Array.from({ length: RANGE_MAX_BANDS }).map((_, index) => {
          const band = visibleBands.at(index)
          const seconds = band
            ? Math.max(0, Math.ceil((band.expiresAt - now) / 1_000))
            : null
          return (
            <div
              key={band?.id ?? `empty-${index}`}
              className="flex flex-col items-center justify-center border-l border-line-strong first:border-l-0"
            >
              <span
                className={cnm(
                  'font-mono text-[8px] font-black uppercase tracking-[0.08em]',
                  band?.status === 'won'
                    ? 'text-up'
                    : band?.status === 'lost'
                      ? 'text-down'
                      : band?.status === 'void'
                        ? 'text-pumpy-caution'
                        : band
                          ? 'text-brand-500'
                          : 'text-text-3',
                )}
              >
                {band
                  ? band.status === 'active'
                    ? `${seconds}s`
                    : band.status
                  : `Slot ${index + 1}`}
              </span>
              <span className="mt-0.5 font-mono text-[9px] font-black text-text-2 tabular-nums">
                {band ? `+${band.points}` : '—'}
              </span>
            </div>
          )
        })}
      </div>

      <div className="relative min-h-0 flex-1">
        <LivePriceChart
          state={livePrice}
          className="absolute inset-0"
          eventCountdown={
            shortestRemaining == null ? null : String(shortestRemaining)
          }
          rangeBands={chartBands}
        />
        {wave && (
          <div
            className={cnm(
              'pointer-events-none absolute inset-x-0 top-1/2 z-20 -translate-y-1/2 text-center',
              reducedMotion ? '' : 'welcome-pop',
            )}
            role="status"
          >
            <div
              className={cnm(
                'font-mono text-[10px] font-black uppercase tracking-[0.2em]',
                wave.status === 'won'
                  ? 'text-up'
                  : wave.status === 'lost'
                    ? 'text-down'
                    : 'text-pumpy-caution',
              )}
            >
              {wave.status === 'won'
                ? 'In the zone'
                : wave.status === 'lost'
                  ? 'Out of range'
                  : 'Feed stale · void'}
            </div>
            <div className="mt-1 text-[42px] font-black leading-none text-text tabular-nums">
              {wave.status === 'won' ? `+${wave.points}` : '+0'}
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
        <div className="max-w-[62%]">
          <div className="font-mono text-[9px] font-black uppercase tracking-[0.14em] text-text-3">
            {activeBands.length ? 'Stacked bands' : 'No-funds arcade'}
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-[25px] font-black uppercase leading-none text-brand-500">
              {tier.label}
            </span>
            <span className="font-mono text-[9px] font-black uppercase tracking-[0.1em] text-text-2">
              ±{(tier.halfWidthBps / 100).toFixed(2)}%
            </span>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <RangeReadout label="Timer" value={`${RANGE_ROUND_MS / 1_000}s`} />
            <RangeReadout label="Win" value={`+${tier.points}`} />
            <RangeReadout
              label="Live"
              value={`${activeBands.length}/${RANGE_MAX_BANDS}`}
            />
          </div>
          <div className="mt-2 font-mono text-[8px] uppercase leading-[1.4] tracking-[0.06em] text-text-3">
            Stay inside at zero. Uses the live DreamDEX oracle tape for score;
            no wallet, wager, or onchain payout.
          </div>
        </div>
      </div>

      {howToOpen && (
        <ScreenOverlay title="How to play" subtitle="Range · no funds">
          <div className="space-y-4 font-mono text-[11px] font-semibold leading-[1.5] text-text-2">
            <HowToRow
              step="01"
              title="Set width"
              body="Turn the big wheel. A tighter band is harder and scores more points."
            />
            <HowToRow
              step="02"
              title="Lock a band"
              body="Press LOCK BAND. It centers a 12-second zone on the live oracle price. Stack up to four."
            />
            <HowToRow
              step="03"
              title="Stay inside"
              body="When a timer reaches zero, the fresh oracle price must remain inside that band."
            />
            <HowToRow
              step="04"
              title="Know the stakes"
              body="Range is score-only today. It never opens a wallet prompt, wager, or onchain payout. Timers keep running while this guide is open."
            />
          </div>
        </ScreenOverlay>
      )}
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

function RangeReadout({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="font-mono text-[8px] font-black uppercase tracking-[0.12em] text-text-3">
        {label}
      </div>
      <div className="mt-1 font-mono text-[12px] font-black text-text">
        {value}
      </div>
    </div>
  )
}
