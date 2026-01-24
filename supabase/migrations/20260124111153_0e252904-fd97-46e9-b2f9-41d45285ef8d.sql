-- Drop and recreate the status check constraint to include new statuses
ALTER TABLE public.generation_blocks 
DROP CONSTRAINT generation_blocks_status_check;

ALTER TABLE public.generation_blocks 
ADD CONSTRAINT generation_blocks_status_check 
CHECK (status = ANY (ARRAY['pending'::text, 'generating'::text, 'done'::text, 'failed'::text, 'skipped'::text, 'processing'::text, 'pending_approval'::text, 'applied'::text, 'rejected'::text]));