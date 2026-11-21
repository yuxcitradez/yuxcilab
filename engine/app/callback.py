"""Writes go back to the Lovable app's authenticated callback route; the Engine holds no DB credentials."""
from __future__ import annotations
import time
import httpx
from .config import callback_url, engine_token


class AppClient:
    def __init__(self, user_id: str):
        self.user_id = user_id
        self.http = httpx.Client(timeout=120)

    def call(self, action: str, payload: dict) -> dict:
        body = {"user_id": self.user_id, **payload}
        last: Exception | None = None
        for attempt in range(4):
            try:
                r = self.http.post(
                    f"{callback_url()}/api/public/engine/{action}",
                    json=body,
                    headers={"Authorization": f"Bearer {engine_token()}"},
                )
                if r.status_code >= 500:
                    raise RuntimeError(f"callback {action} -> {r.status_code}")
                if r.status_code >= 400:
                    raise ValueError(f"callback {action} -> {r.status_code}: {r.text[:300]}")
                return r.json()
            except ValueError:
                raise
            except Exception as e:  # transient
                last = e
                time.sleep(2 ** attempt)
        raise RuntimeError(f"callback {action} failed: {last}")
