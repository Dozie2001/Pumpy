export type CandleHopCallbacks = {
  onScore: (score: number) => void
  onCrash: () => void
  onEnd: (score: number) => void
  reduced?: boolean
}

export type CandleHopOutcome = {
  score: number
  best: number
  isBest: boolean
  badge: 'Candle Spark' | 'Pump Pilot' | null
  pattern: 'achievement' | 'lose'
}

export function candleHopOutcome(score: number, previousBest: number): CandleHopOutcome {
  const isBest = score > previousBest
  const badge = previousBest < 5 && score >= 5
    ? 'Candle Spark'
    : previousBest < 20 && score >= 20
      ? 'Pump Pilot'
      : null
  return {
    score,
    best: Math.max(previousBest, score),
    isBest,
    badge,
    pattern: isBest ? 'achievement' : 'lose',
  }
}

const PLAYER_X = 0.28
const PLAYER_SIZE = 54
const HIT_X = 16
const HIT_Y = 20
const GRAVITY = 5.6
const HOP_VELOCITY = -1.42
const MAX_VELOCITY = 2.65
const SPEED_START = 138
const SPEED_END = 172
const RAMP_SECONDS = 48
const SPACING_START = 190
const SPACING_END = 165
const BODY_WIDTH = 30
const WICK = 15
const GAP_START = 0.205
const GAP_END = 0.145
const GAP_EDGE = 0.06
const GAP_STEP = 0.28
const DEATH_GRAVITY = 7.2
const DEATH_MAX_SECONDS = 0.9
const SHAKE_SECONDS = 0.34

type Candle = { x: number; center: number; half: number; scored: boolean }
type Trail = { x: number; y: number; life: number }

const RED = [255, 90, 77] as const
const GREEN = [52, 211, 153] as const

export class CandleHopEngine {
  private readonly canvas: HTMLCanvasElement
  private readonly context: CanvasRenderingContext2D
  private readonly callbacks: CandleHopCallbacks
  private readonly mark = new Image()
  private markReady = false
  private observer: ResizeObserver
  private frameId = 0
  private width = 0
  private height = 0
  private running = false
  private dying = false
  private lastFrame = 0
  private elapsed = 0
  private deathElapsed = 0
  private playerY = 0.42
  private playerOffsetX = 0
  private playerAngle = -0.35
  private velocity = 0
  private score = 0
  private spawnX = 0
  private lastCenter = 0.42
  private parallax = 0
  private impactX = 0
  private impactY = 0
  private impactStrength = 0
  private candles: Array<Candle> = []
  private trail: Array<Trail> = []

  constructor(canvas: HTMLCanvasElement, callbacks: CandleHopCallbacks) {
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Candle Hop canvas is unavailable')
    this.canvas = canvas
    this.context = context
    this.callbacks = callbacks
    this.mark.decoding = 'async'
    this.mark.onload = () => {
      this.markReady = true
      if (!this.running) this.draw()
    }
    this.mark.src = '/pumpy-mark.svg'
    this.observer = new ResizeObserver(() => this.measure())
    this.observer.observe(canvas)
    this.measure()
    this.draw()
  }

  start() {
    this.playerY = 0.42
    this.playerOffsetX = 0
    this.playerAngle = -0.35
    this.velocity = HOP_VELOCITY
    this.score = 0
    this.elapsed = 0
    this.deathElapsed = 0
    this.impactStrength = 0
    this.lastCenter = 0.42
    this.parallax = 0
    this.candles = []
    this.trail = []
    this.spawnX = this.width * 1.12
    this.dying = false
    this.fillCandles()
    this.running = true
    this.lastFrame = performance.now()
    cancelAnimationFrame(this.frameId)
    this.frameId = requestAnimationFrame(this.frame)
  }

  hop() {
    if (!this.running || this.dying) return
    this.velocity = HOP_VELOCITY
    if (!this.callbacks.reduced) {
      this.trail.push({
        x: this.width * PLAYER_X,
        y: this.playerY * this.height,
        life: 1,
      })
    }
  }

  destroy() {
    this.running = false
    cancelAnimationFrame(this.frameId)
    this.observer.disconnect()
    this.mark.onload = null
  }

  private measure() {
    const rect = this.canvas.getBoundingClientRect()
    if (!rect.width || !rect.height) return
    const ratio = Math.min(2, window.devicePixelRatio || 1)
    this.width = rect.width
    this.height = rect.height
    this.canvas.width = Math.round(rect.width * ratio)
    this.canvas.height = Math.round(rect.height * ratio)
    this.context.setTransform(ratio, 0, 0, ratio, 0, 0)
    if (!this.running) this.draw()
  }

