export function parseWalletChainId(value: string): number {
  const parsed = Number.parseInt(value, 16)
  if (!Number.isSafeInteger(parsed))
    throw new Error('Wallet returned an invalid chain ID')
  return parsed
}
