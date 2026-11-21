import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-base font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({
  title,
  actions,
  children,
  className,
}: {
  title?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-md border bg-card", className)}>
      {title && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
          <h2 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {title}
          </h2>
          {actions}
        </div>
      )}
      <div className="p-3">{children}</div>
    </section>
  );
}

export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-sm border border-dashed px-4 py-8 text-center">
      <div className="text-sm text-foreground">{title}</div>
      {hint && <div className="mt-1 max-w-md text-xs text-muted-foreground">{hint}</div>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function NotBuiltNotice({ phase, children }: { phase: number; children: ReactNode }) {
  return (
    <div className="rounded-sm border border-warning/40 bg-warning/5 px-3 py-2 text-xs text-warning">
      <span className="num mr-2 uppercase">Phase {phase}</span>
      <span className="text-foreground/80">{children}</span>
    </div>
  );
}
