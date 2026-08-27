import { useEffect, useMemo, useRef, useState } from 'react'

import type { PlayerSide } from '@/lib/dreamdex/types'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { haptic } from '@/lib/haptics'
import { slotLock } from '@/lib/sound'

type Hue = 'up' | 'down' | 'brand'
type Segment = { text?: string; hue: Hue }

const HUE: Record<Hue, string> = {
  up: 'var(--color-up)',
  down: 'var(--color-down)',
  brand: 'var(--color-brand-500)',
}

const CX = 50
const CY = 50
const RADIUS = 46
const RIM = 47
const FREE_SPEED = 0.72
const IDLE_SPEED = 0.026
const LAND_TURNS = 3

function polar(radius: number, degrees: number): [number, number] {
  const angle = ((degrees - 90) * Math.PI) / 180
  return [CX + radius * Math.cos(angle), CY + radius * Math.sin(angle)]
}

function alignAngle(index: number, count: number): number {
  const center = (index + 0.5) * (360 / count)
  return (360 - (center % 360)) % 360
}

function normalizeAngle(degrees: number): number {
  return ((degrees % 360) + 360) % 360
}

function triangle(x: number, y: number, size: number, down: boolean): string {
  return down
    ? `M${x} ${y + size} L${x - size * 0.86} ${y - size * 0.62} L${x + size * 0.86} ${y - size * 0.62} Z`
    : `M${x} ${y - size} L${x - size * 0.86} ${y + size * 0.62} L${x + size * 0.86} ${y + size * 0.62} Z`
}

function PrizeWheel({
  label,
  segments,
  target,
  size = 146,
  spinning,
  landing,
  duration,
  index,
  last = false,
}: {
  label: string
  segments: Array<Segment>
  target: number | null
  size?: number
  spinning: boolean
  landing: boolean
  duration: number
  index: number
  last?: boolean
}) {
  const groupRef = useRef<SVGGElement | null>(null)
  const rotationRef = useRef(0)
  const rafRef = useRef(0)
  const lastTargetRef = useRef<number | null>(target)
  const [landed, setLanded] = useState<number | null>(null)
  const reducedMotion = useReducedMotion()
  const count = segments.length
  const segmentAngle = 360 / count
  const centers = useMemo(
    () => segments.map((_, segmentIndex) => (segmentIndex + 0.5) * segmentAngle),
    [segmentAngle, segments],
  )

  useEffect(() => {
    const write = (degrees: number) => {
      rotationRef.current = degrees
      groupRef.current?.setAttribute(
        'transform',
        `rotate(${degrees.toFixed(2)} ${CX} ${CY})`,
      )
    }
    const cancel = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
    }
    cancel()

    if (spinning) {
      setLanded(null)
      if (landing && target != null) {
        lastTargetRef.current = target
        if (reducedMotion) {
          write(alignAngle(target, count))
          setLanded(target)
          return cancel
        }
        const start = rotationRef.current
        let end = start + LAND_TURNS * 360
        end += (((alignAngle(target, count) - end) % 360) + 360) % 360
        const startedAt = performance.now()
        const frame = (now: number) => {
          const progress = Math.min(1, (now - startedAt) / duration)
          const eased = 1 - Math.pow(1 - progress, 3)
          write(start + (end - start) * eased)
          if (progress < 1) rafRef.current = requestAnimationFrame(frame)
          else {
            rafRef.current = 0
            setLanded(target)
            haptic(last ? 'high' : 'mid')
            slotLock(index, last)
          }
        }
        rafRef.current = requestAnimationFrame(frame)
      } else if (!reducedMotion) {
        let previous = performance.now()
        const frame = (now: number) => {
          write(rotationRef.current + (now - previous) * FREE_SPEED)
          previous = now
          rafRef.current = requestAnimationFrame(frame)
        }
        rafRef.current = requestAnimationFrame(frame)
      }
    } else if (target != null) {
      const angle = alignAngle(target, count)
      if (Math.abs(normalizeAngle(rotationRef.current) - angle) > 0.5) write(angle)
      lastTargetRef.current = target
      setLanded(target)
    } else if (!reducedMotion) {
      lastTargetRef.current = null
      setLanded(null)
      const direction = index % 2 === 0 ? 1 : -1
      let previous = performance.now()
      const frame = (now: number) => {
        write(rotationRef.current + (now - previous) * IDLE_SPEED * direction)
        previous = now
        rafRef.current = requestAnimationFrame(frame)
      }
      rafRef.current = requestAnimationFrame(frame)
    }

    return cancel
  }, [count, duration, index, landing, last, reducedMotion, spinning, target])

  const lit = landed != null && !spinning

  return (
    <div className="relative flex flex-1 flex-col items-center justify-center gap-2 border-l border-white/20 bg-black px-2 py-3 first:border-l-0">
      <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-text-3">
        {label}
      </span>
      <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true">
        <g ref={groupRef}>
          {segments.map((segment, segmentIndex) => {
            const [x0, y0] = polar(RADIUS, segmentIndex * segmentAngle)
            const [x1, y1] = polar(RADIUS, (segmentIndex + 1) * segmentAngle)
            const color = HUE[segment.hue]
            const selected = landed === segmentIndex
            const [labelX, labelY] = polar(segment.text ? 27 : 25, centers[segmentIndex])
            return (
              <g key={`${segment.hue}-${segmentIndex}`}>
                <path
                  d={`M${CX} ${CY} L${x0.toFixed(2)} ${y0.toFixed(2)} A${RADIUS} ${RADIUS} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)} Z`}
                  style={{
                    fill: color,
                    fillOpacity: selected ? (lit ? 0.38 : 0.25) : spinning ? 0.2 : 0.11,
                    stroke: color,
                    strokeOpacity: selected ? 1 : 0.65,
                    strokeWidth: 1,
                  }}
                />
                {segment.text ? (
                  <text
                    x={labelX.toFixed(2)}
                    y={labelY.toFixed(2)}
                    textAnchor="middle"
                    dominantBaseline="central"
                    transform={`rotate(${centers[segmentIndex].toFixed(2)} ${labelX.toFixed(2)} ${labelY.toFixed(2)})`}
                    fontSize={selected ? 16 : 13}
                    style={{ fill: color, fontWeight: 900, opacity: selected ? 1 : 0.78 }}
                  >
                    {segment.text}
                  </text>
                ) : (
                  <path
                    d={triangle(labelX, labelY, selected ? 9 : 7, segment.hue === 'down')}
                    transform={`rotate(${centers[segmentIndex].toFixed(2)} ${labelX.toFixed(2)} ${labelY.toFixed(2)})`}
                    style={{ fill: color, opacity: selected ? 1 : 0.8 }}
                  />
                )}
              </g>
            )
          })}
        </g>
        <circle
          cx={CX}
          cy={CY}
          r={RIM}
          fill="none"
          stroke={spinning ? 'var(--color-brand-500)' : 'var(--color-line-strong)'}
          strokeWidth="1.25"
        />
        <path
          d="M50 12 L44 2 L56 2 Z"
          fill="var(--color-brand-500)"
          style={{ filter: 'drop-shadow(0 0 4px var(--color-brand-500))' }}
        />
      </svg>
    </div>
  )
}

