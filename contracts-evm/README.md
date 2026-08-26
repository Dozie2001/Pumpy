# Pumpy EVM contracts

Hardhat 3 workspace for Pumpy's fundless onchain proof contracts.

## Decision registry

`PumpyDecisionRegistry` records one immutable UP/DOWN decision per bot and DreamDEX market before any player commits. Every match using that market references the same decision, preventing selective reveal. The registry stores no collateral, rewards, or player funds.

```bash
npm install
npm run compile
npm test
npm run typecheck
```

## Shannon deployment

Create the ignored local environment file:

```bash
cp .env.example .env
```

The public Shannon RPC is already filled in. Add a dedicated low-balance
testnet deployer to `.env` as `0x` followed by 64 hexadecimal characters, then:

```bash
npm run deploy:shannon
```

Hardhat's encrypted keystore remains an alternative: keystore values override
the same `SHANNON_RPC_URL` and `DEPLOYER_PRIVATE_KEY` configuration variables.
Never paste the key into source files or any `VITE_` variable.

After deployment, the owner authorizes each dedicated bot wallet with `setBot`. Authorization only permits decision registration; the contract has no fund-moving function.
