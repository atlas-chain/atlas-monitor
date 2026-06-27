# TODO

- Confirm the public Atlas scanner/explorer URL. The first monitor version can
  check Braga scanner freshness, but Atlas scanner freshness is marked unknown
  until `ATLAS_SCANNER_API_URL` is known.
- Confirm whether a public Atlas faucet exists separately from the Braga faucet.
- Confirm the production protocol planner/schedule URL. The monitor supports
  `PLANNER_URL` / `ATLAS_PLANNER_URL`, but no public value is known yet.
- Confirm the public JSON health/status path for the hosted Braga faucet. The
  current deployment serves the faucet UI at `/faucet/`, while `/faucet/status`
  and `/faucet/healthz` return 404.
- Decide whether scanner lag should be measured against Atlas RPC, Braga RPC, or
  both once the Atlas explorer URL exists.
- Add persisted history for head age, scanner lag, and service latency if the
  first live cockpit needs longer trend windows than the in-browser session.
