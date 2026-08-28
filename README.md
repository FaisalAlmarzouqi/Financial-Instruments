# Triangle — International Settlement Platform

A private blockchain network plus a marketplace for tokenized financial
instruments: a stablecoin (TRG), company shares (CLV, ROO) and government bonds
(GOV). See [docs/architecture.md](docs/architecture.md) for how the pieces fit
together, [docs/api-reference.md](docs/api-reference.md) for the server's API,
and [docs/contracts-reference.md](docs/contracts-reference.md) for every smart
contract function.

## Prerequisites

- [Node.js](https://nodejs.org) 22+ (built-in `node:sqlite` is used by the
  server — no native build tools needed)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (running)
- MetaMask (or another injected-wallet browser extension) to use the frontend

## Launch instructions

Run these from the repository root, in order.

### 1. Install dependencies
```bash
npm install
```
This installs the root, `contracts`, `server` and `frontend` workspaces together.

### 2. Start the private network
```bash
npm run network:start
```
First run generates 3 validator identities and a genesis block
(`network/generate-genesis.js`, writing `contracts/.env` and `server/.env`),
then brings up 3 Clique PoA validator nodes in Docker and waits until all 3 are
online and sealing blocks. RPC endpoints: `http://127.0.0.1:8545` (validator1,
the one everything else talks to), `:8546`, `:8547`.

To stop it later: `npm run network:stop` (chain data persists under
`network/data/` — delete that folder for a clean restart).

### 3. Deploy the Vault contract
```bash
npm run contracts:deploy
```

### 4. Populate the platform
```bash
npm run populate
```
Deploys TRG (4000 units), CLV and ROO (100 shares each), and GOV (20 bonds,
principal 200, 10% interest) — each from its own address — then interactively
asks for **Aya**'s and **Beatriz**'s Ethereum addresses (any address you
control in MetaMask) and transfers:
- Aya: 200 TRG, 10 CLV, 2 GOV bonds
- Beatriz: 150 TRG, 20 ROO, 5 GOV bonds

Writes `deployments/deployed-addresses.json`, which the server reads on startup.

> For scripted/non-interactive runs, set `AYA_ADDRESS` and `BEATRIZ_ADDRESS` env
> vars instead of typing them at the prompt.

### 5. Start the server
```bash
npm run server:dev
```
Seeds its SQLite database (`server/data/platform.sqlite`) from the deployments
file and listens on `http://localhost:4000`.

### 6. Start the frontend
```bash
npm run frontend:dev
```
Opens on `http://localhost:5173` (proxies `/api` and `/uploads` to the server).

### 7. Connect MetaMask to the private network
Add a custom network in MetaMask: RPC URL `http://127.0.0.1:8545`, chain ID
`4218`. Import Aya's and/or Beatriz's private key (whichever address you used
in step 4) to trade as them, or connect any funded address.

## Grading walkthrough

1. Open `http://localhost:5173`, click **Connect Wallet**, approve in MetaMask.
   First connection for an address prompts for a legal name + passport picture.
2. Go to **Portfolio** — Aya's/Beatriz's balances from step 4 should be visible
   (combining their on-chain wallet balance and whatever they've deposited to
   the platform).
3. As Aya: open the **CLV** asset page, choose **Sell**, **Limit order**, enter
   quantity `10` and price `9`, submit. MetaMask will prompt an `approve` then a
   `deposit` transaction into the Vault; once confirmed, the order appears in
   the order book.
4. Switch MetaMask to Beatriz, reload the CLV asset page — the **Buy / Market
   price** tab should show the best available price is `9` TRG (Aya's resting
   order). Enter quantity `10` and submit; MetaMask will prompt a TRG
   approve+deposit (if Beatriz hasn't already got 90+ TRG on the platform) then
   the market order executes.
5. Beatriz's Portfolio should now show `60` TRG and `10` CLV on-platform, with a
   **Withdraw** button next to CLV.
6. Click **Withdraw** on CLV — MetaMask prompts one more transaction; once
   confirmed, Beatriz's "total available" CLV column reflects the 10 CLV are
   back in her own wallet.

## Project layout

```
network/      3-node Clique PoA private network (Docker Compose)
contracts/    Hardhat project: Stablecoin, Shares, BondIssuer, Vault + tests
              + scripts/deploy.js (Vault) and scripts/populate.js (assets)
server/       Express API + SQLite (assets, users, balances, orders, trades)
              + the price-time-priority matching engine
frontend/     React (Vite) — Home, Asset, Portfolio, FAQ pages
deployments/  deployed-addresses.json — written by deploy/populate, read by the server
docs/         architecture, API reference, contract reference
```

## Running the contract tests
```bash
npm run contracts:test
```
