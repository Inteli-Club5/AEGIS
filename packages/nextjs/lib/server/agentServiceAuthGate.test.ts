import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

// Locks the rule TASKS.md documents as a real, previously-leaked vulnerability class
// (see the 2026-08-06 "auth hardening" entry in DEVLOG.md): every Next.js route that
// proxies a request as the agent's own bearer token (`proxyAgentServiceRequestAsAgent`)
// must call `verifyAgentActionAuthorization` first and fail closed on its result.
// Without this, anyone who knows an agent's id (visible in the URL, returned by the
// unauthenticated GET /agents/:agentId) can trigger real actions using that agent's
// bearer token with no proof of operator-wallet ownership. Before this test, the rule
// was enforced only by a code comment and reviewer memory.

const NEXTJS_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const API_ROOT = join(NEXTJS_ROOT, "app/api");

const AUTH_CALL = /\bverifyAgentActionAuthorization\s*\(/;
const PROXY_CALL = /\bproxyAgentServiceRequestAsAgent\s*\(/;

// Exported so both the real-route sweep and the synthetic negative cases below exercise
// the exact same check.
export function findAuthGateViolation(source: string): string | null {
  if (!PROXY_CALL.test(source)) return null;

  if (!AUTH_CALL.test(source)) {
    return "calls proxyAgentServiceRequestAsAgent without ever calling verifyAgentActionAuthorization";
  }

  const authCallIndex = source.search(AUTH_CALL);
  const proxyCallIndex = source.search(PROXY_CALL);
  if (authCallIndex >= proxyCallIndex) {
    return "verifyAgentActionAuthorization is called, but not before proxyAgentServiceRequestAsAgent";
  }

  const authVar = source.match(/const\s+(\w+)\s*=\s*await\s+verifyAgentActionAuthorization/)?.[1];
  if (!authVar) {
    return "verifyAgentActionAuthorization's result is not captured before proxying";
  }

  const between = source.slice(authCallIndex, proxyCallIndex);

  const guardsAndReturns = new RegExp(`if\\s*\\(\\s*!${authVar}\\.ok\\s*\\)\\s*return\\s+${authVar}\\.response`);
  if (!guardsAndReturns.test(between)) {
    return `does not fail closed on ${authVar}.ok before proxying (missing "if (!${authVar}.ok) return ${authVar}.response")`;
  }

  return null;
}

describe("agent-bearer proxy authorization gate", () => {
  it("requires every route using proxyAgentServiceRequestAsAgent to authorize first and fail closed", () => {
    const routeFiles = walkRouteFiles(API_ROOT);
    const sitesUsingAgentProxy = routeFiles.filter(file => PROXY_CALL.test(readFileSync(file, "utf8")));

    // If this ever hits zero, the helper was renamed/moved or all call sites were
    // deleted - either way this test needs updating, not silently passing on nothing.
    assert.ok(
      sitesUsingAgentProxy.length > 0,
      "expected at least one route calling proxyAgentServiceRequestAsAgent under app/api - update this test if the helper moved",
    );

    const violations = sitesUsingAgentProxy
      .map(file => {
        const violation = findAuthGateViolation(readFileSync(file, "utf8"));
        return violation ? `${file.slice(NEXTJS_ROOT.length + 1)}: ${violation}` : null;
      })
      .filter((entry): entry is string => entry !== null);

    assert.deepEqual(violations, []);
  });

  it("catches a route that never authorizes at all", () => {
    const source = `
      import { proxyAgentServiceRequestAsAgent } from "~~/lib/server/agentService";
      export async function POST(req: Request) {
        return proxyAgentServiceRequestAsAgent(req, { path: "/x", method: "POST", agentId: "a", body: "none" });
      }
    `;
    assert.match(findAuthGateViolation(source) ?? "", /without ever calling verifyAgentActionAuthorization/);
  });

  it("catches a route that authorizes after proxying instead of before", () => {
    const source = `
      import { proxyAgentServiceRequestAsAgent, verifyAgentActionAuthorization } from "~~/lib/server/agentService";
      export async function POST(req: Request) {
        const result = await proxyAgentServiceRequestAsAgent(req, { path: "/x", method: "POST", agentId: "a", body: "none" });
        const authorization = await verifyAgentActionAuthorization(req, { agentId: "a", action: "PRECHECK", contextHash: "0x0" });
        if (!authorization.ok) return authorization.response;
        return result;
      }
    `;
    assert.match(findAuthGateViolation(source) ?? "", /not before proxyAgentServiceRequestAsAgent/);
  });

  it("catches a route that calls verifyAgentActionAuthorization but ignores its result", () => {
    const source = `
      import { proxyAgentServiceRequestAsAgent, verifyAgentActionAuthorization } from "~~/lib/server/agentService";
      export async function POST(req: Request) {
        await verifyAgentActionAuthorization(req, { agentId: "a", action: "PRECHECK", contextHash: "0x0" });
        return proxyAgentServiceRequestAsAgent(req, { path: "/x", method: "POST", agentId: "a", body: "none" });
      }
    `;
    assert.match(findAuthGateViolation(source) ?? "", /result is not captured/);
  });

  it("catches a route that captures the result but never gates on .ok before proxying", () => {
    const source = `
      import { proxyAgentServiceRequestAsAgent, verifyAgentActionAuthorization } from "~~/lib/server/agentService";
      export async function POST(req: Request) {
        const authorization = await verifyAgentActionAuthorization(req, { agentId: "a", action: "PRECHECK", contextHash: "0x0" });
        return proxyAgentServiceRequestAsAgent(req, { path: "/x", method: "POST", agentId: "a", body: "none" });
      }
    `;
    assert.match(findAuthGateViolation(source) ?? "", /does not fail closed/);
  });

  it("accepts the compliant shape used by every current route", () => {
    const source = `
      import { proxyAgentServiceRequestAsAgent, verifyAgentActionAuthorization } from "~~/lib/server/agentService";
      export async function POST(req: Request) {
        const authorization = await verifyAgentActionAuthorization(req, { agentId: "a", action: "PRECHECK", contextHash: "0x0" });
        if (!authorization.ok) return authorization.response;
        return proxyAgentServiceRequestAsAgent(req, { path: "/x", method: "POST", agentId: "a", body: "none" });
      }
    `;
    assert.equal(findAuthGateViolation(source), null);
  });

  it("ignores routes that never touch proxyAgentServiceRequestAsAgent", () => {
    const source = `
      export async function GET() {
        return Response.json({ ok: true });
      }
    `;
    assert.equal(findAuthGateViolation(source), null);
  });
});

function walkRouteFiles(path: string): string[] {
  return readdirSync(path, { withFileTypes: true }).flatMap(entry => {
    const child = join(path, entry.name);
    if (entry.isDirectory()) return walkRouteFiles(child);
    if (entry.name !== "route.ts") return [];
    return [child];
  });
}
