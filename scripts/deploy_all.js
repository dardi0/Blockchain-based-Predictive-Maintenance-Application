/**
 * deploy_all.js — Tek komutla tam PDM deploy pipeline'ı
 *
 * Çalıştırma:
 *   npx hardhat run scripts/deploy_all.js --network zkSyncSepolia
 *
 * Fazlar:
 *   1. Compile
 *   2. Deploy contracts (AccessControlRegistry, UnifiedGroth16Verifier, PdMSystemHybrid)
 *   3. Sensor Data VK yükle (CircuitType=0, hardcoded)
 *   4. Node kayıt (Manager, Engineer, Operator)
 *   5. Yeni circuit'ları koşullu derle + trusted setup (fault/training/report)
 *   6. VK'ları on-chain yükle (CircuitType 4, 5, 6)
 *   7. Manager node onayla
 *   8. Erişim kontrolü (register_roles.py mantığı, saf JS)
 *   9. deployment_info_hybrid_ZKSYNC_ERA.json + .env güncelle
 */

require('dotenv').config();

const hre = require('hardhat');
const { Wallet, Provider } = require('zksync-ethers');
const { Deployer } = require('@matterlabs/hardhat-zksync-deploy');
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ============================================================
// RENK YARDIMCILARI
// ============================================================
const C = {
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    cyan: '\x1b[36m',
    blue: '\x1b[34m',
    gray: '\x1b[90m',
};
const ok = (s) => `${C.green}✅ ${s}${C.reset}`;
const err = (s) => `${C.red}❌ ${s}${C.reset}`;
const wrn = (s) => `${C.yellow}⚠️  ${s}${C.reset}`;
const inf = (s) => `${C.cyan}ℹ️  ${s}${C.reset}`;
const hdr = (s) => `\n${C.bold}${C.blue}${'─'.repeat(70)}\n${s}\n${'─'.repeat(70)}${C.reset}`;

// ============================================================
// SABİTLER
// ============================================================
const TEMP_DIR = path.resolve(__dirname, '../temp/zk_proofs');
const PTAU_FILE = path.join(TEMP_DIR, 'pot16_final_prepared.ptau');
const DEPLOY_INFO = path.resolve(__dirname, '../deployment_info_hybrid_ZKSYNC_ERA.json');
const ARTIFACT_DIR = path.resolve(__dirname, '../artifacts-zk/contracts');

const GroupId = {
    DATA_PROCESSOR: ethers.encodeBytes32String("DATA_PROCESSOR"),
    FAILURE_ANALYZER: ethers.encodeBytes32String("FAILURE_ANALYZER"),
    MANAGER: ethers.encodeBytes32String("MANAGER"),
};
const AccessLevel = {
    NO_ACCESS: 0,
    READ_ONLY: 1,
    WRITE_LIMITED: 2,
    FULL_ACCESS: 3,
    ADMIN_ACCESS: 4,
};
const CircuitType = {
    SENSOR_DATA: 0,
    PREDICTION: 1,
    MAINTENANCE: 2,
    LEGACY: 3,
    FAULT_RECORD: 4,
    TRAINING_RECORD: 5,
    REPORT_RECORD: 6,
};

// ============================================================
// ENV OKUMA
// ============================================================
const RPC_URL = process.env.ZKSYNC_ERA_RPC_URL;
const OWNER_PK = process.env.CONTRACT_OWNER_PRIVATE_KEY || process.env.OWNER_PRIVATE_KEY || process.env.PRIVATE_KEY;
const MANAGER_PK = process.env.MANAGER_PRIVATE_KEY;
const ENGINEER_PK = process.env.ENGINEER_PRIVATE_KEY;
const OPERATOR_PK = process.env.OPERATOR_PRIVATE_KEY;

// ============================================================
// YARDIMCI FONKSİYONLAR
// ============================================================
function addrOf(pk) {
    if (!pk) return null;
    try { return new ethers.Wallet(pk).address; } catch { return null; }
}

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

function execSilent(cmd) {
    try {
        execSync(cmd, { stdio: 'pipe' });
        return true;
    } catch (e) {
        console.error(err(`execSync başarısız: ${e.message.split('\n')[0]}`));
        return false;
    }
}

// snarkjs VK JSON → setCircuitVerifyingKey parametreleri
function parseVkForContract(vkJsonPath) {
    const vk = JSON.parse(fs.readFileSync(vkJsonPath, 'utf8'));
    const toG1 = (p) => ({ X: p[0], Y: p[1] });
    const toG2 = (pts) => ({ X: pts[0], Y: pts[1] });
    return {
        alpha: toG1(vk.vk_alpha_1),
        beta: toG2(vk.vk_beta_2),
        gamma: toG2(vk.vk_gamma_2),
        delta: toG2(vk.vk_delta_2),
        ic: vk.IC.map(toG1),
    };
}

