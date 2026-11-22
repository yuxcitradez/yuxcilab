import { MetricCard } from "./MetricCard";
import { Panel } from "./Panel";
import { EquityCurve } from "./Charts";

export type PropResult = {
  hit_rate: number;
  break_even: number;
  ev_per_account: number;
  bootstrap_net_ev?: number;
  block_bootstrap_ruin: number;
  warnings: string[];
  replay: {
    ending_balance: number;
    breach: string | null;
    passed: boolean;
    curve: { t: string; v: number }[];
  };
  bankroll_curve: { bankroll: number; ruin_probability: number }[];
};

export function PropResults({ result }: { result: PropResult }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="Expected value / account" value={result.ev_per_account.toFixed(2)} />
        <MetricCard
          label="Expected bankroll net change"
          value={result.bootstrap_net_ev?.toFixed(2) ?? "—"}
        />
        <MetricCard label="Observed TP rate" value={`${(result.hit_rate * 100).toFixed(2)}%`} />
        <MetricCard label="Break-even TP rate" value={`${(result.break_even * 100).toFixed(2)}%`} />
      </div>
      <div className="flex flex-wrap items-center gap-5 border-y py-3 text-xs">
        <span>
          Account replay:{" "}
          {result.replay.breach
            ? `breached (${result.replay.breach})`
            : result.replay.passed
              ? "target passed"
              : "in progress"}
        </span>
        <span className="num">Ending balance {result.replay.ending_balance.toFixed(2)}</span>
        <span className="num">
          Block-bootstrap ruin {(result.block_bootstrap_ruin * 100).toFixed(2)}%
        </span>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Account replay equity">
          <EquityCurve data={result.replay.curve} />
        </Panel>
        <Panel title="Bankroll vs ruin probability">
          <EquityCurve
            data={result.bankroll_curve.map((p) => ({
              t: String(p.bankroll),
              v: p.ruin_probability * 100,
            }))}
          />
        </Panel>
      </div>
      {result.warnings.map((warning) => (
        <p key={warning} className="text-xs text-warning">
          {warning}
        </p>
      ))}
    </div>
  );
}
