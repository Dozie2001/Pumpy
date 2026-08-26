import {
  createPublicClient,
  createWalletClient,
  getAddress,
  http,
  isAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const registryAbi = [
  {
    type: "function",
    name: "owner",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "isBot",
    stateMutability: "view",
    inputs: [{ name: "bot", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "setBot",
    stateMutability: "nonpayable",
    inputs: [
      { name: "bot", type: "address" },
      { name: "authorized", type: "bool" },
    ],
    outputs: [],
  },
] as const;

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function privateKey(name: string): `0x${string}` {
  const value = required(name);
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error(`${name} must be 0x followed by 64 hexadecimal characters`);
  }
  return value as `0x${string}`;
}

const rpcUrl = required("HARDHAT_VAR_SHANNON_RPC_URL");
const registryValue = required("DECISION_REGISTRY_ADDRESS");
if (!isAddress(registryValue)) {
  throw new Error("DECISION_REGISTRY_ADDRESS must be a valid EVM address");
}

const registryAddress = getAddress(registryValue);
const deployer = privateKeyToAccount(
  privateKey("HARDHAT_VAR_DEPLOYER_PRIVATE_KEY"),
);
const momentum = privateKeyToAccount(privateKey("MOMENTUM_MAX_PRIVATE_KEY"));
const transport = http(rpcUrl);
const publicClient = createPublicClient({ transport });
const walletClient = createWalletClient({ account: deployer, transport });

const chainId = await publicClient.getChainId();
if (chainId !== 50_312) {
  throw new Error(`Expected Shannon chain ID 50312, received ${chainId}`);
}

const owner = await publicClient.readContract({
  address: registryAddress,
  abi: registryAbi,
  functionName: "owner",
});
if (getAddress(owner) !== getAddress(deployer.address)) {
  throw new Error(
    `Configured deployer ${deployer.address} is not registry owner ${owner}`,
  );
}

const alreadyAuthorized = await publicClient.readContract({
  address: registryAddress,
  abi: registryAbi,
  functionName: "isBot",
  args: [momentum.address],
});

if (alreadyAuthorized) {
  console.log(`Momentum Max already authorized: ${momentum.address}`);
  process.exit(0);
}

const { request } = await publicClient.simulateContract({
  account: deployer,
  address: registryAddress,
  abi: registryAbi,
  functionName: "setBot",
  args: [momentum.address, true],
});
const transactionHash = await walletClient.writeContract(request);
const receipt = await publicClient.waitForTransactionReceipt({
  hash: transactionHash,
});
if (receipt.status !== "success") {
  throw new Error(`Authorization transaction reverted: ${transactionHash}`);
}

const authorized = await publicClient.readContract({
  address: registryAddress,
  abi: registryAbi,
  functionName: "isBot",
  args: [momentum.address],
});
if (!authorized) {
  throw new Error("Authorization receipt succeeded but registry state is false");
}

console.log(`Momentum Max authorized: ${momentum.address}`);
console.log(`Authorization transaction: ${transactionHash}`);
