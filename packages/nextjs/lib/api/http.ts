export type OperatorHeaders = {
  address: `0x${string}`;
  signature: `0x${string}`;
};

export class ApiError extends Error {
  readonly status: number;
  readonly code: string | null;

  constructor(message: string, status: number, code: string | null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export async function requestJson<T>(
  path: string,
  options: {
    method?: "GET" | "POST" | "PATCH" | "DELETE";
    body?: unknown;
    operator?: OperatorHeaders;
    headers?: Record<string, string>;
  } = {},
): Promise<T> {
  const response = await fetch(path, {
    method: options.method ?? "GET",
    headers: {
      ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(options.operator
        ? {
            "x-aegis-operator-address": options.operator.address,
            "x-aegis-operator-signature": options.operator.signature,
          }
        : {}),
      ...options.headers,
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const payload = typeof data === "object" && data ? (data as Record<string, unknown>) : {};
    // TeeML technical failures use application/problem+json ({ code, title }) instead
    // of this repo's usual { error, message } shape (docs/aegis-current-scope.md's HTTP
    // section) - fall back to it so those codes surface instead of a generic message.
    const code =
      typeof payload.error === "string" ? payload.error : typeof payload.code === "string" ? payload.code : null;
    const message =
      typeof payload.message === "string"
        ? payload.message
        : typeof payload.title === "string"
          ? payload.title
          : (code ?? `Request to ${path} failed (${response.status}).`);
    throw new ApiError(message, response.status, code);
  }
  return data as T;
}
