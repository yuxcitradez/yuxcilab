import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { pageHead } from "@/lib/head";
import { matchesSimulation, researchSearch } from "@/lib/research-flow";
import { supabase } from "@/integrations/supabase/client";
import { ResearchFlow } from "@/components/lab/ResearchFlow";
import { PropResults, type PropResult } from "@/components/lab/PropResults";
import { PageHeader } from "@/components/lab/Panel";
import { ErrorText, JobStatus, selectClass, Field, useJobs } from "@/components/lab/Workflow";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/expected-value")({
  validateSearch: researchSearch,
  head: () =>
    pageHead(
      "Expected Value",
      "Expected value and bankroll risk from completed backtests in a saved prop-firm environment.",
    ),
  component: ExpectedValuePage,
});

function ExpectedValuePage() {
  const selection = Route.useSearch();
  const navigate = Route.useNavigate();
  const jobs = useJobs("prop_simulation");
  const candidates =
    jobs.data?.filter((job) =>
      matchesSimulation(job, {
        ...(selection.runId ? { runId: selection.runId } : {}),
        ...(selection.profileId ? { profileId: selection.profileId } : {}),
      }),
    ) ?? [];
  const selected = selection.jobId
    ? candidates.find((job) => job.id === selection.jobId)
    : (candidates.find((job) => job.status === "completed") ?? candidates[0]);
  const payload = selected?.payload as Record<string, unknown> | undefined;
  const sourceRun = typeof payload?.["run_id"] === "string" ? payload["run_id"] : selection.runId;
  const sourceProfile =
    typeof payload?.["profile_id"] === "string" ? payload["profile_id"] : selection.profileId;
  const source = useQuery({
    queryKey: ["ev-source", sourceRun, sourceProfile],
    enabled: !!sourceRun && !!sourceProfile,
    queryFn: async () => {
      if (!sourceRun || !sourceProfile) return null;
      const [run, profile] = await Promise.all([
        supabase
          .from("backtest_runs")
          .select("id,config,dataset_manifest")
          .eq("id", sourceRun)
          .single(),
        supabase.from("prop_profiles").select("name,firm_name").eq("id", sourceProfile).single(),
      ]);
      if (run.error) throw run.error;
      if (profile.error) throw profile.error;
      return { run: run.data, profile: profile.data };
    },
  });
  const result = selected?.status === "completed" ? (selected.result as PropResult | null) : null;
  const backSelection = {
    ...selection,
    ...(sourceRun ? { runId: sourceRun } : {}),
    ...(sourceProfile ? { profileId: sourceProfile } : {}),
  };
  return (
    <div className="space-y-4">
      <PageHeader title="Expected value" />
      <ResearchFlow active="/expected-value" selection={backSelection} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Field label="Simulation">
          <select
            className={selectClass}
            value={selected?.id ?? ""}
            onChange={(event) => navigate({ search: { ...selection, jobId: event.target.value } })}
          >
            <option value="">Select simulation</option>
            {candidates.map((job) => (
              <option key={job.id} value={job.id}>
                {job.created_at.slice(0, 16).replace("T", " ")} · {job.id.slice(0, 8)} ·{" "}
                {job.status}
              </option>
            ))}
          </select>
        </Field>
        <Button asChild size="sm" variant="outline">
          <Link to="/prop-profiles" search={backSelection}>
            <ArrowLeft />
            Prop-firm environment
          </Link>
        </Button>
      </div>
      {selected && (
        <div className="flex flex-wrap gap-5 text-xs text-muted-foreground">
          <span>Backtest {sourceRun?.slice(0, 8) ?? "—"}</span>
          <span>
            {source.data?.profile.name ?? "Prop profile"}
            {source.data?.profile.firm_name ? ` · ${source.data.profile.firm_name}` : ""}
          </span>
          <span className="num">
            Bankroll {String(payload?.["bankroll"] ?? "—")} ·{" "}
            {String(payload?.["horizon_days"] ?? "—")} days
          </span>
        </div>
      )}
      <ErrorText error={jobs.error ?? source.error} />
      {selected && !result && <JobStatus jobId={selected.id} />}
      {result ? (
        <PropResults result={result} />
      ) : (
        !selected && (
          <p className="py-8 text-sm text-muted-foreground">
            No simulation results for this selection.
          </p>
        )
      )}
    </div>
  );
}
