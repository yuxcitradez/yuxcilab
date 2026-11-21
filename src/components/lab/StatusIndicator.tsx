import { cn } from "@/lib/utils";

export type Tone = "ok" | "warn" | "error" | "idle";
const DOT: Record<Tone, string> = {
  ok: "bg-positive",
  warn: "bg-warning",
  error: "bg-negative",
  idle: "bg-muted-foreground/50",
};

export function StatusIndicator({ tone, label, value }: { tone: Tone; label: string; value?: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={cn("h-1.5 w-1.5 rounded-full", DOT[tone], tone === "ok" && "animate-pulse")} />
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      {value && <span className="num text-xs">{value}</span>}
    </div>
  );
}
