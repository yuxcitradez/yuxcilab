export type EngineJobKind = "model_validation" | "backtest" | "prop_simulation";

// Engine feature names are not always the same as durable job kinds.
const JOB_CAPABILITIES: Record<EngineJobKind, string> = {
  model_validation: "model_validation",
  backtest: "backtests",
  prop_simulation: "prop_simulation",
};

export function supportsEngineJob(capabilities: unknown, kind: EngineJobKind): boolean {
  return Array.isArray(capabilities) && capabilities.includes(JOB_CAPABILITIES[kind]);
}