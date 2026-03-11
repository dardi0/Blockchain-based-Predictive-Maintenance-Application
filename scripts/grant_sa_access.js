/**
 * Smart Account Erişim Verme Scripti
 *
 * SA'nın kendi adına AccessControlRegistry.registerNode() çağırması gerekiyor çünkü
 * checkAccess(caller) → addressToNodes[caller] bakıyor; SA kendi node'unu kaydetmeli.
 *
 * Çözüm: ECDSASmartAccount (zksync-ethers) ile SA adına type-113 TX gönder.
 * Engineer/Operator private key → SA owner → SA'nın registerNode TX'ini imzalar.
 *
 * Ardından owner, grantEmergencyAccess ile node'a resource erişimi verir.
 *
 * Çalıştırma: node scripts/grant_sa_access.js
 */

require('dotenv').config();
const { ethers } = require('ethers');
const { Provider, Wallet, ECDSASmartAccount } = require('zksync-ethers');
const fs = require('fs');
const path = require('path');

async function main() {
    const provider = new Provider(process.env.ZKSYNC_ERA_RPC_URL);
    const ownerWallet = new Wallet(process.env.CONTRACT_OWNER_PRIVATE_KEY || process.env.PRIVATE_KEY, provider);

    const acAddr  = process.env.ACCESS_CONTROL_ADDRESS;
    const pdmAddr = process.env.PDM_SYSTEM_ADDRESS;
    const engineerSA = process.env.ENGINEER_SMART_ACCOUNT;
    const operatorSA = process.env.OPERATOR_SMART_ACCOUNT;

    console.log('Owner:      ', ownerWallet.address);
    console.log('EngineerSA: ', engineerSA);
    console.log('OperatorSA: ', operatorSA);

    const acArt  = JSON.parse(fs.readFileSync(path.resolve('./artifacts-zk/contracts/AccessControlRegistry.sol/AccessControlRegistry.json'), 'utf8'));
    const pdmArt = JSON.parse(fs.readFileSync(path.resolve('./artifacts-zk/contracts/PdMSystemHybrid.sol/PdMSystemHybrid.json'), 'utf8'));

    // ECDSASmartAccount.create: SA adresinden TX gönderir, engineer/operator key ile imzalar
    const engineerSAAccount = ECDSASmartAccount.create(engineerSA, process.env.ENGINEER_PRIVATE_KEY, provider);
    const operatorSAAccount  = ECDSASmartAccount.create(operatorSA, process.env.OPERATOR_PRIVATE_KEY, provider);

    const acAsOwner   = new ethers.Contract(acAddr, acArt.abi, ownerWallet);
    const acAsEngSA   = new ethers.Contract(acAddr, acArt.abi, engineerSAAccount);
    const acAsOpSA    = new ethers.Contract(acAddr, acArt.abi, operatorSAAccount);
    const pdm = new ethers.Contract(pdmAddr, pdmArt.abi, provider);

    const FAILURE_ANALYZER = ethers.encodeBytes32String('FAILURE_ANALYZER');
    const DATA_PROCESSOR   = ethers.encodeBytes32String('DATA_PROCESSOR');
    const WRITE_LIMITED = 2;

    const sensorResource = await pdm.SENSOR_DATA_RESOURCE();
    const predResource   = await pdm.PREDICTION_RESOURCE();
    const faultResource  = await pdm.FAULT_RECORD_RESOURCE();
    const trainResource  = await pdm.TRAINING_RESOURCE();
    const reportResource = await pdm.REPORT_RESOURCE();

    /**
     * SA adına registerNode çağırır (type-113 AA TX),
     * ardından owner olarak grantEmergencyAccess ile resource erişimi verir.
     */
    // ABI interface for event parsing
    const acInterface = new ethers.Interface(acArt.abi);

    async function registerAndGrant(saAccount, ownerContract, saAddr, label, groupId, resources) {
        // SA'nın zaten kayıtlı node'u var mı?
        const existing = await ownerContract.getNodesByAddress(saAddr);
        let nodeId;

        if (existing && existing.length > 0) {
            nodeId = existing[0];
            console.log('  ' + label + ' SA already registered, nodeId: ' + nodeId.slice(0, 18) + '...');
        } else {
            console.log('  Registering ' + label + ' SA node via ECDSASmartAccount TX...');
            // SA kendi adına registerNode çağırıyor (type-113 AA TX)
            // ECDSASmartAccount.sendTransaction() ile direkt TX gönder
            const calldata = acInterface.encodeFunctionData('registerNode', [
                label + ' Smart Account',
                saAddr,
                groupId,
                WRITE_LIMITED,
                0,
                JSON.stringify({ registeredBy: 'grant_sa_access', ts: Date.now() }),
            ]);
            try {
                const txResponse = await saAccount.sendTransaction({
                    to: acAddr,
                    data: calldata,
                    gasLimit: BigInt(1000000),
                });
                const receipt = await txResponse.wait();

                nodeId = null;
                for (const log of receipt.logs) {
                    try {
                        const parsed = acInterface.parseLog(log);
                        if (parsed && parsed.name === 'NodeRegistered') {
                            nodeId = parsed.args.nodeId;
                            break;
                        }
                    } catch (_) { /* skip */ }
                }

                if (nodeId) {
                    console.log('  Registered! nodeId: ' + nodeId.slice(0, 18) + '...');
                } else {
                    // Event bulunamadıysa getNodesByAddress ile dene
                    const byAddr = await ownerContract.getNodesByAddress(saAddr);
                    if (byAddr && byAddr.length > 0) {
                        nodeId = byAddr[0];
                        console.log('  Found nodeId via getNodesByAddress: ' + nodeId.slice(0, 18) + '...');
                    } else {
                        console.log('  ERROR: Could not determine nodeId after registration.');
                        return;
                    }
                }
            } catch (e) {
                if (e.message.includes('already registered')) {
                    const byAddr = await ownerContract.getNodesByAddress(saAddr);
                    if (byAddr && byAddr.length > 0) {
                        nodeId = byAddr[0];
                        console.log('  Already registered, nodeId: ' + nodeId.slice(0, 18) + '...');
                    } else {
                        console.log('  ERROR: Could not find nodeId after duplicate error.');
                        return;
                    }
                } else {
                    console.log('  registerNode error: ' + e.message.slice(0, 200));
                    return;
                }
            }
        }

        // Owner olarak her resource için erişim ver
        for (const entry of resources) {
            const rname = entry[0];
            const rid   = entry[1];
            try {
                const result = await ownerContract.checkAccess(saAddr, rid, WRITE_LIMITED);
                const hasAccess = result[0];
                if (hasAccess) {
                    console.log('  ' + rname + ': already granted');
                    continue;
                }
                const tx = await ownerContract.grantEmergencyAccess(
                    nodeId, rid, 'SA access for ' + label, { gasLimit: 500000 }
                );
                await tx.wait();
                console.log('  ' + rname + ': GRANTED');
            } catch (e) {
                console.log('  ' + rname + ': ERROR ' + e.message.slice(0, 80));
            }
        }
    }

    console.log('\n=== ENGINEER SA Access Grant ===');
    await registerAndGrant(engineerSAAccount, acAsOwner, engineerSA, 'ENGINEER', FAILURE_ANALYZER, [
        ['SENSOR_DATA',  sensorResource],
        ['PREDICTION',   predResource],
        ['FAULT_RECORD', faultResource],
        ['TRAINING',     trainResource],
        ['REPORT',       reportResource],
    ]);

    console.log('\n=== OPERATOR SA Access Grant ===');
    await registerAndGrant(operatorSAAccount, acAsOwner, operatorSA, 'OPERATOR', DATA_PROCESSOR, [
        ['SENSOR_DATA',  sensorResource],
        ['FAULT_RECORD', faultResource],
    ]);

    console.log('\nAll done!');
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
