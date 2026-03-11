/**
 * Smart Account Deploy — SessionKeyAccount'ları doğrudan zk.ContractFactory ile deploy eder.
 *
 * Factory contract üzerinden deploy etmek yerine, zksync-ethers ContractFactory'yi
 * 'create2Account' deployment type ile kullanır — bu DEPLOYER_SYSTEM_CONTRACT'a
 * direkt TX gönderir ve çok daha güvenilir çalışır.
 *
 * Çalıştırma:
 *   node scripts/deploy_smart_accounts.js
 */

require('dotenv').config();
const { Wallet, Provider, utils, ContractFactory } = require('zksync-ethers');
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

const DEPLOY_INFO_PATH = path.resolve(__dirname, '../deployment_info_hybrid_ZKSYNC_ERA.json');
const ENV_PATH         = path.resolve(__dirname, '../.env');
const ARTIFACT_PATH    = path.resolve(__dirname, '../artifacts-zk/contracts/SessionKeyAccount.sol/SessionKeyAccount.json');

const RPC_URL     = process.env.ZKSYNC_ERA_RPC_URL;
const OWNER_PK    = process.env.CONTRACT_OWNER_PRIVATE_KEY || process.env.PRIVATE_KEY;
const ENGINEER_PK = process.env.ENGINEER_PRIVATE_KEY;
const OPERATOR_PK = process.env.OPERATOR_PRIVATE_KEY;

function addrOf(pk) {
    if (!pk) return null;
    try { return new ethers.Wallet(pk).address; } catch { return null; }
}

function updateEnv(key, value) {
    if (!fs.existsSync(ENV_PATH)) return;
    let content = fs.readFileSync(ENV_PATH, 'utf8');
    const re = new RegExp(`^${key}=.*`, 'm');
    if (re.test(content)) {
        content = content.replace(re, `${key}=${value}`);
    } else {
        content += `\n${key}=${value}`;
    }
    fs.writeFileSync(ENV_PATH, content);
}

/**
 * SessionKeyAccount'ı doğrudan ContractFactory ile deploy eder.
 * Factory contract yerine DEPLOYER_SYSTEM_CONTRACT'a direkt TX gönderilir.
 *
 * @param {Wallet} deployerWallet  - TX'i imzalayan ve gönderen cüzdan (owner)
 * @param {string} ownerAddress    - SessionKeyAccount'ın sahibi (engineer/operator adresi)
 * @param {object} artifact        - artifacts-zk/SessionKeyAccount.json
 * @param {string} roleLabel       - Loglama için etiket (ENGINEER/OPERATOR)
 * @returns {string} Deploy edilen SA adresi
 */
async function deploySessionKeyAccount(deployerWallet, ownerAddress, artifact, roleLabel) {
    // Deterministik salt: owner adresini bytes32'ye pad ediyoruz
    const salt = ethers.zeroPadValue(ownerAddress, 32);

    // ContractFactory ile 'create2Account' deployment type
    // Bu, DEPLOYER_SYSTEM_CONTRACT.create2Account'ı doğrudan çağırır
    const cf = new ContractFactory(artifact.abi, artifact.bytecode, deployerWallet, 'create2Account');

    // Deterministik adres hesaplama: utils.create2Address kullanır
    // provider.call() simülasyonu yerine — yeni bytecodeHash için simülasyon
    // factoryDeps kaydı olmadan reverts, bu yüzden matematiksel hesaplama tercih edilir.
    const bytecodeHash = utils.hashBytecode(artifact.bytecode);
    const constructorInput = new ethers.AbiCoder().encode(['address'], [ownerAddress]);
    const expectedAddr = utils.create2Address(
        deployerWallet.address,
        bytecodeHash,
        salt,
        constructorInput,
    );
    console.log(`   ${roleLabel} SA beklenen adres: ${expectedAddr}`);

    // Zaten deploy edilmiş mi?
    const provider = deployerWallet.provider;
    const code = await provider.getCode(expectedAddr);
    if (code && code !== '0x') {
        console.log(`   ✅ ${roleLabel} SA zaten deploy edilmiş — atlanıyor.`);
        return expectedAddr;
    }

    // Deploy et — factoryDeps açıkça eklenmezse ContractDeployer bytecode'u tanımaz
    console.log(`   ⛓️  ${roleLabel} SessionKeyAccount deploy ediliyor...`);
    const contract = await cf.deploy(ownerAddress, {
        customData: {
            salt:          salt,
            gasPerPubdata: utils.DEFAULT_GAS_PER_PUBDATA_LIMIT,
            factoryDeps:   [artifact.bytecode],
        },
        gasLimit: 5_000_000,
    });

    const deployedAddr = await contract.getAddress();
    console.log(`   TX gönderildi, bekleniyor...`);
    await contract.deploymentTransaction().wait();

    console.log(`   ✅ ${roleLabel} Smart Account deploy edildi: ${deployedAddr}`);
    return deployedAddr;
}

