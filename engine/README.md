# Model Lab Engine

Python FastAPI service that does all numeric work for Model Lab (CSV import now; models, backtests, live paper trading later).
It holds **no database credentials**: every write goes to the app's callback route `/api/public/engine/*`, authenticated with the shared `ENGINE_TOKEN`.

## Deploy on Render
1. Push this repo to GitHub (Lovable → GitHub sync).
2. Render → New → Blueprint → pick the repo (uses `engine/render.yaml`), or New → Web Service → Docker with root directory `engine`.
3. Environment variables:
   - `ENGINE_TOKEN` — the same value stored in the Lovable project secret `ENGINE_TOKEN`.
   - `APP_CALLBACK_URL` — the app's **published** URL (e.g. `https://your-app.lovable.app`).
   - `REALMARKETAPI_KEY` — your RealMarketAPI key.
4. After deploy, copy the service URL (`https://model-lab-engine.onrender.com`) into the Lovable secret `ENGINE_URL`.
5. Settings page → Engine should show **Online**.

Use a paid instance (Starter or higher): the free plan sleeps and would interrupt imports and live paper trading.

## Local
```
pip install -r requirements.txt
pytest -q
ENGINE_TOKEN=dev APP_CALLBACK_URL=http://localhost:8080 uvicorn app.main:app --reload
```
