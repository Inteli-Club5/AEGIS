import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import {
  getAddress,
  keccak256,
  stringToHex,
  type Hex,
} from "viem";
import { registerAgenticId } from "./registerAgenticId.js";
import { getAgent, saveAgent } from "./store.js";
import type {
  AgenticIdRegistrationClaim,
  AgenticIdRegistrationRepository,
  ClaimAgenticIdRegistrationInput,
  CompletedAgenticIdRegistration,
  CompleteAgenticIdRegistrationInput,
  FindCompletedAgenticIdRegistrationInput,
  MarkAgenticIdRegistrationUnknownInput,
} from "./teeml/agentic-id-registration.js";
import { AgenticIdRegistrationStoreError } from "./teeml/agentic-id-registration.js";
import type { AgentProfile } from "./types.js";

const CONTRACT_ADDRESS =
  "0x2700F6A3e505402C9daB154C5c6ab9cAEC98EF1F";
const CHAIN_ID = 16602;
const POLICY_HASH = keccak256(stringToHex("aegis-default-policy-v0"));
const originalDashboardUrl = process.env.AEGIS_DASHBOARD_URL;
const originalContract = process.env.ZERO_G_AGENTIC_ID_CONTRACT_ADDRESS;
const originalChainId = process.env.ZERO_G_GALILEO_CHAIN_ID;
const originalInternalToken = process.env.AEGIS_AGENTIC_ID_INTERNAL_TOKEN;
const INTERNAL_TOKEN = "agentic-id-test-token-32-characters-minimum";

function storedAgent(
  agentId: string,
  description = "private profile prose",
): AgentProfile {
  return {
    agentId,
    ownerWallet: "0x1111111111111111111111111111111111111111",
    name: "Agent",
    type: "Payment",
    description,
    hederaAccountId: "0.0.123",
    evmAddress: "0x2222222222222222222222222222222222222222",
    publicKey: "public-key",
    toolNames: [
      " Hedera.Transfer.HBAR ",
      "catalog.read",
      "hedera.transfer.hbar",
    ],
    status: "active",
    createdAt: "2026-07-25T12:00:00.000Z",
    safeAddress: "0x3333333333333333333333333333333333333333",
  };
}

function validResponse(
  profile: AgentProfile,
  overrides: Record<string, unknown> = {},
): Response {
  const capabilities = ["catalog.read", "hedera.transfer.hbar"];
  const ownerAddress = getAddress(profile.ownerWallet);
  const agentWalletAddress = getAddress(profile.safeAddress!);
  const metadata = buildMetadata({
    profile,
    capabilities,
    ownerAddress,
    agentWalletAddress,
  });
  const metadataHash = keccak256(stringToHex(stableStringify(metadata)));
  const intelligentData = buildIntelligentData(
    profile,
    capabilities,
    agentWalletAddress,
    metadataHash,
  );
  return Response.json(
    {
      aegisAgentId: profile.agentId,
      chainId: CHAIN_ID,
      agenticIdTokenId: "42",
      agenticIdContractAddress: CONTRACT_ADDRESS,
      metadataHash,
      metadataURI: "0g-storage://metadata-root",
      explorerUrl: "https://chainscan-galileo.0g.ai/tx/0x1234",
      ownerAddress,
      finalTokenOwner: ownerAddress,
      metadata,
      intelligentData,
      ...overrides,
    },
    { status: 201 },
  );
}

