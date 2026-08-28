import { BrowserProvider, Contract, parseEther } from "ethers";

export const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
];

export const VAULT_ABI = [
  "function deposit(address token, uint256 amount)",
  "function depositBond(address bondContract, uint256 serial)",
];

export const BOND_ISSUER_ABI = [
  "function approveBond(uint256 serial, address spender)",
  "function bondsOf(address account) view returns (uint256[])",
];

export function getBrowserProvider() {
  if (!window.ethereum) throw new Error("No wallet found. Install MetaMask to continue.");
  return new BrowserProvider(window.ethereum);
}

export async function getSigner() {
  const provider = getBrowserProvider();
  return provider.getSigner();
}

/// Approves and deposits `amount` of an ERC20 asset into the Vault, returning the
/// deposit transaction's hash (what /api/deposits/verify checks on-chain).
export async function depositErc20(signer, tokenAddress, vaultAddress, amount) {
  const token = new Contract(tokenAddress, ERC20_ABI, signer);
  const vault = new Contract(vaultAddress, VAULT_ABI, signer);
  const wei = parseEther(String(amount));

  const approveTx = await token.approve(vaultAddress, wei, { gasPrice: 0 });
  await approveTx.wait();

  const depositTx = await vault.deposit(tokenAddress, wei, { gasPrice: 0 });
  const receipt = await depositTx.wait();
  return receipt.hash;
}

/// Approves and deposits one bond (by serial) into the Vault.
export async function depositBond(signer, bondContractAddress, vaultAddress, serial) {
  const bondIssuer = new Contract(bondContractAddress, BOND_ISSUER_ABI, signer);
  const vault = new Contract(vaultAddress, VAULT_ABI, signer);

  const approveTx = await bondIssuer.approveBond(serial, vaultAddress, { gasPrice: 0 });
  await approveTx.wait();

  const depositTx = await vault.depositBond(bondContractAddress, serial, { gasPrice: 0 });
  const receipt = await depositTx.wait();
  return receipt.hash;
}

export async function firstOwnedBondSerial(signer, bondContractAddress, ownerAddress) {
  const bondIssuer = new Contract(bondContractAddress, BOND_ISSUER_ABI, signer);
  const serials = await bondIssuer.bondsOf(ownerAddress);
  if (serials.length === 0) throw new Error("No bonds available to deposit");
  return Number(serials[0]);
}
