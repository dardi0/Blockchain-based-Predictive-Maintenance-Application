/**
 * SA Node Registration via Owner EOA (No AA Required)
 *
 * Strategy: Owner EOA calls registerNode(name, saAddr, groupId, ...).
 * Because nodeAddress != msg.sender, AccessControlRegistry pushes nodeId into
 * BOTH addressToNodes[ownerEOA] AND addressToNodes[saAddr].
 * _autoGrantPermissions then sets nodePermissions for all group resources.
 * Since requireApprovalForAccess=true, node starts INACTIVE — owner activates it.
 * Result: checkAccess(saAddr, resource, WRITE_LIMITED) returns true.
 *
 * No AA transactions, no ECDSASmartAccount, no bootloader — just plain EOA calls.
 *
 * Run: node scripts/register_sa_via_owner.js
 */

require('dotenv').config();
const { ethers } = require('ethers');
const { Provider, Wallet } = require('zksync-ethers');
const fs = require('fs');
const path = require('path');

const NodeStatus = { INACTIVE: 0, ACTIVE: 1, SUSPENDED: 2 };
const AccessLevel = { NO_ACCESS: 0, READ_ONLY: 1, WRITE_LIMITED: 2, FULL_ACCESS: 3, ADMIN_ACCESS: 4 };

async function registerAndActivate(acContract, ownerWallet, saAddr, groupId, label) {
    console.log('\n=== ' + label + ' SA ===');
    console.log('  SA address:', saAddr);

    // Step 1: Check if already registered
    const existing = await acContract.getNodesByAddress(saAddr);
    if (existing.length > 0) {
        console.log('  Already registered — nodeId:', existing[0].slice(0, 18) + '...');
        // Check if it's active
        const node = await acContract.getNode(existing[0]);
        if (node.status === BigInt(NodeStatus.ACTIVE)) {
            console.log('  Node is ACTIVE — skipping activation.');
        } else {
            console.log('  Node is INACTIVE — activating...');
            const tx = await acContract.changeNodeStatus(existing[0], NodeStatus.ACTIVE, { gasLimit: 300_000 });
            await tx.wait();
            console.log('  Activated!');
        }
        return existing[0];
    }

    // Step 2: Register — owner EOA as msg.sender, saAddr as nodeAddress
    // Both addressToNodes[ownerEOA] and addressToNodes[saAddr] get the nodeId
    console.log('  Registering via owner EOA...');
    const metadata = JSON.stringify({ registeredBy: 'register_sa_via_owner', ts: Date.now(), role: label });
    try {
        const tx = await acContract.registerNode(
            label + ' Smart Account',
            saAddr,
            groupId,
            AccessLevel.WRITE_LIMITED,
            0,           // accessDuration=0 → no expiry
            metadata,
            { gasLimit: 600_000 }
        );
        const receipt = await tx.wait();
        console.log('  registerNode TX:', receipt.hash);

        // Parse NodeRegistered event to get nodeId
        const acInterface = acContract.interface;
        let nodeId = null;
        for (const log of receipt.logs) {
            try {
                const parsed = acInterface.parseLog(log);
                if (parsed && parsed.name === 'NodeRegistered') {
                    nodeId = parsed.args.nodeId;
                    break;
                }
            } catch (_) { /* skip unparseable logs */ }
        }

        if (!nodeId) {
            // Fallback: read from addressToNodes
            const byAddr = await acContract.getNodesByAddress(saAddr);
            if (byAddr.length > 0) nodeId = byAddr[0];
        }

        if (!nodeId) {
            console.log('  ERROR: Could not determine nodeId after registration');
            return null;
        }
        console.log('  Registered! nodeId:', nodeId.slice(0, 18) + '...');

        // Step 3: Activate — requireApprovalForAccess=true means node starts INACTIVE
        // owner() is always allowed to activate
        console.log('  Activating node...');
        const activateTx = await acContract.changeNodeStatus(nodeId, NodeStatus.ACTIVE, { gasLimit: 300_000 });
        await activateTx.wait();
        console.log('  Activated!');

        return nodeId;
    } catch (e) {
        console.log('  ERROR:', e.message.slice(0, 250));
        return null;
    }
}

async function verifyAccess(acContract, pdmContract, saAddr, label) {
    console.log('\n--- Verifying access for ' + label + ' SA ---');
    const resources = [
        ['SENSOR_DATA',  await pdmContract.SENSOR_DATA_RESOURCE()],
        ['PREDICTION',   await pdmContract.PREDICTION_RESOURCE()],
        ['FAULT_RECORD', await pdmContract.FAULT_RECORD_RESOURCE()],
        ['TRAINING',     await pdmContract.TRAINING_RESOURCE()],
        ['REPORT',       await pdmContract.REPORT_RESOURCE()],
    ];

    for (const [name, rid] of resources) {
        try {
            const [hasAccess, reason] = await acContract.checkAccess(saAddr, rid, AccessLevel.WRITE_LIMITED);
            console.log('  ' + name + ':', hasAccess ? 'GRANTED ✓' : 'DENIED — ' + reason);
        } catch (e) {
            console.log('  ' + name + ': checkAccess error:', e.message.slice(0, 80));
        }
    }
}

