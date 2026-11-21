import {
  flexRender, getCoreRowModel, getSortedRowModel, useReactTable,
  type ColumnDef, type SortingState,
} from "@tanstack/react-table";
import { useState } from "react";
import { ArrowDown, ArrowUp, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { downloadCsv } from "./csv";

export function DataTable<T extends Record<string, unknown>>({
  data, columns, exportName, empty,
}: { data: T[]; columns: ColumnDef<T, unknown>[]; exportName?: string; empty?: string }) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const table = useReactTable({
    data, columns, state: { sorting }, onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel(),
  });
  return (
    <div>
      {exportName && (
        <div className="mb-2 flex justify-end">
          <Button
            size="sm" variant="outline" disabled={data.length === 0}
            onClick={() => downloadCsv(`${exportName}.csv`, table.getSortedRowModel().rows.map((r) => r.original))}
          >
            <Download className="h-3 w-3" /> CSV
          </Button>
        </div>
      )}
      <div className="overflow-x-auto rounded-sm border">
        <table className="w-full text-xs">
          <thead className="bg-muted/50">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => (
                  <th
                    key={h.id}
                    onClick={h.column.getToggleSortingHandler()}
                    className="cursor-pointer select-none whitespace-nowrap px-2.5 py-1.5 text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground"
                  >
                    <span className="inline-flex items-center gap-1">
                      {flexRender(h.column.columnDef.header, h.getContext())}
                      {h.column.getIsSorted() === "asc" && <ArrowUp className="h-3 w-3" />}
                      {h.column.getIsSorted() === "desc" && <ArrowDown className="h-3 w-3" />}
                    </span>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-2.5 py-6 text-center text-muted-foreground">
                  {empty ?? "No rows"}
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((r) => (
                <tr key={r.id} className="border-t hover:bg-accent/40">
                  {r.getVisibleCells().map((c) => (
                    <td key={c.id} className="num whitespace-nowrap px-2.5 py-1.5">
                      {flexRender(c.column.columnDef.cell, c.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
