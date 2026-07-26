import { type IndexNodeStatusData, extractChainHead } from "./indexingStatusParser.ts";
import { executeGraphQLRequest } from "./transport.ts";
import type { SourceChain } from "./types.ts";
import "server-only";

const INDEX_NODE_STATUS_QUERY = /* GraphQL */ `
  query IndexingStatusForCurrentVersion($name: String!) {
    indexingStatusForCurrentVersion(subgraphName: $name) {
      chains {
        network
        chainHeadBlock {
          number
        }
      }
    }
  }
`;

const DEFAULT_SUBGRAPH_NAMES: Record<SourceChain, string> = {
  "hedera-testnet": "aegis-hedera",
  "0g-galileo": "aegis-0g",
};

export type IndexingStatusClient = {
  getChainHead(source: SourceChain): Promise<number | null>;
};

export function getOptionalIndexingStatusClient(): IndexingStatusClient | null {
  const endpoint = process.env.THEGRAPH_GRAPH_NODE_STATUS_URL?.trim();
  if (!endpoint) return null;

  return {
    getChainHead: async source => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5_000);
      try {
        const data = await executeGraphQLRequest<IndexNodeStatusData>({
          endpoint,
          document: INDEX_NODE_STATUS_QUERY,
          variables: { name: configuredSubgraphName(source) },
          signal: controller.signal,
        });
        return extractChainHead(data, source);
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}

function configuredSubgraphName(source: SourceChain): string {
  const environmentName = source === "hedera-testnet" ? "THEGRAPH_HEDERA_SUBGRAPH_NAME" : "THEGRAPH_0G_SUBGRAPH_NAME";
  return process.env[environmentName]?.trim() || DEFAULT_SUBGRAPH_NAMES[source];
}
