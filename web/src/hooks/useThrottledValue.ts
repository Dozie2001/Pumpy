import { useEffect, useRef, useState } from 'react'

/**
 * A trailing-edge throttle for fast live feeds. The first useful value lands
 * immediately; later updates are grouped so large numeric readouts stay calm.
 */
export function useThrottledValue<T>(value: T, intervalMs: number): T {
  const [throttled, setThrottled] = useState(value)
  const lastUpdate = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latest = useRef(value)
  latest.current = value

  useEffect(() => {
    const elapsed = Date.now() - lastUpdate.current
    if (elapsed >= intervalMs) {
      if (value != null) lastUpdate.current = Date.now()
      setThrottled(value)
      return
    }

    if (timer.current) return
    timer.current = setTimeout(() => {
      timer.current = null
      lastUpdate.current = Date.now()
      setThrottled(latest.current)
    }, intervalMs - elapsed)
  }, [intervalMs, value])

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  return throttled
}
