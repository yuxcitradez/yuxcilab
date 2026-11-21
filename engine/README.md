# Model Lab Engine

Python FastAPI service for CSV imports, isolated Python validation, backtests, prop simulations and guarded live paper workers.
It holds **no database credentials**: every write goes to the app's callback route `/api/public/engine/*`, authenticated with the shared `ENGINE_TOKEN`.

## Deploy on Render
1. Push this repo to GitHub (Lovable → GitHub sync).
2. Render → New → Blueprint → pick the repo (uses `engine/render.yaml`), or New → Web Service → Docker with root directory `engine`.
3. Environment variables:
   - `ENGINE_TOKEN` — the same value stored in the Lovable project secret `ENGINE_TOKEN`.
    - `APP_CALLBACK_URL` — the app's **published origin**, `https://yuxcilab.lovable.app`. Do not append `/api/public/engine`; the Engine appends the callback path.
   - `REALMARKETAPI_KEY` — your RealMarketAPI key.
4. After deploy, copy the service URL (`https://model-lab-engine.onrender.com`) into the Lovable secret `ENGINE_URL`.
5. Settings page → Engine should show **Online**.

Free plan works for imports and backtests (it sleeps after 15 min idle and wakes in ~1 min). Upgrade to Starter before live paper trading, which needs it awake 24/7.

## Updating the existing Render service
After GitHub synchronization, select the existing `model-lab-engine` service → Manual Deploy → Deploy latest commit (or use configured auto-deploy). The new Docker image installs `libseccomp2`; health reports version `0.3.0` and feature capabilities. No additional secrets are needed.

All uploaded model versions remain immutable. Acceptance reports are separate protected `jobs` records. An exact-hash adapter preserves the original ORB day simulator and its 19/60 rule for research; it is not silently rewritten into a closed-bar strategy. Live deployment stays blocked for this legacy model or any model whose causality, DST, golden and security checks are unverified. WebSocket permission is checked against the actual `/me` response before starting; no REST polling substitutes for streaming.

Prop simulations provide static/trailing account replay, daily-reset loss limits, an exact independent streak bankroll calculation and seeded moving-block bootstrap estimates. News restrictions, full position sizing, scale-up comparison, multi-account lifecycle/payout scheduling, and two-week shadow certification are not yet implemented; these must not be inferred from the basic replay output.

## Local
```
pip install -r requirements.txt
pytest -q
ENGINE_TOKEN=dev APP_CALLBACK_URL=http://localhost:8080 uvicorn app.main:app --reload
```