class FakeRegistrationRepository
  implements AgenticIdRegistrationRepository
{
  claimCalls = 0;
  findCompletedCalls = 0;
  completeCalls = 0;
  markUnknownCalls = 0;
  status: "EMPTY" | "PROCESSING" | "COMPLETED" | "UNKNOWN" = "EMPTY";
  registrationHash: Hex | undefined;
  completedInput: CompleteAgenticIdRegistrationInput | undefined;
  completeError: Error | undefined;

  async findCompleted(
    input: FindCompletedAgenticIdRegistrationInput,
  ): Promise<CompletedAgenticIdRegistration | null> {
    this.findCompletedCalls += 1;
    if (this.registrationHash && this.registrationHash !== input.registrationHash) {
      throw new AgenticIdRegistrationStoreError(
        "CONFLICT",
        "agentic_id_registration_conflict",
      );
    }
    if (this.status !== "COMPLETED") return null;
    return this.completedRegistration();
  }

  async claim(
    input: ClaimAgenticIdRegistrationInput,
  ): Promise<AgenticIdRegistrationClaim> {
    this.claimCalls += 1;
    if (this.registrationHash && this.registrationHash !== input.registrationHash) {
      throw new AgenticIdRegistrationStoreError(
        "CONFLICT",
        "agentic_id_registration_conflict",
      );
    }
    this.registrationHash = input.registrationHash;
    if (this.status === "EMPTY") {
      this.status = "PROCESSING";
      return { status: "CLAIMED" };
    }
    if (this.status === "PROCESSING") return { status: "IN_PROGRESS" };
    if (this.status === "UNKNOWN") return { status: "UNKNOWN" };
    return this.completedRegistration();
  }

  async complete(input: CompleteAgenticIdRegistrationInput): Promise<void> {
    this.completeCalls += 1;
    if (this.completeError) throw this.completeError;
    this.completedInput = input;
    this.status = "COMPLETED";
  }

  async markUnknown(
    _input: MarkAgenticIdRegistrationUnknownInput,
  ): Promise<void> {
    this.markUnknownCalls += 1;
    if (this.status === "PROCESSING") this.status = "UNKNOWN";
  }

  private completedRegistration(): CompletedAgenticIdRegistration {
    const completed = this.completedInput;
    assert.ok(completed);
    return {
      status: "COMPLETED",
      semanticProfile: {
        ...completed.semanticProfile,
        capabilityIds: [...completed.semanticProfile.capabilityIds],
        registeredAt: completed.completedAt,
        updatedAt: completed.completedAt,
      },
      metadataURI: completed.metadataURI,
      explorerUrl: completed.explorerUrl,
    };
  }
}

beforeEach(() => {
  process.env.AEGIS_AGENTIC_ID_INTERNAL_TOKEN = INTERNAL_TOKEN;
});

afterEach(() => {
  mock.restoreAll();
  restoreEnv("AEGIS_DASHBOARD_URL", originalDashboardUrl);
  restoreEnv("ZERO_G_AGENTIC_ID_CONTRACT_ADDRESS", originalContract);
  restoreEnv("ZERO_G_GALILEO_CHAIN_ID", originalChainId);
  restoreEnv("AEGIS_AGENTIC_ID_INTERNAL_TOKEN", originalInternalToken);
});

describe("registerAgenticId trusted semantic profile boundary", () => {
  it("validates the response commitments and persists only a normalized durable profile", async () => {
    const agentId = "agent-registration-success";
    const profile = storedAgent(agentId);
    const repository = new FakeRegistrationRepository();
    saveAgent(profile, "private-key");
    process.env.AEGIS_DASHBOARD_URL = "https://dashboard.example";

    let requestBody: Record<string, unknown> | undefined;
    mock.method(
      globalThis,
      "fetch",
      async (_input: string | URL | Request, init?: RequestInit) => {
        requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        assert.match(
          new Headers(init?.headers).get("Idempotency-Key") ?? "",
          /^0x[0-9a-f]{64}$/,
        );
        assert.equal(
          new Headers(init?.headers).get("Authorization"),
          `Bearer ${INTERNAL_TOKEN}`,
        );
        return validResponse(profile);
      },
    );

    const updated = await registerAgenticId(agentId, {
      registrationRepository: repository,
      now: () => 1_721_000_000,
    });

    assert.deepEqual(requestBody?.capabilities, [
      "catalog.read",
      "hedera.transfer.hbar",
    ]);
    assert.equal(requestBody?.expectedChainId, CHAIN_ID);
    assert.equal(
      String(requestBody?.expectedAgenticIdContractAddress).toLowerCase(),
      CONTRACT_ADDRESS.toLowerCase(),
    );
    assert.equal(repository.completeCalls, 1);
    assert.deepEqual(repository.completedInput?.semanticProfile, {
      agentId,
      agenticId:
        "0g-agentic-id:0x2700f6a3e505402c9dab154c5c6ab9caec98ef1f:42",
      contractAddress: CONTRACT_ADDRESS.toLowerCase(),
      tokenId: "42",
      metadataHash: validResponseBody(profile).metadataHash.toLowerCase(),
      capabilityIds: ["catalog.read", "hedera.transfer.hbar"],
    });
    assert.equal(
      JSON.stringify(repository.completedInput).includes(profile.description!),
      false,
    );
    assert.equal(updated.agenticId?.tokenId, "42");
  });

  it("requires the durable registration store before any mint request", async () => {
    const agentId = "agent-registration-no-store";
    saveAgent(storedAgent(agentId), "private-key");
    let fetchCalls = 0;
    mock.method(globalThis, "fetch", async () => {
      fetchCalls += 1;
      return validResponse(storedAgent(agentId));
    });

    await assert.rejects(
      registerAgenticId(agentId),
      /agentic_id_registration_store_unavailable/,
    );
    assert.equal(fetchCalls, 0);
  });

  it("fails before claiming when downstream authentication is not configured", async () => {
    const agentId = "agent-registration-no-internal-auth";
    const profile = storedAgent(agentId);
    const repository = new FakeRegistrationRepository();
    saveAgent(profile, "private-key");
    delete process.env.AEGIS_AGENTIC_ID_INTERNAL_TOKEN;
    let fetchCalls = 0;
    mock.method(globalThis, "fetch", async () => {
      fetchCalls += 1;
      return validResponse(profile);
    });

    await assert.rejects(
      registerAgenticId(agentId, {
        registrationRepository: repository,
      }),
      /AEGIS_AGENTIC_ID_INTERNAL_TOKEN is not configured/,
    );

    assert.equal(repository.findCompletedCalls, 1);
    assert.equal(repository.claimCalls, 0);
    assert.equal(repository.status, "EMPTY");
    assert.equal(fetchCalls, 0);
  });

  it("returns a completed durable registration on sequential retry without minting again", async () => {
    const agentId = "agent-registration-sequential";
    const profile = storedAgent(agentId);
    const repository = new FakeRegistrationRepository();
    saveAgent(profile, "private-key");
    let fetchCalls = 0;
    mock.method(globalThis, "fetch", async () => {
      fetchCalls += 1;
      return validResponse(profile);
    });

    const first = await registerAgenticId(agentId, {
      registrationRepository: repository,
    });
    delete process.env.AEGIS_AGENTIC_ID_INTERNAL_TOKEN;
    const second = await registerAgenticId(agentId, {
      registrationRepository: repository,
    });

    assert.equal(first.agenticId?.agenticId, second.agenticId?.agenticId);
    assert.equal(fetchCalls, 1);
    assert.equal(repository.claimCalls, 1);
    assert.equal(repository.findCompletedCalls, 2);
  });

  it("coalesces concurrent calls into one claim and one mint request", async () => {
    const agentId = "agent-registration-concurrent";
    const profile = storedAgent(agentId);
    const repository = new FakeRegistrationRepository();
    saveAgent(profile, "private-key");
    let releaseFetch!: () => void;
    const fetchGate = new Promise<void>(resolve => {
      releaseFetch = resolve;
    });
    let fetchCalls = 0;
    mock.method(globalThis, "fetch", async () => {
      fetchCalls += 1;
      await fetchGate;
      return validResponse(profile);
    });

    const first = registerAgenticId(agentId, {
      registrationRepository: repository,
    });
    const second = registerAgenticId(agentId, {
      registrationRepository: repository,
    });
    releaseFetch();
    const [firstResult, secondResult] = await Promise.all([first, second]);

    assert.equal(firstResult.agenticId?.tokenId, "42");
    assert.equal(secondResult.agenticId?.tokenId, "42");
    assert.equal(repository.claimCalls, 1);
    assert.equal(fetchCalls, 1);
  });

  it("marks an ambiguous network result UNKNOWN and never retries the mint", async () => {
    const agentId = "agent-registration-unknown";
    const profile = storedAgent(agentId);
    const repository = new FakeRegistrationRepository();
    saveAgent(profile, "private-key");
    let fetchCalls = 0;
    mock.method(globalThis, "fetch", async () => {
      fetchCalls += 1;
      throw new Error("private upstream details");
    });

    await assert.rejects(
      registerAgenticId(agentId, {
        registrationRepository: repository,
      }),
      /0G Agentic ID registration result is unknown/,
    );
    await assert.rejects(
      registerAgenticId(agentId, {
        registrationRepository: repository,
      }),
      /agentic_id_registration_requires_reconciliation/,
    );

    assert.equal(repository.status, "UNKNOWN");
    assert.equal(repository.markUnknownCalls, 1);
    assert.equal(fetchCalls, 1);
    assert.equal(getAgent(agentId)?.agenticId, undefined);
  });

  it("blocks a pre-existing PROCESSING registration without calling the dashboard", async () => {
    const agentId = "agent-registration-processing";
    const profile = storedAgent(agentId);
    const repository = new FakeRegistrationRepository();
    repository.status = "PROCESSING";
    saveAgent(profile, "private-key");
    let fetchCalls = 0;
    mock.method(globalThis, "fetch", async () => {
      fetchCalls += 1;
      return validResponse(profile);
    });

    await assert.rejects(
      registerAgenticId(agentId, {
        registrationRepository: repository,
      }),
      /agentic_id_registration_requires_reconciliation/,
    );
    assert.equal(fetchCalls, 0);
  });

  it("fails closed when completion persistence fails and leaves the result UNKNOWN", async () => {
    const agentId = "agent-registration-persistence-failure";
    const profile = storedAgent(agentId);
    const repository = new FakeRegistrationRepository();
    repository.completeError = new AgenticIdRegistrationStoreError(
      "UNAVAILABLE",
      "database details must not escape",
    );
    saveAgent(profile, "private-key");
    mock.method(globalThis, "fetch", async () => validResponse(profile));

    await assert.rejects(
      registerAgenticId(agentId, {
        registrationRepository: repository,
      }),
      /agentic_id_registration_store_unavailable/,
    );

    assert.equal(repository.status, "UNKNOWN");
    assert.equal(repository.markUnknownCalls, 1);
    assert.equal(getAgent(agentId)?.agenticId, undefined);
  });

  for (const [label, mutate] of [
    [
      "agent identity",
      (profile: AgentProfile) => ({ aegisAgentId: `${profile.agentId}-other` }),
    ],
    [
      "owner",
      () => ({ ownerAddress: "0x4444444444444444444444444444444444444444" }),
    ],
    [
      "final owner",
      () => ({
        finalTokenOwner: "0x4444444444444444444444444444444444444444",
      }),
    ],
    ["chain", () => ({ chainId: CHAIN_ID + 1 })],
    [
      "contract",
      () => ({
        agenticIdContractAddress:
          "0x4444444444444444444444444444444444444444",
      }),
    ],
  ] as const) {
    it(`rejects a well-formed response bound to a different ${label}`, async () => {
      const agentId = `agent-mismatch-${label.replaceAll(" ", "-")}`;
      const profile = storedAgent(agentId);
      const repository = new FakeRegistrationRepository();
      saveAgent(profile, "private-key");
      mock.method(globalThis, "fetch", async () =>
        validResponse(profile, mutate(profile)),
      );

      await assert.rejects(
        registerAgenticId(agentId, {
          registrationRepository: repository,
        }),
        /0G Agentic ID registration response is invalid/,
      );
      assert.equal(repository.status, "UNKNOWN");
      assert.equal(repository.completeCalls, 0);
      assert.equal(getAgent(agentId)?.agenticId, undefined);
    });
  }

  it("rejects internally consistent metadata for a different Safe and description", async () => {
    const agentId = "agent-mismatch-metadata";
    const profile = storedAgent(agentId);
    const repository = new FakeRegistrationRepository();
    saveAgent(profile, "private-key");
    const response = validResponseBody(profile);
    const metadata = structuredClone(response.metadata);
    const aegis = metadata.aegis as Record<string, unknown>;
    aegis.agentWalletAddress =
      "0x4444444444444444444444444444444444444444";
    metadata.description = "attacker-controlled description";
    const metadataHash = keccak256(stringToHex(stableStringify(metadata)));
    const intelligentData = structuredClone(response.intelligentData);
    intelligentData[2] = {
      dataDescription: "agentDescription",
      dataHash: keccak256(stringToHex("attacker-controlled description")),
    };
    intelligentData[5] = {
      dataDescription: "agentWalletAddress",
      dataHash: keccak256(
        stringToHex("0x4444444444444444444444444444444444444444"),
      ),
    };
    intelligentData[7] = {
      dataDescription: "metadataHash",
      dataHash: metadataHash,
    };
    mock.method(globalThis, "fetch", async () =>
      validResponse(profile, { metadata, metadataHash, intelligentData }),
    );

    await assert.rejects(
      registerAgenticId(agentId, {
        registrationRepository: repository,
      }),
      /0G Agentic ID registration response is invalid/,
    );
    assert.equal(repository.status, "UNKNOWN");
    assert.equal(repository.completeCalls, 0);
  });

  it("rejects extra or reordered intelligent-data commitments", async () => {
    const agentId = "agent-mismatch-intelligent-data";
    const profile = storedAgent(agentId);
    const repository = new FakeRegistrationRepository();
    saveAgent(profile, "private-key");
    const intelligentData = validResponseBody(profile).intelligentData;
    mock.method(globalThis, "fetch", async () =>
      validResponse(profile, {
        intelligentData: [
          intelligentData[1],
          intelligentData[0],
          ...intelligentData.slice(2),
          { dataDescription: "extra", dataHash: POLICY_HASH },
        ],
      }),
    );

    await assert.rejects(
      registerAgenticId(agentId, {
        registrationRepository: repository,
      }),
      /0G Agentic ID registration response is invalid/,
    );
    assert.equal(repository.completeCalls, 0);
  });

  it("rejects an oversized dashboard response without persisting it", async () => {
    const agentId = "agent-response-too-large";
    const profile = storedAgent(agentId);
    const repository = new FakeRegistrationRepository();
    saveAgent(profile, "private-key");
    mock.method(
      globalThis,
      "fetch",
      async () =>
        new Response(JSON.stringify({ value: "x".repeat(256 * 1024) }), {
          status: 201,
        }),
    );

    await assert.rejects(
      registerAgenticId(agentId, {
        registrationRepository: repository,
      }),
      /0G Agentic ID registration response is invalid/,
    );
    assert.equal(repository.status, "UNKNOWN");
  });
});

