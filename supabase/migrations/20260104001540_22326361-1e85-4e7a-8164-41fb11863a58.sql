-- Create canon_assets table for Living Bible MVP
CREATE TABLE public.canon_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  project_id uuid NOT NULL,
  asset_type text NOT NULL CHECK (asset_type IN ('character', 'location', 'style')),
  name text NOT NULL,
  run_id uuid NOT NULL REFERENCES public.generation_runs(id) ON DELETE CASCADE,
  image_url text NOT NULL,
  notes text,
  is_active boolean NOT NULL DEFAULT true
);

-- Partial unique index: only one active canon per (project, asset_type, name)
CREATE UNIQUE INDEX idx_unique_active_canon 
  ON public.canon_assets(project_id, asset_type, name) 
  WHERE is_active = true;

-- Index for fast lookups by project
CREATE INDEX idx_canon_assets_project_active 
  ON public.canon_assets(project_id) 
  WHERE is_active = true;

-- Enable RLS
ALTER TABLE public.canon_assets ENABLE ROW LEVEL SECURITY;

-- RLS policy: access via project ownership (works for both projects and editorial_projects)
CREATE POLICY "Users can manage canon assets in their projects"
  ON public.canon_assets
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM projects p 
      WHERE p.id = canon_assets.project_id 
      AND has_project_access(auth.uid(), p.id)
    )
    OR EXISTS (
      SELECT 1 FROM editorial_projects ep 
      WHERE ep.id = canon_assets.project_id 
      AND ep.owner_id = auth.uid()
    )
  );

-- Function to deactivate previous canon when inserting new one
CREATE OR REPLACE FUNCTION deactivate_previous_canon()
RETURNS TRIGGER AS $$
BEGIN
  -- If inserting an active canon, deactivate any existing one with same project/type/name
  IF NEW.is_active = true THEN
    UPDATE public.canon_assets
    SET is_active = false
    WHERE project_id = NEW.project_id
      AND asset_type = NEW.asset_type
      AND name = NEW.name
      AND id != NEW.id
      AND is_active = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger to auto-deactivate previous canon
CREATE TRIGGER trg_deactivate_previous_canon
  BEFORE INSERT OR UPDATE ON public.canon_assets
  FOR EACH ROW
  EXECUTE FUNCTION deactivate_previous_canon();

COMMENT ON TABLE public.canon_assets IS 'Living Bible: stores accepted generation runs as canonical references for characters, locations, and styles';