-- Add UNIQUE constraint to character_pack_slots for proper upsert support
-- This enables the upsert operation in Characters.tsx that uses onConflict with these columns

ALTER TABLE character_pack_slots 
ADD CONSTRAINT character_pack_slots_unique_slot 
UNIQUE (character_id, slot_type, view_angle, expression_name);