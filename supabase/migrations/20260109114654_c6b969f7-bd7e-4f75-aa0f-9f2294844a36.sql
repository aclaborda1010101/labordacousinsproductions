-- Make run_id nullable in canon_assets to allow assets without associated generation runs
ALTER TABLE public.canon_assets 
  ALTER COLUMN run_id DROP NOT NULL;