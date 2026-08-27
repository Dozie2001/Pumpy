export type OracleTargetPrice = {
  price: number
  decimals: number
}

/**
 * DreamDEX currently exposes oracle answers as raw integers but does not attach
 * their display scale. Match that raw value to the official live oracle feed
 * using a power-of-ten scale. If no unambiguous nearby scale exists, return
 * null instead of showing a convincing but incorrect target.
 */
export function resolveOracleTargetPrice(
  raw: string | null | undefined,
  nearbyLivePrice: number | null | undefined,
): OracleTargetPrice | null {
  if (!raw || !/^\d+$/.test(raw) || !nearbyLivePrice || nearbyLivePrice <= 0)
    return null

  const rawNumber = Number(raw)
  if (!Number.isFinite(rawNumber) || rawNumber <= 0) return null

  let best: OracleTargetPrice | null = null
  let bestScore = Number.POSITIVE_INFINITY
  for (let decimals = 0; decimals <= 18; decimals += 1) {
    const price = rawNumber / 10 ** decimals
    const score = Math.abs(Math.log10(price / nearbyLivePrice))
    if (score < bestScore) {
      best = { price, decimals }
      bestScore = score
    }
  }

  // An opening/strike more than 4x from the current underlying is not a safe
  // basis for inferring precision. Keep the UI honest and omit the line.
  return bestScore <= Math.log10(4) ? best : null
}

export function isCallCurrentlyWinning(params: {
  side: 'UP' | 'DOWN'
  livePrice: number
  targetPrice: number
}): boolean {
  return params.side === 'UP'
    ? params.livePrice >= params.targetPrice
    : params.livePrice < params.targetPrice
}
