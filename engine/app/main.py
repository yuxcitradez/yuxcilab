from __future__ import annotations
import hmac
import time
import httpx
from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel
from .config import ENGINE_VERSION, engine_token, env
from . import importer

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
    return {"ok": True, "version": ENGINE_VERSION, "uptime_s": int(time.time() - STARTED), "market_data": _market_health()}


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
