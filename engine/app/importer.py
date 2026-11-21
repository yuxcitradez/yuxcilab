"""Import job runner: download -> process -> write a new immutable dataset version via the app callback."""
from __future__ import annotations
import hashlib
import math
import threading
import traceback
import httpx
from .callback import AppClient
from .csv_import import process

CHUNK = 5000
_cancel: set[str] = set()
_lock = threading.Lock()


def request_cancel(file_id: str) -> None:
    with _lock:
        _cancel.add(file_id)


def _cancelled(file_id: str) -> bool:
    with _lock:
        return file_id in _cancel


def _f(v):
    return None if v is None or (isinstance(v, float) and math.isnan(v)) else float(v)


def run_file(user_id: str, job: dict) -> None:
    app = AppClient(user_id)
    fid = job["file_id"]
    cfg = job.get("config") or {}
    def upd(**patch):
        app.call("files/update", {"file_id": fid, "patch": patch})
    try:
        upd(status="processing", progress=0.02, error_message=None)
        raw = httpx.get(job["signed_url"], timeout=600).content
        sha = hashlib.sha256(raw).hexdigest()
        groups = process(raw, cfg)
        upd(progress=0.15, file_sha256=sha)
        totals = dict(source_rows=0, accepted_rows=0, rejected_rows=0, duplicate_rows=0, conflict_rows=0, existing_rows=0)
        reports = []
        dataset_ids = []
        mode = cfg.get("write_mode") or "new_version"
        for gi, g in enumerate(groups):
            if _cancelled(fid):
                raise InterruptedError()
            inst_id = cfg.get("instrument_id") if g.symbol is None else app.call(
                "instruments/ensure", {"symbol": g.symbol, "asset_class": cfg.get("asset_class") or "other"})["id"]
            if not inst_id:
                raise ValueError("No instrument selected for this file")
            # rejections
            for k in range(0, len(g.rejections), CHUNK):
                app.call("rejections/insert", {"file_id": fid, "rows": [
                    {"row_number": r, "raw_row": raw_[:1000], "reason": why} for r, raw_, why in g.rejections[k:k + CHUNK]]})
            active = app.call("datasets/active", {"instrument_id": inst_id, "timeframe": cfg.get("timeframe") or "M1"})
            bars = g.bars
            existing = 0
            excl = None
            copy_src = None
            if active.get("id") and len(bars):
                ex = app.call("bars/timestamps", {"dataset_id": active["id"], "start": g.stats["start"], "end": g.stats["end"]})
                existing_ts = set(ex["ts"])
                iso = bars["ts_utc"].map(lambda t: t.isoformat())
                in_existing = iso.isin(existing_ts)
                existing = int(in_existing.sum())
                if active.get("price_basis") not in (None, cfg.get("price_basis") or "unknown") and mode != "new_version":
                    raise ValueError("Price basis differs from the active dataset; create a separate new version instead of merging")
                if mode == "append":
                    bars = bars[~in_existing.to_numpy()]
                    copy_src = active["id"]
                elif mode == "replace_range":
                    rs, re_ = cfg.get("replace_start"), cfg.get("replace_end")
                    if not rs or not re_:
                        raise ValueError("Replace range needs start and end")
                    import pandas as pd
                    s, e = pd.Timestamp(rs, tz="UTC"), pd.Timestamp(re_, tz="UTC")
                    bars = bars[(bars["ts_utc"] >= s) & (bars["ts_utc"] <= e)]
                    copy_src, excl = active["id"], (s.isoformat(), e.isoformat())
            ds = app.call("datasets/create", {"dataset": {
                "instrument_id": inst_id, "timeframe": cfg.get("timeframe") or "M1", "source_type": "csv",
                "source_filename": job["filename"] + (f" [{g.symbol}]" if g.symbol else ""), "file_sha256": sha,
                "price_basis": cfg.get("price_basis") or "unknown", "timezone": cfg.get("timezone") or "UTC",
                "timestamp_format": g.stats["timestamp_format"], "column_mapping": g.stats["mapping"],
                "spread_unit": cfg.get("spread_unit"), "volume_type": cfg.get("volume_type") or "tick",
                "detected_interval_s": g.interval_s, "gap_report": g.gaps[:1000], "validation_status": "pending"}})
            did = ds["id"]
            copied = 0
            if copy_src:
                copied = app.call("datasets/copy", {"src": copy_src, "dst": did,
                                                    "excl_start": excl[0] if excl else None, "excl_end": excl[1] if excl else None})["copied"]
            n = len(bars)
            for k in range(0, n, CHUNK):
                if _cancelled(fid):
                    app.call("datasets/finalize", {"dataset_id": did, "status": "cancelled", "activate": False})
                    raise InterruptedError()
                part = bars.iloc[k:k + CHUNK]
                app.call("bars/insert", {"dataset_id": did, "instrument_id": inst_id, "rows": [
                    {"ts_utc": r.ts_utc.isoformat(), "open": r.open, "high": r.high, "low": r.low, "close": r.close,
                     "volume": _f(r.volume), "spread": _f(r.spread)} for r in part.itertuples(index=False)],
                    "volume_type": cfg.get("volume_type") or "tick", "spread_unit": cfg.get("spread_unit")})
                upd(progress=round(0.15 + 0.8 * ((gi + (k + len(part)) / max(n, 1)) / len(groups)), 3))
            status = "warning" if (g.warnings or g.stats["rejected_rows"]) else "valid"
            app.call("datasets/finalize", {"dataset_id": did, "status": status, "activate": cfg.get("activate", True),
                                           "rejected_count": g.stats["rejected_rows"] + g.stats["conflict_rows"]})
            dataset_ids.append(did)
            totals["source_rows"] += g.stats["source_rows"]
            totals["accepted_rows"] += n
            totals["rejected_rows"] += g.stats["rejected_rows"]
            totals["duplicate_rows"] += g.stats["duplicate_rows"]
            totals["conflict_rows"] += g.stats["conflict_rows"]
            totals["existing_rows"] += existing
            reports.append({**g.stats, "symbol": g.symbol, "dataset_id": did, "copied_from_previous": copied,
                            "imported_rows": n, "existing_rows": existing, "warnings": g.warnings,
                            "gaps": g.gaps[:200], "gap_count": len(g.gaps)})
        upd(status="completed", progress=1, dataset_id=dataset_ids[0] if dataset_ids else None,
            validation_report={"groups": reports, "write_mode": mode}, **totals, completed=True)
    except InterruptedError:
        upd(status="cancelled", completed=True)
    except Exception as e:  # report, never swallow
        traceback.print_exc()
        try:
            upd(status="failed", error_message=str(e)[:1000], completed=True)
        except Exception:
            traceback.print_exc()
    finally:
        with _lock:
            _cancel.discard(fid)


def start_batch(user_id: str, files: list[dict]) -> None:
    def worker():
        for f in files:
            run_file(user_id, f)
        AppClient(user_id).call("batches/refresh", {"batch_id": files[0]["batch_id"]}) if files else None
    threading.Thread(target=worker, daemon=True).start()
