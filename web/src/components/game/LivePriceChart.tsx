import { useEffect, useRef } from 'react'

import type {
  LiveAssetPriceState,
  PumpyPricePoint,
} from '@/lib/dreamdex/useLiveAssetPrice'
import { cnm } from '@/utils/style'

const WINDOW_MS = 30_000
const LEFT_PAD = 0
const RIGHT_PAD = 24
const TOP_PAD = 11
const BOTTOM_PAD = 9
const PRICE_EASE_MS = 180
const RANGE_EASE_MS = 260

type ChartRange = { min: number; max: number }
type PlotPoint = { x: number; y: number }

export function LivePriceChart({
  state,
  className,
  eventCountdown,
}: {
  state: LiveAssetPriceState
  className?: string
  eventCountdown?: string | null
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const pointsRef = useRef(state.points)
  const targetPriceRef = useRef(state.price)
  pointsRef.current = state.points
  targetPriceRef.current = state.price

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const context = canvas.getContext('2d')
    if (!context) return

    let width = 0
    let height = 0
    let frame = 0
    let lastFrame = performance.now()
    let displayedPrice = targetPriceRef.current ?? 0
    let range: ChartRange = {
      min: displayedPrice * 0.999,
      max: displayedPrice * 1.001,
    }
    let tone = 0

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      const ratio = Math.min(window.devicePixelRatio || 1, 2)
      width = Math.max(1, rect.width)
      height = Math.max(1, rect.height)
      canvas.width = Math.round(width * ratio)
      canvas.height = Math.round(height * ratio)
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
    }

    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    resize()

    const draw = (now: number) => {
      const delta = Math.min(64, now - lastFrame)
      lastFrame = now
      const targetPrice = targetPriceRef.current
      const points = pointsRef.current
      const reducedMotion = window.matchMedia(
        '(prefers-reduced-motion: reduce)',
      ).matches

      if (targetPrice != null) {
        if (displayedPrice === 0 || reducedMotion) displayedPrice = targetPrice
        else
          displayedPrice +=
            (targetPrice - displayedPrice) * ease(delta, PRICE_EASE_MS)
      }

      const nowEpoch = Date.now()
      const visible = points.filter(
        (point) => point.timestamp >= nowEpoch - WINDOW_MS,
      )
      const plotted = visible.length ? visible : points.slice(-30)
      const prices = plotted.map((point) => point.price)
      if (displayedPrice > 0) prices.push(displayedPrice)

      if (prices.length) {
        const low = Math.min(...prices)
        const high = Math.max(...prices)
        const spread = Math.max(
          high - low,
          Math.abs(displayedPrice || high) * 0.00035,
          0.01,
        )
        const targetRange = {
          min: low - spread * 0.38,
          max: high + spread * 0.38,
        }
        if (reducedMotion || range.max <= range.min || range.min === 0)
          range = targetRange
        else {
          const amount = ease(delta, RANGE_EASE_MS)
          range.min += (targetRange.min - range.min) * amount
          range.max += (targetRange.max - range.max) * amount
        }
      }

      const trend = trendDirection(plotted, displayedPrice)
      const targetTone = trend >= 0 ? 0 : 1
      tone = reducedMotion
        ? targetTone
        : tone + (targetTone - tone) * ease(delta, 240)
      const lineColor = mixColor([52, 211, 153], [255, 90, 77], tone)

      context.clearRect(0, 0, width, height)
      drawGrid(context, width, height)

      if (prices.length && range.max > range.min) {
        const plotWidth = Math.max(1, width - LEFT_PAD - RIGHT_PAD)
        const plotHeight = Math.max(1, height - TOP_PAD - BOTTOM_PAD)
        const firstTimestamp = plotted[0]?.timestamp ?? nowEpoch - WINDOW_MS
        const useTimeAxis = nowEpoch - firstTimestamp <= WINDOW_MS * 1.35
        const chartPoints: Array<PlotPoint> = plotted.map((point, index) => ({
          x: useTimeAxis
            ? LEFT_PAD +
              clamp(
                (point.timestamp - (nowEpoch - WINDOW_MS)) / WINDOW_MS,
                0,
                1,
              ) *
                plotWidth
            : LEFT_PAD + (index / Math.max(1, plotted.length - 1)) * plotWidth,
          y:
            TOP_PAD +
            ((range.max - point.price) / (range.max - range.min)) * plotHeight,
        }))
        const tip = {
          x: width - RIGHT_PAD,
          y:
            TOP_PAD +
            ((range.max - displayedPrice) / (range.max - range.min)) *
              plotHeight,
        }

        if (!chartPoints.length || chartPoints.at(-1)?.x !== tip.x)
          chartPoints.push(tip)
        else chartPoints[chartPoints.length - 1] = tip

        drawGuide(context, tip, width, lineColor)
        drawArea(context, chartPoints, height, lineColor)
        drawLine(context, chartPoints, lineColor)
        drawLivePoint(context, tip, lineColor)
        drawPriceTag(context, tip, displayedPrice, lineColor)
      }

      frame = requestAnimationFrame(draw)
    }

    frame = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [])

  return (
    <div
      className={cnm(
        'relative min-h-0 overflow-hidden border-b border-line-strong bg-black',
        className ?? 'h-[82px] shrink-0',
      )}
    >
      {eventCountdown && (
        <div
          className="pointer-events-none absolute inset-0 flex select-none items-center justify-center overflow-hidden"
          aria-hidden="true"
        >
          <span className="font-mono text-[clamp(64px,18vh,128px)] font-black leading-none text-text opacity-15 tabular-nums">
            {eventCountdown}
          </span>
        </div>
      )}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 z-[1] h-full w-full"
        aria-label={
          state.price == null
            ? 'Waiting for live oracle price'
            : `${state.asset} live oracle chart at ${state.price.toFixed(2)} dollars`
        }
      />
      <div className="pointer-events-none absolute inset-x-[var(--screen-rim,24px)] top-2 z-10 flex items-center">
        <div className="flex items-center gap-2 font-mono text-[8px] font-black uppercase tracking-[0.14em] text-text-3">
          30s oracle tape
          <span
            className={cnm(
              'inline-flex items-center gap-1.5',
              state.phase === 'live'
                ? 'text-up'
                : state.phase === 'stale'
                  ? 'text-pumpy-caution'
                  : 'text-text-3',
            )}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-current shadow-[0_0_8px_currentColor]" />
            {state.phase}
          </span>
        </div>
      </div>
    </div>
  )
}

