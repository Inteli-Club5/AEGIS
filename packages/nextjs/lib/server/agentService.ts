import "server-only";

function getBaseUrl(): string {
  return process.env.AGENT_SERVICE_URL ?? "http://localhost:4200";
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
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
  } catch {
    return {
      status: 502,
      body: { error: `Couldn't reach the agent service at ${base}. Is it running (services/agent-service)?` },
    };
  }

  const body = await upstream.json().catch(() => ({ error: "Invalid response from the agent service" }));
  return { status: upstream.status, body };
}
