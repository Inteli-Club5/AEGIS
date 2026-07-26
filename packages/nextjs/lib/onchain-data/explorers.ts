const ZERO_G_GALILEO_EXPLORER = "https://chainscan-galileo.0g.ai";

export function getZeroGExplorerTxLink(transactionHash: string): string {
  return `${ZERO_G_GALILEO_EXPLORER}/tx/${transactionHash}`;
}

export function getZeroGExplorerAddressLink(address: string): string {
  return `${ZERO_G_GALILEO_EXPLORER}/address/${address}`;
}
