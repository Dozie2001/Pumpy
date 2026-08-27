# Pumpy

Pumpy is a mobile-first prediction arcade built on Somnia and DreamDEX Event Contracts.

I Feel Lucky deals a direction over a live Event Contract. Long Shot turns
listed fixed strikes into a target game. Range composes compatible lower and
upper fixed strikes into one disclosed two-leg payoff. Candle Hop adds a
no-funds warm-up inside the same handheld. Funded trades remain wallet-signed.

## MVP

- Live DreamDEX Event Contract discovery on Shannon testnet
- Quick Call with executable quotes, wallet-signed IOC orders, persistent position state, resolution, and claims
- Long Shot over real fixed-strike Event Contracts using the same full lifecycle
- Range discovery and quote review over equal-share YES(lower) plus NO(upper) Event Contract legs
- Wallet-owned player orders
- Receipt, fill, resolution, claim, and score tracking
- Mobile 3D handheld experience with an accessible DOM fallback

The canonical product and interface specifications are in [`docs/`](docs/).

## Why this product

Most prediction-market apps lead with a dense trading terminal, while many
gamified versions hide the financial mechanics. Pumpy takes a more defensible
middle path: a memorable one-thumb arcade device wrapped around real,
wallet-owned DreamDEX positions.

This direction combines a distinctive mobile 3D handheld, native protocol
positions, visible market lifecycle states, and pre-signing disclosure of
price, payout, maximum loss, quote freshness, expiry, and settlement rules.

That makes Pumpy more original than another market dashboard and more
technically meaningful than a cosmetic game skin. The game changes the
interface, while DreamDEX remains the financial source of truth.

## Somnia testnet

Shannon is Somnia's testnet. Pumpy currently targets chain ID `50312` using the
DreamDEX testnet RPC and GraphQL Event Contract indexer. The
workspace defaults are documented in [`.env.example`](.env.example); no
private key is required for the read-only market integration.

## Workspace

```text
web/             React, TanStack, Vite, Three.js frontend
contracts-evm/   Hardhat 3 decision-registry workspace
docs/            Pumpy product, screen, flow, and design specifications
```

Player signing uses an injected EVM wallet in the browser. Deployer keys remain
server-side and are never exposed through `VITE_` variables.

All workspaces load the single ignored `.env` at the repository root. Copy
`.env.example` once, then run frontend or contract commands from their normal
workspace directories.

## Decision-registry development

```bash
cd contracts-evm
npm install
npm run compile
npm run typecheck
npm test
```

Shannon deployment instructions are in [`contracts-evm/README.md`](contracts-evm/README.md).

## Status

Pumpy is under active development for the Somnia x DreamDEX Event Contracts
Hackathon. The optional EVM decision registry is implemented, tested, and
deployed on Shannon, but no bot is exposed in the current MVP. The frontend
discovers and follows live Shannon Event Contracts through the
official DreamDEX SDK. The frontend now connects an injected wallet, enforces
Shannon, reads the active market's ERC-20 metadata, offers a verified
wallet-signed 20 tUSDC faucet action when eligible, prepares tick/lot-aligned
executable quotes from the live book, checks onchain market state and collateral
balance, and has a receipt-aware IOC player order path. Quick Call now enables
real wallet-signed testnet orders and reconciles their position, resolution, and
claim state from DreamDEX after reload. Range now detects compatible same-expiry
fixed strikes, watches both books, and discloses its equal-share two-leg payoff;
its EIP-7702 executor passes local atomic rollback tests, while browser signing
remains gated on a wallet-capable authorization path.
