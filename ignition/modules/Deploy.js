const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules");

module.exports = buildModule("PDMDeployment", (m) => {
  // 1. Access Control Registry sÃ¶zleÅŸmesini deploy et
  const accessRegistry = m.contract("AccessControlRegistry");

  // 2. ZK Verifier sÃ¶zleÅŸmesini deploy et
  const verifier = m.contract("UnifiedGroth16Verifier");

  // 3. PdM sistem sÃ¶zleÅŸmesini mevcut sÃ¶zleÅŸmelerle deploy et
  const pdmSystem = m.contract("PdMSystemHybrid", [
    accessRegistry,
    verifier,
    m.getParameter("initialAdmin", "0x0"),
  ]);

  return { accessRegistry, verifier, pdmSystem };
});





