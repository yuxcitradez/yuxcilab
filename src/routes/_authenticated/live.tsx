import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { supabase } from "@/integrations/supabase/client";
import { pageHead } from "@/lib/head";
import { PageHeader, Panel, NotBuiltNotice } from "@/components/lab/Panel";
import { DataTable } from "@/components/lab/DataTable";
import { EquityCurve } from "@/components/lab/Charts";
import { TradesTable } from "@/components/lab/TradesTable";

export const Route = createFileRoute("/_authenticated/live")({
  head: () => pageHead("Live", "Paper-trading deployments on live market data. No real orders are ever sent."),
  component: LivePage,
});

type Row = { id: string; status: string; started_at: string | null; stopped_at: string | null; [k: string]: unknown };
const cols: ColumnDef<Row, unknown>[] = [
  { accessorKey: "id", header: "Deployment", cell: (c) => String(c.getValue()).slice(0, 8) },
  { accessorKey: "status", header: "Status" },
  { accessorKey: "started_at", header: "Started", cell: (c) => (c.getValue() ? String(c.getValue()).slice(0, 16).replace("T", " ") : "—") },
  { accessorKey: "stopped_at", header: "Stopped", cell: (c) => (c.getValue() ? String(c.getValue()).slice(0, 16).replace("T", " ") : "—") },
];

function LivePage() {
  const q = useQuery({
    queryKey: ["deployments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("live_deployments").select("id, status, started_at, stopped_at").order("created_at", { ascending: false });
      if (error) throw error;
      return data as Row[];
    },
  });
  return (
    <div className="space-y-4">
      <PageHeader title="Live paper trading" subtitle="All positions, fills and equity are simulated. The platform never places real trades." />
      <NotBuiltNotice phase={7}>Deployments need the persistent Engine worker and RealMarketAPI stream.</NotBuiltNotice>
      <Panel title="Deployments">
        <DataTable data={q.data ?? []} columns={cols} exportName="deployments" empty="No deployments" />
      </Panel>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Paper equity"><EquityCurve data={[]} /></Panel>
        <Panel title="Paper trades"><TradesTable trades={[]} exportName="live_trades" /></Panel>
      </div>
    </div>
  );
}
