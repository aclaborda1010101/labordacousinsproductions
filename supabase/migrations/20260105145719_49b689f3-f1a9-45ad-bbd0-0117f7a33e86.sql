-- Fix function search_path security warning
CREATE OR REPLACE FUNCTION public.cleanup_old_background_tasks()
RETURNS void AS $$
BEGIN
  DELETE FROM public.background_tasks 
  WHERE status IN ('completed', 'failed', 'cancelled') 
  AND updated_at < now() - interval '48 hours';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;