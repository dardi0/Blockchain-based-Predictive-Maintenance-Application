// Güncel zkSync Era Hibrit PDM Sistemi Deployment Script
require('dotenv').config();

const { Wallet, Provider } = require("zksync-ethers");
const { Deployer } = require("@matterlabs/hardhat-zksync-deploy");
const fs = require("fs");
const path = require("path");

// .env dosyasından bilgileri al
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const ZKSYNC_ERA_RPC_URL = process.env.ZKSYNC_ERA_RPC_URL;

// Deployment script ana fonksiyonu
module.exports = async function (hre) {
  console.log("🚀 zkSync Era Hibrit PDM Sistemi Deployment Başlıyor...");
  console.log("=".repeat(60));

  // Gerekli bilgilerin kontrolü
  if (!PRIVATE_KEY) {
    throw new Error("❌ PRIVATE_KEY .env dosyasında tanımlı değil!");
  }
  if (!ZKSYNC_ERA_RPC_URL) {
    throw new Error("❌ ZKSYNC_ERA_RPC_URL .env dosyasında tanımlı değil!");
  }

  // Provider ve wallet oluştur
  const provider = new Provider(ZKSYNC_ERA_RPC_URL);
  const wallet = new Wallet(PRIVATE_KEY, provider);
  const deployer = new Deployer(hre, wallet);

  console.log("👤 Deployer Address:", wallet.address);
  
  // Balance kontrolü
  const balance = await wallet.getBalance();
  console.log("💰 Balance:", hre.ethers.formatEther(balance), "ETH");
  
  if (balance === 0n) {
    throw new Error("❌ Insufficient balance! Please fund your wallet.");
  }

  console.log("\n📋 Deployment Plan:");
  console.log("   1️⃣ AccessControlRegistry");
  console.log("   2️⃣ UnifiedGroth16Verifier");
  console.log("   3️⃣ PdMSystemHybrid");
  console.log("");

  const deploymentResults = {};
  const startTime = Date.now();

  try {
    // 1. AccessControlRegistry Deployment
    console.log("1️⃣ AccessControlRegistry deployment başlıyor...");
    const accessControlArtifact = await deployer.loadArtifact("AccessControlRegistry");
    // DÜZELTME: Constructor argümanı olarak deployer'ın adresi eklendi.
    const accessControl = await deployer.deploy(accessControlArtifact, [wallet.address]);
    const accessControlAddress = await accessControl.getAddress();
    
    deploymentResults.AccessControlRegistry = {
      name: "AccessControlRegistry",
      address: accessControlAddress,
      purpose: "Merkezi yetki yönetimi - Node kayıt/silme"
    };
    
    console.log(`✅ AccessControlRegistry deployed: ${accessControlAddress}`);

    // 2. OptimizedGroth16Verifier Deployment
    console.log("\n2️⃣ UnifiedGroth16Verifier deployment başlıyor...");
    const verifierArtifact = await deployer.loadArtifact("UnifiedGroth16Verifier");
    const verifier = await deployer.deploy(verifierArtifact);
    const verifierAddress = await verifier.getAddress();
    
    deploymentResults.UnifiedGroth16Verifier = {
      name: "UnifiedGroth16Verifier",
      address: verifierAddress,
      purpose: "ZK-SNARK proof doğrulama motoru (dinamik VK + sensör için sabit VK)"
    };
    
    console.log(`✅ UnifiedGroth16Verifier deployed: ${verifierAddress}`);

    // 3. PdMSystemHybrid Deployment
    console.log("\n3️⃣ PdMSystemHybrid deployment başlıyor...");
    const pdmSystemArtifact = await deployer.loadArtifact("PdMSystemHybrid");
    // DÜZELTME: Argümanlar doğru sırada ve 3 argüman da verildi.
    const pdmSystem = await deployer.deploy(pdmSystemArtifact, [
      accessControlAddress, // _accessRegistry
      verifierAddress,      // _zkVerifier
      wallet.address        // _initialAdmin
    ]);
    const pdmSystemAddress = await pdmSystem.getAddress();
    
    deploymentResults.PdMSystemHybrid = {
      name: "PdMSystemHybrid",
      address: pdmSystemAddress,
      purpose: "Ana hibrit PDM sistemi - Off-chain storage + ZK proofs",
      dependencies: {
        accessRegistry: accessControlAddress,
        zkVerifier: verifierAddress
      }
    };
    
    console.log(`✅ PdMSystemHybrid deployed: ${pdmSystemAddress}`);

    const endTime = Date.now();
    const deploymentTime = (endTime - startTime) / 1000;

    // Deployment bilgilerini kaydet
    const deploymentInfo = {
      network: "ZKSYNC_ERA",
      deployer: wallet.address,
      timestamp: new Date().toISOString(),
      deployment_time_seconds: deploymentTime,
      system_type: "hybrid",
      features: {
        offChainStorage: true,
        zkProofs: true,
        accessControl: true,
        gasOptimized: true
      },
      contracts: deploymentResults
    };

    // JSON dosyasına kaydet
    const outputPath = "./deployment_info_hybrid_ZKSYNC_ERA.json";
    fs.writeFileSync(outputPath, JSON.stringify(deploymentInfo, null, 2));

    // Başarı mesajı
    console.log("\n🎉 DEPLOYMENT BAŞARIYLA TAMAMLANDI! 🎉");
    console.log("=".repeat(60));
    console.log(`⏱️  Toplam süre: ${deploymentTime.toFixed(2)} saniye`);
    console.log(`💾 Deployment bilgileri: ${outputPath}`);
    console.log("");
    console.log("📋 Contract Adresleri:");
    console.log(`   🔐 AccessControl: ${accessControlAddress}`);
    console.log(`   🔍 Verifier: ${verifierAddress}`);
    console.log(`   🏗️  PDM System: ${pdmSystemAddress}`);
    console.log("");
    console.log("🔗 zkSync Era Sepolia Explorer:");
    console.log(`   https://sepolia.explorer.zksync.io/address/${pdmSystemAddress}`);
    console.log("");
    console.log("⚡ Sistem Özellikleri:");
    console.log("   ✅ Off-chain storage + ZK proofs");
    console.log("   ✅ Gas optimized (zkSync Era Layer 2)");
    console.log("   ✅ Access control sistemi");
    console.log("   ✅ Hibrit veri depolama");

    return deploymentResults;

  } catch (error) {
    console.error("\n❌ DEPLOYMENT HATASI:", error); // Hatayı daha detaylı görmek için error.message yerine error yazıldı.
    throw error;
  }
};