function trendDirection(
  points: Array<PumpyPricePoint>,
  current: number,
): number {
  const cutoff = Date.now() - 4_000
  let reference = points[0]?.price ?? current
  for (let index = points.length - 1; index >= 0; index -= 1) {
    if (points[index].timestamp <= cutoff) {
      reference = points[index].price
      break
    }
  }
  return current - reference
}

function drawGrid(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
) {
  context.save()
  context.strokeStyle = 'rgba(255, 255, 255, 0.055)'
  context.lineWidth = 1
  for (const ratio of [0.33, 0.66]) {
    const y = Math.round(height * ratio) + 0.5
    context.beginPath()
    context.moveTo(0, y)
    context.lineTo(width, y)
    context.stroke()
  }
  context.restore()
}

function drawGuide(
  context: CanvasRenderingContext2D,
  tip: PlotPoint,
  width: number,
  color: string,
) {
  context.save()
  context.setLineDash([2, 4])
  context.strokeStyle = color.replace('rgb(', 'rgba(').replace(')', ', 0.24)')
  context.lineWidth = 1
  context.beginPath()
  context.moveTo(tip.x, tip.y)
  context.lineTo(width, tip.y)
  context.stroke()
  context.restore()
}

function drawArea(
  context: CanvasRenderingContext2D,
  points: Array<PlotPoint>,
  height: number,
  color: string,
) {
  if (points.length < 2) return
  context.save()
  traceSmoothPath(context, points)
  context.lineTo(points.at(-1)!.x, height)
  context.lineTo(points[0].x, height)
  context.closePath()
  const gradient = context.createLinearGradient(0, 0, 0, height)
  gradient.addColorStop(
    0,
    color.replace('rgb(', 'rgba(').replace(')', ', 0.18)'),
  )
  gradient.addColorStop(1, color.replace('rgb(', 'rgba(').replace(')', ', 0)'))
  context.fillStyle = gradient
  context.fill()
  context.restore()
}

function drawLine(
  context: CanvasRenderingContext2D,
  points: Array<PlotPoint>,
  color: string,
) {
  if (points.length < 2) return
  context.save()
  context.strokeStyle = color
  context.lineWidth = 2
  context.lineCap = 'round'
  context.lineJoin = 'round'
  context.shadowColor = color
  context.shadowBlur = 5
  traceSmoothPath(context, points)
  context.stroke()
  context.restore()
}

function drawLivePoint(
  context: CanvasRenderingContext2D,
  tip: PlotPoint,
  color: string,
) {
  context.save()
  context.fillStyle = 'rgb(184, 255, 74)'
  context.shadowColor = color
  context.shadowBlur = 14
  context.beginPath()
  context.arc(tip.x, tip.y, 4.5, 0, Math.PI * 2)
  context.fill()
  context.restore()
}

function drawPriceTag(
  context: CanvasRenderingContext2D,
  tip: PlotPoint,
  price: number,
  color: string,
) {
  if (!Number.isFinite(price) || price <= 0) return
  const label = `$${price.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
  context.save()
  context.font = '800 10px ui-monospace, SFMono-Regular, Menlo, monospace'
  context.textBaseline = 'middle'
  const width = context.measureText(label).width + 12
  const height = 19
  const x = tip.x - width - 11
  const y = clamp(
    tip.y - height / 2,
    TOP_PAD + 12,
    context.canvas.clientHeight - BOTTOM_PAD - height,
  )
  context.fillStyle = 'rgba(0, 0, 0, 0.82)'
  context.strokeStyle = color.replace('rgb(', 'rgba(').replace(')', ', 0.48)')
  context.lineWidth = 1
  context.beginPath()
  context.roundRect(x, y, width, height, 5)
  context.fill()
  context.stroke()
  context.fillStyle = 'rgba(245, 247, 251, 0.92)'
  context.fillText(label, x + 6, y + height / 2 + 0.5)
  context.restore()
}

function traceSmoothPath(
  context: CanvasRenderingContext2D,
  points: Array<PlotPoint>,
) {
  context.beginPath()
  context.moveTo(points[0].x, points[0].y)
  for (let index = 1; index < points.length - 1; index += 1) {
    const current = points[index]
    const next = points[index + 1]
    context.quadraticCurveTo(
      current.x,
      current.y,
      (current.x + next.x) / 2,
      (current.y + next.y) / 2,
    )
  }
  const last = points.at(-1)
  if (last) context.lineTo(last.x, last.y)
}

function ease(deltaMs: number, durationMs: number): number {
  return 1 - Math.exp(-deltaMs / durationMs)
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function mixColor(
  from: [number, number, number],
  to: [number, number, number],
  amount: number,
): string {
  const channel = (index: number) =>
    Math.round(from[index] + (to[index] - from[index]) * amount)
  return `rgb(${channel(0)}, ${channel(1)}, ${channel(2)})`
}
