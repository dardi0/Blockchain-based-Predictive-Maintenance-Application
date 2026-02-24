const fs = require('fs');
const path = require('path');

const target = path.resolve(__dirname, 'scripts', 'deploy_all.js');
let code = fs.readFileSync(target, 'utf8');

// Phase 2
code = code.replace(
    /return \{\s*accessControl: \{ contract: accessControl, address: acAddress, artifact: acArtifact \},\s*verifier: \{ contract: verifier, address: verAddress, artifact: verArtifact \},\s*pdmSystem: \{ contract: pdmSystem, address: pdmAddress \},\s*\};\s*\}/s,
    `    // 4. SessionKeyAccountFactory
    console.log('\\n4️⃣  SessionKeyAccountFactory deploy ediliyor...');
    const factoryArtifact = await deployer.loadArtifact('SessionKeyAccountFactory');
    const aaArtifact = await deployer.loadArtifact('SessionKeyAccount');
    
    const { utils } = require('zksync-ethers');
    const bytecodeHash = utils.hashBytecode(aaArtifact.bytecode);
    
    const factory = await deployer.deploy(factoryArtifact, [ethers.hexlify(bytecodeHash)], undefined, [aaArtifact.bytecode]);
    const factoryAddress = await factory.getAddress();
    console.log(ok(\`SessionKeyAccountFactory: \${factoryAddress}\`));

    return {
        accessControl: { contract: accessControl, address: acAddress, artifact: acArtifact },
        verifier: { contract: verifier, address: verAddress, artifact: verArtifact },
        pdmSystem: { contract: pdmSystem, address: pdmAddress },
        factory: { contract: factory, address: factoryAddress }
    };
}`
);

