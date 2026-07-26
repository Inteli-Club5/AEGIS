// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";

/// @title AEGIS TeeML Validation Registry
/// @notice Stores one immutable commitment for each sanitized TeeML validation verified by AEGIS.
/// @dev This contract is intentionally non-upgradeable and unpaused: recorded evidence cannot be changed or removed,
///      while recorder access can be revoked immediately through AccessControl if the runtime signer is compromised.
contract AegisTeeValidationRegistry is AccessControl {
    bytes32 public constant RECORDER_ROLE = keccak256("RECORDER_ROLE");
    bytes32 public constant RECORD_TYPEHASH = keccak256(
        "AegisTeeValidationRecord(uint256 chainId,address registry,bytes32 requestId,bytes32 agentIdHash,bytes32 "
        "actionHash,bytes32 policyHash,bytes32 semanticContextHash,bytes32 teemlRequestHash,bytes32 artifactHash,"
        "bytes32 modelIdHash,bytes32 reasonCodeHash,address safe,uint256 agenticIdTokenId,uint8 verdict,address "
        "recorder,uint16 schemaVersion)"
    );

    uint8 public constant VERDICT_ALLOW = 1;
    uint8 public constant VERDICT_DENY = 2;

    struct TeeMLValidationRecord {
        bytes32 requestId;
        bytes32 agentIdHash;
        bytes32 actionHash;
        bytes32 policyHash;
        bytes32 semanticContextHash;
        bytes32 teemlRequestHash;
        bytes32 artifactHash;
        bytes32 modelIdHash;
        bytes32 reasonCodeHash;
        address safe;
        uint256 agenticIdTokenId;
        uint8 verdict;
        uint16 schemaVersion;
    }

    mapping(bytes32 requestId => bytes32 recordHash) public recordHashes;

    event TeeMLValidationRecorded(
        bytes32 indexed requestId,
        bytes32 indexed agentIdHash,
        bytes32 indexed actionHash,
        bytes32 policyHash,
        bytes32 semanticContextHash,
        bytes32 teemlRequestHash,
        bytes32 artifactHash,
        bytes32 modelIdHash,
        bytes32 reasonCodeHash,
        address safe,
        uint256 agenticIdTokenId,
        uint8 verdict,
        address recorder,
        uint16 schemaVersion
    );

    error InvalidAdmin();
    error InvalidRecorder();
    error EmptyRequestId();
    error EmptyAgentIdHash();
    error EmptyActionHash();
    error EmptyPolicyHash();
    error EmptySemanticContextHash();
    error EmptyTeeMLRequestHash();
    error EmptyArtifactHash();
    error EmptyModelIdHash();
    error EmptyReasonCodeHash();
    error InvalidSafe();
    error InvalidVerdict(uint8 verdict);
    error InvalidSchemaVersion();
    error DuplicateRequest(bytes32 requestId);

    constructor(address finalAdmin, address finalRecorder) {
        if (finalAdmin == address(0)) revert InvalidAdmin();
        if (finalRecorder == address(0)) revert InvalidRecorder();

        _grantRole(DEFAULT_ADMIN_ROLE, finalAdmin);
        _grantRole(RECORDER_ROLE, finalRecorder);
    }

    /// @notice Records a final ALLOW or DENY whose private routing, TEE evidence, schema, and hashes were verified.
    /// @dev No unverified model output, fallback verdict, plaintext context, or caller-supplied timestamp is accepted.
    function recordTeeMLValidation(TeeMLValidationRecord calldata record)
        external
        onlyRole(RECORDER_ROLE)
        returns (bytes32 recordHash)
    {
        _validate(record);

        if (recordHashes[record.requestId] != bytes32(0)) {
            revert DuplicateRequest(record.requestId);
        }

        recordHash = calculateRecordHash(record, msg.sender);
        recordHashes[record.requestId] = recordHash;

        _emitValidationRecorded(record, msg.sender);
    }

    function _emitValidationRecorded(TeeMLValidationRecord calldata record, address recorder) private {
        emit TeeMLValidationRecorded(
            record.requestId,
            record.agentIdHash,
            record.actionHash,
            record.policyHash,
            record.semanticContextHash,
            record.teemlRequestHash,
            record.artifactHash,
            record.modelIdHash,
            record.reasonCodeHash,
            record.safe,
            record.agenticIdTokenId,
            record.verdict,
            recorder,
            record.schemaVersion
        );
    }

    /// @notice Reproduces the domain-separated commitment stored for a record and recorder.
    function calculateRecordHash(TeeMLValidationRecord calldata record, address recorder)
        public
        view
        returns (bytes32)
    {
        bytes memory prefix = abi.encode(
            RECORD_TYPEHASH,
            block.chainid,
            address(this),
            record.requestId,
            record.agentIdHash,
            record.actionHash,
            record.policyHash
        );
        bytes memory suffix = abi.encode(
            record.semanticContextHash,
            record.teemlRequestHash,
            record.artifactHash,
            record.modelIdHash,
            record.reasonCodeHash,
            record.safe,
            record.agenticIdTokenId,
            record.verdict,
            recorder,
            record.schemaVersion
        );
        return keccak256(bytes.concat(prefix, suffix));
    }

    function _validate(TeeMLValidationRecord calldata record) private pure {
        if (record.requestId == bytes32(0)) revert EmptyRequestId();
        if (record.agentIdHash == bytes32(0)) revert EmptyAgentIdHash();
        if (record.actionHash == bytes32(0)) revert EmptyActionHash();
        if (record.policyHash == bytes32(0)) revert EmptyPolicyHash();
        if (record.semanticContextHash == bytes32(0)) revert EmptySemanticContextHash();
        if (record.teemlRequestHash == bytes32(0)) revert EmptyTeeMLRequestHash();
        if (record.artifactHash == bytes32(0)) revert EmptyArtifactHash();
        if (record.modelIdHash == bytes32(0)) revert EmptyModelIdHash();
        if (record.reasonCodeHash == bytes32(0)) revert EmptyReasonCodeHash();
        if (record.safe == address(0)) revert InvalidSafe();
        if (record.verdict != VERDICT_ALLOW && record.verdict != VERDICT_DENY) {
            revert InvalidVerdict(record.verdict);
        }
        if (record.schemaVersion == 0) revert InvalidSchemaVersion();
    }
}
