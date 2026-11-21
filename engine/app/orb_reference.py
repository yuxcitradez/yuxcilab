"""
Range-fade model (06:00-06:59 range, 07:00-10:00 break window) - backtest core.

Two independent day simulators (A: explicit bar loop, B: vectorised numpy) must produce
identical output; any disagreement is a bug. See test_orb_model.py.

CONVENTIONS (all assumptions are explicit parameters in `Params`)
- Bars are stamped with their OPEN time (MT5 convention). "06:59 bar" covers 06:59:00-06:59:59.
- Prices are the broker's BID series (MT5 chart default). Spread column is in points; point = 0.01.
- Range  : bars with local open-minute in [06:00, 06:59] -> H = max(high), L = min(low), must be exactly 60 bars.
- d      : (H - L) / 2        (half-range, a distance)
- M      : (H + L) / 2        (midpoint price; = L + d = H - d)
- Entry  : first bar in [07:00, 10:00] (inclusive) with low < L (LONG) or high > H (SHORT). Strict inequality.
           Stop-style fill: at the level, or at the bar OPEN if the bar opened already beyond the level.
           If one bar breaks both sides: if it OPENED beyond a level, that side triggered first (at the open);
           if it opened inside the range the order is unknowable -> day skipped (SKIP_BOTH_SIDES).
- TP     : price level M
- SL     : entry -/+ sl_mult * d   (long: minus, short: plus)
- Exit scan: on the entry bar only SL is testable when entry happened at the level (intrabar order unknown);
  when entry happened at the bar OPEN, TP is testable on the entry bar too (entry precedes the whole bar).
  From the next bar on both are tested. If SL and TP are both touched in one bar -> SL (conservative).
- No TP/SL by the last bar at or before 16:59 local -> TIMEOUT at that bar's close.
"""
from __future__ import annotations
from dataclasses import dataclass, replace
import math
import numpy as np
import pandas as pd


@dataclass(frozen=True)
class Params:
    tz: str = "America/New_York"        # "Etc/GMT+5" = fixed UTC-5 (literal EST all year)
    range_start: int = 6 * 60
    range_end: int = 6 * 60 + 59        # inclusive bar-open minute
    entry_start: int = 7 * 60
    entry_end: int = 10 * 60            # inclusive bar-open minute
    eod: int = 16 * 60 + 59             # last bar-open minute a trade may be held
    sl_mult: float = 5.0
    use_spread: bool = False
    point: float = 0.01
    full_range_bars: int = 60
    # user's PnL rule
    pnl_sl: float = -19.0
    pnl_streak: float = 60.0
    streak_len: int = 5


# --------------------------------------------------------------------------- data
_SEPS = ("\t", ";", ",")


def _read_raw(path: str) -> pd.DataFrame:
    """Read an MT5 bar export (tab-separated with <DATE> <TIME> ... headers; comma/semicolon also accepted)."""
    with open(path, "r", encoding="utf-8-sig") as fh:
        header = fh.readline()
    sep = next((x for x in _SEPS if x in header), None)
    if sep is None:
        raise ValueError(f"Cannot detect the column separator in the header: {header!r}")
    df = pd.read_csv(path, sep=sep, dtype=str, encoding="utf-8-sig")
    df.columns = [c.strip().strip("<>").lower() for c in df.columns]
    missing = {"date", "time", "open", "high", "low", "close"} - set(df.columns)
    if missing:
        raise ValueError(f"Missing columns {sorted(missing)}; found {list(df.columns)}")
    return df


def detect_point(path: str) -> float:
    """Price tick size inferred from the decimals printed in the file (MT5 pads prices to the symbol's digits).
    2 decimals -> 0.01 (e.g. USTECm), 3 decimals -> 0.001 (e.g. XAUUSDm). MT5's spread column is in these points."""
    raw = _read_raw(path)
    dec = 0
    for col in ("open", "high", "low", "close"):
        frac = raw[col].str.strip().str.split(".", n=1).str[1].str.len().fillna(0)
        dec = max(dec, int(frac.max()))
    return round(10.0 ** -dec, dec)


