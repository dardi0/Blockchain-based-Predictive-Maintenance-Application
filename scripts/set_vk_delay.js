/**
 * VK timelock süresini ayarla (sadece owner çağırabilir).
 *
 * Kullanım:
 *   npm run vk:delay:dev   → 0 saniye (dev: propose + execute anında)
 *   npm run vk:delay:prod  → 172800 saniye (production: 48 saat)
 *
 * veya doğrudan:
 *   node scripts/set_vk_delay.js 0
 *   node scripts/set_vk_delay.js 172800
 */

require('dotenv').config();
const { ethers } = require('ethers');
const { Provider, Wallet } = require('zksync-ethers');
const fs = require('fs');
const path = require('path');

async function setVkDelay(newDelaySeconds) {
    const delaySec = parseInt(newDelaySeconds ?? process.argv[2] ?? '0', 10);

    const rpcUrl  = process.env.ZKSYNC_ERA_RPC_URL;
    const ownerPk = process.env.CONTRACT_OWNER_PRIVATE_KEY
                 || process.env.PRIVATE_KEY
                 || process.env.MANAGER_PRIVATE_KEY;

    if (!rpcUrl || !ownerPk) {
        throw new Error('ZKSYNC_ERA_RPC_URL ve CONTRACT_OWNER_PRIVATE_KEY .env\'de gerekli');
    }

    const provider = new Provider(rpcUrl);
    const wallet   = new Wallet(ownerPk, provider);
    console.log(`Wallet: ${wallet.address}`);

    const deployInfo = JSON.parse(fs.readFileSync(
        path.resolve(__dirname, '../deployment_info_hybrid_ZKSYNC_ERA.json'), 'utf8'
    ));
    const verifierAddress = deployInfo.contracts?.UnifiedGroth16Verifier?.address;
    if (!verifierAddress) throw new Error('UnifiedGroth16Verifier adresi bulunamadı');

    const verifierAbi = JSON.parse(fs.readFileSync(
        path.resolve(__dirname, '../artifacts-zk/contracts/UnifiedGroth16Verifier.sol/UnifiedGroth16Verifier.json'),
        'utf8'
    )).abi;
    const verifier = new ethers.Contract(verifierAddress, verifierAbi, wallet);

    // Support both deployed contract versions:
    //   - older: VK_CHANGE_DELAY() constant (read-only, no setter)
    //   - newer: vkChangeDelay() mutable + setVkChangeDelay()
    const hasGetter = verifierAbi.some(x => x.name === 'VK_CHANGE_DELAY' || x.name === 'vkChangeDelay');
    const hasSetter = verifierAbi.some(x => x.name === 'setVkChangeDelay');

    let current;
    if (typeof verifier.VK_CHANGE_DELAY === 'function') {
        current = await verifier.VK_CHANGE_DELAY();
    } else if (typeof verifier.vkChangeDelay === 'function') {
        current = await verifier.vkChangeDelay();
    } else {
        console.error('Bu kontrat VK delay okuma fonksiyonu içermiyor.');
        process.exit(1);
    }

    console.log(`Mevcut delay : ${current}s (${Number(current) / 3600}h)`);

    if (!hasSetter) {
        console.warn(
            '\nBu kontrat setVkChangeDelay() içermiyor — VK_CHANGE_DELAY sabit olarak tanımlanmış.\n' +
            'Delay değiştirmek için kontratı yeniden deploy etmeniz gerekir.\n' +
            '(Kaynak kodda vkChangeDelay mutable olarak tanımlı; npm run compile && npm run deploy:integrated)'
        );
        process.exit(1);
    }

    console.log(`Yeni delay   : ${delaySec}s`);

    if (Number(current) === delaySec) {
        console.log('Zaten ayarlı, değişiklik gerekmez.');
        return;
    }

    const tx = await verifier.setVkChangeDelay(delaySec, { gasLimit: 100_000 });
    console.log(`TX: ${tx.hash}`);
    const receipt = await tx.wait();
    if (receipt.status === 1) {
        const label = delaySec === 0 ? 'DEV (anında)' : `${delaySec / 3600}h`;
        console.log(`VK delay guncellendi: ${label} (block ${receipt.blockNumber})`);
    } else {
        console.error(`TX basarisiz: ${receipt.hash}`);
        process.exit(1);
    }
}

// Hem require() ile hem doğrudan çağrı için
if (require.main === module) {
    setVkDelay(process.argv[2]).catch(e => { console.error('HATA:', e.message); process.exit(1); });
} else {
    module.exports = setVkDelay;
}
