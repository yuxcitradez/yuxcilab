import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Upload, X, RotateCcw, Ban, FileDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { startImport, cancelImport } from "@/lib/imports.functions";
import { guessSymbol, parsePreview, type Mapping } from "@/lib/csv-sniff";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ImportProgress } from "./ImportProgress";
import { downloadCsv } from "./csv";

const TIMEZONES = ["UTC", "Etc/GMT-2", "Etc/GMT-3", "Europe/London", "Europe/Berlin", "America/New_York", "America/Chicago", "Asia/Tokyo"];
const BASES = ["bid", "ask", "mid", "last", "unknown"];
const CLASSES = ["forex", "index", "metal", "commodity", "crypto", "stock", "other"];
const MAP_KEYS: (keyof Mapping)[] = ["timestamp", "date", "time", "symbol", "open", "high", "low", "close", "volume", "spread"];

type Draft = {
  key: string; file: File; preview: ReturnType<typeof parsePreview>;
  mode: "per_file" | "combined"; instrumentId: string | null; newSymbol: string; assetClass: string;
  timeframe: string; timezone: string; timestampFormat: string; priceBasis: string; spreadUnit: string; volumeType: string;
  writeMode: "new_version" | "append" | "replace_range"; replaceStart: string; replaceEnd: string; mapping: Mapping;
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function Pick({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { v: string; l: string }[] }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
      <SelectContent>{options.map((o) => <SelectItem key={o.v} value={o.v} className="text-xs">{o.l}</SelectItem>)}</SelectContent>
    </Select>
  );
}