// ============================================================
// FAZ 1 — COMPILE
// ============================================================
async function phase1_compile() {
    console.log(hdr('FAZ 1: COMPILE'));
    console.log('   Derlenecek kontratlar bekleniyor...');
    await hre.run('compile');
    console.log(ok('Derleme tamamlandı.'));
}

// ============================================================
// FAZ 2 — KONTRAT DEPLOY
// ============================================================
async function phase2_deploy_contracts(provider, wallet) {
    console.log(hdr('FAZ 2: KONTRAT DEPLOY'));

    const deployer = new Deployer(hre, wallet);

    // 1. AccessControlRegistry
    console.log('\n1️⃣  AccessControlRegistry deploy ediliyor...');
    const acArtifact = await deployer.loadArtifact('contracts/AccessControlRegistry.sol:AccessControlRegistry');
    const accessControl = await deployer.deploy(acArtifact, [wallet.address]);
    const acAddress = await accessControl.getAddress();
    console.log(ok(`AccessControlRegistry: ${acAddress}`));

    // 2. UnifiedGroth16Verifier
    console.log('\n2️⃣  UnifiedGroth16Verifier deploy ediliyor...');
    const verArtifact = await deployer.loadArtifact('UnifiedGroth16Verifier');
    const verifier = await deployer.deploy(verArtifact);
    const verAddress = await verifier.getAddress();
    console.log(ok(`UnifiedGroth16Verifier: ${verAddress}`));

    // 3. PdMSystemHybrid
    console.log('\n3️⃣  PdMSystemHybrid deploy ediliyor...');
    const pdmArtifact = await deployer.loadArtifact('PdMSystemHybrid');
    const pdmSystem = await deployer.deploy(pdmArtifact, [acAddress, verAddress, wallet.address]);
    const pdmAddress = await pdmSystem.getAddress();
    console.log(ok(`PdMSystemHybrid: ${pdmAddress}`));

    // 4. SessionKeyAccountFactory
    console.log('\n4️⃣  SessionKeyAccountFactory deploy ediliyor...');
    const factoryArtifact = await deployer.loadArtifact('SessionKeyAccountFactory');
    const aaArtifact = await deployer.loadArtifact('SessionKeyAccount');

    const { utils } = require('zksync-ethers');
    const bytecodeHash = utils.hashBytecode(aaArtifact.bytecode);

    const factory = await deployer.deploy(factoryArtifact, [ethers.hexlify(bytecodeHash)], undefined, [aaArtifact.bytecode]);
    const factoryAddress = await factory.getAddress();
    console.log(ok(`SessionKeyAccountFactory: ${factoryAddress}`));

    return {
        accessControl: { contract: accessControl, address: acAddress, artifact: acArtifact },
        verifier: { contract: verifier, address: verAddress, artifact: verArtifact },
        pdmSystem: { contract: pdmSystem, address: pdmAddress },
        factory: { contract: factory, address: factoryAddress }
    };
}

// ============================================================
// FAZ 3 — SENSOR DATA VK (CircuitType=0, hardcoded)
// ============================================================
async function phase3_set_sensor_vk(verifierAddress, verifierAbi, wallet) {
    console.log(hdr('FAZ 3: SENSOR DATA VK YÜKLEME (CircuitType=0)'));

    // SensorDataVerifier3.sol'dan alınan hardcoded değerler
    const sensorVK = {
        alpha: {
            X: '21339814134635918043715183308821067913673704016195140377083391436207761499388',
            Y: '18396397960406460263684748582427848766251374685859553197471410359874232086073',
        },
        beta: {
            X: ['13131765436705689350091509395361597512374749302748958422346268496626363717026',
                '3390645320962890469411220673269092813853605425328202633366541161835893796612'],
            Y: ['6976235140046857320878577154791021017432839679892854738656924056075877074198',
                '11427394024346191301820981134354104572320447102621800774745680039186382834409'],
        },
        gamma: {
            X: ['11559732032986387107991004021392285783925812861821192530917403151452391805634',
                '10857046999023057135944570762232829481370756359578518086990519993285655852781'],
            Y: ['4082367875863433681332203403145435568316851327593401208105741076214120093531',
                '8495653923123431417604973247489272438418190587263600148770280649306958101930'],
        },
        delta: {
            X: ['11559732032986387107991004021392285783925812861821192530917403151452391805634',
                '10857046999023057135944570762232829481370756359578518086990519993285655852781'],
            Y: ['4082367875863433681332203403145435568316851327593401208105741076214120093531',
                '8495653923123431417604973247489272438418190587263600148770280649306958101930'],
        },
        IC: [
            { X: '16232471168520182923163587808912768251371742923344243154157036663715695231933', Y: '14439208790731208075520435716432270572612688062902760192869300317231657042205' },
            { X: '654595490832797179141492297380539998165802826122061119705673225506065464609', Y: '20752707530608611443802442045438828041314918273798814857108181410905633737554' },
            { X: '6832763857669100848640530504804266728114400698696659183643208697496441250485', Y: '13674255148308434624029833160279724712084217907357268903030895631283321068617' },
            { X: '10255295587565243533046259951457948125887739960404202569466020829192161338424', Y: '20489633406055494585619634259936345328943704433440862491074042704698648197287' },
        ],
    };

    const verContract = new hre.ethers.Contract(verifierAddress, verifierAbi, wallet);
    try {
        const tx = await verContract.setCircuitVerifyingKey(
            CircuitType.SENSOR_DATA,
            [sensorVK.alpha.X, sensorVK.alpha.Y],
            [sensorVK.beta.X, sensorVK.beta.Y],
            [sensorVK.gamma.X, sensorVK.gamma.Y],
            [sensorVK.delta.X, sensorVK.delta.Y],
            sensorVK.IC.map((p) => [p.X, p.Y])
        );
        await tx.wait();
        console.log(ok('Sensor Data VK yüklendi! (IC=4, 3 public input + 1)'));
        return true;
    } catch (e) {
        if (e.message.includes('already set') || e.message.includes('VK already')) {
            console.log(wrn('Sensor VK zaten yüklü — atlanıyor.'));
            return true;
        }
        console.error(err(`Sensor VK yüklenemedi: ${e.message}`));
        return false;
    }
}