const DIRECTION_SEGMENTS: Array<Segment> = [
  { hue: 'up' },
  { hue: 'down' },
  { hue: 'up' },
  { hue: 'down' },
]

const ODDS_TIERS = [1.25, 1.5, 2, 3, 5]
const ODDS_SEGMENTS: Array<Segment> = ODDS_TIERS.map((tier) => ({
  text: `${tier}×`,
  hue: 'brand',
}))

function directionTarget(side?: PlayerSide): number | null {
  if (!side) return null
  return side === 'UP' ? 0 : 1
}

function oddsTarget(multiplier?: number): number | null {
  if (!multiplier || multiplier <= 0) return null
  const nearest = ODDS_TIERS.reduce((best, tier, index) =>
    Math.abs(tier - multiplier) < Math.abs(ODDS_TIERS[best] - multiplier)
      ? index
      : best,
  0)
  return nearest
}

export function LuckyWheels({
  side,
  multiplier,
  spinning,
  landing,
}: {
  side?: PlayerSide
  multiplier?: number
  spinning: boolean
  landing: boolean
}) {
  return (
    <div className="flex h-full w-full">
      <PrizeWheel
        label="Direction"
        segments={DIRECTION_SEGMENTS}
        target={directionTarget(side)}
        spinning={spinning}
        landing={landing}
        duration={760}
        index={0}
      />
      <PrizeWheel
        label="Live odds"
        segments={ODDS_SEGMENTS}
        target={oddsTarget(multiplier)}
        spinning={spinning}
        landing={landing}
        duration={980}
        index={1}
        last
      />
    </div>
  )
}
