import { cn } from "@/lib/utils";

export type DayCell = { day: string; bars: number };

/** Calendar heatmap: one cell per day. Green complete, yellow partial, red large gap, grey no data / weekend. */
export function CoverageHeatmap({ rows }: { rows: { label: string; start: string; end: string; days: DayCell[] }[] }) {
  if (rows.length === 0) return <div className="py-6 text-center text-xs text-muted-foreground">No datasets selected</div>;
  return (
    <div className="space-y-3 overflow-x-auto">
      {rows.map((r) => {
        const map = new Map(r.days.map((d) => [d.day, d.bars]));
        const weekday = r.days.filter((d) => { const w = new Date(d.day + "T00:00:00Z").getUTCDay(); return w >= 1 && w <= 5; }).map((d) => d.bars).sort((a, b) => a - b);
        const median = weekday[Math.floor(weekday.length / 2)] ?? 0;
        const start = new Date(r.start.slice(0, 10) + "T00:00:00Z");
        const end = new Date(r.end.slice(0, 10) + "T00:00:00Z");
        start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7)); // Monday
        const weeks: { day: string; bars: number | undefined; dow: number }[][] = [];
        for (const d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
          const iso = d.toISOString().slice(0, 10);
          const dow = (d.getUTCDay() + 6) % 7;
          if (dow === 0) weeks.push([]);
          weeks[weeks.length - 1]!.push({ day: iso, bars: map.get(iso), dow });
        }
        let complete = 0, partial = 0, missing = 0;
        const shade = (bars: number | undefined, dow: number) => {
          const weekend = dow >= 5;
          if (bars === undefined) { if (!weekend) missing++; return weekend ? "bg-muted/40" : "bg-negative/70"; }
          const ratio = median ? bars / median : 1;
          if (weekend && bars < median * 0.5) return "bg-muted";
          if (ratio >= (dow === 4 ? 0.85 : 0.95)) { complete++; return "bg-positive/80"; }
          if (ratio >= 0.5) { partial++; return "bg-warning/70"; }
          missing++; return "bg-negative/70";
        };
        const grid = weeks.map((w, i) => (
          <div key={i} className="flex flex-col gap-[2px]">
            {Array.from({ length: 7 }, (_, dow) => {
              const c = w.find((x) => x.dow === dow);
              return c
                ? <div key={dow} title={`${c.day}: ${c.bars ?? 0} bars`} className={cn("h-2.5 w-2.5 rounded-[1px]", shade(c.bars, dow))} />
                : <div key={dow} className="h-2.5 w-2.5" />;
            })}
          </div>
        ));
        return (
          <div key={r.label} className="flex items-start gap-3">
            <div className="w-28 shrink-0">
              <div className="num text-xs">{r.label}</div>
              <div className="num text-[10px] text-muted-foreground">{complete} full · {partial} partial · {missing} gaps</div>
            </div>
            <div className="flex gap-[2px]">{grid}</div>
          </div>
        );
      })}
      <div className="flex gap-3 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1"><span className="h-2 w-2 bg-positive/80" />complete</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 bg-warning/70" />partial</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 bg-negative/70" />missing / large gap</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 bg-muted" />weekend / closed</span>
      </div>
    </div>
  );
}
