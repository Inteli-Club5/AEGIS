import { executeGraphQLRequest } from "./transport.ts";
import "server-only";

export type GraphClient = {
  query<T>(document: string, variables?: Readonly<Record<string, unknown>>): Promise<T>;
};

export class OnchainDataConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OnchainDataConfigurationError";
  }
}

export function getOnchainGraphClients(): { hedera: GraphClient; zeroG: GraphClient } {
  return { hedera: getHederaGraphClient(), zeroG: getZeroGGraphClient() };
}

export function getHederaGraphClient(): GraphClient {
  const gatewayApiKey = optionalEnv("THEGRAPH_GATEWAY_API_KEY");
  return createServerGraphClient(requiredEndpoint("THEGRAPH_HEDERA_SUBGRAPH_URL"), gatewayApiKey);
}

export function getZeroGGraphClient(): GraphClient {
  const gatewayApiKey = optionalEnv("THEGRAPH_GATEWAY_API_KEY");
  return createServerGraphClient(requiredEndpoint("THEGRAPH_0G_SUBGRAPH_URL"), gatewayApiKey);
}

function createServerGraphClient(endpoint: string, gatewayApiKey?: string): GraphClient {
  return {
    query: async <T>(document: string, variables: Readonly<Record<string, unknown>> = {}) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);
      try {
        return await executeGraphQLRequest<T>({
          endpoint,
          document,
          variables,
          gatewayApiKey,
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}

function requiredEndpoint(name: "THEGRAPH_HEDERA_SUBGRAPH_URL" | "THEGRAPH_0G_SUBGRAPH_URL"): string {
  const value = optionalEnv(name);
  if (!value) throw new OnchainDataConfigurationError(`${name} is required for the onchain dashboard.`);
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new OnchainDataConfigurationError(`${name} must be an absolute HTTP(S) URL.`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new OnchainDataConfigurationError(`${name} must use HTTP(S).`);
  }
  return url.toString();
}

function optionalEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}
