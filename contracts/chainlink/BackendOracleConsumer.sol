// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title BackendOracleConsumer
 * @dev Backend-triggered prediction and report consumer for zkSync Era
 * @notice Receives predictions from a trusted backend oracle since
 *         Chainlink Functions is not available on zkSync Era Sepolia
 */
contract BackendOracleConsumer is Ownable, ReentrancyGuard {
    // --- State Variables ---
    address public automationContract;
    address public trustedOracle; // Backend automation wallet

    // --- Request Tracking ---
    enum RequestType { NONE, PREDICTION, REPORT }

    struct RequestInfo {
        RequestType requestType;
        uint256 timestamp;
        bool fulfilled;
        address requester;
    }

    uint256 public requestNonce;
    mapping(bytes32 => RequestInfo) public requests;
    bytes32 public lastRequestId;
    bytes32[] public requestHistory;

    // --- Events ---
    event PredictionRequested(bytes32 indexed requestId, uint256 timestamp, address requester);
    event PredictionFulfilled(
        bytes32 indexed requestId,
        uint256 machineId,
        uint256 prediction,
        uint256 confidence,
        bytes32 dataHash
    );
    event ReportRequested(bytes32 indexed requestId, uint256 timestamp);
    event ReportFulfilled(bytes32 indexed requestId, string reportHash);
    event RequestFailed(bytes32 indexed requestId, string reason);
    event OracleUpdated(address indexed oldOracle, address indexed newOracle);

    // --- Errors ---
    error UnauthorizedCaller();
    error RequestNotFound();
    error AlreadyFulfilled();
    error InvalidOracle();

    // --- Constructor ---
    constructor(address _trustedOracle) Ownable(msg.sender) {
        if (_trustedOracle == address(0)) revert InvalidOracle();
        trustedOracle = _trustedOracle;
    }

    // --- Modifiers ---
    modifier onlyOracle() {
        if (msg.sender != trustedOracle && msg.sender != owner()) {
            revert UnauthorizedCaller();
        }
        _;
    }

    modifier onlyAuthorized() {
        if (msg.sender != automationContract && msg.sender != owner()) {
            revert UnauthorizedCaller();
        }
        _;
    }

    // --- Configuration Functions ---

    function setAutomationContract(address _automation) external onlyOwner {
        automationContract = _automation;
    }

    function setTrustedOracle(address _oracle) external onlyOwner {
        if (_oracle == address(0)) revert InvalidOracle();
        address oldOracle = trustedOracle;
        trustedOracle = _oracle;
        emit OracleUpdated(oldOracle, _oracle);
    }

    // --- Request Functions ---

    /**
     * @notice Creates a prediction request (emits event for backend to pick up)
     * @dev Called by automation contract or owner
     * @return requestId The unique request identifier
     */
    function requestPrediction() external onlyAuthorized returns (bytes32 requestId) {
        requestId = keccak256(abi.encodePacked(
            block.timestamp,
            msg.sender,
            requestNonce++,
            "PREDICTION"
        ));

        requests[requestId] = RequestInfo({
            requestType: RequestType.PREDICTION,
            timestamp: block.timestamp,
            fulfilled: false,
            requester: msg.sender
        });

        lastRequestId = requestId;
        requestHistory.push(requestId);

        emit PredictionRequested(requestId, block.timestamp, msg.sender);
        return requestId;
    }

    /**
     * @notice Creates a report request (emits event for backend to pick up)
     * @dev Called by automation contract or owner
     * @return requestId The unique request identifier
     */
    function requestReportGeneration() external onlyAuthorized returns (bytes32 requestId) {
        requestId = keccak256(abi.encodePacked(
            block.timestamp,
            msg.sender,
            requestNonce++,
            "REPORT"
        ));

        requests[requestId] = RequestInfo({
            requestType: RequestType.REPORT,
            timestamp: block.timestamp,
            fulfilled: false,
            requester: msg.sender
        });

        lastRequestId = requestId;
        requestHistory.push(requestId);

        emit ReportRequested(requestId, block.timestamp);
        return requestId;
    }

    // --- Fulfillment Functions (called by trusted oracle/backend) ---

    /**
     * @notice Fulfills a prediction request with ML inference results
     * @param requestId The request ID to fulfill
     * @param machineId The machine ID
     * @param prediction The prediction result (0 or 1)
     * @param confidence Confidence score (0-10000 = 0-100%)
     * @param dataHash Hash of the input data
     */
    function fulfillPrediction(
        bytes32 requestId,
        uint256 machineId,
        uint256 prediction,
        uint256 confidence,
        bytes32 dataHash
    ) external onlyOracle nonReentrant {
        RequestInfo storage reqInfo = requests[requestId];
        if (reqInfo.requestType != RequestType.PREDICTION) revert RequestNotFound();
        if (reqInfo.fulfilled) revert AlreadyFulfilled();

        reqInfo.fulfilled = true;

        emit PredictionFulfilled(requestId, machineId, prediction, confidence, dataHash);

        // Forward to automation contract
        if (automationContract != address(0)) {
            IChainlinkPdMAutomation(automationContract).handlePredictionResult(
                machineId,
                prediction,
                confidence,
                dataHash
            );
        }
    }

    /**
     * @notice Fulfills a report request
     * @param requestId The request ID to fulfill
     * @param reportHash The report hash (IPFS CID or similar)
     */
    function fulfillReport(
        bytes32 requestId,
        string calldata reportHash
    ) external onlyOracle nonReentrant {
        RequestInfo storage reqInfo = requests[requestId];
        if (reqInfo.requestType != RequestType.REPORT) revert RequestNotFound();
        if (reqInfo.fulfilled) revert AlreadyFulfilled();

        reqInfo.fulfilled = true;

        emit ReportFulfilled(requestId, reportHash);
    }

    /**
     * @notice Marks a request as failed
     * @param requestId The request ID
     * @param reason Failure reason
     */
    function failRequest(
        bytes32 requestId,
        string calldata reason
    ) external onlyOracle {
        RequestInfo storage reqInfo = requests[requestId];
        if (reqInfo.requestType == RequestType.NONE) revert RequestNotFound();
        if (reqInfo.fulfilled) revert AlreadyFulfilled();

        reqInfo.fulfilled = true;
        emit RequestFailed(requestId, reason);
    }

    // --- View Functions ---

    function getRequestInfo(bytes32 requestId) external view returns (
        RequestType requestType,
        uint256 timestamp,
        bool fulfilled,
        address requester
    ) {
        RequestInfo storage info = requests[requestId];
        return (info.requestType, info.timestamp, info.fulfilled, info.requester);
    }

    function getRequestHistoryLength() external view returns (uint256) {
        return requestHistory.length;
    }

    function getRecentRequests(uint256 count) external view returns (bytes32[] memory) {
        uint256 len = requestHistory.length;
        if (count > len) count = len;

        bytes32[] memory recent = new bytes32[](count);
        for (uint256 i = 0; i < count; i++) {
            recent[i] = requestHistory[len - count + i];
        }
        return recent;
    }

    function getPendingRequests() external view returns (bytes32[] memory) {
        uint256 pendingCount = 0;

        // First pass: count pending
        for (uint256 i = 0; i < requestHistory.length; i++) {
            if (!requests[requestHistory[i]].fulfilled) {
                pendingCount++;
            }
        }

        // Second pass: collect pending
        bytes32[] memory pending = new bytes32[](pendingCount);
        uint256 idx = 0;
        for (uint256 i = 0; i < requestHistory.length; i++) {
            if (!requests[requestHistory[i]].fulfilled) {
                pending[idx++] = requestHistory[i];
            }
        }

        return pending;
    }
}

// --- Interface for Automation Contract ---
interface IChainlinkPdMAutomation {
    function handlePredictionResult(
        uint256 machineId,
        uint256 prediction,
        uint256 confidence,
        bytes32 dataHash
    ) external;
}
