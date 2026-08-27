# Pumpy EVM contracts

Hardhat 3 workspace for Pumpy's fundless decision proof and delegated atomic
execution contracts.

## Decision registry

`PumpyDecisionRegistry` records one immutable UP/DOWN decision per bot and DreamDEX market before any player commits. Every match using that market references the same decision, preventing selective reveal. The registry stores no collateral, rewards, or player funds.

```bash
npm install
npm run compile
npm test
npm run typecheck
```

## Shannon deployment

Current deployment:

- Registry: [`0xD68E16fe502731664f163d3b166B75dDA6A45790`](https://shannon-explorer.somnia.network/address/0xD68E16fe502731664f163d3b166B75dDA6A45790)
- Deployment transaction: [`0xb35af1…b3b247`](https://shannon-explorer.somnia.network/tx/0xb35af133257615c442030c30c0d9863e63ceb3a25152071170819e49ebb3b247)

From the repository root, create the one ignored local environment file:

```bash
cp .env.example .env
```

The public Shannon RPC is already filled in. Add a dedicated low-balance
testnet deployer to the root `.env` as `0x` followed by 64 hexadecimal
characters, then from `contracts-evm/` run:

```bash
npm run deploy:shannon
```

The deploy command loads the repository root `.env` before Hardhat starts. After
deployment, add the printed registry address to the root `.env` as
`DECISION_REGISTRY_ADDRESS`. No bot is enabled in the current player-facing MVP.

Hardhat's encrypted keystore remains an alternative. Use the same literal
configuration-variable names shown in `.env.example`. Never paste a key into
source files or any `VITE_` variable.

After deployment, the owner authorizes each dedicated bot wallet with `setBot`. Authorization only permits decision registration; the contract has no fund-moving function.

## Atomic Range executor

`PumpyRangeExecutor7702` is implementation bytecode intended to be delegated
onto a player's wallet through EIP-7702. One wallet self-call submits equal
Fill-or-Kill quantities to BUY_YES on the lower DreamDEX binary pool and BUY_NO
on the upper pool. It verifies the exact outcome-token balance increases and
reverts the whole transaction when either leg rejects, short-fills, or exceeds
the disclosed maximum combined cost.

The deployed implementation rejects direct calls, and the delegated code only
accepts calls where the wallet is both caller and execution account. It approves
only each leg's quoted maximum collateral and clears both allowances afterward.
The test suite proves successful equal fills, second-leg rollback, short-fill
rollback, direct-call rejection, and malformed-order rejection. Shannon
deployment and browser signing remain disabled until the selected player wallet
can produce and submit an EIP-7702 authorization safely.
