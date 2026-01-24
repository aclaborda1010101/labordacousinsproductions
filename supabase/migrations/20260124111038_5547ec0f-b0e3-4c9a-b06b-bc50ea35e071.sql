-- Drop and recreate the check constraint to include 'showrunner_surgery'
ALTER TABLE public.generation_blocks 
DROP CONSTRAINT generation_blocks_block_type_check;

ALTER TABLE public.generation_blocks 
ADD CONSTRAINT generation_blocks_block_type_check 
CHECK (block_type = ANY (ARRAY['bible'::text, 'outline'::text, 'scene_card'::text, 'script'::text, 'polish'::text, 'showrunner_surgery'::text]));