// Phase 4 signature
code = code.replace(
    /async function phase4_register_nodes\(acAddress, acAbi, provider, ownerWallet\) \{/,
    `async function phase4_register_nodes(acAddress, acAbi, provider, ownerWallet, factoryContract) {`
);

// Phase 4 registerOne definition
code = code.replace(
    /async function registerOne\(label, pk, nodeType, accessLevel, roleHash, roleName\) \{/,
    `async function registerOne(label, pk, nodeType, accessLevel, roleHash, roleName, useSmartAccount = false) {\n        const { utils } = require('zksync-ethers');`
);

// Address extraction in registerOne
code = code.replace(
    /const address = addrOf\(pk\);\s*if \(\!address/s,
    `const address = addrOf(pk);\n        let nodeIdentity = address;\n        let smartAccountAddr = null;\n        if (!address`
);

// Insert Smart Account Deployment
const nodeIdentityReplace = `
        if (useSmartAccount && factoryContract) {
            const salt = ethers.zeroPadValue(address, 32);
            try {
                const aaArtifact = await hre.artifacts.readArtifact('SessionKeyAccount');
                const bytecodeHash = utils.hashBytecode(aaArtifact.bytecode);
                nodeIdentity = utils.create2Address(await factoryContract.getAddress(), bytecodeHash, salt, ethers.AbiCoder.defaultAbiCoder().encode(['address'], [address]));
                smartAccountAddr = nodeIdentity;
                console.log(inf(\`\${label} deterministik Smart Account adresi: \${nodeIdentity}\`));
                
                // Cüzdanı oluştur
                const txDeploy = await factoryContract.deployAccount(salt, address, { gasLimit: 5_000_000 });
                await txDeploy.wait();
                console.log(ok(\`\${label} Smart Account ağa deploy edildi.\`));
            } catch (err) {
                console.log(inf(\`\${label} Smart Account deploy atlandı (zaten olabilir): \${err.message.split('\\n')[0]}\`));
            }
        }

        try {
            const nodeWallet = new Wallet(pk, provider);`;

code = code.replace(
    /try \{\s*const nodeWallet = new Wallet\(pk, provider\);/,
    nodeIdentityReplace
);

// Use nodeIdentity inside registerNode
code = code.replace(
    /nodeAddress: address,/g, // replace if exists
    `nodeAddress: nodeIdentity,`
);
code = code.replace(
    /address, \/\/\s*This is now groupId/g,
    `address, \n                nodeType,`
);
code = code.replace(
    /address,\s*nodeType,\s*\/\/\s*This is now groupId/g,
    `nodeIdentity, \n                nodeType,`
);

// Return smartAccountAddr
code = code.replace(
    /return \{ address, nodeId, txHash: receipt\.hash, method: 'registerNode' \};/g,
    `return { address, nodeId, txHash: receipt.hash, method: 'registerNode', smartAccount: smartAccountAddr };`
);

// Phase 4 usages
code = code.replace(
    /results\.manager = await registerOne\('Manager', MANAGER_PK, GroupId\.MANAGER, AccessLevel\.FULL_ACCESS, MANAGER_ROLE, 'SYSTEM_ADMIN'\);/g,
    `results.manager = await registerOne('Manager', MANAGER_PK, GroupId.MANAGER, AccessLevel.FULL_ACCESS, MANAGER_ROLE, 'MANAGER', false);`
);
code = code.replace(
    /results\.engineer = await registerOne\('Engineer', ENGINEER_PK, GroupId\.FAILURE_ANALYZER, AccessLevel\.WRITE_LIMITED, ENGINEER_ROLE, 'ENGINEER'\);/g,
    `results.engineer = await registerOne('Engineer', ENGINEER_PK, GroupId.FAILURE_ANALYZER, AccessLevel.WRITE_LIMITED, ENGINEER_ROLE, 'ENGINEER', true);`
);
code = code.replace(
    /results\.operator = await registerOne\('Operator', OPERATOR_PK, GroupId\.DATA_PROCESSOR, AccessLevel\.WRITE_LIMITED, OPERATOR_ROLE, 'OPERATOR'\);/g,
    `results.operator = await registerOne('Operator', OPERATOR_PK, GroupId.DATA_PROCESSOR, AccessLevel.WRITE_LIMITED, OPERATOR_ROLE, 'OPERATOR', true);`
);

// main() invocation
code = code.replace(
    /await phase4_register_nodes\(acAddress, acAbi, provider, ownerWallet\);/g,
    `await phase4_register_nodes(acAddress, acAbi, provider, ownerWallet, deployed.factory.contract);`
);

// Add to deployment JSON
code = code.replace(
    /pdmSystem: \`https:\/\/sepolia\.explorer\.zksync\.io\/address\/\$\{pdmAddress\}\`,\s*\},\s*\};/s,
    `pdmSystem: \`https://sepolia.explorer.zksync.io/address/\${pdmAddress}\`,\n        },\n        smartAccounts: {\n            factory: deployed.factory?.address,\n            engineer: nodeResults?.engineer?.smartAccount,\n            operator: nodeResults?.operator?.smartAccount\n        }\n    };`
);

// Add to env
code = code.replace(
    /\[\'VERIFIER_ADDRESS\', verAddress\],/g,
    `['VERIFIER_ADDRESS', verAddress],\n            ['FACTORY_ADDRESS', deployed.factory?.address],\n            ['ENGINEER_SMART_ACCOUNT', nodeResults?.engineer?.smartAccount || ''],\n            ['OPERATOR_SMART_ACCOUNT', nodeResults?.operator?.smartAccount || ''],`
);
code = code.replace(
    /PDM_SYSTEM_ADDRESS, ACCESS_CONTROL_ADDRESS, VERIFIER_ADDRESS/g,
    `PDM_SYSTEM_ADDRESS, ACCESS_CONTROL_ADDRESS, VERIFIER_ADDRESS, FACTORY, SMART_ACCOUNTS`
);

fs.writeFileSync(target, code, 'utf8');
console.log('deploy_all.js patched successfully!');
