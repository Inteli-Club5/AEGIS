export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;
const BYTES_ENTITY_ID = /^0x(?:[0-9a-fA-F]{2}){1,128}$/;

export type PageRequest = {
  first: number;
  afterId: string | null;
  orderBy: "id";
  orderDirection: "asc";
};

export function createPageRequest(input: { limit?: number; cursor?: string | null }): PageRequest {
  const requestedLimit =
    Number.isInteger(input.limit) && Number(input.limit) > 0 ? Number(input.limit) : DEFAULT_PAGE_SIZE;
  const first = Math.min(requestedLimit, MAX_PAGE_SIZE);
  const decoded = input.cursor ? decodeCursor(input.cursor) : null;

  return {
    first,
    afterId: decoded?.afterId ?? null,
    orderBy: "id",
    orderDirection: "asc",
  };
}

export function createNextCursor(input: { hasNextPage: boolean; lastId?: string }): string | null {
  if (!input.hasNextPage) return null;
  if (!input.lastId || !BYTES_ENTITY_ID.test(input.lastId)) {
    throw new Error("Cannot create an onchain cursor without a valid final Bytes entity ID.");
  }

  return Buffer.from(
    JSON.stringify({
      version: 1,
      afterId: input.lastId,
      orderBy: "id",
      orderDirection: "asc",
    }),
  ).toString("base64url");
}

function decodeCursor(cursor: string): { afterId: string } {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as Record<string, unknown>;
    if (
      parsed.version !== 1 ||
      typeof parsed.afterId !== "string" ||
      !BYTES_ENTITY_ID.test(parsed.afterId) ||
      parsed.orderBy !== "id" ||
      parsed.orderDirection !== "asc"
    ) {
      throw new Error("invalid cursor payload");
    }
    return { afterId: parsed.afterId.toLowerCase() };
  } catch {
    throw new Error("Invalid onchain pagination cursor.");
  }
}
