/**
 * SA Node Registration via executeTransactionFromOutside
 *
 * Instead of type-113 AA TX (which fails during bootloader AA validation),
 * we call sa.executeTransactionFromOutside(tx) as a regular ETH TX from
 * the engineer/operator EOA. The SA validates the signature internally
 * using encodeHash() — which works in regular execution mode (no 0xffeb
 * restriction). The SA then calls AccessControlRegistry.registerNode()
 * with msg.sender = saAddr, populating addressToNodes[saAddr].
 *
 * Run: node scripts/register_sa_outside.js
 */

require('dotenv').config();
const { Provider, Wallet, utils, EIP712Signer } = require('zksync-ethers');
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

const CHAIN_ID = 300;  // zkSync Era Sepolia

async function registerSA(provider, engineerWallet, saAddr, acAddr, acInterface, label) {
    const FAILURE_ANALYZER = ethers.encodeBytes32String('FAILURE_ANALYZER');
    const DATA_PROCESSOR   = ethers.encodeBytes32String('DATA_PROCESSOR');
    const groupId = label === 'ENGINEER' ? FAILURE_ANALYZER : DATA_PROCESSOR;

    const calldata = acInterface.encodeFunctionData('registerNode', [
        label + ' Smart Account',
        saAddr,
        groupId,
        2,  // WRITE_LIMITED
        0,
        JSON.stringify({ registeredBy: 'register_sa_outside', ts: Date.now() }),
    ]);

    // Get nonce for the SA (used as nonce in the inner Transaction struct)
    const nonce = await provider.getTransactionCount(saAddr);
    const gasPrice = (await provider.getFeeData()).gasPrice || BigInt(25_000_000);

    // Build the Transaction struct that the SA will sign-check and execute
    // Matches the struct in TransactionHelper.sol
    const innerTx = {
        txType:                 BigInt(113),   // EIP-712 type
        from:                   BigInt(saAddr),
        to:                     BigInt(acAddr),
        gasLimit:               BigInt(1_000_000),
        gasPerPubdataByteLimit: BigInt(utils.DEFAULT_GAS_PER_PUBDATA_LIMIT),
        maxFeePerGas:           gasPrice,
        maxPriorityFeePerGas:   gasPrice,
        paymaster:              BigInt(0),
        nonce:                  BigInt(nonce),
        value:                  BigInt(0),
        reserved:               [BigInt(0), BigInt(0), BigInt(0), BigInt(0)],
        data:                   ethers.getBytes(calldata),
        signature:              new Uint8Array(0),
        factoryDeps:            [],
        paymasterInput:         new Uint8Array(0),
        reservedDynamic:        new Uint8Array(0),
    };

    // Compute EIP-712 digest — must match encodeHash() in TransactionHelper
    const digest = EIP712Signer.getSignedDigest({ ...innerTx, chainId: CHAIN_ID });
    console.log('  digest:', digest.slice(0, 18) + '...');

    // Sign with engineer's private key
    const sig = engineerWallet.signingKey.sign(digest).serialized;
    innerTx.signature = ethers.getBytes(sig);
    console.log('  signature length:', innerTx.signature.length, 'bytes');

    // SA ABI — just the executeTransactionFromOutside function
    const saAbi = [
        'function executeTransactionFromOutside((uint256 txType, uint256 from, uint256 to, uint256 gasLimit, uint256 gasPerPubdataByteLimit, uint256 maxFeePerGas, uint256 maxPriorityFeePerGas, uint256 paymaster, uint256 nonce, uint256 value, uint256[4] reserved, bytes data, bytes signature, bytes32[] factoryDeps, bytes paymasterInput, bytes reservedDynamic) _transaction) payable',
        'function owner() view returns (address)',
    ];
    const saContract = new ethers.Contract(saAddr, saAbi, engineerWallet);

    // Verify SA owner matches our signer
    const owner = await saContract.owner();
    console.log('  SA owner:', owner);
    console.log('  Our signer:', engineerWallet.address);
    console.log('  Owner match:', owner.toLowerCase() === engineerWallet.address.toLowerCase());

    // Call executeTransactionFromOutside as a regular TX from the engineer EOA
    console.log('  Calling executeTransactionFromOutside...');
    try {
        const tx = await saContract.executeTransactionFromOutside(innerTx, {
            gasLimit: 2_000_000,
        });
        const receipt = await tx.wait();
        console.log('  TX hash:', receipt.hash);
        console.log('  Status:', receipt.status === 1 ? 'SUCCESS' : 'FAILED');
        return receipt.status === 1;
    } catch (e) {
        const msg = e.message || String(e);
        console.log('  ERROR:', msg.slice(0, 250));
        return false;
    }
}

