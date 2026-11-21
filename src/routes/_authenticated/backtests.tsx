import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Play, Square } from "lucide-react";
import { pageHead } from "@/lib/head";
import { launchJob, cancelJob } from "@/lib/lab.functions";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, Panel } from "@/components/lab/Panel";
import { MetricCard } from "@/components/lab/MetricCard";
import { EquityCurve, DrawdownChart } from "@/components/lab/Charts";
import { TradesTable, type TradeRow } from "@/components/lab/TradesTable";
import { DataTable } from "@/components/lab/DataTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  selectClass,
  useLibrary,
  useJobs,
  ModelOptions,
  ErrorText,
  JobStatus,
} from "@/components/lab/Workflow";
export const Route = createFileRoute("/_authenticated/backtests")({
  head: () =>
    pageHead(
      "Backtests",
      "Reproducible Python backtests with immutable data manifests, trades and equity.",
    ),
  component: BacktestsPage,
});
function BacktestsPage() {
  const library = useLibrary();
  const jobs = useJobs("backtest");
  const launch = useServerFn(launchJob);
  const cancel = useServerFn(cancelJob);
  const [version, setVersion] = useState("");
  const [datasets, setDatasets] = useState<string[]>([]);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [runId, setRunId] = useState("");
  const [jobId, setJobId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const runs = useQuery({
    queryKey: ["backtest-runs"],
    refetchInterval: 3000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("backtest_runs")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const selected = runs.data?.find((r) => r.id === runId) ?? runs.data?.[0];
  const activeJob = jobs.data?.find(
    (j) => (j.payload as Record<string, unknown>)["run_id"] === selected?.id,
  );
  const trades = useQuery({
    queryKey: ["backtest-trades", selected?.id],
    enabled: !!selected,
    refetchInterval: selected?.status === "running" ? 3000 : false,
    queryFn: async () => {
      if (!selected) return [];
      let rows: TradeRow[] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase
          .from("backtest_trades")
          .select("*")
          .eq("run_id", selected.id)
          .order("exit_time")
          .range(from, from + 999);
        if (error) throw error;
        rows.push(...data);
        if (data.length < 1000) break;
      }
      return rows;
    },
  });
  const metrics = selected?.metrics as {
    total_pnl?: number;
    max_drawdown?: number;
    trade_count?: number;
    hit_rate?: number;
    equity?: { t: string; v: number; drawdown: number }[];
    error?: string;
    instruments?: { symbol: string; warnings?: string[] }[];
  } | null;
  async function run() {
    setBusy(true);
    setError(null);
    try {
      const result = await launch({
        data: {
          kind: "backtest",
          modelVersionId: version,
          datasetIds: datasets,
          ...(start ? { start: `${start}T00:00:00Z` } : {}),
          ...(end ? { end: `${end}T23:59:59Z` } : {}),
        },
      });
      setJobId(result.jobId);
      if (result.runId) setRunId(result.runId);
      await runs.refetch();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-4">
      <PageHeader title="Backtests" />
      <Panel
        title="Run configuration"
        actions={
          <Button size="sm" disabled={busy || !version || !datasets.length} onClick={run}>
            <Play />
            {busy ? "Starting…" : "Run backtest"}
          </Button>
        }
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Model version">
            <select
              className={selectClass}
              value={version}
              onChange={(e) => setVersion(e.target.value)}
            >
              <option value="">Select model</option>
              <ModelOptions library={library.data} />
            </select>
          </Field>
          <Field label="Start date (UTC)">
            <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field label="End date (UTC)">
            <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
          </Field>
        </div>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-3">
          {library.data?.datasets.map((d) => (
            <label key={d.id} className="flex items-center gap-2 text-xs">
              <Checkbox
                checked={datasets.includes(d.id)}
                onCheckedChange={(checked) =>
                  setDatasets(checked ? [...datasets, d.id] : datasets.filter((id) => id !== d.id))
                }
              />
              {d.instruments?.symbol} · M1 v{d.version} · {d.price_basis}
            </label>
          ))}
        </div>
        <ErrorText error={error ?? library.error} />
        {jobId && <JobStatus jobId={jobId} />}
      </Panel>
      <Panel title="Runs">
        <DataTable
          data={runs.data ?? []}
          exportName="backtest_runs"
          columns={[
            {
              accessorKey: "created_at",
              header: "Created",
              cell: (c) => String(c.getValue()).slice(0, 16).replace("T", " "),
            },
            {
              accessorKey: "id",
              header: "Run",
              cell: (c) => (
                <Button size="sm" variant="link" onClick={() => setRunId(String(c.getValue()))}>
                  {String(c.getValue()).slice(0, 8)}
                </Button>
              ),
            },
            { accessorKey: "status", header: "Status" },
            {
              accessorKey: "progress",
              header: "Progress",
              cell: (c) => `${Math.round(Number(c.getValue()) * 100)}%`,
            },
          ]}
          empty="No backtests"
        />
        <ErrorText error={runs.error} />
      </Panel>
      {selected && (
        <>
          <div className="flex items-center justify-between">
            <h2 className="num text-xs">
              Run {selected.id.slice(0, 8)} · {selected.status}
            </h2>
            {activeJob && ["queued", "running"].includes(activeJob.status) && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => cancel({ data: { jobId: activeJob.id } }).catch(setError)}
              >
                <Square />
                Cancel
              </Button>
            )}
          </div>
          <ErrorText error={metrics?.error} />
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <MetricCard label="Net PnL" value={metrics?.total_pnl?.toFixed(2) ?? "—"} />
            <MetricCard label="Max drawdown" value={metrics?.max_drawdown?.toFixed(2) ?? "—"} />
            <MetricCard label="Trades" value={metrics?.trade_count ?? "—"} />
            <MetricCard
              label="TP hit rate"
              value={
                metrics?.hit_rate !== undefined ? `${(metrics.hit_rate * 100).toFixed(1)}%` : "—"
              }
            />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Equity">
              <EquityCurve data={metrics?.equity ?? []} />
            </Panel>
            <Panel title="Drawdown">
              <DrawdownChart
                data={metrics?.equity?.map((p) => ({ t: p.t, v: p.drawdown })) ?? []}
              />
            </Panel>
          </div>
          <Panel title="Trades">
            <TradesTable trades={trades.data ?? []} />
            <ErrorText error={trades.error} />
          </Panel>
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground">
              Reproducibility manifest
            </summary>
            <pre className="mt-2 overflow-auto whitespace-pre-wrap break-all">
              {JSON.stringify(
                { config: selected.config, datasets: selected.dataset_manifest },
                null,
                2,
              )}
            </pre>
          </details>
          {metrics?.instruments?.flatMap((i) =>
            i.warnings?.map((w) => (
              <p key={i.symbol + w} className="text-xs text-warning">
                {i.symbol}: {w}
              </p>
            )),
          )}
        </>
      )}
    </div>
  );
}
