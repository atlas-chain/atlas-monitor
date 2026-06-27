# Atlas Monitor

A live cockpit for Atlas and Arkiv network components. It watches the chain
head, scanner lag, payload provider, decoder, faucet, and optional protocol
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

## Configuration

Optional environment variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `APP_HOST` / `HOST` | `127.0.0.1` | HTTP bind host |
| `APP_PORT` / `PORT` | `4177` | HTTP bind port |
| `PAYLOAD_PROVIDER_URL` | `https://payload.atlas.arkiv-global.net` | Payload provider base URL |
| `DECODER_URL` | `https://decoder.atlas.arkiv-global.net` | Transaction decoder base URL |
| `ATLAS_SCANNER_URL` | unset | Atlas explorer UI URL |
| `ATLAS_SCANNER_API_URL` | unset | Atlas explorer API URL |
| `ATLAS_FAUCET_URL` | unset | Atlas faucet URL |
| `PLANNER_URL` / `ATLAS_PLANNER_URL` | unset | Protocol planner base URL |
| `CHAIN_FRESH_SECONDS` | `16` | Healthy chain-head age threshold |
| `CHAIN_STALE_SECONDS` | `40` | Down chain-head age threshold |
| `SCANNER_FRESH_BLOCKS` | `4` | Healthy scanner lag threshold |
| `SCANNER_LAGGING_BLOCKS` | `24` | Down scanner lag threshold |

## Docs

- Initial deployment/component findings: [`docs/findings.md`](docs/findings.md)
- Missing deployment facts and follow-ups: [`TODO.md`](TODO.md)
