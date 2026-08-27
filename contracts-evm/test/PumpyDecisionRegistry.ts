import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { network } from "hardhat";
import { keccak256, stringToHex, zeroAddress, zeroHash } from "viem";

const id = (value: string) => keccak256(stringToHex(value));

interface DecisionView {
  bot: `0x${string}`;
  marketId: `0x${string}`;
  strategyId: `0x${string}`;
  modelHash: `0x${string}`;
  confidenceBps: number;
  side: number;
  registeredAt: bigint;
  expiresAt: bigint;
}

describe("PumpyDecisionRegistry", async function () {
  async function deployFixture() {
    const { viem } = await network.create();
    const [owner, bot, outsider] = await viem.getWalletClients();
    const publicClient = await viem.getPublicClient();
    const registry = await viem.deployContract("PumpyDecisionRegistry", [
      owner.account.address,
    ]);
    const botRegistry = await viem.getContractAt(
      "PumpyDecisionRegistry",
      registry.address,
      { client: { wallet: bot } },
    );
    const outsiderRegistry = await viem.getContractAt(
      "PumpyDecisionRegistry",
      registry.address,
      { client: { wallet: outsider } },
    );

    return {
      owner,
      bot,
      outsider,
      publicClient,
      registry,
      botRegistry,
      outsiderRegistry,
    };
  }

  it("authorizes bots only through the immutable owner", async function () {
    const { bot, registry, outsiderRegistry } = await deployFixture();

    await assert.rejects(() =>
      outsiderRegistry.write.setBot([bot.account.address, true]),
    );

    await registry.write.setBot([bot.account.address, true]);
    assert.equal(await registry.read.isBot([bot.account.address]), true);
  });

  it("rejects the zero address as owner or bot", async function () {
    const { viem } = await network.create();
    const { registry } = await deployFixture();

    await assert.rejects(() =>
      viem.deployContract("PumpyDecisionRegistry", [zeroAddress]),
    );
    await assert.rejects(() => registry.write.setBot([zeroAddress, true]));
  });

  it("registers a complete immutable decision", async function () {
    const { bot, publicClient, registry, botRegistry } = await deployFixture();
    await registry.write.setBot([bot.account.address, true]);

    const block = await publicClient.getBlock();
    const marketId = id("dreamdex:market:1");
    const strategyId = id("sample-strategy:v1");
    const modelHash = id("canonical-model-payload");
    const expiresAt = block.timestamp + 3_600n;

    await botRegistry.write.registerDecision([
      marketId,
      strategyId,
      0,
      7_250,
      modelHash,
      expiresAt,
    ]);

    const decisionId = await registry.read.decisionIdFor([
      bot.account.address,
      marketId,
    ]);
    const decision = (await registry.read.getDecision([
      decisionId,
    ])) as unknown as DecisionView;

    assert.equal(await registry.read.hasDecision([decisionId]), true);
    assert.equal(decision.bot.toLowerCase(), bot.account.address.toLowerCase());
    assert.equal(decision.marketId, marketId);
    assert.equal(decision.strategyId, strategyId);
    assert.equal(decision.modelHash, modelHash);
    assert.equal(decision.confidenceBps, 7_250);
    assert.equal(decision.side, 0);
    assert.equal(decision.expiresAt, expiresAt);
    assert.ok(decision.registeredAt > 0n);
  });

  it("prevents an authorized bot from overwriting a decision", async function () {
    const { bot, publicClient, registry, botRegistry } = await deployFixture();
    await registry.write.setBot([bot.account.address, true]);

    const block = await publicClient.getBlock();
    const args = [
      id("market:duplicate"),
      id("sample-strategy:v1"),
      1,
      6_000,
      id("model:duplicate"),
      block.timestamp + 3_600n,
    ] as const;

    await botRegistry.write.registerDecision(args);
    await assert.rejects(() => botRegistry.write.registerDecision(args));
  });

  it("rejects unauthorized, invalid, and expired decisions", async function () {
    const { publicClient, outsiderRegistry } = await deployFixture();
    const block = await publicClient.getBlock();
    const base = [id("market:invalid"), id("strategy:invalid")] as const;

    await assert.rejects(() =>
      outsiderRegistry.write.registerDecision([
        ...base,
        0,
        5_000,
        id("model:unauthorized"),
        block.timestamp + 3_600n,
      ]),
    );

    const { bot, registry, botRegistry } = await deployFixture();
    await registry.write.setBot([bot.account.address, true]);

    await assert.rejects(() =>
      botRegistry.write.registerDecision([
        ...base,
        2,
        5_000,
        id("model:side"),
        block.timestamp + 3_600n,
      ]),
    );
    await assert.rejects(() =>
      botRegistry.write.registerDecision([
        ...base,
        0,
        10_001,
        id("model:confidence"),
        block.timestamp + 3_600n,
      ]),
    );
    await assert.rejects(() =>
      botRegistry.write.registerDecision([
        zeroHash,
        base[1],
        0,
        5_000,
        id("model:identifier"),
        block.timestamp + 3_600n,
      ]),
    );
    await assert.rejects(() =>
      botRegistry.write.registerDecision([
        ...base,
        0,
        5_000,
        id("model:expiry"),
        block.timestamp,
      ]),
    );
  });
});
