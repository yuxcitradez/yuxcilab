import { CheckCircle2, AlertTriangle, XCircle, CircleDashed } from "lucide-react";

export type Check = { name: string; status: "pass" | "warn" | "fail" | "pending"; detail?: string };
const ICON = {
  pass: <CheckCircle2 className="h-3.5 w-3.5 text-positive" />,
  warn: <AlertTriangle className="h-3.5 w-3.5 text-warning" />,
  fail: <XCircle className="h-3.5 w-3.5 text-negative" />,
  pending: <CircleDashed className="h-3.5 w-3.5 text-muted-foreground" />,
};

export function ValidationResult({ checks }: { checks: Check[] }) {
  return (
    <ul className="space-y-1">
      {checks.map((c) => (
        <li key={c.name} className="flex items-start gap-2 text-xs">
          {ICON[c.status]}
          <span>{c.name}</span>
          {c.detail && <span className="text-muted-foreground">— {c.detail}</span>}
        </li>
      ))}
    </ul>
  );
}
