/**
 * zkSync Era - Tam Deployment ve Rol Atama Script
 *
 * Bu script:
 * 1. Tüm contract'ları sıfırdan deploy eder
 * 2. Manager, Engineer ve Operator cüzdanlarına node kaydı yapar
 * 3. registerNode ile otomatik rol ataması tetiklenir
 * 4. Rol atamalarını doğrular
 * 5. Deployment bilgilerini JSON'a kaydeder
 */

require('dotenv').config();

const { Wallet, Provider } = require("zksync-ethers");
const { Deployer } = require("@matterlabs/hardhat-zksync-deploy");
const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

// ============================================
// CONFIGURATION
// ============================================

const ZKSYNC_ERA_RPC_URL = process.env.ZKSYNC_ERA_RPC_URL;
const CONTRACT_OWNER_PRIVATE_KEY = process.env.CONTRACT_OWNER_PRIVATE_KEY || process.env.OWNER_PRIVATE_KEY || process.env.PRIVATE_KEY;
const MANAGER_PRIVATE_KEY = process.env.MANAGER_PRIVATE_KEY;
const ENGINEER_PRIVATE_KEY = process.env.ENGINEER_PRIVATE_KEY;
const OPERATOR_PRIVATE_KEY = process.env.OPERATOR_PRIVATE_KEY;

// GroupId tanımlamaları (AccessControlRegistry.sol'daki Dinamik Node Grupları)
const GroupId = {
    DATA_PROCESSOR: ethers.encodeBytes32String("DATA_PROCESSOR"),      // Operator
    FAILURE_ANALYZER: ethers.encodeBytes32String("FAILURE_ANALYZER"),    // Engineer
    MANAGER: ethers.encodeBytes32String("MANAGER")              // Manager
};

// AccessLevel enum değerleri
const AccessLevel = {
    NO_ACCESS: 0,
    READ_ONLY: 1,
    WRITE_LIMITED: 2,
    FULL_ACCESS: 3,
    ADMIN_ACCESS: 4
};

// ============================================
// HELPER FUNCTIONS
// ============================================

function getAddressFromPrivateKey(privateKey) {
    if (!privateKey) return null;
    try {
        const wallet = new ethers.Wallet(privateKey);
        return wallet.address;
    } catch (e) {
        return null;
    }
}

function validateConfiguration() {
    const errors = [];

    if (!ZKSYNC_ERA_RPC_URL) {
        errors.push("ZKSYNC_ERA_RPC_URL tanımlı değil");
    }
    if (!CONTRACT_OWNER_PRIVATE_KEY) {
        errors.push("CONTRACT_OWNER_PRIVATE_KEY tanımlı değil");
    }

    // Rol private key'leri opsiyonel ama uyarı ver
    const warnings = [];
    if (!MANAGER_PRIVATE_KEY) warnings.push("MANAGER_PRIVATE_KEY");
    if (!ENGINEER_PRIVATE_KEY) warnings.push("ENGINEER_PRIVATE_KEY");
    if (!OPERATOR_PRIVATE_KEY) warnings.push("OPERATOR_PRIVATE_KEY");

    if (warnings.length > 0) {
        console.log(`⚠️  Uyarı: ${warnings.join(", ")} tanımlı değil - bu roller atlanacak`);
    }

    if (errors.length > 0) {
        throw new Error(`Konfigürasyon hataları:\n${errors.join("\n")}`);
    }
}

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================
// MAIN DEPLOYMENT FUNCTION
// ============================================

