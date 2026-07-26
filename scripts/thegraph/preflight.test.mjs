import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, it } from "node:test";

const REPO_ROOT = resolve(import.meta.dirname, "../..");
const CONTRACT = "0x1111111111111111111111111111111111111111";
const ZERO_HASH = `0x${"0".repeat(64)}`;
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const temporaryDirectories = [];

describe("Hedera Graph RPC preflight", () => {
  afterEach(() => {
    while (temporaryDirectories.length > 0) rmSync(temporaryDirectories.pop(), { recursive: true, force: true });
  });

  it("emits HEDERA_GRAPH_RPC_READY only after repeated block, transaction, receipt, log, code, and history checks", async () => {
    const result = await runPreflight("consistent");
    assert.equal(result.code, 0, result.output);
    assert.match(result.output, /verified 6 receipt\(s\) across all 6 non-empty blocks/);
    assert.match(result.output, /deployment transaction and receipt passed three identical reads/);
    assert.match(result.output, /historical block\/log range/);
    assert.match(result.output, /HEDERA_GRAPH_RPC_READY\s*$/);
  });

  it("emits HEDERA_GRAPH_RPC_BLOCKED when a repeated receipt changes", async () => {
    const result = await runPreflight("changing-receipt");
    assert.notEqual(result.code, 0);
    assert.match(result.output, /repeated transaction\/receipt read 2 changed/);
    assert.match(result.output, /HEDERA_GRAPH_RPC_BLOCKED\s*$/);
    assert.doesNotMatch(result.output, /HEDERA_GRAPH_RPC_READY/);
  });
});

describe("0G Graph RPC preflight", () => {
  afterEach(() => {
    while (temporaryDirectories.length > 0) rmSync(temporaryDirectories.pop(), { recursive: true, force: true });
  });

  it("validates deployment provenance separately from the later AEGIS mint evidence", async () => {
    const result = await runZeroGPreflight();
    assert.equal(result.code, 0, result.output);
    assert.match(result.output, /deployment transaction and receipt passed three identical reads/);
    assert.match(result.output, /successful evidence receipt, Transfer log, and source block verified/);
    assert.match(result.output, /The Graph preflight passed for 0g/);
  });
});

describe("Subgraph deployment gates", () => {
  for (const [network, script] of [
    ["hedera", "scripts/thegraph/deploy-hedera.sh"],
    ["0g", "scripts/thegraph/deploy-0g.sh"],
  ]) {
    it(`runs the ${network} RPC preflight before submitting a deployment`, () => {
      const source = readFileSync(resolve(REPO_ROOT, script), "utf8");
      const preflight = source.indexOf(`preflight.sh\" --network ${network}`);
      const deployment = source.indexOf(`\" deploy \\\n`);
      assert.ok(preflight >= 0, `${script} must invoke the network preflight`);
      assert.ok(deployment > preflight, `${script} must not submit before preflight succeeds`);
    });
  }
});

async function runPreflight(mode) {
  const state = buildChainState();
  const receiptReads = new Map();
  const server = createServer(async (request, response) => {
    const body = await readJson(request);
    const result = rpcResult(body.method, body.params ?? [], state, receiptReads, mode);
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ jsonrpc: "2.0", id: body.id, result }));
  });
  await new Promise(resolveListen => server.listen(0, "127.0.0.1", resolveListen));

  const address = server.address();
  assert.ok(address && typeof address === "object");
  const temporaryDirectory = mkdtempSync(join(tmpdir(), "aegis-hedera-preflight-"));
  temporaryDirectories.push(temporaryDirectory);
  const artifact = join(temporaryDirectory, "tee-validation-registry.json");
  const deployTxHash = hash(9_999);
  const deployBlock = state.blocks.get("0xc8");
  deployBlock.transactions.push(deployTxHash);
  state.transactions.set(deployTxHash, { hash: deployTxHash, blockHash: deployBlock.hash, blockNumber: "0xc8" });
  state.receipts.set(deployTxHash, {
    transactionHash: deployTxHash,
    blockHash: deployBlock.hash,
    blockNumber: "0xc8",
    contractAddress: CONTRACT,
    status: "0x1",
    logs: [],
  });
  writeFileSync(
    artifact,
    `${JSON.stringify({
      contractName: "AegisTeeValidationRegistry",
      address: CONTRACT,
      chainId: 296,
      network: "hedera-testnet",
      startBlock: 200,
      deployTxHash,
    })}\n`,
  );

  try {
    return await runCommand("bash", ["scripts/thegraph/preflight.sh", "--network", "hedera"], {
      ...process.env,
      THEGRAPH_HEDERA_RPC_URL: `http://127.0.0.1:${address.port}`,
      THEGRAPH_HEDERA_DEPLOYMENT_ARTIFACT: artifact,
    });
  } finally {
    await new Promise(resolveClose => server.close(resolveClose));
  }
}

