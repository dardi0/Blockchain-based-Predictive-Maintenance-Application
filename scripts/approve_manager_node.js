/**
 * Pending Manager node'larını onaylar.
 * Deployer (SUPER_ADMIN) ile çalıştırılır.
 * Multi-sig threshold > 1 ise, eğer MANAGER_PRIVATE_KEY varsa ikinci onayı da gerçekleştirir.
 *
 * Çalıştırma:
 *   npx hardhat run scripts/approve_manager_node.js --network zkSyncSepolia
 */
require('dotenv').config();
const { Wallet, Provider } = require('zksync-ethers');
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

async function main() {
    const rpcUrl = process.env.ZKSYNC_ERA_RPC_URL;
    const ownerPk = process.env.CONTRACT_OWNER_PRIVATE_KEY || process.env.PRIVATE_KEY;

    if (!rpcUrl || !ownerPk) throw new Error('ZKSYNC_ERA_RPC_URL ve CONTRACT_OWNER_PRIVATE_KEY gerekli');

    const provider = new Provider(rpcUrl);
    const wallet   = new Wallet(ownerPk, provider);
    console.log(`\n👤 Deployer: ${wallet.address}`);

    const deployInfo = JSON.parse(
        fs.readFileSync(path.resolve(__dirname, '../deployment_info_hybrid_ZKSYNC_ERA.json'), 'utf8')
    );
    const accessAddress = deployInfo.contracts?.AccessControlRegistry?.address;
    console.log(`🔐 AccessControlRegistry: ${accessAddress}`);

    const abi = [
        'function getPendingManagerApprovals() view returns (bytes32[])',
        'function approveManagerNode(bytes32 nodeId)',
        'function multiSigThreshold() view returns (uint256)',
        'function confirmMultiSigOperation(bytes32 opId)',
        'event MultiSigOperationInitiated(bytes32 indexed opId, bytes32 opType, bytes32 indexed nodeId, address indexed initiator)'
    ];
    const access = new ethers.Contract(accessAddress, abi, wallet);

    const threshold = await access.multiSigThreshold();
    console.log(`\n⚙️ Multi-Sig Threshold: ${threshold}`);

    const managerPk = process.env.MANAGER_PRIVATE_KEY;
    let managerWallet = null;
    let accessWithManager = null;
    if (threshold > 1 && managerPk) {
        managerWallet = new Wallet(managerPk, provider);
        console.log(`👤 Manager (İkinci Onaycı): ${managerWallet.address}`);
        accessWithManager = new ethers.Contract(accessAddress, abi, managerWallet);
    } else if (threshold > 1) {
        console.log(`⚠️ Uyarı: Threshold ${threshold} ama MANAGER_PRIVATE_KEY bulunamadı. İşlemler "bekliyor" (pending) kalacaktır.`);
    }

    const pending = await access.getPendingManagerApprovals();
    console.log(`\n📋 Bekleyen Manager node sayısı: ${pending.length}`);

    if (pending.length === 0) {
        console.log('✅ Onay bekleyen manager node yok.');
        return;
    }

    for (const nodeId of pending) {
        console.log(`\n➡️  NodeId: ${nodeId}`);
        try {
            const tx = await access.approveManagerNode(nodeId, { gasLimit: 1_000_000 });
            const receipt = await tx.wait();
            
            if (receipt.status === 1) {
                if (threshold <= 1) {
                    console.log(`   ✅ Manager node onaylandı! TX: ${receipt.hash}`);
                } else {
                    console.log(`   🟡 Multi-sig onay işlemi başlatıldı. TX: ${receipt.hash}`);
                    
                    // Parse logs to find opId
                    const iface = new ethers.Interface(abi);
                    let opId = null;
                    for (const log of receipt.logs) {
                        try {
                            const parsed = iface.parseLog(log);
                            if (parsed && parsed.name === 'MultiSigOperationInitiated') {
                                opId = parsed.args.opId;
                                break;
                            }
                        } catch (e) {
                            // ignore irrelevant logs
                        }
                    }

                    if (opId && managerWallet) {
                        console.log(`   ⏳ İkinci onaycı işlemi doğruluyor... (opId: ${opId})`);
                        try {
                            const tx2 = await accessWithManager.confirmMultiSigOperation(opId, { gasLimit: 1_000_000 });
                            const receipt2 = await tx2.wait();
                            if (receipt2.status === 1) {
                                console.log(`   ✅ İkinci onay başarılı! Manager node onaylandı. TX: ${receipt2.hash}`);
                            } else {
                                console.log(`   ❌ İkinci onay başarısız. TX: ${receipt2.hash}`);
                            }
                        } catch (err) {
                            console.error(`   ❌ İkinci onay sırasında hata: ${err.message}`);
                        }
                    } else if (opId) {
                        console.log(`   ⚠️ İkinci onaycı olmadığı için işlem bekliyor. (opId: ${opId})`);
                    } else {
                        console.log(`   ❌ Loglardan opId bulunamadı.`);
                    }
                }
            } else {
                console.log(`   ❌ TX başarısız. Hash: ${receipt.hash}`);
            }
        } catch (e) {
            console.error(`   ❌ Hata: ${e.message}`);
        }
    }

    console.log('\n✅ Manager onay işlemleri tamamlandı.');
}

main().catch(console.error);
