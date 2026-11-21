import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "./DataTable";
import { cn } from "@/lib/utils";

export type TradeRow = {
  side: string | null; entry_time: string | null; entry: number | null; exit_time: string | null;
  exit: number | null; reason: string | null; pnl: number | null; mae: number | null;
  [k: string]: unknown;
};

const num = (v: unknown, d = 2) => (typeof v === "number" ? v.toFixed(d) : "—");
const cols: ColumnDef<TradeRow, unknown>[] = [
  { accessorKey: "entry_time", header: "Entry time", cell: (c) => String(c.getValue() ?? "—").replace("T", " ").slice(0, 19) },
  { accessorKey: "side", header: "Side" },
  { accessorKey: "entry", header: "Entry", cell: (c) => num(c.getValue(), 5) },
  { accessorKey: "exit_time", header: "Exit time", cell: (c) => String(c.getValue() ?? "—").replace("T", " ").slice(0, 19) },
  { accessorKey: "exit", header: "Exit", cell: (c) => num(c.getValue(), 5) },
  { accessorKey: "reason", header: "Reason" },
  {
    accessorKey: "pnl", header: "PnL",
    cell: (c) => {
      const v = c.getValue() as number | null;
      return <span className={cn(v !== null && v > 0 && "text-positive", v !== null && v < 0 && "text-negative")}>{num(v)}</span>;
    },
  },
  { accessorKey: "mae", header: "MAE", cell: (c) => num(c.getValue()) },
];

export function TradesTable({ trades, exportName = "trades" }: { trades: TradeRow[]; exportName?: string }) {
  return <DataTable data={trades} columns={cols} exportName={exportName} empty="No trades" />;
}
