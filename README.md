# Atlas Monitor

A live cockpit for the deployed Atlas stack. It watches the Atlas RPC head,
Atlas scanner lag, payload provider, decoder, faucet, and optional protocol
planner without needing an install step.

The first health rule is intentionally strict: chain and scanner freshness
matter most. Support services are treated as healthy when they respond, degraded
when slow, and down when unreachable.

## Run

```bash
npm run dev
```

or:

```bash
node server/index.js
```

Open `http://127.0.0.1:4177`.

The app has no runtime npm dependencies. It needs Node.js 20+ for native
`fetch`.

In the Codex desktop / WSL setup, the bundled Node runtime is Windows-native.
Use the helper so the server survives the launching shell:

```bash
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/start-dev.ps1
```

Stop it with:

```bash
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/stop-dev.ps1
```

## Docker

```bash
docker compose up --build
```

Open `http://127.0.0.1:4177`.

Published images are expected at:

```bash
docker pull ghcr.io/atlas-chain/atlas-monitor:main
```

## Configuration

Optional environment variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `APP_HOST` / `HOST` | `127.0.0.1` | HTTP bind host |
| `APP_PORT` / `PORT` | `4177` | HTTP bind port |
| `ATLAS_RPC_URL` | `https://rpc.atlas.arkiv-global.net` | Atlas RPC URL |
| `PAYLOAD_PROVIDER_URL` | `https://payload.atlas.arkiv-global.net` | Payload provider base URL |
| `DECODER_URL` | `https://decoder.atlas.arkiv-global.net` | Transaction decoder base URL |
| `ATLAS_SCANNER_URL` | `https://scanner.atlas.arkiv-global.net` | Atlas scanner UI URL |
| `ATLAS_SCANNER_API_URL` | `https://scanner.atlas.arkiv-global.net/api/blocks?limit=1` | Atlas scanner head API |
| `ATLAS_SCANNER_TRANSACTIONS_API_URL` | `https://scanner.atlas.arkiv-global.net/api/transactions?limit=1` | Atlas scanner latest transaction API |
| `ATLAS_FAUCET_URL` | `https://faucet.atlas.arkiv-global.net` | Atlas faucet URL |
| `PLANNER_URL` / `ATLAS_PLANNER_URL` | unset | Protocol planner base URL |
| `CHAIN_FRESH_SECONDS` | `16` | Healthy chain-head age threshold |
| `CHAIN_STALE_SECONDS` | `40` | Down chain-head age threshold |
| `SCANNER_FRESH_BLOCKS` | `4` | Healthy scanner lag threshold |
| `SCANNER_LAGGING_BLOCKS` | `24` | Down scanner lag threshold |

## Docs

- Initial deployment/component findings: [`docs/findings.md`](docs/findings.md)
- Missing deployment facts and follow-ups: [`TODO.md`](TODO.md)
