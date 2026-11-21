CREATE OR REPLACE FUNCTION public.delete_lab_history(_kind text, _id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); item_status text;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Sign in before deleting history'; END IF;
  IF _kind NOT IN ('backtest','dataset') THEN RAISE EXCEPTION 'Invalid history type'; END IF;
  LOCK TABLE public.jobs, public.backtest_runs, public.datasets, public.data_import_files IN SHARE ROW EXCLUSIVE MODE;
  IF _kind = 'backtest' THEN
    SELECT status INTO item_status FROM public.backtest_runs WHERE id = _id AND user_id = uid;
    IF NOT FOUND THEN RAISE EXCEPTION 'Backtest not found'; END IF;
    IF item_status NOT IN ('completed','failed','cancelled') OR EXISTS (
      SELECT 1 FROM public.jobs WHERE user_id = uid AND payload->>'run_id' = _id::text AND status NOT IN ('completed','failed','cancelled')
    ) THEN RAISE EXCEPTION 'Cancel ongoing backtests or simulations and wait for them to stop before deleting'; END IF;
    DELETE FROM public.jobs WHERE user_id = uid AND payload->>'run_id' = _id::text;
    DELETE FROM public.backtest_runs WHERE id = _id AND user_id = uid;
  ELSE
    PERFORM 1 FROM public.datasets WHERE id = _id AND user_id = uid;
    IF NOT FOUND THEN RAISE EXCEPTION 'Historical dataset not found'; END IF;
    IF EXISTS (SELECT 1 FROM public.backtest_runs WHERE user_id = uid AND (dataset_manifest @> jsonb_build_array(jsonb_build_object('id',_id)) OR config->'dataset_ids' @> jsonb_build_array(_id::text)))
      OR EXISTS (SELECT 1 FROM public.backtest_trades WHERE dataset_id = _id)
      OR EXISTS (SELECT 1 FROM public.jobs WHERE user_id = uid AND payload->'dataset_ids' @> jsonb_build_array(_id::text))
    THEN RAISE EXCEPTION 'This dataset is used by saved backtests or model validations and cannot be deleted'; END IF;
    IF EXISTS (SELECT 1 FROM public.data_import_files WHERE user_id = uid AND status NOT IN ('completed','failed','cancelled') AND (dataset_id = _id OR config->>'instrument_id' = (SELECT instrument_id::text FROM public.datasets WHERE id = _id)))
    THEN RAISE EXCEPTION 'Wait for ongoing imports for this instrument to stop before deleting'; END IF;
    DELETE FROM public.datasets WHERE id = _id AND user_id = uid;
  END IF;
  INSERT INTO public.audit_log(user_id,action,entity,entity_id) VALUES(uid, _kind || '.deleted', _kind, _id::text);
END;
$$;
REVOKE ALL ON FUNCTION public.delete_lab_history(text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_lab_history(text,uuid) TO authenticated;
REVOKE DELETE ON public.datasets, public.backtest_runs FROM authenticated;
GRANT ALL ON public.datasets, public.backtest_runs TO service_role;