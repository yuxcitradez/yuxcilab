import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteHistory } from "@/lib/history.functions";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader,
  AlertDialogTitle, AlertDialogDescription, AlertDialogFooter,
} from "@/components/ui/alert-dialog";

export function DeleteHistoryButton({ kind, id, label, disabled = false, onDeleted }: {
  kind: "backtest" | "dataset";
  id: string;
  label: string;
  disabled?: boolean;
  onDeleted?: () => void;
}) {
  const remove = useServerFn(deleteHistory);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function confirmDelete() {
    setBusy(true);
    setError("");
    try {
      await remove({ data: { kind, id } });
      onDeleted?.();
      await qc.invalidateQueries();
      setOpen(false);
      toast.success(kind === "backtest" ? "Backtest deleted" : "Historical data deleted");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete history");
    } finally {
      setBusy(false);
    }
  }
  return (
    <AlertDialog open={open} onOpenChange={(value) => { if (!busy) { setOpen(value); setError(""); } }}>
      <AlertDialogTrigger asChild>
        <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" disabled={disabled}
          aria-label={`Delete ${label}`} title={disabled ? "Cancel ongoing work before deleting" : `Delete ${label}`}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="max-w-[calc(100%-2rem)] sm:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {label}?</AlertDialogTitle>
          <AlertDialogDescription>
            {kind === "backtest"
              ? "This permanently removes this backtest, its trades, charts, and linked finished simulations. Historical market data is kept."
              : "This permanently removes this dataset version and all its candles. The instrument and uploaded source file are kept. Data used by saved backtests or model validations cannot be deleted."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && <p role="alert" className="break-words text-sm text-destructive">{error}</p>}
        <AlertDialogFooter className="gap-2">
          <Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="destructive" disabled={busy} onClick={confirmDelete}>
            <Trash2 />{busy ? "Deleting…" : "Delete permanently"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}