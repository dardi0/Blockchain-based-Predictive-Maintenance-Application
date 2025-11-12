const hre = require("hardhat");
const { Provider, Wallet } = require("zksync-ethers");
const AccessControlRegistryArtifact = require("../artifacts-zk/contracts/AccessControlRegistry.sol/AccessControlRegistry.json");

async function main() {
    // .env dosyasından PRIVATE_KEY'i al
    const WALLET_PRIVATE_KEY = process.env.PRIVATE_KEY;
    if (!WALLET_PRIVATE_KEY) {
        throw new Error("Lütfen .env dosyasında PRIVATE_KEY'i belirtin.");
    }

    // AccessControlRegistry adresi: CLI > ENV > varsayılan
    const ACCESS_REGISTRY_ADDRESS = process.argv[2] || process.env.ACCESS_REGISTRY_ADDRESS || "0x556993411e9914f5eCDC422E2385411A79498ec2";
    
    // zkSync provider & wallet
    const provider = new Provider(process.env.ZKSYNC_ERA_RPC_URL);
    const wallet = new Wallet(WALLET_PRIVATE_KEY, provider);

    const accessRegistry = new (require("ethers").Contract)(ACCESS_REGISTRY_ADDRESS, AccessControlRegistryArtifact.abi, wallet);

    // Düğüm adresi: CLI > ENV > wallet.address
    const nodeAddressToRegister = process.argv[3] || process.env.NODE_ADDRESS || wallet.address;

    console.log(`🔧 AccessControlRegistry kontratına bağlanıldı: ${await accessRegistry.getAddress()}`);
    console.log(`📝 Şu adres bir düğüm olarak kaydedilecek: ${nodeAddressToRegister}`);

    // Düğüm bilgilerini tanımla
    const nodeName = process.env.NODE_NAME || "AdminGatewayNode";
    const nodeType = Number(process.env.NODE_TYPE || 6); // GATEWAY
    const accessLevel = Number(process.env.ACCESS_LEVEL || 3); // FULL_ACCESS
    const accessDuration = Number(process.env.ACCESS_DURATION || 0); // 0 = Süresiz
    const metadata = process.env.NODE_METADATA || "Admin cüzdanı için ana gateway düğümü";

    try {
        console.log("🚀 registerNode fonksiyonu çağrılıyor...");
        const tx = await accessRegistry.registerNode(
            nodeName,
            nodeAddressToRegister,
            nodeType,
            accessLevel,
            accessDuration,
            metadata
        );

        console.log(`📤 Transaction gönderildi: ${tx.hash}`);
        console.log("⏳ Onay bekleniyor...");
        await tx.wait();

        console.log(`✅ Başarılı! ${nodeAddressToRegister} adresi artık yetkili bir düğüm.`);
        
    } catch (error) {
        console.error("❌ Düğüm kaydı sırasında hata oluştu:", error.reason || error.message);
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});