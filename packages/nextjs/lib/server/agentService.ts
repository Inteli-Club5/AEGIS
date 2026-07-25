import { NextResponse } from "next/server";
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
      headers: init?.headers,
      cache: "no-store",
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

export async function proxyAgentServiceRequest(
  req: Request,
  options: {
    path: string;
    method: "GET" | "POST" | "PATCH";
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
  return NextResponse.json(body, { status });
}
