import NumberFlow from '@number-flow/react'

import { useThrottledValue } from '@/hooks/useThrottledValue'

const UPDATE_INTERVAL_MS = 1_000

/**
 * The large live-price instrument. NumberFlow rolls only the digits that
 * changed, while the throttle prevents a rapid oracle feed from juddering.
 */
export function LivePrice({ price }: { price: number | null }) {
  const displayedPrice = useThrottledValue(price, UPDATE_INTERVAL_MS)

  if (displayedPrice == null) return <span aria-label="Waiting for live price">—</span>

  return (
    <NumberFlow
      value={displayedPrice}
      prefix="$"
      format={{ minimumFractionDigits: 2, maximumFractionDigits: 2 }}
      transformTiming={{ duration: 520, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }}
      spinTiming={{ duration: 520, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }}
      opacityTiming={{ duration: 260, easing: 'ease-out' }}
      trend={0}
    />
  )
}
