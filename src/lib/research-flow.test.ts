import { describe, expect, it } from "vitest";
import { matchesSimulation, modelParameters, researchSearch } from "./research-flow";

const runId = "11111111-1111-4111-8111-111111111111";
const profileId = "22222222-2222-4222-8222-222222222222";
describe("Research pipeline inputs", () => {
  it("carries the selected historical data and model to the backtest", () => {
    expect(researchSearch({ modelVersionId: profileId, datasetIds: [runId, runId] })).toEqual({
      modelVersionId: profileId,
      datasetIds: [runId],
    });
  });
  it("rejects invalid identifiers instead of selecting an unrelated run", () => {
    expect(researchSearch({ runId: "not-a-run", datasetIds: ["invalid"] })).toEqual({});
  });
  it("preserves chosen model settings as the backtest inputs", () => {
    expect(modelParameters('{"sl_mult":5,"use_spread":false}')).toEqual({
      sl_mult: 5,
      use_spread: false,
    });
    expect(() => modelParameters("[]")).toThrow("JSON object");
  });
  it("only uses prop results from the selected backtest and environment", () => {
    const job = { kind: "prop_simulation", payload: { run_id: runId, profile_id: profileId } };
    expect(matchesSimulation(job, { runId, profileId })).toBe(true);
    expect(matchesSimulation(job, { runId: profileId, profileId })).toBe(false);
    expect(matchesSimulation({ ...job, kind: "backtest" }, { runId })).toBe(false);
  });
});
