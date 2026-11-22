import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FileUp, Save, ShieldCheck, Plus, Download, ArrowRight } from "lucide-react";
import { ResearchFlow } from "@/components/lab/ResearchFlow";
import { researchSearch } from "@/lib/research-flow";
import { toast } from "sonner";
import { pageHead } from "@/lib/head";
import { saveModelVersion, launchJob } from "@/lib/lab.functions";
import { PageHeader, Panel } from "@/components/lab/Panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Field,
  selectClass,
  useLibrary,
  useJobs,
  ErrorText,
  JobStatus,
} from "@/components/lab/Workflow";

export const Route = createFileRoute("/_authenticated/models")({
  validateSearch: researchSearch,
  head: () =>
    pageHead("Models", "Python model library, immutable versions and verified acceptance results."),
  component: ModelsPage,
});
const initialCode = `META = {"name": "new_model", "timeframe": "M1", "params": {}}\n\ndef on_bar(ctx, bar):\n    return []\n`;
function ModelsPage() {
  const selection = Route.useSearch();
  const library = useLibrary();
  const jobs = useJobs("model_validation");
  const qc = useQueryClient();
  const save = useServerFn(saveModelVersion);
  const validate = useServerFn(launchJob);
  const [modelId, setModelId] = useState("");
  const [versionId, setVersionId] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [code, setCode] = useState(initialCode);
  const [params, setParams] = useState("{}");
  const [dataset, setDataset] = useState(selection.datasetIds?.[0] ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [jobId, setJobId] = useState("");
  const model = library.data?.models.find((m) => m.id === modelId);
  const initialized = useRef(false);
  useEffect(() => {
    if (!initialized.current && library.data?.models[0]) {
      initialized.current = true;
      setModelId(library.data.models[0].id);
    }
  }, [library.data]);
  useEffect(() => {
    if (model) {
      const version = [...model.model_versions].sort((a, b) => b.version - a.version)[0];
      setName(model.name);
      setDescription(model.description ?? "");
      setVersionId(version?.id ?? "");
      setCode(version?.code ?? initialCode);
      setParams(JSON.stringify(version?.params ?? {}, null, 2));
    }
  }, [model]);
  useEffect(() => {
    if (!selection.modelVersionId || !library.data) return;
    const owner = library.data.models.find((m) =>
      m.model_versions.some((v) => v.id === selection.modelVersionId),
    );
    const v = owner?.model_versions.find((v) => v.id === selection.modelVersionId);
    if (owner && v) {
      setModelId(owner.id);
      setVersionId(v.id);
      setCode(v.code);
      setParams(JSON.stringify(v.params, null, 2));
    }
  }, [selection.modelVersionId, library.data]);
  const validation = jobs.data?.find(
    (j) =>
      (j.payload as Record<string, unknown>)["model_version_id"] === versionId &&
      j.status === "completed",
  );
  const report = validation?.result as
    | {
        checks?: { name: string; status: string; detail?: string }[];
        research_ready?: boolean;
        deployable?: boolean;
        warnings?: string[];
      }
    | undefined;
  async function persist() {
    setBusy(true);
    setError(null);
    try {
      const result = await save({
        data: {
          ...(modelId ? { modelId } : {}),
          name,
          description,
          code,
          params: JSON.parse(params),
        },
      });
      setModelId(result.modelId);
      setVersionId(result.versionId);
      await qc.invalidateQueries({ queryKey: ["lab-library"] });
      toast.success(`Saved version ${result.version}`);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  async function check() {
    setBusy(true);
    setError(null);
    try {
      const result = await validate({
        data: {
          kind: "model_validation",
          modelVersionId: versionId,
          datasetIds: [dataset],
          params: JSON.parse(params),
        },
      });
      setJobId(result.jobId);
      toast.success("Validation started");
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  function selectVersion(id: string) {
    const v = model?.model_versions.find((v) => v.id === id);
    if (v) {
      setVersionId(id);
      setCode(v.code);
      setParams(JSON.stringify(v.params, null, 2));
    }
  }
  return (
    <div className="space-y-4">
      <PageHeader
        title="Models"
        actions={
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setModelId("");
              setVersionId("");
              setName("");
              setDescription("");
              setCode(initialCode);
              setParams("{}");
            }}
          >
            <Plus />
            New model
          </Button>
        }
      />
      <ResearchFlow
        active="/models"
        selection={{
          ...selection,
          ...(versionId ? { modelVersionId: versionId } : {}),
          ...(dataset ? { datasetIds: [dataset] } : {}),
        }}
      />
      <ErrorText error={library.error} />
      <div className="grid gap-4 lg:grid-cols-[230px_minmax(0,1fr)]">
        <section className="space-y-2">
          <h2 className="text-xs uppercase text-muted-foreground">Library</h2>
          {library.data?.models.map((m) => (
            <Button
              key={m.id}
              variant={modelId === m.id ? "secondary" : "ghost"}
              className="h-auto w-full justify-start whitespace-normal py-3 text-left"
              onClick={() => setModelId(m.id)}
            >
              <span>
                {m.name}
                <span className="mt-1 block text-xs text-muted-foreground">
                  {m.model_versions.length} versions
                </span>
              </span>
            </Button>
          ))}
        </section>
        <div className="min-w-0 space-y-4">
          <Panel
            title={name || "New model"}
            actions={
              <div className="flex gap-2">
                <label className="cursor-pointer" title="Upload Python file">
                  <Button asChild size="sm" variant="outline">
                    <span>
                      <FileUp />
                      Upload .py
                    </span>
                  </Button>
                  <input
                    type="file"
                    accept=".py"
                    className="hidden"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (f) {
                        if (f.size > 200000) {
                          setError(new Error("Model file exceeds 200 KB"));
                          return;
                        }
                        setCode(await f.text());
                        if (!name) setName(f.name.replace(/\.py$/, ""));
                      }
                    }}
                  />
                </label>
                <Button size="sm" disabled={busy || !name || !code} onClick={persist}>
                  <Save />
                  Save new version
                </Button>
              </div>
            }
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Model name">
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
              <Field label="Version">
                <select
                  className={selectClass}
                  value={versionId}
                  onChange={(e) => selectVersion(e.target.value)}
                >
                  <option value="">Unsaved</option>
                  {model?.model_versions.map((v) => (
                    <option key={v.id} value={v.id}>
                      v{v.version} · {v.created_at.slice(0, 10)}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Description">
              <Input
                className="mt-2"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </Field>
            <div className="mt-3 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Python</span>
              <Button
                variant="ghost"
                size="sm"
                title="Download Python code"
                onClick={() => {
                  const a = document.createElement("a");
                  a.href = URL.createObjectURL(new Blob([code], { type: "text/x-python" }));
                  a.download = `${name || "model"}.py`;
                  a.click();
                  URL.revokeObjectURL(a.href);
                }}
              >
                <Download />
              </Button>
            </div>
            <Textarea
              aria-label="Python code"
              spellCheck={false}
              className="num min-h-[340px] resize-y text-xs leading-5"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
            <Field label="Parameters (JSON)">
              <Textarea
                aria-label="Model parameters"
                className="num mt-1 min-h-[120px] text-xs"
                value={params}
                onChange={(e) => setParams(e.target.value)}
              />
            </Field>
            <ErrorText error={error} />
          </Panel>
          <Panel
            title="Acceptance results"
            actions={
              <Button size="sm" disabled={busy || !versionId || !dataset} onClick={check}>
                <ShieldCheck />
                Validate saved version
              </Button>
            }
          >
            <Field label="Reference dataset">
              <select
                value={dataset}
                className={selectClass}
                onChange={(e) => setDataset(e.target.value)}
              >
                <option value="">Select dataset</option>
                {library.data?.datasets.map((d) => (
                  <option value={d.id} key={d.id}>
                    {d.instruments?.symbol} · M1 v{d.version}
                  </option>
                ))}
              </select>
            </Field>
            {report ? (
              <div className="mt-3 space-y-2">
                {report.checks?.map((c) => (
                  <div key={c.name} className="border-b py-2 text-xs">
                    <div className="flex justify-between gap-3">
                      <span>{c.name}</span>
                      <span
                        className={
                          c.status === "pass"
                            ? "text-positive"
                            : c.status === "fail"
                              ? "text-negative"
                              : "text-warning"
                        }
                      >
                        {c.status.toUpperCase()}
                      </span>
                    </div>
                    {c.detail && <p className="mt-1 text-muted-foreground">{c.detail}</p>}
                  </div>
                ))}
                <p className="text-xs">
                  Research: {report.research_ready ? "ready" : "blocked"} · Paper deployment:{" "}
                  {report.deployable ? "approved" : "not certified"}
                </p>
                {report.warnings?.map((w) => (
                  <p key={w} className="text-xs text-warning">
                    {w}
                  </p>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-xs text-muted-foreground">
                No completed validation for this version.
              </p>
            )}
            {jobId && <JobStatus jobId={jobId} />}
            {versionId && report?.research_ready && (
              <Button asChild size="sm" className="mt-3">
                <Link
                  to="/backtests"
                  search={{
                    modelVersionId: versionId,
                    datasetIds: selection.datasetIds ?? (dataset ? [dataset] : []),
                  }}
                >
                  <ArrowRight />
                  Configure backtest
                </Link>
              </Button>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
