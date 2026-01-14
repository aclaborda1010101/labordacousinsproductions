-- =============================================================================
-- P1: Cascading Invalidation Triggers
-- When upstream assets change, downstream assets are marked as 'stale'
-- =============================================================================

-- Function: Invalidate camera_plan and tech_docs when storyboard panel changes
CREATE OR REPLACE FUNCTION public.invalidate_downstream_on_storyboard_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Only invalidate if the panel was previously approved
  IF OLD.approved = true THEN
    -- Mark camera_plan as stale
    UPDATE scene_camera_plan 
    SET status = 'stale', updated_at = NOW()
    WHERE scene_id = NEW.scene_id 
      AND status NOT IN ('stale', 'draft');
    
    -- Mark technical_docs as stale
    UPDATE scene_technical_docs 
    SET status = 'stale', updated_at = NOW()
    WHERE scene_id = NEW.scene_id 
      AND status NOT IN ('stale', 'draft');
      
    RAISE NOTICE 'Invalidated downstream assets for scene % due to storyboard panel change', NEW.scene_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger: storyboard_panel content changed -> invalidate downstream
DROP TRIGGER IF EXISTS storyboard_invalidate_downstream ON storyboard_panels;
CREATE TRIGGER storyboard_invalidate_downstream
AFTER UPDATE OF panel_intent, shot_hint, image_url, approved
ON storyboard_panels
FOR EACH ROW
WHEN (OLD.approved = true)
EXECUTE FUNCTION public.invalidate_downstream_on_storyboard_change();

-- Function: Invalidate tech_docs when camera_plan changes
CREATE OR REPLACE FUNCTION public.invalidate_downstream_on_camera_plan_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Only invalidate if the camera_plan was previously approved
  IF OLD.status = 'approved' THEN
    UPDATE scene_technical_docs 
    SET status = 'stale', updated_at = NOW()
    WHERE scene_id = NEW.scene_id 
      AND status NOT IN ('stale', 'draft');
      
    RAISE NOTICE 'Invalidated tech_docs for scene % due to camera_plan change', NEW.scene_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger: camera_plan content changed -> invalidate tech_docs
DROP TRIGGER IF EXISTS camera_plan_invalidate_downstream ON scene_camera_plan;
CREATE TRIGGER camera_plan_invalidate_downstream
AFTER UPDATE OF shots_list, blocking_diagrams, status
ON scene_camera_plan
FOR EACH ROW
WHEN (OLD.status = 'approved')
EXECUTE FUNCTION public.invalidate_downstream_on_camera_plan_change();