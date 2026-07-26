import { NextResponse } from "next/server";
import "server-only";
import { type AgentAction, verifySignedAgentAction } from "~~/lib/policy/action-auth";

function getBaseUrl(): string {
  return process.env.AGENT_SERVICE_URL ?? "http://localhost:4200";
}

// The operator wallet must prove it owns `agentId` before this server will fetch
// and use that agent's bearer token -- see lib/policy/action-auth.ts for why.
// `contextHash` must be recomputed by the caller from the exact request being
// proxied (see hashActionContext), not trusted from the client. The signature/
// freshness check itself is pure (lib/policy/action-auth.ts's
// verifySignedAgentAction, unit-tested there); this wrapper adds the one thing
// that requires network I/O -- confirming the signer is this agent's real owner.
export async function verifyAgentActionAuthorization(
  req: Request,
  input: { agentId: string; action: AgentAction; contextHash: `0x${string}` },
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  const fail = (status: number, error: string) => ({
    ok: false as const,
    response: NextResponse.json({ error }, { status }),
  });

  const signed = await verifySignedAgentAction(
    {
      operatorAddress: req.headers.get("x-aegis-operator-address"),
      signature: req.headers.get("x-aegis-operator-signature"),
      issuedAt: req.headers.get("x-aegis-operator-issued-at"),
    },
    input,
  );
  if (!signed.ok) return fail(401, signed.code);

  const { status, body } = await proxyToAgentService(`/agents/${encodeURIComponent(input.agentId)}`);
  if (status === 404) return fail(404, "not_found");
  if (status !== 200) return fail(502, "agent_lookup_failed");
  const ownerWallet = (body as { ownerWallet?: string } | null)?.ownerWallet;
  if (!ownerWallet || ownerWallet.toLowerCase() !== signed.operatorAddress.toLowerCase()) {
    return fail(403, "agent_owner_mismatch");
  }

  return { ok: true };
}

class AgentAuthTokenError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}

// Agent-bearer routes (precheck, TeeML verify, register-agentic-id, execute)
// authenticate as the specific agent acting, not as the connected operator
// wallet. The agent's token never reaches the browser: this fetches it
// server-to-server, proving this dashboard's own identity with a separate
// shared secret (AEGIS_DASHBOARD_INTERNAL_TOKEN, mirrors the existing
// AEGIS_AGENTIC_ID_INTERNAL_TOKEN pattern used for 0G Agentic ID minting).
async function getAgentAuthToken(agentId: string): Promise<string> {
  const internalToken = process.env.AEGIS_DASHBOARD_INTERNAL_TOKEN;
  if (!internalToken) {
    throw new AgentAuthTokenError(503, "agent_service_internal_auth_unconfigured");
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${getBaseUrl()}/internal/agents/${encodeURIComponent(agentId)}/auth-token`, {
      headers: { "x-aegis-internal-token": internalToken },
      cache: "no-store",
    });
  } catch {
    throw new AgentAuthTokenError(502, "agent_service_unreachable");
  }

  if (!upstream.ok) {
    throw new AgentAuthTokenError(
      upstream.status === 404 ? 404 : 502,
      upstream.status === 404 ? "not_found" : "agent_auth_token_unavailable",
    );
  }
  const body = (await upstream.json().catch(() => null)) as { token?: string } | null;
  if (!body?.token) {
    throw new AgentAuthTokenError(502, "agent_auth_token_unavailable");
  }
  return body.token;
}

export async function proxyToAgentService(
  path: string,
  init?: RequestInit,
): Promise<{ status: number; body: unknown }> {
  const base = getBaseUrl();

  let upstream: Response;
  try {
    upstream = await fetch(`${base}${path}`, {
      ...init,
      headers: init?.headers,
      cache: "no-store",
    });
  } catch {
    return {
      status: 502,
      body: { error: `Couldn't reach the agent service at ${base}. Is it running (services/agent-service)?` },
    };
  }

  if (upstream.status === 204) {
    return { status: 204, body: undefined };
  }

  const body = await upstream.json().catch(() => ({ error: "Invalid response from the agent service" }));
  return { status: upstream.status, body };
}

export async function proxyAgentServiceRequest(
  req: Request,
  options: {
    path: string;
    method: "GET" | "POST" | "PATCH" | "DELETE";
    body: "json" | "none";
    forwardOperator?: boolean;
  },
) {
  const payload = options.body === "json" ? await req.json().catch(() => ({})) : undefined;
  const headers: Record<string, string> = {};
  if (options.body === "json") headers["Content-Type"] = "application/json";
  if (options.forwardOperator) {
    headers["x-aegis-operator-address"] = req.headers.get("x-aegis-operator-address") ?? "";
    headers["x-aegis-operator-signature"] = req.headers.get("x-aegis-operator-signature") ?? "";
  }

  const { status, body } = await proxyToAgentService(options.path, {
    method: options.method,
    headers,
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  if (status === 204) {
    return new NextResponse(null, { status: 204 });
  }
  return NextResponse.json(body, { status });
}

// For the four agent-bearer routes (precheck, TeeML verify, register-agentic-id,
// execute): fetches the agent's own token server-side, then proxies the
// request authenticated as that agent. Call verifyAgentActionAuthorization()
// first -- this function does not itself check operator ownership.
// `presetPayload` lets the caller pass an already-parsed JSON body (needed when
// the route read req.json() itself to compute the authorization contextHash --
// a Request body stream can only be consumed once).
export async function proxyAgentServiceRequestAsAgent(
  req: Request,
  options: {
    path: string;
    method: "GET" | "POST";
    agentId: string;
    body: "json" | "none";
    presetPayload?: unknown;
    forwardIdempotencyKey?: boolean;
  },
) {
  let token: string;
  try {
    token = await getAgentAuthToken(options.agentId);
  } catch (error) {
    if (error instanceof AgentAuthTokenError) {
      return NextResponse.json({ error: error.code }, { status: error.status });
    }
    throw error;
  }

  const payload =
    options.body !== "json"
      ? undefined
      : "presetPayload" in options
        ? options.presetPayload
        : await req.json().catch(() => ({}));
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (options.body === "json") headers["Content-Type"] = "application/json";
  if (options.forwardIdempotencyKey) {
    const idempotencyKey = req.headers.get("idempotency-key");
    if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  }

  const { status, body } = await proxyToAgentService(options.path, {
    method: options.method,
    headers,
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  return NextResponse.json(body, { status });
}
