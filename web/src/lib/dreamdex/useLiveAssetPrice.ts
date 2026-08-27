import { useEffect, useState } from 'react'

import { getDreamDexExchange } from './client'

export type PumpyPricePoint = {
  price: number
  timestamp: number
}

export type LiveAssetPriceState = {
  phase: 'loading' | 'live' | 'stale' | 'error'
  asset: string
  price: number | null
  ema: number | null
  observedAt: number | null
  points: Array<PumpyPricePoint>
  error: string | null
}

const STALE_AFTER_MS = 15_000
const MAX_POINTS = 72

const empty = (asset: string): LiveAssetPriceState => ({
  phase: 'loading',
  asset,
  price: null,
  ema: null,
  observedAt: null,
  points: [],
  error: null,
})

/**
 * The official Somnia/DreamDEX SDK price-feed tape.
 *
 * This is safe for display and live game orientation. Market resolution still
 * comes from the Event Contract oracle answer; the UI never turns a rendered
 * chart frame into a financial result.
 */
export function useLiveAssetPrice(asset: string): LiveAssetPriceState {
  const normalizedAsset = asset.toUpperCase()
  const [state, setState] = useState<LiveAssetPriceState>(() => empty(normalizedAsset))

  useEffect(() => {
    const client = getDreamDexExchange().client
    let stopped = false
    let stopWatch: (() => void) | undefined

    setState(empty(normalizedAsset))

    const sync = () => {
      if (stopped) return
      const latest = client.getLivePrice(normalizedAsset)
      const ticks = client
        .getLivePriceTicks(normalizedAsset, { limit: MAX_POINTS })
        .map((tick) => ({ price: tick.price, timestamp: tick.blockTimestamp * 1_000 }))
        .sort((a, b) => a.timestamp - b.timestamp)
      if (!latest) return
      const observedAt = latest.blockTimestamp * 1_000
      setState({
        phase: Date.now() - observedAt > STALE_AFTER_MS ? 'stale' : 'live',
        asset: normalizedAsset,
        price: latest.price,
        ema: latest.ema,
        observedAt,
        points: ticks,
        error: null,
      })
    }

    const unsubscribe = client.subscribePrices(sync)
    void client
      .watchPrice(normalizedAsset)
      .then((handle) => {
        if (stopped) handle.stop()
        else {
          stopWatch = () => handle.stop()
          sync()
        }
      })
      .catch((cause) => {
        if (stopped) return
        setState({
          ...empty(normalizedAsset),
          phase: 'error',
          error: cause instanceof Error ? cause.message : 'Live oracle price unavailable',
        })
      })

    const freshnessTimer = window.setInterval(sync, 1_000)
    return () => {
      stopped = true
      window.clearInterval(freshnessTimer)
      unsubscribe()
      stopWatch?.()
    }
  }, [normalizedAsset])

  return state
}