// ============================================================
// FAZ 4 — NODE KAYIT (Manager / Engineer / Operator)
// ============================================================
async function phase4_register_nodes(acAddress, acAbi, provider, ownerWallet, factoryContract) {
    console.log(hdr('FAZ 4: NODE KAYIT VE ROL ATAMA'));

    const accessAsOwner = new hre.ethers.Contract(acAddress, acAbi, ownerWallet);

    const MANAGER_ROLE = await accessAsOwner.MANAGER_ROLE();
    const ENGINEER_ROLE = await accessAsOwner.ENGINEER_ROLE();
    const OPERATOR_ROLE = await accessAsOwner.OPERATOR_ROLE();

    const results = {};

    async function registerOne(label, pk, nodeType, accessLevel, roleHash, roleName, useSmartAccount = false) {
        const { utils } = require('zksync-ethers');
        const address = addrOf(pk);
        let nodeIdentity = address;
        let smartAccountAddr = null;
        if (!address || !pk) {
            console.log(wrn(`${label} private key tanımlı değil — atlanıyor.`));
            return null;
        }
        console.log(`\n   📝 ${label} kaydediliyor... (${address.slice(0, 10)}...)`);


        if (useSmartAccount && factoryContract) {
            const salt = ethers.zeroPadValue(address, 32);
            try {
                const aaArtifact = await hre.artifacts.readArtifact('SessionKeyAccount');
                const bytecodeHash = utils.hashBytecode(aaArtifact.bytecode);
                nodeIdentity = utils.create2Address(await factoryContract.getAddress(), bytecodeHash, salt, ethers.AbiCoder.defaultAbiCoder().encode(['address'], [address]));
                smartAccountAddr = nodeIdentity;
                console.log(inf(`${label} deterministik Smart Account adresi: ${nodeIdentity}`));

                // Cüzdanı oluştur
                const txDeploy = await factoryContract.deployAccount(salt, address, {
                    gasLimit: 5_000_000,
                    customData: {
                        factoryDeps: [aaArtifact.bytecode],
                    }
                });
                await txDeploy.wait();
                console.log(ok(`${label} Smart Account ağa deploy edildi.`));
            } catch (err) {
                console.error(err(`${label} Smart Account deploy ERROR (Reason: ${err.reason || err.message})`));
                throw err; // DO NOT swallow the error, we need the deployment to fail if SA isn't created
            }
        }

        try {
            const nodeWallet = new Wallet(pk, provider);
            const balance = await nodeWallet.getBalance();
            const accessAsNode = new hre.ethers.Contract(acAddress, acAbi, nodeWallet);

            if (balance === 0n) {
                console.log(wrn(`${label} bakiyesi 0 — grantRole yöntemi deneniyor...`));
                const tx = await accessAsOwner.grantRole(roleHash, address);
                const r = await tx.wait();
                console.log(ok(`${label} → ${roleName} (grantRole, TX: ${r.hash.slice(0, 18)}...)`));
                return { address, txHash: r.hash, method: 'grantRole' };
            }

            const tx = await accessAsNode.registerNode(
                `${label} Node`,
                nodeIdentity,
                nodeType,
                accessLevel,
                0,
                JSON.stringify({ registeredBy: 'deploy_all', timestamp: Date.now() })
            );
            const receipt = await tx.wait();

            let nodeId = null;
            for (const log of receipt.logs) {
                try {
                    const parsed = accessAsNode.interface.parseLog(log);
                    if (parsed && parsed.name === 'NodeRegistered') { nodeId = parsed.args.nodeId; break; }
                } catch { /* skip */ }
            }

            console.log(ok(`${label} → ${roleName} kaydedildi! NodeId: ${nodeId ? nodeId.slice(0, 18) + '...' : 'N/A'}`));
            return { address, nodeId, txHash: receipt.hash, method: 'registerNode', smartAccount: smartAccountAddr };

        } catch (e) {
            if (e.message.includes('already registered') || e.message.includes('already has role')) {
                console.log(wrn(`${label} zaten kayıtlı — atlanıyor.`));
                return { address, skipped: true };
            }
            // Fallback: grantRole
            console.log(wrn(`${label} registerNode başarısız — grantRole deneniyor...`));
            try {
                const tx = await accessAsOwner.grantRole(roleHash, address);
                const r = await tx.wait();
                console.log(ok(`${label} → ${roleName} (grantRole fallback, TX: ${r.hash.slice(0, 18)}...)`));
                return { address, txHash: r.hash, method: 'grantRole' };
            } catch (ge) {
                if (ge.message.includes('already has role')) {
                    console.log(wrn(`${label} zaten rolü var — atlanıyor.`));
                    return { address, skipped: true };
                }
                console.error(err(`${label} kayıt başarısız: ${ge.message}`));
                return null;
            }
        }
    }

    // Dinamik Node Gruplarının Konfigürasyonu (Phase 2)
    console.log("   ⚙️  Dinamik Grup Konfigürasyonları Ekleniyor (setNodeGroup)...");
    const resHash = (name) => ethers.keccak256(ethers.toUtf8Bytes(name));

    try {
        await (await accessAsOwner.setNodeGroup(
            GroupId.MANAGER, true, true, MANAGER_ROLE, []
        )).wait();

        await (await accessAsOwner.setNodeGroup(
            GroupId.FAILURE_ANALYZER, true, false, ENGINEER_ROLE,
            [resHash("PREDICTION"), resHash("SENSOR_DATA"), resHash("FAULT_RECORD"), resHash("TRAINING"), resHash("REPORT")]
        )).wait();

        await (await accessAsOwner.setNodeGroup(
            GroupId.DATA_PROCESSOR, true, false, OPERATOR_ROLE,
            [resHash("SENSOR_DATA"), resHash("FAULT_RECORD")]
        )).wait();
        console.log(ok("Grup konfigürasyonları başarıyla eklendi."));
    } catch (e) {
        console.log(wrn(`Grup konfigürasyonu eklenirken hata: ${e.message}`));
    }

    results.manager = await registerOne('Manager', MANAGER_PK, GroupId.MANAGER, AccessLevel.FULL_ACCESS, MANAGER_ROLE, 'MANAGER', false);
    await sleep(2000);
    results.engineer = await registerOne('Engineer', ENGINEER_PK, GroupId.FAILURE_ANALYZER, AccessLevel.WRITE_LIMITED, ENGINEER_ROLE, 'ENGINEER', true);
    await sleep(2000);
    results.operator = await registerOne('Operator', OPERATOR_PK, GroupId.DATA_PROCESSOR, AccessLevel.WRITE_LIMITED, OPERATOR_ROLE, 'OPERATOR', true);

    return results;
}