def load_mt5_csv(path: str, server_tz: str = "UTC") -> pd.DataFrame:
    """MT5 export -> DataFrame (open, high, low, close, [tickvol, vol], spread) with a tz-aware UTC index.
    `server_tz` is the clock the broker's server stamps bars with (Exness: "UTC"). Use an IANA name; note that
    fixed offsets have inverted signs: "Etc/GMT-2" means UTC+2."""
    raw = _read_raw(path)
    try:
        naive = pd.to_datetime(raw["date"].str.strip() + " " + raw["time"].str.strip(), format="%Y.%m.%d %H:%M:%S")
    except ValueError as e:
        raise ValueError(f"Unexpected date/time format (expected 2026.08.05 + 04:40:00). First row: "
                         f"{raw[['date','time']].iloc[0].tolist()}") from e
    ts = naive.dt.tz_localize(server_tz).dt.tz_convert("UTC").rename("ts")
    out = pd.DataFrame(index=pd.DatetimeIndex(ts))
    for col in ("open", "high", "low", "close"):
        out[col] = pd.to_numeric(raw[col].str.strip()).to_numpy(dtype=float)
    for col in ("tickvol", "vol", "spread"):
        out[col] = pd.to_numeric(raw[col].str.strip()).to_numpy(dtype=float) if col in raw.columns else 0.0
    assert out.index.is_monotonic_increasing, "timestamps are not sorted ascending"
    assert not out.index.has_duplicates, "duplicate timestamps in file"
    return out


def to_local(df_utc: pd.DataFrame, tz: str) -> pd.DataFrame:
    out = df_utc.copy()
    out.index = out.index.tz_convert(tz)      # UTC -> local is always unambiguous (no DST fold issue)
    return out


def iter_days(df_local: pd.DataFrame):
    """Yield (date, mod, o, h, l, c, spread, ts) per local calendar date, Mon-Fri only."""
    idx = df_local.index
    dates = np.array(idx.date)
    mod = (idx.hour * 60 + idx.minute).to_numpy()
    o, h, l, c = (df_local[k].to_numpy(dtype=float) for k in ("open", "high", "low", "close"))
    sp = df_local["spread"].to_numpy(dtype=float)
    ts = idx
    bounds = np.flatnonzero(np.r_[True, dates[1:] != dates[:-1], True])
    for a, b in zip(bounds[:-1], bounds[1:]):
        if dates[a].weekday() >= 5:
            continue
        yield dates[a], mod[a:b], o[a:b], h[a:b], l[a:b], c[a:b], sp[a:b], ts[a:b]


def _blank(date) -> dict:
    return dict(date=date, status=None, side=None, H=np.nan, L=np.nan, M=np.nan, d=np.nan,
                entry_time=pd.NaT, entry=np.nan, tp=np.nan, sl=np.nan, exit_time=pd.NaT, exit=np.nan,
                pts=np.nan, bars_held=0, sl_tp_same_bar=False, gap_in_entry_window=False)


