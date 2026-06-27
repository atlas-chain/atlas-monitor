# Atlas Monitor Findings

This repo is for a live monitor of the deployed Atlas stack. Atlas is a
development spinoff of Arkiv, so lower-level protocol names such as `arkiv_*`
RPC methods and the Arkiv registry precompile are expected. Do not force a
rename unless a specific user-facing surface needs Atlas branding.

## Deployed Atlas Components

### Atlas RPC

- URL: `https://rpc.atlas.arkiv-global.net`
- Chain id: `42069`
- Useful monitor calls:
  - `eth_chainId`
  - `eth_getBlockByNumber`
  - `arkiv_getEntityCount`
  - `arkiv_getBlockTiming`
  - `arkiv_query`
- Health priority: the latest block timestamp must stay fresh.

### Atlas scanner

- UI URL: `https://scanner.atlas.arkiv-global.net`
- Head API: `https://scanner.atlas.arkiv-global.net/api/blocks?limit=1`
- Recent transaction API: `https://scanner.atlas.arkiv-global.net/api/transactions?limit=1`
- API shape for block head:
  - Response includes `names` and `blocks`.
  - The first block row contains `blockNumber`, `blockDate`,
    `blockTimeSeconds`, `baseBlockFeeWei`, `totalGasUsed`, and
    `transactionCount`.
- Health priority: scanner head must not fall behind Atlas RPC head.

### Payload provider

- URL: `https://payload.atlas.arkiv-global.net`
- Status endpoint: `GET /status`
- Health endpoint: `GET /healthz`
- Purpose: stores off-chain payload bytes and signs EIP-191 receipts used by
  reference-mode create/update operations.
- Monitor details:
  - payload count
  - total stored bytes
  - signing enabled
  - signer address
  - latest payload summaries

### Transaction decoder

- URL: `https://decoder.atlas.arkiv-global.net`
- Status endpoint: `GET /status`
- Decode endpoint: `POST /decode`
- Purpose: decodes registry `execute(Operation[])` calldata or signed
  transactions into human-readable entity operations.
- Monitor details:
  - service responsiveness
  - configured chain id
  - trusted provider signer list
  - interactive calldata paste area

### Faucet

- URL: `https://faucet.atlas.arkiv-global.net`
- Status endpoint: `GET /status`
- Health endpoint: `GET /healthz`
- Purpose: proof-of-work gated native-token faucet.
- Monitor details:
  - faucet address
  - drip amount
  - queue occupancy
  - proof-of-work difficulty
  - cooldown window

### Protocol planner

- No public Atlas planner/schedule hostname has been confirmed yet.
- The monitor supports `PLANNER_URL` / `ATLAS_PLANNER_URL` when one is deployed.

## Current Monitor Rules

- Chain and scanner are required health signals.
- Atlas RPC is healthy only when the latest block timestamp is fresh.
- Atlas scanner is healthy only when its latest indexed block is close to RPC
  head and recently timestamped.
- Payload provider, decoder, faucet, and optional planner are checked for
  responsiveness and surfaced with their status JSON.

## Product Direction

The monitor should feel like a live Atlas cockpit, not a static status page.
The first screen should show real stack state immediately:

- block pulse driven by Atlas RPC head
- scanner drift meter driven by scanner head versus RPC head
- kinetic entity counter from `arkiv_getEntityCount`
- service constellation for RPC, scanner, payload provider, decoder, and faucet
- compact service detail cards with raw status payloads
- decoder playground connected to the public decoder
- future scanner panels for gas, transactions, senders, and records