async function runZeroGPreflight() {
  const state = buildChainState("0x40da");
  const receiptReads = new Map();
  const server = createServer(async (request, response) => {
    const body = await readJson(request);
    const result = rpcResult(body.method, body.params ?? [], state, receiptReads, "consistent");
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ jsonrpc: "2.0", id: body.id, result }));
  });
  await new Promise(resolveListen => server.listen(0, "127.0.0.1", resolveListen));

  const address = server.address();
  assert.ok(address && typeof address === "object");
  const temporaryDirectory = mkdtempSync(join(tmpdir(), "aegis-zero-g-preflight-"));
  temporaryDirectories.push(temporaryDirectory);
  const artifact = join(temporaryDirectory, "agentic-id.json");
  const deployTxHash = hash(8_888);
  const sourceTransactionHash = hash(8_889);
  const deployBlock = state.blocks.get("0xc8");
  const sourceMintBlock = state.blocks.get("0xd2");
  deployBlock.transactions.push(deployTxHash);
  sourceMintBlock.transactions.push(sourceTransactionHash);
  state.transactions.set(deployTxHash, { hash: deployTxHash, blockHash: deployBlock.hash, blockNumber: "0xc8" });
  state.transactions.set(sourceTransactionHash, {
    hash: sourceTransactionHash,
    blockHash: sourceMintBlock.hash,
    blockNumber: "0xd2",
  });
  state.receipts.set(deployTxHash, {
    transactionHash: deployTxHash,
    blockHash: deployBlock.hash,
    blockNumber: "0xc8",
    contractAddress: CONTRACT,
    status: "0x1",
    logs: [],
  });
  state.receipts.set(sourceTransactionHash, {
    transactionHash: sourceTransactionHash,
    blockHash: sourceMintBlock.hash,
    blockNumber: "0xd2",
    contractAddress: null,
    status: "0x1",
    logs: [{ address: CONTRACT, topics: [TRANSFER_TOPIC] }],
  });
  writeFileSync(
    artifact,
    `${JSON.stringify({
      contractName: "AgenticID",
      address: CONTRACT,
      chainId: 16602,
      network: "0g-galileo",
      startBlock: 200,
      deploymentTransactionHash: deployTxHash,
      sourceTransactionHash,
      sourceMintBlock: 210,
    })}\n`,
  );

  try {
    return await runCommand("bash", ["scripts/thegraph/preflight.sh", "--network", "0g"], {
      ...process.env,
      THEGRAPH_0G_RPC_URL: `http://127.0.0.1:${address.port}`,
      THEGRAPH_0G_DEPLOYMENT_ARTIFACT: artifact,
    });
  } finally {
    await new Promise(resolveClose => server.close(resolveClose));
  }
}

function buildChainState(chainId = "0x128") {
  const blocks = new Map();
  const transactions = new Map();
  const receipts = new Map();
  for (let number = 193; number <= 256; number += 1) {
    const blockNumber = `0x${number.toString(16)}`;
    const blockHash = hash(number);
    const transactionHashes = number >= 252 ? [hash(number + 1_000)] : [];
    blocks.set(blockNumber, { number: blockNumber, hash: blockHash, transactions: transactionHashes });
    for (const transactionHash of transactionHashes) {
      transactions.set(transactionHash, { hash: transactionHash, blockHash, blockNumber });
      receipts.set(transactionHash, { transactionHash, blockHash, blockNumber, status: "0x1", logs: [] });
    }
  }
  return { chainId, blocks, transactions, receipts };
}

function rpcResult(method, params, state, receiptReads, mode) {
  switch (method) {
    case "eth_chainId":
      return state.chainId;
    case "eth_blockNumber":
      return "0x100";
    case "eth_getBlockByNumber": {
      const number = params[0] === "latest" ? "0x100" : String(params[0]).toLowerCase();
      return state.blocks.get(number) ?? null;
    }
    case "eth_getTransactionByHash":
      return state.transactions.get(String(params[0]).toLowerCase()) ?? null;
    case "eth_getTransactionReceipt": {
      const transactionHash = String(params[0]).toLowerCase();
      if (transactionHash === ZERO_HASH) return null;
      const receipt = state.receipts.get(transactionHash) ?? null;
      if (!receipt) return null;
      const count = (receiptReads.get(transactionHash) ?? 0) + 1;
      receiptReads.set(transactionHash, count);
      return mode === "changing-receipt" && count >= 2 ? { ...receipt, status: "0x0" } : receipt;
    }
    case "eth_getLogs":
      return [];
    case "eth_getCode":
      return "0x60006000";
    case "eth_call":
      return "0x";
    default:
      throw new Error(`Unexpected test RPC method: ${method}`);
  }
}

function runCommand(command, args, env) {
  return new Promise((resolveCommand, rejectCommand) => {
    const child = spawn(command, args, { cwd: REPO_ROOT, env });
    let output = "";
    child.stdout.on("data", chunk => (output += chunk));
    child.stderr.on("data", chunk => (output += chunk));
    child.on("error", rejectCommand);
    child.on("close", code => resolveCommand({ code, output }));
  });
}

function readJson(request) {
  return new Promise((resolveBody, rejectBody) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", chunk => (body += chunk));
    request.on("end", () => resolveBody(JSON.parse(body)));
    request.on("error", rejectBody);
  });
}

function hash(number) {
  return `0x${number.toString(16).padStart(64, "0")}`;
}