# --------------------------------------------------------------------------- engine A (loop)
def simulate_day_A(date, mod, o, h, l, c, sp, ts, P: Params) -> dict:
    rec = _blank(date)
    n = len(mod)
    ridx = [i for i in range(n) if P.range_start <= mod[i] <= P.range_end]
    if len(ridx) != P.full_range_bars:
        rec["status"] = "SKIP_INCOMPLETE_RANGE"
        return rec
    H = max(h[i] for i in ridx)
    L = min(l[i] for i in ridx)
    d = (H - L) / 2.0
    M = (H + L) / 2.0
    rec.update(H=H, L=L, M=M, d=d)
    if d <= 0:
        rec["status"] = "SKIP_DEGENERATE"
        return rec
    eidx = [i for i in range(n) if P.entry_start <= mod[i] <= P.entry_end]
    rec["gap_in_entry_window"] = len(eidx) != (P.entry_end - P.entry_start + 1)

    ent = None
    side = None
    fill = np.nan
    at_open = False
    for i in eidx:
        broke_low, broke_high = l[i] < L, h[i] > H
        if o[i] < L:                         # opened beyond the low: long triggers at the open
            side, fill, ent, at_open = "long", o[i], i, True
            break
        if o[i] > H:                         # opened beyond the high: short triggers at the open
            side, fill, ent, at_open = "short", o[i], i, True
            break
        if broke_low and broke_high:         # opened inside the range, both levels pierced: order unknowable
            rec["status"] = "SKIP_BOTH_SIDES"
            return rec
        if broke_low:
            side, fill, ent = "long", L, i
            break
        if broke_high:
            side, fill, ent = "short", H, i
            break
    if ent is None:
        rec["status"] = "NO_BREAK"
        return rec

    s_ent = sp[ent] * P.point if P.use_spread else 0.0
    entry = fill + s_ent if side == "long" else fill
    if (side == "long" and entry >= M) or (side == "short" and entry <= M):
        rec.update(status="SKIP_DEGENERATE", side=side)
        return rec
    sl = entry - P.sl_mult * d if side == "long" else entry + P.sl_mult * d
    rec.update(side=side, entry=entry, tp=M, sl=sl, entry_time=ts[ent])

    last = max(i for i in range(n) if mod[i] <= P.eod)
    exit_i, reason, px = None, None, np.nan
    for j in range(ent, last + 1):
        sj = sp[j] * P.point if P.use_spread else 0.0
        if side == "long":
            sl_hit = l[j] <= sl
            tp_hit = (j > ent or at_open) and h[j] >= M
        else:
            sl_hit = h[j] + sj >= sl
            tp_hit = (j > ent or at_open) and l[j] + sj <= M
        if sl_hit and tp_hit:
            rec["sl_tp_same_bar"] = True
        if sl_hit:
            if j == ent:
                px = sl
            elif side == "long":
                px = o[j] if o[j] <= sl else sl
            else:
                px = max(sl, o[j] + sj)
            exit_i, reason = j, "SL"
            break
        if tp_hit:
            exit_i, reason, px = j, "TP", M
            break
    if exit_i is None:
        exit_i, reason = last, "TIMEOUT"
        sl_ = sp[last] * P.point if P.use_spread else 0.0
        px = c[last] if side == "long" else c[last] + sl_
    rec.update(status=reason, exit=px, exit_time=ts[exit_i], bars_held=exit_i - ent,
               pts=(px - entry) if side == "long" else (entry - px))
    return rec


# --------------------------------------------------------------------------- engine B (vectorised)
def simulate_day_B(date, mod, o, h, l, c, sp, ts, P: Params) -> dict:
    rec = _blank(date)
    n = len(mod)
    pos = np.arange(n)
    rmask = (mod >= P.range_start) & (mod <= P.range_end)
    if int(rmask.sum()) != P.full_range_bars:
        rec["status"] = "SKIP_INCOMPLETE_RANGE"
        return rec
    H, L = float(h[rmask].max()), float(l[rmask].min())
    d, M = (H - L) / 2.0, (H + L) / 2.0
    rec.update(H=H, L=L, M=M, d=d)
    if not d > 0:
        rec["status"] = "SKIP_DEGENERATE"
        return rec
    emask = (mod >= P.entry_start) & (mod <= P.entry_end)
    rec["gap_in_entry_window"] = int(emask.sum()) != (P.entry_end - P.entry_start + 1)
    bl, bh = emask & (l < L), emask & (h > H)
    brk = bl | bh
    if not brk.any():
        rec["status"] = "NO_BREAK"
        return rec
    i = int(np.argmax(brk))
    at_open = bool(o[i] < L or o[i] > H)
    if at_open:
        long_ = bool(o[i] < L)
        fill = float(o[i])
    else:
        if bl[i] and bh[i]:
            rec["status"] = "SKIP_BOTH_SIDES"
            return rec
        long_ = bool(bl[i])
        fill = L if long_ else H
    s = sp * P.point if P.use_spread else np.zeros(n)
    entry = (fill + s[i]) if long_ else fill
    if (long_ and entry >= M) or ((not long_) and entry <= M):
        rec.update(status="SKIP_DEGENERATE", side="long" if long_ else "short")
        return rec
    sign = 1.0 if long_ else -1.0
    sl = entry - sign * P.sl_mult * d
    rec.update(side="long" if long_ else "short", entry=entry, tp=M, sl=sl, entry_time=ts[i])

    live = (pos >= i) & (mod <= P.eod)
    after = (pos >= i) if at_open else (pos > i)
    last = int(pos[mod <= P.eod].max())
    if long_:
        sl_hit = live & (l <= sl)
        tp_hit = live & (after) & (h >= M)
    else:
        sl_hit = live & (h + s >= sl)
        tp_hit = live & (after) & (l + s <= M)
    INF = n + 1
    f_sl = int(np.argmax(sl_hit)) if sl_hit.any() else INF
    f_tp = int(np.argmax(tp_hit)) if tp_hit.any() else INF
    rec["sl_tp_same_bar"] = bool((sl_hit & tp_hit).any() and f_sl == f_tp)
    if f_sl == INF and f_tp == INF:
        j, reason = last, "TIMEOUT"
        px = c[last] if long_ else c[last] + s[last]
    elif f_sl <= f_tp:
        j, reason = f_sl, "SL"
        if j == i:
            px = sl
        elif long_:
            px = float(np.where(o[j] <= sl, o[j], sl))
        else:
            px = float(max(sl, o[j] + s[j]))
    else:
        j, reason, px = f_tp, "TP", M
    rec.update(status=reason, exit=px, exit_time=ts[j], bars_held=int(j - i),
               pts=(px - entry) if long_ else (entry - px))
    return rec


