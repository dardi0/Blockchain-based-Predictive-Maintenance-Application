/**
 * Execute a pending VK change after the 48-hour timelock has elapsed.
 *
 * Usage:
 *   node scripts/execute_vk_change.js [circuitTypeId]
 *
 * circuitTypeId defaults to 7 (BATCH_SENSOR).
 * The proposeVKChange TX must have been sent ≥48 hours ago
 * (either by the Python handler automatically, or by proposing manually).
 *
 * CircuitType enum:
 *   0=SENSOR_DATA  1=PREDICTION  2=MAINTENANCE  3=LEGACY
 *   4=FAULT_RECORD 5=TRAINING_RECORD 6=REPORT_RECORD 7=BATCH_SENSOR
 */

require('dotenv').config();
const { ethers } = require('ethers');
const { Provider, Wallet } = require('zksync-ethers');
const fs = require('fs');
const path = require('path');

const CIRCUIT_TYPE_NAMES = {
    0: 'SENSOR_DATA',
    1: 'PREDICTION',
    2: 'MAINTENANCE',
    3: 'LEGACY',
    4: 'FAULT_RECORD',
    5: 'TRAINING_RECORD',
    6: 'REPORT_RECORD',
    7: 'BATCH_SENSOR',
};

async function main() {
    const circuitTypeId = parseInt(process.argv[2] ?? '7', 10);
    const circuitName = CIRCUIT_TYPE_NAMES[circuitTypeId] ?? `TYPE_${circuitTypeId}`;

    const rpcUrl  = process.env.ZKSYNC_ERA_RPC_URL;
    const ownerPk = process.env.CONTRACT_OWNER_PRIVATE_KEY
                 || process.env.PRIVATE_KEY
                 || process.env.MANAGER_PRIVATE_KEY;

    if (!rpcUrl || !ownerPk) {
        throw new Error('ZKSYNC_ERA_RPC_URL and CONTRACT_OWNER_PRIVATE_KEY are required in .env');
    }

    const provider = new Provider(rpcUrl);
    const wallet   = new Wallet(ownerPk, provider);
    console.log(`\nWallet: ${wallet.address}`);

    const deployInfoPath = path.resolve(__dirname, '../deployment_info_hybrid_ZKSYNC_ERA.json');
    const artifactPath   = path.resolve(
        __dirname,
        '../artifacts-zk/contracts/UnifiedGroth16Verifier.sol/UnifiedGroth16Verifier.json'
    );

    const deployInfo      = JSON.parse(fs.readFileSync(deployInfoPath, 'utf8'));
    const verifierAddress = deployInfo.contracts?.UnifiedGroth16Verifier?.address;
    if (!verifierAddress) throw new Error('UnifiedGroth16Verifier address not found in deployment info');

    console.log(`UnifiedGroth16Verifier: ${verifierAddress}`);

    const verifierAbi = JSON.parse(fs.readFileSync(artifactPath, 'utf8')).abi;
    const verifier    = new ethers.Contract(verifierAddress, verifierAbi, wallet);

    // Check pending proposal status
    const [exists, proposedAt, executeAfter, icLength] =
        await verifier.getPendingVKChange(circuitTypeId);

    if (!exists) {
        console.error(
            `\nNo pending VK change for circuit ${circuitTypeId} (${circuitName}).`
        );
        console.error(
            'The Python backend proposes this automatically when it detects a zkey mismatch.\n' +
            'Restart the API to trigger the detection, or check handler logs.'
        );
        process.exit(1);
    }

    const now = Math.floor(Date.now() / 1000);
    const remaining = Number(executeAfter) - now;

    console.log(`\nPending VK change for ${circuitName} (type=${circuitTypeId}):`);
    console.log(`  Proposed at : ${new Date(Number(proposedAt) * 1000).toISOString()}`);
    console.log(`  Execute after: ${new Date(Number(executeAfter) * 1000).toISOString()}`);
    console.log(`  IC length   : ${icLength}`);

    if (remaining > 0) {
        const h = Math.floor(remaining / 3600);
        const m = Math.floor((remaining % 3600) / 60);
        console.error(`\nTimelock not elapsed yet. ${h}h ${m}m remaining.`);
        process.exit(1);
    }

    console.log(`\nTimelock elapsed. Executing VK change...`);
    const tx = await verifier.executeVKChange(circuitTypeId, { gasLimit: 500_000 });
    console.log(`  TX sent: ${tx.hash}`);
    const receipt = await tx.wait();

    if (receipt.status === 1) {
        console.log(`\nVK change executed for ${circuitName} (type=${circuitTypeId})`);
        console.log(`  Block: ${receipt.blockNumber}`);
        console.log(`  Gas  : ${receipt.gasUsed}`);

        // Update Python-compatible marker files so the API stops blocking submissions.
        const CIRCUIT_FILE_NAMES = {
            0: 'sensor_data_proof',
            1: 'prediction_proof',
            2: 'maintenance_proof',
            4: 'fault_record_proof',
            5: 'training_record_proof',
            6: 'report_record_proof',
            7: 'batch_sensor_proof',
        };
        const circuitFileName = CIRCUIT_FILE_NAMES[circuitTypeId];
        if (circuitFileName) {
            const tempDir      = path.resolve(__dirname, '../temp/zk_proofs');
            const zkeyPath     = path.join(tempDir, `${circuitFileName}.zkey`);
            const markerPath   = path.join(tempDir, `${circuitFileName}.vk_mtime`);
            const deadlinePath = path.join(tempDir, `${circuitFileName}.vk_proposal_deadline`);
            try {
                if (fs.existsSync(zkeyPath)) {
                    const mtime = fs.statSync(zkeyPath).mtimeMs / 1000;
                    fs.writeFileSync(markerPath, String(mtime), 'utf8');
                    console.log(`  Mtime marker updated: ${markerPath}`);
                }
                if (fs.existsSync(deadlinePath)) {
                    fs.unlinkSync(deadlinePath);
                    console.log(`  Deadline marker removed: ${deadlinePath}`);
                }
            } catch (e) {
                console.warn(`  Warning: could not update marker files: ${e.message}`);
            }
        }

        console.log('\nBatch submissions should now succeed. Restart the API to clear any cached state.');
    } else {
        console.error(`\nTX failed. Hash: ${receipt.hash}`);
        process.exit(1);
    }
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
