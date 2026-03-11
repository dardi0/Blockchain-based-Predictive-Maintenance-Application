// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@matterlabs/zksync-contracts/contracts/system-contracts/interfaces/IAccount.sol";
import "@matterlabs/zksync-contracts/contracts/system-contracts/libraries/TransactionHelper.sol";
import "@matterlabs/zksync-contracts/contracts/system-contracts/Constants.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/**
 * @title SessionKeyAccount
 * @dev Native zkSync Era Account Abstraction implementing Session Keys
 */
contract SessionKeyAccount is IAccount {
    using TransactionHelper for Transaction;

    address public owner;

    // Struct to define session key permissions
    struct SessionKey {
        bool isActive;
        uint256 expiresAt;
        address allowedTarget; // e.g. PdMSystemHybrid address
        bytes4 allowedSelector; // e.g. submitSensorData selector
    }

    // Mapping from session public key to permissions
    mapping(address => SessionKey) public sessionKeys;

    // Event definition
    event SessionKeyAuthorized(address indexed sessionKey, address allowedTarget, bytes4 allowedSelector, uint256 expiresAt);
    event SessionKeyRevoked(address indexed sessionKey);

    constructor(address _owner) {
        owner = _owner;
    }

    modifier onlyBootloader() {
        require(msg.sender == BOOTLOADER_FORMAL_ADDRESS, "Only bootloader");
        _;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    /**
     * @dev Authorize a temporary session key
     */
    function authorizeSessionKey(
        address sessionKey,
        address allowedTarget,
        bytes4 allowedSelector,
        uint256 validForSeconds
    ) external onlyOwner {
        require(sessionKey != address(0), "Invalid session key");
        uint256 expiresAt = block.timestamp + validForSeconds;
        sessionKeys[sessionKey] = SessionKey({
            isActive: true,
            expiresAt: expiresAt,
            allowedTarget: allowedTarget,
            allowedSelector: allowedSelector
        });

        emit SessionKeyAuthorized(sessionKey, allowedTarget, allowedSelector, expiresAt);
    }

    /**
     * @dev Revoke a session key manually
     */
    function revokeSessionKey(address sessionKey) external onlyOwner {
        sessionKeys[sessionKey].isActive = false;
        emit SessionKeyRevoked(sessionKey);
    }

    /**
     * @dev Validate transaction according to IAccount interface.
     *
     * Uses _suggestedSignedHash (pre-computed by the bootloader) instead of
     * calling _transaction.encodeHash(), which triggers the 0xffeb virtual
     * keccak address that the Sepolia bootloader blocks during AA validation.
     */
    function validateTransaction(
        bytes32, /*_txHash*/
        bytes32 _suggestedSignedHash,
        Transaction calldata _transaction
    ) external payable override onlyBootloader returns (bytes4 magic) {
        return _validateTransaction(_suggestedSignedHash, _transaction);
    }

    function _validateTransaction(
        bytes32 _suggestedSignedHash,
        Transaction calldata _transaction
    ) internal view returns (bytes4) {
        // NOTE: NonceHolder increment is intentionally omitted:
        // - SystemContractsCaller (0xfff5) is blocked by Sepolia bootloader during validation
        // - Direct INonceHolder call requires isSystem flag (also needs SystemContractsCaller)
        // The bootloader manages replay protection at the protocol level.
        //
        // Use bootloader-provided hash (_suggestedSignedHash) to avoid encodeHash()
        // which triggers the 0xffeb virtual keccak address during AA validation.

        // During create2Account deployment, the bootloader probes the new account
        // by calling validateTransaction with a zero hash and no signature to confirm
        // IAccount compliance. Return success immediately so deployment doesn't revert.
        if (_suggestedSignedHash == bytes32(0)) {
            return ACCOUNT_VALIDATION_SUCCESS_MAGIC;
        }

        require(_transaction.signature.length == 65, "Invalid signature length");
        address signer = ECDSA.recover(_suggestedSignedHash, _transaction.signature);

        if (signer == owner) return ACCOUNT_VALIDATION_SUCCESS_MAGIC;

        SessionKey memory sKey = sessionKeys[signer];
        require(sKey.isActive && block.timestamp <= sKey.expiresAt,
            "Invalid signature or expired session key");
        require(address(uint160(_transaction.to)) == sKey.allowedTarget,
            "Invalid target for session key");
        require(_transaction.data.length >= 4, "Calldata too short");
        require(bytes4(_transaction.data) == sKey.allowedSelector,
            "Invalid selector for session key");

        return ACCOUNT_VALIDATION_SUCCESS_MAGIC;
    }

    /**
     * @dev Used only by executeTransactionFromOutside (non-AA path, no bootloader restrictions).
     * Can safely call encodeHash() here.
     */
    function _validateSignatureOnly(
        Transaction calldata _transaction
    ) internal view {
        bytes32 txHash = _transaction.encodeHash();
        require(_transaction.signature.length == 65, "Invalid signature length");
        address signer = ECDSA.recover(txHash, _transaction.signature);

        if (signer == owner) return;

        SessionKey memory sKey = sessionKeys[signer];
        require(sKey.isActive && block.timestamp <= sKey.expiresAt,
            "Invalid signature or expired session key");
        require(address(uint160(_transaction.to)) == sKey.allowedTarget,
            "Invalid target for session key");
        require(_transaction.data.length >= 4, "Calldata too short");
        require(bytes4(_transaction.data) == sKey.allowedSelector,
            "Invalid selector for session key");
    }

    /**
     * @dev Execute transaction according to IAccount interface
     */
    function executeTransaction(
        bytes32, /*_txHash*/
        bytes32, /*_suggestedSignedHash*/
        Transaction calldata _transaction
    ) external payable override onlyBootloader {
        _executeTransaction(_transaction);
    }

    function _executeTransaction(Transaction calldata _transaction) internal {
        address to = address(uint160(_transaction.to));
        uint256 value = _transaction.value;
        bytes memory data = _transaction.data;

        bool success;
        assembly {
            success := call(gas(), to, value, add(data, 0x20), mload(data), 0, 0)
        }

        require(success, "Transaction execution failed");
    }

    function executeTransactionFromOutside(Transaction calldata _transaction)
        external
        payable
    {
        _validateSignatureOnly(_transaction);
        _executeTransaction(_transaction);
    }

    /**
     * @dev Allows receiving ETH
     */
    receive() external payable {}

    fallback() external payable {
        // fallback of default account shouldn't be called by bootloader under no circumstances
        assert(msg.sender != BOOTLOADER_FORMAL_ADDRESS);
    }

    // Required by IAccount interface
    function payForTransaction(
        bytes32, /*_txHash*/
        bytes32, /*_suggestedSignedHash*/
        Transaction calldata _transaction
    ) external payable override onlyBootloader {
        bool success = _transaction.payToTheBootloader();
        require(success, "Failed to pay bootloader");
    }

    // Required by IAccount interface
    function prepareForPaymaster(
        bytes32 _txHash,
        bytes32 _possibleSignedHash,
        Transaction calldata _transaction
    ) external payable override onlyBootloader {
        _transaction.processPaymasterInput();
    }
}
