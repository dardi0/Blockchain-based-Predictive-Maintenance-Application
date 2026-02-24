// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {FunctionsClient} from "@chainlink/contracts/src/v0.8/functions/v1_3_0/FunctionsClient.sol";
import {FunctionsRequest} from "@chainlink/contracts/src/v0.8/functions/v1_0_0/libraries/FunctionsRequest.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title PdMFunctionsConsumer
 * @dev Chainlink Functions consumer for off-chain ML inference and report generation
 * @notice Interfaces with Chainlink DON to run JavaScript code for predictions
 * @dev zkSync Era Sepolia - Router: 0x20Fb9D1d12884A3FA5a5Af6258430A15A2aB3e69
 */
contract PdMFunctionsConsumer is FunctionsClient, Ownable, ReentrancyGuard {
    using FunctionsRequest for FunctionsRequest.Request;

    // --- State Variables ---
    address public automationContract;
    bytes32 public donId;
    uint64 public subscriptionId;
    uint32 public callbackGasLimit;

    // --- Request Tracking ---
    enum RequestType { NONE, PREDICTION, REPORT }

    struct RequestInfo {
        RequestType requestType;
        uint256 timestamp;
        bool fulfilled;
        address requester;
    }

    mapping(bytes32 => RequestInfo) public requests;
    bytes32 public lastRequestId;
    bytes32[] public requestHistory;

    // --- JavaScript Sources ---
    string public predictionSource;
    string public reportSource;

    // --- Secrets Configuration ---
    bytes public encryptedSecretsUrls;
    uint8 public donHostedSecretsSlotId;
    uint64 public donHostedSecretsVersion;

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
    event RequestFailed(bytes32 indexed requestId, bytes error);
    event SourceUpdated(string sourceType);
    event SecretsUpdated();

    // --- Errors ---
    error UnauthorizedCaller();
    error EmptySource();
    error RequestNotFound();
    error AlreadyFulfilled();

    // --- Constructor ---
    constructor(
        address _router,
        bytes32 _donId,
        uint64 _subscriptionId,
        uint32 _callbackGasLimit
    ) FunctionsClient(_router) Ownable(msg.sender) {
        donId = _donId;
        subscriptionId = _subscriptionId;
        callbackGasLimit = _callbackGasLimit;
    }

    // --- Modifiers ---
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

    function setPredictionSource(string calldata _source) external onlyOwner {
        if (bytes(_source).length == 0) revert EmptySource();
        predictionSource = _source;
        emit SourceUpdated("prediction");
    }

    function setReportSource(string calldata _source) external onlyOwner {
        if (bytes(_source).length == 0) revert EmptySource();
        reportSource = _source;
        emit SourceUpdated("report");
    }

    function setSubscriptionId(uint64 _subscriptionId) external onlyOwner {
        subscriptionId = _subscriptionId;
    }

    function setCallbackGasLimit(uint32 _gasLimit) external onlyOwner {
        callbackGasLimit = _gasLimit;
    }

    function setDonId(bytes32 _donId) external onlyOwner {
        donId = _donId;
    }

    function setDonHostedSecrets(
        uint8 _slotId,
        uint64 _version
    ) external onlyOwner {
        donHostedSecretsSlotId = _slotId;
        donHostedSecretsVersion = _version;
        emit SecretsUpdated();
    }

    function setEncryptedSecretsUrls(bytes calldata _encryptedUrls) external onlyOwner {
        encryptedSecretsUrls = _encryptedUrls;
        emit SecretsUpdated();
    }

    // --- Request Functions ---

    /**
     * @notice Requests ML prediction from Chainlink DON
     * @dev Called by automation contract or owner
     * @return requestId The unique request identifier
     */
    function requestPrediction() external onlyAuthorized returns (bytes32 requestId) {
        if (bytes(predictionSource).length == 0) revert EmptySource();

        FunctionsRequest.Request memory req;
        req.initializeRequestForInlineJavaScript(predictionSource);

        // Add API endpoint as argument
        string[] memory args = new string[](1);
        args[0] = "prediction"; // Request type identifier
        req.setArgs(args);

        // Configure secrets if available
        if (donHostedSecretsVersion > 0) {
            req.addDONHostedSecrets(donHostedSecretsSlotId, donHostedSecretsVersion);
        } else if (encryptedSecretsUrls.length > 0) {
            req.addSecretsReference(encryptedSecretsUrls);
        }

        requestId = _sendRequest(
            req.encodeCBOR(),
            subscriptionId,
            callbackGasLimit,
            donId
        );

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
     * @notice Requests report generation from Chainlink DON
     * @dev Called by automation contract or owner
     * @return requestId The unique request identifier
     */
    function requestReportGeneration() external onlyAuthorized returns (bytes32 requestId) {
        if (bytes(reportSource).length == 0) revert EmptySource();

        FunctionsRequest.Request memory req;
        req.initializeRequestForInlineJavaScript(reportSource);

        // Add request type identifier
        string[] memory args = new string[](1);
        args[0] = "report";
        req.setArgs(args);

        // Configure secrets if available
        if (donHostedSecretsVersion > 0) {
            req.addDONHostedSecrets(donHostedSecretsSlotId, donHostedSecretsVersion);
        } else if (encryptedSecretsUrls.length > 0) {
            req.addSecretsReference(encryptedSecretsUrls);
        }

        requestId = _sendRequest(
            req.encodeCBOR(),
            subscriptionId,
            callbackGasLimit,
            donId
        );

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

    // --- Fulfillment Callback (called by Chainlink Router) ---

    /**
     * @notice Callback function for Chainlink DON responses
     * @param requestId The request ID
     * @param response The response data
     * @param err Error data if request failed
     */
    function _fulfillRequest(
        bytes32 requestId,
        bytes memory response,
        bytes memory err
    ) internal override {
        RequestInfo storage reqInfo = requests[requestId];
        if (reqInfo.requestType == RequestType.NONE) revert RequestNotFound();
        if (reqInfo.fulfilled) revert AlreadyFulfilled();

        reqInfo.fulfilled = true;

        if (err.length > 0) {
            emit RequestFailed(requestId, err);
            return;
        }

        if (reqInfo.requestType == RequestType.PREDICTION) {
            _handlePredictionResponse(requestId, response);
        } else if (reqInfo.requestType == RequestType.REPORT) {
            _handleReportResponse(requestId, response);
        }
    }

    function _handlePredictionResponse(bytes32 requestId, bytes memory response) internal {
        // Decode: (machineId, prediction, confidence, dataHash)
        // Response format: 32 bytes machineId + 32 bytes prediction + 32 bytes confidence + 32 bytes dataHash
        if (response.length < 128) {
            emit RequestFailed(requestId, bytes("Invalid response length"));
            return;
        }

        uint256 machineId;
        uint256 prediction;
        uint256 confidence;
        bytes32 dataHash;

        assembly {
            machineId := mload(add(response, 32))
            prediction := mload(add(response, 64))
            confidence := mload(add(response, 96))
            dataHash := mload(add(response, 128))
        }

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

    function _handleReportResponse(bytes32 requestId, bytes memory response) internal {
        // Decode report hash (IPFS CID or similar)
        string memory reportHash = string(response);
        emit ReportFulfilled(requestId, reportHash);
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
