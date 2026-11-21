import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { RefreshCw, Save } from "lucide-react";
import { getMarketAccount } from "@/lib/lab.functions";
import { supabase } from "@/integrations/supabase/client";
import { Panel } from "./Panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLibrary, ErrorText, Field, selectClass } from "./Workflow";

type Account = {
  planCode?: string;
  requestCount?: number;
  requestLimit?: number;
  timeframes?: string[];
  symbols?: string[];
  isSocketSupport?: boolean;
  webSocketConcurrentLimit?: number;
};
export function ProviderPanel() {
  const fn = useServerFn(getMarketAccount);
  const library = useLibrary();
  const qc = useQueryClient();
  const [instrument, setInstrument] = useState("");
  const [symbol, setSymbol] = useState("");
  const [point, setPoint] = useState("");
  const [error, setError] = useState<unknown>(null);
  const account = useQuery({
    queryKey: ["market-account"],
    queryFn: async () => JSON.parse(await fn()) as { account: Account },
    retry: false,
    staleTime: 300000,
  });
  const info = account.data?.["account"] as Account | undefined;
  async function save() {
    try {
      if (!instrument || !symbol || Number(point) <= 0)
        throw new Error("Choose an instrument, provider symbol and positive point size");
      const { error } = await supabase
        .from("instruments")
        .update({ provider_symbol_code: symbol, point_size: Number(point) })
        .eq("id", instrument);
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["lab-library"] });
      setError(null);
    } catch (e) {
      setError(e);
    }
  }
  return (
    <Panel
      title="RealMarketAPI account"
      actions={
        <Button
          size="sm"
          variant="outline"
          title="Refresh account permissions"
          disabled={account.isFetching}
          onClick={() => account.refetch()}
        >
          <RefreshCw />
          Refresh
        </Button>
      }
    >
      <ErrorText error={account.error} />
      {info && (
        <>
          <dl className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
            <div>
              <dt className="text-muted-foreground">Plan</dt>
              <dd className="num mt-1">{info.planCode ?? "Unknown"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Request usage</dt>
              <dd className="num mt-1">
                {info.requestCount ?? "—"} / {info.requestLimit ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">WebSocket</dt>
              <dd className="mt-1">{info.isSocketSupport ? "Included" : "Not included"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Connection limit</dt>
              <dd className="num mt-1">{info.webSocketConcurrentLimit ?? "—"}</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-muted-foreground">
            Timeframes: {info.timeframes?.join(", ") || "Unknown"}
          </p>
          <p className="mt-1 break-words text-xs text-muted-foreground">
            Available symbols: {info.symbols?.join(", ") || "Unknown"}
          </p>
        </>
      )}
      <div className="mt-4 grid items-end gap-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
        <Field label="Instrument">
          <select
            className={selectClass}
            value={instrument}
            onChange={(e) => {
              const i = library.data?.instruments.find((i) => i.id === e.target.value);
              setInstrument(e.target.value);
              setSymbol(i?.provider_symbol_code ?? "");
              setPoint(String(i?.point_size ?? ""));
            }}
          >
            <option value="">Select instrument</option>
            {library.data?.instruments.map((i) => (
              <option key={i.id} value={i.id}>
                {i.symbol}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Provider symbol">
          <Input
            list="provider-symbols"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
          />
          <datalist id="provider-symbols">
            {info?.symbols?.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </Field>
        <Field label="Point size">
          <Input
            type="number"
            step="any"
            min={0}
            value={point}
            onChange={(e) => setPoint(e.target.value)}
          />
        </Field>
        <Button size="sm" disabled={!instrument} onClick={save}>
          <Save />
          Save mapping
        </Button>
      </div>
      <ErrorText error={error} />
    </Panel>
  );
}
