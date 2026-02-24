/**
 * Chainlink Functions - PDM Prediction Inference
 *
 * This script runs on Chainlink DON to:
 * 1. Fetch sensor data from backend API
 * 2. Run lightweight ML inference
 * 3. Return prediction + confidence + dataHash
 *
 * Secrets required:
 * - automationApiKey: API key for backend authentication
 * - apiEndpoint: Backend API URL
 */

// Get configuration from args and secrets
const requestType = args[0] || "prediction";
const apiEndpoint = secrets.apiEndpoint || "http://localhost:8000";
const automationApiKey = secrets.automationApiKey || "";

if (requestType !== "prediction") {
    throw Error("Invalid request type");
}

// Fetch latest sensor data batch from backend
const sensorResponse = await Functions.makeHttpRequest({
    url: `${apiEndpoint}/automation/sensor-batch?limit=1`,
    method: "GET",
    headers: {
        "Content-Type": "application/json",
        "X-Automation-Key": automationApiKey
    },
    timeout: 10000
});

if (sensorResponse.error) {
    throw Error(`Failed to fetch sensor data: ${sensorResponse.error}`);
}

const data = sensorResponse.data;
if (!data.sensors || data.sensors.length === 0) {
    throw Error("No sensor data available for prediction");
}

const sensor = data.sensors[0];

// Feature normalization parameters (from training)
const NORMALIZATION = {
    air_temp: { min: 295.0, max: 305.0 },
    process_temp: { min: 305.0, max: 315.0 },
    rotation_speed: { min: 1000, max: 3000 },
    torque: { min: 3.0, max: 77.0 },
    tool_wear: { min: 0, max: 300 }
};

// Normalize features
function normalize(value, min, max) {
    return (value - min) / (max - min);
}

const features = [
    normalize(sensor.air_temp, NORMALIZATION.air_temp.min, NORMALIZATION.air_temp.max),
    normalize(sensor.process_temp, NORMALIZATION.process_temp.min, NORMALIZATION.process_temp.max),
    normalize(sensor.rotation_speed, NORMALIZATION.rotation_speed.min, NORMALIZATION.rotation_speed.max),
    normalize(sensor.torque, NORMALIZATION.torque.min, NORMALIZATION.torque.max),
    normalize(sensor.tool_wear, NORMALIZATION.tool_wear.min, NORMALIZATION.tool_wear.max)
];

// Model weights (simplified linear model - in production use TFLite/ONNX)
// These weights are derived from the LSTM-CNN model's feature importance
const WEIGHTS = [0.15, 0.20, 0.10, 0.35, 0.20];
const BIAS = -0.3;
const THRESHOLD = 0.5;

// Calculate prediction score
let score = BIAS;
for (let i = 0; i < features.length; i++) {
    score += features[i] * WEIGHTS[i];
}

// Apply sigmoid activation
const sigmoid = 1 / (1 + Math.exp(-score * 5)); // Scaled sigmoid

// Rule-based overrides for definite failure conditions
let hasDefiniteFailure = false;
const failureReasons = [];

// Temperature differential check
const tempDiff = sensor.process_temp - sensor.air_temp;
if (tempDiff > 12) {
    hasDefiniteFailure = true;
    failureReasons.push("High temperature differential");
}

// Tool wear check
if (sensor.tool_wear > 200) {
    hasDefiniteFailure = true;
    failureReasons.push("Excessive tool wear");
}

// Power calculation (approximation)
const power = (sensor.rotation_speed * sensor.torque) / 9549;
if (power > 9) {
    hasDefiniteFailure = true;
    failureReasons.push("Power overload");
}

// Heat dissipation factor
if (tempDiff > 10 && sensor.rotation_speed < 1400) {
    hasDefiniteFailure = true;
    failureReasons.push("Heat dissipation failure");
}

// Final prediction
const prediction = hasDefiniteFailure ? 1 : (sigmoid > THRESHOLD ? 1 : 0);
const confidence = hasDefiniteFailure ? 9500 : Math.floor(sigmoid * 10000); // 0-10000 scale

// Calculate data hash (keccak256 equivalent using simple hash)
function simpleHash(data) {
    let hash = 0;
    const str = JSON.stringify(data);
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return hash >>> 0; // Ensure unsigned
}

const dataHash = simpleHash({
    machine_id: sensor.machine_id,
    air_temp: sensor.air_temp,
    process_temp: sensor.process_temp,
    rotation_speed: sensor.rotation_speed,
    torque: sensor.torque,
    tool_wear: sensor.tool_wear,
    timestamp: sensor.timestamp
});

// Encode response: machineId (uint256) + prediction (uint256) + confidence (uint256) + dataHash (bytes32)
// Using Functions.encodeUint256 for each value
const machineIdBytes = Functions.encodeUint256(BigInt(sensor.machine_id));
const predictionBytes = Functions.encodeUint256(BigInt(prediction));
const confidenceBytes = Functions.encodeUint256(BigInt(confidence));
const dataHashBytes = Functions.encodeUint256(BigInt(dataHash));

// Concatenate all bytes
const result = new Uint8Array(128);
result.set(machineIdBytes, 0);
result.set(predictionBytes, 32);
result.set(confidenceBytes, 64);
result.set(dataHashBytes, 96);

return result;
