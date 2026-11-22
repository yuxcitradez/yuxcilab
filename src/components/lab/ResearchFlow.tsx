import { Link } from "@tanstack/react-router";
import { ArrowRight, Database, Code2, FlaskConical, Building2, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ResearchSearch } from "@/lib/research-flow";

const stages = [
  { to: "/data", label: "Historical data", icon: Database },
  { to: "/models", label: "Model & settings", icon: Code2 },
  { to: "/backtests", label: "Backtest", icon: FlaskConical },
  { to: "/prop-profiles", label: "Prop-firm environment", icon: Building2 },
  { to: "/expected-value", label: "Expected value", icon: TrendingUp },
] as const;

export function ResearchFlow({
  active,
  selection = {},
}: {
  active: (typeof stages)[number]["to"];
  selection?: ResearchSearch;
}) {
  return (
    <nav aria-label="Research workflow" className="flex flex-wrap items-center gap-1 border-b pb-3">
      {stages.map(({ to, label, icon: Icon }, index) => (
        <div key={to} className="flex min-w-0 items-center gap-1">
          {index > 0 &&
            (index === 1 ? (
              <span className="px-1 text-muted-foreground" aria-hidden="true">
                +
              </span>
            ) : (
              <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
            ))}
          <Button
            asChild
            size="sm"
            variant={active === to ? "secondary" : "ghost"}
            className="h-8 text-xs"
          >
            <Link to={to} search={selection} aria-current={active === to ? "step" : undefined}>
              <Icon className="h-3.5 w-3.5 shrink-0" />
              {label}
            </Link>
          </Button>
        </div>
      ))}
    </nav>
  );
}
