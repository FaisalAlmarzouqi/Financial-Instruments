// Interactive script that deploys the platform's financial instruments and
// distributes starting balances to Aya and Beatriz, per the project spec:
//   - Stablecoin "Triangle" (TRG), 4000 units
//   - Shares "Clove Company" (CLV) and "Rooibos Limited" (ROO), 100 units each
//   - Government bonds (GOV), 20 bonds @ 200 principal, 10% interest
//   - Each instrument issued by its own distinct address
//   - Aya receives 200 TRG, 10 CLV, 2 GOV bonds
//   - Beatriz receives 150 TRG, 20 ROO, 5 GOV bonds
//
// Run with: npx hardhat run scripts/populate.js --network privatenet

const fs = require("fs");
const path = require("path");
const prompts = require("prompts");
const { ethers } = require("hardhat");

const DEPLOYMENTS_PATH = path.join(__dirname, "..", "..", "deployments", "deployed-addresses.json");
const GAS_FUNDING = ethers.parseEther("10"); // headroom for wallets that will send txs later
const ZERO_GAS = { gasPrice: 0 };

function loadDeployments() {
  if (!fs.existsSync(DEPLOYMENTS_PATH)) {
    throw new Error(
      `${DEPLOYMENTS_PATH} not found — run "npm run contracts:deploy" first to deploy the Vault.`
    );
  }
  return JSON.parse(fs.readFileSync(DEPLOYMENTS_PATH, "utf8"));
}

function saveDeployments(data) {
  fs.mkdirSync(path.dirname(DEPLOYMENTS_PATH), { recursive: true });
  fs.writeFileSync(DEPLOYMENTS_PATH, JSON.stringify(data, null, 2));
}

async function promptAddress(message, envVar) {
  const fromEnv = process.env[envVar];
  if (fromEnv) {
    if (!ethers.isAddress(fromEnv)) throw new Error(`${envVar} is not a valid address`);
    console.log(`${message} ${fromEnv} (from ${envVar})`);
    return ethers.getAddress(fromEnv);
  }
  const { address } = await prompts({
    type: "text",
    name: "address",
    message,
    validate: (v) => ethers.isAddress(v) || "Enter a valid Ethereum address",
  });
  if (!address) {
    console.log("\nCancelled.");
    process.exit(1);
  }
  return ethers.getAddress(address);
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const provider = ethers.provider;
  const deployments = loadDeployments();

  console.log(`Deployer: ${deployer.address}`);
  console.log("\nGenerating 4 distinct issuer wallets (Stablecoin, CLV, ROO, GOV)...");
  const issuers = {
    trg: ethers.Wallet.createRandom().connect(provider),
    clv: ethers.Wallet.createRandom().connect(provider),
    roo: ethers.Wallet.createRandom().connect(provider),
    gov: ethers.Wallet.createRandom().connect(provider),
  };
  for (const [name, wallet] of Object.entries(issuers)) {
    await (await deployer.sendTransaction({ to: wallet.address, value: GAS_FUNDING, ...ZERO_GAS })).wait();
    console.log(`  ${name.toUpperCase()} issuer: ${wallet.address}`);
  }

  console.log("\nDeploying Stablecoin TRG (4000 units)...");
  const Stablecoin = await ethers.getContractFactory("Stablecoin", issuers.trg);
  const trg = await Stablecoin.deploy("Triangle", "TRG", ethers.parseEther("4000"), ZERO_GAS);
  await trg.waitForDeployment();
  console.log(`  TRG deployed at ${await trg.getAddress()}`);

  console.log("\nDeploying Shares CLV (100 units)...");
  const Shares = await ethers.getContractFactory("Shares", issuers.clv);
  const clv = await Shares.deploy("Clove Company", "CLV", ethers.parseEther("100"), await trg.getAddress(), ZERO_GAS);
  await clv.waitForDeployment();
  console.log(`  CLV deployed at ${await clv.getAddress()}`);

  console.log("\nDeploying Shares ROO (100 units)...");
  const roo = await Shares.connect(issuers.roo).deploy(
    "Rooibos Limited",
    "ROO",
    ethers.parseEther("100"),
    await trg.getAddress(),
    ZERO_GAS
  );
  await roo.waitForDeployment();
  console.log(`  ROO deployed at ${await roo.getAddress()}`);

  console.log("\nDeploying BondIssuer GOV and issuing 20 bonds (principal 200, 10%)...");
  const BondIssuer = await ethers.getContractFactory("BondIssuer", issuers.gov);
  const gov = await BondIssuer.deploy(await trg.getAddress(), ZERO_GAS);
  await gov.waitForDeployment();
  await (await gov.issueBonds(20, ethers.parseEther("200"), 1000, ZERO_GAS)).wait();
  console.log(`  GOV deployed at ${await gov.getAddress()}, 20 bonds issued (serials 1-20)`);

  console.log("\n--- Distribution ---");
  const aya = await promptAddress("Aya's Ethereum address:", "AYA_ADDRESS");
  const beatriz = await promptAddress("Beatriz's Ethereum address:", "BEATRIZ_ADDRESS");

  console.log("\nFunding Aya and Beatriz with ETH for future gas...");
  await (await deployer.sendTransaction({ to: aya, value: GAS_FUNDING, ...ZERO_GAS })).wait();
  await (await deployer.sendTransaction({ to: beatriz, value: GAS_FUNDING, ...ZERO_GAS })).wait();

  console.log("\nTransferring to Aya: 200 TRG, 10 CLV, 2 GOV bonds...");
  await (await trg.connect(issuers.trg).transfer(aya, ethers.parseEther("200"), ZERO_GAS)).wait();
  await (await clv.connect(issuers.clv).transfer(aya, ethers.parseEther("10"), ZERO_GAS)).wait();
  await (await gov.connect(issuers.gov).transferBond(1, aya, ZERO_GAS)).wait();
  await (await gov.connect(issuers.gov).transferBond(2, aya, ZERO_GAS)).wait();

  console.log("Transferring to Beatriz: 150 TRG, 20 ROO, 5 GOV bonds...");
  await (await trg.connect(issuers.trg).transfer(beatriz, ethers.parseEther("150"), ZERO_GAS)).wait();
  await (await roo.connect(issuers.roo).transfer(beatriz, ethers.parseEther("20"), ZERO_GAS)).wait();
  for (const serial of [3, 4, 5, 6, 7]) {
    await (await gov.connect(issuers.gov).transferBond(serial, beatriz, ZERO_GAS)).wait();
  }

  deployments.assets = {
    TRG: { type: "stablecoin", address: await trg.getAddress(), issuer: issuers.trg.address, defaultPrice: 1 },
    CLV: { type: "share", address: await clv.getAddress(), issuer: issuers.clv.address, defaultPrice: 10 },
    ROO: { type: "share", address: await roo.getAddress(), issuer: issuers.roo.address, defaultPrice: 10 },
    GOV: { type: "bond", address: await gov.getAddress(), issuer: issuers.gov.address, defaultPrice: 200 },
  };
  deployments.accounts = { aya, beatriz };
  saveDeployments(deployments);

  console.log(`\nDone. Wrote ${DEPLOYMENTS_PATH}`);
  console.log("Start the server next — it seeds its database from this file.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
