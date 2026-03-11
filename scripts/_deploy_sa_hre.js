/**
 * _deploy_sa_hre.js — SessionKeyAccount deploy via Hardhat Deployer (AA için doğru yol)
 * Çalıştırma: npx hardhat run scripts/_deploy_sa_hre.js --network zkSyncSepolia
 */
require('dotenv').config();
const { Deployer } = require('@matterlabs/hardhat-zksync-deploy');
const { Wallet, Provider, utils } = require('zksync-ethers');
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

const hre = require('hardhat');

const DEPLOY_INFO_PATH = path.resolve(__dirname, '../deployment_info_hybrid_ZKSYNC_ERA.json');
const ENV_PATH = path.resolve(__dirname, '../.env');

function updateEnv(key, value) {
    let content = fs.readFileSync(ENV_PATH, 'utf8');
    const re = new RegExp(`^${key}=.*`, 'm');
    if (re.test(content)) {
        content = content.replace(re, `${key}=${value}`);
    } else {
        content += `\n${key}=${value}`;
    }
    fs.writeFileSync(ENV_PATH, content);
}

async function deployForRole(rolePK, roleLabel) {
    if (!rolePK) {
        console.log(`⚠️  ${roleLabel}_PRIVATE_KEY tanımlı değil — atlanıyor.`);
        return null;
    }

    const provider = new Provider(process.env.ZKSYNC_ERA_RPC_URL);
    const wallet = new Wallet(rolePK, provider);
    console.log(`\n🔧 ${roleLabel} SA — deployer+owner: ${wallet.address}`);
    console.log(`   Bakiye: ${ethers.formatEther(await wallet.getBalance())} ETH`);

    const deployer = new Deployer(hre, wallet);
    const artifact = await deployer.loadArtifact('SessionKeyAccount');

    const salt = ethers.zeroPadValue(wallet.address, 32);
    const bytecodeHash = utils.hashBytecode(artifact.bytecode);
    const constructorInput = new ethers.AbiCoder().encode(['address'], [wallet.address]);
    const expectedAddr = utils.create2Address(wallet.address, bytecodeHash, salt, constructorInput);
    console.log(`   Beklenen adres: ${expectedAddr}`);

    // Zaten deploy edilmiş mi?
    const code = await provider.getCode(expectedAddr);
    if (code && code !== '0x') {
        console.log(`   ✅ Zaten deploy edilmiş — atlanıyor.`);
        return expectedAddr;
    }

    console.log(`   ⛓️  Deploy ediliyor (Hardhat Deployer)...`);
    const contract = await deployer.deploy(
        artifact,
        [wallet.address],        // constructor: _owner = rolün kendi adresi
        'create2Account',
        { customData: { salt } }
    );

    const deployedAddr = await contract.getAddress();
    console.log(`   ✅ Deploy edildi: ${deployedAddr}`);
    return deployedAddr;
}

async function main() {
    const results = {};

    results.engineer = await deployForRole(process.env.ENGINEER_PRIVATE_KEY, 'ENGINEER');
    results.operator = await deployForRole(process.env.OPERATOR_PRIVATE_KEY, 'OPERATOR');

    // deployment_info güncelle
    const info = JSON.parse(fs.readFileSync(DEPLOY_INFO_PATH, 'utf8'));
    if (!info.smartAccounts) info.smartAccounts = {};
    if (results.engineer) info.smartAccounts.engineer = results.engineer;
    if (results.operator) info.smartAccounts.operator = results.operator;
    fs.writeFileSync(DEPLOY_INFO_PATH, JSON.stringify(info, null, 2));

    if (results.engineer) updateEnv('ENGINEER_SMART_ACCOUNT', results.engineer);
    if (results.operator) updateEnv('OPERATOR_SMART_ACCOUNT', results.operator);

    console.log('\n─────────────────────────────────────────────────');
    console.log('📋 Sonuç:');
    console.log(`   ENGINEER_SMART_ACCOUNT = ${results.engineer || '(başarısız)'}`);
    console.log(`   OPERATOR_SMART_ACCOUNT = ${results.operator || '(başarısız)'}`);
}

main().catch(e => { console.error(e); process.exit(1); });