  private frame = (now: number) => {
    if (!this.running) return
    const delta = Math.min(0.05, (now - this.lastFrame) / 1_000)
    this.lastFrame = now
    const continueRun = this.dying ? this.stepDeath(delta) : this.step(delta)
    this.draw()
    if (continueRun) this.frameId = requestAnimationFrame(this.frame)
  }

  private step(delta: number): boolean {
    this.elapsed += delta
    const speed = lerp(SPEED_START, SPEED_END, this.difficulty())
    this.velocity = Math.min(MAX_VELOCITY, this.velocity + GRAVITY * delta)
    this.playerY += this.velocity * delta
    this.updateAngle(delta)
    this.parallax = (this.parallax + speed * 0.4 * delta) % 64
    this.spawnX -= speed * delta

    for (const candle of this.candles) candle.x -= speed * delta
    while (this.candles.length && this.candles[0].x < -BODY_WIDTH) this.candles.shift()
    this.fillCandles()

    let kept = 0
    for (const point of this.trail) {
      point.x -= speed * delta
      point.life -= delta * 1.6
      if (point.life > 0 && point.x > -20) this.trail[kept++] = point
    }
    this.trail.length = kept

    const playerX = this.width * PLAYER_X
    for (const candle of this.candles) {
      if (!candle.scored && candle.x + BODY_WIDTH / 2 < playerX) {
        candle.scored = true
        this.score += 1
        this.callbacks.onScore(this.score)
      }
    }

    const hitY = HIT_Y / this.height
    if (this.playerY < hitY) {
      this.playerY = hitY
      this.velocity = 0
    }
    if (this.playerY > 1 - hitY) {
      this.beginDeath(playerX, this.height - 1, 0.72)
      return true
    }
    const hitWidth = BODY_WIDTH / 2 + HIT_X
    for (const candle of this.candles) {
      if (Math.abs(candle.x - playerX) > hitWidth) continue
      const top = candle.center - candle.half
      const bottom = candle.center + candle.half
      const hitTop = this.playerY - hitY < top
      const hitBottom = this.playerY + hitY > bottom
      if (hitTop || hitBottom) {
        this.beginDeath(
          candle.x - BODY_WIDTH / 2,
          (hitTop ? top : bottom) * this.height,
          1,
        )
        return true
      }
    }
    return true
  }

  private stepDeath(delta: number): boolean {
    this.deathElapsed += delta
    this.velocity = Math.min(3.2, this.velocity + DEATH_GRAVITY * delta)
    this.playerY += this.velocity * delta
    this.playerOffsetX -= Math.max(0, 52 * (1 - this.deathElapsed / 0.48)) * delta
    this.updateAngle(delta, true)
    const fallenOut = this.playerY * this.height - PLAYER_SIZE / 2 > this.height
    if ((this.deathElapsed >= 0.5 && fallenOut) || this.deathElapsed >= DEATH_MAX_SECONDS) {
      this.running = false
      this.dying = false
      this.callbacks.onEnd(this.score)
      return false
    }
    return true
  }

  private beginDeath(x: number, y: number, strength: number) {
    if (this.dying) return
    this.dying = true
    this.deathElapsed = 0
    this.impactX = x
    this.impactY = y
    this.impactStrength = strength
    this.velocity = -0.18
    this.callbacks.onCrash()
  }

  private difficulty() {
    return clamp(this.elapsed / RAMP_SECONDS, 0, 1)
  }

  private spacing() {
    return lerp(SPACING_START, SPACING_END, this.difficulty())
  }

  private fillCandles() {
    const half = lerp(GAP_START, GAP_END, this.difficulty())
    while (this.spawnX < this.width + this.spacing()) {
      const lower = half + GAP_EDGE
      const upper = 1 - half - GAP_EDGE
      this.lastCenter = clamp(
        this.lastCenter + (Math.random() * 2 - 1) * GAP_STEP,
        lower,
        upper,
      )
      this.candles.push({ x: this.spawnX, center: this.lastCenter, half, scored: false })
      this.spawnX += this.spacing()
    }
  }

  private updateAngle(delta: number, dying = false) {
    const fall = clamp((this.velocity + 0.3) / 3.5, 0, 1)
    const target = dying
      ? lerp(-0.18, 1.42, fall)
      : clamp(this.velocity * 0.48, -0.45, 1.05)
    this.playerAngle += (target - this.playerAngle) * (1 - Math.exp(-9 * delta))
  }