# --------------------------------------------------------------------------- drivers
def run(df_utc: pd.DataFrame, P: Params, engine: str = "A") -> pd.DataFrame:
    sim = simulate_day_A if engine == "A" else simulate_day_B
    local = to_local(df_utc, P.tz)
    rows = [sim(*day, P) for day in iter_days(local)]
    return pd.DataFrame(rows)


def apply_pnl_rule(trades: pd.DataFrame, P: Params) -> pd.DataFrame:
    """SL -> pnl_sl. TP on `streak_len` consecutive trading days -> pnl_streak, counter then resets.
    Any non-TP day (SL, TIMEOUT, NO_BREAK, SKIP_*) resets the counter. A lone TP pays 0."""
    streak, out = 0, []
    for st in trades["status"]:
        p = 0.0
        if st == "SL":
            p, streak = P.pnl_sl, 0
        elif st == "TP":
            streak += 1
            if streak == P.streak_len:
                p, streak = P.pnl_streak, 0
        else:
            streak = 0
        out.append(p)
    t = trades.copy()
    t["pnl"] = out
    t["cum_pnl"] = t["pnl"].cumsum()
    return t


def wilson(k: int, n: int, z: float = 1.96):
    if n == 0:
        return (math.nan, math.nan)
    p = k / n
    den = 1 + z * z / n
    centre = (p + z * z / (2 * n)) / den
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / den
    return (centre - half, centre + half)


def summarise(t: pd.DataFrame, P: Params) -> dict:
    n_days = len(t)
    traded = t[t.status.isin(["TP", "SL", "TIMEOUT"])]
    tp, sl, to = (int((t.status == s).sum()) for s in ("TP", "SL", "TIMEOUT"))
    cum = t["cum_pnl"].to_numpy()
    dd = float((np.maximum.accumulate(np.r_[0.0, cum])[1:] - cum).max()) if len(cum) else 0.0
    lo, hi = wilson(tp, len(traded))
    return dict(days=n_days, traded=len(traded), long=int((traded.side == "long").sum()),
                short=int((traded.side == "short").sum()), TP=tp, SL=sl, TIMEOUT=to,
                NO_BREAK=int((t.status == "NO_BREAK").sum()),
                SKIPPED=int(t.status.str.startswith("SKIP").sum()),
                tp_rate=tp / len(traded) if len(traded) else math.nan, tp_rate_ci95=(lo, hi),
                streaks_paid=int((t.pnl == P.pnl_streak).sum()), total_pnl=float(t.pnl.sum()),
                max_drawdown=dd, avg_half_range_pts=float(traded.d.mean()) if len(traded) else math.nan,
                sl_tp_same_bar=int(t.sl_tp_same_bar.sum()), gap_days=int(t.gap_in_entry_window.sum()))