async function main() {
    const provider  = new Provider(process.env.ZKSYNC_ERA_RPC_URL);
    const ownerWallet    = new Wallet(process.env.CONTRACT_OWNER_PRIVATE_KEY || process.env.PRIVATE_KEY, provider);
    const engineerWallet = new Wallet(process.env.ENGINEER_PRIVATE_KEY, provider);
    const operatorWallet = new Wallet(process.env.OPERATOR_PRIVATE_KEY, provider);

    const engSA = process.env.ENGINEER_SMART_ACCOUNT;
    const opSA  = process.env.OPERATOR_SMART_ACCOUNT;
    const acAddr = process.env.ACCESS_CONTROL_ADDRESS;

    const acArt = JSON.parse(fs.readFileSync(
        path.resolve('./artifacts-zk/contracts/AccessControlRegistry.sol/AccessControlRegistry.json'),
        'utf8'));
    const acInterface = new ethers.Interface(acArt.abi);

    console.log('=== ENGINEER SA Registration ===');
    console.log('SA:', engSA);
    const engOk = await registerSA(provider, engineerWallet, engSA, acAddr, acInterface, 'ENGINEER');

    console.log('\n=== OPERATOR SA Registration ===');
    console.log('SA:', opSA);
    const opOk = await registerSA(provider, operatorWallet, opSA, acAddr, acInterface, 'OPERATOR');

    if (!engOk && !opOk) {
        console.log('\nBoth registrations failed. Checking if already registered...');
    }

    // Check node registration
    const acContract = new ethers.Contract(acAddr, acArt.abi, provider);
    for (const [label, addr] of [['ENGINEER', engSA], ['OPERATOR', opSA]]) {
        try {
            const nodes = await acContract.getNodesByAddress(addr);
            console.log('\n' + label + ' SA nodes:', nodes.length > 0 ? nodes[0].slice(0, 18) + '...' : 'NONE');
        } catch (e) {
            console.log('\n' + label + ' getNodesByAddress error:', e.message.slice(0, 80));
        }
    }

    // If registered, grant resource access via owner
    console.log('\n=== Granting Resource Access ===');
    const pdmArt = JSON.parse(fs.readFileSync(
        path.resolve('./artifacts-zk/contracts/PdMSystemHybrid.sol/PdMSystemHybrid.json'),
        'utf8'));
    const pdmAddr = process.env.PDM_SYSTEM_ADDRESS;
    const pdm = new ethers.Contract(pdmAddr, pdmArt.abi, provider);
    const acOwner = new ethers.Contract(acAddr, acArt.abi, ownerWallet);

    const resources = [
        ['SENSOR_DATA',  await pdm.SENSOR_DATA_RESOURCE()],
        ['PREDICTION',   await pdm.PREDICTION_RESOURCE()],
        ['FAULT_RECORD', await pdm.FAULT_RECORD_RESOURCE()],
        ['TRAINING',     await pdm.TRAINING_RESOURCE()],
        ['REPORT',       await pdm.REPORT_RESOURCE()],
    ];

    for (const [label, addr] of [['ENGINEER', engSA], ['OPERATOR', opSA]]) {
        const nodes = await acContract.getNodesByAddress(addr);
        if (nodes.length === 0) {
            console.log(label + ': No node registered, skipping resource grants');
            continue;
        }
        const nodeId = nodes[0];
        const grants = label === 'ENGINEER' ? resources : resources.slice(0, 2);  // Operator gets SENSOR_DATA + FAULT_RECORD
        console.log('\n' + label + ' nodeId:', nodeId.slice(0, 18) + '...');
        for (const [rname, rid] of grants) {
            try {
                const [hasAccess] = await acContract.checkAccess(addr, rid, 2);
                if (hasAccess) { console.log('  ' + rname + ': already granted'); continue; }
                const tx = await acOwner.grantEmergencyAccess(nodeId, rid, 'SA access for ' + label, { gasLimit: 500_000 });
                await tx.wait();
                console.log('  ' + rname + ': GRANTED');
            } catch (e) {
                console.log('  ' + rname + ': ERROR', e.message.slice(0, 80));
            }
        }
    }

    console.log('\nDone!');
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
