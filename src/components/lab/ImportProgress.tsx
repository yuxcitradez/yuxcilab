import { Progress } from "@/components/ui/progress";

export function ImportProgress({ filename, progress, status, accepted, rejected }: {
  filename: string; progress: number; status: string; accepted: number; rejected: number;
}) {
  return (
    <div className="space-y-1 rounded-sm border px-3 py-2">
      <div className="flex justify-between text-xs">
        <span className="num truncate">{filename}</span>
        <span className="text-muted-foreground">{status}</span>
      </div>
      <Progress value={progress * 100} className="h-1" />
      <div className="num flex gap-3 text-[11px]">
        <span className="text-positive">{accepted.toLocaleString()} ok</span>
        <span className="text-negative">{rejected.toLocaleString()} rejected</span>
      </div>
    </div>
  );
}
