const { run } = require("hardhat");
const fs = require("fs");

async function main() {
    console.log("ğŸ” zkSync Era Contract Verification BaÅŸlÄ±yor...");
    
    // GÃ¼ncel deployment bilgilerini oku
    const deploymentPath = "./deployment_info_hybrid_ZKSYNC_ERA.json";
    
    if (!fs.existsSync(deploymentPath)) {
        console.error("âŒ Deployment bilgileri bulunamadÄ±:", deploymentPath);
        return;
    }
    
    const deploymentInfo = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
    console.log("ğŸ“‹ Deployment bilgileri yÃ¼klendi");
    console.log("ğŸŒ Network:", deploymentInfo.network);
    console.log("ğŸ‘¤ Deployer:", deploymentInfo.deployer);
    
    try {
        // 1. AccessControlRegistry Contract Verification
        const accessControl = deploymentInfo.contracts.AccessControlRegistry;
        if (accessControl) {
            console.log("\nğŸ” AccessControlRegistry verify ediliyor...");
            console.log("ğŸ“ Address:", accessControl.address);
            
            await run("verify:verify", {
                address: accessControl.address,
                constructorArguments: [], // AccessControlRegistry constructor parametresi yok
                contract: "contracts/AccessControlRegistry.sol:AccessControlRegistry"
            });
            console.log("âœ… AccessControlRegistry verified!");
        }
        
        // 2. UnifiedGroth16Verifier Contract Verification  
        const unifiedVerifier = deploymentInfo.contracts.UnifiedGroth16Verifier;
        if (verifier) {
            console.log("\nğŸ” UnifiedGroth16Verifier verify ediliyor...");
            console.log("ğŸ“ Address:", verifier.address);
            
            await run("verify:verify", {
                address: verifier.address,
                constructorArguments: [], // Verifier constructor parametresi yok
                contract: "contracts/UnifiedGroth16Verifier.sol:UnifiedGroth16Verifier"
            });
            console.log("âœ… UnifiedGroth16Verifier verified!");
        }
        
        // 3. PdMSystemHybrid Contract Verification
        const pdmSystem = deploymentInfo.contracts.PdMSystemHybrid;
        if (pdmSystem) {
            console.log("\nğŸ—ï¸ PdMSystemHybrid verify ediliyor...");
            console.log("ğŸ“ Address:", pdmSystem.address);
            
            // Constructor parametrelerini hazÄ±rla
            const constructorArgs = [
                pdmSystem.dependencies.zkVerifier,      // zkVerifier adresi
                pdmSystem.dependencies.accessRegistry   // accessControl adresi
            ];
            
            console.log("ğŸ”§ Constructor Args:", constructorArgs);
            
            await run("verify:verify", {
                address: pdmSystem.address,
                constructorArguments: constructorArgs,
                contract: "contracts/PdMSystemHybrid.sol:PdMSystemHybrid"
            });
            console.log("âœ… PdMSystemHybrid verified!");
        }
        
        console.log("\nğŸ‰ TÃ¼m contract'lar baÅŸarÄ±yla verify edildi!");
        console.log("ğŸ”— Explorer:", deploymentInfo.network.explorer);
        console.log("\nğŸ“‹ Contract Adresleri:");
        console.log("   ğŸ” AccessControl:", accessControl?.address);
        console.log("   ğŸ” Verifier:", verifier?.address);
        console.log("   ğŸ—ï¸ PDM System:", pdmSystem?.address);
        
    } catch (error) {
        console.error("âŒ Verification hatasÄ±:", error.message);
        
        // DetaylÄ± hata bilgisi
        if (error.message.includes("Already verified")) {
            console.log("â„¹ï¸ Contract zaten verify edilmiÅŸ olabilir.");
        } else if (error.message.includes("compilation")) {
            console.log("âš ï¸ Compilation hatasÄ± - kaynak kod eÅŸleÅŸmiyor olabilir.");
        } else if (error.message.includes("constructor")) {
            console.log("âš ï¸ Constructor parametreleri hatalÄ± olabilir.");
        }
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("ğŸ’¥ Script hatasÄ±:", error);
        process.exit(1);
    });
