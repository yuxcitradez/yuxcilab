import { createFileRoute } from "@tanstack/react-router";

/**
 * Callback endpoint for the Python Engine. Authenticated with the shared ENGINE_TOKEN.
 * Every write is scoped to the user_id the Engine was given by engine-proxy, and ownership
 * of referenced rows is checked before writing.
 */

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

type Body = Record<string, unknown> & { user_id: string };
const FILE_PATCH_KEYS = new Set([
  "status", "progress", "error_message", "file_sha256", "dataset_id", "validation_report",
  "source_rows", "accepted_rows", "rejected_rows", "duplicate_rows", "conflict_rows", "existing_rows",
]);

export const Route = createFileRoute("/api/public/engine/$")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const token = process.env["ENGINE_TOKEN"];
        const auth = request.headers.get("authorization") ?? "";
        if (!token || !safeEqual(auth, `Bearer ${token}`)) {
          return new Response("unauthorized", { status: 401 });
        }
        const body = (await request.json()) as Body;
        const uid = body.user_id;
        if (typeof uid !== "string" || !/^[0-9a-f-]{36}$/.test(uid)) {
          return new Response("bad user", { status: 400 });
        }
        const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
        const owns = async (table: "datasets" | "instruments" | "data_import_files" | "data_import_batches", id: unknown) => {
          if (typeof id !== "string") return false;
          const { data } = await db.from(table).select("user_id").eq("id", id).maybeSingle();
          return data?.user_id === uid;
        };
        const json = (d: unknown) => Response.json(d);
        const fail = (m: string, s = 400) => new Response(m, { status: s });

        switch (params._splat) {
          case "files/update": {
            if (!(await owns("data_import_files", body["file_id"]))) return fail("forbidden", 403);
            const patch: Record<string, unknown> = {};
            for (const [k, v] of Object.entries((body["patch"] as Record<string, unknown>) ?? {})) {
              if (FILE_PATCH_KEYS.has(k)) patch[k] = v;
            }
            if ((body["patch"] as Record<string, unknown>)?.["completed"]) patch["completed_at"] = new Date().toISOString();
            const { error } = await db.from("data_import_files").update(patch as never).eq("id", body["file_id"] as string);
            if (error) return fail(error.message, 500);
            return json({ ok: true });
          }
          case "batches/refresh": {
            const bid = body["batch_id"] as string;
            if (!(await owns("data_import_batches", bid))) return fail("forbidden", 403);
            const { data: files } = await db.from("data_import_files").select("status, accepted_rows, rejected_rows").eq("batch_id", bid);
            const fs = files ?? [];
            const done = fs.filter((f) => ["completed", "failed", "cancelled"].includes(f.status));
            await db.from("data_import_batches").update({
              processed_files: done.length,
              accepted_rows: fs.reduce((s, f) => s + Number(f.accepted_rows), 0),
              rejected_rows: fs.reduce((s, f) => s + Number(f.rejected_rows), 0),
              status: done.length === fs.length ? (fs.some((f) => f.status === "failed") ? "completed_with_errors" : "completed") : "processing",
              completed_at: done.length === fs.length ? new Date().toISOString() : null,
            }).eq("id", bid);
            return json({ ok: true });
          }
          case "rejections/insert": {
            if (!(await owns("data_import_files", body["file_id"]))) return fail("forbidden", 403);
            const rows = ((body["rows"] as { row_number: number; raw_row: string; reason: string }[]) ?? []).map((r) => ({
              ...r, user_id: uid, file_id: body["file_id"] as string,
            }));
            const { error } = await db.from("import_rejections").insert(rows);
            if (error) return fail(error.message, 500);
            return json({ ok: true });
          }
          case "instruments/ensure": {
            const symbol = String(body["symbol"] ?? "").toUpperCase().slice(0, 32);
            if (!symbol) return fail("symbol required");
            const { data: ex } = await db.from("instruments").select("id").eq("user_id", uid).eq("symbol", symbol).maybeSingle();
            if (ex) return json(ex);
            const { data, error } = await db.from("instruments")
              .insert({ user_id: uid, symbol, display_name: symbol, asset_class: String(body["asset_class"] ?? "other") })
              .select("id").single();
            if (error) return fail(error.message, 500);
            await db.from("audit_log").insert({ user_id: uid, action: "instrument.created", entity: symbol, entity_id: data.id });
            return json(data);
          }
          case "datasets/active": {
            if (!(await owns("instruments", body["instrument_id"]))) return fail("forbidden", 403);
            const { data } = await db.from("datasets").select("id, version, price_basis")
              .eq("instrument_id", body["instrument_id"] as string).eq("timeframe", String(body["timeframe"] ?? "M1"))
              .eq("is_active", true).maybeSingle();
            return json(data ?? {});
          }
          case "bars/timestamps": {
            if (!(await owns("datasets", body["dataset_id"]))) return fail("forbidden", 403);
            const ts: string[] = [];
            for (let from = 0; ; from += 1000) {
              const { data, error } = await db.from("market_bars").select("ts_utc")
                .eq("dataset_id", body["dataset_id"] as string)
                .gte("ts_utc", body["start"] as string).lte("ts_utc", body["end"] as string)
                .order("ts_utc").range(from, from + 999);
              if (error) return fail(error.message, 500);
              for (const r of data) ts.push(new Date(r.ts_utc).toISOString().replace(".000Z", "+00:00"));
              if (data.length < 1000) break;
            }
            return json({ ts });
          }
          case "datasets/create": {
            const d = body["dataset"] as Record<string, unknown>;
            if (!(await owns("instruments", d["instrument_id"]))) return fail("forbidden", 403);
            const { data: last } = await db.from("datasets").select("version")
              .eq("instrument_id", d["instrument_id"] as string).eq("timeframe", String(d["timeframe"] ?? "M1"))
              .order("version", { ascending: false }).limit(1).maybeSingle();
            const { data, error } = await db.from("datasets")
              .insert({ ...(d as object), user_id: uid, version: (last?.version ?? 0) + 1, is_active: false } as never)
              .select("id, version").single();
            if (error) return fail(error.message, 500);
            return json(data);
          }
          case "datasets/copy": {
            if (!(await owns("datasets", body["src"])) || !(await owns("datasets", body["dst"]))) return fail("forbidden", 403);
            const { data, error } = await db.rpc("copy_dataset_bars", {
              _src: body["src"] as string, _dst: body["dst"] as string,
              ...(body["excl_start"] ? { _excl_start: body["excl_start"] as string, _excl_end: body["excl_end"] as string } : {}),
            });
            if (error) return fail(error.message, 500);
            return json({ copied: data });
          }
          case "bars/insert": {
            const did = body["dataset_id"] as string;
            if (!(await owns("datasets", did)) || !(await owns("instruments", body["instrument_id"]))) return fail("forbidden", 403);
            const rows = ((body["rows"] as Record<string, unknown>[]) ?? []).map((r) => ({
              user_id: uid, dataset_id: did, instrument_id: body["instrument_id"] as string,
              ts_utc: r["ts_utc"] as string, open: r["open"] as number, high: r["high"] as number,
              low: r["low"] as number, close: r["close"] as number, volume: (r["volume"] as number | null) ?? null,
              volume_type: (body["volume_type"] as string) ?? null, spread: (r["spread"] as number | null) ?? null,
              spread_unit: (body["spread_unit"] as string) ?? null,
            }));
            const { error } = await db.from("market_bars").upsert(rows, { onConflict: "dataset_id,ts_utc", ignoreDuplicates: true });
            if (error) return fail(error.message, 500);
            return json({ inserted: rows.length });
          }
          case "datasets/finalize": {
            const did = body["dataset_id"] as string;
            if (!(await owns("datasets", did))) return fail("forbidden", 403);
            const { count } = await db.from("market_bars").select("ts_utc", { count: "exact", head: true }).eq("dataset_id", did);
            const { data: first } = await db.from("market_bars").select("ts_utc").eq("dataset_id", did).order("ts_utc").limit(1).maybeSingle();
            const { data: lastBar } = await db.from("market_bars").select("ts_utc").eq("dataset_id", did).order("ts_utc", { ascending: false }).limit(1).maybeSingle();
            const { data: ds } = await db.from("datasets").select("instrument_id, timeframe, version").eq("id", did).single();
            const activate = Boolean(body["activate"]) && body["status"] !== "cancelled";
            if (activate && ds) {
              await db.from("datasets").update({ is_active: false }).eq("instrument_id", ds.instrument_id).eq("timeframe", ds.timeframe).neq("id", did);
            }
            const { error } = await db.from("datasets").update({
              candle_count: count ?? 0, start_time_utc: first?.ts_utc ?? null, end_time_utc: lastBar?.ts_utc ?? null,
              rejected_count: Number(body["rejected_count"] ?? 0), validation_status: String(body["status"]), is_active: activate,
            }).eq("id", did);
            if (error) return fail(error.message, 500);
            await db.from("audit_log").insert({ user_id: uid, action: "dataset.imported", entity: `v${ds?.version}`, entity_id: did, details: { candles: count, status: String(body["status"]) } });
            return json({ ok: true });
          }
          default:
            return fail("unknown action", 404);
        }
      },
    },
  },
});