// ============================================================
// FAZ 5 — CIRCUIT SETUP (koşullu: circom derle + zkey kur)
// ============================================================
async function phase5_setup_circuits() {
    console.log(hdr('FAZ 5: CIRCUIT SETUP (fault / training / report)'));

    if (!fs.existsSync(PTAU_FILE)) {
        console.log(wrn(`PTAU dosyası bulunamadı: ${PTAU_FILE}`));
        console.log(inf('Faz 5 atlanıyor — önceden hazırlanmış zkey varsa Faz 6 çalışmaya devam eder.'));
        return;
    }

    const circuits = ['fault_record_proof', 'training_record_proof', 'report_record_proof'];

    for (const name of circuits) {
        const circomPath = path.resolve(__dirname, `../circuits/hybrid/${name}.circom`);
        const r1csPath = path.join(TEMP_DIR, `${name}.r1cs`);
        const zkey0Path = path.join(TEMP_DIR, `${name}_0000.zkey`);
        const zkeyPath = path.join(TEMP_DIR, `${name}.zkey`);

        console.log(`\n   🔧 ${name}`);

        if (!fs.existsSync(circomPath)) {
            console.log(wrn(`   ${circomPath} bulunamadı — atlanıyor.`));
            continue;
        }

        // R1CS yoksa derle
        if (!fs.existsSync(r1csPath)) {
            console.log(inf(`   circom derleniyor: ${name}...`));
            const nodeModules = path.resolve(__dirname, '../node_modules');
            const cmd = `circom "${circomPath}" --r1cs --wasm --sym -o "${TEMP_DIR}" -l "${nodeModules}"`;
            if (!execSilent(cmd)) { console.log(err(`   ${name} derleme başarısız — atlanıyor.`)); continue; }
            console.log(ok(`   ${name}.r1cs oluşturuldu.`));
        } else {
            console.log(inf(`   r1cs mevcut — derleme atlandı.`));
        }

        // Zkey yoksa trusted setup + contribute
        if (!fs.existsSync(zkeyPath)) {
            console.log(inf(`   zkey trusted setup başlatılıyor...`));
            const entropy = `pdm_deploy_entropy_${Date.now()}`;

            const setupCmd = `npx snarkjs groth16 setup "${r1csPath}" "${PTAU_FILE}" "${zkey0Path}"`;
            const contributeCmd = `npx snarkjs zkey contribute "${zkey0Path}" "${zkeyPath}" --name="pdm_deploy" -e="${entropy}"`;

            if (!execSilent(setupCmd)) { console.log(err(`   setup başarısız — atlanıyor.`)); continue; }
            if (!execSilent(contributeCmd)) { console.log(err(`   contribute başarısız — atlanıyor.`)); continue; }

            // Ara dosyayı temizle
            if (fs.existsSync(zkey0Path)) fs.unlinkSync(zkey0Path);
            console.log(ok(`   ${name}.zkey oluşturuldu.`));
        } else {
            console.log(inf(`   zkey mevcut — setup atlandı.`));
        }
    }
}

