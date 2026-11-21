
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
CREATE OR REPLACE FUNCTION public.prevent_update() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$ BEGIN RAISE EXCEPTION 'Rows in % are immutable', TG_TABLE_NAME; END $$;

CREATE TABLE public.instruments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  symbol text NOT NULL,
  display_name text,
  asset_class text NOT NULL DEFAULT 'forex',
  provider_symbol_code text,
  digits int NOT NULL DEFAULT 5,
  point_size numeric NOT NULL DEFAULT 0.00001,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, symbol)
);

CREATE TABLE public.symbol_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  instrument_id uuid NOT NULL REFERENCES public.instruments(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'realmarketapi',
  provider_symbol_code text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (instrument_id, provider)
);

CREATE TABLE public.datasets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  instrument_id uuid NOT NULL REFERENCES public.instruments(id) ON DELETE RESTRICT,
  version int NOT NULL,
  timeframe text NOT NULL DEFAULT 'M1',
  source_type text NOT NULL DEFAULT 'csv',
  source_filename text,
  file_sha256 text,
  price_basis text NOT NULL DEFAULT 'unknown',
  timezone text NOT NULL DEFAULT 'UTC',
  timestamp_format text,
  column_mapping jsonb NOT NULL DEFAULT '{}'::jsonb,
  start_time_utc timestamptz,
  end_time_utc timestamptz,
  candle_count bigint NOT NULL DEFAULT 0,
  rejected_count bigint NOT NULL DEFAULT 0,
  validation_status text NOT NULL DEFAULT 'pending',
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (instrument_id, timeframe, version)
);

CREATE TABLE public.data_import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  status text NOT NULL DEFAULT 'pending',
  upload_mode text NOT NULL DEFAULT 'per_file',
  total_files int NOT NULL DEFAULT 0,
  processed_files int NOT NULL DEFAULT 0,
  accepted_rows bigint NOT NULL DEFAULT 0,
  rejected_rows bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE public.data_import_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  batch_id uuid NOT NULL REFERENCES public.data_import_batches(id) ON DELETE CASCADE,
  filename text NOT NULL,
  instrument_id uuid REFERENCES public.instruments(id) ON DELETE SET NULL,
  dataset_id uuid REFERENCES public.datasets(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending',
  progress numeric NOT NULL DEFAULT 0,
  accepted_rows bigint NOT NULL DEFAULT 0,
  rejected_rows bigint NOT NULL DEFAULT 0,
  validation_report jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.import_rejections (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  file_id uuid NOT NULL REFERENCES public.data_import_files(id) ON DELETE CASCADE,
  row_number bigint,
  raw_row text,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.market_bars (
  user_id uuid NOT NULL DEFAULT auth.uid(),
  dataset_id uuid NOT NULL REFERENCES public.datasets(id) ON DELETE CASCADE,
  instrument_id uuid NOT NULL REFERENCES public.instruments(id) ON DELETE CASCADE,
  ts_utc timestamptz NOT NULL,
  open double precision NOT NULL,
  high double precision NOT NULL,
  low double precision NOT NULL,
  close double precision NOT NULL,
  volume double precision,
  volume_type text,
  spread double precision,
  spread_unit text,
  source_metadata jsonb,
  PRIMARY KEY (dataset_id, ts_utc)
);
CREATE INDEX market_bars_instrument_ts ON public.market_bars (instrument_id, ts_utc);

CREATE TABLE public.models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.model_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  model_id uuid NOT NULL REFERENCES public.models(id) ON DELETE CASCADE,
  version int NOT NULL,
  code text NOT NULL,
  code_sha256 text NOT NULL,
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  contract_status text NOT NULL DEFAULT 'unvalidated',
  validation_report jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (model_id, version)
);

CREATE TABLE public.prop_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  name text NOT NULL,
  firm_name text,
  rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.backtest_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  model_version_id uuid NOT NULL REFERENCES public.model_versions(id) ON DELETE RESTRICT,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  dataset_manifest jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'queued',
  progress numeric NOT NULL DEFAULT 0,
  metrics jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.backtest_trades (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  run_id uuid NOT NULL REFERENCES public.backtest_runs(id) ON DELETE CASCADE,
  instrument_id uuid REFERENCES public.instruments(id),
  dataset_id uuid REFERENCES public.datasets(id),
  day date,
  side text,
  entry_time timestamptz,
  entry double precision,
  exit_time timestamptz,
  exit double precision,
  reason text,
  pts double precision,
  pnl double precision,
  mae double precision,
  mfe double precision,
  half_range double precision,
  tag text
);
CREATE INDEX backtest_trades_run ON public.backtest_trades (run_id, entry_time);

CREATE TABLE public.backtest_daily (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  run_id uuid NOT NULL REFERENCES public.backtest_runs(id) ON DELETE CASCADE,
  instrument_id uuid REFERENCES public.instruments(id),
  day date NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('TP','SL','TIMEOUT','NO_TRADE','SKIP'))
);
CREATE INDEX backtest_daily_run ON public.backtest_daily (run_id, day);

