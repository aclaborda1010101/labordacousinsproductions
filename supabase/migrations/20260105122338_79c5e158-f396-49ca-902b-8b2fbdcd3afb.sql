-- V3.0 Project Locking Infrastructure (Fixed RLS)

-- 1.1 Project Locks Table
CREATE TABLE IF NOT EXISTS public.project_locks (
  project_id UUID PRIMARY KEY REFERENCES public.projects(id) ON DELETE CASCADE,
  locked_by UUID NOT NULL,
  lock_reason TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.project_locks ENABLE ROW LEVEL SECURITY;

-- RLS Policies: users can see locks on projects they own
CREATE POLICY "Users can view locks on their projects"
  ON public.project_locks FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_locks.project_id
      AND p.owner_id = auth.uid()
    )
  );

-- 1.2 Atomic Lock Acquisition Function (NO RACE CONDITIONS)
CREATE OR REPLACE FUNCTION public.acquire_project_lock(
  p_project_id UUID,
  p_user_id UUID,
  p_reason TEXT,
  p_duration_seconds INT DEFAULT 600
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expires_at TIMESTAMPTZ;
  v_rows_affected INT;
BEGIN
  -- Security: ensure caller identity
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Minimum lock duration safety
  IF p_duration_seconds < 30 THEN
    p_duration_seconds := 30;
  END IF;

  v_expires_at := now() + (p_duration_seconds || ' seconds')::interval;

  -- Try to insert new lock or update expired lock
  INSERT INTO project_locks (project_id, locked_by, lock_reason, expires_at, updated_at)
  VALUES (p_project_id, p_user_id, p_reason, v_expires_at, now())
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

-- 1.3 Defensive Lock Release Function (ANTI-ZOMBIE)
CREATE OR REPLACE FUNCTION public.release_project_lock(
  p_project_id UUID,
  p_user_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  DELETE FROM project_locks
  WHERE project_id = p_project_id
    AND locked_by = p_user_id;
END;
$$;

-- 1.4 Zombie Cleanup Function (can be called periodically)
CREATE OR REPLACE FUNCTION public.cleanup_expired_locks()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted INT;
BEGIN
  DELETE FROM project_locks
  WHERE expires_at < now() - interval '1 hour';
  
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

-- Index for efficient expiration queries
CREATE INDEX IF NOT EXISTS idx_project_locks_expires_at ON public.project_locks(expires_at);