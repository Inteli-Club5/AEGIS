import { OnchainDataConfigurationError } from "./serverClients.ts";
import { OnchainGraphQLError } from "./transport.ts";

export type OnchainApiErrorPayload = {
  error: string;
  message: string;
};

export function toOnchainApiError(error: unknown): { status: number; body: OnchainApiErrorPayload } {
  if (error instanceof OnchainDataConfigurationError) {
    return { status: 503, body: { error: "onchain_data_unconfigured", message: error.message } };
  }
  if (error instanceof OnchainGraphQLError) {
    return {
      status: 502,
      body: {
        error: error.code === "GRAPHQL_ERROR" ? "onchain_indexing_error" : "onchain_indexer_unavailable",
        message:
          error.code === "GRAPHQL_ERROR"
            ? "The Graph could not complete the indexed-data query."
            : "The onchain indexer is unavailable or returned an invalid response.",
      },
    };
  }
  return {
    status: 400,
    body: {
      error: "invalid_onchain_query",
      message: error instanceof Error ? error.message : "The onchain query is invalid.",
    },
  };
}
