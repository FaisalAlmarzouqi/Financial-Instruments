# Architecture

## Overview

```
                         ┌─────────────────────────────────────────┐
                         │        Private network (Docker)          │
                         │  validator1 ── validator2 ── validator3  │
                         │        3-node Clique PoA, chain id 4218   │
                         └───────────────┬───────────────────────────┘
                                          │ JSON-RPC (http://127.0.0.1:8545)
                    ┌─────────────────────┼─────────────────────┐
                    │                     │                     │
            ┌───────▼───────┐     ┌───────▼───────┐     ┌───────▼───────┐
            │  Stablecoin    │     │ Shares (CLV,   │     │  BondIssuer    │
            │  (TRG, ERC20)  │     │ ROO — ERC20)   │     │  (GOV bonds)   │
            └────────────────┘     └────────────────┘     └────────────────┘
                    │                     │                     │
                    └──────────┬──────────┴──────────┬──────────┘
                                │   deposit/withdraw   │
                         ┌──────▼───────────────────────▼──────┐
                         │              Vault.sol                │
                         │  balances[user][token], bond custody  │
                         │  operateWithdrawal() — operator-only   │
                         └───────────────┬────────────────────────┘
                                          │ ethers.js (operator signer)
                         ┌────────────────▼────────────────┐
                         │             Server                │
                         │  Express API + SQLite (assets,    │
                         │  users, balances, orders, trades) │
                         │  matching engine (price-time)      │
                         └────────────────┬────────────────┘
                                          │ REST (fetch)
                         ┌────────────────▼────────────────┐
                         │            Frontend                │
                         │  React/Vite — Home, Asset, Portfolio,│
                         │  FAQ pages. ethers.js + MetaMask for │
                         │  wallet connect and on-chain deposits │
                         └───────────────────────────────────┘
```

## Custody model (hybrid: centralized matching, non-custodial-ish assets)

1. A user deposits an asset into the **Vault** contract directly from their own
   wallet (`approve` + `Vault.deposit`, or `approveBond` + `Vault.depositBond` for
   bonds). This is a normal on-chain transaction the user signs in MetaMask.
2. The frontend calls `POST /api/deposits/verify` with the deposit transaction hash.
   The server inspects the transaction's receipt for the Vault's `Deposit` /
   `BondDeposited` event and, once confirmed, credits the user's balance in its own
   SQLite ledger (`balances.available`).
3. Order placement and matching are database operations (fast, no gas, no
   block-time latency) — the server is the source of truth for who owns what
   "on platform" and what is reserved behind an open order. Whenever the
   matching engine fills a trade, the server immediately mirrors it on-chain
   with `Vault.operatorTransfer` (or `operatorTransferBond`), reassigning Vault
   custody from seller to buyer so the two ledgers never drift apart — without
   this step, a buyer's DB balance would say they own something the Vault
   never actually reassigned to them, and withdrawing it would revert.
4. Withdrawing moves funds back on-chain: the server checks the user's DB
   `available` balance (which is only non-zero when nothing is reserved behind an
   open order) and, if sufficient, calls `Vault.operateWithdrawal` (or
   `withdrawBond`) using the platform's operator key. This is the only address
   that can move funds out of the Vault.

This means the Vault always custodies exactly what the DB ledger says it should
— the DB and the chain are kept in sync at the deposit and withdrawal boundaries,
while everything in between (trading) is off-chain for speed.

## Why a private Clique PoA network via Docker

The spec requires a minimum of 3 validating nodes with a deployment script. This
project uses go-ethereum's Clique proof-of-authority consensus running as 3
containers (`network/docker-compose.yml`), rather than a bare `geth` install,
so the network requires no host dependency beyond Docker. `network/generate-genesis.js`
creates the 3 validators' keys and the genesis block; `network/start-network.js`
brings the network up and waits until all 3 nodes are online and sealing blocks
in rotation.

## Matching engine

Limit orders rest in the `orders` table; a market order walks the resting
opposite-side limit orders in price-time priority (best price first, oldest
first among ties) until it is filled or the book is exhausted. Each fill inserts
a `trades` row (which is what price-history charts read) and updates both
parties' `available`/`reserved` balances atomically in one SQLite transaction.
Limit orders do not automatically cross each other (a resting limit order stays
resting even if a better-priced order later arrives) — only a market order
triggers matching. This keeps the trade-execution model simple and matches the
project's example walkthrough (a resting sell order gets filled by a market buy).

## Simplifications explicitly out of scope

- The Vault uses a single trusted operator key rather than the spec's optional
  on-chain order-locking / multi-sig scheme.
- Bonds are a custom struct-based contract, not ERC721.
- No order-cancellation UI and no dedicated bond-repayment screen (contract-level
  `repay()` is implemented and unit-tested, just not wired to a page).
