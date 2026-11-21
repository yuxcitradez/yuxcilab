
CREATE OR REPLACE FUNCTION public.copy_dataset_bars(_src uuid, _dst uuid, _excl_start timestamptz DEFAULT NULL, _excl_end timestamptz DEFAULT NULL)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n bigint;
BEGIN
  IF (SELECT user_id FROM datasets WHERE id=_src) IS DISTINCT FROM (SELECT user_id FROM datasets WHERE id=_dst) THEN
    RAISE EXCEPTION 'Datasets belong to different owners';
  END IF;
  INSERT INTO market_bars (user_id, dataset_id, instrument_id, ts_utc, open, high, low, close, volume, volume_type, spread, spread_unit, source_metadata)
  SELECT d.user_id, _dst, d.instrument_id, b.ts_utc, b.open, b.high, b.low, b.close, b.volume, b.volume_type, b.spread, b.spread_unit,
         jsonb_build_object('copied_from', _src)
  FROM market_bars b JOIN datasets d ON d.id = _dst
  WHERE b.dataset_id = _src
    AND (_excl_start IS NULL OR b.ts_utc < _excl_start OR b.ts_utc > _excl_end)
  ON CONFLICT (dataset_id, ts_utc) DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.copy_dataset_bars(uuid, uuid, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.copy_dataset_bars(uuid, uuid, timestamptz, timestamptz) TO service_role;
