import { describe, expect, it } from "vitest";
import { supportsEngineJob } from "./engine-capabilities";

describe("Engine job capabilities", () => {
  const deployedCapabilities = ["imports", "model_validation", "backtests", "prop_simulation", "market_account", "live_paper"];

  it("allows backtest jobs when the Engine advertises backtests", () => {
    expect(supportsEngineJob(deployedCapabilities, "backtest")).toBe(true);
    expect(supportsEngineJob(["imports"], "backtest")).toBe(false);
  });

  it("allows model validation only with its advertised capability", () => {
    expect(supportsEngineJob(deployedCapabilities, "model_validation")).toBe(true);
    expect(supportsEngineJob(["backtests"], "model_validation")).toBe(false);
  });

  it("allows prop simulation only with its advertised capability", () => {
    expect(supportsEngineJob(deployedCapabilities, "prop_simulation")).toBe(true);
    expect(supportsEngineJob(["backtests"], "prop_simulation")).toBe(false);
  });

  it("fails closed for missing or malformed capabilities", () => {
    expect(supportsEngineJob(undefined, "backtest")).toBe(false);
    expect(supportsEngineJob("backtests", "backtest")).toBe(false);
  });
});