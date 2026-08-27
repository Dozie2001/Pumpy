import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { network } from "hardhat";
import { zeroAddress } from "viem";

const ONE = 1_000_000n;
const QUANTITY = 2_000_000n;
const LOWER_ID = 101n;
const UPPER_ID = 202n;

describe("PumpyRangeExecutor7702", async function () {
  async function deployFixture() {
    const { viem, networkHelpers } = await network.create();
    const [player, outsider] = await viem.getWalletClients();
    const publicClient = await viem.getPublicClient();
    const implementation = await viem.deployContract(
      "PumpyRangeExecutor7702",
    );
    const collateral = await viem.deployContract("MockRangeCollateral");
    const outcomes = await viem.deployContract("MockRangeOutcomes");
    const lowerPool = await viem.deployContract("MockBinaryRangePool", [
      collateral.address,
      outcomes.address,
      LOWER_ID,
      600_000n,
      ONE,
    ]);
    const upperPool = await viem.deployContract("MockBinaryRangePool", [
      collateral.address,
      outcomes.address,
      UPPER_ID,
      500_000n,
      ONE,
    ]);

    await collateral.write.mint([player.account.address, 10_000_000n]);
    const implementationCode = await publicClient.getCode({
      address: implementation.address,
    });
    assert.ok(implementationCode);
    await networkHelpers.setCode(player.account.address, implementationCode);

    const executor = await viem.getContractAt(
      "PumpyRangeExecutor7702",
      player.account.address,
      { client: { wallet: player } },
    );
    const outsiderExecutor = await viem.getContractAt(
      "PumpyRangeExecutor7702",
      player.account.address,
      { client: { wallet: outsider } },
    );

    const order = {
      collateral: collateral.address,
      lowerPool: lowerPool.address,
      upperPool: upperPool.address,
      lowerOutcomeToken: outcomes.address,
      upperOutcomeToken: outcomes.address,
      lowerYesId: LOWER_ID,
      upperNoId: UPPER_ID,
      lowerYesPrice: 620_000n,
      upperYesPrice: 480_000n,
      quantity: QUANTITY,
      lowerMaximumCost: 1_240_000n,
      upperMaximumCost: 1_040_000n,
      expireTimestampNs: 99_999_999_999n,
    } as const;

    return {
      player,
      implementation,
      collateral,
      outcomes,
      lowerPool,
      upperPool,
      executor,
      outsiderExecutor,
      order,
    };
  }

  it("fills equal lower-YES and upper-NO quantities in one self-call", async function () {
    const {
      player,
      collateral,
      outcomes,
      lowerPool,
      upperPool,
      executor,
      order,
    } = await deployFixture();

    await executor.write.executeRange([order]);

    assert.equal(
      await outcomes.read.balanceOf([player.account.address, LOWER_ID]),
      QUANTITY,
    );
    assert.equal(
      await outcomes.read.balanceOf([player.account.address, UPPER_ID]),
      QUANTITY,
    );
    assert.equal(
      await collateral.read.balanceOf([player.account.address]),
      7_800_000n,
    );
    assert.equal(
      await collateral.read.allowance([
        player.account.address,
        lowerPool.address,
      ]),
      0n,
    );
    assert.equal(
      await collateral.read.allowance([
        player.account.address,
        upperPool.address,
      ]),
      0n,
    );
  });

  it("rolls back the first fill when the second pool rejects", async function () {
    const { player, collateral, outcomes, upperPool, executor, order } =
      await deployFixture();
    await upperPool.write.configure([true, false]);

    await assert.rejects(() => executor.write.executeRange([order]));

    assert.equal(
      await collateral.read.balanceOf([player.account.address]),
      10_000_000n,
    );
    assert.equal(
      await outcomes.read.balanceOf([player.account.address, LOWER_ID]),
      0n,
    );
    assert.equal(
      await outcomes.read.balanceOf([player.account.address, UPPER_ID]),
      0n,
    );
  });

  it("rolls back both legs when a pool reports success without the full fill", async function () {
    const { player, collateral, outcomes, upperPool, executor, order } =
      await deployFixture();
    await upperPool.write.configure([false, true]);

    await assert.rejects(() => executor.write.executeRange([order]));

    assert.equal(
      await collateral.read.balanceOf([player.account.address]),
      10_000_000n,
    );
    assert.equal(
      await outcomes.read.balanceOf([player.account.address, LOWER_ID]),
      0n,
    );
    assert.equal(
      await outcomes.read.balanceOf([player.account.address, UPPER_ID]),
      0n,
    );
  });

  it("rejects direct implementation calls and calls from another account", async function () {
    const { implementation, outsiderExecutor, order } = await deployFixture();

    await assert.rejects(() => implementation.write.executeRange([order]));
    await assert.rejects(() => outsiderExecutor.write.executeRange([order]));
  });

  it("rejects malformed ranges before touching a pool", async function () {
    const { executor, order } = await deployFixture();

    await assert.rejects(() =>
      executor.write.executeRange([{ ...order, collateral: zeroAddress }]),
    );
  });
});
