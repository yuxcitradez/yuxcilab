import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { pageHead } from "@/lib/head";
import { PageHeader, Panel, NotBuiltNotice } from "@/components/lab/Panel";
import { DataTable } from "@/components/lab/DataTable";
import { CoverageHeatmap } from "@/components/lab/CoverageHeatmap";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/data")({
  head: () => pageHead("Data", "Historical data manager, instruments and market-data provider status."),
  component: DataPage,
});

type Instrument = {
  id: string; symbol: string; display_name: string | null; asset_class: string;
  provider_symbol_code: string | null; digits: number; point_size: number; enabled: boolean;
  [k: string]: unknown;
};
const instCols: ColumnDef<Instrument, unknown>[] = [
  { accessorKey: "symbol", header: "Symbol" },
  { accessorKey: "display_name", header: "Name" },
  { accessorKey: "asset_class", header: "Class" },
  { accessorKey: "provider_symbol_code", header: "Provider code", cell: (c) => (c.getValue() as string) ?? "—" },
  { accessorKey: "digits", header: "Digits" },
  { accessorKey: "point_size", header: "Point" },
  { accessorKey: "enabled", header: "Enabled", cell: (c) => (c.getValue() ? "yes" : "no") },
];

type DatasetRow = {
  symbol: string; version: number; timeframe: string; candle_count: number; rejected_count: number;
  price_basis: string; validation_status: string; is_active: boolean; start: string; end: string;
  [k: string]: unknown;
};
const dsCols: ColumnDef<DatasetRow, unknown>[] = [
  { accessorKey: "symbol", header: "Instrument" },
  { accessorKey: "version", header: "Ver" },
  { accessorKey: "timeframe", header: "TF" },
  { accessorKey: "start", header: "Start UTC" },
  { accessorKey: "end", header: "End UTC" },
  { accessorKey: "candle_count", header: "Bars" },
  { accessorKey: "rejected_count", header: "Rejected" },
  { accessorKey: "price_basis", header: "Basis" },
  { accessorKey: "validation_status", header: "Status" },
  { accessorKey: "is_active", header: "Active", cell: (c) => (c.getValue() ? "●" : "") },
];

function AddInstrument() {
  const qc = useQueryClient();
  const [symbol, setSymbol] = useState("");
  const [assetClass, setAssetClass] = useState("forex");
  const [provider, setProvider] = useState("");
  const [digits, setDigits] = useState("5");
  const m = useMutation({
    mutationFn: async () => {
      const d = Number(digits);
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("instruments").insert({
        symbol: symbol.trim().toUpperCase(), asset_class: assetClass,
        provider_symbol_code: provider.trim() || null, digits: d, point_size: Math.pow(10, -d),
      });
      if (error) throw error;
      await supabase.from("audit_log").insert({ action: "instrument.created", entity: symbol.trim().toUpperCase(), user_id: u.user!.id });
    },
    onSuccess: () => {
      toast.success("Instrument added");
      setSymbol(""); setProvider("");
      qc.invalidateQueries({ queryKey: ["instruments"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!symbol.trim()) { toast.error("Enter a symbol"); return; }
    m.mutate();
  }
  return (
    <form onSubmit={submit} className="mb-3 flex flex-wrap items-end gap-2">
      <Input className="h-8 w-28 text-xs" placeholder="XAUUSD" value={symbol} onChange={(e) => setSymbol(e.target.value)} />
      <Select value={assetClass} onValueChange={setAssetClass}>
        <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          {["forex", "metal", "index", "crypto", "commodity", "future"].map((a) => (
            <SelectItem key={a} value={a} className="text-xs">{a}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input className="h-8 w-32 text-xs" placeholder="Provider code" value={provider} onChange={(e) => setProvider(e.target.value)} />
      <Input className="h-8 w-16 text-xs" type="number" min={0} max={8} value={digits} onChange={(e) => setDigits(e.target.value)} />
      <Button size="sm" type="submit" disabled={m.isPending}>Add instrument</Button>
    </form>
  );
}

function DataPage() {
  const inst = useQuery({
    queryKey: ["instruments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("instruments").select("*").order("symbol");
      if (error) throw error;
      return data as Instrument[];
    },
  });
  const ds = useQuery({
    queryKey: ["datasets-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("datasets")
        .select("version, timeframe, candle_count, rejected_count, price_basis, validation_status, is_active, start_time_utc, end_time_utc, instruments(symbol)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data.map((d) => ({
        symbol: d.instruments?.symbol ?? "?", version: d.version, timeframe: d.timeframe,
        candle_count: d.candle_count, rejected_count: d.rejected_count, price_basis: d.price_basis,
        validation_status: d.validation_status, is_active: d.is_active,
        start: d.start_time_utc?.slice(0, 16).replace("T", " ") ?? "—",
        end: d.end_time_utc?.slice(0, 16).replace("T", " ") ?? "—",
      })) as DatasetRow[];
    },
  });
  return (
    <div className="space-y-4">
      <PageHeader title="Data" subtitle="Historical datasets are immutable versions; overlapping imports never overwrite each other." />
      <NotBuiltNotice phase={2}>Bulk CSV import, column mapping and validation arrive in the next phase.</NotBuiltNotice>
      <Panel title="Instruments">
        <AddInstrument />
        <DataTable data={inst.data ?? []} columns={instCols} exportName="instruments" empty="No instruments registered" />
      </Panel>
      <Panel title="Datasets">
        <DataTable data={ds.data ?? []} columns={dsCols} exportName="datasets" empty="No datasets imported" />
      </Panel>
      <Panel title="Historical coverage">
        <CoverageHeatmap rows={[]} months={[]} />
      </Panel>
      <Panel title="Market data provider — RealMarketAPI">
        <p className="text-xs text-muted-foreground">
          Live data streams through the Python Engine. Configure the API key and Engine in Settings (Phase 3).
        </p>
      </Panel>
    </div>
  );
}