function validResponseBody(profile: AgentProfile) {
  const capabilities = ["catalog.read", "hedera.transfer.hbar"];
  const ownerAddress = getAddress(profile.ownerWallet);
  const agentWalletAddress = getAddress(profile.safeAddress!);
  const metadata = buildMetadata({
    profile,
    capabilities,
    ownerAddress,
    agentWalletAddress,
  });
  const metadataHash = keccak256(stringToHex(stableStringify(metadata)));
  return {
    metadata,
    metadataHash,
    intelligentData: buildIntelligentData(
      profile,
      capabilities,
      agentWalletAddress,
      metadataHash,
    ),
  };
}

function buildMetadata(input: {
  profile: AgentProfile;
  capabilities: string[];
  ownerAddress: `0x${string}`;
  agentWalletAddress: `0x${string}`;
}): Record<string, unknown> {
  return {
    name: input.profile.name,
    description: input.profile.description,
    attributes: [
      { trait_type: "Agent Type", value: input.profile.type },
      {
        trait_type: "Capabilities",
        value: input.capabilities.join(", "),
      },
      { trait_type: "AEGIS Agent ID", value: input.profile.agentId },
      { trait_type: "Policy Hash", value: POLICY_HASH },
    ],
    aegis: {
      schemaVersion: "aegis.agent-profile.v1",
      aegisAgentId: input.profile.agentId,
      ownerAddress: input.ownerAddress,
      agentType: input.profile.type,
      capabilities: input.capabilities,
      agentWalletAddress: input.agentWalletAddress,
      policyHash: POLICY_HASH,
    },
  };
}

