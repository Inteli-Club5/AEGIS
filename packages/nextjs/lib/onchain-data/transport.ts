export type GraphQLFetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export class OnchainGraphQLError extends Error {
  readonly code: "HTTP_ERROR" | "GRAPHQL_ERROR" | "INVALID_RESPONSE";
  readonly status: number | null;

  constructor(code: OnchainGraphQLError["code"], message: string, options: { status?: number; cause?: unknown } = {}) {
    super(message, { cause: options.cause });
    this.name = "OnchainGraphQLError";
    this.code = code;
    this.status = options.status ?? null;
  }
}

export async function executeGraphQLRequest<T>(input: {
  endpoint: string;
  document: string;
  variables?: Readonly<Record<string, unknown>>;
  gatewayApiKey?: string;
  fetcher?: GraphQLFetcher;
  signal?: AbortSignal;
}): Promise<T> {
  const fetcher = input.fetcher ?? fetch;
  let response: Response;
  try {
    response = await fetcher(input.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(input.gatewayApiKey ? { authorization: `Bearer ${input.gatewayApiKey}` } : {}),
      },
      body: JSON.stringify({ query: input.document, variables: input.variables ?? {} }),
      cache: "no-store",
      signal: input.signal,
    });
  } catch (cause) {
    throw new OnchainGraphQLError("HTTP_ERROR", "The onchain indexer could not be reached.", { cause });
  }

  const payload = (await response.json().catch(() => null)) as {
    data?: T | null;
    errors?: Array<{ message?: string }>;
  } | null;

  if (!response.ok) {
    throw new OnchainGraphQLError("HTTP_ERROR", `The onchain indexer returned HTTP ${response.status}.`, {
      status: response.status,
    });
  }
  if (!payload || typeof payload !== "object") {
    throw new OnchainGraphQLError("INVALID_RESPONSE", "The onchain indexer returned an invalid response.");
  }
  if (Array.isArray(payload.errors) && payload.errors.length > 0) {
    const message = payload.errors
      .map(error => error.message)
      .filter(Boolean)
      .join("; ");
    throw new OnchainGraphQLError("GRAPHQL_ERROR", message || "The onchain query failed.");
  }
  if (payload.data === undefined || payload.data === null) {
    throw new OnchainGraphQLError("INVALID_RESPONSE", "The onchain indexer response did not include data.");
  }
  return payload.data;
}
