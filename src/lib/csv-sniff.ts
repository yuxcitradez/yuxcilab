/** Lightweight browser-side preview detection (first few KB only). The Engine re-detects and validates the full file. */
export type Mapping = Partial<Record<"timestamp" | "date" | "time" | "symbol" | "open" | "high" | "low" | "close" | "volume" | "spread", string>>;

const ALIASES: Record<keyof Mapping, string[]> = {
  timestamp: ["timestamp", "datetime", "date_time", "time_utc", "ts"],
  date: ["date", "day"],
  time: ["time"],
  symbol: ["symbol", "instrument", "asset", "pair", "ticker"],
  open: ["open", "o"],
  high: ["high", "h"],
  low: ["low", "l"],
  close: ["close", "c"],
  volume: ["tickvol", "tick_volume", "volume", "vol", "tickvolume"],
  spread: ["spread", "spread_points", "spread_pips"],
};

export const normCol = (c: string) => c.replace(/[<>\s]/g, "").toLowerCase();

export function detectDelimiter(header: string): string {
  const cands = ["\t", ";", ",", "|"];
  let best = ",";
  let n = -1;
  for (const d of cands) {
    const k = header.split(d).length - 1;
    if (k > n) { n = k; best = d; }
  }
  return best;
}

export function detectMapping(columns: string[]): Mapping {
  const normed = new Map(columns.map((c) => [normCol(c), c]));
  const m: Mapping = {};
  for (const key of Object.keys(ALIASES) as (keyof Mapping)[]) {
    for (const a of ALIASES[key]) {
      const hit = normed.get(a);
      if (hit) { m[key] = hit; break; }
    }
  }
  if (!m.timestamp && !m.date && m.time) { m.timestamp = m.time; delete m.time; }
  return m;
}

export function parsePreview(text: string, maxRows = 25) {
  const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.length > 0);
  const header = lines[0] ?? "";
  const delimiter = detectDelimiter(header);
  const columns = header.split(delimiter).map((c) => c.trim());
  // drop a possibly truncated last line
  const body = lines.slice(1, Math.min(lines.length - 1, maxRows + 1));
  const rows = body.map((l) => l.split(delimiter));
  return { delimiter, columns, rows, mapping: detectMapping(columns) };
}

/** Guess an MT5-style symbol from a filename like "XAUUSDm_M1_2026....csv". */
export function guessSymbol(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, "").split(/[_\s-]/)[0] ?? "";
  return base.replace(/m$/, "").toUpperCase();
}
