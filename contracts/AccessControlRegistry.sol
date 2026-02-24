// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title AccessControlRegistry
 * @dev Merkezi erişim kontrolü sağlayan ana sözleşme
 * @notice Tüm sistem düğümlerinin erişim haklarını yöneten merkezi otorite
 *
 * Özellikler:
 * - Düğüm tabanlı erişim kontrolü
 * - Hiyerarşik rol sistemi
 * - Zaman bazlı erişim hakları
 * - Audit trail (erişim geçmişi)
 * - Toplu işlem desteği
 * - Acil durum müdahale mekanizmaları
 */
contract AccessControlRegistry is Ownable, Pausable, ReentrancyGuard {

    // --- ROLE DEFINITIONS ---
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant MANAGER_ROLE = keccak256("MANAGER_ROLE");
    bytes32 public constant ENGINEER_ROLE = keccak256("ENGINEER_ROLE");
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    // --- RESOURCE DEFINITIONS ---
    bytes32 public constant SENSOR_DATA_RESOURCE = keccak256("SENSOR_DATA");
    bytes32 public constant PREDICTION_RESOURCE = keccak256("PREDICTION");
    bytes32 public constant MAINTENANCE_RESOURCE = keccak256("MAINTENANCE");
    bytes32 public constant CONFIG_RESOURCE = keccak256("CONFIG");
    bytes32 public constant AUDIT_LOGS_RESOURCE = keccak256("AUDIT_LOGS");
    bytes32 public constant FAULT_RECORD_RESOURCE = keccak256("FAULT_RECORD");
    bytes32 public constant TRAINING_RESOURCE = keccak256("TRAINING");
    bytes32 public constant REPORT_RESOURCE = keccak256("REPORT");

    // --- AUDIT ACTION DEFINITIONS ---
    bytes32 public constant ACTION_NODE_REGISTERED = keccak256("NODE_REGISTERED");
    bytes32 public constant ACTION_NODE_UPDATED = keccak256("NODE_UPDATED");
    bytes32 public constant ACTION_NODE_REMOVED = keccak256("NODE_REMOVED");
    bytes32 public constant ACTION_STATUS_CHANGED = keccak256("STATUS_CHANGED");
    bytes32 public constant ACTION_ACCESS_REQUESTED = keccak256("ACCESS_REQUESTED");
    bytes32 public constant ACTION_ACCESS_APPROVED = keccak256("ACCESS_APPROVED");
    bytes32 public constant ACTION_ACCESS_DENIED = keccak256("ACCESS_DENIED");
    bytes32 public constant ACTION_ACCESS_REVOKED = keccak256("ACCESS_REVOKED");
    bytes32 public constant ACTION_EMERGENCY_ACCESS = keccak256("EMERGENCY_ACCESS_GRANTED");
    bytes32 public constant ACTION_SECURITY_BREACH = keccak256("SECURITY_BREACH_REPORTED");
    bytes32 public constant ACTION_NODE_BLACKLISTED = keccak256("NODE_BLACKLISTED");
    bytes32 public constant ACTION_NODE_UNBLACKLISTED = keccak256("NODE_UNBLACKLISTED");
    bytes32 public constant ACTION_MANAGER_PENDING = keccak256("MANAGER_APPROVAL_PENDING");
    bytes32 public constant ACTION_MANAGER_APPROVED = keccak256("MANAGER_APPROVED");
    bytes32 public constant ACTION_MANAGER_REJECTED = keccak256("MANAGER_REJECTED");

    // --- NODE STATUS DEFINITIONS ---
    enum NodeStatus {
        INACTIVE,        // 0 - Pasif düğüm (geçici olarak kullanım dışı)
        ACTIVE,          // 1 - Aktif düğüm (çalışıyor)
        SUSPENDED        // 2 - Askıya alınmış (blacklist, güvenlik ihlali)
    }

    // --- GROUP CONFIG DEFINITIONS (Dynamic Node Types) ---
    struct GroupConfig {
        bool isActive;
        bool isManagerAccess;       // Eğer true ise Onay Mekanizmasına tabii tutulur
        bytes32 defaultRole;        // Otomatik verilecek rol (örn: OPERATOR_ROLE)
        bytes32[] defaultResources; // Otomatik izin verilecek kaynaklar
    }
    mapping(bytes32 => GroupConfig) public nodeGroups; // groupId => GroupConfig

    // --- ACCESS LEVEL DEFINITIONS ---
    enum AccessLevel {
        NO_ACCESS,      // 0 - Erişim yok
        READ_ONLY,      // 1 - Sadece okuma
        WRITE_LIMITED,  // 2 - Sınırlı yazma
        FULL_ACCESS,    // 3 - Tam erişim
        ADMIN_ACCESS    // 4 - Yönetici erişimi
    }

    // --- STRUCTS ---
    struct Node {
        bytes32 nodeId;              // Benzersiz düğüm ID'si
        string nodeName;             // Düğüm adı
        address nodeAddress;         // Düğümün blockchain adresi
        bytes32 groupId;             // Düğüm Tipi / Cinsi Grubu
        NodeStatus status;           // Mevcut durum
        NodeStatus previousStatus;   // Kara listeye alınmadan önceki durum (unblacklist için)
        AccessLevel accessLevel;     // Erişim seviyesi
        address owner;               // Düğüm sahibi
        uint256 createdAt;           // Oluşturulma zamanı
        uint256 lastActiveAt;        // Son aktif olma zamanı
        uint256 lastHeartbeat;       // Son kalp atışı (Canlılık kontrolü)
        uint256 accessExpiresAt;     // Erişim sona erme zamanı (0 = süresiz)
        bytes32[] assignedRoles;     // Atanmış roller
        bool isBlacklisted;          // Kara liste durumu
        string metadata;             // Ek bilgiler (JSON formatında)
    }

    struct AccessRequest {
        bytes32 requestId;          // İstek ID'si
        bytes32 nodeId;             // İstekte bulunan düğüm
        bytes32 targetResource;     // Erişim istenen kaynak
        AccessLevel requestedLevel; // İstenen erişim seviyesi
        address requester;          // İstekte bulunan adres
        uint256 requestedAt;        // İstek zamanı
        uint256 expiresAt;          // İstek sona erme zamanı
        bool isApproved;            // Onay durumu
        address approvedBy;         // Onaylayan adres
        string justification;       // Gerekçe
    }

    struct AuditLog {
        bytes32 logId;             // Log ID'si
        bytes32 nodeId;            // İlgili düğüm
        address actor;             // İşlemi yapan
        bytes32 action;            // Yapılan işlem (Optimized: bytes32)
        bytes32 targetResource;    // Hedef kaynak
        bool success;              // İşlem başarılı mı
        uint256 timestamp;         // İşlem zamanı
        string details;            // Detaylar
    }

    // --- STATE VARIABLES ---
    uint256 public nodeCounter;
    uint256 public requestCounter;
    uint256 public auditLogCounter;

    // Active node counter (gaz açısından O(1) sorgulama)
    uint256 public activeNodeCount;

    // Mappings
    mapping(bytes32 => Node) public nodes;                    // nodeId => Node
    mapping(address => bytes32[]) public addressToNodes;      // address => nodeId[]
    mapping(bytes32 => bool) public nodeExists;               // nodeId => exists
    mapping(bytes32 => AccessRequest) public accessRequests;  // requestId => AccessRequest
    mapping(bytes32 => AuditLog) public auditLogs;            // logId => AuditLog
    mapping(address => bool) public authorizedCallers;        // Yetkili çağırıcılar
    mapping(bytes32 => mapping(bytes32 => bool)) public nodePermissions; // nodeId => resource => hasPermission
    mapping(bytes32 => mapping(address => AccessLevel)) public nodeAddressPermissions; // nodeId => address => AccessLevel

    // Role mappings
    mapping(bytes32 => bool) public roles;                    // Mevcut roller
    mapping(address => mapping(bytes32 => bool)) public hasRole; // address => role => hasRole
    mapping(bytes32 => address[]) public roleMembers;         // role => addresses[]

    // System settings
    uint256 public defaultAccessDuration = 30 days;           // Varsayılan erişim süresi
    uint256 public maxNodesPerAddress = 10;                   // Adres başına max düğüm sayısı
    bool public requireApprovalForAccess = true;              // Erişim için onay gerekli mi

    // 🔒 SECURITY FIX: Manager node onay sistemi
    mapping(bytes32 => bool) public pendingManagerApproval;   // nodeId => awaiting approval
    mapping(bytes32 => uint256) public managerRequestTime;    // nodeId => request timestamp
    uint256 public constant MANAGER_REQUEST_EXPIRY = 7 days;  // Request expiry time
    bytes32[] public pendingManagerNodeIds;                   // Bekleyen manager node ID'leri
    mapping(bytes32 => uint256) public pendingManagerIndex;   // nodeId => index in array

    // ─────────────────────────────────────────────────────────────
    // Multi-Sig Onay Mekanizması
    // ─────────────────────────────────────────────────────────────
    uint256 public constant MULTISIG_OP_EXPIRY = 7 days;
    uint256 public multiSigThreshold = 1; // 1=eski davranış, ≥2=multi-sig aktif

    struct MultiSigOperation {
        bytes32 opId;
        bytes32 opType;         // "EMERGENCY_ACCESS" veya "MANAGER_APPROVAL"
        bytes32 nodeId;
        bytes32 targetResource; // Yalnızca EMERGENCY_ACCESS için
        string  reason;
        uint256 approvalCount;
        uint256 createdAt;
        bool    executed;
    }

    mapping(bytes32 => MultiSigOperation) public multiSigOps;
    mapping(bytes32 => mapping(address => bool)) public multiSigApprovals;

    bytes32[] private _pendingMultiSigOps;
    mapping(bytes32 => uint256) private _pendingMultiSigIndex;
    uint256 public multiSigOpCounter;

    // --- EVENTS ---
    event NodeRegistered(bytes32 indexed nodeId, address indexed nodeAddress, bytes32 groupId, address indexed owner);
    event NodeUpdated(bytes32 indexed nodeId, NodeStatus oldStatus, NodeStatus newStatus, address indexed updatedBy);
    event NodeRemoved(bytes32 indexed nodeId, address indexed removedBy, string reason);
    event NodeStatusChanged(bytes32 indexed nodeId, NodeStatus oldStatus, NodeStatus newStatus, address indexed changedBy);

    event AccessRequested(bytes32 indexed requestId, bytes32 indexed nodeId, bytes32 indexed targetResource, AccessLevel level, address requester);
    event AccessApproved(bytes32 indexed requestId, bytes32 indexed nodeId, address indexed approvedBy);
    event AccessDenied(bytes32 indexed requestId, bytes32 indexed nodeId, address indexed deniedBy, string reason);
    event AccessRevoked(bytes32 indexed nodeId, bytes32 indexed targetResource, address indexed revokedBy);

    event RoleGranted(bytes32 indexed role, address indexed account, address indexed sender);
    event RoleRevoked(bytes32 indexed role, address indexed account, address indexed sender);
    event RoleCreated(bytes32 indexed role, address indexed creator);

    event AuditLogCreated(bytes32 indexed logId, bytes32 indexed nodeId, address indexed actor, bytes32 action);
    event EmergencyAccessGranted(bytes32 indexed nodeId, address indexed grantedBy, string reason);
    event SecurityBreach(bytes32 indexed nodeId, address indexed suspiciousAddress, string details);

    // 🔒 SECURITY FIX: Manager onay eventleri
    event ManagerApprovalRequested(bytes32 indexed nodeId, address indexed requester, uint256 timestamp);
    event ManagerApproved(bytes32 indexed nodeId, address indexed approvedBy, uint256 timestamp);
    event ManagerApprovalRejected(bytes32 indexed nodeId, address indexed rejectedBy, string reason);

    event MultiSigOperationInitiated(
        bytes32 indexed opId, bytes32 opType,
        bytes32 indexed nodeId, address indexed initiator
    );
    event MultiSigOperationApproved(
        bytes32 indexed opId, address indexed approver,
        uint256 approvalCount, uint256 required
    );
    event MultiSigOperationExecuted(bytes32 indexed opId, address indexed executor);
    event MultiSigOperationCancelled(bytes32 indexed opId, address indexed cancelledBy);
    event MultiSigThresholdUpdated(uint256 oldThreshold, uint256 newThreshold);

    // --- MODIFIERS ---
    modifier onlyAuthorizedCaller() {
        require(authorizedCallers[msg.sender] || owner() == msg.sender, "AccessControl: Unauthorized caller");
        _;
    }

    modifier onlyValidNode(bytes32 nodeId) {
        require(nodeExists[nodeId], "AccessControl: Node does not exist");
        _;
    }

    modifier onlyActiveNode(bytes32 nodeId) {
        require(nodes[nodeId].status == NodeStatus.ACTIVE, "AccessControl: Node is not active");
        _;
    }

    modifier onlyNodeOwnerOrAdmin(bytes32 nodeId) {
        require(
            nodes[nodeId].owner == msg.sender ||
            hasRole[msg.sender][MANAGER_ROLE] ||
            hasRole[msg.sender][ADMIN_ROLE] ||
            owner() == msg.sender,
            "AccessControl: Not node owner or admin"
        );
        _;
    }

    modifier onlyRole(bytes32 role) {
        require(hasRole[msg.sender][role] || owner() == msg.sender, "AccessControl: Missing required role");
        _;
    }

    modifier notBlacklisted(address account) {
        // Adresin sahip olduğu düğümlerden herhangi biri kara listede mi kontrol et
        bytes32[] memory userNodes = addressToNodes[account];
        uint256 len = userNodes.length;
        require(len <= maxNodesPerAddress, "AccessControl: Node count exceeds limit");
        for (uint i = 0; i < len; i++) {
            require(!nodes[userNodes[i]].isBlacklisted, "AccessControl: Address is blacklisted");
        }
        _;
    }

    // --- CONSTRUCTOR ---
    constructor(address _initialAdmin) Ownable(_initialAdmin) {
        require(_initialAdmin != address(0), "AccessControl: Invalid admin");

        // İlk rolleri oluştur
        _createRole(ADMIN_ROLE);
        _createRole(MANAGER_ROLE);
        _createRole(ENGINEER_ROLE);
        _createRole(OPERATOR_ROLE);

        // Initial admin'e süper admin rolü ver
        _grantRole(ADMIN_ROLE, _initialAdmin);
        _grantRole(MANAGER_ROLE, _initialAdmin);

        // Contract'ı yetkili çağırıcı olarak ekle
        authorizedCallers[address(this)] = true;

        nodeCounter = 1;
        requestCounter = 1;
        auditLogCounter = 1;
        activeNodeCount = 0;
    }

    // --- NODE MANAGEMENT FUNCTIONS ---

    /**
     * @dev Yeni düğüm kaydetme
     */
    function registerNode(
        string calldata nodeName,
        address nodeAddress,
        bytes32 groupId,
        AccessLevel accessLevel,
        uint256 accessDuration,
        string calldata metadata
    ) external whenNotPaused nonReentrant notBlacklisted(msg.sender) returns (bytes32 nodeId) {
        require(nodeAddress != address(0), "AccessControl: Invalid node address");
        require(bytes(nodeName).length > 0, "AccessControl: Node name required");
        require(addressToNodes[msg.sender].length < maxNodesPerAddress, "AccessControl: Max nodes per address exceeded");

        // Benzersiz node ID oluştur
        nodeId = keccak256(abi.encodePacked(msg.sender, nodeAddress, nodeName, block.timestamp, nodeCounter));
        require(!nodeExists[nodeId], "AccessControl: Node ID collision");

        // Erişim süresi hesapla
        uint256 expiresAt = accessDuration > 0 ? block.timestamp + accessDuration : 0;

        // Düğüm oluştur
        nodes[nodeId] = Node({
            nodeId: nodeId,
            nodeName: nodeName,
            nodeAddress: nodeAddress,
            groupId: groupId,
            status: requireApprovalForAccess ? NodeStatus.INACTIVE : NodeStatus.ACTIVE,
            accessLevel: accessLevel,
            owner: msg.sender,
            createdAt: block.timestamp,
            lastActiveAt: block.timestamp,
            lastHeartbeat: block.timestamp,
            accessExpiresAt: expiresAt,
            assignedRoles: new bytes32[](0),
            isBlacklisted: false,
            metadata: metadata
        });

        nodeExists[nodeId] = true;
        addressToNodes[msg.sender].push(nodeId);
        if (nodeAddress != address(0) && nodeAddress != msg.sender) {
            addressToNodes[nodeAddress].push(nodeId);
        }
        nodeCounter++;

        // Active counter güncelle (Sadece aktifse artır)
        if (!requireApprovalForAccess) {
            activeNodeCount++;
        }

        // 🚀 AUTO-GRANT: Dinamik Node Group tipine göre otomatik erişim izinleri ver
        _autoGrantPermissions(nodeId, groupId);

        // Audit log oluştur
        _createAuditLog(nodeId, msg.sender, ACTION_NODE_REGISTERED, bytes32(0), true,
            string(abi.encodePacked("Node registered: ", nodeName)));

        emit NodeRegistered(nodeId, nodeAddress, groupId, msg.sender);

        return nodeId;
    }

    /**
     * @dev Düğüm bilgilerini güncelleme
     */
    function updateNode(
        bytes32 nodeId,
        string calldata nodeName,
        bytes32 groupId,
        AccessLevel accessLevel,
        string calldata metadata
    ) external whenNotPaused onlyValidNode(nodeId) onlyNodeOwnerOrAdmin(nodeId) {
        Node storage node = nodes[nodeId];

        NodeStatus oldStatus = node.status;

        node.nodeName = nodeName;
        node.groupId = groupId;
        node.accessLevel = accessLevel;
        node.metadata = metadata;
        node.lastActiveAt = block.timestamp;

        // Audit log oluştur
        // Audit log oluştur
        _createAuditLog(nodeId, msg.sender, ACTION_NODE_UPDATED, bytes32(0), true, "Node information updated");

        emit NodeUpdated(nodeId, oldStatus, node.status, msg.sender);
    }

    /**
     * @dev Düğüm durumunu değiştirme
     */
    function changeNodeStatus(
        bytes32 nodeId,
        NodeStatus newStatus
    ) external whenNotPaused onlyValidNode(nodeId) onlyNodeOwnerOrAdmin(nodeId) {
        Node storage node = nodes[nodeId];
        NodeStatus oldStatus = node.status;

        require(oldStatus != newStatus, "AccessControl: Status already set");

        // SECURITY (M9): If approval required, owner cannot activate node
        if (newStatus == NodeStatus.ACTIVE && requireApprovalForAccess) {
            require(
                hasRole[msg.sender][MANAGER_ROLE] || 
                hasRole[msg.sender][ADMIN_ROLE] || 
                owner() == msg.sender,
                "AccessControl: Admin approval required to activate node"
            );
        }

        node.status = newStatus;
        node.lastActiveAt = block.timestamp;

        // Active counter ayarla
        if (oldStatus != NodeStatus.ACTIVE && newStatus == NodeStatus.ACTIVE) {
            activeNodeCount++;
        } else if (oldStatus == NodeStatus.ACTIVE && newStatus != NodeStatus.ACTIVE) {
            if (activeNodeCount > 0) {
                activeNodeCount--;
            }
        }

        // Audit log oluştur
        // Audit log oluştur
        _createAuditLog(nodeId, msg.sender, ACTION_STATUS_CHANGED, bytes32(0), true, "Node status changed");

        emit NodeStatusChanged(nodeId, oldStatus, newStatus, msg.sender);
    }

    /**
     * @dev Düğümü silme
     */
    function removeNode(
        bytes32 nodeId,
        string calldata reason
    ) external whenNotPaused onlyValidNode(nodeId) onlyNodeOwnerOrAdmin(nodeId) {
        Node storage node = nodes[nodeId];
        address nodeOwner = node.owner;
        bytes32 groupId = node.groupId;

        // Eğer aktifse sayaç azalt
        if (node.status == NodeStatus.ACTIVE) {
            if (activeNodeCount > 0) {
                activeNodeCount--;
            }
        }

        // Düğümü pasif yap (defansif)
        node.status = NodeStatus.INACTIVE;

        // Address mapping'den çıkar
        _removeNodeFromAddress(nodeOwner, nodeId);
        if (node.nodeAddress != address(0) && node.nodeAddress != nodeOwner) {
            _removeNodeFromAddress(node.nodeAddress, nodeId);
        }

        // 🔒 SECURITY FIX: Auto-granted rolleri revoke et
        // Privilege escalation attack'ı önlemek için node silindiğinde roller de silinmeli
        _revokeAutoGrantedRoles(nodeOwner, groupId, nodeId);

        // Node'u sil
        delete nodes[nodeId];
        nodeExists[nodeId] = false;

        // Audit log oluştur
        _createAuditLog(nodeId, msg.sender, ACTION_NODE_REMOVED, bytes32(0), true, reason);

        emit NodeRemoved(nodeId, msg.sender, reason);
    }

    /**
     * @dev 🔒 SECURITY: Node silindiğinde auto-granted rolleri revoke et
     * @notice Sadece başka aynı tip node yoksa rolü kaldırır
     */
    function _revokeAutoGrantedRoles(address nodeOwner, bytes32 groupId, bytes32 removedNodeId) internal {
        // Önce bu adresin aynı tipte başka node'u var mı kontrol et
        bytes32[] storage userNodes = addressToNodes[nodeOwner];
        bool hasOtherSameTypeNode = false;
        
        for (uint i = 0; i < userNodes.length; i++) {
            bytes32 otherNodeId = userNodes[i];
            // Silinen node'u atla ve aynı tipte başka node var mı bak
            if (otherNodeId != removedNodeId && 
                nodeExists[otherNodeId] && 
                nodes[otherNodeId].groupId == groupId) {
                hasOtherSameTypeNode = true;
                break;
            }
        }
        
        // Eğer başka aynı tipte node yoksa, rolü revoke et
        if (!hasOtherSameTypeNode) {
            bytes32 grantedRole = nodeGroups[groupId].defaultRole;
            if (grantedRole != bytes32(0) && hasRole[nodeOwner][grantedRole]) {
                _revokeRoleInternal(grantedRole, nodeOwner);
            }
        }
    }

    /**
     * @dev 🔒 Internal role revocation (no permission check - trusted caller only)
     */
    function _revokeRoleInternal(bytes32 role, address account) internal {
        if (!hasRole[account][role]) return;
        
        hasRole[account][role] = false;

        // Role members array'den çıkar
        address[] storage members = roleMembers[role];
        for (uint i = 0; i < members.length; i++) {
            if (members[i] == account) {
                members[i] = members[members.length - 1];
                members.pop();
                break;
            }
        }

        emit RoleRevoked(role, account, address(this));
    }

    // --- ACCESS CONTROL FUNCTIONS ---

    /**
     * @dev Ana erişim kontrolü fonksiyonu - Diğer sözleşmeler tarafından çağrılır
     */
    function checkAccess(
        address caller,
        bytes32 resource,
        AccessLevel requiredLevel
    ) external view returns (bool hasAccess, string memory reason) {
        // Caller'ın düğümlerini kontrol et
        bytes32[] memory callerNodes = addressToNodes[caller];

        if (callerNodes.length == 0) {
            return (false, "No registered nodes for caller");
        }

        // Her düğüm için erişim kontrolü
        for (uint i = 0; i < callerNodes.length; i++) {
            bytes32 nodeId = callerNodes[i];
            Node storage node = nodes[nodeId];

            // Temel kontroller
            if (node.status != NodeStatus.ACTIVE) {
                continue; // Aktif olmayan düğümleri atla
            }

            if (node.isBlacklisted) {
                return (false, "Node is blacklisted");
            }

            // Erişim süresi kontrolü
            if (node.accessExpiresAt > 0 && block.timestamp > node.accessExpiresAt) {
                continue; // Süresi dolmuş düğümleri atla
            }

            // Erişim seviyesi kontrolü
            if (node.accessLevel >= requiredLevel) {
                // Kaynak bazlı izin kontrolü
                if (nodePermissions[nodeId][resource] || resource == bytes32(0)) {
                    return (true, "Access granted");
                }
            }
        }

        return (false, "Insufficient access level or permissions");
    }

    /**
     * @dev Erişim isteği oluşturma
     */
    function requestAccess(
        bytes32 nodeId,
        bytes32 targetResource,
        AccessLevel requestedLevel,
        uint256 duration,
        string calldata justification
    ) external whenNotPaused onlyValidNode(nodeId) returns (bytes32 requestId) {
        require(nodes[nodeId].owner == msg.sender, "AccessControl: Not node owner");

        requestId = keccak256(abi.encodePacked(nodeId, targetResource, msg.sender, block.timestamp, requestCounter));

        accessRequests[requestId] = AccessRequest({
            requestId: requestId,
            nodeId: nodeId,
            targetResource: targetResource,
            requestedLevel: requestedLevel,
            requester: msg.sender,
            requestedAt: block.timestamp,
            expiresAt: block.timestamp + duration,
            isApproved: false,
            approvedBy: address(0),
            justification: justification
        });

        requestCounter++;

        // Audit log oluştur
        _createAuditLog(nodeId, msg.sender, ACTION_ACCESS_REQUESTED, targetResource, true, justification);

        emit AccessRequested(requestId, nodeId, targetResource, requestedLevel, msg.sender);

        return requestId;
    }

    /**
     * @dev Erişim isteğini onaylama
     */
    function approveAccessRequest(
        bytes32 requestId
    ) external whenNotPaused onlyRole(MANAGER_ROLE) {
        AccessRequest storage request = accessRequests[requestId];
        require(request.requestId != bytes32(0), "AccessControl: Request does not exist");
        require(!request.isApproved, "AccessControl: Request already approved");

        require(block.timestamp <= request.expiresAt, "AccessControl: Request expired");

        // İsteği onayla
        request.isApproved = true;
        request.approvedBy = msg.sender;

        // Düğüme izin ver
        nodePermissions[request.nodeId][request.targetResource] = true;

        // Düğümün erişim seviyesini güncelle (gerekirse)
        if (nodes[request.nodeId].accessLevel < request.requestedLevel) {
            nodes[request.nodeId].accessLevel = request.requestedLevel;
        }

        // Audit log oluştur
        _createAuditLog(request.nodeId, msg.sender, ACTION_ACCESS_APPROVED, request.targetResource, true, "Access request approved");

        emit AccessApproved(requestId, request.nodeId, msg.sender);
    }

    /**
     * @dev Erişim isteğini reddetme
     */
    function denyAccessRequest(
        bytes32 requestId,
        string calldata reason
    ) external whenNotPaused onlyRole(MANAGER_ROLE) {
        AccessRequest storage request = accessRequests[requestId];
        require(request.requestId != bytes32(0), "AccessControl: Request does not exist");
        require(!request.isApproved, "AccessControl: Request already approved");
        // Silmeden önce gerekli alanları kopyala
        bytes32 nodeId = request.nodeId;
        bytes32 targetResource = request.targetResource;

        // İsteği sil

        // İsteği sil
        delete accessRequests[requestId];

        // Audit log oluştur
        _createAuditLog(nodeId, msg.sender, ACTION_ACCESS_DENIED, targetResource, false, reason);

        emit AccessDenied(requestId, nodeId, msg.sender, reason);
    }

    /**
     * @dev Erişim iznini iptal etme
     */
    function revokeAccess(
        bytes32 nodeId,
        bytes32 targetResource
    ) external whenNotPaused onlyValidNode(nodeId) onlyRole(MANAGER_ROLE) {
        nodePermissions[nodeId][targetResource] = false;

        // Audit log oluştur
        _createAuditLog(nodeId, msg.sender, ACTION_ACCESS_REVOKED, targetResource, true, "Access revoked by admin");

        emit AccessRevoked(nodeId, targetResource, msg.sender);
    }

    // --- ROLE MANAGEMENT FUNCTIONS ---

    /**
     * @dev Yeni rol oluşturma
     */
    function createRole(bytes32 role) external onlyRole(ADMIN_ROLE) {
        _createRole(role);
    }

    function _createRole(bytes32 role) internal {
        require(!roles[role], "AccessControl: Role already exists");
        roles[role] = true;
        emit RoleCreated(role, msg.sender);
    }

    /**
     * @dev Rol verme
     */
    function grantRole(bytes32 role, address account) external onlyRole(ADMIN_ROLE) {
        _grantRole(role, account);
    }

    function _grantRole(bytes32 role, address account) internal {
        require(roles[role], "AccessControl: Role does not exist");
        require(!hasRole[account][role], "AccessControl: Account already has role");

        hasRole[account][role] = true;
        roleMembers[role].push(account);

        emit RoleGranted(role, account, msg.sender);
    }

    /**
     * @dev Rol iptal etme
     */
    function revokeRole(bytes32 role, address account) external onlyRole(ADMIN_ROLE) {
        require(hasRole[account][role], "AccessControl: Account does not have role");

        hasRole[account][role] = false;

        // Role members array'den çıkar
        address[] storage members = roleMembers[role];
        for (uint i = 0; i < members.length; i++) {
            if (members[i] == account) {
                members[i] = members[members.length - 1];
                members.pop();
                break;
            }
        }

        emit RoleRevoked(role, account, msg.sender);
    }

    // --- EMERGENCY FUNCTIONS ---

    /**
     * @dev Acil durum erişimi verme
     */
    function grantEmergencyAccess(
        bytes32 nodeId,
        bytes32 targetResource,
        string calldata reason
    ) external onlyRole(ADMIN_ROLE) {
        require(nodeExists[nodeId], "AccessControl: Node does not exist");

        if (multiSigThreshold <= 1) {
            _executeEmergencyAccess(nodeId, targetResource, reason);
        } else {
            bytes32 opId = _computeEmergencyOpId(nodeId, targetResource);
            if (multiSigOps[opId].createdAt != 0 && !multiSigOps[opId].executed) {
                _recordMultiSigApproval(opId);
            } else {
                _initiateMultiSig(
                    keccak256("EMERGENCY_ACCESS"), nodeId, targetResource, reason
                );
            }
        }
    }

    function _executeEmergencyAccess(
        bytes32 nodeId,
        bytes32 targetResource,
        string memory reason
    ) internal {
        // Önce mevcut status al
        NodeStatus oldStatus = nodes[nodeId].status;

        // Düğümü aktif yap ve tam erişim ver
        nodes[nodeId].status = NodeStatus.ACTIVE;
        nodes[nodeId].accessLevel = AccessLevel.ADMIN_ACCESS;
        nodes[nodeId].isBlacklisted = false;
        nodePermissions[nodeId][targetResource] = true;

        // Eğer eskiden aktif değilse sayaç artır
        if (oldStatus != NodeStatus.ACTIVE) {
            activeNodeCount++;
        }

        // Audit log oluştur
        _createAuditLog(nodeId, msg.sender, ACTION_EMERGENCY_ACCESS, targetResource, true, reason);

        emit EmergencyAccessGranted(nodeId, msg.sender, reason);
    }

    /**
     * @dev Güvenlik ihlali bildirimi
     */
    function reportSecurityBreach(
        bytes32 nodeId,
        address suspiciousAddress,
        string calldata details
    ) external onlyAuthorizedCaller {
        // Düğümü askıya al
        if (nodeExists[nodeId]) {
            // Eğer önceden aktifse sayaç azalt
            if (nodes[nodeId].status == NodeStatus.ACTIVE) {
                if (activeNodeCount > 0) {
                    activeNodeCount--;
                }
            }
            nodes[nodeId].status = NodeStatus.SUSPENDED;
        }

        // Audit log oluştur
        _createAuditLog(nodeId, msg.sender, ACTION_SECURITY_BREACH, bytes32(0), false, details);

        emit SecurityBreach(nodeId, suspiciousAddress, details);
    }

    /**
     * @dev Düğümü kara listeye alma
     */
    function blacklistNode(
        bytes32 nodeId,
        string calldata reason
    ) external onlyRole(MANAGER_ROLE) onlyValidNode(nodeId) {
        // Kara listeden önceki durumu sakla (unblacklistNode'da geri yüklenecek)
        nodes[nodeId].previousStatus = nodes[nodeId].status;

        // Eğer aktifse sayaç azalt
        if (nodes[nodeId].status == NodeStatus.ACTIVE) {
            if (activeNodeCount > 0) {
                activeNodeCount--;
            }
        }

        nodes[nodeId].isBlacklisted = true;
        nodes[nodeId].status = NodeStatus.SUSPENDED;

        // Audit log oluştur
        _createAuditLog(nodeId, msg.sender, ACTION_NODE_BLACKLISTED, bytes32(0), true, reason);
    }

    /**
     * @dev Düğümü kara listeden çıkarma
     */
    function unblacklistNode(
        bytes32 nodeId,
        string calldata reason
    ) external onlyRole(ADMIN_ROLE) onlyValidNode(nodeId) {
        // Kara listeye alınmadan önceki durumu geri yükle
        NodeStatus restored = nodes[nodeId].previousStatus;

        nodes[nodeId].isBlacklisted = false;
        nodes[nodeId].status = restored;
        nodes[nodeId].previousStatus = NodeStatus.INACTIVE; // sıfırla

        // Önceki durum ACTIVE idiyse sayacı geri artır
        if (restored == NodeStatus.ACTIVE) {
            activeNodeCount++;
        }

        // Audit log oluştur
        _createAuditLog(nodeId, msg.sender, ACTION_NODE_UNBLACKLISTED, bytes32(0), true, reason);
    }

    // --- AUDIT FUNCTIONS ---

    /**
     * @dev Audit log oluşturma
     */
    function _createAuditLog(
        bytes32 nodeId,
        address actor,
        bytes32 action,
        bytes32 targetResource,
        bool success,
        string memory details
    ) internal {
        bytes32 logId = keccak256(abi.encodePacked(nodeId, actor, action, block.timestamp, auditLogCounter));

        auditLogs[logId] = AuditLog({
            logId: logId,
            nodeId: nodeId,
            actor: actor,
            action: action,
            targetResource: targetResource,
            success: success,
            timestamp: block.timestamp,
            details: details
        });

        auditLogCounter++;

        emit AuditLogCreated(logId, nodeId, actor, action);
    }

    // --- VIEW FUNCTIONS ---

    /**
     * @dev Düğüm bilgilerini getirme
     */
    function getNode(bytes32 nodeId) external view returns (Node memory) {
        require(nodeExists[nodeId], "AccessControl: Node does not exist");
        return nodes[nodeId];
    }

    /**
     * @dev Adresin düğümlerini getirme
     */
    function getNodesByAddress(address nodeOwner) external view returns (bytes32[] memory) {
        return addressToNodes[nodeOwner];
    }

    /**
     * @dev Aktif düğüm sayısını getirme
     * @notice O(1) — sayaç üzerinden döndürülür
     */
    function getActiveNodeCount() external view returns (uint256) {
        return activeNodeCount;
    }

    /**
     * @dev Rol üyelerini getirme
     */
    function getRoleMembers(bytes32 role) external view returns (address[] memory) {
        return roleMembers[role];
    }

    // --- ADMIN FUNCTIONS ---

    /**
     * @dev Yetkili çağırıcı ekleme
     */
    function addAuthorizedCaller(address caller) external onlyRole(ADMIN_ROLE) {
        authorizedCallers[caller] = true;
    }

    /**
     * @dev Yetkili çağırıcı çıkarma
     */
    function removeAuthorizedCaller(address caller) external onlyRole(ADMIN_ROLE) {
        authorizedCallers[caller] = false;
    }

    /**
     * @dev Sistem ayarlarını güncelleme
     */
    function updateSystemSettings(
        uint256 _defaultAccessDuration,
        uint256 _maxNodesPerAddress,
        bool _requireApprovalForAccess
    ) external onlyRole(ADMIN_ROLE) {
        require(_maxNodesPerAddress > 0 && _maxNodesPerAddress <= 100, "AccessControl: Invalid max nodes limit");
        defaultAccessDuration = _defaultAccessDuration;
        maxNodesPerAddress = _maxNodesPerAddress;
        requireApprovalForAccess = _requireApprovalForAccess;
    }

    /**
     * @dev Acil durum durdurma
     */
    function emergencyPause() external onlyRole(ADMIN_ROLE) {
        _pause();
    }

    /**
     * @dev Sistemi tekrar başlatma
     */
    function unpause() external onlyRole(ADMIN_ROLE) {
        _unpause();
    }

    // --- UTILITY FUNCTIONS ---

    function _removeNodeFromAddress(address nodeOwner, bytes32 nodeId) internal {
        bytes32[] storage userNodes = addressToNodes[nodeOwner];
        for (uint i = 0; i < userNodes.length; i++) {
            if (userNodes[i] == nodeId) {
                userNodes[i] = userNodes[userNodes.length - 1];
                userNodes.pop();
                break;
            }
        }
    }

    function _statusToString(NodeStatus status) internal pure returns (string memory) {
        if (status == NodeStatus.INACTIVE) return "INACTIVE";
        if (status == NodeStatus.ACTIVE) return "ACTIVE";
        if (status == NodeStatus.SUSPENDED) return "SUSPENDED";
        return "UNKNOWN";
    }

    // --- BATCH OPERATIONS ---

    /**
     * @dev Toplu düğüm durumu güncelleme
     */
    function batchUpdateNodeStatus(
        bytes32[] calldata nodeIds,
        NodeStatus newStatus
    ) external onlyRole(MANAGER_ROLE) {
        for (uint i = 0; i < nodeIds.length; i++) {
            bytes32 id = nodeIds[i];
            if (nodeExists[id]) {
                NodeStatus oldStatus = nodes[id].status;
                // Sayaç güncellemesi
                if (oldStatus != NodeStatus.ACTIVE && newStatus == NodeStatus.ACTIVE) {
                    activeNodeCount++;
                } else if (oldStatus == NodeStatus.ACTIVE && newStatus != NodeStatus.ACTIVE) {
                    if (activeNodeCount > 0) {
                        activeNodeCount--;
                    }
                }
                nodes[id].status = newStatus;
                emit NodeStatusChanged(id, oldStatus, newStatus, msg.sender);
            }
        }
    }

    /**
     * @dev Toplu erişim iptal etme
     */
    function batchRevokeAccess(
        bytes32[] calldata nodeIds,
        bytes32 targetResource
    ) external onlyRole(MANAGER_ROLE) {
        for (uint i = 0; i < nodeIds.length; i++) {
            if (nodeExists[nodeIds[i]]) {
                nodePermissions[nodeIds[i]][targetResource] = false;
                emit AccessRevoked(nodeIds[i], targetResource, msg.sender);
            }
        }
    }

    // ─────────────────────────────────────────────────────────────
    // Dynamic Group Management
    // ─────────────────────────────────────────────────────────────
    
    /**
     * @dev Dinamik olarak yeni bir düğüm grubu ekler / günceller
     */
    function setNodeGroup(
        bytes32 groupId,
        bool isActive,
        bool isManagerAccess,
        bytes32 defaultRole,
        bytes32[] calldata defaultResources
    ) external onlyRole(ADMIN_ROLE) {
        GroupConfig storage group = nodeGroups[groupId];
        group.isActive = isActive;
        group.isManagerAccess = isManagerAccess;
        group.defaultRole = defaultRole;
        group.defaultResources = defaultResources;
    }

    // ─────────────────────────────────────────────────────────────
    // Heartbeat & Auto-Suspend
    // ─────────────────────────────────────────────────────────────

    /**
     * @dev Düğümün kendi canlılığını sisteme bildirmesi
     */
    function heartbeat(bytes32 nodeId) external whenNotPaused onlyValidNode(nodeId) onlyNodeOwnerOrAdmin(nodeId) {
        Node storage node = nodes[nodeId];
        require(node.status == NodeStatus.ACTIVE, "AccessControl: Node is not active");
        node.lastHeartbeat = block.timestamp;
        node.lastActiveAt = block.timestamp;
    }

    /**
     * @dev Uzun süre heartbeat göndermeyen düğümü askıya alma
     */
    function checkAndSuspendInactive(bytes32 nodeId) external whenNotPaused onlyValidNode(nodeId) {
        Node storage node = nodes[nodeId];
        require(node.status == NodeStatus.ACTIVE, "AccessControl: Node is not active");
        
        // Timeout süresi örneğin 1 saat (3600 saniye). Bunu hardcoded bırakıyorum opsiyonel configurable da yapılabilir.
        require(block.timestamp > node.lastHeartbeat + 1 hours, "AccessControl: Node is still considered active");

        node.status = NodeStatus.SUSPENDED;
        if (activeNodeCount > 0) {
            activeNodeCount--;
        }

        _createAuditLog(nodeId, msg.sender, ACTION_STATUS_CHANGED, bytes32(0), true, "Node gracefully suspended due to inactivity");
        
        emit NodeStatusChanged(nodeId, NodeStatus.ACTIVE, NodeStatus.SUSPENDED, msg.sender);
    }

    // --- INTERNAL HELPER FUNCTIONS ---

    /**
     * @dev Node group bazlı dinamik otomatik erişim izinleri ver
     * @notice Bu fonksiyon registerNode sırasında otomatik çağrılır
     */
    function _autoGrantPermissions(bytes32 nodeId, bytes32 groupId) internal {
        GroupConfig storage config = nodeGroups[groupId];
        require(config.isActive || !requireApprovalForAccess, "AccessControl: Group is not active");
        
        address nodeOwner = nodes[nodeId].owner;

        if (config.isManagerAccess) {
            // 🔒 SECURITY FIX: Manager node'lar için onay gerekli
            // Otomatik yetkilendirme YAPILMAZ - admin onayı beklenir
            // Node INACTIVE olarak başlar, onay sonrası ACTIVE olur

            pendingManagerApproval[nodeId] = true;
            managerRequestTime[nodeId] = block.timestamp;
            nodes[nodeId].status = NodeStatus.INACTIVE; // Onay bekliyor

            // Pending array'e ekle
            pendingManagerIndex[nodeId] = pendingManagerNodeIds.length;
            pendingManagerNodeIds.push(nodeId);

            // Active counter düzelt (registerNode'da artırıldıysa)
            if (!requireApprovalForAccess && activeNodeCount > 0) {
                activeNodeCount--;
            }

            emit ManagerApprovalRequested(nodeId, nodeOwner, block.timestamp);

            // Audit log
            _createAuditLog(nodeId, nodeOwner, ACTION_MANAGER_PENDING, bytes32(0), true,
                "Manager node awaiting admin approval");
        } else {
            // Normal (Data Processor / Engineer) düğümler
            for (uint i = 0; i < config.defaultResources.length; i++) {
                nodePermissions[nodeId][config.defaultResources[i]] = true;
            }

            if (config.defaultRole != bytes32(0) && !hasRole[nodeOwner][config.defaultRole]) {
                _grantRole(config.defaultRole, nodeOwner);
            }
            emit AccessApproved(bytes32(0), nodeId, address(this));
        }
    }

    /**
     * @dev Pending array'den node kaldır (internal helper)
     */
    function _removePendingManager(bytes32 nodeId) internal {
        uint256 index = pendingManagerIndex[nodeId];
        uint256 lastIndex = pendingManagerNodeIds.length - 1;

        if (index != lastIndex) {
            bytes32 lastNodeId = pendingManagerNodeIds[lastIndex];
            pendingManagerNodeIds[index] = lastNodeId;
            pendingManagerIndex[lastNodeId] = index;
        }

        pendingManagerNodeIds.pop();
        delete pendingManagerIndex[nodeId];
    }

    /**
     * @dev Manager node onaylama - Sadece SUPER_ADMIN veya SYSTEM_ADMIN yapabilir
     * @notice Bu fonksiyon privilege escalation'ı önler
     */
    function approveManagerNode(bytes32 nodeId)
        external
        whenNotPaused
        onlyValidNode(nodeId)
    {
        require(
            hasRole[msg.sender][ADMIN_ROLE] ||
            hasRole[msg.sender][MANAGER_ROLE] ||
            owner() == msg.sender,
            "AccessControl: Only admin can approve manager nodes"
        );
        require(pendingManagerApproval[nodeId], "AccessControl: No pending approval for this node");
        require(nodeGroups[nodes[nodeId].groupId].isManagerAccess, "AccessControl: Node group is not manager type");
        require(
            block.timestamp <= managerRequestTime[nodeId] + MANAGER_REQUEST_EXPIRY,
            "AccessControl: Manager request has expired"
        );

        if (multiSigThreshold <= 1) {
            _executeManagerApproval(nodeId);
        } else {
            bytes32 opId = _computeManagerOpId(nodeId);
            if (multiSigOps[opId].createdAt != 0 && !multiSigOps[opId].executed) {
                _recordMultiSigApproval(opId);
            } else {
                _initiateMultiSig(
                    keccak256("MANAGER_APPROVAL"), nodeId, bytes32(0), ""
                );
            }
        }
    }

    function _executeManagerApproval(bytes32 nodeId) internal {
        address nodeOwner = nodes[nodeId].owner;

        // Onay durumunu temizle
        pendingManagerApproval[nodeId] = false;
        _removePendingManager(nodeId);

        // Node'u aktif yap
        nodes[nodeId].status = NodeStatus.ACTIVE;
        activeNodeCount++;

        // Şimdi yetkileri ver
        nodePermissions[nodeId][SENSOR_DATA_RESOURCE] = true;
        nodePermissions[nodeId][PREDICTION_RESOURCE] = true;
        nodePermissions[nodeId][CONFIG_RESOURCE] = true;
        nodePermissions[nodeId][AUDIT_LOGS_RESOURCE] = true;
        nodePermissions[nodeId][TRAINING_RESOURCE] = true;
        nodePermissions[nodeId][REPORT_RESOURCE] = true;

        // SYSTEM_ADMIN rolü ver
        if (!hasRole[nodeOwner][MANAGER_ROLE]) {
            _grantRole(MANAGER_ROLE, nodeOwner);
        }

        emit ManagerApproved(nodeId, msg.sender, block.timestamp);
        emit AccessApproved(bytes32(0), nodeId, msg.sender);

        _createAuditLog(nodeId, msg.sender, ACTION_MANAGER_APPROVED, bytes32(0), true,
            string(abi.encodePacked("Manager node approved by admin: ", _addressToString(msg.sender))));
    }

    /**
     * @dev Manager node reddetme
     */
    function rejectManagerNode(bytes32 nodeId, string calldata reason)
        external
        whenNotPaused
        onlyValidNode(nodeId)
    {
        require(
            hasRole[msg.sender][ADMIN_ROLE] ||
            hasRole[msg.sender][MANAGER_ROLE] ||
            owner() == msg.sender,
            "AccessControl: Only admin can reject manager nodes"
        );
        require(pendingManagerApproval[nodeId], "AccessControl: No pending approval for this node");

        // Onay durumunu temizle
        pendingManagerApproval[nodeId] = false;
        _removePendingManager(nodeId);

        // Node'u askıya al
        nodes[nodeId].status = NodeStatus.SUSPENDED;

        emit ManagerApprovalRejected(nodeId, msg.sender, reason);

        _createAuditLog(nodeId, msg.sender, ACTION_MANAGER_REJECTED, bytes32(0), false, reason);
    }

    /**
     * @dev Bekleyen manager onaylarını listele
     */
    function getPendingManagerApprovals() external view returns (bytes32[] memory) {
        return pendingManagerNodeIds;
    }

    /**
     * @dev Bekleyen manager sayısını döndür
     */
    function getPendingManagerCount() external view returns (uint256) {
        return pendingManagerNodeIds.length;
    }

    /**
     * @dev Belirli bir node'un pending durumunu kontrol et
     */
    function isManagerPending(bytes32 nodeId) external view returns (bool isPending, uint256 requestTime, uint256 expiresAt) {
        isPending = pendingManagerApproval[nodeId];
        requestTime = managerRequestTime[nodeId];
        expiresAt = requestTime + MANAGER_REQUEST_EXPIRY;
    }

    /**
     * @dev Address'i string'e çevir (audit log için)
     */
    function _addressToString(address _addr) internal pure returns (string memory) {
        bytes32 value = bytes32(uint256(uint160(_addr)));
        bytes memory alphabet = "0123456789abcdef";
        bytes memory str = new bytes(42);
        str[0] = '0';
        str[1] = 'x';
        for (uint256 i = 0; i < 20; i++) {
            str[2+i*2] = alphabet[uint8(value[i + 12] >> 4)];
            str[3+i*2] = alphabet[uint8(value[i + 12] & 0x0f)];
        }
        return string(str);
    }

    // ─────────────────────────────────────────────────────────────
    // Multi-Sig Internal, Public and View Functions
    // ─────────────────────────────────────────────────────────────

    // Multi-sig işlemi başlatır; başlatıcı otomatik ilk onaycı
    function _initiateMultiSig(
        bytes32 opType, bytes32 nodeId, bytes32 resource, string memory reason
    ) internal {
        bytes32 opId = keccak256(abi.encodePacked(nodeId, resource, opType, multiSigOpCounter++));
        multiSigOps[opId] = MultiSigOperation({
            opId: opId, opType: opType, nodeId: nodeId, targetResource: resource,
            reason: reason, approvalCount: 1, createdAt: block.timestamp, executed: false
        });
        multiSigApprovals[opId][msg.sender] = true;
        _pendingMultiSigIndex[opId] = _pendingMultiSigOps.length;
        _pendingMultiSigOps.push(opId);
        emit MultiSigOperationInitiated(opId, opType, nodeId, msg.sender);
        emit MultiSigOperationApproved(opId, msg.sender, 1, multiSigThreshold);
    }

    // Var olan işleme onay ekler; threshold dolunca uygular
    function _recordMultiSigApproval(bytes32 opId) internal {
        MultiSigOperation storage op = multiSigOps[opId];
        require(!op.executed, "AccessControl: Operation already executed");
        require(block.timestamp <= op.createdAt + MULTISIG_OP_EXPIRY, "AccessControl: Operation expired");
        require(!multiSigApprovals[opId][msg.sender], "AccessControl: Already approved");

        multiSigApprovals[opId][msg.sender] = true;
        op.approvalCount++;
        emit MultiSigOperationApproved(opId, msg.sender, op.approvalCount, multiSigThreshold);

        if (op.approvalCount >= multiSigThreshold) {
            op.executed = true;
            _removeMultiSigOp(opId);
            if (op.opType == keccak256("EMERGENCY_ACCESS")) {
                _executeEmergencyAccess(op.nodeId, op.targetResource, op.reason);
            } else if (op.opType == keccak256("MANAGER_APPROVAL")) {
                _executeManagerApproval(op.nodeId);
            }
            emit MultiSigOperationExecuted(opId, msg.sender);
        }
    }

    // opId hesaplama yardımcıları (tutarlılık için)
    function _computeEmergencyOpId(bytes32 nodeId, bytes32 resource) internal view returns (bytes32) {
        // En son aktif (executed=false) EMERGENCY_ACCESS opId'yi bul
        for (uint i = 0; i < _pendingMultiSigOps.length; i++) {
            bytes32 oid = _pendingMultiSigOps[i];
            MultiSigOperation storage op = multiSigOps[oid];
            if (!op.executed && op.nodeId == nodeId && op.targetResource == resource
                && op.opType == keccak256("EMERGENCY_ACCESS")) {
                return oid;
            }
        }
        return bytes32(0); // bulunamadı → yeni oluştur
    }

    function _computeManagerOpId(bytes32 nodeId) internal view returns (bytes32) {
        for (uint i = 0; i < _pendingMultiSigOps.length; i++) {
            bytes32 oid = _pendingMultiSigOps[i];
            MultiSigOperation storage op = multiSigOps[oid];
            if (!op.executed && op.nodeId == nodeId
                && op.opType == keccak256("MANAGER_APPROVAL")) {
                return oid;
            }
        }
        return bytes32(0);
    }

    function _removeMultiSigOp(bytes32 opId) internal {
        uint256 idx = _pendingMultiSigIndex[opId];
        uint256 last = _pendingMultiSigOps.length - 1;
        if (idx != last) {
            bytes32 lastOp = _pendingMultiSigOps[last];
            _pendingMultiSigOps[idx] = lastOp;
            _pendingMultiSigIndex[lastOp] = idx;
        }
        _pendingMultiSigOps.pop();
        delete _pendingMultiSigIndex[opId];
    }

    // İkinci onaycının opId ile çağırabileceği alternatif yol
    function confirmMultiSigOperation(bytes32 opId) external whenNotPaused {
        require(
            hasRole[msg.sender][ADMIN_ROLE] || hasRole[msg.sender][MANAGER_ROLE],
            "AccessControl: Insufficient role"
        );
        MultiSigOperation storage op = multiSigOps[opId];
        require(op.createdAt != 0, "AccessControl: Operation not found");
        _recordMultiSigApproval(opId);
    }

    // Süresi dolmuş veya gereksiz op iptal et
    function cancelMultiSigOperation(bytes32 opId) external onlyRole(ADMIN_ROLE) {
        MultiSigOperation storage op = multiSigOps[opId];
        require(op.createdAt != 0 && !op.executed, "AccessControl: Cannot cancel");
        op.executed = true; // re-entry guard
        _removeMultiSigOp(opId);
        emit MultiSigOperationCancelled(opId, msg.sender);
    }

    // Threshold güncelle
    function setMultiSigThreshold(uint256 newThreshold) external onlyRole(ADMIN_ROLE) {
        require(newThreshold >= 1, "AccessControl: Threshold must be >= 1");
        uint256 old = multiSigThreshold;
        multiSigThreshold = newThreshold;
        emit MultiSigThresholdUpdated(old, newThreshold);
    }

    function getPendingMultiSigOperations() external view returns (bytes32[] memory) {
        return _pendingMultiSigOps;
    }

    function getMultiSigOperation(bytes32 opId) external view returns (MultiSigOperation memory) {
        return multiSigOps[opId];
    }

    function hasApprovedMultiSigOp(bytes32 opId, address approver) external view returns (bool) {
        return multiSigApprovals[opId][approver];
    }
}
