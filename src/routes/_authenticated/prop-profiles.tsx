import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Save, Play, ArrowRight } from "lucide-react";
import { pageHead } from "@/lib/head";
import { supabase } from "@/integrations/supabase/client";
import { launchJob } from "@/lib/lab.functions";
import { PageHeader, Panel } from "@/components/lab/Panel";
import { ResearchFlow } from "@/components/lab/ResearchFlow";
import { researchSearch, matchesSimulation } from "@/lib/research-flow";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Field,
  selectClass,
  useLibrary,
  useJobs,
  ErrorText,
  JobStatus,
} from "@/components/lab/Workflow";
import type { Json } from "@/integrations/supabase/types";
export const Route = createFileRoute("/_authenticated/prop-profiles")({
  validateSearch: researchSearch,
  head: () =>
    pageHead(
      "Prop-firm Environment",
      "Prop account rules, account-faithful replay and bankroll risk simulation.",
    ),
  component: PropPage,
});
const defaults = {
  account_fee: 19,
  starting_balance: 50000,
  maximum_loss: 2000,
  daily_loss_limit: 1000,
  profit_target: 3000,
  minimum_trading_days: 5,
  payout_amount: 60,
  payout_percent: 80,
  streak_length: 5,
  consistency_percent: 100,
  point_value: 1,
  fixed_lots: 1,
  maximum_loss_type: "static",
  loss_measurement: "balance",
  daily_reset_timezone: "America/New_York",
  daily_reset_time: "00:00",
};
function PropPage() {
  const selection = Route.useSearch();
  const navigate = Route.useNavigate();
  const library = useLibrary();
  const jobs = useJobs("prop_simulation");
  const qc = useQueryClient();
  const launch = useServerFn(launchJob);
  const [id, setId] = useState(selection.profileId ?? "");
  const [name, setName] = useState("");
  const [firm, setFirm] = useState("");
  const [rules, setRules] = useState<Record<string, string | number>>(defaults);
  const [runId, setRunId] = useState(selection.runId ?? "");
  const [bankroll, setBankroll] = useState(190);
  const [horizon, setHorizon] = useState(120);
  const [jobId, setJobId] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const loadedProfile = useRef("");
  useEffect(() => {
    if (!selection.profileId || loadedProfile.current === selection.profileId) return;
    const profile = library.data?.profiles.find((p) => p.id === selection.profileId);
    if (!profile) return;
    loadedProfile.current = profile.id;
    setId(profile.id);
    setName(profile.name);
    setFirm(profile.firm_name ?? "");
    setRules({ ...defaults, ...(profile.rules as Record<string, string | number>) });
  }, [selection.profileId, library.data]);
  useEffect(() => {
    if (selection.runId) setRunId(selection.runId);
  }, [selection.runId]);
  const runs = useQuery({
    queryKey: ["completed-runs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("backtest_runs")
        .select("id,created_at")
        .eq("status", "completed")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const job =
    runId && id
      ? jobs.data?.find(
          (j) =>
            matchesSimulation(j, { runId, profileId: id }) &&
            (jobId ? j.id === jobId : j.status === "completed"),
        )
      : undefined;
  const savedProfile = library.data?.profiles.find((p) => p.id === id);
  const dirty =
    !!savedProfile &&
    (name !== savedProfile.name ||
      firm !== (savedProfile.firm_name ?? "") ||
      JSON.stringify(rules) !==
        JSON.stringify({
          ...defaults,
          ...(savedProfile.rules as Record<string, string | number>),
        }));
  async function save() {
    setBusy(true);
    setError(null);
    try {
      if (!name.trim()) throw new Error("Profile name required");
      if (Number(rules["maximum_loss"]) <= 0 || Number(rules["account_fee"]) <= 0)
        throw new Error("Fee and maximum loss must be positive");
      const payload = { name, firm_name: firm || null, rules: rules as Json };
      const response = id
        ? await supabase.from("prop_profiles").update(payload).eq("id", id).select("id").single()
        : await supabase.from("prop_profiles").insert(payload).select("id").single();
      if (response.error) throw response.error;
      setId(response.data.id);
      await supabase
        .from("audit_log")
        .insert({ action: "prop_profile.saved", entity: name, entity_id: response.data.id });
      await qc.invalidateQueries({ queryKey: ["lab-library"] });
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  async function simulate() {
    setBusy(true);
    setError(null);
    try {
      const r = await launch({
        data: { kind: "prop_simulation", runId, profileId: id, bankroll, horizonDays: horizon },
      });
      setJobId(r.jobId);
      await navigate({
        to: "/expected-value",
        search: { ...selection, runId, profileId: id, jobId: r.jobId },
      });
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-4">
      <PageHeader
        title="Prop-firm environment"
        actions={
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setId("");
              setName("");
              setFirm("");
              setRules(defaults);
            }}
          >
            <Plus />
            New profile
          </Button>
        }
      />
      <ResearchFlow
        active="/prop-profiles"
        selection={{ ...selection, ...(runId ? { runId } : {}), ...(id ? { profileId: id } : {}) }}
      />
      <div className="grid gap-4 lg:grid-cols-[210px_minmax(0,1fr)]">
        <section className="space-y-2">
          {library.data?.profiles.map((p) => (
            <Button
              key={p.id}
              className="h-auto w-full justify-start whitespace-normal text-left"
              variant={id === p.id ? "secondary" : "ghost"}
              onClick={() => {
                setId(p.id);
                setName(p.name);
                setFirm(p.firm_name ?? "");
                setRules({ ...defaults, ...(p.rules as Record<string, string | number>) });
              }}
            >
              {p.name}
            </Button>
          ))}
        </section>
        <div className="min-w-0 space-y-4">
          <Panel
            title={name || "Account rules"}
            actions={
              <Button size="sm" disabled={busy || !name} onClick={save}>
                <Save />
                Save profile
              </Button>
            }
          >
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <Field label="Profile name">
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
              <Field label="Firm">
                <Input value={firm} onChange={(e) => setFirm(e.target.value)} />
              </Field>
              {Object.entries(defaults).map(([key, value]) => (
                <Field key={key} label={key.replaceAll("_", " ")}>
                  {key === "maximum_loss_type" || key === "loss_measurement" ? (
                    <select
                      className={selectClass}
                      value={rules[key]}
                      onChange={(e) => setRules({ ...rules, [key]: e.target.value })}
                    >
                      {(key === "maximum_loss_type"
                        ? ["static", "trailing"]
                        : ["balance", "equity"]
                      ).map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </select>
                  ) : (
                    <Input
                      type={
                        typeof value === "number"
                          ? "number"
                          : key === "daily_reset_time"
                            ? "time"
                            : "text"
                      }
                      min={typeof value === "number" ? 0 : undefined}
                      value={rules[key] ?? value}
                      onChange={(e) =>
                        setRules({
                          ...rules,
                          [key]:
                            typeof value === "number" ? Number(e.target.value) : e.target.value,
                        })
                      }
                    />
                  )}
                </Field>
              ))}
            </div>
            <ErrorText error={error ?? library.error} />
          </Panel>
          <Panel
            title="Backtest → prop-firm environment"
            actions={
              <Button size="sm" disabled={busy || !id || !runId || dirty} onClick={simulate}>
                <Play />
                Calculate expected value
              </Button>
            }
          >
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Completed backtest">
                <select
                  className={selectClass}
                  value={runId}
                  onChange={(e) => setRunId(e.target.value)}
                >
                  <option value="">Select run</option>
                  {runs.data?.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.created_at.slice(0, 10)} · {r.id.slice(0, 8)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Bankroll">
                <Input
                  type="number"
                  min={0}
                  value={bankroll}
                  onChange={(e) => setBankroll(Number(e.target.value))}
                />
              </Field>
              <Field label="Horizon (days)">
                <Input
                  type="number"
                  min={1}
                  max={365}
                  value={horizon}
                  onChange={(e) => setHorizon(Number(e.target.value))}
                />
              </Field>
            </div>
            {jobId && <JobStatus jobId={jobId} />}
          </Panel>
          {dirty && <p className="text-xs text-warning">Unsaved profile changes</p>}
          <ErrorText error={error ?? runs.error ?? jobs.error} />
          {job?.status === "completed" && (
            <Button asChild size="sm" variant="outline">
              <Link to="/expected-value" search={{ runId, profileId: id, jobId: job.id }}>
                <ArrowRight />
                View expected value
              </Link>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
