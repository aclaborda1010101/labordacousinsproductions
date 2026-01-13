-- ============================================================================
-- CRON JOB: Outline Watchdog (runs every 2 minutes)
-- ============================================================================
-- This migration sets up pg_cron to automatically call the outline-watchdog
-- function every 2 minutes to detect and clean up zombie outlines.
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Schedule the watchdog job
-- Note: Using pg_net to make HTTP calls from within cron
SELECT cron.schedule(
  'outline-watchdog-cron',  -- Job name
  '*/2 * * * *',            -- Every 2 minutes
  $$
  SELECT net.http_post(
    url := 'https://dzrfbulwiqhzxxbcnzhn.supabase.co/functions/v1/outline-watchdog',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR6cmZidWx3aXFoenh4YmNuemhuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcyNjIzNjUsImV4cCI6MjA4MjgzODM2NX0.2KXdxaPuQ_Ezqfi6xVIp1uZm9t1z_XoxamPMqsFpZV0'
    ),
    body := '{}'::jsonb
  );
  $$
);