import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Play, Pause, Square } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { pageHead } from "@/lib/head";
import { paperDeployment } from "@/lib/lab.functions";
import { PageHeader, Panel } from "@/components/lab/Panel";
import { EquityCurve, DrawdownChart } from "@/components/lab/Charts";
import { TradesTable } from "@/components/lab/TradesTable";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { Field, selectClass, useLibrary, ModelOptions, ErrorText } from "@/components/lab/Workflow";
export const Route = createFileRoute("/_authenticated/live")({
  head: () =>
    pageHead("Live", "Live market-data monitoring and simulated paper trading. Never real orders."),
  component: LivePage,
});
function LivePage() {
  const library = useLibrary();
  const fn = useServerFn(paperDeployment);
  const [version, setVersion] = useState("");
  const [instruments, setInstruments] = useState<string[]>([]);
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [action, setAction] = useState<"start" | "pause" | "resume" | "stop" | null>(null);
  const deployments = useQuery({
    queryKey: ["deployments"],
    refetchInterval: 5000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("live_deployments")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const deployment = deployments.data?.find((d) => d.id === selected) ?? deployments.data?.[0];
  const live = useQuery({
    queryKey: ["paper-results", deployment?.id],
    enabled: !!deployment,
    refetchInterval: 5000,
    queryFn: async () => {
      if (!deployment) return { trades: [], equity: [], events: [] };
      const [t, e, v] = await Promise.all([
        supabase
          .from("live_trades")
          .select("*")
          .eq("deployment_id", deployment.id)
          .order("entry_time")
          .limit(1000),
        supabase
          .from("live_equity")
          .select("*")
          .eq("deployment_id", deployment.id)
          .order("ts")
          .limit(1000),
        supabase
          .from("live_events")
          .select("*")
          .eq("deployment_id", deployment.id)
          .order("ts", { ascending: false })
          .limit(100),
      ]);
      for (const r of [t, e, v]) if (r.error) throw r.error;
      return { trades: t.data ?? [], equity: e.data ?? [], events: v.data ?? [] };
    },
  });
  async function confirm() {
    if (!action) return;
    setBusy(true);
    setError(null);
    try {
      const d = await fn({
        data: {
          action,
          ...(action === "start"
            ? { modelVersionId: version, instrumentIds: instruments }
            : { deploymentId: deployment?.id }),
        },
      });
      setSelected(d.id);
      await deployments.refetch();
    } catch (e) {
      setError(e);
    } finally {
      setAction(null);
      setBusy(false);
    }
  }
  return (
    <div className="space-y-4">
      <PageHeader title="Live paper trading" />
      <div className="border-l-2 border-warning pl-3 text-xs text-warning">
        PAPER ONLY · Render Free may sleep or restart. Continuous monitoring requires an always-on
        service.
      </div>
      <Panel
        title="New paper deployment"
        actions={
          <Button
            size="sm"
            disabled={busy || !version || !instruments.length}
            onClick={() => setAction("start")}
          >
            <Play />
            Start paper deployment
          </Button>
        }
      >
        <Field label="Model version">
          <select
            className={selectClass}
            value={version}
            onChange={(e) => setVersion(e.target.value)}
          >
            <option value="">Select certified model</option>
            <ModelOptions library={library.data} />
          </select>
        </Field>
        <div className="mt-3 flex flex-wrap gap-4">
          {library.data?.instruments.map((i) => (
            <label key={i.id} className="flex items-center gap-2 text-xs">
              <Checkbox
                checked={instruments.includes(i.id)}
                onCheckedChange={(c) =>
                  setInstruments(
                    c ? [...instruments, i.id] : instruments.filter((id) => id !== i.id),
                  )
                }
              />
              {i.symbol} · {i.provider_symbol_code ?? "unmapped"}
            </label>
          ))}
        </div>
        <ErrorText error={error ?? library.error} />
      </Panel>
      <Panel title="Deployments">
        <div className="flex flex-wrap gap-2">
          {deployments.data?.map((d) => (
            <Button
              key={d.id}
              size="sm"
              variant={deployment?.id === d.id ? "secondary" : "outline"}
              onClick={() => setSelected(d.id)}
            >
              {d.id.slice(0, 8)} · {d.status}
            </Button>
          ))}
        </div>
        {!deployments.data?.length && (
          <p className="text-xs text-muted-foreground">No paper deployments</p>
        )}
        <ErrorText error={deployments.error} />
        {deployment && (
          <div className="mt-3 flex gap-2">
            {deployment.status === "running" && (
              <Button size="sm" variant="outline" onClick={() => setAction("pause")}>
                <Pause />
                Pause
              </Button>
            )}
            {deployment.status === "paused" && (
              <Button size="sm" variant="outline" onClick={() => setAction("resume")}>
                <Play />
                Resume
              </Button>
            )}
            {["running", "paused"].includes(deployment.status) && (
              <Button size="sm" variant="destructive" onClick={() => setAction("stop")}>
                <Square />
                Stop
              </Button>
            )}
          </div>
        )}
      </Panel>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Paper equity">
          <EquityCurve data={live.data?.equity.map((e) => ({ t: e.ts, v: e.equity })) ?? []} />
        </Panel>
        <Panel title="Paper drawdown">
          <DrawdownChart data={live.data?.equity.map((e) => ({ t: e.ts, v: e.drawdown })) ?? []} />
        </Panel>
      </div>
      <Panel title="Paper trades">
        <TradesTable trades={live.data?.trades ?? []} exportName="paper_trades" />
      </Panel>
      <Panel title="Feed and deployment events">
        <ErrorText error={live.error} />
        <div className="space-y-2 text-xs">
          {live.data?.events.map((e) => (
            <div className="grid grid-cols-[140px_1fr] gap-3 border-b py-2" key={e.id}>
              <span className="num text-muted-foreground">
                {e.ts.slice(0, 19).replace("T", " ")}
              </span>
              <span>
                {e.type} {e.message && `· ${e.message}`}
              </span>
            </div>
          ))}
        </div>
      </Panel>
      <AlertDialog
        open={action !== null}
        onOpenChange={(open) => {
          if (!open) setAction(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{action} paper deployment?</AlertDialogTitle>
            <AlertDialogDescription>
              {action === "stop"
                ? "The worker will stop monitoring. Existing recorded paper results are retained."
                : "All signals and positions remain simulated. No broker orders will be sent."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirm}>Confirm {action}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
