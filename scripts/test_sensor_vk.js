/**
 * Test script - Sensor Data VK doğrulaması
 * Bu script, UnifiedGroth16Verifier'da Sensor VK'nın doğru yüklenip yüklenmediğini test eder
 */

require('dotenv').config();
const { ethers } = require('ethers');

async function main() {
    console.log("🔍 Sensor Data VK Test Başlıyor...\n");

    const provider = new ethers.JsonRpcProvider(process.env.ZKSYNC_ERA_RPC_URL);
    const wallet = new ethers.Wallet(process.env.CONTRACT_OWNER_PRIVATE_KEY, provider);

    // Deployed addresses
    const VERIFIER_ADDRESS = process.env.VERIFIER_ADDRESS;
    const PDM_SYSTEM_ADDRESS = process.env.PDM_SYSTEM_ADDRESS;

    console.log("📋 Contract Adresleri:");
    console.log(`   Verifier: ${VERIFIER_ADDRESS}`);
    console.log(`   PDM System: ${PDM_SYSTEM_ADDRESS}`);

    // Minimal ABI for testing
    const verifierABI = [
        "function circuitKeys(uint8) view returns (tuple(uint256 X, uint256 Y) alpha, tuple(uint256[2] X, uint256[2] Y) beta, tuple(uint256[2] X, uint256[2] Y) gamma, tuple(uint256[2] X, uint256[2] Y) delta, tuple(uint256 X, uint256 Y)[] IC, bool isSet)",
        "function getICLength(uint8 circuitType) view returns (uint256)",
        "function getICPoint(uint8 circuitType, uint256 index) view returns (uint256 X, uint256 Y)",
        "function verifySensorDataProof(uint[2] memory a, uint[2][2] memory b, uint[2] memory c, uint[] memory input) view returns (bool)"
    ];

    const pdmABI = [
        "function zkVerifier() view returns (address)",
        "function sensorVerifier() view returns (address)"
    ];

    const verifier = new ethers.Contract(VERIFIER_ADDRESS, verifierABI, provider);
    const pdmSystem = new ethers.Contract(PDM_SYSTEM_ADDRESS, pdmABI, provider);

    // 1. PdMSystem'deki verifier adreslerini kontrol et
    console.log("\n" + "─".repeat(50));
    console.log("1️⃣ PDM System Verifier Adresleri");
    console.log("─".repeat(50));

    try {
        const zkVerifierAddr = await pdmSystem.zkVerifier();
        console.log(`   zkVerifier: ${zkVerifierAddr}`);

        const sensorVerifierAddr = await pdmSystem.sensorVerifier();
        console.log(`   sensorVerifier: ${sensorVerifierAddr}`);

        if (sensorVerifierAddr === '0x0000000000000000000000000000000000000000') {
            console.log("   ⚠️ sensorVerifier set edilmemiş (fallback to zkVerifier kullanılacak)");
        }
    } catch (e) {
        console.log(`   ❌ Hata: ${e.message}`);
    }

    // 2. Sensor VK kontrolü (CircuitType.SENSOR_DATA = 0)
    console.log("\n" + "─".repeat(50));
    console.log("2️⃣ Sensor Data VK Kontrolü (CircuitType = 0)");
    console.log("─".repeat(50));

    try {
        const icLength = await verifier.getICLength(0);
        console.log(`   IC Length: ${icLength} (beklenen: 4 = 3 public inputs + 1)`);

        if (icLength == 4) {
            console.log("   ✅ IC length doğru!");

            // IC noktalarını yazdır
            for (let i = 0; i < icLength; i++) {
                const ic = await verifier.getICPoint(0, i);
                console.log(`   IC[${i}]: X=${ic.X.toString().slice(0, 20)}... Y=${ic.Y.toString().slice(0, 20)}...`);
            }
        } else {
            console.log(`   ❌ IC length yanlış! Beklenen: 4, Alınan: ${icLength}`);
        }
    } catch (e) {
        console.log(`   ❌ VK okunamadı: ${e.message}`);
        console.log("   💡 VK muhtemelen set edilmemiş");
    }

    // 3. Basit bir proof test et (dummy values)
    console.log("\n" + "─".repeat(50));
    console.log("3️⃣ Dummy Proof Test (başarısız olması normal)");
    console.log("─".repeat(50));

    try {
        // Dummy proof - sadece fonksiyonun çağrılabildiğini test etmek için
        const dummyA = [1n, 2n];
        const dummyB = [[3n, 4n], [5n, 6n]];
        const dummyC = [7n, 8n];
        const dummyInputs = [1001n, BigInt(Math.floor(Date.now() / 1000)), 12345n];

        const result = await verifier.verifySensorDataProof(dummyA, dummyB, dummyC, dummyInputs);
        console.log(`   Dummy proof result: ${result} (false olması bekleniyor)`);
    } catch (e) {
        if (e.message.includes("VK not set")) {
            console.log("   ❌ VK not set hatası - VK yüklenmemiş!");
        } else if (e.message.includes("bad inputs")) {
            console.log("   ❌ bad inputs hatası - IC length uyumsuz!");
        } else {
            console.log(`   ⚠️ Hata (normal olabilir): ${e.message.slice(0, 100)}`);
        }
    }

    console.log("\n" + "═".repeat(50));
    console.log("Test tamamlandı!");
}

main().catch(console.error);
