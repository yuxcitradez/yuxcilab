import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { supabase } from "@/integrations/supabase/client";
import { pageHead } from "@/lib/head";
import { MetricCard } from "@/components/lab/MetricCard";
import { Panel, PageHeader, EmptyState } from "@/components/lab/Panel";
import { EquityCurve } from "@/components/lab/Charts";
import { DataTable } from "@/components/lab/DataTable";

// Single development flag for clearly-labelled mock data. Keep false in normal use.
const SHOW_MOCK_DATA = false;

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () =>
    pageHead("Dashboard", "Overview of datasets, models, backtests and live paper deployments."),
  component: Dashboard,
});

async function count(
  table: "instruments" | "models" | "live_deployments" | "data_import_files",
  filter?: [string, string],
) {
  let q = supabase.from(table).select("id", { count: "exact", head: true });
  if (filter) q = q.eq(filter[0], filter[1]);
  const { count: c, error } = await q;
  if (error) throw error;
  return c ?? 0;
}

type RunRow = { id: string; status: string; created_at: string; completed_at: string | null };
const runCols: ColumnDef<RunRow, unknown>[] = [
  {
    accessorKey: "created_at",
    header: "Created",
    cell: (c) => String(c.getValue()).slice(0, 16).replace("T", " "),
  },
  { accessorKey: "status", header: "Status" },
  { accessorKey: "id", header: "Run", cell: (c) => String(c.getValue()).slice(0, 8) },
];

function Dashboard() {
  const stats = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const [instruments, models, active, importErrors, candles] = await Promise.all([
        count("instruments"),
        count("models"),
        count("live_deployments", ["status", "running"]),
        count("data_import_files", ["status", "failed"]),
        supabase.from("datasets").select("candle_count"),
      ]);
      const totalCandles = (candles.data ?? []).reduce((s, d) => s + Number(d.candle_count), 0);
      return { instruments, models, active, importErrors, totalCandles };
    },
  });
  const runs = useQuery({
    queryKey: ["recent-runs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("backtest_runs")
        .select("id, status, created_at, completed_at")
        .order("created_at", { ascending: false })
        .limit(8);
      if (error) throw error;
      return data as RunRow[];
    },
  });
  const events = useQuery({
    queryKey: ["recent-events"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("live_events")
        .select("id, ts, level, type, message")
        .order("ts", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data;
    },
  });
  const activity = useQuery({
    queryKey: ["recent-audit"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_log")
        .select("id, ts, action, entity")
        .order("ts", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data;
    },
  });
  const s = stats.data;
  const paper = useQuery({
    queryKey: ["dashboard-paper-equity"],
    refetchInterval: 5000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("live_equity")
        .select("ts,equity,drawdown,deployment_id")
        .order("ts", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data;
    },
  });
  const mockEquity = SHOW_MOCK_DATA
    ? Array.from({ length: 60 }, (_, i) => ({
        t: `D${i}`,
        v: 50000 + Math.sin(i / 5) * 800 + i * 40,
      }))
    : [];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Dashboard"
        subtitle="All figures read from the database. Simulation only — no real orders are ever placed."
      />
      {SHOW_MOCK_DATA && (
        <div className="rounded-sm border border-warning/50 px-3 py-1.5 text-xs text-warning">
          MOCK DATA — development flag enabled
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <MetricCard label="Instruments" value={s?.instruments ?? "—"} />
        <MetricCard label="Historical candles" value={s ? s.totalCandles.toLocaleString() : "—"} />
        <MetricCard label="Models" value={s?.models ?? "—"} />
        <MetricCard label="Active deployments" value={s?.active ?? "—"} />
        <MetricCard
          label="Paper equity"
          value={paper.data?.[0]?.equity.toFixed(2) ?? "—"}
          sub={
            paper.data?.length
              ? `Drawdown ${paper.data[0]?.drawdown.toFixed(2)}`
              : "No live deployment"
          }
        />
        <MetricCard
          label="Import errors"
          value={s?.importErrors ?? "—"}
          trend={s && s.importErrors > 0 ? "down" : "neutral"}
        />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Paper equity" className="lg:col-span-2">
          <EquityCurve
            data={
              SHOW_MOCK_DATA
                ? mockEquity
                : (paper.data ?? [])
                    .filter((p) => p.deployment_id === paper.data?.[0]?.deployment_id)
                    .reverse()
                    .map((p) => ({ t: p.ts, v: p.equity }))
            }
            height={220}
          />
        </Panel>
        <Panel title="Recent activity">
          {(activity.data ?? []).length === 0 ? (
            <EmptyState
              title="No activity yet"
              hint="Imports, model versions, backtests and deployments are logged here."
            />
          ) : (
            <ul className="space-y-1 text-xs">
              {(activity.data ?? []).map((a) => (
                <li key={a.id} className="flex justify-between gap-2">
                  <span>
                    {a.action} <span className="text-muted-foreground">{a.entity}</span>
                  </span>
                  <span className="num text-muted-foreground">
                    {a.ts.slice(5, 16).replace("T", " ")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Recent backtests">
          {(runs.data ?? []).length === 0 ? (
            <EmptyState
              title="No backtests yet"
              action={
                <Link to="/backtests" className="text-xs text-primary">
                  Go to Backtests →
                </Link>
              }
            />
          ) : (
            <DataTable data={runs.data ?? []} columns={runCols} />
          )}
        </Panel>
        <Panel title="Live deployment events">
          {(events.data ?? []).length === 0 ? (
            <EmptyState
              title="No live events"
              hint="Signals, fills, errors and feed status appear here once paper trading runs."
            />
          ) : (
            <ul className="space-y-1 text-xs">
              {(events.data ?? []).map((e) => (
                <li key={e.id} className="num flex gap-2">
                  <span className="text-muted-foreground">{e.ts.slice(11, 19)}</span>
                  <span className={e.level === "error" ? "text-negative" : ""}>{e.type}</span>
                  <span className="truncate text-muted-foreground">{e.message}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
