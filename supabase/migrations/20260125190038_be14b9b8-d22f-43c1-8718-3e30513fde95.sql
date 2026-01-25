-- Add INSERT policy for generation_run_logs to allow authenticated users to insert their own logs
CREATE POLICY "Users can insert their own run logs"
ON public.generation_run_logs
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);