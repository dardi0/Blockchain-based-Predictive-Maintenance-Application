/**
 * Chainlink Functions - PDM Report Generation
 *
 * This script runs on Chainlink DON to:
 * 1. Fetch sensor and prediction data from backend API
 * 2. Generate summary statistics
 * 3. Return report hash (IPFS CID or similar)
 *
 * Secrets required:
 * - automationApiKey: API key for backend authentication
 * - apiEndpoint: Backend API URL
 */

// Get configuration from args and secrets
const requestType = args[0] || "report";
const apiEndpoint = secrets.apiEndpoint || "http://localhost:8000";
const automationApiKey = secrets.automationApiKey || "";

if (requestType !== "report") {
    throw Error("Invalid request type");
}

// Fetch report data from backend
const reportResponse = await Functions.makeHttpRequest({
    url: `${apiEndpoint}/export/report?format=json&days=1`,
    method: "GET",
    headers: {
        "Content-Type": "application/json",
        "X-Automation-Key": automationApiKey
    },
    timeout: 15000
});

if (reportResponse.error) {
    throw Error(`Failed to fetch report data: ${reportResponse.error}`);
}

const reportData = reportResponse.data;

// Calculate summary statistics
const summary = {
    timestamp: Date.now(),
    period: "daily",
    totalRecords: reportData.data ? reportData.data.length : 0,
    failuresDetected: 0,
    normalOperations: 0,
    avgConfidence: 0,
    machines: new Set()
};

if (reportData.data && reportData.data.length > 0) {
    let totalConfidence = 0;

    for (const record of reportData.data) {
        summary.machines.add(record.machine_id);

        if (record.prediction === 1) {
            summary.failuresDetected++;
        } else if (record.prediction === 0) {
            summary.normalOperations++;
        }

        if (record.prediction_probability) {
            totalConfidence += record.prediction_probability;
        }
    }

    summary.uniqueMachines = summary.machines.size;
    summary.avgConfidence = totalConfidence / reportData.data.length;
}

// Generate report hash (simple hash for now - in production use IPFS)
function generateReportHash(data) {
    const str = JSON.stringify(data);
    let hash = 0x811c9dc5; // FNV-1a offset basis
    for (let i = 0; i < str.length; i++) {
        hash ^= str.charCodeAt(i);
        hash = (hash * 0x01000193) >>> 0; // FNV prime
    }
    return hash.toString(16).padStart(8, '0');
}

const reportHash = `pdm-report-${new Date().toISOString().split('T')[0]}-${generateReportHash(summary)}`;

// Log summary for debugging
console.log(`Report generated: ${reportHash}`);
console.log(`Total records: ${summary.totalRecords}`);
console.log(`Failures detected: ${summary.failuresDetected}`);
console.log(`Normal operations: ${summary.normalOperations}`);

// Save report to backend (optional)
try {
    await Functions.makeHttpRequest({
        url: `${apiEndpoint}/reports`,
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-Automation-Key": automationApiKey
        },
        data: {
            title: `Automated Daily Report - ${new Date().toISOString().split('T')[0]}`,
            content: JSON.stringify({
                ...summary,
                machines: Array.from(summary.machines),
                generatedBy: "Chainlink Functions",
                reportHash: reportHash
            }),
            created_by: "Chainlink Automation"
        },
        timeout: 5000
    });
} catch (saveError) {
    console.log(`Warning: Could not save report to backend: ${saveError}`);
}

// Return report hash as string
return Functions.encodeString(reportHash);
