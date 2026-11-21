import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import type { ColumnDef } from "@tanstack/react-table";
import { supabase } from "@/integrations/supabase/client";
import { getEngineHealth } from "@/lib/engine.functions";
import { pageHead } from "@/lib/head";
import { PageHeader, Panel } from "@/components/lab/Panel";
import { DataTable } from "@/components/lab/DataTable";
import { StatusIndicator } from "@/components/lab/StatusIndicator";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => pageHead("Settings", "Engine, market-data provider, account security and audit log."),
  component: SettingsPage,
});

type Audit = { ts: string; action: string; entity: string | null; entity_id: string | null; [k: string]: unknown };
const cols: ColumnDef<Audit, unknown>[] = [
  { accessorKey: "ts", header: "Time", cell: (c) => String(c.getValue()).slice(0, 19).replace("T", " ") },
  { accessorKey: "action", header: "Action" },
  { accessorKey: "entity", header: "Entity" },
  { accessorKey: "entity_id", header: "ID" },
];

function SettingsPage() {
  const healthFn = useServerFn(getEngineHealth);
  const h = useQuery({ queryKey: ["engine-health"], queryFn: () => healthFn() });
  const user = useQuery({ queryKey: ["me"], queryFn: async () => (await supabase.auth.getUser()).data.user });
  const audit = useQuery({
    queryKey: ["audit"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_log").select("ts, action, entity, entity_id").order("ts", { ascending: false }).limit(500);
      if (error) throw error;
      return data as Audit[];
    },
  });
  const e = h.data?.engine;
  const m = h.data?.market;
  return (
    <div className="space-y-4">
      <PageHeader title="Settings" />
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Python Engine">
          <StatusIndicator tone={!e?.configured ? "idle" : e.ok ? "ok" : "error"} label="Status" value={e?.status ?? "…"} />
          {e?.latencyMs !== undefined && <div className="num mt-1 text-xs text-muted-foreground">{e.latencyMs} ms</div>}
          <p className="mt-2 text-xs text-muted-foreground">
            Requires server secrets <span className="num">ENGINE_URL</span> and <span className="num">ENGINE_TOKEN</span>. Never exposed to the browser.
          </p>
        </Panel>
        <Panel title="RealMarketAPI">
          <StatusIndicator tone={!m?.configured ? "idle" : m.ok ? "ok" : "warn"} label="Status" value={m?.status ?? "…"} />
          <p className="mt-2 text-xs text-muted-foreground">
            API key is stored as an Engine/server secret only (<span className="num">REALMARKETAPI_KEY</span>).
          </p>
        </Panel>
        <Panel title="Account">
          <div className="text-xs">Signed in as <span className="num">{user.data?.email ?? "…"}</span></div>
          <p className="mt-2 text-xs text-muted-foreground">Single administrator. Public registration is disabled.</p>
        </Panel>
      </div>
      <Panel title="Audit log">
        <DataTable data={audit.data ?? []} columns={cols} exportName="audit_log" empty="No audit entries" />
      </Panel>
    </div>
  );
}
