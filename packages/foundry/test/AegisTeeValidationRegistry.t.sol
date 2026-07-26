// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { IAccessControl } from "@openzeppelin/contracts/access/IAccessControl.sol";
import { Test } from "forge-std/Test.sol";
import { AegisTeeValidationRegistry } from "../contracts/AegisTeeValidationRegistry.sol";

contract AegisTeeValidationRegistryTest is Test {
    AegisTeeValidationRegistry internal registry;

    address internal deployer = makeAddr("deployer");
    address internal admin = makeAddr("admin");
    address internal recorder = makeAddr("recorder");
    address internal newAdmin = makeAddr("new-admin");
    address internal otherRecorder = makeAddr("other-recorder");
    address internal safe = makeAddr("safe");

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

    function setUp() public {
        vm.prank(deployer);
        registry = new AegisTeeValidationRegistry(admin, recorder);
    }

    function test_DeployAssignsOnlyFinalRoles() public view {
        assertTrue(registry.hasRole(registry.DEFAULT_ADMIN_ROLE(), admin));
        assertTrue(registry.hasRole(registry.RECORDER_ROLE(), recorder));
        assertFalse(registry.hasRole(registry.DEFAULT_ADMIN_ROLE(), deployer));
        assertFalse(registry.hasRole(registry.RECORDER_ROLE(), deployer));
    }

    function test_DeployAllowsSameFinalAdminAndRecorder() public {
        vm.prank(deployer);
        AegisTeeValidationRegistry singleAuthority = new AegisTeeValidationRegistry(admin, admin);

        assertTrue(singleAuthority.hasRole(singleAuthority.DEFAULT_ADMIN_ROLE(), admin));
        assertTrue(singleAuthority.hasRole(singleAuthority.RECORDER_ROLE(), admin));
        assertFalse(singleAuthority.hasRole(singleAuthority.DEFAULT_ADMIN_ROLE(), deployer));
    }

    function test_RevertWhen_AdminIsZero() public {
        vm.expectRevert(AegisTeeValidationRegistry.InvalidAdmin.selector);
        new AegisTeeValidationRegistry(address(0), recorder);
    }

    function test_RevertWhen_RecorderIsZero() public {
        vm.expectRevert(AegisTeeValidationRegistry.InvalidRecorder.selector);
        new AegisTeeValidationRegistry(admin, address(0));
    }

    function test_AdminRotationRemovesOldAuthority() public {
        bytes32 adminRole = registry.DEFAULT_ADMIN_ROLE();
        bytes32 recorderRole = registry.RECORDER_ROLE();

        vm.prank(admin);
        registry.grantRole(adminRole, newAdmin);
        vm.prank(newAdmin);
        registry.revokeRole(adminRole, admin);

        assertFalse(registry.hasRole(adminRole, admin));
        assertTrue(registry.hasRole(adminRole, newAdmin));

        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, admin, adminRole)
        );
        vm.prank(admin);
        registry.grantRole(recorderRole, otherRecorder);

        vm.prank(newAdmin);
        registry.grantRole(recorderRole, otherRecorder);
        assertTrue(registry.hasRole(recorderRole, otherRecorder));
    }

    function test_AuthorizedRecorderRecordsAllow() public {
        AegisTeeValidationRegistry.TeeMLValidationRecord memory record = _validRecord(1);

        vm.prank(recorder);
        bytes32 returnedHash = registry.recordTeeMLValidation(record);

        assertEq(returnedHash, registry.recordHashes(record.requestId));
        assertEq(returnedHash, registry.calculateRecordHash(record, recorder));
    }

    function test_AuthorizedRecorderRecordsDeny() public {
        AegisTeeValidationRegistry.TeeMLValidationRecord memory record = _validRecord(2);

        vm.prank(recorder);
        registry.recordTeeMLValidation(record);

        assertNotEq(registry.recordHashes(record.requestId), bytes32(0));
    }

    function test_RevertWhen_CallerIsNotRecorder() public {
        AegisTeeValidationRegistry.TeeMLValidationRecord memory record = _validRecord(1);

        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, deployer, registry.RECORDER_ROLE()
            )
        );
        vm.prank(deployer);
        registry.recordTeeMLValidation(record);
    }

    function test_RevokedRecorderCannotRecord() public {
        bytes32 recorderRole = registry.RECORDER_ROLE();

        vm.prank(admin);
        registry.revokeRole(recorderRole, recorder);

        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, recorder, recorderRole)
        );
        vm.prank(recorder);
        registry.recordTeeMLValidation(_validRecord(1));
    }

    function test_EmitsEverySanitizedEventField() public {
        AegisTeeValidationRegistry.TeeMLValidationRecord memory record = _validRecord(2);

        vm.expectEmit(true, true, true, true, address(registry));
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

        vm.prank(recorder);
        registry.recordTeeMLValidation(record);
    }

    function test_TwoDifferentRequestsProduceIndependentRecords() public {
        AegisTeeValidationRegistry.TeeMLValidationRecord memory first = _validRecord(1);
        AegisTeeValidationRegistry.TeeMLValidationRecord memory second = _validRecord(2);
        second.requestId = keccak256("request-2");

        vm.startPrank(recorder);
        registry.recordTeeMLValidation(first);
        registry.recordTeeMLValidation(second);
        vm.stopPrank();

        assertNotEq(registry.recordHashes(first.requestId), registry.recordHashes(second.requestId));
    }

    function test_RevertWhen_RequestAlreadyRecorded() public {
        AegisTeeValidationRegistry.TeeMLValidationRecord memory record = _validRecord(1);

        vm.startPrank(recorder);
        registry.recordTeeMLValidation(record);
        vm.expectRevert(abi.encodeWithSelector(AegisTeeValidationRegistry.DuplicateRequest.selector, record.requestId));
        registry.recordTeeMLValidation(record);
        vm.stopPrank();
    }

    function test_RevertWhen_RequestIdIsEmpty() public {
        AegisTeeValidationRegistry.TeeMLValidationRecord memory record = _validRecord(1);
        record.requestId = bytes32(0);
        _expectValidationRevert(record, AegisTeeValidationRegistry.EmptyRequestId.selector);
    }

    function test_RevertWhen_AnyRequiredHashIsEmpty() public {
        AegisTeeValidationRegistry.TeeMLValidationRecord memory record = _validRecord(1);
        record.agentIdHash = bytes32(0);
        _expectValidationRevert(record, AegisTeeValidationRegistry.EmptyAgentIdHash.selector);

        record = _validRecord(1);
        record.actionHash = bytes32(0);
        _expectValidationRevert(record, AegisTeeValidationRegistry.EmptyActionHash.selector);

        record = _validRecord(1);
        record.policyHash = bytes32(0);
        _expectValidationRevert(record, AegisTeeValidationRegistry.EmptyPolicyHash.selector);

        record = _validRecord(1);
        record.semanticContextHash = bytes32(0);
        _expectValidationRevert(record, AegisTeeValidationRegistry.EmptySemanticContextHash.selector);

        record = _validRecord(1);
        record.teemlRequestHash = bytes32(0);
        _expectValidationRevert(record, AegisTeeValidationRegistry.EmptyTeeMLRequestHash.selector);

        record = _validRecord(1);
        record.artifactHash = bytes32(0);
        _expectValidationRevert(record, AegisTeeValidationRegistry.EmptyArtifactHash.selector);

        record = _validRecord(1);
        record.modelIdHash = bytes32(0);
        _expectValidationRevert(record, AegisTeeValidationRegistry.EmptyModelIdHash.selector);

        record = _validRecord(1);
        record.reasonCodeHash = bytes32(0);
        _expectValidationRevert(record, AegisTeeValidationRegistry.EmptyReasonCodeHash.selector);
    }

    function test_RevertWhen_SafeIsZero() public {
        AegisTeeValidationRegistry.TeeMLValidationRecord memory record = _validRecord(1);
        record.safe = address(0);
        _expectValidationRevert(record, AegisTeeValidationRegistry.InvalidSafe.selector);
    }

    function test_RevertWhen_VerdictIsInvalid() public {
        AegisTeeValidationRegistry.TeeMLValidationRecord memory record = _validRecord(1);
        record.verdict = 0;
        vm.expectRevert(abi.encodeWithSelector(AegisTeeValidationRegistry.InvalidVerdict.selector, 0));
        vm.prank(recorder);
        registry.recordTeeMLValidation(record);

        record.verdict = 3;
        vm.expectRevert(abi.encodeWithSelector(AegisTeeValidationRegistry.InvalidVerdict.selector, 3));
        vm.prank(recorder);
        registry.recordTeeMLValidation(record);
    }

    function test_RevertWhen_SchemaVersionIsZero() public {
        AegisTeeValidationRegistry.TeeMLValidationRecord memory record = _validRecord(1);
        record.schemaVersion = 0;
        _expectValidationRevert(record, AegisTeeValidationRegistry.InvalidSchemaVersion.selector);
    }

    function test_RecordHashBindsRegistryChainRecorderAndEveryField() public view {
        AegisTeeValidationRegistry.TeeMLValidationRecord memory record = _validRecord(1);
        bytes memory prefix = abi.encode(
            registry.RECORD_TYPEHASH(),
            block.chainid,
            address(registry),
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
        bytes32 expected = keccak256(bytes.concat(prefix, suffix));

        assertEq(registry.calculateRecordHash(record, recorder), expected);
        assertNotEq(registry.calculateRecordHash(record, otherRecorder), expected);
    }

    function test_RecordValidationGasIsBounded() public {
        AegisTeeValidationRegistry.TeeMLValidationRecord memory record = _validRecord(1);

        vm.prank(recorder);
        uint256 gasBefore = gasleft();
        registry.recordTeeMLValidation(record);
        uint256 gasUsed = gasBefore - gasleft();

        assertLt(gasUsed, 150_000);
    }

    function _expectValidationRevert(AegisTeeValidationRegistry.TeeMLValidationRecord memory record, bytes4 selector)
        internal
    {
        vm.expectRevert(selector);
        vm.prank(recorder);
        registry.recordTeeMLValidation(record);
    }

    function _validRecord(uint8 verdict)
        internal
        view
        returns (AegisTeeValidationRegistry.TeeMLValidationRecord memory)
    {
        return AegisTeeValidationRegistry.TeeMLValidationRecord({
                requestId: keccak256("request-1"),
                agentIdHash: keccak256("agent-1"),
                actionHash: keccak256("action-1"),
                policyHash: keccak256("policy-1"),
                semanticContextHash: keccak256("semantic-context-1"),
                teemlRequestHash: keccak256("teeml-request-1"),
                artifactHash: keccak256("artifact-1"),
                modelIdHash: keccak256("model-1"),
                reasonCodeHash: keccak256("reason-code-1"),
                safe: safe,
                agenticIdTokenId: 102,
                verdict: verdict,
                schemaVersion: 1
            });
    }
}
