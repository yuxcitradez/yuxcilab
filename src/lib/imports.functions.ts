import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Sends uploaded files of a batch (or a subset, for retries) to the Engine with short-lived signed URLs. */
export const startImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { batchId: string; fileIds?: string[] }) => d)
  .handler(async ({ data, context }) => {
    const url = process.env["ENGINE_URL"];
    const token = process.env["ENGINE_TOKEN"];
    let q = context.supabase.from("data_import_files").select("id, batch_id, filename, storage_path, config").eq("batch_id", data.batchId);
    if (data.fileIds?.length) q = q.in("id", data.fileIds);
    const { data: files, error } = await q;
    if (error) return { ok: false, error: error.message };
    if (!files.length) return { ok: false, error: "No files in batch" };
    if (!url || !token) {
      await context.supabase.from("data_import_files").update({ status: "waiting_engine", error_message: "Engine not configured" }).in("id", files.map((f) => f.id));
      return { ok: false, error: "Engine not configured — files are uploaded and will import once the Engine is connected." };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const payload = [];
    for (const f of files) {
      if (!f.storage_path) continue;
      const { data: signed, error: sErr } = await supabaseAdmin.storage.from("imports").createSignedUrl(f.storage_path, 3600);
      if (sErr || !signed) return { ok: false, error: `Could not sign ${f.filename}` };
      payload.push({ file_id: f.id, batch_id: f.batch_id, filename: f.filename, signed_url: signed.signedUrl, config: f.config });
    }
    await context.supabase.from("data_import_files").update({ status: "queued", error_message: null, progress: 0 }).in("id", files.map((f) => f.id));
    await context.supabase.from("data_import_batches").update({ status: "processing" }).eq("id", data.batchId);
    try {
      const res = await fetch(url.replace(/\/$/, "") + "/v1/data/imports", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "X-User-Id": context.userId },
        body: JSON.stringify({ files: payload }),
      });
      if (!res.ok) return { ok: false, error: `Engine returned ${res.status}` };
    } catch {
      await context.supabase.from("data_import_files").update({ status: "waiting_engine", error_message: "Engine unreachable" }).in("id", files.map((f) => f.id));
      return { ok: false, error: "Engine unreachable" };
    }
    await context.supabase.from("audit_log").insert({ action: "import.started", entity: "batch", entity_id: data.batchId, details: { files: payload.length } });
    return { ok: true, error: null };
  });

export const cancelImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { fileId: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: f } = await context.supabase.from("data_import_files").select("id, status").eq("id", data.fileId).maybeSingle();
    if (!f) return { ok: false };
    if (["pending", "waiting_engine", "queued"].includes(f.status)) {
      await context.supabase.from("data_import_files").update({ status: "cancelled" }).eq("id", f.id);
      return { ok: true };
    }
    const url = process.env["ENGINE_URL"];
    const token = process.env["ENGINE_TOKEN"];
    if (!url || !token) return { ok: false };
    await fetch(url.replace(/\/$/, "") + `/v1/data/imports/${f.id}/cancel`, {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "X-User-Id": context.userId },
    }).catch(() => null);
    return { ok: true };
  });
