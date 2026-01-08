-- Add wardrobe_lock_json column to characters for consistent wardrobe across generations
ALTER TABLE public.characters 
ADD COLUMN IF NOT EXISTS wardrobe_lock_json jsonb DEFAULT NULL;

-- Add identity_lock_score to track facial consistency
ALTER TABLE public.characters 
ADD COLUMN IF NOT EXISTS identity_lock_score integer DEFAULT NULL;

-- Add column to character_pack_slots to store identity similarity score
ALTER TABLE public.character_pack_slots 
ADD COLUMN IF NOT EXISTS identity_score integer DEFAULT NULL;

-- Comment for clarity
COMMENT ON COLUMN public.characters.wardrobe_lock_json IS 'Locked wardrobe description for consistent generation across all shots';
COMMENT ON COLUMN public.characters.identity_lock_score IS 'Average identity consistency score (0-100) across approved pack slots';
COMMENT ON COLUMN public.character_pack_slots.identity_score IS 'Identity similarity score (0-100) compared to reference anchors';