async function main() {
    if (!RPC_URL || !OWNER_PK) throw new Error('ZKSYNC_ERA_RPC_URL ve CONTRACT_OWNER_PRIVATE_KEY gerekli');

    if (!fs.existsSync(ARTIFACT_PATH)) {
        throw new Error(`SessionKeyAccount artifact bulunamadı: ${ARTIFACT_PATH}\nÖnce 'npm run compile' çalıştırın.`);
    }
    const artifact = JSON.parse(fs.readFileSync(ARTIFACT_PATH, 'utf8'));

    const provider    = new Provider(RPC_URL);
    const ownerWallet = new Wallet(OWNER_PK, provider);
    console.log(`\n👤 Owner deployer: ${ownerWallet.address}`);
    console.log(`   Bakiye: ${ethers.formatEther(await ownerWallet.getBalance())} ETH`);
    // AA deploy'unda validateTransaction çağrılır ve SA'nın owner'ı ile imzacı eşleşmeli.
    // Bu yüzden her SA'yı kendi cüzdanı (ENGINEER/OPERATOR PK) ile deploy ediyoruz.
    console.log('─────────────────────────────────────────────────');

    const results = {};

    // Engineer SA — ENGINEER kendi SA'sını deploy eder (imzacı == owner)
    if (ENGINEER_PK) {
        const engineerWallet = new Wallet(ENGINEER_PK, provider);
        const engineerAddr   = engineerWallet.address;
        console.log(`\n🔧 ENGINEER SA — deployer+owner: ${engineerAddr}`);
        console.log(`   Bakiye: ${ethers.formatEther(await engineerWallet.getBalance())} ETH`);
        try {
            results.engineer = await deploySessionKeyAccount(engineerWallet, engineerAddr, artifact, 'ENGINEER');
        } catch (e) {
            console.error(`❌ ENGINEER SA deploy hatası: ${e.message?.split('\n')[0]}`);
            if (e.data) console.error('   Revert data:', e.data);
            results.engineer = null;
        }
    } else {
        console.log('⚠️  ENGINEER_PRIVATE_KEY tanımlı değil — atlanıyor.');
        results.engineer = null;
    }

    // Operator SA — OPERATOR kendi SA'sını deploy eder (imzacı == owner)
    if (OPERATOR_PK) {
        const operatorWallet = new Wallet(OPERATOR_PK, provider);
        const operatorAddr   = operatorWallet.address;
        console.log(`\n🔧 OPERATOR SA — deployer+owner: ${operatorAddr}`);
        console.log(`   Bakiye: ${ethers.formatEther(await operatorWallet.getBalance())} ETH`);
        try {
            results.operator = await deploySessionKeyAccount(operatorWallet, operatorAddr, artifact, 'OPERATOR');
        } catch (e) {
            console.error(`❌ OPERATOR SA deploy hatası: ${e.message?.split('\n')[0]}`);
            if (e.data) console.error('   Revert data:', e.data);
            results.operator = null;
        }
    } else {
        console.log('⚠️  OPERATOR_PRIVATE_KEY tanımlı değil — atlanıyor.');
        results.operator = null;
    }

    // deployment_info güncelle
    const deployInfo = JSON.parse(fs.readFileSync(DEPLOY_INFO_PATH, 'utf8'));
    if (!deployInfo.smartAccounts) deployInfo.smartAccounts = {};
    deployInfo.smartAccounts.engineer = results.engineer;
    deployInfo.smartAccounts.operator = results.operator;
    fs.writeFileSync(DEPLOY_INFO_PATH, JSON.stringify(deployInfo, null, 2));
    console.log('\n✅ deployment_info_hybrid_ZKSYNC_ERA.json güncellendi.');

    // .env güncelle
    if (results.engineer) updateEnv('ENGINEER_SMART_ACCOUNT', results.engineer);
    if (results.operator) updateEnv('OPERATOR_SMART_ACCOUNT', results.operator);
    console.log('✅ .env güncellendi.');

    console.log('\n─────────────────────────────────────────────────');
    console.log('📋 Sonuç:');
    console.log(`   ENGINEER_SMART_ACCOUNT = ${results.engineer || '(başarısız)'}`);
    console.log(`   OPERATOR_SMART_ACCOUNT = ${results.operator || '(başarısız)'}`);
    console.log('\n➡️  API yeniden başlatılmalı (SESSION_KEY_SETUP yeni adresleri okur).\n');
}

main().catch(e => { console.error(e); process.exit(1); });
