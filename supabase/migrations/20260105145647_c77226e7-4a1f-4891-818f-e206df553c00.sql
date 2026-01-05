-- Create table for syncing background tasks across devices
CREATE TABLE public.background_tasks (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL,
  project_id UUID,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'running',
  progress INTEGER NOT NULL DEFAULT 0,
  entity_id TEXT,
  entity_name TEXT,
  error TEXT,
  result JSONB,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS
ALTER TABLE public.background_tasks ENABLE ROW LEVEL SECURITY;

-- Users can only see their own tasks
CREATE POLICY "Users can view their own tasks"
ON public.background_tasks
FOR SELECT
USING (auth.uid() = user_id);

-- Users can create their own tasks
CREATE POLICY "Users can create their own tasks"
ON public.background_tasks
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update their own tasks
CREATE POLICY "Users can update their own tasks"
ON public.background_tasks
FOR UPDATE
USING (auth.uid() = user_id);

-- Users can delete their own tasks
CREATE POLICY "Users can delete their own tasks"
ON public.background_tasks
FOR DELETE
USING (auth.uid() = user_id);

-- Create index for faster queries
CREATE INDEX idx_background_tasks_user_id ON public.background_tasks(user_id);
CREATE INDEX idx_background_tasks_project_id ON public.background_tasks(project_id);
CREATE INDEX idx_background_tasks_status ON public.background_tasks(status);

-- Create trigger to update updated_at
CREATE TRIGGER update_background_tasks_updated_at
BEFORE UPDATE ON public.background_tasks
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for this table
ALTER PUBLICATION supabase_realtime ADD TABLE public.background_tasks;

-- Auto-cleanup old completed tasks (older than 48h)
CREATE OR REPLACE FUNCTION public.cleanup_old_background_tasks()
RETURNS void AS $$
BEGIN
  DELETE FROM public.background_tasks 
  WHERE status IN ('completed', 'failed', 'cancelled') 
  AND updated_at < now() - interval '48 hours';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a scheduled cleanup (runs on app init via edge function or manually)
COMMENT ON FUNCTION public.cleanup_old_background_tasks IS 'Cleans up background tasks older than 48 hours';