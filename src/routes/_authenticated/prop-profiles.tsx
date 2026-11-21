import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { supabase } from "@/integrations/supabase/client";
import { pageHead } from "@/lib/head";
import { PageHeader, Panel, NotBuiltNotice } from "@/components/lab/Panel";
import { DataTable } from "@/components/lab/DataTable";

export const Route = createFileRoute("/_authenticated/prop-profiles")({
  head: () => pageHead("Prop Profiles", "Futures and forex prop-firm evaluation and funded-account rule sets."),
  component: PropPage,
});

type Row = { name: string; firm_name: string | null; updated_at: string; [k: string]: unknown };
const cols: ColumnDef<Row, unknown>[] = [
  { accessorKey: "name", header: "Profile" },
  { accessorKey: "firm_name", header: "Firm" },
  { accessorKey: "updated_at", header: "Updated", cell: (c) => String(c.getValue()).slice(0, 16).replace("T", " ") },
];

function PropPage() {
  const q = useQuery({
    queryKey: ["prop-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("prop_profiles").select("name, firm_name, updated_at").order("name");
      if (error) throw error;
      return data as Row[];
    },
  });
  return (
    <div className="space-y-4">
      <PageHeader title="Prop Profiles" subtitle="Rules are enforced exactly as configured." />
      <NotBuiltNotice phase={6}>Profile editor, lifecycle simulation, EV and ruin probability come in Phase 6.</NotBuiltNotice>
      <Panel title="Profiles">
        <DataTable data={q.data ?? []} columns={cols} exportName="prop_profiles" empty="No prop profiles" />
      </Panel>
    </div>
  );
}
