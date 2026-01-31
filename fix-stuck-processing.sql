-- Fix stuck processing states
UPDATE generation_blocks 
SET status = 'failed', 
    updated_at = now()
WHERE status = 'processing' 
AND updated_at < now() - interval '10 minutes';

-- Reset project processing flags if they exist
UPDATE projects 
SET processing_script = false
WHERE processing_script = true 
AND updated_at < now() - interval '10 minutes';