const { ethers } = require("hardhat");
const { Wallet } = require("zksync-ethers");
const fs = require("fs");
const path = require("path");

async function main() {
    console.log("🔐 AccessControlRegistry Node Kayıt İşlemi Başlıyor...");
    console.log("=".repeat(60));

    try {
        // Deployment bilgilerini yükle
        const deploymentPath = path.join(__dirname, "deployment_info_hybrid_ZKSYNC_ERA.json");
        if (!fs.existsSync(deploymentPath)) {
            throw new Error("❌ Deployment bilgileri bulunamadı!");
        }

        const deploymentInfo = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
        // Deployment dosyasından adresi al
        const accessControlAddress = deploymentInfo.contracts.AccessControlRegistry.address;
        
        console.log(`📍 AccessControlRegistry Address: ${accessControlAddress}`);

        // Deployer'ı al
        const [deployer] = await ethers.getSigners();
        console.log("Debug - deployer:", deployer);
        console.log(`👤 Deployer: ${deployer ? deployer.address : 'undefined'}`);
        
        if (!deployer) {
            throw new Error("❌ Deployer bulunamadı! Network konfigürasyonunu kontrol edin.");
        }

        // Python uygulamasının kullandığı adres
        const pythonAppAddress = "0xE81eC6620856e62B4e1E04A1Fc9199f4293ed42f";
        console.log(`🐍 Python App Address: ${pythonAppAddress}`);

        // AccessControlRegistry contract'ını al
        const accessControlArtifact = await ethers.getContractAt("AccessControlRegistry", accessControlAddress);
        console.log("📋 Contract instance oluşturuldu");

        // Mevcut node durumunu kontrol et
        console.log("\n🔍 Mevcut node durumu kontrol ediliyor...");
        try {
            const isRegistered = await accessControlArtifact.isNodeRegistered(pythonAppAddress);
            console.log(`📊 Node kayıtlı mı: ${isRegistered}`);
            
            if (isRegistered) {
                console.log("✅ Node zaten kayıtlı!");
                return;
            }
        } catch (error) {
            console.log("⚠️ Node durumu kontrol edilemedi, kayıt işlemine devam ediliyor...");
        }

        // Node kayıt işlemi
        console.log("\n📝 Node kayıt işlemi başlıyor...");
        const tx = await accessControlArtifact.registerNode(pythonAppAddress);
        console.log(`⏳ Transaction hash: ${tx.hash}`);
        console.log("⏳ Transaction onaylanıyor...");

        const receipt = await tx.wait();
        console.log(`✅ Transaction onaylandı! Block: ${receipt.blockNumber}`);

        // Kayıt sonrası kontrol
        console.log("\n🔍 Kayıt sonrası kontrol...");
        const isRegisteredAfter = await accessControlArtifact.isNodeRegistered(pythonAppAddress);
        console.log(`📊 Node kayıtlı mı: ${isRegisteredAfter}`);

        if (isRegisteredAfter) {
            console.log("\n🎉 NODE KAYIT İŞLEMİ BAŞARILI! 🎉");
            console.log("=".repeat(60));
            console.log(`🐍 Python App Address: ${pythonAppAddress}`);
            console.log(`🔐 AccessControl Address: ${accessControlAddress}`);
            console.log(`⏳ Transaction Hash: ${tx.hash}`);
            console.log(`📦 Block Number: ${receipt.blockNumber}`);
            console.log("\n✅ Artık Python uygulaması blockchain'e veri gönderebilir!");
        } else {
            console.log("❌ Node kayıt işlemi başarısız!");
        }

    } catch (error) {
        console.error("\n❌ NODE KAYIT HATASI:", error.message);
        if (error.message.includes("Node already registered")) {
            console.log("ℹ️ Node zaten kayıtlı, işlem gerekmiyor.");
        } else if (error.message.includes("Only admin can register nodes")) {
            console.log("ℹ️ Sadece admin node kaydedebilir. Deployer adresini kontrol edin.");
        }
        throw error;
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });