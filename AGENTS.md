<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

## Architecture rules (Model Lab)
- All numeric/trading computation (CSV parsing, model execution, backtests, live paper worker, prop simulation) runs in one external Python FastAPI Engine under `/engine`; Lovable server code is short-lived JS workers and cannot host it.
- The browser reaches the Engine only through authenticated server functions (`src/lib/engine.functions.ts`, `src/lib/imports.functions.ts`); ENGINE_URL, ENGINE_TOKEN and REALMARKETAPI_KEY stay server-side secrets.
- The Engine holds no database credentials: it writes through `src/routes/api/public/engine.$.ts`, authenticated with ENGINE_TOKEN and scoped to the user_id the proxy sent, because Lovable Cloud's service key cannot leave the app.
- CSV files upload to the private `imports` bucket under `<user_id>/`; the Engine receives short-lived signed URLs. Append/replace imports create a new dataset version (copy via `copy_dataset_bars`) instead of mutating old ones.
- Every app table carries `user_id` with owner-only RLS; datasets, market_bars and model_versions are immutable (DB triggers) so backtests stay reproducible.
- Signed-in pages live under `src/routes/_authenticated/` (client-only gate, shell in `src/components/lab/AppShell.tsx`); public sign-up is disabled, sign-in is at `/login`.
- Never place real orders; all live positions are simulated.
- Seal model versions and validation/job results behind authenticated server writes and Engine callbacks; browser grants are read-only so a forged validation cannot authorize a paper deployment.
- Use one shared closed-bar execution module for contract-v1 backtests and paper trades; preserve the exact-hash uploaded ORB through an explicitly labelled research-only legacy adapter instead of changing its trading rules.
- Execute untrusted model code only in a secret-free subprocess with seccomp default-deny and CPU/memory/time limits; fail closed when syscall isolation is unavailable.
- Store asynchronous validation and simulation outcomes in owner-scoped jobs; do not change immutable model code or invent acceptance passes for missing golden/DST fixtures.
- Map durable job kinds to advertised Engine capabilities explicitly; the backtest job uses the backtests capability so a healthy Engine is not falsely rejected.
