from __future__ import annotations
import hmac
import time
import httpx
from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel
from .config import ENGINE_VERSION, engine_token, env
from . import importer, jobs, market, live

app = FastAPI(title="Model Lab Engine", version=ENGINE_VERSION, docs_url=None, redoc_url=None)
STARTED = time.time()


def auth(authorization: str = Header(default="")) -> None:
    expected = f"Bearer {engine_token()}"
    if not hmac.compare_digest(authorization.encode(), expected.encode()):
        raise HTTPException(status_code=401, detail="unauthorized")


def user_header(x_user_id: str = Header(default="")) -> str:
    if not x_user_id:
        raise HTTPException(status_code=400, detail="missing user")
    return x_user_id


@app.get("/healthz")
def healthz():
    return {"ok": True}


def _market_health() -> dict:
    key = env("REALMARKETAPI_KEY", "")
    if not key:
        return {"ok": False, "status": "Not configured"}
    try:
        r = httpx.get("https://api.realmarketapi.com/api/v1/health", params={"apiKey": key}, timeout=5)
        return {"ok": r.status_code == 200, "status": "Online" if r.status_code == 200 else f"HTTP {r.status_code}"}
    except Exception:
        return {"ok": False, "status": "Unreachable"}


@app.get("/health", dependencies=[Depends(auth)])
@app.get("/v1/health", dependencies=[Depends(auth)])
def health():
    return {"ok": True, "version": ENGINE_VERSION, "uptime_s": int(time.time() - STARTED), "market_data": _market_health(),
            "capabilities": ["imports", "model_validation", "backtests", "prop_simulation", "market_account", "live_paper"]}


class ImportFile(BaseModel):
    file_id: str
    batch_id: str
    filename: str
    signed_url: str
    config: dict = {}


class ImportRequest(BaseModel):
    files: list[ImportFile]


@app.post("/v1/data/imports", dependencies=[Depends(auth)])
def start_import(req: ImportRequest, user_id: str = Depends(user_header)):
    importer.start_batch(user_id, [f.model_dump() for f in req.files])
    return {"accepted": len(req.files)}


@app.post("/v1/data/imports/{file_id}/cancel", dependencies=[Depends(auth)])
def cancel_import(file_id: str, user_id: str = Depends(user_header)):
    importer.request_cancel(file_id)
    return {"cancelling": file_id}


class JobRequest(BaseModel):
    job_id: str


@app.post('/v1/jobs', dependencies=[Depends(auth)])
def start_job(req: JobRequest, user_id: str = Depends(user_header)):
    try: jobs.start(user_id, req.job_id)
    except ValueError as e: raise HTTPException(status_code=409, detail=str(e)) from None
    return {'accepted': True, 'job_id': req.job_id}


@app.post('/v1/jobs/{job_id}/cancel', dependencies=[Depends(auth)])
def cancel_job(job_id: str, user_id: str = Depends(user_header)):
    jobs.cancel(user_id,job_id)
    return {'cancelling':job_id}


@app.get('/v1/market/account', dependencies=[Depends(auth)])
def market_account():
    try: return market.account()
    except ValueError as e: raise HTTPException(status_code=502,detail=str(e)) from None


class MarketRequest(BaseModel):
    endpoint: str
    params: dict = {}


@app.post('/v1/market/request', dependencies=[Depends(auth)])
def market_request(req: MarketRequest):
    try: return market.request(req.endpoint,req.params)
    except ValueError as e: raise HTTPException(status_code=400,detail=str(e)) from None


class DeploymentRequest(BaseModel):
    deployment_id: str


@app.post('/v1/live/deployments', dependencies=[Depends(auth)])
def deploy(req: DeploymentRequest,user_id: str = Depends(user_header)):
    try: live.start(user_id,req.deployment_id)
    except ValueError as e: raise HTTPException(status_code=409,detail=str(e)) from None
    return {'accepted':True}


@app.post('/v1/live/deployments/{deployment_id}/{action}', dependencies=[Depends(auth)])
def control(deployment_id: str,action: str,user_id: str = Depends(user_header)):
    try: live.control(user_id,deployment_id,action)
    except ValueError as e: raise HTTPException(status_code=409,detail=str(e)) from None
    return {'ok':True}