function buildIntelligentData(
  profile: AgentProfile,
  capabilities: string[],
  agentWalletAddress: `0x${string}`,
  metadataHash: Hex,
) {
  return [
    {
      dataDescription: "aegisAgentId",
      dataHash: hashField(profile.agentId),
    },
    { dataDescription: "agentName", dataHash: hashField(profile.name) },
    {
      dataDescription: "agentDescription",
      dataHash: hashField(profile.description),
    },
    { dataDescription: "agentType", dataHash: hashField(profile.type) },
    { dataDescription: "capabilities", dataHash: hashField(capabilities) },
    {
      dataDescription: "agentWalletAddress",
      dataHash: hashField(agentWalletAddress),
    },
    { dataDescription: "policyHash", dataHash: hashField(POLICY_HASH) },
    { dataDescription: "metadataHash", dataHash: metadataHash },
  ];
}

function hashField(value: unknown): Hex {
  return keccak256(
    stringToHex(
      typeof value === "string" ? value.trim() : stableStringify(value),
    ),
  );
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortObjectKeys(value));
}

function sortObjectKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortObjectKeys);
  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((sorted, key) => {
        sorted[key] = sortObjectKeys(
          (value as Record<string, unknown>)[key],
        );
        return sorted;
      }, {});
  }
  return value;
}

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
