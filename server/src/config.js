const fs = require("fs");
const path = require("path");
require("dotenv").config();

const DEPLOYMENTS_PATH = path.join(__dirname, "..", "..", "deployments", "deployed-addresses.json");

function loadDeployments() {
  if (!fs.existsSync(DEPLOYMENTS_PATH)) {
    throw new Error(
      `${DEPLOYMENTS_PATH} not found. Deploy the Vault and run the populate script before starting the server.`
    );
  }
  return JSON.parse(fs.readFileSync(DEPLOYMENTS_PATH, "utf8"));
}

module.exports = {
  loadDeployments,
  RPC_URL: process.env.RPC_URL || "http://127.0.0.1:8545",
  CHAIN_ID: process.env.CHAIN_ID ? Number(process.env.CHAIN_ID) : 4218,
  OPERATOR_PRIVATE_KEY: process.env.OPERATOR_PRIVATE_KEY,
  PORT: process.env.PORT || 4000,
  UPLOADS_DIR: path.join(__dirname, "..", "uploads"),
};
