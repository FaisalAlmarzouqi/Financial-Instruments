# Smart Contract Reference

## Stablecoin.sol
`ERC20`, `ERC20Burnable`, `Ownable`. 18 decimals.

| Function | Access | Description |
|---|---|---|
| `constructor(name, symbol, initialSupply)` | — | Mints `initialSupply` to the deployer (issuer). |
| `mint(address to, uint256 amount)` | issuer only | Issue new units. |
| `burn(uint256 amount)` / `burnFrom(address, uint256)` | holder (inherited) | Remove units — the issuer holds the full supply at deployment, so this is how the issuer removes units. |

## Shares.sol
`ERC20`, `Ownable`. One deployment per company.

| Function | Access | Description |
|---|---|---|
| `constructor(name, symbol, totalShares, stablecoinAddress)` | — | Mints `totalShares` to the deployer (issuer). |
| `payDividend(uint256 amount)` | issuer only | Pulls `amount` stablecoin from the issuer and splits it across all current holders proportional to their balance, via an accumulator (`accDividendPerShare`) that stays correct across transfers made between payouts. |
| `withdrawableDividend(address account) view` | anyone | Stablecoin currently owed to `account` but not yet claimed. |
| `withdrawDividend()` | holder | Claims all stablecoin owed to the caller. |

## BondIssuer.sol
One deployment per bond issuer (e.g. "GOV"). Holds a `Bond` struct per serial number.

```solidity
struct Bond {
  uint256 serialNumber;
  uint256 principal;
  uint256 interestRateBps; // 1000 = 10.00%
  uint256 issuanceDate;
  uint256 maturityDate;    // issuanceDate + 365 days
  address owner;
  bool repaid;
}
```

| Function | Access | Description |
|---|---|---|
| `constructor(stablecoinAddress)` | — | — |
| `issueBonds(uint256 count, uint256 principal, uint256 interestRateBps)` | issuer only | Mints `count` new bonds, all owned by the issuer, maturing in 1 year. |
| `transferBond(uint256 serial, address to)` | current bond owner | Direct transfer (used by the populate script). |
| `approveBond(uint256 serial, address spender)` | current bond owner | Authorize `spender` to move this bond, mirroring ERC20 `approve`. |
| `transferBondFrom(uint256 serial, address from, address to)` | the approved spender | Mirrors ERC20 `transferFrom` — used by the Vault to pull a deposited bond. |
| `repay(uint256 serial)` | anyone (issuer must have the funds/allowance) | At/after maturity, pays principal + interest to the current owner from the issuer's stablecoin balance. Reverts before maturity or if already repaid. |
| `getBond(uint256 serial) view` | anyone | Full bond struct. |
| `bondsOf(address account) view` | anyone | Serial numbers currently owned by `account`. |

## Vault.sol
Single custody contract for the whole platform. `Ownable` (deployer can change the
operator); a separate `operator` address (the server's key) is the only one that
can pay funds back out.

| Function | Access | Description |
|---|---|---|
| `constructor(address operator_)` | — | — |
| `deposit(address token, uint256 amount)` | any depositor (after `approve`) | Pulls `amount` of an ERC20 asset into the Vault, credits `balances[msg.sender][token]`. Emits `Deposit`. |
| `depositBond(address bondContract, uint256 serial)` | any depositor (after `BondIssuer.approveBond`) | Pulls one bond into the Vault's custody for the caller. Emits `BondDeposited`. |
| `operateWithdrawal(address user, address token, uint256 amount)` | operator only | Pays `amount` of `token` to `user`. Reverts if `user`'s tracked balance is insufficient. Emits `Withdrawal`. |
| `withdrawBond(address user, address bondContract, uint256 serial)` | operator only | Returns a custodied bond to `user`. Emits `BondWithdrawn`. |
| `operatorTransfer(address from, address to, address token, uint256 amount)` | operator only | Reassigns Vault-internal custody of an ERC20 asset from one user to another, with no external token movement. This is how the server settles an off-chain-matched trade on-chain, keeping the Vault in sync with the DB after every fill. Emits `TradeSettled`. |
| `operatorTransferBond(address from, address to, address bondContract, uint256 serial)` | operator only | Same, for one bond. Emits `BondTradeSettled`. |
| `bondsInCustody(address user, address bondContract) view` | anyone | Which bond serials the Vault currently holds on `user`'s behalf. |
| `setOperator(address newOperator)` | contract owner | Rotate the operator key. |

**Security model**: on-chain, `operateWithdrawal`'s balance check is what
guarantees a user can never be paid out more than they deposited. The "no
pending orders" requirement from the spec is enforced off-chain: the server only
calls `operateWithdrawal`/`withdrawBond` for the portion of a user's balance
that is `available` (not `reserved` behind an open order) in its own database.
