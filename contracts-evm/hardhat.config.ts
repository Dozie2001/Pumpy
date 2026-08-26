import hardhatToolboxViem from "@nomicfoundation/hardhat-toolbox-viem";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { configVariable, defineConfig } from "hardhat/config";

// Hardhat 3 configuration variables read HARDHAT_VAR_* from process.env.
// Load the repository's one ignored root .env so local deploy commands work
// from either the repository root or contracts-evm/ without another dependency.
const localEnvPath = fileURLToPath(new URL("../.env", import.meta.url));
if (existsSync(localEnvPath)) process.loadEnvFile(localEnvPath);

export default defineConfig({
  plugins: [hardhatToolboxViem],
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    shannon: {
      type: "http",
      chainType: "l1",
      chainId: 50_312,
      url: configVariable("HARDHAT_VAR_SHANNON_RPC_URL"),
      accounts: [configVariable("HARDHAT_VAR_DEPLOYER_PRIVATE_KEY")],
    },
  },
});
