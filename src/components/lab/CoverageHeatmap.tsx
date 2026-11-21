import { cn } from "@/lib/utils";

/** rows: instruments; cells: months with coverage ratio 0..1 (null = no data). */
export function CoverageHeatmap({
  rows, months,
}: { rows: { label: string; cells: (number | null)[] }[]; months: string[] }) {
  if (rows.length === 0)
    return <div className="py-6 text-center text-xs text-muted-foreground">No datasets imported yet</div>;
  const shade = (v: number | null) =>
    v === null ? "bg-muted/40" : v > 0.98 ? "bg-positive/80" : v > 0.9 ? "bg-positive/50" : v > 0.5 ? "bg-warning/60" : "bg-negative/60";
  return (
    <div className="overflow-x-auto">
      <table className="text-[10px]">
        <thead>
          <tr>
            <th />
            {months.map((m) => (
              <th key={m} className="num px-0.5 font-normal text-muted-foreground">{m}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <td className="num pr-2 text-xs">{r.label}</td>
              {r.cells.map((c, i) => (
                <td key={i} className="p-0.5">
                  <div title={c === null ? "no data" : `${(c * 100).toFixed(1)}%`} className={cn("h-3.5 w-5 rounded-[2px]", shade(c))} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
