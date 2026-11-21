import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { cancelJob } from "@/lib/lab.functions";

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground">
      <span>{label}</span>
      {children}
    </label>
  );
}
export const selectClass =
  "h-9 w-full min-w-0 rounded-md border border-input bg-background px-2 text-xs text-foreground";
export function ErrorText({ error }: { error: unknown }) {
  return error ? (
    <p role="alert" className="break-words text-xs text-negative">
      {error instanceof Error ? error.message : String(error)}
    </p>
  ) : null;
}
export function useLibrary() {
  return useQuery({
    queryKey: ["lab-library"],
    queryFn: async () => {
      const [m, d, i, p] = await Promise.all([
        supabase
          .from("models")
          .select("*,model_versions(*)")
          .order("updated_at", { ascending: false }),
        supabase
          .from("datasets")
          .select("*,instruments(symbol,point_size)")
          .in("validation_status", ["valid", "warning"])
          .order("created_at", { ascending: false }),
        supabase.from("instruments").select("*").order("symbol"),
        supabase.from("prop_profiles").select("*").order("name"),
      ]);
      for (const result of [m, d, i, p]) if (result.error) throw new Error(result.error.message);
      return {
        models: m.data ?? [],
        datasets: d.data ?? [],
        instruments: i.data ?? [],
        profiles: p.data ?? [],
      };
    },
  });
}
export function useJobs(kind?: string) {
  return useQuery({
    queryKey: ["lab-jobs", kind ?? "all"],
    refetchInterval: 3000,
    queryFn: async () => {
      let query = supabase
        .from("jobs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (kind) query = query.eq("kind", kind);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });
}
export function JobStatus({ jobId }: { jobId: string }) {
  const jobs = useJobs();
  const cancel = useServerFn(cancelJob);
  const job = jobs.data?.find((j) => j.id === jobId);
  if (!job) return null;
  return (
    <div className="space-y-2 border-t pt-3 text-xs">
      <div className="flex items-center gap-3">
        <span className="uppercase">{job.status}</span>
        <span className="num">{Math.round(job.progress * 100)}%</span>
        {["queued", "running"].includes(job.status) && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => cancel({ data: { jobId } }).catch((e) => toast.error(e.message))}
          >
            Cancel job
          </Button>
        )}
      </div>
      <progress className="h-1 w-full accent-primary" max={1} value={job.progress} />
      <ErrorText error={job.error} />
    </div>
  );
}
export function ModelOptions({ library }: { library: ReturnType<typeof useLibrary>["data"] }) {
  return (
    <>
      {library?.models.flatMap((m) =>
        m.model_versions
          .sort((a, b) => b.version - a.version)
          .map((v) => (
            <option key={v.id} value={v.id}>
              {m.name} · v{v.version}
            </option>
          )),
      )}
    </>
  );
}
