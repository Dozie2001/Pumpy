import { describe, expect, it } from 'vitest'

import {
  isDreamDexTestCollateral,
  testCollateralGrantRaw,
} from './testCollateral'

describe('DreamDEX test collateral safety', () => {
  it('recognizes only the configured Event Contracts faucet token', () => {
    expect(
      isDreamDexTestCollateral('0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E'),
    ).toBe(true)
    expect(
      isDreamDexTestCollateral('0x0000000000000000000000000000000000000001'),
    ).toBe(false)
  })

  it('derives 20 tokens from runtime ERC-20 decimals', () => {
    expect(testCollateralGrantRaw(6)).toBe(20_000_000n)
    expect(testCollateralGrantRaw(18)).toBe(20_000_000_000_000_000_000n)
  })
})
