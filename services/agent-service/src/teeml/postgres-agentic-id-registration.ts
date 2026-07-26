import pg from "pg";
import type { Hex32 } from "../policy-engine/types.js";
import type {
  AgenticIdRegistrationClaim,
  AgenticIdRegistrationRepository,
  ClaimAgenticIdRegistrationInput,
  CompletedAgenticIdRegistration,
  CompleteAgenticIdRegistrationInput,
  FindCompletedAgenticIdRegistrationInput,
  MarkAgenticIdRegistrationUnknownInput,
} from "./agentic-id-registration.js";
import { AgenticIdRegistrationStoreError } from "./agentic-id-registration.js";
import type { AgentSemanticProfileRecord } from "./repository.js";

export function createPostgresAgenticIdRegistrationRepository(
  connectionString: string,
): PostgresAgenticIdRegistrationRepository {
  return new PostgresAgenticIdRegistrationRepository(
    new pg.Pool({ connectionString }),
  );
}

export class PostgresAgenticIdRegistrationRepository
  implements AgenticIdRegistrationRepository
{
  constructor(private readonly pool: pg.Pool) {}

  async findCompleted(
    input: FindCompletedAgenticIdRegistrationInput,
  ): Promise<CompletedAgenticIdRegistration | null> {
    return await this.runLocked(input.agentId, async client => {
      await assertDurableAgentBinding(client, input);
      const registration = await selectRegistration(client, input.agentId);
      const row = registration.rows[0] as
        | Record<string, unknown>
        | undefined;
      if (!row) return null;
      if (row.registration_hash !== input.registrationHash) {
        throw registrationConflict();
      }
      if (row.status !== "COMPLETED") return null;
      return mapCompletedRegistration(row);
    });
  }

  async claim(
    input: ClaimAgenticIdRegistrationInput,
  ): Promise<AgenticIdRegistrationClaim> {
    return await this.runLocked(input.agentId, async client => {
      await assertDurableAgentBinding(client, input);
      const registration = await selectRegistration(client, input.agentId);
      const row = registration.rows[0] as
        | Record<string, unknown>
        | undefined;
      if (!row) {
        const existingProfile = await client.query(
          `select 1
           from aegis_agent_semantic_profiles
           where agent_id = $1
           limit 1`,
          [input.agentId],
        );
        const status =
          existingProfile.rowCount === 0 ? "PROCESSING" : "UNKNOWN";
        await client.query(
          `insert into aegis_agentic_id_registrations (
             agent_id, registration_hash, status, created_at, updated_at
           ) values ($1, $2, $3, $4, $4)`,
          [input.agentId, input.registrationHash, status, input.now],
        );
        return status === "PROCESSING"
          ? { status: "CLAIMED" }
          : { status: "UNKNOWN" };
      }

      if (row.registration_hash !== input.registrationHash) {
        throw registrationConflict();
      }
      if (row.status === "PROCESSING") return { status: "IN_PROGRESS" };
      if (row.status === "UNKNOWN") return { status: "UNKNOWN" };
      if (row.status !== "COMPLETED") {
        throw invalidRegistrationState();
      }

      return mapCompletedRegistration(row);
    });
  }

  async complete(input: CompleteAgenticIdRegistrationInput): Promise<void> {
    await this.runLocked(input.agentId, async client => {
      const registration = await client.query(
        `select registration_hash, status, metadata_uri, explorer_url
         from aegis_agentic_id_registrations
         where agent_id = $1
         for update`,
        [input.agentId],
      );
      const row = registration.rows[0] as
        | Record<string, unknown>
        | undefined;
      if (!row || row.registration_hash !== input.registrationHash) {
        throw registrationConflict();
      }
      if (row.status === "COMPLETED") {
        if (
          row.metadata_uri !== input.metadataURI ||
          row.explorer_url !== input.explorerUrl
        ) {
          throw registrationConflict();
        }
        await upsertSemanticProfile(client, input);
        return;
      }
      if (row.status !== "PROCESSING") {
        throw invalidRegistrationState();
      }

      await upsertSemanticProfile(client, input);
      const completed = await client.query(
        `update aegis_agentic_id_registrations
         set status = 'COMPLETED', metadata_uri = $2, explorer_url = $3,
             completed_at = $4, updated_at = $4
         where agent_id = $1 and status = 'PROCESSING'`,
        [
          input.agentId,
          input.metadataURI,
          input.explorerUrl,
          input.completedAt,
        ],
      );
      if (completed.rowCount !== 1) throw invalidRegistrationState();
    });
  }

  async markUnknown(
    input: MarkAgenticIdRegistrationUnknownInput,
  ): Promise<void> {
    await this.runLocked(input.agentId, async client => {
      const registration = await client.query(
        `select registration_hash, status
         from aegis_agentic_id_registrations
         where agent_id = $1
         for update`,
        [input.agentId],
      );
      const row = registration.rows[0] as
        | Record<string, unknown>
        | undefined;
      if (!row || row.registration_hash !== input.registrationHash) {
        throw registrationConflict();
      }
      if (row.status === "PROCESSING") {
        await client.query(
          `update aegis_agentic_id_registrations
           set status = 'UNKNOWN', updated_at = $2
           where agent_id = $1 and status = 'PROCESSING'`,
          [input.agentId, input.now],
        );
      } else if (row.status !== "UNKNOWN" && row.status !== "COMPLETED") {
        throw invalidRegistrationState();
      }
    });
  }

  private async runLocked<T>(
    agentId: string,
    run: (client: pg.PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query(
        "select pg_advisory_xact_lock(hashtextextended($1, 0))",
        [`agentic-id-registration:${agentId}`],
      );
      const result = await run(client);
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback");
      throw mapRegistrationStoreError(error);
    } finally {
      client.release();
    }
  }
}

