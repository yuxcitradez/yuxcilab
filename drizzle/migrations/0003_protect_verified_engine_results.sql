REVOKE INSERT, UPDATE, DELETE ON public.jobs FROM authenticated;
GRANT SELECT ON public.jobs TO authenticated;
GRANT ALL ON public.jobs TO service_role;
REVOKE INSERT, UPDATE, DELETE ON public.model_versions FROM authenticated;
GRANT SELECT ON public.model_versions TO authenticated;
GRANT ALL ON public.model_versions TO service_role;
CREATE INDEX IF NOT EXISTS jobs_owner_kind_created_idx ON public.jobs(user_id,kind,created_at DESC);
CREATE INDEX IF NOT EXISTS backtest_trades_owner_run_idx ON public.backtest_trades(user_id,run_id,exit_time);