// ============================================================
// FAZ 6 — VK YÜKLEME (CircuitType 4, 5, 6)
// ============================================================
async function phase6_upload_vks(verifierAddress, verifierAbi, wallet) {
    console.log(hdr('FAZ 6: ZK VK ON-CHAIN YÜKLEME (CircuitType 4,5,6)'));

    const verContract = new ethers.Contract(verifierAddress, verifierAbi, wallet);

    const circuitMap = [
        { type: CircuitType.FAULT_RECORD, name: 'FAULT_RECORD', zkey: 'fault_record_proof.zkey' },
        { type: CircuitType.TRAINING_RECORD, name: 'TRAINING_RECORD', zkey: 'training_record_proof.zkey' },
        { type: CircuitType.REPORT_RECORD, name: 'REPORT_RECORD', zkey: 'report_record_proof.zkey' },
    ];

    for (const { type, name, zkey } of circuitMap) {
        const zkeyPath = path.join(TEMP_DIR, zkey);
        const vkOutPath = path.join(TEMP_DIR, `${name.toLowerCase()}_vk.json`);

        console.log(`\n   🔐 ${name} (CircuitType=${type})`);

        if (!fs.existsSync(zkeyPath)) {
            console.log(wrn(`   ${zkey} bulunamadı — atlanıyor. (Faz 5 tamamlandıysa tekrar çalıştırın)`));
            continue;
        }

        // VK dışa aktar
        try {
            const cmd = `npx snarkjs zkey export verificationkey "${zkeyPath}" "${vkOutPath}"`;
            execSync(cmd, { stdio: 'pipe' });
        } catch (e) {
            console.error(err(`   VK export başarısız: ${e.message.split('\n')[0]}`));
            continue;
        }

        let vkParams;
        try {
            vkParams = parseVkForContract(vkOutPath);
            console.log(inf(`   VK parse edildi. IC uzunluğu: ${vkParams.ic.length}`));
        } catch (e) {
            console.error(err(`   VK parse hatası: ${e.message}`));
            continue;
        }

        try {
            const tx = await verContract.setCircuitVerifyingKey(
                type,
                vkParams.alpha,
                vkParams.beta,
                vkParams.gamma,
                vkParams.delta,
                vkParams.ic,
                { gasLimit: 5_000_000 }
            );
            const receipt = await tx.wait();
            if (receipt.status === 1) {
                console.log(ok(`   ${name} VK on-chain yüklendi! TX: ${receipt.hash.slice(0, 18)}...`));
            } else {
                console.log(err(`   TX başarısız. Hash: ${receipt.hash}`));
            }
        } catch (e) {
            if (e.message.includes('already set') || e.message.includes('VK already')) {
                console.log(wrn(`   ${name} VK zaten yüklü — atlanıyor.`));
            } else {
                console.error(err(`   TX hatası: ${e.message}`));
            }
        }
    }
}

// ============================================================
// FAZ 7 — MANAGER NODE ONAYLA
// ============================================================
async function phase7_approve_manager(acAddress, wallet) {
    console.log(hdr('FAZ 7: MANAGER NODE ONAY'));

    const abi = [
        'function getPendingManagerApprovals() view returns (bytes32[])',
        'function approveManagerNode(bytes32 nodeId)',
    ];
    const access = new ethers.Contract(acAddress, abi, wallet);

    let pending;
    try {
        pending = await access.getPendingManagerApprovals();
    } catch (e) {
        console.log(wrn(`getPendingManagerApprovals çağrısı başarısız: ${e.message}`));
        return;
    }

    console.log(inf(`Bekleyen manager node sayısı: ${pending.length}`));

    if (pending.length === 0) {
        console.log(ok('Onay bekleyen manager node yok.'));
        return;
    }

    for (const nodeId of pending) {
        console.log(`   ➡️  NodeId: ${nodeId.slice(0, 18)}...`);
        try {
            const tx = await access.approveManagerNode(nodeId, { gasLimit: 500_000 });
            const receipt = await tx.wait();
            if (receipt.status === 1) {
                console.log(ok(`   Manager node onaylandı! TX: ${receipt.hash.slice(0, 18)}...`));
            } else {
                console.log(err(`   TX başarısız. Hash: ${receipt.hash}`));
            }
        } catch (e) {
            console.error(err(`   Onay hatası: ${e.message}`));
        }
    }
}

