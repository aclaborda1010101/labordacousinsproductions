-- Add reference vs generated separation for location pack slots
-- This prevents user-uploaded photos from being overwritten by AI generation

-- Add new columns for reference/generated separation
ALTER TABLE public.location_pack_slots 
ADD COLUMN IF NOT EXISTS reference_image_url text,
ADD COLUMN IF NOT EXISTS generated_image_url text,
ADD COLUMN IF NOT EXISTS reference_status text NOT NULL DEFAULT 'none';

-- Add comment for clarity
COMMENT ON COLUMN public.location_pack_slots.reference_image_url IS 'User-uploaded reference photo - never overwritten by AI';
COMMENT ON COLUMN public.location_pack_slots.generated_image_url IS 'AI-generated stylized image based on reference or prompt';
COMMENT ON COLUMN public.location_pack_slots.reference_status IS 'none | uploaded | locked - tracks reference photo state';

-- Migrate existing data: if image_url exists without prompt_text/seed, it's likely a reference
UPDATE public.location_pack_slots
SET reference_image_url = image_url,
    reference_status = 'uploaded'
WHERE image_url IS NOT NULL 
  AND (prompt_text IS NULL OR prompt_text = '')
  AND seed IS NULL;

-- If prompt_text exists, it's a generated image
UPDATE public.location_pack_slots
SET generated_image_url = image_url
WHERE image_url IS NOT NULL 
  AND prompt_text IS NOT NULL 
  AND prompt_text != '';

-- Also add reference fields to main locations table for primary reference anchor
ALTER TABLE public.locations
ADD COLUMN IF NOT EXISTS primary_reference_url text,
ADD COLUMN IF NOT EXISTS reference_status text NOT NULL DEFAULT 'none';

COMMENT ON COLUMN public.locations.primary_reference_url IS 'Primary reference photo for this location - used as anchor for all generations';
COMMENT ON COLUMN public.locations.reference_status IS 'none | uploaded | locked - tracks primary reference state';

-- Migrate existing reference_urls to primary_reference_url if available
UPDATE public.locations
SET primary_reference_url = (reference_urls->0->>'url')::text,
    reference_status = 'uploaded'
WHERE reference_urls IS NOT NULL 
  AND jsonb_array_length(reference_urls) > 0
  AND reference_urls->0->>'url' IS NOT NULL;