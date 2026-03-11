/**
 * BATCH_SENSOR (CircuitType=7) VK kurulum / güncelleme scripti
 *
 * Tek kaynak: temp/zk_proofs/batch_sensor_proof.zkey
 * Her zaman zkey'den taze VK export eder — ayrı bir vk.json dosyasına bağımlılık yok.
 *
 * Davranış:
 *   - setCircuitVerifyingKey ile VK'yi anında set eder veya günceller (timelock yok).
 *
 * Çalıştırma:
 *   node scripts/setup_batch_vk.js
 */

require('dotenv').config();
const { ethers } = require('ethers');
const { Provider, Wallet, utils } = require('zksync-ethers');
const { execFileSync } = require('child_process');
const fs   = require('fs');
const path = require('path');

const CIRCUIT_TYPE_BATCH_SENSOR = 7;
const TEMP_DIR   = path.resolve(__dirname, '../temp/zk_proofs');
const ZKEY_PATH  = path.join(TEMP_DIR, 'batch_sensor_proof.zkey');
// Python ile aynı isimlendirme: circuit_name.replace('_proof','') + '_verification_key.json'
const VK_PATH    = path.join(TEMP_DIR, 'batch_sensor_verification_key.json');
const MARKER_PATH = path.join(TEMP_DIR, 'batch_sensor_proof.vk_mtime');

const DEPLOY_INFO_PATH = path.resolve(__dirname, '../deployment_info_hybrid_ZKSYNC_ERA.json');
const ARTIFACT_PATH    = path.resolve(
    __dirname,
    '../artifacts-zk/contracts/UnifiedGroth16Verifier.sol/UnifiedGroth16Verifier.json'
);

/** snarkjs çalıştırılabilir dosyasını bul */
function findSnarkjs() {
    const candidates = [
        path.resolve(__dirname, '../node_modules/.bin/snarkjs'),
        path.resolve(__dirname, '../node_modules/.bin/snarkjs.cmd'),
        'snarkjs',
    ];
    for (const c of candidates) {
        try { execFileSync(c, ['--version'], { stdio: 'pipe' }); return c; }
        catch (_) { /* dene */ }
    }
    throw new Error('snarkjs bulunamadı. npm install çalıştırın veya PATH\'e ekleyin.');
}

/** zkey → verification_key.json export */
function exportVkFromZkey() {
    if (!fs.existsSync(ZKEY_PATH)) {
        throw new Error(
            `Zkey bulunamadı: ${ZKEY_PATH}\n` +
            'Önce API\'yi başlatarak batch proof üretin (zkey ilk proof\'ta oluşur).'
        );
    }

    console.log('Zkey\'den VK export ediliyor...');
    console.log(`  Kaynak : ${ZKEY_PATH}`);
    console.log(`  Hedef  : ${VK_PATH}`);

    const snarkjs = findSnarkjs();
    execFileSync(snarkjs, ['zkey', 'export', 'verificationkey', ZKEY_PATH, VK_PATH], {
        stdio: 'pipe',
    });

    console.log('VK export edildi.');
}

/** vk.json → sözleşme parametrelerine dönüştür */
function parseVkForContract() {
    const vk = JSON.parse(fs.readFileSync(VK_PATH, 'utf8'));
    const toG1 = (p) => ({ X: BigInt(p[0]), Y: BigInt(p[1]) });
    // G2 koordinatları snarkjs formatında: [[x_re, x_im], [y_re, y_im]]
    // _baseVerify sözleşme içinde swap yapıyor — burada olduğu gibi geçilir (swap=false)
    const toG2 = (pts) => ({ X: [BigInt(pts[0][0]), BigInt(pts[0][1])],
                              Y: [BigInt(pts[1][0]), BigInt(pts[1][1])] });
    return {
        alpha: toG1(vk.vk_alpha_1),
        beta:  toG2(vk.vk_beta_2),
        gamma: toG2(vk.vk_gamma_2),
        delta: toG2(vk.vk_delta_2),
        ic:    vk.IC.map(p => toG1(p)),
    };
}

/** Başarılı yüklemeden sonra Python ile uyumlu marker dosyası yaz */
function writeMarker() {
    const mtime = fs.statSync(ZKEY_PATH).mtimeMs / 1000;
    fs.writeFileSync(MARKER_PATH, String(mtime), 'utf8');
    console.log(`Marker yazıldı: ${MARKER_PATH}`);
}

async function main() {
    const rpcUrl  = process.env.ZKSYNC_ERA_RPC_URL;
    const ownerPk = process.env.CONTRACT_OWNER_PRIVATE_KEY
                 || process.env.PRIVATE_KEY
                 || process.env.MANAGER_PRIVATE_KEY;

    if (!rpcUrl || !ownerPk) {
        throw new Error('ZKSYNC_ERA_RPC_URL ve CONTRACT_OWNER_PRIVATE_KEY .env\'de gerekli');
    }

    const provider = new Provider(rpcUrl);
    const wallet   = new Wallet(ownerPk, provider);
    const gasPrice = await provider.getGasPrice();
    console.log(`\nWallet: ${wallet.address}`);

    const deployInfo      = JSON.parse(fs.readFileSync(DEPLOY_INFO_PATH, 'utf8'));
    const verifierAddress = deployInfo.contracts?.UnifiedGroth16Verifier?.address;
    if (!verifierAddress) throw new Error('UnifiedGroth16Verifier adresi deployment_info\'da bulunamadı');
    console.log(`UnifiedGroth16Verifier: ${verifierAddress}`);

    const verifierAbi = JSON.parse(fs.readFileSync(ARTIFACT_PATH, 'utf8')).abi;
    const verifier    = new ethers.Contract(verifierAddress, verifierAbi, wallet);

    // --- Adım 1: Zkey'den taze VK export et ---
    exportVkFromZkey();
    const vk = parseVkForContract();
    console.log(`IC uzunluğu: ${vk.ic.length} (beklenen: 3)`);

    // --- Adım 2: setCircuitVerifyingKey ile VK'yi anında set et / güncelle ---
    const existing = await verifier.circuitKeys(CIRCUIT_TYPE_BATCH_SENSOR);
    const isSet    = existing && existing.isSet;
    console.log(`\nOn-chain VK durumu: ${isSet ? 'SET (güncelleniyor)' : 'BOŞ (ilk yükleme)'}`);

    console.log('\nsetCircuitVerifyingKey TX gönderiliyor...');
    const tx = await verifier.setCircuitVerifyingKey(
        CIRCUIT_TYPE_BATCH_SENSOR,
        vk.alpha, vk.beta, vk.gamma, vk.delta, vk.ic,
        { gasLimit: 5_000_000, gasPrice, customData: { gasPerPubdata: utils.DEFAULT_GAS_PER_PUBDATA_LIMIT } }
    );
    console.log(`TX: ${tx.hash}`);
    const receipt = await tx.wait();
    if (receipt.status !== 1) {
        console.error(`TX başarısız: ${receipt.hash}`);
        process.exit(1);
    }
    console.log(`\nBATCH_SENSOR VK on-chain ${isSet ? 'güncellendi' : 'yüklendi'} (block ${receipt.blockNumber})`);
    console.log('Batch proof\'lar artık doğrulanacak.');
    writeMarker();
}

main().catch(e => { console.error('HATA:', e.message); process.exit(1); });
