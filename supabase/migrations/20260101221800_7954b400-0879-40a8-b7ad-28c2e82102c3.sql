-- Add sort order and is_default fields to character_outfits
ALTER TABLE public.character_outfits 
ADD COLUMN IF NOT EXISTS sort_order integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS is_default boolean DEFAULT false;

-- Create index for sorting
CREATE INDEX IF NOT EXISTS idx_character_outfits_sort ON public.character_outfits(character_id, sort_order);

-- Function to ensure only one default outfit per character
CREATE OR REPLACE FUNCTION public.ensure_single_default_outfit()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_default = true THEN
    UPDATE public.character_outfits 
    SET is_default = false 
    WHERE character_id = NEW.character_id AND id != NEW.id AND is_default = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Trigger to enforce single default
DROP TRIGGER IF EXISTS trg_single_default_outfit ON public.character_outfits;
CREATE TRIGGER trg_single_default_outfit
BEFORE INSERT OR UPDATE ON public.character_outfits
FOR EACH ROW
EXECUTE FUNCTION public.ensure_single_default_outfit();