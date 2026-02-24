const circomlibjs = require("circomlibjs");
const readline = require("readline");

// Singleton Poseidon instance
let poseidonInstance = null;

async function getPoseidon() {
    if (!poseidonInstance) {
        poseidonInstance = await circomlibjs.buildPoseidon();
    }
    return poseidonInstance;
}

// Helper to convert Uint8Array/BigInt to field element string
function toFieldElement(hashResult) {
    if (hashResult instanceof Uint8Array) {
        let bigIntValue = 0n;
        for (let i = 0; i < hashResult.length; i++) {
            bigIntValue = (bigIntValue << 8n) + BigInt(hashResult[i]);
        }
        const BN254_FIELD_SIZE = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
        return (bigIntValue % BN254_FIELD_SIZE).toString();
    }
    return hashResult.toString();
}

async function processLine(line) {
    try {
        if (!line || line.trim() === "") return;

        const request = JSON.parse(line);
        const { id, command, args } = request;

        const poseidon = await getPoseidon();
        let result;

        switch (command) {
            case "sensor":
                // inputs: machineId, timestamp, airTemp, processTemp, rotationalSpeed, torque, toolWear, machineType
                if (args.length !== 8) throw new Error("Sensor requires 8 args");
                const [mId, ts, air, proc, rot, tor, tool, mType] = args;

                const machineTypeMap = { "L": 1, "M": 2, "H": 3 };
                const mTypeInt = machineTypeMap[mType] || mType;

                const inputsSensor = [
                    BigInt(mId),
                    BigInt(ts),
                    BigInt(Math.floor(Number(air) * 100)),
                    BigInt(Math.floor(Number(proc) * 100)),
                    BigInt(rot),
                    BigInt(Math.floor(Number(tor) * 100)),
                    BigInt(tool),
                    BigInt(mTypeInt)
                ];
                result = poseidon(inputsSensor);
                break;

            case "prediction":
                // inputs: dataId, prediction, probabilityInt, modelVersionHash, timestamp
                const inputsPred = args.map(arg => BigInt(arg));
                result = poseidon(inputsPred);
                break;

            case "maintenance":
                // inputs: predictionId, taskType, priority, timestamp
                const inputsMaint = args.map(arg => BigInt(arg));
                result = poseidon(inputsMaint);
                break;

            case "hash":
                const inputsGeneric = args.map(arg => BigInt(arg));
                result = poseidon(inputsGeneric);
                break;

            default:
                throw new Error(`Unknown command: ${command}`);
        }

        const fieldElement = toFieldElement(result);

        console.log(JSON.stringify({
            id: id,
            status: "success",
            result: fieldElement
        }));

    } catch (error) {
        // Safe error handling to keep service alive
        console.log(JSON.stringify({
            id: request ? request.id : null,
            status: "error",
            error: error.message
        }));
    }
}

async function main() {
    // Warm up Poseidon
    await getPoseidon();

    // Signal readiness
    console.log(JSON.stringify({ status: "ready" }));

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: false
    });

    rl.on("line", processLine);
}

main().catch(err => {
    console.error("Fatal service error:", err);
    process.exit(1);
});