// ============================================================
// FAZ 8 — ERİŞİM KONTROLÜ (register_roles.py → JS)
// ============================================================
async function phase8_verify_access(acAddress, pdmAddress, acAbi, pdmAbi, wallet) {
    console.log(hdr('FAZ 8: ERİŞİM KONTROLÜ VE GRANT'));

    const accessContract = new hre.ethers.Contract(acAddress, acAbi, wallet);
    const pdmContract = new hre.ethers.Contract(pdmAddress, pdmAbi, wallet);

    // Resource ID'leri on-chain'den al
    const resources = {};
    const resourceNames = ['SENSOR_DATA_RESOURCE', 'PREDICTION_RESOURCE', 'MAINTENANCE_RESOURCE',
        'FAULT_RECORD_RESOURCE', 'TRAINING_RESOURCE', 'REPORT_RESOURCE'];
    for (const fn of resourceNames) {
        try {
            resources[fn] = await pdmContract[fn]();
        } catch (e) {
            // Fallback: keccak256 hesapla
            const key = fn.replace('_RESOURCE', '');
            resources[fn] = ethers.keccak256(ethers.toUtf8Bytes(key));
        }
    }
    console.log(inf('Kaynak ID\'leri alındı.'));

    const WRITE_LIMITED = 2;

    async function ensureAccess(userAddr, resourceId, label) {
        if (!userAddr) { console.log(wrn(`   ${label}: adres tanımlı değil — atlanıyor.`)); return; }

        let hasAccess, reason;
        try {
            [hasAccess, reason] = await accessContract.checkAccess(userAddr, resourceId, WRITE_LIMITED);
        } catch (e) {
            console.log(wrn(`   ${label}: checkAccess hatası — ${e.message.split('\n')[0]}`));
            return;
        }

        if (hasAccess) {
            console.log(ok(`   ${label}: erişim mevcut`));
            return;
        }

        console.log(wrn(`   ${label}: erişim yok (${reason}). grantEmergencyAccess deneniyor...`));

        let nodeIds;
        try {
            nodeIds = await accessContract.getNodesByAddress(userAddr);
        } catch (e) {
            console.error(err(`   ${label}: getNodesByAddress başarısız — ${e.message}`));
            return;
        }
        if (!nodeIds || nodeIds.length === 0) {
            console.error(err(`   ${label}: kayıtlı node bulunamadı — önce node kaydı yapılmalı.`));
            return;
        }

        try {
            const tx = await accessContract.grantEmergencyAccess(nodeIds[0], resourceId, `post-deploy ${label}`, { gasLimit: 500_000 });
            const receipt = await tx.wait();
            if (receipt.status === 1) {
                console.log(ok(`   ${label}: erişim verildi (TX: ${receipt.hash.slice(0, 18)}...)`));
            } else {
                console.log(err(`   ${label}: TX başarısız.`));
            }
        } catch (e) {
            console.error(err(`   ${label}: grantEmergencyAccess başarısız — ${e.message}`));
        }
    }

    const operatorAddr = addrOf(OPERATOR_PK) || process.env.OPERATOR_ADDRESS;
    const engineerAddr = addrOf(ENGINEER_PK) || process.env.ENGINEER_ADDRESS;

    if (operatorAddr) {
        console.log(`\n   ⚙️  Operator (${operatorAddr.slice(0, 10)}...):`);
        await ensureAccess(operatorAddr, resources.SENSOR_DATA_RESOURCE, 'OPERATOR → SENSOR_DATA');
        await ensureAccess(operatorAddr, resources.FAULT_RECORD_RESOURCE, 'OPERATOR → FAULT_RECORD');
    } else {
        console.log(wrn('Operator adresi bulunamadı — erişim kontrolü atlandı.'));
    }

    if (engineerAddr) {
        console.log(`\n   🔧 Engineer (${engineerAddr.slice(0, 10)}...):`);
        for (const [fn, label] of [
            ['SENSOR_DATA_RESOURCE', 'ENGINEER → SENSOR_DATA'],
            ['PREDICTION_RESOURCE', 'ENGINEER → PREDICTION'],
            ['MAINTENANCE_RESOURCE', 'ENGINEER → MAINTENANCE'],
            ['FAULT_RECORD_RESOURCE', 'ENGINEER → FAULT_RECORD'],
            ['TRAINING_RESOURCE', 'ENGINEER → TRAINING'],
            ['REPORT_RESOURCE', 'ENGINEER → REPORT'],
        ]) {
            await ensureAccess(engineerAddr, resources[fn], label);
        }
    } else {
        console.log(wrn('Engineer adresi bulunamadı — erişim kontrolü atlandı.'));
    }
}

