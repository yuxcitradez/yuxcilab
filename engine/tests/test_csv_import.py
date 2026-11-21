import pandas as pd
import pytest
from app.csv_import import process

HDR = "<DATE>\t<TIME>\t<OPEN>\t<HIGH>\t<LOW>\t<CLOSE>\t<TICKVOL>\t<VOL>\t<SPREAD>\n"

def mt5(rows):
    return (HDR + "".join("\t".join(map(str, r)) + "\r\n" for r in rows)).encode()

def test_mt5_detect_and_utc():
    raw = mt5([("2026.06.01", "00:00:00", 1.1, 1.2, 1.0, 1.15, 5, 0, 8),
               ("2026.06.01", "00:01:00", 1.15, 1.2, 1.1, 1.12, 5, 0, 8)])
    [g] = process(raw, {"timezone": "UTC", "timeframe": "M1"})
    assert g.stats["valid_rows"] == 2
    assert g.bars["ts_utc"].iloc[0] == pd.Timestamp("2026-06-01 00:00", tz="UTC")
    assert g.interval_s == 60

def test_invalid_ohlc_rejected_and_conflict_flagged():
    raw = mt5([("2026.06.01", "00:00:00", 1.1, 1.0, 1.05, 1.15, 5, 0, 8),   # high < low
               ("2026.06.01", "00:01:00", 1.1, 1.2, 1.0, 1.1, 5, 0, 8),
               ("2026.06.01", "00:01:00", 1.1, 1.3, 1.0, 1.1, 5, 0, 8),     # conflict
               ("2026.06.01", "00:02:00", 1.1, 1.2, 1.0, 1.1, 5, 0, 8),
               ("2026.06.01", "00:02:00", 1.1, 1.2, 1.0, 1.1, 5, 0, 8),     # exact dup
               ("2026.06.01", "00:03:00", 1.1, 1.2, 1.0, 1.1, 5, 0, 8)])
    [g] = process(raw, {"timezone": "UTC", "timeframe": "M1"})
    assert g.stats["duplicate_rows"] == 1
    assert g.stats["conflict_rows"] == 2
    assert g.stats["valid_rows"] == 2
    reasons = {r[2] for r in g.rejections}
    assert "invalid OHLC relationship" in reasons

def test_wrong_timeframe_rejected():
    raw = mt5([("2026.06.01", f"00:{m:02d}:00", 1.1, 1.2, 1.0, 1.1, 5, 0, 8) for m in range(0, 30, 5)])
    with pytest.raises(ValueError, match="interval"):
        process(raw, {"timezone": "UTC", "timeframe": "M1"})

def test_dst_ambiguous_rejected_new_york():
    # 2026-11-01 01:30 occurs twice in New York
    raw = mt5([("2026.11.01", "01:29:00", 1.1, 1.2, 1.0, 1.1, 5, 0, 8),
               ("2026.11.01", "01:30:00", 1.1, 1.2, 1.0, 1.1, 5, 0, 8)])
    [g] = process(raw, {"timezone": "America/New_York", "timeframe": "M1"})
    assert g.stats["valid_rows"] == 0
    assert all("DST" in r[2] for r in g.rejections)

def test_combined_symbols_grouped():
    raw = ("symbol,datetime,open,high,low,close\n"
           "EURUSD,2026-06-01 00:00:00,1.1,1.2,1.0,1.1\nXAUUSD,2026-06-01 00:00:00,2000,2001,1999,2000\n"
           "EURUSD,2026-06-01 00:01:00,1.1,1.2,1.0,1.1\n").encode()
    groups = process(raw, {"mode": "combined", "timeframe": "M1"})
    assert [g.symbol for g in groups] == ["EURUSD", "XAUUSD"]
