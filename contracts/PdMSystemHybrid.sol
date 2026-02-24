// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./AccessControlRegistry.sol";
import "./UnifiedGroth16Verifier.sol";

/**
 * @title PdMSystemHybrid
 * @dev Hibrit PDM sistemi - Off-chain storage + ZK-SNARK proofs
 * @notice Sensör verileri local DB'de, sadece ZK kanıtları blockchain'de
 */
contract PdMSystemHybrid is Ownable, Pausable, ReentrancyGuard {
    
    // --- ACCESS CONTROL INTEGRATION ---
    AccessControlRegistry public immutable accessRegistry;
    UnifiedGroth16Verifier public zkVerifier;
    
    bytes32 public constant SENSOR_DATA_RESOURCE = keccak256("SENSOR_DATA");
    bytes32 public constant PREDICTION_RESOURCE = keccak256("PREDICTION");
    bytes32 public constant MAINTENANCE_RESOURCE = keccak256("MAINTENANCE");
    bytes32 public constant FAULT_RECORD_RESOURCE = keccak256("FAULT_RECORD");
    bytes32 public constant TRAINING_RESOURCE = keccak256("TRAINING");
    bytes32 public constant REPORT_RESOURCE = keccak256("REPORT");
    uint256 public constant MAX_DATA_AGE = 24 hours; // SECURITY (H4): Max age for freshness
    uint256 public constant VERIFIER_CHANGE_DELAY = 48 hours;

    address public pendingZKVerifier;
    uint256 public verifierChangeProposedAt;
    
    // --- ENUMS ---
    enum StorageType {
        LOCAL_DB,       // 0 - Local database
        IPFS,          // 1 - IPFS (future)
        ARWEAVE        // 2 - Arweave (future)
    }
    
    enum ProofType {
        SENSOR_DATA,    // 0 - Sensör verisi kanıtı
        PREDICTION,     // 1 - Tahmin kanıtı  
        MAINTENANCE,    // 2 - Bakım kanıtı
        BATCH_SENSOR    // 3 - Toplu sensör verisi
    }
    
    // --- STRUCTS ---
    struct SensorDataProof {
        bytes32 dataHash;           // Off-chain verinin hash'i
        bytes32 commitmentHash;     // ZK commitment hash
        bytes32 storageLocation;    // Local DB key veya path (32 byte'a kadar - BÜYÜK gaz tasarrufu)
        uint256 timestamp;
        address submitter;
        uint256 machineId;
        StorageType storageType;
        bytes32 zkProofHash;        // ZK proof'un hash'i
        uint256 sensorCount;        // Kaç sensör verisi (batch için)
    }
    
    struct PredictionProof {
        bytes32 predictionCommitment; // Hashed (prediction, confidence, nonce) - Privacy preserved
        bytes32 modelCommitment;    // Model commitment
        uint256 dataProofId;        // Hangi sensör verisine dayalı
        address predictor;
        uint256 timestamp;
        bytes32 zkProofHash;
    }
    
    struct MaintenanceProof {
        bytes32 taskHash;           // Görev verisinin hash'i
        uint256 predictionProofId;  // Hangi tahmine dayalı
        address assignedEngineer;
        uint256 createdAt;
        uint256 completedAt;
        bool isCompleted;
        bytes32 zkProofHash;
        bytes32 notesCommitment;    // Tamamlama notları commitment
    }
    
    struct ZKProofMetadata {
        ProofType proofType;
        bytes32 publicInputsHash;   // Public input'ların hash'i
        uint256 relatedId;          // İlgili proof ID'si
        address submitter;
        uint256 timestamp;
    }

    struct FaultRecord {
        uint256 machineId;
        uint256 dataProofId;       // İlgili sensör proof (yoksa 0)
        bytes32 faultCommitment;   // Poseidon(prediction, prob, nonce)
        address reporter;
        uint256 timestamp;
        bytes32 zkProofHash;
    }

    struct TrainingRecord {
        bytes32 modelHash;              // Truncated model file hash
        bytes32 hyperparamsCommitment;  // Poseidon(h1, h2, h3, nonce)
        address trainer;
        uint256 timestamp;
        bytes32 zkProofHash;
    }

    struct ReportRecord {
        bytes32 reportCommitment;  // Poseidon(reportHash, machineCount, nonce)
        address creator;
        uint256 timestamp;
        bytes32 zkProofHash;
    }
    
    // --- STATE VARIABLES ---
    uint256 public sensorProofCounter;
    uint256 public predictionProofCounter;
    uint256 public maintenanceProofCounter;
    uint256 public zkProofCounter;
    uint256 public faultRecordCounter;
    uint256 public trainingRecordCounter;
    uint256 public reportRecordCounter;

    // Mappings
    mapping(uint256 => SensorDataProof) public sensorProofs;
    mapping(uint256 => PredictionProof) public predictionProofs;
    mapping(uint256 => MaintenanceProof) public maintenanceProofs;
    mapping(bytes32 => ZKProofMetadata) public zkProofs;
    mapping(bytes32 => bool) public usedDataHashes;
    mapping(bytes32 => bool) public usedPredictionCommitments; // SECURITY (M10): Prevent duplicate predictions
    mapping(bytes32 => bool) public usedTaskHashes;            // SECURITY (M10): Prevent duplicate maintenance tasks
    mapping(bytes32 => bool) public usedZkProofs;   // SECURITY: Replay attack protection
    mapping(address => uint256[]) public userSensorProofs;
    mapping(uint256 => uint256[]) public machineSensorProofs;
    mapping(uint256 => FaultRecord)    public faultRecords;
    mapping(uint256 => TrainingRecord) public trainingRecords;
    mapping(uint256 => ReportRecord)   public reportRecords;
    mapping(uint256 => uint256[])      public machineFaultRecords;
    
    // --- EVENTS ---
    event SensorDataProofSubmitted(
        uint256 indexed proofId,
        bytes32 indexed dataHash,
        bytes32 storageLocation,
        uint256 indexed machineId,
        address submitter
    );
    
    // Updated Event: Removed prediction value
    event PredictionProofSubmitted(
        uint256 indexed proofId,
        bytes32 indexed predictionCommitment,
        uint256 indexed dataProofId,
        address predictor
    );
    
    event MaintenanceProofSubmitted(
        uint256 indexed proofId,
        bytes32 indexed taskHash,
        uint256 indexed predictionProofId,
        address engineer
    );
    
    event FaultRecorded(
        uint256 indexed recordId,
        uint256 indexed machineId,
        bytes32 faultCommitment,
        address reporter
    );

    event TrainingRecorded(
        uint256 indexed recordId,
        bytes32 modelHash,
        bytes32 hyperparamsCommitment,
        address trainer
    );

    event ReportRecorded(
        uint256 indexed recordId,
        bytes32 reportCommitment,
        address creator
    );

    event ZKVerifierUpdated(
        address indexed oldVerifier,
        address indexed newVerifier
    );

    event ZKVerifierUpdateProposed(
        address indexed proposedVerifier,
        uint256 executeAfter
    );

    event ZKVerifierUpdateCancelled(
        address indexed cancelledVerifier
    );
    
    // --- MODIFIERS ---
    modifier onlyAuthorizedNode(bytes32 resource, AccessControlRegistry.AccessLevel requiredLevel) {
        (bool hasAccess, string memory reason) = accessRegistry.checkAccess(
            msg.sender, 
            resource, 
            requiredLevel
        );
        require(hasAccess, string(abi.encodePacked("Access denied: ", reason)));
        _;
    }
    
    modifier validDataHash(bytes32 dataHash) {
        require(dataHash != bytes32(0), "PdMHybrid: Invalid data hash");
        require(!usedDataHashes[dataHash], "PdMHybrid: Data hash already used");
        _;
    }
    
    // --- CONSTRUCTOR ---
    constructor(
        address _accessRegistry,
        address _zkVerifier,
        address _initialAdmin
    ) Ownable(_initialAdmin) {
        require(_initialAdmin != address(0), "PdMHybrid: Invalid admin");
        require(_accessRegistry != address(0), "PdMHybrid: Invalid access registry");
        require(_zkVerifier != address(0), "PdMHybrid: Invalid ZK verifier");
        
        accessRegistry = AccessControlRegistry(_accessRegistry);
        zkVerifier = UnifiedGroth16Verifier(_zkVerifier);
        
        sensorProofCounter = 1;
        predictionProofCounter = 1;
        maintenanceProofCounter = 1;
        zkProofCounter = 1;
        faultRecordCounter = 1;
        trainingRecordCounter = 1;
        reportRecordCounter = 1;
    }
    
    // --- SENSOR DATA PROOF FUNCTIONS ---
    function submitSensorDataProof(
        uint256 machineId,
        bytes32 dataHash,
        bytes32 commitmentHash,
        bytes32 storageLocation,
        uint256 sensorCount,
        uint[2] memory a,
        uint[2][2] memory b,
        uint[2] memory c,
        uint[3] memory publicInputs  // [machineId, timestamp, dataCommitment] - Privacy-first!
    ) 
        external 
        whenNotPaused 
        nonReentrant
        onlyAuthorizedNode(SENSOR_DATA_RESOURCE, AccessControlRegistry.AccessLevel.WRITE_LIMITED)
        validDataHash(dataHash)
        returns (uint256 proofId) 
    {
        require(machineId > 0, "PdMHybrid: Invalid machine ID");
        require(storageLocation != bytes32(0), "PdMHybrid: Storage location required");
        require(sensorCount > 0 && sensorCount <= 100, "PdMHybrid: Invalid sensor count");
        
        // ZK Proof doğrulama (Sensor Data için özel fonksiyon) - Privacy-first: only 3 inputs
        uint[] memory inputs = new uint[](3);
        for(uint i=0; i<3; i++) {
            inputs[i] = publicInputs[i];
        }
        
        // SECURITY FIX (H3): Removed sensorVerifier fallback logic. Only explicit ZK verifier is trusted.
        bool proofValid = zkVerifier.verifySensorDataProof(a, b, c, inputs);
        require(proofValid, "PdMHybrid: Invalid sensor data ZK proof");
        
        // Public input doğrulaması (Privacy-first: machineId, timestamp, dataCommitment)
        require(publicInputs[0] == machineId, "PdMHybrid: Machine ID mismatch");
        
        // SECURITY (H4): Timestamp validity window logic
        uint256 timestamp = publicInputs[1];
        require(timestamp > block.timestamp - MAX_DATA_AGE, "PdMHybrid: Stale timestamp (H4)");
        require(timestamp <= block.timestamp + 300, "PdMHybrid: Future timestamp");

        require(bytes32(publicInputs[2]) == commitmentHash, "PdMHybrid: Commitment mismatch");
        
        // ZK proof hash hesapla (İspat + Public Inputs birlikte)
        bytes32 zkProofHash = keccak256(abi.encodePacked(a, b, c, publicInputs));
        
        // SECURITY: Replay attack protection - aynı proof tekrar kullanılamaz
        require(!usedZkProofs[zkProofHash], "PdMHybrid: ZK proof already used (replay attack)");
        usedZkProofs[zkProofHash] = true;
        
        bytes32 publicInputsHash = keccak256(abi.encodePacked(publicInputs));
        
        // Sensor proof oluştur
        proofId = sensorProofCounter++;
        sensorProofs[proofId] = SensorDataProof({
            dataHash: dataHash,
            commitmentHash: commitmentHash,
            storageLocation: storageLocation,
            timestamp: block.timestamp,
            submitter: msg.sender,
            machineId: machineId,
            storageType: StorageType.LOCAL_DB,
            zkProofHash: zkProofHash,
            sensorCount: sensorCount
        });
        
        // ZK proof metadata kaydet
        zkProofs[zkProofHash] = ZKProofMetadata({
            proofType: ProofType.SENSOR_DATA,
            publicInputsHash: publicInputsHash,
            relatedId: proofId,
            submitter: msg.sender,
            timestamp: block.timestamp
        });
        
        // Mappings güncelle
        usedDataHashes[dataHash] = true;
        userSensorProofs[msg.sender].push(proofId);
        machineSensorProofs[machineId].push(proofId);
        
        emit SensorDataProofSubmitted(proofId, dataHash, storageLocation, machineId, msg.sender);
    }
    
    // --- PREDICTION PROOF FUNCTIONS ---
    function submitPredictionProof(
        uint256 dataProofId,
        bytes32 modelCommitment,
        bytes32 predictionCommitment, // Hashed (prediction, confidence, nonce)
        uint[2] memory a,
        uint[2][2] memory b,
        uint[2] memory c,
        uint[] memory publicInputs  // [dataProofId, modelHash, timestamp, predictionCommitment]
    )
        external
        whenNotPaused
        nonReentrant
        onlyAuthorizedNode(PREDICTION_RESOURCE, AccessControlRegistry.AccessLevel.WRITE_LIMITED)
        returns (uint256 proofId)
    {

        require(dataProofId < sensorProofCounter && dataProofId > 0, "PdMHybrid: Invalid data proof ID");
        require(sensorProofs[dataProofId].submitter != address(0), "PdMHybrid: Data proof does not exist");
        require(predictionCommitment != bytes32(0), "PdMHybrid: Invalid prediction commitment");
        require(!usedPredictionCommitments[predictionCommitment], "PdMHybrid: Prediction commitment already used (M10)");
        
        // ZK Proof doğrulama (Prediction için özel fonksiyon)
        // Public inputs: [dataProofId, modelHash, timestamp, predictionCommitment]
        uint[] memory inputs = new uint[](publicInputs.length);
        for(uint i=0; i<publicInputs.length; i++) {
            inputs[i] = publicInputs[i];
        }
        
        // Expect exactly 4 public inputs
        require(publicInputs.length == 4, "PdMHybrid: invalid prediction input len");
        bool proofValid = zkVerifier.verifyPredictionProof(a, b, c, inputs);
        require(proofValid, "PdMHybrid: Invalid prediction ZK proof");
        
        // Public input doğrulaması
        require(publicInputs[0] == dataProofId, "PdMHybrid: Data proof ID mismatch");
        // publicInputs[1] is modelHash
        
        // SECURITY (H4): Validate timestamp (publicInputs[2])
        uint256 timestamp = publicInputs[2];
        require(timestamp > block.timestamp - MAX_DATA_AGE, "PdMHybrid: Stale timestamp (H4)");
        require(timestamp <= block.timestamp + 300, "PdMHybrid: Future timestamp");
        
        require(bytes32(publicInputs[3]) == predictionCommitment, "PdMHybrid: Prediction commitment mismatch");
        
        // ZK proof hash hesapla (İspat + Public Inputs birlikte)
        bytes32 zkProofHash = keccak256(abi.encodePacked(a, b, c, publicInputs));
        
        // SECURITY: Replay attack protection - aynı proof tekrar kullanılamaz
        require(!usedZkProofs[zkProofHash], "PdMHybrid: ZK proof already used (replay attack)");
        usedZkProofs[zkProofHash] = true;
        
        bytes32 publicInputsHash = keccak256(abi.encodePacked(publicInputs));
        
        proofId = predictionProofCounter++;
        predictionProofs[proofId] = PredictionProof({
            predictionCommitment: predictionCommitment,
            modelCommitment: modelCommitment,
            dataProofId: dataProofId,
            predictor: msg.sender,
            timestamp: block.timestamp,
            zkProofHash: zkProofHash
        });
        
        zkProofs[zkProofHash] = ZKProofMetadata({
            proofType: ProofType.PREDICTION,
            publicInputsHash: publicInputsHash,
            relatedId: proofId,
            submitter: msg.sender,
            timestamp: block.timestamp
        });
        
        // Mappings güncelle
        usedPredictionCommitments[predictionCommitment] = true;
        
        emit PredictionProofSubmitted(proofId, predictionCommitment, dataProofId, msg.sender);
    }
    
    // --- MAINTENANCE PROOF FUNCTIONS ---
    function submitMaintenanceProof(
        uint256 predictionProofId,
        bytes32 taskHash,
        bytes32 notesCommitment,
        uint[2] memory a,
        uint[2][2] memory b,
        uint[2] memory c,
        uint[4] memory publicInputs  // [predictionProofId, taskHash, engineerAddress, timestamp]
    )
        external
        whenNotPaused
        nonReentrant
        onlyAuthorizedNode(MAINTENANCE_RESOURCE, AccessControlRegistry.AccessLevel.WRITE_LIMITED)
        returns (uint256 proofId)
    {
        require(predictionProofId < predictionProofCounter && predictionProofId > 0, "PdMHybrid: Invalid prediction proof ID");
        require(predictionProofs[predictionProofId].predictor != address(0), "PdMHybrid: Prediction proof does not exist");
        
        // ZK Proof doğrulama (Maintenance için özel fonksiyon)
            uint[] memory inputs = new uint[](4);
            for(uint i=0; i<4; i++) {
                inputs[i] = publicInputs[i];
            }
            bool proofValid = zkVerifier.verifyMaintenanceProof(a, b, c, inputs);
        require(proofValid, "PdMHybrid: Invalid maintenance ZK proof");
        
        // Public input doğrulaması (argümanlarla tutarlılık)
        require(publicInputs[0] == predictionProofId, "PdMHybrid: Prediction proof ID mismatch");
        require(bytes32(publicInputs[1]) == taskHash, "PdMHybrid: Task hash mismatch");
        require(!usedTaskHashes[taskHash], "PdMHybrid: Task hash already used (M10)");
        // publicInputs[2] is engineerAddress (as number)
        
        // SECURITY (H4): Validate timestamp (publicInputs[3])
        uint256 timestamp = publicInputs[3];
        require(timestamp > block.timestamp - MAX_DATA_AGE, "PdMHybrid: Stale timestamp (H4)");
        require(timestamp <= block.timestamp + 300, "PdMHybrid: Future timestamp");
        
        // ZK proof hash hesapla (İspat + Public Inputs birlikte)
        bytes32 zkProofHash = keccak256(abi.encodePacked(a, b, c, publicInputs));
        
        // SECURITY: Replay attack protection - aynı proof tekrar kullanılamaz
        require(!usedZkProofs[zkProofHash], "PdMHybrid: ZK proof already used (replay attack)");
        usedZkProofs[zkProofHash] = true;
        
        bytes32 publicInputsHash = keccak256(abi.encodePacked(publicInputs));
        
        proofId = maintenanceProofCounter++;
        maintenanceProofs[proofId] = MaintenanceProof({
            taskHash: taskHash,
            predictionProofId: predictionProofId,
            assignedEngineer: msg.sender,
            createdAt: block.timestamp,
            completedAt: 0,
            isCompleted: false,
            zkProofHash: zkProofHash,
            notesCommitment: notesCommitment
        });
        
        // ZK proof metadata kaydet
        zkProofs[zkProofHash] = ZKProofMetadata({
            proofType: ProofType.MAINTENANCE,
            publicInputsHash: publicInputsHash,
            relatedId: proofId,
            submitter: msg.sender,
            timestamp: block.timestamp
        });
        
        // Mappings güncelle
        usedTaskHashes[taskHash] = true;

        emit MaintenanceProofSubmitted(proofId, taskHash, predictionProofId, msg.sender);
    }
    
    // --- FAULT RECORD FUNCTIONS ---
    function recordFaultDetection(
        uint256 machineId,
        uint256 dataProofId,
        bytes32 faultCommitment,
        uint[2] memory a,
        uint[2][2] memory b,
        uint[2] memory c,
        uint[3] memory publicInputs  // [machineId, timestamp, faultCommitment]
    )
        external
        whenNotPaused
        nonReentrant
        onlyAuthorizedNode(FAULT_RECORD_RESOURCE, AccessControlRegistry.AccessLevel.WRITE_LIMITED)
        returns (uint256 recordId)
    {
        require(machineId > 0, "PdMHybrid: Invalid machine ID");
        require(faultCommitment != bytes32(0), "PdMHybrid: Invalid fault commitment");

        // ZK Proof doğrulama
        uint[] memory inputs = new uint[](3);
        inputs[0] = publicInputs[0];
        inputs[1] = publicInputs[1];
        inputs[2] = publicInputs[2];

        bool proofValid = zkVerifier.verifyFaultRecordProof(a, b, c, inputs);
        require(proofValid, "PdMHybrid: Invalid fault record ZK proof");

        // Public input doğrulaması
        require(publicInputs[0] == machineId, "PdMHybrid: Machine ID mismatch");

        uint256 timestamp = publicInputs[1];
        require(timestamp > block.timestamp - MAX_DATA_AGE, "PdMHybrid: Stale timestamp");
        require(timestamp <= block.timestamp + 300, "PdMHybrid: Future timestamp");

        require(bytes32(publicInputs[2]) == faultCommitment, "PdMHybrid: Fault commitment mismatch");

        // Replay koruması
        bytes32 zkProofHash = keccak256(abi.encodePacked(a, b, c, publicInputs));
        require(!usedZkProofs[zkProofHash], "PdMHybrid: ZK proof already used (replay attack)");
        usedZkProofs[zkProofHash] = true;

        recordId = faultRecordCounter++;
        faultRecords[recordId] = FaultRecord({
            machineId: machineId,
            dataProofId: dataProofId,
            faultCommitment: faultCommitment,
            reporter: msg.sender,
            timestamp: block.timestamp,
            zkProofHash: zkProofHash
        });

        machineFaultRecords[machineId].push(recordId);

        emit FaultRecorded(recordId, machineId, faultCommitment, msg.sender);
    }

    // --- TRAINING RECORD FUNCTIONS ---
    function recordModelTraining(
        bytes32 modelHash,
        bytes32 hyperparamsCommitment,
        uint[2] memory a,
        uint[2][2] memory b,
        uint[2] memory c,
        uint[3] memory publicInputs  // [modelHash, timestamp, hyperparamsCommitment]
    )
        external
        whenNotPaused
        nonReentrant
        onlyAuthorizedNode(TRAINING_RESOURCE, AccessControlRegistry.AccessLevel.WRITE_LIMITED)
        returns (uint256 recordId)
    {
        require(modelHash != bytes32(0), "PdMHybrid: Invalid model hash");
        require(hyperparamsCommitment != bytes32(0), "PdMHybrid: Invalid hyperparams commitment");

        // ZK Proof doğrulama
        uint[] memory inputs = new uint[](3);
        inputs[0] = publicInputs[0];
        inputs[1] = publicInputs[1];
        inputs[2] = publicInputs[2];

        bool proofValid = zkVerifier.verifyTrainingRecordProof(a, b, c, inputs);
        require(proofValid, "PdMHybrid: Invalid training record ZK proof");

        // Public input doğrulaması
        require(bytes32(publicInputs[0]) == modelHash, "PdMHybrid: Model hash mismatch");

        uint256 timestamp = publicInputs[1];
        require(timestamp > block.timestamp - MAX_DATA_AGE, "PdMHybrid: Stale timestamp");
        require(timestamp <= block.timestamp + 300, "PdMHybrid: Future timestamp");

        require(bytes32(publicInputs[2]) == hyperparamsCommitment, "PdMHybrid: Hyperparams commitment mismatch");

        // Replay koruması
        bytes32 zkProofHash = keccak256(abi.encodePacked(a, b, c, publicInputs));
        require(!usedZkProofs[zkProofHash], "PdMHybrid: ZK proof already used (replay attack)");
        usedZkProofs[zkProofHash] = true;

        recordId = trainingRecordCounter++;
        trainingRecords[recordId] = TrainingRecord({
            modelHash: modelHash,
            hyperparamsCommitment: hyperparamsCommitment,
            trainer: msg.sender,
            timestamp: block.timestamp,
            zkProofHash: zkProofHash
        });

        emit TrainingRecorded(recordId, modelHash, hyperparamsCommitment, msg.sender);
    }

    // --- REPORT RECORD FUNCTIONS ---
    function recordReportGeneration(
        bytes32 reportCommitment,
        uint[2] memory a,
        uint[2][2] memory b,
        uint[2] memory c,
        uint[2] memory publicInputs  // [timestamp, reportCommitment]
    )
        external
        whenNotPaused
        nonReentrant
        onlyAuthorizedNode(REPORT_RESOURCE, AccessControlRegistry.AccessLevel.WRITE_LIMITED)
        returns (uint256 recordId)
    {
        require(reportCommitment != bytes32(0), "PdMHybrid: Invalid report commitment");

        // ZK Proof doğrulama
        uint[] memory inputs = new uint[](2);
        inputs[0] = publicInputs[0];
        inputs[1] = publicInputs[1];

        bool proofValid = zkVerifier.verifyReportRecordProof(a, b, c, inputs);
        require(proofValid, "PdMHybrid: Invalid report record ZK proof");

        // Public input doğrulaması
        uint256 timestamp = publicInputs[0];
        require(timestamp > block.timestamp - MAX_DATA_AGE, "PdMHybrid: Stale timestamp");
        require(timestamp <= block.timestamp + 300, "PdMHybrid: Future timestamp");

        require(bytes32(publicInputs[1]) == reportCommitment, "PdMHybrid: Report commitment mismatch");

        // Replay koruması
        bytes32 zkProofHash = keccak256(abi.encodePacked(a, b, c, publicInputs));
        require(!usedZkProofs[zkProofHash], "PdMHybrid: ZK proof already used (replay attack)");
        usedZkProofs[zkProofHash] = true;

        recordId = reportRecordCounter++;
        reportRecords[recordId] = ReportRecord({
            reportCommitment: reportCommitment,
            creator: msg.sender,
            timestamp: block.timestamp,
            zkProofHash: zkProofHash
        });

        emit ReportRecorded(recordId, reportCommitment, msg.sender);
    }

    // --- VIEW FUNCTIONS ---
    function getSensorProof(uint256 proofId) external view returns (SensorDataProof memory) {
        require(proofId < sensorProofCounter && proofId > 0, "PdMHybrid: Invalid proof ID");
        return sensorProofs[proofId];
    }
    
    function getPredictionProof(uint256 proofId) external view returns (PredictionProof memory) {
        require(proofId < predictionProofCounter && proofId > 0, "PdMHybrid: Invalid proof ID");
        return predictionProofs[proofId];
    }
    
    function getMachineProofs(uint256 machineId) external view returns (uint256[] memory) {
        return machineSensorProofs[machineId];
    }
    
    function getUserProofs(address user) external view returns (uint256[] memory) {
        return userSensorProofs[user];
    }
    
    function verifyDataHash(bytes32 dataHash, string calldata /* storageLocation */) external view returns (bool) {
        return usedDataHashes[dataHash];
    }
    
    // --- ADMIN FUNCTIONS ---
    function emergencyPause() external onlyOwner {
        _pause();
    }
    
    function emergencyUnpause() external onlyOwner {
        _unpause();
    }
    
    /// @notice Propose a new ZK verifier (starts 48h timelock).
    function proposeZKVerifierUpdate(address newVerifier) external onlyOwner {
        require(newVerifier != address(0), "PdMHybrid: Invalid verifier");
        require(newVerifier != address(zkVerifier), "PdMHybrid: Same verifier");

        pendingZKVerifier = newVerifier;
        verifierChangeProposedAt = block.timestamp;

        emit ZKVerifierUpdateProposed(newVerifier, block.timestamp + VERIFIER_CHANGE_DELAY);
    }

    /// @notice Execute a pending ZK verifier update after the timelock has elapsed.
    function executeZKVerifierUpdate() external onlyOwner {
        require(pendingZKVerifier != address(0), "PdMHybrid: No pending verifier update");
        require(block.timestamp >= verifierChangeProposedAt + VERIFIER_CHANGE_DELAY, "PdMHybrid: Timelock not elapsed");

        address oldVerifier = address(zkVerifier);
        address newVerifier = pendingZKVerifier;

        zkVerifier = UnifiedGroth16Verifier(newVerifier);

        pendingZKVerifier = address(0);
        verifierChangeProposedAt = 0;

        emit ZKVerifierUpdated(oldVerifier, newVerifier);
    }

    /// @notice Cancel a pending ZK verifier update.
    function cancelZKVerifierUpdate() external onlyOwner {
        require(pendingZKVerifier != address(0), "PdMHybrid: No pending verifier update");

        address cancelled = pendingZKVerifier;
        pendingZKVerifier = address(0);
        verifierChangeProposedAt = 0;

        emit ZKVerifierUpdateCancelled(cancelled);
    }
}