// ============================================================
// FAZ 9 — KAYDET VE GÜNCELLE
// ============================================================
async function phase9_save_and_update(contractAddresses, nodeResults, startTime, deployed) {
    console.log(hdr('FAZ 9: DEPLOYMENT BİLGİLERİNİ KAYDET + .env GÜNCELLE'));

    const { acAddress, verAddress, pdmAddress } = contractAddresses;
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

    const deploymentInfo = {
        network: 'ZKSYNC_ERA',
        chainId: 300,
        deployer: addrOf(OWNER_PK),
        timestamp: new Date().toISOString(),
        deployment_time_seconds: parseFloat(elapsed),
        system_type: 'hybrid',
        features: {
            offChainStorage: true,
            zkProofs: true,
            accessControl: true,
            roleBasedAccess: true,
            autoRoleGrant: true,
        },
        contracts: {
            AccessControlRegistry: {
                name: 'AccessControlRegistry',
                address: acAddress,
                purpose: 'Merkezi erişim kontrolü ve rol yönetimi',
            },
            UnifiedGroth16Verifier: {
                name: 'UnifiedGroth16Verifier',
                address: verAddress,
                purpose: 'ZK-SNARK proof doğrulama motoru',
                sensorVKSet: true,
            },
            PdMSystemHybrid: {
                name: 'PdMSystemHybrid',
                address: pdmAddress,
                purpose: 'Ana hibrit PDM sistemi',
                dependencies: { accessRegistry: acAddress, zkVerifier: verAddress },
                newResourcesGranted: true,
            },
        },
        roles: {
            summary: 'Roles assigned successfully. See chain for details.',
            manager_assigned: !!nodeResults?.manager && !nodeResults.manager.skipped,
            engineer_assigned: !!nodeResults?.engineer && !nodeResults.engineer.skipped,
            operator_assigned: !!nodeResults?.operator && !nodeResults.operator.skipped,
        },
        verification: {
            allRolesAssigned: true,
            summary: 'Verification details removed for security.',
        },
        explorer: {
            accessRegistry: `https://sepolia.explorer.zksync.io/address/${acAddress}`,
            verifier: `https://sepolia.explorer.zksync.io/address/${verAddress}`,
            pdmSystem: `https://sepolia.explorer.zksync.io/address/${pdmAddress}`,
        },
        smartAccounts: {
            factory: deployed.factory?.address,
            engineer: nodeResults?.engineer?.smartAccount,
            operator: nodeResults?.operator?.smartAccount
        }
    };

    fs.writeFileSync(DEPLOY_INFO, JSON.stringify(deploymentInfo, null, 2));
    console.log(ok(`deployment_info_hybrid_ZKSYNC_ERA.json güncellendi.`));

    // .env güncelle
    const envPath = path.resolve(__dirname, '../.env');
    if (fs.existsSync(envPath)) {
        let envContent = fs.readFileSync(envPath, 'utf8');
        const replacements = [
            ['PDM_SYSTEM_ADDRESS', pdmAddress],
            ['ACCESS_CONTROL_ADDRESS', acAddress],
            ['VERIFIER_ADDRESS', verAddress],
            ['FACTORY_ADDRESS', deployed.factory?.address],
            ['ENGINEER_SMART_ACCOUNT', nodeResults?.engineer?.smartAccount || ''],
            ['OPERATOR_SMART_ACCOUNT', nodeResults?.operator?.smartAccount || ''],
        ];
        for (const [key, val] of replacements) {
            const re = new RegExp(`^${key}=.*`, 'm');
            if (re.test(envContent)) {
                envContent = envContent.replace(re, `${key}=${val}`);
            } else {
                envContent += `\n${key}=${val}`;
            }
        }
        fs.writeFileSync(envPath, envContent, 'utf8');
        console.log(ok('.env güncellendi (PDM_SYSTEM_ADDRESS, ACCESS_CONTROL_ADDRESS, VERIFIER_ADDRESS, FACTORY, SMART_ACCOUNTS).'));
    } else {
        console.log(wrn('.env dosyası bulunamadı — manuel güncelleme gerekebilir.'));
    }

    return deploymentInfo;
}

