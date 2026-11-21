# Model Lab — Hosting decision + Phase 1

## Hosting decision (spec section 2)
Lovable can host the website, database, logins, file storage, live updates and short server tasks. It **cannot** run a persistent Python process (pandas/numpy, sandboxed model execution, long backtests, always-on market-data WebSocket). Server code here runs on short-lived edge workers (JavaScript only).

So, per rule 2 of the spec: everything stays in Lovable, plus **one external Python container** (the Engine) in `/engine` (FastAPI, Dockerfile, health check, deploy guide for e.g. Fly.io / Railway / Render). The Engine is built in Phase 4; Phase 1 only prepares the connection points.

```text
Browser ──> Lovable app (React) ──> engine-proxy (server fn, auth-checked) ──> Python Engine
                 │                                                           │
                 └──────── Lovable Cloud (Postgres, Auth, Storage, Realtime) ┘
```

## Phase 1 scope (this build)
1. **Enable Lovable Cloud.**
2. **Single admin login**: email + password, no sign-up page, public sign-ups disabled. You'll create the admin account once (I'll seed the first sign-in, then lock registration).
3. **Dark terminal design**: near-black background, monospace numbers (JetBrains Mono), IBM Plex Sans text, green/red for PnL, dense tables.
4. **Layout**: left sidebar (Dashboard, Data, Models, Backtests, Prop Profiles, Live, Settings); top bar with Engine health, RealMarketAPI health, UTC clock, New York clock, active-deployment indicator. Health shows "Not configured" honestly until the Engine exists.
5. **Full database schema** from section 6: instruments, datasets, data_import_batches, data_import_files, import_rejections, market_bars, models, model_versions (immutable), prop_profiles, backtest_runs, backtest_trades, backtest_daily, live_deployments, live_trades, live_equity, live_events, engine_logs, jobs, audit_log, symbol_mappings — with user_id, RLS (owner-only), grants, indexes, unique (dataset_id, ts_utc).
6. **Reusable components**: MetricCard, DataTable (sorting + CSV export), EquityCurve, DrawdownChart, CoverageHeatmap, StatusIndicator, ImportProgress, ValidationResult, TradesTable, DatasetSelector.
7. **Pages with real empty states** reading from the database (no fake data; a single dev flag for labeled mock data on the Dashboard only, off by default).
8. **engine-proxy** server function stub: verifies the signed-in admin, returns "Engine not configured" until ENGINE_URL / ENGINE_TOKEN secrets are added.

Checkpoint: admin signs in and navigates all pages.

## Later phases (separate approvals)
2 CSV Data Manager · 3 RealMarketAPI (needs your API key) · 4 Python Engine + model contract · 5 Backtesting · 6 Prop simulator · 7 Live paper trading · 8 Hardening.

## Technical notes
- TanStack routes under `_authenticated/` layout; login at `/login`; `/` redirects to `/dashboard`.
- Charts via recharts; tables via @tanstack/react-table.
- Bulk market_bars inserts will be done by the Engine with a service credential (Phase 2/4); a `market_bars` partition/index strategy is set now.
- Record architecture rules in AGENTS.md.
