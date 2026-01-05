-- NUEVA FUNCIÓN SIN p_user_id (usa auth.uid() internamente)
CREATE OR REPLACE FUNCTION public.acquire_project_lock(
  p_project_id uuid,
  p_reason text,
  p_duration_seconds integer DEFAULT 600
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id uuid;
  v_expires_at TIMESTAMPTZ;
  v_rows_affected INT;
BEGIN
  -- Get user from JWT
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: missing auth.uid()';
  END IF;

  -- Minimum lock duration safety
  IF p_duration_seconds < 30 THEN
    p_duration_seconds := 30;
  END IF;

  v_expires_at := now() + (p_duration_seconds || ' seconds')::interval;

  -- Try to insert new lock or update expired lock
  INSERT INTO project_locks (project_id, locked_by, lock_reason, expires_at, updated_at)
  VALUES (p_project_id, v_user_id, p_reason, v_expires_at, now())
  ON CONFLICT (project_id)
  DO UPDATE SET
    locked_by = EXCLUDED.locked_by,
    lock_reason = EXCLUDED.lock_reason,
    expires_at = EXCLUDED.expires_at,
    updated_at = now()
  WHERE project_locks.expires_at < now();

  GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
  
  RETURN v_rows_affected > 0;
END;
$$;

GRANT EXECUTE ON FUNCTION public.acquire_project_lock(uuid, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.acquire_project_lock(uuid, text, integer) TO service_role;

-- LEGACY FUNCIÓN CON p_user_id (para compatibilidad)
CREATE OR REPLACE FUNCTION public.acquire_project_lock(
  p_project_id uuid,
  p_user_id uuid,
  p_reason text,
  p_duration_seconds integer DEFAULT 600
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_auth_uid uuid;
BEGIN
  v_auth_uid := auth.uid();
  
  IF v_auth_uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: missing auth.uid()';
  END IF;
  
  IF v_auth_uid <> p_user_id THEN
    RAISE EXCEPTION 'Unauthorized: uid mismatch';
  END IF;
  
  -- Delegate to new function
  RETURN public.acquire_project_lock(p_project_id, p_reason, p_duration_seconds);
END;
$$;

GRANT EXECUTE ON FUNCTION public.acquire_project_lock(uuid, uuid, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.acquire_project_lock(uuid, uuid, text, integer) TO service_role;