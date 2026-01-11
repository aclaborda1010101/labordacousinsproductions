-- Clean up invalid reference_anchor_id values in character_pack_slots
-- These are FK violations from previous bugs where the ID was set but didn't exist in reference_anchors

UPDATE character_pack_slots 
SET 
  reference_anchor_id = NULL,
  generation_metadata = COALESCE(generation_metadata, '{}'::jsonb) || jsonb_build_object(
    'fk_cleanup', true,
    'cleaned_at', now()::text
  )
WHERE 
  reference_anchor_id IS NOT NULL 
  AND reference_anchor_id NOT IN (SELECT id FROM reference_anchors);

-- Log how many were cleaned
DO $$
DECLARE
  cleaned_count INTEGER;
BEGIN
  GET DIAGNOSTICS cleaned_count = ROW_COUNT;
  RAISE NOTICE 'Cleaned % invalid reference_anchor_id entries', cleaned_count;
END $$;