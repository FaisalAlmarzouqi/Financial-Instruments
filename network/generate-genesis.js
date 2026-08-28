// Generates the private network's genesis block, 3 Clique validator identities,
// and a funded deployer/operator keypair used by the rest of the platform.
//
// Run once before the first `docker compose up` (network/start-network.js does this
// automatically). Re-running wipes and regenerates everything under network/data/,
// contracts/.env and server/.env — do not re-run after the chain has state you care about.

const fs = require("fs");
const path = require("path");
const { Wallet, SigningKey, encryptKeystoreJsonSync } = require("ethers");

const NETWORK_DIR = __dirname;
const DATA_DIR = path.join(NETWORK_DIR, "data");
const CONTRACTS_ENV = path.join(NETWORK_DIR, "..", "contracts", ".env");
const SERVER_ENV = path.join(NETWORK_DIR, "..", "server", ".env");

const CHAIN_ID = 4218;
const CLIQUE_PERIOD_SECONDS = 3;
const CLIQUE_EPOCH_BLOCKS = 30000;
const KEYSTORE_PASSWORD = "networkpass123"; // dev-only private network, documented in README
const FUNDED_BALANCE = "0x" + (10n ** 24n).toString(16); // 1,000,000 ETH, plenty for a private chain

function mkdirp(p) {
  fs.mkdirSync(p, { recursive: true });
}

function nodeIdFromPrivateKey(privateKeyHex) {
  const pub = new SigningKey(privateKeyHex).publicKey; // 0x04 + 64 bytes uncompressed
  return pub.slice(4); // strip "0x04" -> 128 hex chars = enode node id
}

async function makeValidator(index) {
  const dir = path.join(DATA_DIR, `validator${index}`);
  mkdirp(path.join(dir, "keystore"));

  const account = Wallet.createRandom();
  const keystoreJson = encryptKeystoreJsonSync(
    { address: account.address, privateKey: account.privateKey },
    KEYSTORE_PASSWORD,
    { scrypt: { N: 1 << 12 } } // lighter KDF cost; this is a throwaway dev network
  );
  fs.writeFileSync(path.join(dir, "keystore", "key.json"), keystoreJson);
  fs.writeFileSync(path.join(dir, "password.txt"), KEYSTORE_PASSWORD);

  const nodeKey = Wallet.createRandom();
  const nodeKeyHex = nodeKey.privateKey.slice(2); // geth --nodekey wants raw hex, no 0x
  fs.writeFileSync(path.join(dir, "nodekey"), nodeKeyHex);
  const nodeId = nodeIdFromPrivateKey(nodeKey.privateKey);

  return { index, address: account.address, nodeId };
}

async function makeFundedWallet(name) {
  const wallet = Wallet.createRandom();
  return { name, address: wallet.address, privateKey: wallet.privateKey };
}

function buildGenesis(validatorAddresses, fundedWallets) {
  const sorted = [...validatorAddresses].sort((a, b) =>
    a.toLowerCase() < b.toLowerCase() ? -1 : 1
  );
  const vanity = "00".repeat(32);
  const signers = sorted.map((a) => a.slice(2).toLowerCase()).join("");
  const seal = "00".repeat(65);
  const extraData = "0x" + vanity + signers + seal;

  const alloc = {};
  for (const w of fundedWallets) {
    alloc[w.address.slice(2).toLowerCase()] = { balance: FUNDED_BALANCE };
  }

  return {
    config: {
      chainId: CHAIN_ID,
      homesteadBlock: 0,
      eip150Block: 0,
      eip155Block: 0,
      eip158Block: 0,
      byzantiumBlock: 0,
      constantinopleBlock: 0,
      petersburgBlock: 0,
      istanbulBlock: 0,
      // Deliberately no berlin/london fork: keeps legacy (non EIP-1559) gas pricing
      // so every tx can simply use gasPrice 0 on this private network.
      clique: { period: CLIQUE_PERIOD_SECONDS, epoch: CLIQUE_EPOCH_BLOCKS },
    },
    difficulty: "0x1",
    gasLimit: "0xB71B00", // 12,000,000
    extraData,
    alloc,
  };
}

async function main() {
  mkdirp(DATA_DIR);

  const validators = await Promise.all([1, 2, 3].map(makeValidator));
  const deployer = await makeFundedWallet("deployer");
  const operator = await makeFundedWallet("operator");

  const genesis = buildGenesis(
    validators.map((v) => v.address),
    [deployer, operator, ...validators.map((v) => ({ address: v.address }))]
  );
  fs.writeFileSync(
    path.join(NETWORK_DIR, "genesis.json"),
    JSON.stringify(genesis, null, 2)
  );

  const [v1, v2, v3] = validators;
  const bootnodeEnode = `enode://${v1.nodeId}@validator1:30303`;

  fs.writeFileSync(
    path.join(NETWORK_DIR, ".env"),
    [
      `CHAIN_ID=${CHAIN_ID}`,
      `VALIDATOR1_ADDRESS=${v1.address}`,
      `VALIDATOR2_ADDRESS=${v2.address}`,
      `VALIDATOR3_ADDRESS=${v3.address}`,
      `BOOTNODE_ENODE=${bootnodeEnode}`,
      "",
    ].join("\n")
  );

  mkdirp(path.dirname(CONTRACTS_ENV));
  fs.writeFileSync(
    CONTRACTS_ENV,
    `RPC_URL=http://127.0.0.1:8545\nCHAIN_ID=${CHAIN_ID}\nDEPLOYER_PRIVATE_KEY=${deployer.privateKey}\nOPERATOR_ADDRESS=${operator.address}\n`
  );

  mkdirp(path.dirname(SERVER_ENV));
  fs.writeFileSync(
    SERVER_ENV,
    `RPC_URL=http://127.0.0.1:8545\nCHAIN_ID=${CHAIN_ID}\nOPERATOR_PRIVATE_KEY=${operator.privateKey}\nDEPLOYER_ADDRESS=${deployer.address}\nPORT=4000\n`
  );

  console.log("Generated private network identities:");
  for (const v of validators) console.log(`  validator${v.index}: ${v.address}`);
  console.log(`  deployer:   ${deployer.address}`);
  console.log(`  operator:   ${operator.address}`);
  console.log("\nWrote network/genesis.json, contracts/.env, server/.env");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
