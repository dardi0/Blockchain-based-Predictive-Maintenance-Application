const { run } = require("hardhat");
const fs = require("fs");

async function main() {
    console.log("🔍 zkSync Era Contract Verification Başlıyor...");
    
    // DÜZELTME 1: Doğru deployment bilgi dosyası okunuyor.
    const deploymentPath = "./deployment_info_hybrid_ZKSYNC_ERA.json";
    
    if (!fs.existsSync(deploymentPath)) {
        console.error("❌ Deployment bilgileri bulunamadı:", deploymentPath);
        return;
    }
    
    const deploymentInfo = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
    console.log("📋 Deployment bilgileri yüklendi");
    console.log("🌐 Network:", deploymentInfo.network);
    console.log("👤 Deployer:", deploymentInfo.deployer);
    
    try {
        // 1. AccessControlRegistry Contract Verification
        const accessControl = deploymentInfo.contracts.AccessControlRegistry;
        if (accessControl) {
            console.log("\n🔐 AccessControlRegistry verify ediliyor...");
            console.log("📍 Address:", accessControl.address);
            
            // DÜZELTME 2: Doğru constructor argümanı (deployer adresi) eklendi.
            const constructorArgs = [deploymentInfo.deployer];
            console.log("🔧 Constructor Args:", constructorArgs);

            await run("verify:verify", {
                address: accessControl.address,
                constructorArguments: constructorArgs, 
                contract: "contracts/AccessControlRegistry.sol:AccessControlRegistry"
            });
            console.log("✅ AccessControlRegistry verified!");
        }
        
        // 2. OptimizedGroth16Verifier Contract Verification  
        const verifier = deploymentInfo.contracts.OptimizedGroth16Verifier;
        if (verifier) {
            console.log("\n🔍 OptimizedGroth16Verifier verify ediliyor...");
            console.log("📍 Address:", verifier.address);
            
            await run("verify:verify", {
                address: verifier.address,
                constructorArguments: [], // Bu kontratın constructor parametresi yok, bu doğru.
                contract: "contracts/OptimizedGroth16Verifier.sol:OptimizedGroth16Verifier"
            });
            console.log("✅ OptimizedGroth16Verifier verified!");
        }
        
        // 3. PdMSystemHybrid Contract Verification
        const pdmSystem = deploymentInfo.contracts.PdMSystemHybrid;
        if (pdmSystem) {
            console.log("\n🏗️ PdMSystemHybrid verify ediliyor...");
            console.log("📍 Address:", pdmSystem.address);
            
            // DÜZELTME 3: Constructor parametreleri doğru sırada ve tam olarak hazırlandı.
            const constructorArgs = [
                pdmSystem.dependencies.accessRegistry,   // _accessRegistry adresi
                pdmSystem.dependencies.zkVerifier,      // _zkVerifier adresi
                deploymentInfo.deployer                 // _initialAdmin adresi
            ];
            
            console.log("🔧 Constructor Args:", constructorArgs);
            
            await run("verify:verify", {
                address: pdmSystem.address,
                constructorArguments: constructorArgs,
                contract: "contracts/PdMSystemHybrid.sol:PdMSystemHybrid"
            });
            console.log("✅ PdMSystemHybrid verified!");
        }
        
        console.log("\n🎉 Tüm contract'lar başarıyla verify edildi!");
        console.log("🔗 Explorer: https://sepolia.explorer.zksync.io/"); // Sabit link
        console.log("\n📋 Contract Adresleri:");
        console.log("   🔐 AccessControl:", accessControl?.address);
        console.log("   🔍 Verifier:", verifier?.address);
        console.log("   🏗️ PDM System:", pdmSystem?.address);
        
    } catch (error) {
        console.error("❌ Verification hatası:", error.message);
        
        if (error.message.includes("Already verified")) {
            console.log("ℹ️ Contract zaten verify edilmiş olabilir.");
        } else if (error.message.includes("does not exist on ZkSync")) {
            console.log("⚠️ Adres hatalı veya deploy işlemi başarısız olmuş olabilir.");
        } else if (error.message.includes("constructor")) {
            console.log("⚠️ Constructor parametreleri hatalı olabilir.");
        }
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("💥 Script hatası:", error);
        process.exit(1);
    });