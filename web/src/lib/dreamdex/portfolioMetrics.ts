import { formatUnits } from 'viem'

import type { PortfolioTrade } from '@somnia-chain/markets-sdk'
import type { VerifiedPlayerMetrics } from '@/lib/pumpy/playerProfile'

/**
 * Derive player-card statistics from DreamDEX's indexed fills. `fillPrice` is
 * expressed on the YES-probability scale, so BUY_NO uses its complement when
 * calculating paid collateral. Sell fills are exits and do not add entry
 * volume or count as a new arcade play.
 */
export function deriveVerifiedPlayerMetrics(
  trades: ReadonlyArray<PortfolioTrade>,
): VerifiedPlayerMetrics {
  const playTransactions = new Set<string>()
  let hasUp = false
  let hasDown = false
  let volume = 0

  for (const trade of trades) {
    if (trade.side !== 'BUY_YES' && trade.side !== 'BUY_NO') continue

    const decimals = trade.market.quoteDecimals
    if (!Number.isInteger(decimals) || decimals < 0) continue

    try {
      const scale = 10n ** BigInt(decimals)
      const yesPriceRaw = BigInt(trade.fillPrice)
      const quantityRaw = BigInt(trade.quantity)
      if (yesPriceRaw < 0n || yesPriceRaw > scale || quantityRaw <= 0n) continue

      const outcomePriceRaw =
        trade.side === 'BUY_YES' ? yesPriceRaw : scale - yesPriceRaw
      const costRaw = (outcomePriceRaw * quantityRaw) / scale
      volume += Number(formatUnits(costRaw, decimals))
      playTransactions.add(trade.txHash.toLowerCase())
      hasUp ||= trade.side === 'BUY_YES'
      hasDown ||= trade.side === 'BUY_NO'
    } catch {
      // Ignore malformed indexer rows rather than corrupting every metric.
    }
  }

  return {
    plays: playTransactions.size,
    volume,
    hasUp,
    hasDown,
    hasChainProof: playTransactions.size > 0,
  }
}
