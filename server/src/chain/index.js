const { ethers } = require("ethers");
const { RPC_URL, OPERATOR_PRIVATE_KEY, loadDeployments } = require("../config");

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
];

const VAULT_ABI = [
  "function operateWithdrawal(address user, address token, uint256 amount)",
  "function withdrawBond(address user, address bondContract, uint256 serial)",
  "function operatorTransfer(address from, address to, address token, uint256 amount)",
  "function operatorTransferBond(address from, address to, address bondContract, uint256 serial)",
  "function balances(address user, address token) view returns (uint256)",
  "function bondsInCustody(address user, address bondContract) view returns (uint256[])",
  "event Deposit(address indexed user, address indexed token, uint256 amount)",
  "event BondDeposited(address indexed user, address indexed bondContract, uint256 serial)",
];

const BOND_ISSUER_ABI = [
  "function getBond(uint256 serial) view returns (tuple(uint256 serialNumber, uint256 principal, uint256 interestRateBps, uint256 issuanceDate, uint256 maturityDate, address owner, bool repaid))",
  "function bondsOf(address account) view returns (uint256[])",
];

const provider = new ethers.JsonRpcProvider(RPC_URL);
const deployments = loadDeployments();

if (!OPERATOR_PRIVATE_KEY) {
  throw new Error("OPERATOR_PRIVATE_KEY is not set in server/.env (run network/generate-genesis.js first)");
}
const operatorWallet = new ethers.Wallet(OPERATOR_PRIVATE_KEY, provider);

const vault = new ethers.Contract(deployments.vault, VAULT_ABI, operatorWallet);

function erc20(address) {
  return new ethers.Contract(address, ERC20_ABI, provider);
}

function bondIssuer(address) {
  return new ethers.Contract(address, BOND_ISSUER_ABI, provider);
}

async function getOnChainBalance(assetType, contractAddress, walletAddress) {
  if (assetType === "bond") {
    const serials = await bondIssuer(contractAddress).bondsOf(walletAddress);
    return serials.length; // "units" of a bond asset = number of bonds owned
  }
  const raw = await erc20(contractAddress).balanceOf(walletAddress);
  return Number(ethers.formatEther(raw));
}

/// Verifies a deposit transaction actually sent `expectedAmount` of `assetType`
/// from `expectedUser` into the Vault, by inspecting the transaction's logs.
async function verifyDepositTx(txHash, expectedUser, assetType) {
  const receipt = await provider.getTransactionReceipt(txHash);
  if (!receipt || receipt.status !== 1) return null;

  const vaultAddress = deployments.vault.toLowerCase();
  const iface = new ethers.Interface(VAULT_ABI);

  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== vaultAddress) continue;
    let parsed;
    try {
      parsed = iface.parseLog(log);
    } catch {
      continue;
    }
    if (assetType === "bond" && parsed.name === "BondDeposited") {
      if (parsed.args.user.toLowerCase() !== expectedUser.toLowerCase()) continue;
      return { serial: Number(parsed.args.serial), bondContract: parsed.args.bondContract };
    }
    if (assetType !== "bond" && parsed.name === "Deposit") {
      if (parsed.args.user.toLowerCase() !== expectedUser.toLowerCase()) continue;
      return { token: parsed.args.token, amount: Number(ethers.formatEther(parsed.args.amount)) };
    }
  }
  return null;
}

async function operateWithdrawal(userAddress, tokenAddress, amount) {
  const tx = await vault.operateWithdrawal(userAddress, tokenAddress, ethers.parseEther(String(amount)), {
    gasPrice: 0,
  });
  return tx.wait();
}

async function withdrawBond(userAddress, bondContractAddress, serial) {
  const tx = await vault.withdrawBond(userAddress, bondContractAddress, serial, { gasPrice: 0 });
  return tx.wait();
}

async function bondsInVaultCustody(userAddress, bondContractAddress) {
  const serials = await vault.bondsInCustody(userAddress, bondContractAddress);
  return serials.map(Number);
}

/// Reassigns Vault custody of an ERC20 asset from one user to another, on-chain,
/// mirroring a trade the matching engine just settled in the DB. Must run after the
/// DB transaction commits (this is not itself DB-transactional).
async function settleErc20Trade(fromAddress, toAddress, tokenAddress, amount) {
  const tx = await vault.operatorTransfer(fromAddress, toAddress, tokenAddress, ethers.parseEther(String(amount)), {
    gasPrice: 0,
  });
  return tx.wait();
}

/// Same, for `count` bonds of one bond contract — picks whichever serials the seller
/// currently has in Vault custody.
async function settleBondTrade(fromAddress, toAddress, bondContractAddress, count) {
  const serials = await bondsInVaultCustody(fromAddress, bondContractAddress);
  if (serials.length < count) {
    throw new Error("Vault custody out of sync with DB: not enough bonds to settle trade");
  }
  const receipts = [];
  for (let i = 0; i < count; i++) {
    const tx = await vault.operatorTransferBond(fromAddress, toAddress, bondContractAddress, serials[i], {
      gasPrice: 0,
    });
    receipts.push(await tx.wait());
  }
  return receipts;
}

module.exports = {
  provider,
  deployments,
  erc20,
  bondIssuer,
  getOnChainBalance,
  verifyDepositTx,
  operateWithdrawal,
  withdrawBond,
  bondsInVaultCustody,
  settleErc20Trade,
  settleBondTrade,
};