export function ImportCenter() {
  const qc = useQueryClient();
  const start = useServerFn(startImport);
  const cancel = useServerFn(cancelImport);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const instruments = useQuery({
    queryKey: ["instruments", "picker"],
    queryFn: async () => (await supabase.from("instruments").select("id, symbol, asset_class").order("symbol")).data ?? [],
  });

  const files = useQuery({
    queryKey: ["import-files"],
    queryFn: async () => {
      const { data, error } = await supabase.from("data_import_files")
        .select("id, batch_id, filename, status, progress, accepted_rows, rejected_rows, duplicate_rows, conflict_rows, existing_rows, source_rows, error_message, validation_report, created_at")
        .order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      return data;
    },
    refetchInterval: (q) => (q.state.data?.some((f) => ["queued", "processing"].includes(f.status)) ? 3000 : false),
  });

  useEffect(() => {
    const ch = supabase.channel(`imports-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "data_import_files" }, () => {
        qc.invalidateQueries({ queryKey: ["import-files"] });
        qc.invalidateQueries({ queryKey: ["datasets-all"] });
      }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  async function addFiles(list: FileList | File[]) {
    const out: Draft[] = [];
    for (const file of Array.from(list)) {
      if (!/\.(csv|txt|tsv)$/i.test(file.name)) { toast.error(`${file.name}: not a CSV file`); continue; }
      const text = await file.slice(0, 64 * 1024).text();
      const preview = parsePreview(text);
      const sym = guessSymbol(file.name);
      const match = instruments.data?.find((i) => i.symbol === sym || (sym === "USTEC" && i.symbol === "NAS100"));
      out.push({
        key: `${file.name}-${file.size}-${Math.random()}`, file, preview,
        mode: preview.mapping.symbol ? "combined" : "per_file",
        instrumentId: match?.id ?? null, newSymbol: match ? "" : sym, assetClass: "forex",
        timeframe: "M1", timezone: "UTC", timestampFormat: "auto",
        priceBasis: preview.columns.some((c) => c.includes("<")) ? "bid" : "unknown",
        spreadUnit: "points", volumeType: preview.mapping.volume?.toLowerCase().includes("tick") ? "tick" : "real",
        writeMode: "new_version", replaceStart: "", replaceEnd: "", mapping: preview.mapping,
      });
    }
    setDrafts((d) => [...d, ...out]);
  }

  const upd = (key: string, patch: Partial<Draft>) => setDrafts((ds) => ds.map((d) => (d.key === key ? { ...d, ...patch } : d)));

  async function submit() {
    if (!drafts.length) return;
    for (const d of drafts) {
      if (d.mode === "per_file" && !d.instrumentId && !d.newSymbol.trim()) { toast.error(`${d.file.name}: choose an instrument`); return; }
      if (d.writeMode === "replace_range" && (!d.replaceStart || !d.replaceEnd)) { toast.error(`${d.file.name}: set the replace range`); return; }
    }
    if (drafts.some((d) => d.writeMode === "replace_range") && !confirm("Replace range creates a new version where the selected dates come from the new file. Continue?")) return;
    setBusy(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user!.id;
      const { data: batch, error: bErr } = await supabase.from("data_import_batches")
        .insert({ upload_mode: drafts.some((d) => d.mode === "combined") ? "combined" : "per_file", total_files: drafts.length, status: "uploading" })
        .select("id").single();
      if (bErr) throw bErr;
      for (const d of drafts) {
        let instrumentId = d.instrumentId;
        if (d.mode === "per_file" && !instrumentId) {
          const { data: inst, error } = await supabase.from("instruments")
            .insert({ symbol: d.newSymbol.trim().toUpperCase(), display_name: d.newSymbol.trim().toUpperCase(), asset_class: d.assetClass })
            .select("id").single();
          if (error) throw error;
          instrumentId = inst.id;
        }
        const path = `${uid}/${batch.id}/${crypto.randomUUID()}-${d.file.name.replace(/[^\w.-]/g, "_")}`;
        const { error: upErr } = await supabase.storage.from("imports").upload(path, d.file, { contentType: "text/csv" });
        if (upErr) throw upErr;
        const config = {
          mode: d.mode, instrument_id: instrumentId, asset_class: d.assetClass, timeframe: d.timeframe, timezone: d.timezone,
          timestamp_format: d.timestampFormat, price_basis: d.priceBasis, spread_unit: d.spreadUnit, volume_type: d.volumeType,
          write_mode: d.writeMode, replace_start: d.replaceStart || null, replace_end: d.replaceEnd || null,
          mapping: d.mapping, delimiter: d.preview.delimiter, activate: true,
        };
        const { error: fErr } = await supabase.from("data_import_files").insert({
          batch_id: batch.id, filename: d.file.name, instrument_id: instrumentId, storage_path: path, config, status: "pending",
        });
        if (fErr) throw fErr;
      }
      const res = await start({ data: { batchId: batch.id } });
      if (res.ok) toast.success("Import started"); else toast.warning(res.error ?? "Import not started");
      setDrafts([]);
      qc.invalidateQueries({ queryKey: ["import-files"] });
      qc.invalidateQueries({ queryKey: ["instruments"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function downloadRejections(fileId: string, name: string) {
    const rows: Record<string, unknown>[] = [];
    for (let from = 0; ; from += 1000) {
      const { data } = await supabase.from("import_rejections").select("row_number, reason, raw_row").eq("file_id", fileId).order("row_number").range(from, from + 999);
      rows.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
    if (!rows.length) { toast.info("No rejected rows"); return; }
    downloadCsv(`${name}-rejections.csv`, rows);
  }

  function downloadReport(f: { filename: string; validation_report: unknown }) {
    const blob = new Blob([JSON.stringify(f.validation_report, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${f.filename}-validation.json`;
    a.click();
  }

  const instOpts = [{ v: "__new", l: "+ New instrument" }, ...(instruments.data ?? []).map((i) => ({ v: i.id, l: i.symbol }))];

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }}
        onClick={() => inputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-sm border border-dashed px-4 py-6 text-xs transition-colors ${drag ? "border-primary bg-primary/5" : "hover:bg-accent/30"}`}
      >
        <Upload className="h-4 w-4 text-muted-foreground" />
        <span>Drop CSV files here or click to choose — several at once, or one file with a symbol column</span>
        <span className="text-muted-foreground">Files go to private storage; the Engine validates and imports them.</span>
        <input ref={inputRef} type="file" accept=".csv,.txt,.tsv" multiple hidden onChange={(e) => e.target.files && addFiles(e.target.files)} />
      </div>

      {drafts.map((d) => (
        <div key={d.key} className="space-y-2 rounded-sm border p-3">
          <div className="flex items-center justify-between">
            <span className="num text-xs">{d.file.name} <span className="text-muted-foreground">· {(d.file.size / 1e6).toFixed(1)} MB</span></span>
            <button onClick={() => setDrafts((ds) => ds.filter((x) => x.key !== d.key))} aria-label="Remove file"><X className="h-3.5 w-3.5" /></button>
          </div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-6">
            <Field label="Upload type"><Pick value={d.mode} onChange={(v) => upd(d.key, { mode: v as Draft["mode"] })} options={[{ v: "per_file", l: "One instrument" }, { v: "combined", l: "Multi-symbol" }]} /></Field>
            {d.mode === "per_file" && (
              <Field label="Instrument"><Pick value={d.instrumentId ?? "__new"} onChange={(v) => upd(d.key, { instrumentId: v === "__new" ? null : v })} options={instOpts} /></Field>
            )}
            {d.mode === "per_file" && !d.instrumentId && (
              <Field label="New symbol"><Input className="h-7 text-xs" value={d.newSymbol} onChange={(e) => upd(d.key, { newSymbol: e.target.value })} /></Field>
            )}
            <Field label="Asset class"><Pick value={d.assetClass} onChange={(v) => upd(d.key, { assetClass: v })} options={CLASSES.map((c) => ({ v: c, l: c }))} /></Field>
            <Field label="Timeframe"><Pick value={d.timeframe} onChange={(v) => upd(d.key, { timeframe: v })} options={["M1", "M5", "M15", "H1"].map((c) => ({ v: c, l: c }))} /></Field>
            <Field label="Timezone"><Pick value={d.timezone} onChange={(v) => upd(d.key, { timezone: v })} options={TIMEZONES.map((c) => ({ v: c, l: c === "UTC" ? "UTC (Exness server)" : c }))} /></Field>
            <Field label="Timestamp format"><Input className="h-7 text-xs" value={d.timestampFormat} onChange={(e) => upd(d.key, { timestampFormat: e.target.value })} placeholder="auto or %Y.%m.%d %H:%M:%S" /></Field>
            <Field label="Price basis"><Pick value={d.priceBasis} onChange={(v) => upd(d.key, { priceBasis: v })} options={BASES.map((c) => ({ v: c, l: c }))} /></Field>
            <Field label="Volume type"><Pick value={d.volumeType} onChange={(v) => upd(d.key, { volumeType: v })} options={["tick", "real", "unknown"].map((c) => ({ v: c, l: c }))} /></Field>
            <Field label="Spread unit"><Pick value={d.spreadUnit} onChange={(v) => upd(d.key, { spreadUnit: v })} options={["points", "pips", "price"].map((c) => ({ v: c, l: c }))} /></Field>
            <Field label="If data overlaps"><Pick value={d.writeMode} onChange={(v) => upd(d.key, { writeMode: v as Draft["writeMode"] })} options={[{ v: "new_version", l: "New version (file only)" }, { v: "append", l: "Append new timestamps" }, { v: "replace_range", l: "Replace date range" }]} /></Field>
            {d.writeMode === "replace_range" && (<>
              <Field label="Replace from (UTC)"><Input type="datetime-local" className="h-7 text-xs" value={d.replaceStart} onChange={(e) => upd(d.key, { replaceStart: e.target.value })} /></Field>
              <Field label="Replace to (UTC)"><Input type="datetime-local" className="h-7 text-xs" value={d.replaceEnd} onChange={(e) => upd(d.key, { replaceEnd: e.target.value })} /></Field>
            </>)}
          </div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-5 xl:grid-cols-10">
            {MAP_KEYS.map((k) => (
              <Field key={k} label={k}>
                <Pick value={d.mapping[k] ?? "__none"} onChange={(v) => upd(d.key, { mapping: { ...d.mapping, [k]: v === "__none" ? undefined : v } })}
                  options={[{ v: "__none", l: "—" }, ...d.preview.columns.map((c) => ({ v: c, l: c }))]} />
              </Field>
            ))}
          </div>
          <div className="max-h-56 overflow-auto rounded-sm border">
            <table className="w-full text-[11px]">
              <thead className="sticky top-0 bg-muted"><tr>{d.preview.columns.map((c) => <th key={c} className="px-2 py-1 text-left font-normal text-muted-foreground">{c}</th>)}</tr></thead>
              <tbody>{d.preview.rows.map((r, i) => <tr key={i} className="border-t">{r.map((c, j) => <td key={j} className="num px-2 py-0.5">{c}</td>)}</tr>)}</tbody>
            </table>
          </div>
        </div>
      ))}
      {drafts.length > 0 && (
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="outline" onClick={() => setDrafts([])}>Clear</Button>
          <Button size="sm" onClick={submit} disabled={busy}>{busy ? "Uploading…" : `Upload & import ${drafts.length} file${drafts.length > 1 ? "s" : ""}`}</Button>
        </div>
      )}

      <div className="space-y-2">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Import history</div>
        {(files.data ?? []).length === 0 && <div className="text-xs text-muted-foreground">No imports yet</div>}
        {(files.data ?? []).map((f) => (
          <div key={f.id} className="space-y-1">
            <ImportProgress filename={f.filename} progress={Number(f.progress)} status={f.status} accepted={Number(f.accepted_rows)} rejected={Number(f.rejected_rows)} />
            <div className="flex flex-wrap items-center gap-3 px-1 text-[11px] text-muted-foreground">
              {f.status === "completed" && <span className="num">source {Number(f.source_rows).toLocaleString()} · dupes {f.duplicate_rows} · conflicts {f.conflict_rows} · already present {Number(f.existing_rows).toLocaleString()}</span>}
              {f.error_message && <span className="text-negative">{f.error_message}</span>}
              {["failed", "cancelled", "waiting_engine"].includes(f.status) && (
                <button className="inline-flex items-center gap-1 text-primary" onClick={async () => { const r = await start({ data: { batchId: f.batch_id, fileIds: [f.id] } }); if (!r.ok) toast.warning(r.error ?? "Retry failed"); qc.invalidateQueries({ queryKey: ["import-files"] }); }}>
                  <RotateCcw className="h-3 w-3" /> Retry
                </button>
              )}
              {["pending", "queued", "processing", "waiting_engine"].includes(f.status) && (
                <button className="inline-flex items-center gap-1" onClick={async () => { await cancel({ data: { fileId: f.id } }); qc.invalidateQueries({ queryKey: ["import-files"] }); }}>
                  <Ban className="h-3 w-3" /> Cancel
                </button>
              )}
              {f.status === "completed" && (<>
                <button className="inline-flex items-center gap-1" onClick={() => downloadReport(f)}><FileDown className="h-3 w-3" /> Report</button>
                <button className="inline-flex items-center gap-1" onClick={() => downloadRejections(f.id, f.filename)}><FileDown className="h-3 w-3" /> Rejected rows</button>
              </>)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