CREATE TABLE public.live_deployments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  model_version_id uuid NOT NULL REFERENCES public.model_versions(id) ON DELETE RESTRICT,
  instruments jsonb NOT NULL DEFAULT '[]'::jsonb,
  prop_profile_id uuid REFERENCES public.prop_profiles(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'stopped',
  started_at timestamptz,
  stopped_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.live_trades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  deployment_id uuid NOT NULL REFERENCES public.live_deployments(id) ON DELETE CASCADE,
  instrument_id uuid REFERENCES public.instruments(id),
  side text,
  entry_time timestamptz,
  entry double precision,
  exit_time timestamptz,
  exit double precision,
  reason text,
  pnl double precision,
  mae double precision,
  mfe double precision,
  spread_at_entry double precision,
  execution jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.live_equity (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  deployment_id uuid NOT NULL REFERENCES public.live_deployments(id) ON DELETE CASCADE,
  ts timestamptz NOT NULL,
  equity double precision NOT NULL,
  drawdown double precision NOT NULL DEFAULT 0
);
CREATE INDEX live_equity_dep_ts ON public.live_equity (deployment_id, ts);

CREATE TABLE public.live_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  deployment_id uuid REFERENCES public.live_deployments(id) ON DELETE CASCADE,
  ts timestamptz NOT NULL DEFAULT now(),
  level text NOT NULL DEFAULT 'info',
  type text NOT NULL,
  message text,
  metadata jsonb
);
CREATE INDEX live_events_dep_ts ON public.live_events (deployment_id, ts DESC);

CREATE TABLE public.engine_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  timestamp timestamptz NOT NULL DEFAULT now(),
  level text NOT NULL DEFAULT 'info',
  message text NOT NULL,
  component text,
  metadata jsonb
);

CREATE TABLE public.jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  kind text NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  progress numeric NOT NULL DEFAULT 0,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz
);

CREATE TABLE public.audit_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  ts timestamptz NOT NULL DEFAULT now(),
  action text NOT NULL,
  entity text,
  entity_id text,
  details jsonb
);
CREATE INDEX audit_log_ts ON public.audit_log (user_id, ts DESC);

-- Grants, RLS, owner policies
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['instruments','symbol_mappings','datasets','data_import_batches','data_import_files','import_rejections','market_bars','models','model_versions','prop_profiles','backtest_runs','backtest_trades','backtest_daily','live_deployments','live_trades','live_equity','live_events','engine_logs','jobs','audit_log'] LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY "Owner select" ON public.%I FOR SELECT TO authenticated USING (auth.uid() = user_id)', t);
    EXECUTE format('CREATE POLICY "Owner insert" ON public.%I FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id)', t);
    EXECUTE format('CREATE POLICY "Owner update" ON public.%I FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)', t);
    EXECUTE format('CREATE POLICY "Owner delete" ON public.%I FOR DELETE TO authenticated USING (auth.uid() = user_id)', t);
  END LOOP;
END $$;

-- Immutability
CREATE TRIGGER model_versions_immutable BEFORE UPDATE ON public.model_versions FOR EACH ROW EXECUTE FUNCTION public.prevent_update();
CREATE TRIGGER market_bars_immutable BEFORE UPDATE ON public.market_bars FOR EACH ROW EXECUTE FUNCTION public.prevent_update();
CREATE OR REPLACE FUNCTION public.datasets_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.instrument_id <> OLD.instrument_id OR NEW.version <> OLD.version OR NEW.timeframe <> OLD.timeframe
     OR NEW.file_sha256 IS DISTINCT FROM OLD.file_sha256 OR NEW.price_basis <> OLD.price_basis
     OR (OLD.validation_status IN ('valid','warning') AND (NEW.candle_count <> OLD.candle_count OR NEW.start_time_utc IS DISTINCT FROM OLD.start_time_utc OR NEW.end_time_utc IS DISTINCT FROM OLD.end_time_utc)) THEN
    RAISE EXCEPTION 'Dataset identity fields are immutable; create a new version instead';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER datasets_guard BEFORE UPDATE ON public.datasets FOR EACH ROW EXECUTE FUNCTION public.datasets_guard();
CREATE TRIGGER models_updated BEFORE UPDATE ON public.models FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER prop_profiles_updated BEFORE UPDATE ON public.prop_profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE public.jobs, public.live_events, public.live_equity, public.data_import_files;