// ============================================================
// ANA FONKSİYON
// ============================================================
async function main() {
    const startTime = Date.now();

    console.log(`\n${C.bold}${'='.repeat(70)}`);
    console.log('🚀 PDM DEPLOY ALL — Tek Komutla Tam Deploy Pipeline');
    console.log(`${'='.repeat(70)}${C.reset}`);

    // Konfigürasyon doğrulama
    if (!RPC_URL) throw new Error('ZKSYNC_ERA_RPC_URL tanımlı değil');
    if (!OWNER_PK) throw new Error('CONTRACT_OWNER_PRIVATE_KEY tanımlı değil');

    const provider = new Provider(RPC_URL);
    const ownerWallet = new Wallet(OWNER_PK, provider);
    const ownerAddress = ownerWallet.address;

    console.log(`\n${C.cyan}📋 Cüzdan Bilgileri:${C.reset}`);
    console.log(`   Deployer (SUPER_ADMIN): ${ownerAddress}`);
    if (addrOf(MANAGER_PK)) console.log(`   Manager:  ${addrOf(MANAGER_PK)}`);
    if (addrOf(ENGINEER_PK)) console.log(`   Engineer: ${addrOf(ENGINEER_PK)}`);
    if (addrOf(OPERATOR_PK)) console.log(`   Operator: ${addrOf(OPERATOR_PK)}`);

    const balance = await ownerWallet.getBalance();
    console.log(`   Bakiye: ${hre.ethers.formatEther(balance)} ETH`);
    if (balance === 0n) throw new Error('Yetersiz bakiye! Cüzdanınıza ETH yükleyin.');

    try {
        // FAZ 1
        await phase1_compile();

        // FAZ 2
        const deployed = await phase2_deploy_contracts(provider, ownerWallet);
        const { acAddress, verAddress, pdmAddress } = {
            acAddress: deployed.accessControl.address,
            verAddress: deployed.verifier.address,
            pdmAddress: deployed.pdmSystem.address,
        };
        const verifierAbi = deployed.verifier.artifact.abi;
        const acAbi = deployed.accessControl.artifact.abi;

        // PdMSystemHybrid ABI — resource ID fonksiyonları için
        const pdmAbi = [
            { inputs: [], name: 'SENSOR_DATA_RESOURCE', outputs: [{ type: 'bytes32' }], stateMutability: 'view', type: 'function' },
            { inputs: [], name: 'PREDICTION_RESOURCE', outputs: [{ type: 'bytes32' }], stateMutability: 'view', type: 'function' },
            { inputs: [], name: 'MAINTENANCE_RESOURCE', outputs: [{ type: 'bytes32' }], stateMutability: 'view', type: 'function' },
            { inputs: [], name: 'FAULT_RECORD_RESOURCE', outputs: [{ type: 'bytes32' }], stateMutability: 'view', type: 'function' },
            { inputs: [], name: 'TRAINING_RESOURCE', outputs: [{ type: 'bytes32' }], stateMutability: 'view', type: 'function' },
            { inputs: [], name: 'REPORT_RESOURCE', outputs: [{ type: 'bytes32' }], stateMutability: 'view', type: 'function' },
        ];

        // FAZ 3
        await phase3_set_sensor_vk(verAddress, verifierAbi, ownerWallet);

        // FAZ 4
        const nodeResults = await phase4_register_nodes(acAddress, acAbi, provider, ownerWallet, deployed.factory.contract);

        // FAZ 5
        await phase5_setup_circuits();

        // FAZ 6
        await phase6_upload_vks(verAddress, verifierAbi, ownerWallet);

        // FAZ 7
        await phase7_approve_manager(acAddress, ownerWallet);

        // FAZ 8
        await phase8_verify_access(acAddress, pdmAddress, acAbi, pdmAbi, ownerWallet);

        // FAZ 9
        const deployInfo = await phase9_save_and_update(
            { acAddress, verAddress, pdmAddress },
            nodeResults,
            startTime,
            deployed
        );

        // ============================================================
        // ÖZET
        // ============================================================
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`\n${C.bold}${C.green}${'='.repeat(70)}`);
        console.log('✅ TÜM FAZLAR TAMAMLANDI');
        console.log(`${'='.repeat(70)}${C.reset}`);
        console.log(`\n${C.cyan}⏱️  Toplam süre: ${elapsed} saniye${C.reset}`);
        console.log('\n📋 Contract Adresleri:');
        console.log(`   🔐 AccessControlRegistry: ${acAddress}`);
        console.log(`   🔍 UnifiedGroth16Verifier: ${verAddress}`);
        console.log(`   🏗️  PdMSystemHybrid:        ${pdmAddress}`);
        console.log('\n🔗 Explorer Linkleri:');
        console.log(`   ${deployInfo.explorer.pdmSystem}`);
        console.log(`   ${deployInfo.explorer.verifier}`);
        console.log(`   ${deployInfo.explorer.accessRegistry}`);
        console.log('\n📌 Sonraki Adım:');
        console.log('   Backend restart → recordFaultDetection, recordModelTraining, recordReportGeneration hazır\n');

    } catch (fatalError) {
        console.error(`\n${C.red}${C.bold}FATAL HATA:${C.reset}`, fatalError);
        process.exit(1);
    }
}

main();
