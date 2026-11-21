import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";

async function engineRequest(path: string, userId: string, body?: unknown) {
  const url = process.env["ENGINE_URL"];
  const token = process.env["ENGINE_TOKEN"];
  if (!url || !token) throw new Error("Engine not configured");
  const response = await fetch(url.replace(/\/$/, "") + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "X-User-Id": userId,
      "Content-Type": "application/json",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(25000),
  }).catch(() => {
    throw new Error("Engine is unreachable or waking up; retry shortly");
  });
  if (response.status === 404)
    throw new Error(
      "Render is still running the import-only Engine. Deploy the latest Engine code to enable this action.",
    );
  const value = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok)
    throw new Error(
      typeof value["detail"] === "string"
        ? value["detail"]
        : `Engine request failed (${response.status})`,
    );
  return value;
}

export const saveModelVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      modelId: z.string().uuid().optional(),
      name: z.string().trim().min(1).max(100),
      description: z.string().max(2000),
      code: z.string().min(1).max(200000),
      params: z.record(z.unknown()),
    }),
  )
  .handler(async ({ data, context }) => {
    let modelId = data.modelId;
    if (modelId) {
      const { data: model } = await context.supabase
        .from("models")
        .select("id")
        .eq("id", modelId)
        .single();
      if (!model) throw new Error("Model not found");
    } else {
      const { data: model, error } = await context.supabase
        .from("models")
        .insert({ name: data.name, description: data.description, user_id: context.userId })
        .select("id")
        .single();
      if (error || !model) throw new Error(error?.message ?? "Could not save model");
      modelId = model.id;
    }
    const { data: last } = await context.supabase
      .from("model_versions")
      .select("version")
      .eq("model_id", modelId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(data.code));
    const codeSha = Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join(
      "",
    );
    // Model versions and validation outcomes are sealed records; only this verified path creates versions.
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { data: version, error } = await db
      .from("model_versions")
      .insert({
        user_id: context.userId,
        model_id: modelId,
        version: (last?.version ?? 0) + 1,
        code: data.code,
        code_sha256: codeSha,
        params: data.params as Json,
        contract_status: "unvalidated",
      })
      .select("id,version")
      .single();
    if (error || !version) throw new Error(error?.message ?? "Could not save version");
    await context.supabase
      .from("models")
      .update({ name: data.name, description: data.description })
      .eq("id", modelId);
    await context.supabase
      .from("audit_log")
      .insert({
        user_id: context.userId,
        action: "model_version.created",
        entity: data.name,
        entity_id: version.id,
      });
    return { modelId, versionId: version.id, version: version.version };
  });

export const launchJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      kind: z.enum(["model_validation", "backtest", "prop_simulation"]),
      modelVersionId: z.string().uuid().optional(),
      datasetIds: z.array(z.string().uuid()).max(20).optional(),
      params: z.record(z.unknown()).optional(),
      start: z.string().datetime().optional(),
      end: z.string().datetime().optional(),
      runId: z.string().uuid().optional(),
      profileId: z.string().uuid().optional(),
      bankroll: z.number().min(0).max(1000000).optional(),
      horizonDays: z.number().int().min(1).max(365).optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    if (data.start && data.end && data.start > data.end)
      throw new Error("Start date must precede end date");
    const payload: Record<string, Json | undefined> = {
      params: data.params as Json,
      start: data.start,
      end: data.end,
    };
    let runId: string | undefined;
    let manifest: Json = [];
    if (data.kind === "prop_simulation") {
      if (!data.runId || !data.profileId)
        throw new Error("Choose a completed backtest and profile");
      const [{ data: run }, { data: profile }] = await Promise.all([
        context.supabase.from("backtest_runs").select("id,status").eq("id", data.runId).single(),
        context.supabase.from("prop_profiles").select("id").eq("id", data.profileId).single(),
      ]);
      if (!run || run.status !== "completed" || !profile)
        throw new Error("A completed backtest and saved profile are required");
      Object.assign(payload, {
        run_id: data.runId,
        profile_id: data.profileId,
        bankroll: data.bankroll ?? 190,
        horizon_days: data.horizonDays ?? 120,
      });
    } else {
      if (!data.modelVersionId || !data.datasetIds?.length)
        throw new Error("Choose a model version and historical datasets");
      const { data: version } = await context.supabase
        .from("model_versions")
        .select("id,code_sha256,params")
        .eq("id", data.modelVersionId)
        .single();
      const { data: datasets, error } = await context.supabase
        .from("datasets")
        .select("id,instrument_id,version,file_sha256,price_basis,timezone,timeframe,spread_unit")
        .in("id", data.datasetIds);
      if (!version || error || datasets?.length !== data.datasetIds.length)
        throw new Error("Model or dataset not found");
      if (datasets.some((d) => d.timeframe !== "M1"))
        throw new Error("Only M1 datasets are supported");
      manifest = datasets as Json;
      Object.assign(payload, {
        model_version_id: version.id,
        dataset_ids: data.datasetIds,
        params: (data.params ?? version.params) as Json,
        code_sha256: version.code_sha256,
      });
      if (data.kind === "backtest") {
        const { data: validations } = await context.supabase
          .from("jobs")
          .select("payload,result")
          .eq("kind", "model_validation")
          .eq("status", "completed")
          .order("created_at", { ascending: false });
        const validation = validations?.find(
          (j) => (j.payload as Record<string, unknown>)["model_version_id"] === version.id,
        )?.result as Record<string, unknown> | undefined;
        if (!validation?.["research_ready"])
          throw new Error("Validate this model version before running a backtest");
      }
    }
    const health = await engineRequest("/health", context.userId);
    if (!(health["capabilities"] as string[] | undefined)?.includes(data.kind))
      throw new Error(
        "Deploy the latest Engine code on Render to enable models, backtests and simulations.",
      );
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    if (data.kind === "backtest") {
      const { data: run, error } = await context.supabase
        .from("backtest_runs")
        .insert({
          model_version_id: String(payload["model_version_id"]),
          config: payload as Json,
          dataset_manifest: manifest,
          user_id: context.userId,
        })
        .select("id")
        .single();
      if (error || !run) throw new Error(error?.message ?? "Could not create run");
      runId = run.id;
      payload["run_id"] = runId;
    }
    const { data: job, error } = await db
      .from("jobs")
      .insert({ user_id: context.userId, kind: data.kind, payload: payload as Json })
      .select("id")
      .single();
    if (error || !job) throw new Error(error?.message ?? "Could not create job");
    try {
      await engineRequest("/v1/jobs", context.userId, { job_id: job.id });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Engine could not accept the job";
      await db
        .from("jobs")
        .update({ status: "failed", error: message, completed_at: new Date().toISOString() })
        .eq("id", job.id);
      if (runId)
        await context.supabase
          .from("backtest_runs")
          .update({ status: "failed", metrics: { error: message } })
          .eq("id", runId);
      throw new Error(message);
    }
    return { jobId: job.id, ...(runId ? { runId } : {}) };
  });

