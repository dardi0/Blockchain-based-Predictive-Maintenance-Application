const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  require('dotenv').config();

  // --- 1. GEREKLİ BİLGİLERİ YÜKLE ---
  const PRIVATE_KEY = process.env.PRIVATE_KEY;
  if (!PRIVATE_KEY) throw new Error(".env içinde PRIVATE_KEY yok");

  // Güncel deploy bilgilerini oku
  const deploymentInfoPath = "./deployment_info_hybrid_ZKSYNC_ERA.json";
  if (!fs.existsSync(deploymentInfoPath)) {
    throw new Error(`Deployment dosyası bulunamadı: ${deploymentInfoPath}`);
  }
  const deploymentInfo = JSON.parse(fs.readFileSync(deploymentInfoPath, 'utf8'));
  
  // AccessControlRegistry adresini ve ABI'sini al
  const registryAddress = deploymentInfo.contracts.AccessControlRegistry.address;
  const registryArtifactPath = path.join(__dirname, "../artifacts-zk/contracts/AccessControlRegistry.sol/AccessControlRegistry.json");
  if (!fs.existsSync(registryArtifactPath)) {
      throw new Error(`Artifact bulunamadı: ${registryArtifactPath}`);
  }
  const registryArtifact = require(registryArtifactPath);

  // --- 2. BLOCKCHAIN BAĞLANTISINI KUR ---
  const { ethers } = hre;
  const { Provider, Wallet } = require("zksync-ethers");
  const provider = new Provider(process.env.ZKSYNC_ERA_RPC_URL);
  const wallet = new Wallet(PRIVATE_KEY, provider);

  // Doğru kontrat (AccessControlRegistry) ile etkileşim kur
  const registry = new ethers.Contract(registryAddress, registryArtifact.abi, wallet);

  const walletAddress = ethers.getAddress(wallet.address);
  console.log("🔐 AccessControlRegistry Adresi:", await registry.getAddress());
  console.log("👤 Wallet (İşlemi Yapan):", walletAddress);

  // --- 3. ROLLERİ TANIMLA VE KONTROL ET ---
  const superAdminRole = await registry.SUPER_ADMIN_ROLE();
  const systemAdminRole = await registry.SYSTEM_ADMIN_ROLE();
  const nodeManagerRole = await registry.NODE_MANAGER_ROLE();

  console.log("\n🔎 Mevcut Roller Kontrol Ediliyor...");
  // Dikkat: hasRole getter sırası (address, role)
  const hasSuperAdmin = await registry.hasRole(walletAddress, superAdminRole);
  const hasSystemAdmin = await registry.hasRole(walletAddress, systemAdminRole);
  const hasNodeManager = await registry.hasRole(walletAddress, nodeManagerRole);

  console.log(`   - SUPER_ADMIN: ${hasSuperAdmin}`);
  console.log(`   - SYSTEM_ADMIN: ${hasSystemAdmin}`);
  console.log(`   - NODE_MANAGER: ${hasNodeManager}`);

  // --- 4. EKSİK ROLLERİ VER ---
  async function grantIfNeeded(role, roleName) {
    const hasRole = await registry.hasRole(walletAddress, role);
    if (hasRole) {
      console.log(`\n✅ ${roleName} rolü zaten mevcut.`);
    } else {
      console.log(`\n🚀 ${roleName} rolü veriliyor...`);
      const tx = await registry.grantRole(role, walletAddress);
      console.log("   📤 TX Gönderildi:", tx.hash);
      await tx.wait(); // İşlemin onaylanmasını bekle
      console.log(`   ✅ ${roleName} rolü başarıyla verildi!`);
    }
  }

  // Sahip olduğunuz SUPER_ADMIN_ROLE ile diğer rolleri kendinize verin
  // Not: SUPER_ADMIN rolü, deploy anında constructor tarafından otomatik olarak verilir.
  await grantIfNeeded(systemAdminRole, "SYSTEM_ADMIN_ROLE");
  await grantIfNeeded(nodeManagerRole, "NODE_MANAGER_ROLE");

  console.log("\n🎉 Rol atama işlemleri tamamlandı!");
}

main().catch((e) => {
  console.error("💥 Script hatası:", e);
  process.exit(1);
});