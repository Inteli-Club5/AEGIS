import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { keccak256, stringToHex, type Hex } from "viem";
import {
  buildAgenticIdRegistrationCommitment,
  buildCanonicalAgentProfileMetadata,
  buildCanonicalAgenticIdIntelligentData,
  stableStringify,
} from "../agentic-id-contract/index.js";

const INPUT = {
  aegisAgentId: "agent-golden-1",
  ownerAddress: "0x1111111111111111111111111111111111111111",
  agentName: "Golden Agent",
  agentDescription: "Canonical profile",
  agentType: "Payment",
  capabilities: ["catalog.read", "hedera.transfer.hbar"],
  agentWalletAddress: "0x3333333333333333333333333333333333333333",
  policyHash: `0x${"44".repeat(32)}`,
  expectedChainId: 16602,
  expectedAgenticIdContractAddress:
    "0x2700F6A3e505402C9daB154C5c6ab9cAEC98EF1F",
};

describe("shared Agentic ID canonical contract", () => {
  it("matches the versioned metadata and registration golden commitments", () => {
    const metadata = buildCanonicalAgentProfileMetadata(INPUT);
    const metadataHash = hashCanonical(metadata);
    const registrationHash = hashCanonical(
      buildAgenticIdRegistrationCommitment({
        request: INPUT,
        chainId: INPUT.expectedChainId,
        contractAddress: INPUT.expectedAgenticIdContractAddress,
      }),
    );

    assert.equal(
      metadataHash,
      "0xedc6d36febc2b90a8fcd4f26a1107ac5ab4ad8ca1580d9dcb770662135fe449e",
    );
    assert.equal(
      registrationHash,
      "0x8d5a91d41084643827b06da7de14d24ca626f2e8548fcbba2b05038c455707f8",
    );
  });

  it("matches the exact ordered on-chain intelligent-data golden vector", () => {
    const metadataHash = hashCanonical(
      buildCanonicalAgentProfileMetadata(INPUT),
    );
    const intelligentData = buildCanonicalAgenticIdIntelligentData(
      INPUT,
      metadataHash,
      hashField,
    );

    assert.deepEqual(
      intelligentData.map(item => [item.dataDescription, item.dataHash]),
      [
        [
          "aegisAgentId",
          "0xa690a7791001caa05302c123cdf0a72a74f30d790ee9c1b80baea19d0a63c87f",
        ],
        [
          "agentName",
          "0x037a0068ed31b6c73e2cb62e208d42352068cb0c9189c1cbbee492d54b166813",
        ],
        [
          "agentDescription",
          "0xe73d869cc5b23891df868326d957c5901f137d9de082a4647ca55fcb914922ee",
        ],
        [
          "agentType",
          "0xc3600420d060552ebc3686d80bf56734a37149182d1e1a00b8b5a607ed546f21",
        ],
        [
          "capabilities",
          "0xb90de11ab7f49277fd707ad93097157cd56231abf278a49c367b71adfe95dd9e",
        ],
        [
          "agentWalletAddress",
          "0xfd05d543fd7c68c3811c333778ec2ca116a8e03edfa4deeee24117234f64a12c",
        ],
        [
          "policyHash",
          "0x8963285e35bac37ffeccb9745932aefbe1b889a345cdbd96b8423e3f59436969",
        ],
        [
          "metadataHash",
          "0xedc6d36febc2b90a8fcd4f26a1107ac5ab4ad8ca1580d9dcb770662135fe449e",
        ],
      ],
    );
  });
});

function hashCanonical(value: unknown): Hex {
  return keccak256(stringToHex(stableStringify(value)));
}

function hashField(value: unknown): Hex {
  return keccak256(
    stringToHex(
      typeof value === "string" ? value.trim() : stableStringify(value),
    ),
  );
}