  private draw() {
    const context = this.context
    context.clearRect(0, 0, this.width, this.height)
    context.fillStyle = '#000'
    context.fillRect(0, 0, this.width, this.height)
    context.save()

    if (this.dying && !this.callbacks.reduced && this.deathElapsed < SHAKE_SECONDS) {
      const life = 1 - this.deathElapsed / SHAKE_SECONDS
      const amount = 8 * this.impactStrength * life * life
      context.translate(
        (Math.random() * 2 - 1) * amount,
        (Math.random() * 2 - 1) * amount,
      )
    }

    if (!this.callbacks.reduced) {
      context.strokeStyle = 'rgba(255,255,255,.035)'
      context.lineWidth = 1
      context.beginPath()
      for (let x = -this.parallax; x <= this.width; x += 64) {
        context.moveTo(x, 0)
        context.lineTo(x, this.height)
      }
      context.stroke()
    }

    for (const candle of this.candles) {
      const top = (candle.center - candle.half) * this.height
      const bottom = (candle.center + candle.half) * this.height
      this.drawCandle(candle.x, 0, top, RED, 1)
      this.drawCandle(candle.x, bottom, this.height, GREEN, -1)
    }

    for (const point of this.trail) {
      context.fillStyle = rgba([184, 255, 74], 0.4 * point.life)
      context.beginPath()
      context.arc(point.x, point.y, 3 * point.life + 1, 0, Math.PI * 2)
      context.fill()
    }

    this.drawPlayer()
    if (this.dying) this.drawImpact()
    context.restore()
    if (this.dying) this.drawDeathVignette()
  }

  private drawPlayer() {
    const context = this.context
    context.save()
    context.translate(
      this.width * PLAYER_X + this.playerOffsetX,
      this.playerY * this.height,
    )
    context.rotate(this.playerAngle)
    context.shadowColor = '#b8ff4a'
    context.shadowBlur = 16
    if (this.markReady) {
      context.drawImage(
        this.mark,
        -PLAYER_SIZE / 2,
        -PLAYER_SIZE / 2,
        PLAYER_SIZE,
        PLAYER_SIZE,
      )
    } else {
      context.fillStyle = '#b8ff4a'
      context.beginPath()
      context.arc(0, 0, PLAYER_SIZE / 2, 0, Math.PI * 2)
      context.fill()
    }
    context.restore()
  }

  private drawCandle(
    centerX: number,
    top: number,
    bottom: number,
    color: ReadonlyArray<number>,
    direction: number,
  ) {
    const height = bottom - top
    if (height <= 0) return
    const x = centerX - BODY_WIDTH / 2
    this.context.fillStyle = rgba(color, 0.15)
    this.context.fillRect(x, top, BODY_WIDTH, height)
    this.context.strokeStyle = rgba(color, 0.95)
    this.context.lineWidth = 2
    this.context.strokeRect(x + 1, top, BODY_WIDTH - 2, height)
    const wickFrom = direction > 0 ? bottom : top
    this.context.beginPath()
    this.context.moveTo(centerX, wickFrom)
    this.context.lineTo(centerX, wickFrom + direction * WICK)
    this.context.lineWidth = 3
    this.context.stroke()
  }

  private drawImpact() {
    if (this.deathElapsed >= 0.3 || this.callbacks.reduced) return
    const progress = this.deathElapsed / 0.3
    const alpha = (1 - progress) * this.impactStrength
    this.context.save()
    this.context.translate(this.impactX, this.impactY)
    for (let index = 0; index < 8; index += 1) {
      const angle = index * Math.PI / 4
      const inner = 4 + progress * 7
      const outer = inner + 10 * (1 - progress)
      this.context.strokeStyle = index % 2 ? rgba(RED, alpha) : rgba([255, 255, 255], alpha)
      this.context.lineWidth = index % 2 ? 3 : 2
      this.context.beginPath()
      this.context.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner)
      this.context.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer)
      this.context.stroke()
    }
    this.context.restore()
  }

  private drawDeathVignette() {
    const impact = clamp(1 - this.deathElapsed / 0.5, 0, 1)
    const alpha = this.impactStrength * (0.18 + impact * 0.62)
    const radius = Math.hypot(this.width, this.height) * 0.62
    const gradient = this.context.createRadialGradient(
      this.width / 2,
      this.height * 0.46,
      Math.min(this.width, this.height) * 0.18,
      this.width / 2,
      this.height * 0.46,
      radius,
    )
    gradient.addColorStop(0, 'rgba(255,50,40,0)')
    gradient.addColorStop(0.7, rgba(RED, alpha * 0.24))
    gradient.addColorStop(1, rgba(RED, alpha))
    this.context.fillStyle = gradient
    this.context.fillRect(0, 0, this.width, this.height)
  }
}

function lerp(from: number, to: number, amount: number) {
  return from + (to - from) * amount
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function rgba(color: ReadonlyArray<number>, alpha: number) {
  return `rgba(${color[0]},${color[1]},${color[2]},${alpha})`
}
