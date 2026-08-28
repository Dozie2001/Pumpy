import { describe, expect, it } from 'vitest'

import { deriveVerifiedPlayerMetrics } from './portfolioMetrics'
import type { PortfolioTrade } from '@somnia-chain/markets-sdk'

function fill(
  side: PortfolioTrade['side'],
  fillPrice: string,
  quantity: string,
  txHash: string,
): PortfolioTrade {
  return {
    id: `${txHash}:0`,
    fillPrice,
    quantity,
    timestamp: '1',
    txHash,
    side,
    asMaker: false,
    counterparty: null,
    market: {
      marketAddress: '0x1111111111111111111111111111111111111111',
      asset: 'BTC',
      quoteDecimals: 6,
      intervalSec: '300',
      interval: '5m',
      tradingStart: '1',
      expiry: '2',
    },
  }
}

describe('DreamDEX portfolio metrics', () => {
  it('uses YES price for UP and the complemented YES price for DOWN', () => {
    const metrics = deriveVerifiedPlayerMetrics([
      fill('BUY_YES', '400000', '5000000', '0xaaa'),
      fill('BUY_NO', '700000', '10000000', '0xbbb'),
      fill('BUY_YES', '500000', '2000000', '0xbbb'),
      fill('SELL_YES', '600000', '5000000', '0xccc'),
    ])

    expect(metrics).toEqual({
      plays: 2,
      volume: 6,
      hasUp: true,
      hasDown: true,
      hasChainProof: true,
    })
  })

  it('ignores unattributed and malformed indexer rows', () => {
    const metrics = deriveVerifiedPlayerMetrics([
      fill(null, '400000', '5000000', '0xaaa'),
      fill('BUY_YES', 'not-a-price', '5000000', '0xbbb'),
    ])

    expect(metrics).toEqual({
      plays: 0,
      volume: 0,
      hasUp: false,
      hasDown: false,
      hasChainProof: false,
    })
  })
})
