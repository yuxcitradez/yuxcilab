import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { supabase } from "@/integrations/supabase/client";
import { pageHead } from "@/lib/head";
import { PageHeader, Panel, NotBuiltNotice } from "@/components/lab/Panel";
import { DataTable } from "@/components/lab/DataTable";
import { ValidationResult } from "@/components/lab/ValidationResult";

export const Route = createFileRoute("/_authenticated/models")({
  head: () => pageHead("Models", "Python trading models, immutable versions and contract validation."),
  component: ModelsPage,
});

type Row = { name: string; description: string | null; versions: number; updated_at: string; [k: string]: unknown };
const cols: ColumnDef<Row, unknown>[] = [
  { accessorKey: "name", header: "Model" },
  { accessorKey: "description", header: "Description" },
  { accessorKey: "versions", header: "Versions" },
  { accessorKey: "updated_at", header: "Updated", cell: (c) => String(c.getValue()).slice(0, 16).replace("T", " ") },
];

function ModelsPage() {
  const q = useQuery({
    queryKey: ["models"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("models").select("name, description, updated_at, model_versions(id)").order("updated_at", { ascending: false });
      if (error) throw error;
      return data.map((m) => ({ name: m.name, description: m.description, updated_at: m.updated_at, versions: m.model_versions.length })) as Row[];
    },
  });
  return (
    <div className="space-y-4">
      <PageHeader title="Models" subtitle="Model code runs only inside the Python Engine sandbox — never in the browser." />
      <NotBuiltNotice phase={4}>Code editor, upload and sandboxed validation require the Python Engine.</NotBuiltNotice>
      <Panel title="Models">
        <DataTable data={q.data ?? []} columns={cols} exportName="models" empty="No models yet" />
      </Panel>
      <Panel title="Acceptance tests (Model Contract v1)">
        <ValidationResult
          checks={[
            { name: "Causality (no look-ahead)", status: "pending" },
            { name: "Determinism", status: "pending" },
            { name: "Daylight-saving correctness", status: "pending" },
            { name: "Golden results", status: "pending" },
            { name: "Sandbox security and limits", status: "pending" },
          ]}
        />
      </Panel>
    </div>
  );
}
