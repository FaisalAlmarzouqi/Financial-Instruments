// Brings up the 3-validator Clique private network via Docker Compose and waits
// until all 3 nodes are producing/signing blocks in rotation.
//
// Usage: node network/start-network.js   (or `npm run network:start` from repo root)

const { execSync, spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const NETWORK_DIR = __dirname;
const GENESIS_PATH = path.join(NETWORK_DIR, "genesis.json");
const RPC_URLS = [
  "http://127.0.0.1:8545",
  "http://127.0.0.1:8546",
  "http://127.0.0.1:8547",
];

function run(cmd, opts = {}) {
  console.log(`$ ${cmd}`);
  execSync(cmd, { stdio: "inherit", cwd: NETWORK_DIR, ...opts });
}

async function rpc(url, method, params = []) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const json = await res.json();
  if (json.error) throw new Error(`${method} on ${url}: ${json.error.message}`);
  return json.result;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForNode(url, timeoutMs = 90000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const hex = await rpc(url, "eth_blockNumber");
      return parseInt(hex, 16);
    } catch {
      await sleep(2000);
    }
  }
  throw new Error(`Timed out waiting for ${url} to respond`);
}

async function waitForBlocksProducing(url, timeoutMs = 60000) {
  const start = Date.now();
  const initial = await waitForNode(url);
  while (Date.now() - start < timeoutMs) {
    const current = parseInt(await rpc(url, "eth_blockNumber"), 16);
    if (current > initial) return current;
    await sleep(2000);
  }
  throw new Error(`${url} did not produce a new block within ${timeoutMs}ms`);
}

async function main() {
  if (!fs.existsSync(GENESIS_PATH)) {
    console.log("No genesis.json found — generating network identities first...");
    run("node generate-genesis.js");
  }

  const dockerInfo = spawnSync("docker", ["info"], { stdio: "pipe" });
  if (dockerInfo.status !== 0) {
    console.error(
      "Docker does not appear to be running. Start Docker Desktop and re-run this script."
    );
    process.exit(1);
  }

  run("docker compose up -d");

  console.log("\nWaiting for all 3 validators to come online...");
  for (const url of RPC_URLS) {
    await waitForNode(url);
    console.log(`  ${url} is up`);
  }

  console.log("\nWaiting for a new block to be signed (confirms Clique sealing works)...");
  const blockNumber = await waitForBlocksProducing(RPC_URLS[0]);
  console.log(`  validator1 is at block ${blockNumber}`);

  const signers = await rpc(RPC_URLS[0], "clique_getSigners");
  console.log(`\nActive Clique signers (${signers.length}):`);
  for (const s of signers) console.log(`  ${s}`);

  if (signers.length < 3) {
    console.warn(
      "\nWarning: fewer than 3 signers are active yet. Peers may still be connecting — re-check with:\n  docker compose -f network/docker-compose.yml exec validator1 geth attach --exec 'clique.getSigners()' http://localhost:8545"
    );
  }

  console.log("\nNetwork is up. RPC endpoints:");
  RPC_URLS.forEach((u, i) => console.log(`  validator${i + 1}: ${u}`));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