module.exports = async function (hre) {
    console.log("\n" + "=".repeat(70));
    console.log("🚀 zkSync Era - TAM DEPLOYMENT VE ROL ATAMA");
    console.log("=".repeat(70));

    // Konfigürasyon kontrolü
    validateConfiguration();

    // Provider ve wallet oluştur
    const provider = new Provider(ZKSYNC_ERA_RPC_URL);
    const wallet = new Wallet(CONTRACT_OWNER_PRIVATE_KEY, provider);
    const deployer = new Deployer(hre, wallet);

    // Adres bilgilerini hazırla
    const addresses = {
        deployer: wallet.address,
        manager: getAddressFromPrivateKey(MANAGER_PRIVATE_KEY),
        engineer: getAddressFromPrivateKey(ENGINEER_PRIVATE_KEY),
        operator: getAddressFromPrivateKey(OPERATOR_PRIVATE_KEY)
    };

    console.log("\n📋 Cüzdan Adresleri:");
    console.log(`   👤 Deployer (SUPER_ADMIN): ${addresses.deployer}`);
    if (addresses.manager) console.log(`   👔 Manager:  ${addresses.manager}`);
    if (addresses.engineer) console.log(`   🔧 Engineer: ${addresses.engineer}`);
    if (addresses.operator) console.log(`   ⚙️  Operator: ${addresses.operator}`);

    // Balance kontrolü
    const balance = await wallet.getBalance();
    console.log(`\n💰 Deployer Balance: ${hre.ethers.formatEther(balance)} ETH`);

    if (balance === 0n) {
        throw new Error("❌ Yetersiz bakiye! Lütfen cüzdanınıza ETH yükleyin.");
    }

    const deploymentResults = {
        contracts: {},
        roles: {},
        nodeRegistrations: []
    };
    const startTime = Date.now();

    try {
        // ============================================
        // FAZ 1: CONTRACT DEPLOYMENT
        // ============================================
        console.log("\n" + "─".repeat(70));
        console.log("📦 FAZ 1: CONTRACT DEPLOYMENT");
        console.log("─".repeat(70));

        // 1. AccessControlRegistry
        console.log("\n1️⃣  AccessControlRegistry deploy ediliyor...");
        const accessControlArtifact = await deployer.loadArtifact("contracts/AccessControlRegistry.sol:AccessControlRegistry");
        const accessControl = await deployer.deploy(accessControlArtifact, [wallet.address]);
        const accessControlAddress = await accessControl.getAddress();
        console.log(`   ✅ AccessControlRegistry: ${accessControlAddress}`);

        deploymentResults.contracts.AccessControlRegistry = {
            name: "AccessControlRegistry",
            address: accessControlAddress,
            purpose: "Merkezi erişim kontrolü ve rol yönetimi"
        };

        // 2. UnifiedGroth16Verifier
        console.log("\n2️⃣  UnifiedGroth16Verifier deploy ediliyor...");
        const verifierArtifact = await deployer.loadArtifact("UnifiedGroth16Verifier");
        const verifier = await deployer.deploy(verifierArtifact);
        const verifierAddress = await verifier.getAddress();
        console.log(`   ✅ UnifiedGroth16Verifier: ${verifierAddress}`);

        deploymentResults.contracts.UnifiedGroth16Verifier = {
            name: "UnifiedGroth16Verifier",
            address: verifierAddress,
            purpose: "ZK-SNARK proof doğrulama motoru"
        };

        // 3. PdMSystemHybrid
        console.log("\n3️⃣  PdMSystemHybrid deploy ediliyor...");
        const pdmSystemArtifact = await deployer.loadArtifact("PdMSystemHybrid");
        const pdmSystem = await deployer.deploy(pdmSystemArtifact, [
            accessControlAddress,
            verifierAddress,
            wallet.address
        ]);
        const pdmSystemAddress = await pdmSystem.getAddress();
        console.log(`   ✅ PdMSystemHybrid: ${pdmSystemAddress}`);

        deploymentResults.contracts.PdMSystemHybrid = {
            name: "PdMSystemHybrid",
            address: pdmSystemAddress,
            purpose: "Ana hibrit PDM sistemi",
            dependencies: {
                accessRegistry: accessControlAddress,
                zkVerifier: verifierAddress
            }
        };

        console.log("\n   ✅ Tüm contract'lar başarıyla deploy edildi!");

        // ============================================
        // FAZ 1.5: SENSOR DATA VK SETUP
        // ============================================
        console.log("\n" + "─".repeat(70));
        console.log("🔐 FAZ 1.5: SENSOR DATA VERIFYING KEY SETUP");
        console.log("─".repeat(70));

        // SensorDataVerifier3.sol'dan alınan VK değerleri (Solidity verifier formatı)
        // G2Point struct: { uint256[2] X; uint256[2] Y; }
        // SensorDataVerifier3.sol'da: betax1=real, betax2=imag, betay1=real, betay2=imag
        const sensorVK = {
            alpha: {
                X: "21339814134635918043715183308821067913673704016195140377083391436207761499388",
                Y: "18396397960406460263684748582427848766251374685859553197471410359874232086073"
            },
            // SensorDataVerifier3.sol formatı: X=[betax1, betax2], Y=[betay1, betay2]
            beta: {
                X: ["13131765436705689350091509395361597512374749302748958422346268496626363717026",
                    "3390645320962890469411220673269092813853605425328202633366541161835893796612"],
                Y: ["6976235140046857320878577154791021017432839679892854738656924056075877074198",
                    "11427394024346191301820981134354104572320447102621800774745680039186382834409"]
            },
            gamma: {
                X: ["11559732032986387107991004021392285783925812861821192530917403151452391805634",
                    "10857046999023057135944570762232829481370756359578518086990519993285655852781"],
                Y: ["4082367875863433681332203403145435568316851327593401208105741076214120093531",
                    "8495653923123431417604973247489272438418190587263600148770280649306958101930"]
            },
            delta: {
                X: ["11559732032986387107991004021392285783925812861821192530917403151452391805634",
                    "10857046999023057135944570762232829481370756359578518086990519993285655852781"],
                Y: ["4082367875863433681332203403145435568316851327593401208105741076214120093531",
                    "8495653923123431417604973247489272438418190587263600148770280649306958101930"]
            },
            IC: [
                {
                    X: "16232471168520182923163587808912768251371742923344243154157036663715695231933",
                    Y: "14439208790731208075520435716432270572612688062902760192869300317231657042205"
                },
                {
                    X: "654595490832797179141492297380539998165802826122061119705673225506065464609",
                    Y: "20752707530608611443802442045438828041314918273798814857108181410905633737554"
                },
                {
                    X: "6832763857669100848640530504804266728114400698696659183643208697496441250485",
                    Y: "13674255148308434624029833160279724712084217907357268903030895631283321068617"
                },
                {
                    X: "10255295587565243533046259951457948125887739960404202569466020829192161338424",
                    Y: "20489633406055494585619634259936345328943704433440862491074042704698648197287"
                }
            ]
        };

        console.log("   📝 Sensor Data VK yükleniyor...");

        // Verifier contract instance
        const verifierContract = new hre.ethers.Contract(
            verifierAddress,
            verifierArtifact.abi,
            wallet
        );

        // CircuitType.SENSOR_DATA = 0
        const SENSOR_DATA_CIRCUIT = 0;

        try {
            const setVKTx = await verifierContract.setCircuitVerifyingKey(
                SENSOR_DATA_CIRCUIT,
                [sensorVK.alpha.X, sensorVK.alpha.Y],                    // alpha G1
                [sensorVK.beta.X, sensorVK.beta.Y],                      // beta G2
                [sensorVK.gamma.X, sensorVK.gamma.Y],                    // gamma G2
                [sensorVK.delta.X, sensorVK.delta.Y],                    // delta G2
                sensorVK.IC.map(p => [p.X, p.Y])                         // IC[] G1 array
            );
            await setVKTx.wait();
            console.log("   ✅ Sensor Data VK başarıyla yüklendi!");
            console.log("   📊 IC length: 4 (3 public inputs + 1)");

            deploymentResults.contracts.UnifiedGroth16Verifier.sensorVKSet = true;
        } catch (vkError) {
            console.error("   ⚠️  Sensor VK yüklenemedi:", vkError.message);
            deploymentResults.contracts.UnifiedGroth16Verifier.sensorVKSet = false;
        }

        // ============================================
        // FAZ 1.6: YENİ KAYNAK ERİŞİM KONTROLÜ
        // Not: _autoGrantPermissionsByNodeType FAZ 2'de node kayıt sırasında
        // FAULT_RECORD, TRAINING, REPORT izinlerini otomatik atar:
        //   - FAILURE_ANALYZER (Engineer): tüm yeni kaynaklar ✅
        //   - DATA_PROCESSOR  (Operator): FAULT_RECORD ✅
        // Bu nedenle burada ek işlem yapılmaz.
        // ============================================
        console.log("\n" + "─".repeat(70));
        console.log("🔑 FAZ 1.6: KAYNAK ERİŞİM (OTOMATİK — FAZ 2'DE YAPILIR)");
        console.log("─".repeat(70));
        console.log("   ℹ️  Engineer → FAULT_RECORD, TRAINING, REPORT (registerNode'da otomatik)");
        console.log("   ℹ️  Operator → FAULT_RECORD (registerNode'da otomatik)");
        deploymentResults.contracts.PdMSystemHybrid.newResourcesGranted = true;

        // ============================================
        // FAZ 2: NODE KAYIT VE ROL ATAMA
        // ============================================
        console.log("\n" + "─".repeat(70));
        console.log("👥 FAZ 2: NODE KAYIT VE ROL ATAMA");
        console.log("─".repeat(70));

        // Deployer zaten SUPER_ADMIN ve SYSTEM_ADMIN rollerine sahip
        deploymentResults.roles.deployer = {
            address: addresses.deployer,
            roles: ["SUPER_ADMIN", "SYSTEM_ADMIN"],
            grantedAt: new Date().toISOString()
        };

        // ÖNEMLİ: registerNode fonksiyonunda owner = msg.sender olarak ayarlanıyor
        // Bu yüzden her cüzdanın KENDİ node'unu kaydetmesi gerekiyor
        // Alternatif: SUPER_ADMIN olarak grantRole fonksiyonunu kullanabiliriz

        // Deployer'ın contract instance'ı (grantRole için)
        const accessControlAsDeployer = new hre.ethers.Contract(
            accessControlAddress,
            accessControlArtifact.abi,
            wallet
        );

        // Role hash'lerini al
        const MANAGER_ROLE = await accessControlAsDeployer.MANAGER_ROLE();
        const ENGINEER_ROLE = await accessControlAsDeployer.ENGINEER_ROLE();
        const OPERATOR_ROLE = await accessControlAsDeployer.OPERATOR_ROLE();

        // Her cüzdan için kendi wallet'ı ile node kayıt fonksiyonu
        async function registerNodeWithOwnWallet(name, privateKey, nodeType, accessLevel, roleName) {
            const targetAddress = getAddressFromPrivateKey(privateKey);
            if (!targetAddress || !privateKey) {
                console.log(`   ⏭️  ${name} private key tanımlı değil, atlanıyor...`);
                return null;
            }

            console.log(`\n   📝 ${name} node kaydı yapılıyor...`);
            console.log(`      Adres: ${targetAddress}`);
            console.log(`      NodeType: ${nodeType} | AccessLevel: ${accessLevel}`);

            try {
                // Hedef cüzdan ile bağlan
                const targetWallet = new Wallet(privateKey, provider);
                const accessControlAsTarget = new hre.ethers.Contract(
                    accessControlAddress,
                    accessControlArtifact.abi,
                    targetWallet
                );

                // Hedef cüzdanın bakiyesini kontrol et
                const targetBalance = await targetWallet.getBalance();
                if (targetBalance === 0n) {
                    console.log(`      ⚠️  ${name} cüzdanında ETH yok, deployer ile grantRole kullanılacak...`);

                    // grantRole ile rol ata (deployer SUPER_ADMIN olarak)
                    let roleToGrant;
                    if (nodeType === GroupId.MANAGER) roleToGrant = MANAGER_ROLE;
                    else if (nodeType === GroupId.FAILURE_ANALYZER) roleToGrant = ENGINEER_ROLE;
                    else if (nodeType === GroupId.DATA_PROCESSOR) roleToGrant = OPERATOR_ROLE;

                    const grantTx = await accessControlAsDeployer.grantRole(roleToGrant, targetAddress);
                    const grantReceipt = await grantTx.wait();

                    console.log(`      ✅ ${roleName} rolü grantRole ile atandı`);

                    return {
                        nodeId: null,
                        txHash: grantReceipt.hash,
                        role: roleName,
                        method: "grantRole"
                    };
                }

                // Cüzdanın kendi node'unu kaydet
                const tx = await accessControlAsTarget.registerNode(
                    `${name} Node`,           // nodeName
                    targetAddress,            // nodeAddress
                    nodeType,                 // nodeType
                    accessLevel,              // accessLevel
                    0,                        // accessDuration (0 = permanent)
                    JSON.stringify({ registeredBy: "self-registration", timestamp: Date.now() })
                );

                const receipt = await tx.wait();

                // Event'ten nodeId al
                let nodeId = null;
                for (const log of receipt.logs) {
                    try {
                        const parsed = accessControlAsTarget.interface.parseLog(log);
                        if (parsed && parsed.name === "NodeRegistered") {
                            nodeId = parsed.args.nodeId;
                            break;
                        }
                    } catch (e) {
                        // Bu log bu event değil, devam et
                    }
                }

                console.log(`      ✅ Node kaydedildi! NodeId: ${nodeId ? nodeId.slice(0, 18) + "..." : "N/A"}`);
                console.log(`      ✅ ${roleName} rolü otomatik atandı`);

                return {
                    nodeId: nodeId,
                    txHash: receipt.hash,
                    role: roleName,
                    method: "registerNode"
                };

            } catch (error) {
                if (error.message.includes("already registered") || error.message.includes("Node already exists")) {
                    console.log(`      ⚠️  Bu adres zaten kayıtlı, atlanıyor...`);
                    return { skipped: true, reason: "already registered" };
                }
                if (error.message.includes("already has role")) {
                    console.log(`      ⚠️  Bu adres zaten bu role sahip, atlanıyor...`);
                    return { skipped: true, reason: "already has role" };
                }

                // Alternatif: grantRole ile dene
                console.log(`      ⚠️  registerNode başarısız, grantRole deneniyor...`);
                try {
                    let roleToGrant;
                    if (nodeType === GroupId.MANAGER) roleToGrant = MANAGER_ROLE;
                    else if (nodeType === GroupId.FAILURE_ANALYZER) roleToGrant = ENGINEER_ROLE;
                    else if (nodeType === GroupId.DATA_PROCESSOR) roleToGrant = OPERATOR_ROLE;

                    const grantTx = await accessControlAsDeployer.grantRole(roleToGrant, getAddressFromPrivateKey(privateKey));
                    const grantReceipt = await grantTx.wait();

                    console.log(`      ✅ ${roleName} rolü grantRole ile atandı`);
                    return {
                        nodeId: null,
                        txHash: grantReceipt.hash,
                        role: roleName,
                        method: "grantRole"
                    };
                } catch (grantError) {
                    if (grantError.message.includes("already has role")) {
                        console.log(`      ⚠️  Bu adres zaten bu role sahip`);
                        return { skipped: true, reason: "already has role" };
                    }
                    console.error(`      ❌ grantRole de başarısız: ${grantError.message}`);
                    throw grantError;
                }
            }
        }

        // Manager kaydı (SYSTEM_ADMIN rolü alır)
        const managerResult = await registerNodeWithOwnWallet(
            "Manager",
            MANAGER_PRIVATE_KEY,
            GroupId.MANAGER,
            AccessLevel.FULL_ACCESS,
            "SYSTEM_ADMIN"
        );
        if (managerResult && !managerResult.skipped) {
            deploymentResults.roles.manager = {
                address: addresses.manager,
                nodeId: managerResult.nodeId,
                roles: ["SYSTEM_ADMIN"],
                txHash: managerResult.txHash,
                method: managerResult.method,
                grantedAt: new Date().toISOString()
            };
            deploymentResults.nodeRegistrations.push({ name: "Manager", ...managerResult });
        }

        // Kısa bekleme (nonce sorunlarını önlemek için)
        await sleep(2000);

        // Engineer kaydı (ENGINEER rolü alır)
        const engineerResult = await registerNodeWithOwnWallet(
            "Engineer",
            ENGINEER_PRIVATE_KEY,
            GroupId.FAILURE_ANALYZER,
            AccessLevel.WRITE_LIMITED,
            "ENGINEER"
        );
        if (engineerResult && !engineerResult.skipped) {
            deploymentResults.roles.engineer = {
                address: addresses.engineer,
                nodeId: engineerResult.nodeId,
                roles: ["ENGINEER"],
                txHash: engineerResult.txHash,
                method: engineerResult.method,
                grantedAt: new Date().toISOString()
            };
            deploymentResults.nodeRegistrations.push({ name: "Engineer", ...engineerResult });
        }

        await sleep(2000);

        // Operator kaydı (OPERATOR rolü alır)
        const operatorResult = await registerNodeWithOwnWallet(
            "Operator",
            OPERATOR_PRIVATE_KEY,
            GroupId.DATA_PROCESSOR,
            AccessLevel.WRITE_LIMITED,
            "OPERATOR"
        );
        if (operatorResult && !operatorResult.skipped) {
            deploymentResults.roles.operator = {
                address: addresses.operator,
                nodeId: operatorResult.nodeId,
                roles: ["OPERATOR"],
                txHash: operatorResult.txHash,
                method: operatorResult.method,
                grantedAt: new Date().toISOString()
            };
            deploymentResults.nodeRegistrations.push({ name: "Operator", ...operatorResult });
        }

        // ============================================
        // FAZ 3: ROL DOĞRULAMA
        // ============================================
        console.log("\n" + "─".repeat(70));
        console.log("🔍 FAZ 3: ROL DOĞRULAMA");
        console.log("─".repeat(70));

        // Role hash'lerini al (doğrulama için)
        const ADMIN_ROLE_CHECK = await accessControlAsDeployer.ADMIN_ROLE();

        const verificationResults = {
            deployer: {
                SUPER_ADMIN: await accessControlAsDeployer.hasRole(addresses.deployer, ADMIN_ROLE_CHECK),
                SYSTEM_ADMIN: await accessControlAsDeployer.hasRole(addresses.deployer, MANAGER_ROLE)
            }
        };

        console.log(`\n   👤 Deployer (${addresses.deployer.slice(0, 10)}...):`);
        console.log(`      SUPER_ADMIN: ${verificationResults.deployer.SUPER_ADMIN ? "✅" : "❌"}`);
        console.log(`      SYSTEM_ADMIN: ${verificationResults.deployer.SYSTEM_ADMIN ? "✅" : "❌"}`);

        if (addresses.manager) {
            verificationResults.manager = {
                SYSTEM_ADMIN: await accessControlAsDeployer.hasRole(addresses.manager, MANAGER_ROLE)
            };
            console.log(`\n   👔 Manager (${addresses.manager.slice(0, 10)}...):`);
            console.log(`      SYSTEM_ADMIN: ${verificationResults.manager.SYSTEM_ADMIN ? "✅" : "❌"}`);
        }

        if (addresses.engineer) {
            verificationResults.engineer = {
                ENGINEER: await accessControlAsDeployer.hasRole(addresses.engineer, ENGINEER_ROLE)
            };
            console.log(`\n   🔧 Engineer (${addresses.engineer.slice(0, 10)}...):`);
            console.log(`      ENGINEER: ${verificationResults.engineer.ENGINEER ? "✅" : "❌"}`);
        }

        if (addresses.operator) {
            verificationResults.operator = {
                OPERATOR: await accessControlAsDeployer.hasRole(addresses.operator, OPERATOR_ROLE)
            };
            console.log(`\n   ⚙️  Operator (${addresses.operator.slice(0, 10)}...):`);
            console.log(`      OPERATOR: ${verificationResults.operator.OPERATOR ? "✅" : "❌"}`);
        }

        // Tüm rollerin doğru atanıp atanmadığını kontrol et
        const allRolesAssigned =
            verificationResults.deployer.SUPER_ADMIN &&
            verificationResults.deployer.SYSTEM_ADMIN &&
            (!addresses.manager || verificationResults.manager?.SYSTEM_ADMIN) &&
            (!addresses.engineer || verificationResults.engineer?.ENGINEER) &&
            (!addresses.operator || verificationResults.operator?.OPERATOR);

        // ============================================
        // FAZ 4: SONUÇLARI KAYDET
        // ============================================
        const endTime = Date.now();
        const deploymentTime = (endTime - startTime) / 1000;

        const deploymentInfo = {
            network: "ZKSYNC_ERA",
            chainId: 300,
            deployer: addresses.deployer,
            timestamp: new Date().toISOString(),
            deployment_time_seconds: deploymentTime,
            system_type: "hybrid",
            features: {
                offChainStorage: true,
                zkProofs: true,
                accessControl: true,
                roleBasedAccess: true,
                autoRoleGrant: true
            },
            contracts: deploymentResults.contracts,
            roles: {
                // SECURITY (H8): Do not persist sensitive role-to-address mapping in git-tracked file
                summary: "Roles assigned successfully. See chain for details.",
                manager_assigned: !!deploymentResults.roles.manager,
                engineer_assigned: !!deploymentResults.roles.engineer,
                operator_assigned: !!deploymentResults.roles.operator
            },
            verification: {
                allRolesAssigned: allRolesAssigned,
                summary: "Verification details removed for security."
            },
            explorer: {
                accessRegistry: `https://sepolia.explorer.zksync.io/address/${accessControlAddress}`,
                verifier: `https://sepolia.explorer.zksync.io/address/${verifierAddress}`,
                pdmSystem: `https://sepolia.explorer.zksync.io/address/${pdmSystemAddress}`
            }
        };

        // JSON dosyasına kaydet
        const outputPath = "./deployment_info_hybrid_ZKSYNC_ERA.json";
        fs.writeFileSync(outputPath, JSON.stringify(deploymentInfo, null, 2));

        // ============================================
        // ÖZET
        // ============================================
        console.log("\n" + "=".repeat(70));
        console.log("🎉 DEPLOYMENT VE ROL ATAMA TAMAMLANDI!");
        console.log("=".repeat(70));

        console.log(`\n⏱️  Toplam süre: ${deploymentTime.toFixed(2)} saniye`);
        console.log(`💾 Deployment bilgileri: ${outputPath}`);

        console.log("\n📋 Contract Adresleri:");
        console.log(`   🔐 AccessControlRegistry: ${accessControlAddress}`);
        console.log(`   🔍 UnifiedGroth16Verifier: ${verifierAddress}`);
        console.log(`   🏗️  PdMSystemHybrid: ${pdmSystemAddress}`);

        console.log("\n👥 Rol Atamaları:");
        console.log(`   ✅ Deployer → SUPER_ADMIN, SYSTEM_ADMIN`);
        if (addresses.manager) console.log(`   ${verificationResults.manager?.SYSTEM_ADMIN ? "✅" : "❌"} Manager → SYSTEM_ADMIN`);
        if (addresses.engineer) console.log(`   ${verificationResults.engineer?.ENGINEER ? "✅" : "❌"} Engineer → ENGINEER`);
        if (addresses.operator) console.log(`   ${verificationResults.operator?.OPERATOR ? "✅" : "❌"} Operator → OPERATOR`);

        console.log("\n🔗 zkSync Era Sepolia Explorer:");
        console.log(`   ${deploymentInfo.explorer.pdmSystem}`);

        if (!allRolesAssigned) {
            console.log("\n⚠️  UYARI: Bazı roller atanamadı! Lütfen kontrol edin.");
        }

        console.log("\n" + "=".repeat(70) + "\n");

        return deploymentInfo;

    } catch (error) {
        console.error("\n❌ DEPLOYMENT HATASI:", error);
        throw error;
    }
};
