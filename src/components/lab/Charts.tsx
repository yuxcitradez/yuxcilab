import { Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export type Point = { t: string; v: number };
const axis = { stroke: "var(--muted-foreground)", fontSize: 10, tickLine: false, axisLine: false } as const;
const tip = {
  contentStyle: { background: "var(--popover)", border: "1px solid var(--border)", fontSize: 11 },
  labelStyle: { color: "var(--muted-foreground)" },
};

export function EquityCurve({ data, height = 200 }: { data: Point[]; height?: number }) {
  if (data.length === 0) return <ChartEmpty height={height} />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data}>
        <CartesianGrid stroke="var(--border)" strokeDasharray="2 4" />
        <XAxis dataKey="t" {...axis} minTickGap={40} />
        <YAxis {...axis} width={56} domain={["auto", "auto"]} />
        <Tooltip {...tip} />
        <Line type="monotone" dataKey="v" name="Equity" stroke="var(--chart-1)" dot={false} strokeWidth={1.5} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function DrawdownChart({ data, height = 140 }: { data: Point[]; height?: number }) {
  if (data.length === 0) return <ChartEmpty height={height} />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data}>
        <CartesianGrid stroke="var(--border)" strokeDasharray="2 4" />
        <XAxis dataKey="t" {...axis} minTickGap={40} />
        <YAxis {...axis} width={56} />
        <Tooltip {...tip} />
        <Area type="monotone" dataKey="v" name="Drawdown" stroke="var(--negative)" fill="var(--negative)" fillOpacity={0.15} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function ChartEmpty({ height }: { height: number }) {
  return (
    <div style={{ height }} className="flex items-center justify-center rounded-sm border border-dashed text-xs text-muted-foreground">
      No data yet
    </div>
  );
}