async function assertDurableAgentBinding(
  client: pg.PoolClient,
  input: {
    agentId: string;
    ownerAddress: `0x${string}`;
    safeAddress: `0x${string}`;
  },
): Promise<void> {
  const durableAgent = await client.query(
    `select 1
     from aegis_agents a
     join aegis_wallets w on w.agent_id = a.agent_id
     where a.agent_id = $1
       and a.owner_address = $2
       and a.status = 'ACTIVE'
       and w.safe_address = $3
       and w.network_id = 'hedera:testnet'
       and w.status = 'PROTECTED'
     limit 1`,
    [input.agentId, input.ownerAddress, input.safeAddress],
  );
  if (durableAgent.rowCount !== 1) throw registrationConflict();
}

async function selectRegistration(
  client: pg.PoolClient,
  agentId: string,
) {
  return await client.query(
    `select
       r.registration_hash, r.status, r.metadata_uri, r.explorer_url,
       p.agent_id as profile_agent_id, p.agentic_id, p.contract_address,
       p.token_id, p.metadata_hash, p.capability_ids,
       p.registered_at, p.updated_at as profile_updated_at
     from aegis_agentic_id_registrations r
     left join aegis_agent_semantic_profiles p on p.agent_id = r.agent_id
     where r.agent_id = $1
     for update of r`,
    [agentId],
  );
}

function mapCompletedRegistration(
  row: Record<string, unknown>,
): CompletedAgenticIdRegistration {
  return {
    status: "COMPLETED",
    semanticProfile: mapSemanticProfile(row),
    metadataURI: requiredPointer(row.metadata_uri),
    explorerUrl: requiredPointer(row.explorer_url),
  };
}

