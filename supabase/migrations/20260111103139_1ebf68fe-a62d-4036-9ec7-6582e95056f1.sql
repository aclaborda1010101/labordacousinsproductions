-- Fix generation_logs INSERT policy - restrict to authenticated users
DROP POLICY IF EXISTS "System can insert logs" ON public.generation_logs;

CREATE POLICY "Users can insert their generation logs"
ON public.generation_logs FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL AND (
    user_id = auth.uid() OR
    has_project_access(auth.uid(), project_id)
  )
);

-- Fix llm_failures INSERT policy - restrict to authenticated users
DROP POLICY IF EXISTS "llm_failures_service_insert" ON public.llm_failures;

CREATE POLICY "Authenticated users can insert llm_failures"
ON public.llm_failures FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL
);