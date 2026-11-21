"""CSV detection, normalization and validation. Pure functions, no I/O besides reading the file."""
from __future__ import annotations
import csv
import io
import re
from dataclasses import dataclass, field
import numpy as np
import pandas as pd

TIMEFRAME_SECONDS = {"M1": 60, "M5": 300, "M15": 900, "M30": 1800, "H1": 3600, "H4": 14400, "D1": 86400}

ALIASES = {
    "timestamp": ["timestamp", "datetime", "date_time", "time_utc", "ts"],
    "date": ["date", "day"],
    "time": ["time"],
    "symbol": ["symbol", "instrument", "asset", "pair", "ticker"],
    "open": ["open", "o"],
    "high": ["high", "h"],
    "low": ["low", "l"],
    "close": ["close", "c"],
    "volume": ["tickvol", "tick_volume", "volume", "vol", "tickvolume"],
    "spread": ["spread", "spread_points", "spread_pips"],
}

TS_FORMATS = [
    "%Y.%m.%d %H:%M:%S", "%Y.%m.%d %H:%M", "%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S",
    "%Y-%m-%d %H:%M", "%Y-%m-%dT%H:%M:%SZ", "%d.%m.%Y %H:%M:%S", "%d.%m.%Y %H:%M",
    "%d/%m/%Y %H:%M:%S", "%d/%m/%Y %H:%M", "%m/%d/%Y %H:%M:%S", "%m/%d/%Y %H:%M",
    "%Y%m%d %H:%M:%S", "%Y%m%d %H%M%S",
]

MAX_REJECTIONS_STORED = 50_000


def norm_col(c: str) -> str:
    return re.sub(r"[<>\s]", "", str(c)).strip().lower()


def read_text(raw: bytes) -> tuple[str, str]:
    for enc in ("utf-8-sig", "utf-16", "cp1252", "latin-1"):
        try:
            txt = raw.decode(enc)
            if enc == "utf-16" and "\x00" in txt:
                continue
            return txt, enc
        except UnicodeDecodeError:
            continue
    raise ValueError("Unable to decode file")


def detect_delimiter(header: str) -> str:
    counts = {d: header.count(d) for d in ("\t", ";", ",", "|")}
    best = max(counts, key=counts.get)
    if counts[best] == 0:
        raise ValueError("Cannot detect the column separator")
    return best


def detect_mapping(columns: list[str]) -> dict[str, str]:
    normed = {norm_col(c): c for c in columns}
    mapping: dict[str, str] = {}
    for key, names in ALIASES.items():
        for n in names:
            if n in normed:
                mapping[key] = normed[n]
                break
    # "time" alone as a full timestamp when no date column exists
    if "timestamp" not in mapping and "date" not in mapping and "time" in mapping:
        mapping["timestamp"] = mapping.pop("time")
    return mapping


def parse_timestamps(s: pd.Series, fmt: str | None) -> tuple[pd.Series, str]:
    s = s.astype(str).str.strip()
    if fmt and fmt not in ("auto", "epoch_s", "epoch_ms"):
        return pd.to_datetime(s, format=fmt, errors="coerce"), fmt
    if fmt in ("epoch_s", "epoch_ms") or (fmt in (None, "auto") and s.head(50).str.fullmatch(r"\d{10}(\d{3})?").all()):
        unit = "ms" if (fmt == "epoch_ms" or s.iloc[0].__len__() == 13) else "s"
        return pd.to_datetime(pd.to_numeric(s, errors="coerce"), unit=unit, errors="coerce"), f"epoch_{unit}"
    sample = s.head(500)
    for f in TS_FORMATS:
        if pd.to_datetime(sample, format=f, errors="coerce").notna().mean() >= 0.98:
            return pd.to_datetime(s, format=f, errors="coerce"), f
    raise ValueError("Unrecognised timestamp format; set it manually")


def to_number(s: pd.Series, decimal: str) -> pd.Series:
    s = s.astype(str).str.strip()
    if decimal == ",":
        s = s.str.replace(".", "", regex=False).str.replace(",", ".", regex=False)
    return pd.to_numeric(s.replace({"": None, "nan": None}), errors="coerce")


