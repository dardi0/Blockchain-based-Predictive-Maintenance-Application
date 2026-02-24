/**
 * Yeni ZK Devre Doğrulama Anahtarları Yükleme Script'i
 *
 * CircuitType enum (UnifiedGroth16Verifier.sol):
 *   4 = FAULT_RECORD
 *   5 = TRAINING_RECORD
 *   6 = REPORT_RECORD
 *
 * Bu script:
 *   1. temp/zk_proofs/*.zkey dosyalarından VK'ları dışa aktarır (snarkjs)
 *   2. Her VK'yı UnifiedGroth16Verifier.setCircuitVerifyingKey() ile on-chain yükler
 *
 * Çalıştırma:
 *   npx hardhat run scripts/setup_new_circuit_vks.js --network zkSyncSepolia
 *
 * ÖNEMİ: Kontrat derleme + deploy SONRASI çalıştırın.
 */

require('dotenv').config();
const { Wallet, Provider } = require('zksync-ethers');
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// CircuitType enum değerleri
const CircuitType = {
    FAULT_RECORD:     4,
    TRAINING_RECORD:  5,
    REPORT_RECORD:    6,
};

// Devreye karşılık gelen zkey dosyaları
const CIRCUIT_ZKEYS = {
    [CircuitType.FAULT_RECORD]:    'fault_record_proof.zkey',
    [CircuitType.TRAINING_RECORD]: 'training_record_proof.zkey',
    [CircuitType.REPORT_RECORD]:   'report_record_proof.zkey',
};

const TEMP_DIR = path.resolve(__dirname, '../temp/zk_proofs');

// ----------------------------------------------------------------
// snarkjs ile zkey → verification_key.json çıktısı al
// ----------------------------------------------------------------
function exportVkFromZkey(zkeyPath, vkOutputPath) {
    const cmd = `npx snarkjs zkey export verificationkey "${zkeyPath}" "${vkOutputPath}"`;
    console.log(`   ⚙️  ${cmd}`);
    execSync(cmd, { stdio: 'pipe' });
}

// ----------------------------------------------------------------
// snarkjs VK JSON'unu setCircuitVerifyingKey parametrelerine dönüştür
// ----------------------------------------------------------------
function parseVkForContract(vkJson) {
    const vk = JSON.parse(fs.readFileSync(vkJson, 'utf8'));

    // G1Point struct: { X: uint256, Y: uint256 }
    const toG1 = (p) => ({ X: p[0], Y: p[1] });

    // G2Point struct: { X: uint256[2], Y: uint256[2] }
    // snarkjs formatı: [[x0,x1],[y0,y1],[1,0]]
    const toG2 = (pts) => ({ X: pts[0], Y: pts[1] });

    const alpha = toG1(vk.vk_alpha_1);
    const beta  = toG2(vk.vk_beta_2);
    const gamma = toG2(vk.vk_gamma_2);
    const delta = toG2(vk.vk_delta_2);

    // IC: G1Point array
    const ic = vk.IC.map(p => toG1(p));

    return { alpha, beta, gamma, delta, ic };
}

