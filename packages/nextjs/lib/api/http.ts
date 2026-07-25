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
    method?: "GET" | "POST" | "PATCH";
    body?: unknown;
    operator?: OperatorHeaders;
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
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const payload = typeof data === "object" && data ? (data as Record<string, unknown>) : {};
    const code = typeof payload.error === "string" ? payload.error : null;
    const message =
      typeof payload.message === "string"
        ? payload.message
        : (code ?? `Request to ${path} failed (${response.status}).`);
    throw new ApiError(message, response.status, code);
  }
  return data as T;
}
