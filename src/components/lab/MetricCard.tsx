import { cn } from "@/lib/utils";

export function MetricCard({
  label, value, sub, trend,
}: { label: string; value: string | number; sub?: string; trend?: "up" | "down" | "neutral" }) {
  return (
    <div className="rounded-md border bg-card px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div
        className={cn(
          "num mt-1 text-lg",
          trend === "up" && "text-positive",
          trend === "down" && "text-negative",
        )}
      >
        {value}
      </div>
      {sub && <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}
