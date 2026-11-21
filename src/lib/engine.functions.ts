import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type EngineHealth = {
  configured: boolean;
  ok: boolean;
  status: string;
  detail?: string;
  latencyMs?: number;
};

const ALLOWED_METHODS = ["GET", "POST", "DELETE"] as const;
type Method = (typeof ALLOWED_METHODS)[number];

/** Authenticated proxy to the external Python Engine. Secrets never leave the server. */
export const engineProxy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { path: string; method?: Method; body?: unknown }) => {
    if (typeof input.path !== "string" || !input.path.startsWith("/") || input.path.includes("..")) {
      throw new Error("Invalid engine path");
    }
    const method = input.method ?? "GET";
    if (!ALLOWED_METHODS.includes(method)) throw new Error("Invalid method");
    return { path: input.path, method, body: input.body };
  })
  .handler(async ({ data, context }) => {
    const url = process.env["ENGINE_URL"];
    const token = process.env["ENGINE_TOKEN"];
    if (!url || !token) {
      return { ok: false, status: 503, error: "Engine not configured", body: null as string | null };
    }
    try {
      const init: RequestInit = {
        method: data.method,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "X-User-Id": context.userId,
        },
      };
      if (data.method !== "GET") init.body = JSON.stringify(data.body ?? {});
      const res = await fetch(url.replace(/\/$/, "") + data.path, init);
      // Raw body text; callers JSON.parse it. Keeps the RPC payload serializable.
      const text = await res.text();
      return { ok: res.ok, status: res.status, error: res.ok ? null : `Engine returned ${res.status}`, body: text as string | null };
    } catch (e) {
      console.error("engine-proxy error", e instanceof Error ? e.message : "unknown");
      return { ok: false, status: 502, error: "Engine unreachable", body: null as string | null };
    }
  });

export const getEngineHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<{ engine: EngineHealth; market: EngineHealth }> => {
    const url = process.env["ENGINE_URL"];
    const token = process.env["ENGINE_TOKEN"];
    const marketKeySet = Boolean(process.env["REALMARKETAPI_KEY"]);
    if (!url || !token) {
      return {
        engine: { configured: false, ok: false, status: "Not configured" },
        market: { configured: marketKeySet, ok: false, status: marketKeySet ? "Key set · needs Engine" : "Not configured" },
      };
    }
    const t0 = Date.now();
    try {
      const res = await fetch(url.replace(/\/$/, "") + "/health", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const latencyMs = Date.now() - t0;
      const body = (await res.json().catch(() => ({}))) as { market_data?: { ok?: boolean; status?: string } };
      return {
        engine: { configured: true, ok: res.ok, status: res.ok ? "Online" : `Error ${res.status}`, latencyMs },
        market: {
          configured: marketKeySet,
          ok: Boolean(body.market_data?.ok),
          status: body.market_data?.status ?? (marketKeySet ? "Unknown" : "Not configured"),
        },
      };
    } catch {
      return {
        engine: { configured: true, ok: false, status: "Unreachable" },
        market: { configured: marketKeySet, ok: false, status: "Unknown" },
      };
    }
  });
