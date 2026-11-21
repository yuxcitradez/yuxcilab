import { describe, expect, it } from "vitest";
import { detectMapping, guessSymbol, parsePreview } from "./csv-sniff";

describe("csv preview detection", () => {
  it("detects MT5 tab export with separate date and time", () => {
    const p = parsePreview("<DATE>\t<TIME>\t<OPEN>\t<HIGH>\t<LOW>\t<CLOSE>\t<TICKVOL>\t<VOL>\t<SPREAD>\r\n2026.06.01\t00:00:00\t1\t2\t0.5\t1.5\t5\t0\t8\r\n2026.06.01\t00:01:00\t1\t2\t0.5\t1.5\t5\t0\t8\r\n");
    expect(p.delimiter).toBe("\t");
    expect(p.mapping.date).toBe("<DATE>");
    expect(p.mapping.time).toBe("<TIME>");
    expect(p.mapping.volume).toBe("<TICKVOL>");
    expect(p.mapping.spread).toBe("<SPREAD>");
  });
  it("treats a lone time column as the timestamp", () => {
    expect(detectMapping(["time", "open", "high", "low", "close"]).timestamp).toBe("time");
  });
  it("strips the Exness m suffix from filenames", () => {
    expect(guessSymbol("XAUUSDm_M1_202606010000.csv")).toBe("XAUUSD");
  });
});
