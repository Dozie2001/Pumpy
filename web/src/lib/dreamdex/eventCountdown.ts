export function eventSecondsRemaining(
  expiresAtSeconds: number,
  nowMilliseconds = Date.now(),
): number {
  if (!Number.isFinite(expiresAtSeconds)) return 0
  return Math.max(0, Math.ceil(expiresAtSeconds - nowMilliseconds / 1_000))
}

export function formatEventCountdown(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(safeSeconds / 3_600)
  const minutes = Math.floor((safeSeconds % 3_600) / 60)
  const remainder = safeSeconds % 60

  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
}
