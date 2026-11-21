import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function DatasetSelector({ instrumentId, value, onChange }: {
  instrumentId: string | null; value: string | null; onChange: (id: string) => void;
}) {
  const q = useQuery({
    queryKey: ["datasets", instrumentId],
    enabled: Boolean(instrumentId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("datasets")
        .select("id, version, timeframe, source_filename, candle_count, is_active")
        .eq("instrument_id", instrumentId!)
        .order("version", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  return (
    <Select value={value ?? ""} onValueChange={onChange} disabled={!instrumentId}>
      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select dataset version" /></SelectTrigger>
      <SelectContent>
        {(q.data ?? []).map((d) => (
          <SelectItem key={d.id} value={d.id} className="text-xs">
            v{d.version} · {d.timeframe} · {d.candle_count.toLocaleString()} bars{d.is_active ? " · active" : ""}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