async function upsertSemanticProfile(
  client: pg.PoolClient,
  input: CompleteAgenticIdRegistrationInput,
): Promise<void> {
  const profile = input.semanticProfile;
  const existing = await client.query(
    `select agentic_id, contract_address, token_id, metadata_hash, capability_ids
     from aegis_agent_semantic_profiles
     where agent_id = $1
     for update`,
    [input.agentId],
  );
  const row = existing.rows[0] as Record<string, unknown> | undefined;
  if (row) {
    if (
      row.agentic_id !== profile.agenticId ||
      row.contract_address !== profile.contractAddress ||
      row.token_id !== profile.tokenId ||
      row.metadata_hash !== profile.metadataHash ||
      !equalStringArrays(row.capability_ids, profile.capabilityIds)
    ) {
      throw registrationConflict();
    }
    await client.query(
      `update aegis_agent_semantic_profiles
       set updated_at = $2
       where agent_id = $1`,
      [input.agentId, input.completedAt],
    );
    return;
  }

  await client.query(
    `insert into aegis_agent_semantic_profiles (
       agent_id, agentic_id, contract_address, token_id, metadata_hash,
       capability_ids, registered_at, updated_at
     ) values ($1, $2, $3, $4, $5, $6::jsonb, $7, $7)`,
    [
      input.agentId,
      profile.agenticId,
      profile.contractAddress,
      profile.tokenId,
      profile.metadataHash,
      JSON.stringify(profile.capabilityIds),
      input.completedAt,
    ],
  );
}

function mapSemanticProfile(
  row: Record<string, unknown>,
): AgentSemanticProfileRecord {
  const capabilityIds = requiredStringArray(row.capability_ids);
  return {
    agentId: requiredString(row.profile_agent_id),
    agenticId: requiredString(row.agentic_id),
    contractAddress: requiredAddress(row.contract_address),
    tokenId: requiredUnsignedIntegerString(row.token_id),
    metadataHash: requiredHex32(row.metadata_hash),
    capabilityIds,
    registeredAt: requiredNonNegativeInteger(row.registered_at),
    updatedAt: requiredNonNegativeInteger(row.profile_updated_at),
  };
}

function equalStringArrays(
  left: unknown,
  right: readonly string[],
): boolean {
  if (!Array.isArray(left) || left.some(value => typeof value !== "string")) {
    return false;
  }
  return (
    JSON.stringify([...new Set(left)].sort()) ===
    JSON.stringify([...new Set(right)].sort())
  );
}

function requiredStringArray(value: unknown): string[] {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.some(item => typeof item !== "string")
  ) {
    throw invalidRegistrationState();
  }
  return [...new Set(value)].sort();
}

function requiredString(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) {
    throw invalidRegistrationState();
  }
  return value;
}

function requiredPointer(value: unknown): string {
  const pointer = requiredString(value);
  if (pointer.length > 2_048) throw invalidRegistrationState();
  return pointer;
}

function requiredAddress(value: unknown): `0x${string}` {
  if (typeof value !== "string" || !/^0x[0-9a-f]{40}$/.test(value)) {
    throw invalidRegistrationState();
  }
  return value as `0x${string}`;
}

function requiredHex32(value: unknown): Hex32 {
  if (typeof value !== "string" || !/^0x[0-9a-f]{64}$/.test(value)) {
    throw invalidRegistrationState();
  }
  return value as Hex32;
}

function requiredUnsignedIntegerString(value: unknown): string {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]*)$/.test(value)) {
    throw invalidRegistrationState();
  }
  return value;
}

function requiredNonNegativeInteger(value: unknown): number {
  const number = typeof value === "string" ? Number(value) : value;
  if (
    typeof number !== "number" ||
    !Number.isSafeInteger(number) ||
    number < 0
  ) {
    throw invalidRegistrationState();
  }
  return number;
}

function registrationConflict(): AgenticIdRegistrationStoreError {
  return new AgenticIdRegistrationStoreError(
    "CONFLICT",
    "agentic_id_registration_conflict",
  );
}

function invalidRegistrationState(): AgenticIdRegistrationStoreError {
  return new AgenticIdRegistrationStoreError(
    "INVALID_STATE",
    "agentic_id_registration_requires_reconciliation",
  );
}

function mapRegistrationStoreError(error: unknown): Error {
  if (error instanceof AgenticIdRegistrationStoreError) return error;
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505"
  ) {
    return registrationConflict();
  }
  return new AgenticIdRegistrationStoreError(
    "UNAVAILABLE",
    "agentic_id_registration_store_failed",
  );
}