// ----------------------------------------------------------------
// Ana fonksiyon
// ----------------------------------------------------------------
async function main() {
    const rpcUrl = process.env.ZKSYNC_ERA_RPC_URL;
    const ownerPk = process.env.CONTRACT_OWNER_PRIVATE_KEY || process.env.PRIVATE_KEY;

    if (!rpcUrl || !ownerPk) {
        throw new Error('ZKSYNC_ERA_RPC_URL ve CONTRACT_OWNER_PRIVATE_KEY gerekli');
    }

    const provider = new Provider(rpcUrl);
    const wallet   = new Wallet(ownerPk, provider);

    console.log(`\n👤 Deployer: ${wallet.address}`);

    // Deployment bilgilerini yükle
    const deployInfoPath = path.resolve(__dirname, '../deployment_info_hybrid_ZKSYNC_ERA.json');
    if (!fs.existsSync(deployInfoPath)) {
        throw new Error(`deployment_info_hybrid_ZKSYNC_ERA.json bulunamadı`);
    }
    const deployInfo = JSON.parse(fs.readFileSync(deployInfoPath, 'utf8'));
    const verifierAddress = deployInfo.contracts?.UnifiedGroth16Verifier?.address;
    if (!verifierAddress) {
        throw new Error('UnifiedGroth16Verifier adresi deployment_info içinde bulunamadı');
    }
    console.log(`🔍 UnifiedGroth16Verifier: ${verifierAddress}`);

    // Verifier ABI — compiled artifact'tan yükle (struct selector'lar için kritik)
    const artifactPath = path.resolve(__dirname, '../artifacts-zk/contracts/UnifiedGroth16Verifier.sol/UnifiedGroth16Verifier.json');
    if (!fs.existsSync(artifactPath)) {
        throw new Error(`UnifiedGroth16Verifier artifact bulunamadı: ${artifactPath}`);
    }
    const verifierAbi = JSON.parse(fs.readFileSync(artifactPath, 'utf8')).abi;
    const verifier = new ethers.Contract(verifierAddress, verifierAbi, wallet);

    console.log('\n' + '─'.repeat(60));

    for (const [circuitTypeStr, zkeyFile] of Object.entries(CIRCUIT_ZKEYS)) {
        const circuitType = parseInt(circuitTypeStr);
        const circuitName = Object.keys(CircuitType).find(k => CircuitType[k] === circuitType);
        const zkeyPath    = path.join(TEMP_DIR, zkeyFile);
        const vkOutPath   = path.join(TEMP_DIR, `${circuitName.toLowerCase()}_vk.json`);

        console.log(`\n🔐 ${circuitName} (CircuitType=${circuitType})`);

        if (!fs.existsSync(zkeyPath)) {
            console.log(`   ⏭️  ${zkeyFile} bulunamadı — atlanıyor`);
            console.log(`      ZK devre trusted setup'ı çalıştırın, ardından bu script'i tekrar çalıştırın.`);
            continue;
        }

        // VK dışa aktar
        try {
            console.log(`   📤 VK dışa aktarılıyor: ${zkeyFile} → ${path.basename(vkOutPath)}`);
            exportVkFromZkey(zkeyPath, vkOutPath);
        } catch (exportErr) {
            console.error(`   ❌ VK dışa aktarma hatası: ${exportErr.message}`);
            continue;
        }

        // VK parse et
        let vkParams;
        try {
            vkParams = parseVkForContract(vkOutPath);
            console.log(`   ✅ VK parse edildi. IC uzunluğu: ${vkParams.ic.length}`);
        } catch (parseErr) {
            console.error(`   ❌ VK parse hatası: ${parseErr.message}`);
            continue;
        }

        // On-chain yükle
        try {
            console.log(`   ⛓️  setCircuitVerifyingKey çağrılıyor...`);
            const tx = await verifier.setCircuitVerifyingKey(
                circuitType,
                vkParams.alpha,
                vkParams.beta,
                vkParams.gamma,
                vkParams.delta,
                vkParams.ic,
                { gasLimit: 5_000_000 }
            );
            const receipt = await tx.wait();
            if (receipt.status === 1) {
                console.log(`   ✅ ${circuitName} VK on-chain yüklendi! TX: ${receipt.hash}`);
            } else {
                console.log(`   ❌ TX başarısız. Hash: ${receipt.hash}`);
            }
        } catch (txErr) {
            if (txErr.message.includes('already set') || txErr.message.includes('VK already')) {
                console.log(`   ⚠️  VK zaten yüklü, atlanıyor.`);
            } else {
                console.error(`   ❌ TX hatası: ${txErr.message}`);
            }
        }
    }

    console.log('\n' + '─'.repeat(60));
    console.log('✅ VK yükleme tamamlandı.');
}

main().catch(console.error);
