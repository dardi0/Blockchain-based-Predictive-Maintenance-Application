const { ethers } = require("hardhat");

async function main() {
  // --- Kontrat adreslerini doldur ---
  const accessRegistryAddr = "0xc07Fc05fF357A324A366e336386165A9bc9b9346";
  const adminAddr = "0xE81eC6620856e62B4e1E04A1Fc9199f4293ed42f"; // PRIVATE_KEY adresin

  // AccessControlRegistry instance
  const registry = await ethers.getContractAt(
    "AccessControlRegistry",
    accessRegistryAddr
  );

  console.log("📡 Using registry at:", accessRegistryAddr);

  // --- 1. Node kaydı ---
  const tx1 = await registry.registerNode(
    "HybridNode1",                // nodeName
    adminAddr,                    // nodeAddress
    3,                            // NodeType.DATA_PROCESSOR (enum 3)
    2,                            // AccessLevel.WRITE_LIMITED (enum 2)
    0,                            // Süresiz erişim
    "Hybrid PdM main node"        // metadata
  );
  const receipt1 = await tx1.wait();
  console.log("✅ Node registered, tx:", receipt1.transactionHash);

  // Event'ten nodeId çekelim
  const event = receipt1.logs
  .map(log => registry.interface.parseLog(log))
  .find(e => e?.name === "NodeRegistered");

const nodeId = event.args.nodeId;


  // --- 2. Resource erişimleri ver ---
  const SENSOR_DATA_RESOURCE = ethers.keccak256(
    ethers.toUtf8Bytes("SENSOR_DATA")
  );
  const PREDICTION_RESOURCE = ethers.keccak256(
    ethers.toUtf8Bytes("PREDICTION")
  );
  const MAINTENANCE_RESOURCE = ethers.keccak256(
    ethers.toUtf8Bytes("MAINTENANCE")
  );

  const tx2 = await registry.grantEmergencyAccess(
    nodeId,
    SENSOR_DATA_RESOURCE,
    "Dev init - sensor access"
  );
  await tx2.wait();
  console.log("✅ SENSOR_DATA access granted");

  const tx3 = await registry.grantEmergencyAccess(
    nodeId,
    PREDICTION_RESOURCE,
    "Dev init - prediction access"
  );
  await tx3.wait();
  console.log("✅ PREDICTION access granted");

  const tx4 = await registry.grantEmergencyAccess(
    nodeId,
    MAINTENANCE_RESOURCE,
    "Dev init - maintenance access"
  );
  await tx4.wait();
  console.log("✅ MAINTENANCE access granted");

  console.log("🎉 Init setup complete!");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
