import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("PumpyDecisionRegistryModule", (m) => {
  const owner = m.getAccount(0);
  const registry = m.contract("PumpyDecisionRegistry", [owner]);

  return { registry };
});
