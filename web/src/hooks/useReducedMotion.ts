import { useEffect, useState } from 'react'

// Pumpy follows the operating-system accessibility preference.
export function useReducedMotion(): boolean {
  const [osReduced, setOsReduced] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setOsReduced(mq.matches)
    const onChange = (e: MediaQueryListEvent) => setOsReduced(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return osReduced
}