export const cancelJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ jobId: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const { data: job } = await context.supabase
      .from("jobs")
      .select("id,status")
      .eq("id", data.jobId)
      .single();
    if (!job || !["queued", "running"].includes(job.status)) throw new Error("Job is not active");
    await engineRequest(`/v1/jobs/${job.id}/cancel`, context.userId, {});
    return { ok: true };
  });

export const getMarketAccount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) =>
    JSON.stringify(await engineRequest("/v1/market/account", context.userId)),
  );

export const paperDeployment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      action: z.enum(["start", "pause", "resume", "stop"]),
      deploymentId: z.string().uuid().optional(),
      modelVersionId: z.string().uuid().optional(),
      instrumentIds: z.array(z.string().uuid()).max(20).optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    if (data.action === "start") {
      if (!data.modelVersionId || !data.instrumentIds?.length)
        throw new Error("Select a model and instruments");
      const { data: version } = await context.supabase
        .from("model_versions")
        .select("id")
        .eq("id", data.modelVersionId)
        .single();
      const { data: instruments } = await context.supabase
        .from("instruments")
        .select("id")
        .in("id", data.instrumentIds);
      const { data: validations } = await context.supabase
        .from("jobs")
        .select("payload,result")
        .eq("kind", "model_validation")
        .eq("status", "completed")
        .order("created_at", { ascending: false });
      const report = validations?.find(
        (j) => (j.payload as Record<string, unknown>)["model_version_id"] === data.modelVersionId,
      )?.result as Record<string, unknown> | undefined;
      if (!version || instruments?.length !== data.instrumentIds.length)
        throw new Error("Model or instrument not found");
      if (!report?.["deployable"])
        throw new Error(
          "All model acceptance checks must pass before paper deployment. Unverified golden or DST checks cannot be bypassed.",
        );
      const account = await engineRequest("/v1/market/account", context.userId);
      if (!(account["account"] as Record<string, unknown>)?.["isSocketSupport"])
        throw new Error("Your market-data plan does not include live WebSocket streaming");
      const { data: deployment, error } = await context.supabase
        .from("live_deployments")
        .insert({
          model_version_id: version.id,
          instruments: data.instrumentIds,
          user_id: context.userId,
          status: "starting",
        })
        .select("id")
        .single();
      if (!deployment || error) throw new Error(error?.message ?? "Could not create deployment");
      try {
        await engineRequest("/v1/live/deployments", context.userId, {
          deployment_id: deployment.id,
        });
      } catch (e) {
        await context.supabase
          .from("live_deployments")
          .update({ status: "failed" })
          .eq("id", deployment.id);
        throw e;
      }
      await context.supabase
        .from("live_deployments")
        .update({ status: "running", started_at: new Date().toISOString() })
        .eq("id", deployment.id);
      await context.supabase
        .from("audit_log")
        .insert({ action: "paper.start", entity: "deployment", entity_id: deployment.id });
      return { id: deployment.id };
    }
    if (!data.deploymentId) throw new Error("Deployment required");
    const { data: deployment } = await context.supabase
      .from("live_deployments")
      .select("id,status")
      .eq("id", data.deploymentId)
      .single();
    if (!deployment) throw new Error("Deployment not found");
    await engineRequest(`/v1/live/deployments/${deployment.id}/${data.action}`, context.userId, {});
    await context.supabase
      .from("live_deployments")
      .update({
        status:
          data.action === "pause" ? "paused" : data.action === "resume" ? "running" : "stopped",
        ...(data.action === "stop" ? { stopped_at: new Date().toISOString() } : {}),
      })
      .eq("id", deployment.id);
    await context.supabase
      .from("audit_log")
      .insert({ action: `paper.${data.action}`, entity: "deployment", entity_id: deployment.id });
    return { id: deployment.id };
  });
