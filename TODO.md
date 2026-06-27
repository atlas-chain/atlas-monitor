# TODO

- Confirm whether a public protocol planner/schedule service is deployed for
  Atlas. The monitor supports `PLANNER_URL` / `ATLAS_PLANNER_URL`, but no public
  hostname was found during the current sweep.
- Decide whether the scanner card should include deeper Atlas scanner views such
  as gas histograms, recent transactions, sender activity, and record
  transactions from the scanner API.
- Add persisted history for Atlas head age, scanner lag, and service latency if
  the cockpit needs longer trend windows than the in-browser session.
