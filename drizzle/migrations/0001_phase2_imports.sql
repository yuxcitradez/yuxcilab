
ALTER TABLE public.data_import_files
  ADD COLUMN storage_path text,
  ADD COLUMN config jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN file_sha256 text,
  ADD COLUMN source_rows bigint NOT NULL DEFAULT 0,
  ADD COLUMN duplicate_rows bigint NOT NULL DEFAULT 0,
  ADD COLUMN conflict_rows bigint NOT NULL DEFAULT 0,
  ADD COLUMN existing_rows bigint NOT NULL DEFAULT 0,
  ADD COLUMN completed_at timestamptz;

ALTER TABLE public.datasets ADD COLUMN gap_report jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN detected_interval_s int,
  ADD COLUMN spread_unit text,
  ADD COLUMN volume_type text;

CREATE POLICY "Owner read imports" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'imports' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Owner upload imports" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'imports' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Owner delete imports" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'imports' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE OR REPLACE FUNCTION public.dataset_daily_coverage(_dataset_ids uuid[])
RETURNS TABLE(dataset_id uuid, day date, bars bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT b.dataset_id, (b.ts_utc AT TIME ZONE 'UTC')::date AS day, count(*)::bigint
  FROM public.market_bars b
  WHERE b.dataset_id = ANY(_dataset_ids)
  GROUP BY 1, 2
  ORDER BY 1, 2
$$;
GRANT EXECUTE ON FUNCTION public.dataset_daily_coverage(uuid[]) TO authenticated;
