import { Link, Outlet, useNavigate, useRouter } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  Database,
  Code2,
  FlaskConical,
  Building2,
  Radio,
  Settings,
  LogOut,
  TrendingUp,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getEngineHealth } from "@/lib/engine.functions";
import { StatusIndicator } from "./StatusIndicator";
import { Button } from "@/components/ui/button";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/data", label: "Historical Data", icon: Database },
  { to: "/models", label: "Model & Settings", icon: Code2 },
  { to: "/backtests", label: "Backtests", icon: FlaskConical },
  { to: "/prop-profiles", label: "Prop Environment", icon: Building2 },
  { to: "/expected-value", label: "Expected Value", icon: TrendingUp },
  { to: "/live", label: "Live", icon: Radio },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

function Clock({ tz, label }: { tz: string; label: string }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const t = now ? now.toLocaleTimeString("en-GB", { timeZone: tz, hour12: false }) : "--:--:--";
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className="num text-xs">{t}</span>
    </div>
  );
}

function TopBar() {
  const healthFn = useServerFn(getEngineHealth);
  const health = useQuery({
    queryKey: ["engine-health"],
    queryFn: () => healthFn(),
    refetchInterval: 30_000,
  });
  const active = useQuery({
    queryKey: ["active-deployments-count"],
    queryFn: async () => {
      const { count } = await supabase
        .from("live_deployments")
        .select("id", { count: "exact", head: true })
        .eq("status", "running");
      return count ?? 0;
    },
    refetchInterval: 30_000,
  });
  const e = health.data?.engine;
  const m = health.data?.market;
  const tone = (h?: { configured: boolean; ok: boolean }) =>
    !h ? "idle" : !h.configured ? "idle" : h.ok ? "ok" : "error";
  return (
    <header className="flex min-h-10 flex-wrap items-center gap-x-5 gap-y-2 border-b bg-sidebar px-3 py-2 sm:px-4">
      <StatusIndicator tone={tone(e)} label="Engine" value={e?.status ?? "…"} />
      <StatusIndicator tone={tone(m)} label="RealMarketAPI" value={m?.status ?? "…"} />
      <StatusIndicator
        tone={(active.data ?? 0) > 0 ? "ok" : "idle"}
        label="Live"
        value={`${active.data ?? 0} active`}
      />
      <div className="ml-auto hidden items-center gap-4 sm:flex">
        <Clock tz="UTC" label="UTC" />
        <Clock tz="America/New_York" label="NY" />
      </div>
    </header>
  );
}

export function AppShell() {
  const navigate = useNavigate();
  const router = useRouter();
  const qc = useQueryClient();
  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    await router.invalidate();
    navigate({ to: "/login", search: {}, replace: true });
  }
  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 flex h-screen w-12 shrink-0 flex-col border-r bg-sidebar sm:w-48">
        <div className="flex h-10 items-center justify-center border-b sm:justify-start sm:px-4">
          <span className="num text-xs font-medium uppercase text-primary sm:hidden">ML</span>
          <span className="num hidden text-xs font-medium uppercase tracking-[0.25em] text-primary sm:inline">
            Model Lab
          </span>
        </div>
        <nav className="flex-1 space-y-0.5 p-2">
          {NAV.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              title={label}
              aria-label={label}
              className="flex items-center justify-center gap-2.5 rounded-sm py-2 text-sidebar-foreground transition-colors hover:bg-sidebar-accent sm:justify-start sm:px-2.5 sm:py-1.5"
              activeProps={{ className: "bg-sidebar-accent text-sidebar-primary" }}
            >
              <Icon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{label}</span>
            </Link>
          ))}
        </nav>
        <div className="border-t p-2">
          <div className="hidden px-2.5 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground sm:block">
            Paper trading only
          </div>
          <Button
            variant="ghost"
            title="Sign out"
            aria-label="Sign out"
            onClick={signOut}
            className="flex w-full items-center justify-center gap-2.5 rounded-sm px-0 py-1.5 text-muted-foreground hover:bg-sidebar-accent hover:text-foreground sm:justify-start sm:px-2.5"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Sign out</span>
          </Button>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main className="min-w-0 flex-1 p-3 sm:p-5">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
