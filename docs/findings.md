# Atlas Monitor Findings

This repo is intended to become a fun, interactive monitor for the Atlas
network and its supporting services. Atlas is a development spinoff of Arkiv,
so Arkiv names are expected in lower-level protocol surfaces, RPC names,
precompile interfaces, and inherited docs. Do not force a rename unless a
specific user-facing surface needs Atlas branding.

## Known Components And URLs

### Atlas execution node

- Public RPC: `https://rpc.atlas.arkiv-global.net`
- Local dev RPC: `http://127.0.0.1:8545`
- Local dev WebSocket: `ws://127.0.0.1:8546`
- Protocol-facing surface:
  - Standard Ethereum JSON-RPC.
  - Arkiv/Atlas extension RPC namespace: `arkiv_*`.
  - Native registry precompile at `0x4400000000000000000000000000000000000044`.
- Useful calls for a monitor:
  - `eth_chainId`
  - `eth_blockNumber`
  - `eth_getBlockByNumber`
  - `arkiv_getEntityCount`
  - `arkiv_getBlockTiming`
  - `arkiv_query`

### Payload provider

- Public URL: `https://payload.atlas.arkiv-global.net`
- Local default: `http://127.0.0.1:28883`
- Purpose: stores off-chain payload bytes, returns content-addressed metadata,
  and optionally signs EIP-191 receipts used by reference-mode create/update
  operations.
- Endpoints:
  - `GET /healthz`
  - `GET /status`
  - `POST /payloads`
  - `POST /arkiv/payloads`
  - `GET /payloads/{id}`
  - `GET /payloads/{id}/signature`
  - `GET /payloads/{id}/raw`
- Monitor opportunities:
  - payload count
  - total stored bytes
  - signing enabled
  - signer address
  - latest payload summaries
  - sample payload fetch/checksum verification

### Transaction decoder

- Public URL: `https://decoder.atlas.arkiv-global.net`
- Local default: `http://127.0.0.1:28884`
- Purpose: decodes registry `execute(Operation[])` calldata or signed
  transactions into human-readable entity operations. For payload-reference
  create/update operations, it verifies the embedded provider receipt offline
  against trusted signer rules.
- Endpoints:
  - `GET /`
  - `GET /healthz`
  - `GET /status`
  - `POST /decode`
  - `GET /decode?data=0x...&chainId=...`
- Monitor opportunities:
  - service liveness
  - configured chain id
  - trusted provider signer list
  - interactive calldata paste/drop zone
  - decoded operation timeline
  - payload-reference verification badge

### Hardfork / protocol schedule planner

- Local default: `http://127.0.0.1:28882`
- Atlas schedule path: `http://<planner-host>:28882/atlas-protocol-schedule.json`
- Generic inherited Arkiv schedule path: `/arkiv-protocol-schedule.json`
- Node env var: `ARKIV_PROTOCOL_SCHEDULE_URL=<schedule-url>`
- Purpose: publishes protocol schedule JSON for EIP-1559-related chain
  parameters and payload-builder gas-limit caps.
- Endpoints:
  - `GET /healthz`
  - `GET /status`
  - `GET /atlas-protocol-schedule.json`
- Monitor opportunities:
  - current schedule version
  - current block gate
  - next activation block
  - min base fee, elasticity, base fee denominator, max gas limit
  - visible countdown from current head to next scheduled activation

### Faucet

- Braga public faucet: `https://braga.hoodi.arkiv.network/faucet/`
- Local default: `http://127.0.0.1:28884`
- Purpose: proof-of-work gated native-token faucet.
- Endpoints:
  - `GET /healthz`
  - `GET /status`
  - `GET /api/challenge?address=0x...`
  - `POST /api/claim`
- Monitor opportunities:
  - faucet balance
  - queue occupancy
  - configured drip amount
  - proof-of-work difficulty
  - cooldown window
  - recent claim status if exposed later

### Braga testnet

- RPC: `https://braga.hoodi.arkiv.network/rpc`
- Explorer: `https://explorer.braga.hoodi.arkiv.network`
- Explorer API: `https://explorer.braga.hoodi.arkiv.network/api`
- Faucet: `https://braga.hoodi.arkiv.network/faucet/`

### Atlas SDK chain config

- Atlas chain id: `42069`
- Atlas RPC: `https://rpc.atlas.arkiv-global.net`
- Local chain id: `1337`
- Local RPC: `http://127.0.0.1:8545`
- Braga chain id: `60138453102`
- Braga RPC: `https://braga.hoodi.arkiv.network/rpc`

## Port Collisions To Remember

`atlas-faucet` and `atlas-transaction-decoder` both default to `28884`. In a
single-host deployment, run them on different host ports or route by hostname
behind a reverse proxy.

## Product Direction

The monitor should feel like a live network cockpit, not a static status page.
The first screen should show the actual system state immediately.

Ideas worth exploring:

- A live block pulse driven by `eth_blockNumber` and `arkiv_getBlockTiming`.
- Entity count as a kinetic counter, with recent movement emphasized.
- Service constellation view: RPC, payload provider, decoder, planner, faucet,
  explorer.
- Per-service cards that are compact but interactive: expand to show raw
  `/status`, latency history, and last error.
- A transaction decoder playground connected to the public decoder.
- Payload-reference inspector: paste an entity/payload reference and show
  provider, checksum, signature, trust verdict, and raw payload availability.
- Schedule timeline: current protocol parameters, next activation, and
  countdown in blocks/time.
- Braga/dev mode switch so the same UI can point at public testnet or local
  development services.
- WebSocket or polling-driven "network weather": healthy, degraded, stalled,
  schedule mismatch, payload signer mismatch, faucet dry, etc.

## Initial Data Model Sketch

```ts
type ServiceStatus = {
  id: "rpc" | "payload" | "decoder" | "planner" | "faucet" | "explorer"
  label: string
  url: string
  ok: boolean
  latencyMs?: number
  checkedAt: string
  details?: unknown
  error?: string
}

type ChainSnapshot = {
  chainId: number
  blockNumber: bigint
  blockTimestamp?: number
  secondsSinceParent?: number
  entityCount?: bigint
  gasPriceWei?: bigint
}

type ProtocolScheduleSnapshot = {
  chainId: number
  version: number
  currentBlock?: number
  activeEntry: {
    activationBlock: number
    minBaseFeePerGas: string
    elasticityMultiplier: number
    baseFeeMaxChangeDenominator: number
    maxBlockGasLimit: string
  }
  nextEntry?: unknown
}
```

## Open Questions

- What public URL should the Atlas protocol schedule use in production?
- Is there a public Atlas faucet distinct from the Braga faucet?
- Should the monitor be read-only, or should it include admin-only planner
  controls later?
- Should the monitor call public services directly from the browser, or should
  it use a backend aggregator to avoid CORS, rate-limit, and secret-handling
  issues?
- Do we want historical charts persisted locally, or is "current live state"
  enough for the first version?

