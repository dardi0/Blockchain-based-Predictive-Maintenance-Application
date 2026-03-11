// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "../AccessControlRegistry.sol";

/**
 * @title AutomationCompatibleInterface
 * @dev Minimal interface for Chainlink Automation compatibility
 */
interface AutomationCompatibleInterface {
    function checkUpkeep(bytes calldata checkData) external view returns (bool upkeepNeeded, bytes memory performData);
    function performUpkeep(bytes calldata performData) external;
}

/**
 * @title ChainlinkPdMAutomation
 * @dev Orchestrates automated PDM workflows via Chainlink Automation
 * @notice Handles time-based triggers for sensor data collection, prediction, and report generation
 */
contract ChainlinkPdMAutomation is AutomationCompatibleInterface, Ownable, Pausable {
    // --- Interfaces ---
    AccessControlRegistry public accessRegistry;
    address public pdmSystem;
    address public functionsConsumer;

    // --- Automation Intervals ---
    uint256 public sensorCollectionInterval;    // e.g., 180 = 3 minutes
    uint256 public reportGenerationInterval;    // e.g., 86400 = 1 day
    uint256 public batchFlushInterval;          // e.g., 3600 = 1 hour
    uint256 public lastSensorCollectionTime;
    uint256 public lastReportGenerationTime;
    uint256 public lastBatchFlushTime;

    // --- Threshold Settings ---
    uint256 public failureThreshold;            // e.g., 7000 = 70.00% confidence

    // --- Pending Operations Queue ---
    struct PendingPrediction {
        uint256 machineId;
        bytes32 dataHash;
        uint256 prediction;
        uint256 confidence;
        uint256 timestamp;
        bool processed;
    }

    mapping(uint256 => PendingPrediction) public pendingPredictions;
    uint256 public pendingCount;
    uint256 public processedCount;

    // --- Automation Types ---
    enum AutomationType {
        SENSOR_COLLECTION,  // 0 — Predict every sensorCollectionInterval
        REPORT_GENERATION,  // 1 — Generate report every reportGenerationInterval
        PROCESS_PENDING,    // 2 — Process queued predictions
        BATCH_FLUSH         // 3 — Trigger off-chain ZK batch proof + submitBatch()
    }

    // --- Events ---
    event AutomationTriggered(AutomationType indexed automationType, uint256 timestamp);
    event PredictionQueued(uint256 indexed machineId, bytes32 dataHash, uint256 confidence);
    event FailureDetected(uint256 indexed machineId, uint256 confidence, uint256 timestamp);
    event MaintenanceTaskRequested(uint256 indexed machineId, uint256 predictionId);
    event IntervalUpdated(string intervalType, uint256 newValue);
    event ThresholdUpdated(uint256 newThreshold);
    event FunctionsConsumerUpdated(address newConsumer);
    event BatchFlushRequested(uint256 indexed timestamp, uint256 pendingCount);

    // --- Errors ---
    error TooEarlyForSensorCollection();
    error TooEarlyForReportGeneration();
    error TooEarlyForBatchFlush();
    error NoPendingPredictions();
    error InvalidThreshold();
    error InvalidInterval();
    error UnauthorizedCaller();

    // --- Constructor ---
    constructor(
        address _accessRegistry,
        address _pdmSystem,
        uint256 _sensorInterval,
        uint256 _reportInterval,
        uint256 _failureThreshold
    ) Ownable(msg.sender) {
        if (_sensorInterval == 0 || _reportInterval == 0) revert InvalidInterval();
        if (_failureThreshold > 10000) revert InvalidThreshold();

        accessRegistry = AccessControlRegistry(_accessRegistry);
        pdmSystem = _pdmSystem;
        sensorCollectionInterval = _sensorInterval;
        reportGenerationInterval = _reportInterval;
        failureThreshold = _failureThreshold;

        lastSensorCollectionTime = block.timestamp;
        lastReportGenerationTime = block.timestamp;
        lastBatchFlushTime = block.timestamp;
    }

    // --- Chainlink Automation Interface ---

    /**
     * @notice Checks if upkeep is needed
     * @param checkData Encoded automation type to check (0=sensor, 1=report, 2=pending)
     * @return upkeepNeeded True if automation should run
     * @return performData Data to pass to performUpkeep
     */
    function checkUpkeep(bytes calldata checkData)
        external
        view
        override
        returns (bool upkeepNeeded, bytes memory performData)
    {
        AutomationType checkType = checkData.length > 0
            ? AutomationType(uint8(checkData[0]))
            : AutomationType.SENSOR_COLLECTION;

        if (checkType == AutomationType.SENSOR_COLLECTION) {
            upkeepNeeded = (block.timestamp - lastSensorCollectionTime) >= sensorCollectionInterval;
        } else if (checkType == AutomationType.REPORT_GENERATION) {
            upkeepNeeded = (block.timestamp - lastReportGenerationTime) >= reportGenerationInterval;
        } else if (checkType == AutomationType.PROCESS_PENDING) {
            upkeepNeeded = (pendingCount > processedCount);
        } else if (checkType == AutomationType.BATCH_FLUSH) {
            upkeepNeeded = batchFlushInterval > 0 &&
                (block.timestamp - lastBatchFlushTime) >= batchFlushInterval;
        }

        performData = abi.encode(checkType);
        return (upkeepNeeded, performData);
    }

    /**
     * @notice Executes the automation
     * @param performData Encoded automation type from checkUpkeep
     */
    function performUpkeep(bytes calldata performData) external override whenNotPaused {
        AutomationType automationType = abi.decode(performData, (AutomationType));

        if (automationType == AutomationType.SENSOR_COLLECTION) {
            _triggerSensorCollection();
        } else if (automationType == AutomationType.REPORT_GENERATION) {
            _triggerReportGeneration();
        } else if (automationType == AutomationType.PROCESS_PENDING) {
            _processPendingPredictions();
        } else if (automationType == AutomationType.BATCH_FLUSH) {
            _triggerBatchFlush();
        }
    }

    // --- Internal Automation Functions ---

    function _triggerSensorCollection() internal {
        if ((block.timestamp - lastSensorCollectionTime) < sensorCollectionInterval) {
            revert TooEarlyForSensorCollection();
        }

        lastSensorCollectionTime = block.timestamp;
        emit AutomationTriggered(AutomationType.SENSOR_COLLECTION, block.timestamp);

        // Request prediction via Functions Consumer
        if (functionsConsumer != address(0)) {
            IPdMFunctionsConsumer(functionsConsumer).requestPrediction();
        }
    }

    function _triggerReportGeneration() internal {
        if ((block.timestamp - lastReportGenerationTime) < reportGenerationInterval) {
            revert TooEarlyForReportGeneration();
        }

        lastReportGenerationTime = block.timestamp;
        emit AutomationTriggered(AutomationType.REPORT_GENERATION, block.timestamp);

        // Request report via Functions Consumer
        if (functionsConsumer != address(0)) {
            IPdMFunctionsConsumer(functionsConsumer).requestReportGeneration();
        }
    }

    function _processPendingPredictions() internal {
        if (pendingCount <= processedCount) {
            revert NoPendingPredictions();
        }

        // Process up to 5 predictions per upkeep to manage gas
        uint256 processed = 0;
        for (uint256 i = processedCount + 1; i <= pendingCount && processed < 5; i++) {
            PendingPrediction storage pred = pendingPredictions[i];
            if (!pred.processed) {
                pred.processed = true;
                processedCount++;
                processed++;

                // Emit event for backend to pick up and submit ZK proof
                emit MaintenanceTaskRequested(pred.machineId, i);
            }
        }

        emit AutomationTriggered(AutomationType.PROCESS_PENDING, block.timestamp);
    }

    function _triggerBatchFlush() internal {
        if ((block.timestamp - lastBatchFlushTime) < batchFlushInterval) {
            revert TooEarlyForBatchFlush();
        }

        lastBatchFlushTime = block.timestamp;
        uint256 pending = pendingCount - processedCount;

        emit BatchFlushRequested(block.timestamp, pending);
        emit AutomationTriggered(AutomationType.BATCH_FLUSH, block.timestamp);
    }

    // --- Callback from Functions Consumer ---

    /**
     * @notice Handles prediction result from Functions Consumer
     * @dev Only callable by registered Functions consumer
     * @param machineId Machine that was analyzed
     * @param prediction 0=normal, 1=failure
     * @param confidence Confidence level (0-10000 = 0-100.00%)
     * @param dataHash Hash of sensor data used for prediction
     */
    function handlePredictionResult(
        uint256 machineId,
        uint256 prediction,
        uint256 confidence,
        bytes32 dataHash
    ) external {
        if (msg.sender != functionsConsumer) revert UnauthorizedCaller();

        // Queue prediction for processing
        pendingCount++;
        pendingPredictions[pendingCount] = PendingPrediction({
            machineId: machineId,
            dataHash: dataHash,
            prediction: prediction,
            confidence: confidence,
            timestamp: block.timestamp,
            processed: false
        });

        emit PredictionQueued(machineId, dataHash, confidence);

        // Check if failure detected with high confidence
        if (prediction == 1 && confidence >= failureThreshold) {
            emit FailureDetected(machineId, confidence, block.timestamp);
        }
    }

    // --- Admin Functions ---

    function setFunctionsConsumer(address _consumer) external onlyOwner {
        functionsConsumer = _consumer;
        emit FunctionsConsumerUpdated(_consumer);
    }

    function setSensorCollectionInterval(uint256 _interval) external onlyOwner {
        if (_interval == 0) revert InvalidInterval();
        sensorCollectionInterval = _interval;
        emit IntervalUpdated("sensor", _interval);
    }

    function setReportGenerationInterval(uint256 _interval) external onlyOwner {
        if (_interval == 0) revert InvalidInterval();
        reportGenerationInterval = _interval;
        emit IntervalUpdated("report", _interval);
    }

    function setFailureThreshold(uint256 _threshold) external onlyOwner {
        if (_threshold > 10000) revert InvalidThreshold();
        failureThreshold = _threshold;
        emit ThresholdUpdated(_threshold);
    }

    function setBatchFlushInterval(uint256 _interval) external onlyOwner {
        // Zero disables batch flush automation; non-zero must be reasonable (>= 60s)
        if (_interval != 0 && _interval < 60) revert InvalidInterval();
        batchFlushInterval = _interval;
        emit IntervalUpdated("batchFlush", _interval);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // --- Manual Trigger (for testing/emergency) ---

    function triggerSensorCollectionManual() external onlyOwner {
        lastSensorCollectionTime = block.timestamp;
        emit AutomationTriggered(AutomationType.SENSOR_COLLECTION, block.timestamp);

        if (functionsConsumer != address(0)) {
            IPdMFunctionsConsumer(functionsConsumer).requestPrediction();
        }
    }

    function triggerReportGenerationManual() external onlyOwner {
        lastReportGenerationTime = block.timestamp;
        emit AutomationTriggered(AutomationType.REPORT_GENERATION, block.timestamp);

        if (functionsConsumer != address(0)) {
            IPdMFunctionsConsumer(functionsConsumer).requestReportGeneration();
        }
    }

    function triggerBatchFlushManual() external onlyOwner {
        lastBatchFlushTime = block.timestamp;
        uint256 pending = pendingCount - processedCount;
        emit BatchFlushRequested(block.timestamp, pending);
        emit AutomationTriggered(AutomationType.BATCH_FLUSH, block.timestamp);
    }

    // --- View Functions ---

    function getPendingPrediction(uint256 id) external view returns (
        uint256 machineId,
        bytes32 dataHash,
        uint256 prediction,
        uint256 confidence,
        uint256 timestamp,
        bool processed
    ) {
        PendingPrediction storage pred = pendingPredictions[id];
        return (
            pred.machineId,
            pred.dataHash,
            pred.prediction,
            pred.confidence,
            pred.timestamp,
            pred.processed
        );
    }

    function getAutomationStatus() external view returns (
        uint256 timeSinceLastSensor,
        uint256 timeSinceLastReport,
        uint256 timeSinceLastBatchFlush,
        uint256 pendingToProcess,
        bool sensorDue,
        bool reportDue,
        bool batchFlushDue
    ) {
        timeSinceLastSensor = block.timestamp - lastSensorCollectionTime;
        timeSinceLastReport = block.timestamp - lastReportGenerationTime;
        timeSinceLastBatchFlush = block.timestamp - lastBatchFlushTime;
        pendingToProcess = pendingCount - processedCount;
        sensorDue = timeSinceLastSensor >= sensorCollectionInterval;
        reportDue = timeSinceLastReport >= reportGenerationInterval;
        batchFlushDue = batchFlushInterval > 0 && timeSinceLastBatchFlush >= batchFlushInterval;
    }
}

// --- Interface for Functions Consumer ---
interface IPdMFunctionsConsumer {
    function requestPrediction() external returns (bytes32);
    function requestReportGeneration() external returns (bytes32);
}
