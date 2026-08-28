# Server API Reference

Base URL: `http://localhost:4000/api`. All bodies/responses are JSON unless noted.

## Config

### `GET /config`
Returns chain config the frontend needs for on-chain calls.
```json
{ "vaultAddress": "0x...", "rpcUrl": "http://127.0.0.1:8545", "chainId": 4218 }
```

## Assets

### `GET /assets`
List all assets with their current price (last trade price, or the default price
if never traded).

### `GET /assets/:symbol`
One asset's detail, plus `bestAsk` (lowest resting sell price — the market buy
price) and `bestBid` (highest resting buy price — the market sell price).

### `GET /assets/:symbol/price-history`
Ordered list of `{ price, quantity, executed_at }` trade points. If the asset has
never traded, returns two synthetic points at its default price (a flat line).

## Users

### `GET /users/:wallet`
`404` if the wallet has not registered yet; otherwise `{ walletAddress, legalName, registeredAt }`.

### `POST /users/register`  (multipart/form-data)
Fields: `walletAddress`, `legalName`, `passportImage` (file). Creates the user
record; `409` if the wallet is already registered.

## Portfolio

### `GET /portfolio/:wallet`
```json
{
  "registered": true,
  "portfolio": [
    { "symbol": "TRG", "name": "Triangle", "type": "stablecoin",
      "onPlatform": 0, "onPlatformAvailable": 0, "onChain": 200, "totalAvailable": 200 }
  ]
}
```
`onPlatform` = DB-tracked available + reserved. `onChain` is read live from the
asset's contract (or, for bonds, the count of bonds the Vault currently custodies
for that wallet, via `bondsOf`/on-chain ownership). `totalAvailable` is the sum —
matches the project's example portfolio table.

## Orders

### `GET /orders?symbol=CLV`
Open/partially-filled resting orders for one tradable asset (shares or bonds —
not TRG itself).

### `POST /orders`  (place a resting limit order)
```json
{ "walletAddress": "0x...", "symbol": "CLV", "side": "sell", "quantity": 10, "price": 9 }
```
Reserves the offered side's balance (the asset if selling, `quantity*price` TRG
if buying) from `available` into `reserved`. `400` if the wallet doesn't have
enough on-platform balance (i.e. hasn't deposited enough into the Vault yet).

### `POST /orders/market`  (execute immediately against the book)
```json
{ "walletAddress": "0x...", "symbol": "CLV", "side": "buy", "quantity": 10 }
```
Matches against resting opposite-side limit orders in price-time priority,
updates DB balances, then mirrors each fill on-chain via
`Vault.operatorTransfer`/`operatorTransferBond` (seller → buyer for the asset,
buyer → seller for TRG) so Vault custody stays in sync with the DB. Returns
`{ orderId, filled, remaining, trades: [...] }`.

## Deposits

### `POST /deposits/verify`
```json
{ "walletAddress": "0x...", "symbol": "CLV", "txHash": "0x..." }
```
Looks up the transaction's receipt, confirms it emitted the Vault's `Deposit` (or
`BondDeposited`) event for that wallet, and credits the DB `available` balance.
Idempotent per `txHash` — replaying the same hash returns `409`.

## Withdrawals

### `POST /withdrawals`
```json
{ "walletAddress": "0x...", "symbol": "CLV", "amount": 10 }
```
Checks the wallet's DB `available` balance covers `amount` (this is the
"sufficient funds and no pending orders" check — reserved funds behind an open
order are never in `available`), then calls `Vault.operateWithdrawal` (or, for a
bond asset, `Vault.withdrawBond` once per unit, looking up which serials the
Vault currently custodies for that wallet) using the server's operator key.
Decrements the DB balance only after the on-chain call succeeds.
