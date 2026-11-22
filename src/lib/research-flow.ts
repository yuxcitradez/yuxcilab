import { z } from "zod";

export type ResearchSearch = {
  modelVersionId?: string;
  datasetIds?: string[];
  runId?: string;
  profileId?: string;
  jobId?: string;
};

const uuid = z.string().uuid();

export function researchSearch(input: Record<string, unknown>): ResearchSearch {
  const result: ResearchSearch = {};
  for (const key of ["modelVersionId", "runId", "profileId", "jobId"] as const) {
    const value = uuid.safeParse(input[key]);
    if (value.success) result[key] = value.data;
  }
  const datasets = z.array(uuid).max(20).safeParse(input["datasetIds"]);
  if (datasets.success) result.datasetIds = [...new Set(datasets.data)];
  return result;
}

export function modelParameters(text: string): Record<string, unknown> {
  const value: unknown = JSON.parse(text);
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Model settings must be a JSON object");
  return value as Record<string, unknown>;
}

export function matchesSimulation(
  job: { kind: string; payload: unknown },
  selection: ResearchSearch,
): boolean {
  if (job.kind !== "prop_simulation" || !job.payload || typeof job.payload !== "object")
    return false;
  const payload = job.payload as Record<string, unknown>;
  return (
    (!selection.runId || payload["run_id"] === selection.runId) &&
    (!selection.profileId || payload["profile_id"] === selection.profileId) &&
    (!selection.jobId || ("id" in job && job.id === selection.jobId))
  );
}
