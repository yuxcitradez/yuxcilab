import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { supabase } from "@/integrations/supabase/client";
import { pageHead } from "@/lib/head";
import { PageHeader, Panel, NotBuiltNotice } from "@/components/lab/Panel";
import { DataTable } from "@/components/lab/DataTable";
import { EquityCurve, DrawdownChart } from "@/components/lab/Charts";

export const Route = createFileRoute("/_authenticated/backtests")({
  head: () => pageHead("Backtests", "Reproducible multi-asset backtests on versioned M1 datasets."),
  component: BacktestsPage,
});

type Row = { id: string; status: string; progress: number; created_at: string; completed_at: string | null; [k: string]: unknown };
const cols: ColumnDef<Row, unknown>[] = [
  { accessorKey: "created_at", header: "Created", cell: (c) => String(c.getValue()).slice(0, 16).replace("T", " ") },
  { accessorKey: "id", header: "Run", cell: (c) => String(c.getValue()).slice(0, 8) },
  { accessorKey: "status", header: "Status" },
  { accessorKey: "progress", header: "Progress", cell: (c) => `${Math.round(Number(c.getValue()) * 100)}%` },
  { accessorKey: "completed_at", header: "Completed", cell: (c) => (c.getValue() ? String(c.getValue()).slice(0, 16).replace("T", " ") : "—") },
];

function BacktestsPage() {
  const q = useQuery({
    queryKey: ["backtest-runs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("backtest_runs").select("id, status, progress, created_at, completed_at").order("created_at", { ascending: false });
      if (error) throw error;
      return data as Row[];
    },
  });
  return (
    <div className="space-y-4">
      <PageHeader title="Backtests" subtitle="Each run records the exact dataset IDs, versions and checksums it used." />
      <NotBuiltNotice phase={5}>Run configuration and execution need validated models and the Engine.</NotBuiltNotice>
      <Panel title="Runs">
        <DataTable data={q.data ?? []} columns={cols} exportName="backtest_runs" empty="No backtest runs" />
      </Panel>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Equity"><EquityCurve data={[]} /></Panel>
        <Panel title="Drawdown"><DrawdownChart data={[]} height={200} /></Panel>
      </div>
    </div>
  );
}