async function ensureGroupsConfigured(acContract, pdmContract) {
    const resHash = (name) => ethers.keccak256(ethers.toUtf8Bytes(name));
    const FAILURE_ANALYZER = ethers.encodeBytes32String('FAILURE_ANALYZER');
    const DATA_PROCESSOR   = ethers.encodeBytes32String('DATA_PROCESSOR');

    const ENGINEER_ROLE = ethers.keccak256(ethers.toUtf8Bytes('ENGINEER_ROLE'));
    const OPERATOR_ROLE = ethers.keccak256(ethers.toUtf8Bytes('OPERATOR_ROLE'));

    // Check current state
    const faGroup = await acContract.nodeGroups(FAILURE_ANALYZER);
    const dpGroup = await acContract.nodeGroups(DATA_PROCESSOR);

    if (!faGroup[0]) { // isActive = false
        console.log('  Configuring FAILURE_ANALYZER group...');
        const tx = await acContract.setNodeGroup(
            FAILURE_ANALYZER, true, false, ENGINEER_ROLE,
            [resHash('PREDICTION'), resHash('SENSOR_DATA'), resHash('FAULT_RECORD'), resHash('TRAINING'), resHash('REPORT')],
            { gasLimit: 500_000 }
        );
        await tx.wait();
        console.log('  FAILURE_ANALYZER configured.');
    } else {
        console.log('  FAILURE_ANALYZER group already active.');
    }

    if (!dpGroup[0]) {
        console.log('  Configuring DATA_PROCESSOR group...');
        const tx = await acContract.setNodeGroup(
            DATA_PROCESSOR, true, false, OPERATOR_ROLE,
            [resHash('SENSOR_DATA'), resHash('FAULT_RECORD')],
            { gasLimit: 500_000 }
        );
        await tx.wait();
        console.log('  DATA_PROCESSOR configured.');
    } else {
        console.log('  DATA_PROCESSOR group already active.');
    }
}

async function main() {
    const provider = new Provider(process.env.ZKSYNC_ERA_RPC_URL);
    const ownerWallet = new Wallet(
        process.env.CONTRACT_OWNER_PRIVATE_KEY || process.env.PRIVATE_KEY,
        provider
    );

    const engSA = process.env.ENGINEER_SMART_ACCOUNT;
    const opSA  = process.env.OPERATOR_SMART_ACCOUNT;
    const acAddr  = process.env.ACCESS_CONTROL_ADDRESS;
    const pdmAddr = process.env.PDM_SYSTEM_ADDRESS;

    console.log('Owner wallet:', ownerWallet.address);
    console.log('ENGINEER SA: ', engSA);
    console.log('OPERATOR SA: ', opSA);
    console.log('AccessControl:', acAddr);

    const acArt  = JSON.parse(fs.readFileSync(
        path.resolve('./artifacts-zk/contracts/AccessControlRegistry.sol/AccessControlRegistry.json'), 'utf8'));
    const pdmArt = JSON.parse(fs.readFileSync(
        path.resolve('./artifacts-zk/contracts/PdMSystemHybrid.sol/PdMSystemHybrid.json'), 'utf8'));

    const acContract  = new ethers.Contract(acAddr, acArt.abi, ownerWallet);
    const pdmContract = new ethers.Contract(pdmAddr, pdmArt.abi, provider);

    const FAILURE_ANALYZER = ethers.encodeBytes32String('FAILURE_ANALYZER');
    const DATA_PROCESSOR   = ethers.encodeBytes32String('DATA_PROCESSOR');

    // Step 0: Ensure node groups are configured (setNodeGroup)
    console.log('\n=== Configuring Node Groups ===');
    await ensureGroupsConfigured(acContract, pdmContract);

    // Register + activate ENGINEER SA
    await registerAndActivate(acContract, ownerWallet, engSA, FAILURE_ANALYZER, 'ENGINEER SA');

    // Register + activate OPERATOR SA
    await registerAndActivate(acContract, ownerWallet, opSA, DATA_PROCESSOR, 'OPERATOR SA');

    // Register + activate ENGINEER EOA (fallback path in Python backend)
    const engEoaAddr = new ethers.Wallet(process.env.ENGINEER_PRIVATE_KEY).address;
    const opEoaAddr  = new ethers.Wallet(process.env.OPERATOR_PRIVATE_KEY).address;
    await registerAndActivate(acContract, ownerWallet, engEoaAddr, FAILURE_ANALYZER, 'ENGINEER EOA');
    await registerAndActivate(acContract, ownerWallet, opEoaAddr, DATA_PROCESSOR, 'OPERATOR EOA');

    // Register + activate MANAGER EOA (default_signer_role fallback in handler)
    // Uses FAILURE_ANALYZER group so it gets full resource access (SENSOR_DATA + all)
    if (process.env.MANAGER_PRIVATE_KEY) {
        const mgrEoaAddr = new ethers.Wallet(process.env.MANAGER_PRIVATE_KEY).address;
        await registerAndActivate(acContract, ownerWallet, mgrEoaAddr, FAILURE_ANALYZER, 'MANAGER EOA');
    } else {
        console.log('\n=== MANAGER EOA ===');
        console.log('  MANAGER_PRIVATE_KEY not set — skipping.');
    }

    // Verify access for all registered addresses
    await verifyAccess(acContract, pdmContract, engSA, 'ENGINEER SA');
    await verifyAccess(acContract, pdmContract, opSA, 'OPERATOR SA');
    await verifyAccess(acContract, pdmContract, engEoaAddr, 'ENGINEER EOA');
    await verifyAccess(acContract, pdmContract, opEoaAddr, 'OPERATOR EOA');
    if (process.env.MANAGER_PRIVATE_KEY) {
        const mgrEoaAddr = new ethers.Wallet(process.env.MANAGER_PRIVATE_KEY).address;
        await verifyAccess(acContract, pdmContract, mgrEoaAddr, 'MANAGER EOA');
    }

    console.log('\nDone!');
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
