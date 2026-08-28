// Deploys the Vault contract only. Asset contracts (Stablecoin/Shares/BondIssuer) are
// deployed by populate.js, since the spec requires each to be issued by a distinct
// address — deploy.js just needs a Vault, owned by and operated by the deployer's
// funded operator account, up front so populate.js and the server can both reference it.

const fs = require("fs");
const path = require("path");
const { ethers } = require("hardhat");

const DEPLOYMENTS_PATH = path.join(__dirname, "..", "..", "deployments", "deployed-addresses.json");

async function main() {
  const operatorAddress = process.env.OPERATOR_ADDRESS;
  if (!operatorAddress) {
    throw new Error("OPERATOR_ADDRESS is not set in contracts/.env (run network/generate-genesis.js first)");
  }

  const Vault = await ethers.getContractFactory("Vault");
  const vault = await Vault.deploy(operatorAddress);
  await vault.waitForDeployment();
  const vaultAddress = await vault.getAddress();
  console.log(`Vault deployed at ${vaultAddress} (operator: ${operatorAddress})`);

  fs.mkdirSync(path.dirname(DEPLOYMENTS_PATH), { recursive: true });
  const existing = fs.existsSync(DEPLOYMENTS_PATH)
    ? JSON.parse(fs.readFileSync(DEPLOYMENTS_PATH, "utf8"))
    : {};
  existing.vault = vaultAddress;
  existing.operator = operatorAddress;
  fs.writeFileSync(DEPLOYMENTS_PATH, JSON.stringify(existing, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
