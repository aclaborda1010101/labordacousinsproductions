-- Add style_profile column to scenes table for global visual style lock
ALTER TABLE public.scenes
  ADD COLUMN IF NOT EXISTS style_profile TEXT DEFAULT 'DISNEY_PIXAR_3D';

COMMENT ON COLUMN public.scenes.style_profile IS
  'Global style lock for all generated images/videos in this scene. Values: DISNEY_PIXAR_3D, STORYBOARD_PENCIL, REALISTIC';