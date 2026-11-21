import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { pageHead } from "@/lib/head";
import { PageHeader, Panel } from "@/components/lab/Panel";
import { ImportCenter } from "@/components/lab/ImportCenter";
import { useServerFn } from "@tanstack/react-start";
import { getEngineHealth } from "@/lib/engine.functions";
import { StatusIndicator } from "@/components/lab/StatusIndicator";
import { Checkbox } from "@/components/ui/checkbox";
import { downloadCsv } from "@/components/lab/csv";
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

type Ds = {
  id: string; symbol: string; asset_class: string; version: number; timeframe: string; source_type: string;
  source_filename: string | null; candle_count: number; rejected_count: number; price_basis: string; timezone: string;
  validation_status: string; is_active: boolean; start_time_utc: string | null; end_time_utc: string | null; created_at: string;
  gap_report: { from: string; to: string; missing_bars: number; kind: string }[];
};

const fmt = (t: string | null) => (t ? t.slice(0, 16).replace("T", " ") : "—");

function DataPage() {
  const [search, setSearch] = useState("");
  const [onlyActive, setOnlyActive] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);
  const [gapsFor, setGapsFor] = useState<string | null>(null);
  const healthFn = useServerFn(getEngineHealth);
  const health = useQuery({ queryKey: ["engine-health"], queryFn: () => healthFn() });

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
      const { data, error } = await supabase.from("datasets")
        .select("id, version, timeframe, source_type, source_filename, candle_count, rejected_count, price_basis, timezone, validation_status, is_active, start_time_utc, end_time_utc, created_at, gap_report, instruments(symbol, asset_class)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data.map((d) => ({ ...d, symbol: d.instruments?.symbol ?? "?", asset_class: d.instruments?.asset_class ?? "", gap_report: (d.gap_report ?? []) as Ds["gap_report"] })) as Ds[];
    },
  });
  const rows = (ds.data ?? []).filter((d) => (!onlyActive || d.is_active) && (d.symbol + " " + (d.source_filename ?? "")).toLowerCase().includes(search.toLowerCase()));
  const selIds = selected.length ? selected : rows.filter((r) => r.is_active).map((r) => r.id);

  const coverage = useQuery({
    queryKey: ["coverage", selIds.join(",")],
    enabled: selIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("dataset_daily_coverage", { _dataset_ids: selIds });
      if (error) throw error;
      return data;
    },
  });
  const heatRows = selIds.map((id) => {
    const d = (ds.data ?? []).find((x) => x.id === id);
    const days = (coverage.data ?? []).filter((c) => c.dataset_id === id).map((c) => ({ day: c.day, bars: Number(c.bars) }));
    return d && d.start_time_utc && d.end_time_utc ? { label: `${d.symbol} v${d.version}`, start: d.start_time_utc, end: d.end_time_utc, days } : null;
  }).filter((x): x is NonNullable<typeof x> => x !== null);

  const gapDs = (ds.data ?? []).find((d) => d.id === gapsFor);
  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const m = health.data?.market;

  return (
    <div className="space-y-4">
      <PageHeader title="Data" subtitle="Each import creates a new immutable dataset version; nothing is ever overwritten in place." />

      <Panel title="Historical data manager" actions={
        <Button size="sm" variant="outline" onClick={() => downloadCsv("datasets.csv", rows.map(({ gap_report, ...r }) => ({ ...r, gaps: gap_report.length })))}>CSV</Button>
      }>
        <div className="mb-2 flex flex-wrap items-center gap-3">
          <Input className="h-7 w-56 text-xs" placeholder="Search instrument or file" value={search} onChange={(e) => setSearch(e.target.value)} />
          <label className="flex items-center gap-1.5 text-xs"><Checkbox checked={onlyActive} onCheckedChange={(v) => setOnlyActive(Boolean(v))} /> Active versions only</label>
          {selected.length > 0 && <button className="text-xs text-primary" onClick={() => setSelected([])}>Clear selection ({selected.length})</button>}
        </div>
        <div className="overflow-x-auto rounded-sm border">
          <table className="w-full text-xs">
            <thead className="bg-muted/50 text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>{["", "Instrument", "Class", "TF", "Source", "Ver", "Start UTC", "End UTC", "Bars", "Gaps", "Basis", "Imported", "Status", ""].map((h, i) => <th key={i} className="px-2 py-1.5 text-left font-medium">{h}</th>)}</tr>
            </thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={14} className="px-2 py-6 text-center text-muted-foreground">No datasets</td></tr>}
              {rows.map((d) => {
                const realGaps = d.gap_report.filter((g) => g.kind === "intraday_gap" || g.kind === "missing_or_holiday").length;
                return (
                  <tr key={d.id} className="border-t hover:bg-accent/40">
                    <td className="px-2 py-1"><Checkbox checked={selected.includes(d.id)} onCheckedChange={() => toggle(d.id)} aria-label={`Select ${d.symbol}`} /></td>
                    <td className="num px-2 py-1">{d.symbol}{d.is_active && <span className="ml-1 text-positive">●</span>}</td>
                    <td className="px-2 py-1">{d.asset_class}</td>
                    <td className="num px-2 py-1">{d.timeframe}</td>
                    <td className="max-w-40 truncate px-2 py-1" title={d.source_filename ?? ""}>{d.source_type}</td>
                    <td className="num px-2 py-1">v{d.version}</td>
                    <td className="num px-2 py-1">{fmt(d.start_time_utc)}</td>
                    <td className="num px-2 py-1">{fmt(d.end_time_utc)}</td>
                    <td className="num px-2 py-1">{Number(d.candle_count).toLocaleString()}</td>
                    <td className="num px-2 py-1">{d.gap_report.length ? <button className={realGaps ? "text-warning" : "text-muted-foreground"} onClick={() => setGapsFor(d.id)}>{realGaps} / {d.gap_report.length}</button> : "—"}</td>
                    <td className="px-2 py-1">{d.price_basis}</td>
                    <td className="num px-2 py-1">{fmt(d.created_at)}</td>
                    <td className={`px-2 py-1 ${d.validation_status === "valid" ? "text-positive" : d.validation_status === "warning" ? "text-warning" : d.validation_status === "pending" ? "text-muted-foreground" : "text-negative"}`}>{d.validation_status}</td>
                    <td className="px-2 py-1">{!d.is_active && d.validation_status !== "cancelled" && (
                      <button className="text-[11px] text-primary" onClick={async () => {
                        const target = (ds.data ?? []).find((x) => x.id === d.id)!;
                        const others = (ds.data ?? []).filter((x) => x.symbol === target.symbol && x.timeframe === target.timeframe && x.is_active);
                        for (const o of others) await supabase.from("datasets").update({ is_active: false }).eq("id", o.id);
                        const { error } = await supabase.from("datasets").update({ is_active: true }).eq("id", d.id);
                        if (error) toast.error(error.message); else { toast.success(`v${d.version} is now active`); ds.refetch(); }
                      }}>Make active</button>
                    )}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      {gapDs && (
        <Panel title={`Gaps — ${gapDs.symbol} v${gapDs.version}`} actions={<button className="text-xs" onClick={() => setGapsFor(null)}>Close</button>}>
          <p className="mb-2 text-[11px] text-muted-foreground">Weekend closures and the daily session break are labelled, not counted as missing. Candles are never filled in.</p>
          <div className="max-h-72 overflow-auto rounded-sm border">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted text-[10px] uppercase text-muted-foreground"><tr><th className="px-2 py-1 text-left">From (UTC)</th><th className="px-2 py-1 text-left">To</th><th className="px-2 py-1 text-left">Missing bars</th><th className="px-2 py-1 text-left">Type</th></tr></thead>
              <tbody>{gapDs.gap_report.map((g, i) => (
                <tr key={i} className="border-t"><td className="num px-2 py-0.5">{fmt(g.from)}</td><td className="num px-2 py-0.5">{fmt(g.to)}</td><td className="num px-2 py-0.5">{g.missing_bars}</td>
                  <td className={`px-2 py-0.5 ${g.kind === "intraday_gap" || g.kind === "missing_or_holiday" ? "text-warning" : "text-muted-foreground"}`}>{g.kind.replace(/_/g, " ")}</td></tr>
              ))}</tbody>
            </table>
          </div>
        </Panel>
      )}

      <Panel title={selected.length ? "Coverage — selected datasets" : "Coverage — active datasets"}>
        {coverage.isLoading ? <div className="py-6 text-center text-xs text-muted-foreground">Computing daily coverage…</div> : <CoverageHeatmap rows={heatRows} />}
      </Panel>

      <Panel title="Import center">
        <ImportCenter />
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Instruments & provider mapping">
          <AddInstrument />
          <DataTable data={inst.data ?? []} columns={instCols} exportName="instruments" empty="No instruments registered" />
        </Panel>
        <Panel title="Market data provider — RealMarketAPI">
          <StatusIndicator tone={!m?.configured ? "idle" : m.ok ? "ok" : "warn"} label="Status" value={m?.status ?? "…"} />
          <p className="mt-2 text-xs text-muted-foreground">The API key is saved as a server secret. Live streaming, symbol discovery and plan details are connected in Phase 3 through the Engine.</p>
        </Panel>
      </div>
    </div>
  );
}