@dataclass
class GroupResult:
    symbol: str | None
    bars: pd.DataFrame  # columns ts_utc, open, high, low, close, volume, spread
    rejections: list[tuple[int, str, str]] = field(default_factory=list)
    stats: dict = field(default_factory=dict)
    warnings: list[str] = field(default_factory=list)
    gaps: list[dict] = field(default_factory=list)
    interval_s: int | None = None


def classify_gaps(ts: pd.Series, step: int) -> list[dict]:
    """Report gaps > one bar. Weekend closures (Fri evening -> Sun/Mon UTC) are labelled, not counted as missing."""
    if len(ts) < 2:
        return []
    diffs = ts.diff().dt.total_seconds().to_numpy()[1:]
    idx = np.where(diffs > step * 1.5)[0]
    out = []
    for i in idx:
        a, b = ts.iloc[i], ts.iloc[i + 1]
        secs = float(diffs[i])
        if a.weekday() == 4 and b.weekday() in (6, 0) and secs <= 3.5 * 86400:
            kind = "weekend_closure"
        elif secs <= 2 * 3600 and a.hour in (20, 21, 22, 23) :
            kind = "daily_session_break"
        elif secs >= 86400:
            kind = "missing_or_holiday"
        else:
            kind = "intraday_gap"
        out.append({"from": a.isoformat(), "to": b.isoformat(), "missing_bars": int(secs // step) - 1, "kind": kind})
    return out


def process(raw: bytes, cfg: dict) -> list[GroupResult]:
    text, encoding = read_text(raw)
    first_line = text.split("\n", 1)[0]
    sep = cfg.get("delimiter") or detect_delimiter(first_line)
    df = pd.read_csv(io.StringIO(text), sep=sep, dtype=str, keep_default_na=False, quoting=csv.QUOTE_MINIMAL)
    df.columns = [c.strip() for c in df.columns]
    mapping = {**detect_mapping(list(df.columns)), **{k: v for k, v in (cfg.get("mapping") or {}).items() if v}}
    for need in ("open", "high", "low", "close"):
        if need not in mapping:
            raise ValueError(f"Column for '{need}' not found; map it manually")
    if "timestamp" not in mapping and not ("date" in mapping and "time" in mapping):
        raise ValueError("Timestamp column not found; map it manually")

    decimal = cfg.get("decimal") or ("," if sep == ";" and df[mapping["close"]].head(50).str.contains(",").any() else ".")
    row_no = pd.Series(np.arange(2, len(df) + 2), index=df.index)  # 1-based incl. header
    raw_rows = df.astype(str).agg(sep.join, axis=1)

    ts_src = df[mapping["timestamp"]] if "timestamp" in mapping else df[mapping["date"]].str.strip() + " " + df[mapping["time"]].str.strip()
    ts_local, fmt_used = parse_timestamps(ts_src, cfg.get("timestamp_format"))
    tz = cfg.get("timezone") or "UTC"
    bad_fmt = ts_local.isna()
    if tz.upper() == "UTC":
        ts_utc = ts_local.dt.tz_localize("UTC")
        dst_bad = pd.Series(False, index=df.index)
    else:
        ts_loc = ts_local.dt.tz_localize(tz, ambiguous="NaT", nonexistent="NaT")
        dst_bad = ts_loc.isna() & ~bad_fmt
        ts_utc = ts_loc.dt.tz_convert("UTC")

    o, h, l, c = (to_number(df[mapping[k]], decimal) for k in ("open", "high", "low", "close"))
    vol = to_number(df[mapping["volume"]], decimal) if "volume" in mapping else pd.Series(np.nan, index=df.index)
    spr = to_number(df[mapping["spread"]], decimal) if "spread" in mapping else pd.Series(np.nan, index=df.index)

    reason = pd.Series("", index=df.index, dtype=object)
    def flag(mask, msg):
        m = mask & (reason == "")
        reason[m] = msg
    flag(bad_fmt, "invalid or missing timestamp")
    flag(dst_bad, "ambiguous or nonexistent local time (DST transition)")
    flag(o.isna() | h.isna() | l.isna() | c.isna(), "missing or non-numeric OHLC")
    flag((o <= 0) | (h <= 0) | (l <= 0) | (c <= 0), "non-positive price")
    flag((h < np.maximum(o, c)) | (l > np.minimum(o, c)) | (h < l), "invalid OHLC relationship")

    invalid_spread = int(((spr < 0) & spr.notna()).sum())
    spr = spr.where(~(spr < 0))

    base = pd.DataFrame({"ts_utc": ts_utc, "open": o, "high": h, "low": l, "close": c, "volume": vol, "spread": spr,
                         "row": row_no, "raw": raw_rows, "reason": reason})
    if "symbol" in mapping and cfg.get("mode") == "combined":
        base["symbol"] = df[mapping["symbol"]].str.strip().str.upper()
        groups = list(base.groupby("symbol", sort=True))
    else:
        groups = [(None, base)]

    tf = cfg.get("timeframe") or "M1"
    step = TIMEFRAME_SECONDS[tf]
    results: list[GroupResult] = []
    for sym, g in groups:
        g = g.copy()
        source_rows = len(g)
        ok = g[g["reason"] == ""]
        out_of_order = int((ok["ts_utc"].diff().dt.total_seconds() < 0).sum())
        ok = ok.sort_values("ts_utc", kind="stable")
        cols = ["open", "high", "low", "close", "volume", "spread"]
        dup_mask = ok.duplicated("ts_utc", keep=False)
        exact_dupes = conflicts = 0
        if dup_mask.any():
            d = ok[dup_mask]
            same = d.groupby("ts_utc")[cols].nunique(dropna=False).max(axis=1) == 1
            conflict_ts = set(same[~same].index)
            exact_ts = set(same[same].index)
            exact_extra = ok["ts_utc"].isin(exact_ts) & ok.duplicated("ts_utc", keep="first")
            exact_dupes = int(exact_extra.sum())
            conf_mask = ok["ts_utc"].isin(conflict_ts)
            conflicts = int(conf_mask.sum())
            g.loc[ok.index[conf_mask], "reason"] = "conflicting candles with identical timestamp"
            g.loc[ok.index[exact_extra], "reason"] = "exact duplicate (deduplicated)"
            ok = ok[~conf_mask & ~exact_extra]

        res = GroupResult(symbol=sym, bars=ok[["ts_utc", *cols]].reset_index(drop=True))
        rej = g[g["reason"] != ""]
        res.rejections = list(zip(rej["row"].astype(int), rej["raw"].astype(str), rej["reason"].astype(str)))[:MAX_REJECTIONS_STORED]

        ts = res.bars["ts_utc"]
        if len(ts) > 1:
            diffs = ts.diff().dt.total_seconds().dropna()
            res.interval_s = int(diffs.mode().iloc[0])
            if res.interval_s != step:
                raise ValueError(f"Detected interval {res.interval_s}s does not match selected timeframe {tf} ({step}s)")
            res.gaps = classify_gaps(ts, step)

        missing_vol = int(res.bars["volume"].isna().sum())
        missing_spread = int(res.bars["spread"].isna().sum())
        if out_of_order:
            res.warnings.append(f"{out_of_order} out-of-order rows were re-sorted")
        if missing_vol:
            res.warnings.append(f"{missing_vol} rows without volume")
        if "spread" not in mapping:
            res.warnings.append("No spread column: spread simulation unavailable for this dataset")
        elif missing_spread:
            res.warnings.append(f"{missing_spread} rows without valid spread")
        if invalid_spread and sym is None:
            res.warnings.append(f"{invalid_spread} negative spread values set to empty")
        real_gaps = [x for x in res.gaps if x["kind"] in ("intraday_gap", "missing_or_holiday")]
        if real_gaps:
            res.warnings.append(f"{len(real_gaps)} gaps outside weekends/session breaks")
        res.stats = {
            "source_rows": source_rows,
            "valid_rows": len(res.bars),
            "rejected_rows": int(len(rej) - exact_dupes),
            "duplicate_rows": exact_dupes,
            "conflict_rows": conflicts,
            "out_of_order_rows": out_of_order,
            "start": ts.iloc[0].isoformat() if len(ts) else None,
            "end": ts.iloc[-1].isoformat() if len(ts) else None,
            "interval_s": res.interval_s,
            "encoding": encoding,
            "delimiter": {"\t": "tab"}.get(sep, sep),
            "decimal": decimal,
            "timestamp_format": fmt_used,
            "timezone": tz,
            "mapping": mapping,
            "rejections_truncated": len(rej) > MAX_REJECTIONS_STORED,
        }
        results.append(res)
    return results
