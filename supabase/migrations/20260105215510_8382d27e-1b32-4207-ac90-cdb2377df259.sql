-- NUEVA FUNCIÓN release_project_lock SIN p_user_id (usa auth.uid() internamente)
CREATE OR REPLACE FUNCTION public.release_project_lock(
  p_project_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: missing auth.uid()';
  END IF;

  DELETE FROM project_locks
  WHERE project_id = p_project_id
    AND locked_by = v_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.release_project_lock(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.release_project_lock(uuid) TO service_role;

-- LEGACY FUNCIÓN CON p_user_id (para compatibilidad)
CREATE OR REPLACE FUNCTION public.release_project_lock(
  p_project_id uuid,
  p_user_id uuid
) RETURNS void
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
  PERFORM public.release_project_lock(p_project_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.release_project_lock(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.release_project_lock(uuid, uuid) TO service_role;