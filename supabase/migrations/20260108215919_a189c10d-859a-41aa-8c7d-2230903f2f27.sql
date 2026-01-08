-- =====================================================
-- MICRO-SHOTS TABLE: Subdivide shots into 1-2s segments
-- with chained keyframes for video generation
-- =====================================================

CREATE TABLE public.micro_shots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shot_id UUID NOT NULL REFERENCES public.shots(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    
    -- Ordering and timing
    sequence_no INTEGER NOT NULL,
    start_sec NUMERIC(5,2) NOT NULL DEFAULT 0,
    end_sec NUMERIC(5,2) NOT NULL,
    duration_sec NUMERIC(5,2) GENERATED ALWAYS AS (end_sec - start_sec) STORED,
    
    -- Keyframe chaining - the magic happens here
    -- keyframe_final of micro_shot N = keyframe_initial of micro_shot N+1
    keyframe_initial_id UUID REFERENCES public.keyframes(id),
    keyframe_final_id UUID REFERENCES public.keyframes(id),
    
    -- Video generation
    video_url TEXT,
    video_status TEXT DEFAULT 'pending' CHECK (video_status IN ('pending', 'generating', 'ready', 'failed', 'approved')),
    video_engine TEXT DEFAULT 'kling' CHECK (video_engine IN ('kling', 'veo', 'runway')),
    generation_run_id UUID REFERENCES public.generation_runs(id),
    
    -- Prompt and quality
    prompt_text TEXT,
    motion_notes TEXT,
    quality_score NUMERIC(3,2),
    qc_issues JSONB,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    CONSTRAINT micro_shots_unique_sequence UNIQUE(shot_id, sequence_no),
    CONSTRAINT micro_shots_valid_duration CHECK (end_sec > start_sec),
    CONSTRAINT micro_shots_max_duration CHECK ((end_sec - start_sec) <= 5)
);

-- Indexes for performance
CREATE INDEX idx_micro_shots_shot_id ON public.micro_shots(shot_id);
CREATE INDEX idx_micro_shots_project_id ON public.micro_shots(project_id);
CREATE INDEX idx_micro_shots_status ON public.micro_shots(video_status);
CREATE INDEX idx_micro_shots_sequence ON public.micro_shots(shot_id, sequence_no);

-- Enable RLS
ALTER TABLE public.micro_shots ENABLE ROW LEVEL SECURITY;

-- RLS Policies (using owner_id instead of user_id)
CREATE POLICY "Users can view micro_shots of their projects"
ON public.micro_shots FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.projects p
        WHERE p.id = micro_shots.project_id
        AND p.owner_id = auth.uid()
    )
);

CREATE POLICY "Users can create micro_shots in their projects"
ON public.micro_shots FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.projects p
        WHERE p.id = micro_shots.project_id
        AND p.owner_id = auth.uid()
    )
);

CREATE POLICY "Users can update micro_shots in their projects"
ON public.micro_shots FOR UPDATE
USING (
    EXISTS (
        SELECT 1 FROM public.projects p
        WHERE p.id = micro_shots.project_id
        AND p.owner_id = auth.uid()
    )
);

CREATE POLICY "Users can delete micro_shots in their projects"
ON public.micro_shots FOR DELETE
USING (
    EXISTS (
        SELECT 1 FROM public.projects p
        WHERE p.id = micro_shots.project_id
        AND p.owner_id = auth.uid()
    )
);

-- Trigger for updated_at
CREATE TRIGGER update_micro_shots_updated_at
BEFORE UPDATE ON public.micro_shots
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add column to keyframes to track micro_shot association
ALTER TABLE public.keyframes ADD COLUMN IF NOT EXISTS micro_shot_id UUID REFERENCES public.micro_shots(id);
ALTER TABLE public.keyframes ADD COLUMN IF NOT EXISTS chain_role TEXT CHECK (chain_role IN ('initial', 'final', 'shared'));

-- Function to subdivide a shot into micro-shots
CREATE OR REPLACE FUNCTION public.subdivide_shot_into_microshots(
    p_shot_id UUID,
    p_micro_duration NUMERIC DEFAULT 2
)
RETURNS SETOF public.micro_shots
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_shot RECORD;
    v_project_id UUID;
    v_total_duration NUMERIC;
    v_sequence INTEGER := 1;
    v_start NUMERIC := 0;
    v_end NUMERIC;
    v_result micro_shots;
BEGIN
    -- Get shot details
    SELECT s.*, sc.project_id INTO v_shot
    FROM shots s
    JOIN scenes sc ON s.scene_id = sc.id
    WHERE s.id = p_shot_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Shot not found: %', p_shot_id;
    END IF;
    
    v_project_id := v_shot.project_id;
    v_total_duration := COALESCE(v_shot.duration_sec, 6); -- Default 6s if not set
    
    -- Delete existing micro_shots for this shot
    DELETE FROM micro_shots WHERE shot_id = p_shot_id;
    
    -- Create micro_shots
    WHILE v_start < v_total_duration LOOP
        v_end := LEAST(v_start + p_micro_duration, v_total_duration);
        
        INSERT INTO micro_shots (shot_id, project_id, sequence_no, start_sec, end_sec)
        VALUES (p_shot_id, v_project_id, v_sequence, v_start, v_end)
        RETURNING * INTO v_result;
        
        RETURN NEXT v_result;
        
        v_sequence := v_sequence + 1;
        v_start := v_end;
    END LOOP;
    
    RETURN;
END;
$$;

-- Function to chain keyframes across micro-shots
CREATE OR REPLACE FUNCTION public.chain_microshot_keyframes(p_shot_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_prev_final_kf UUID;
    v_ms RECORD;
BEGIN
    -- Get all micro_shots for this shot ordered by sequence
    FOR v_ms IN 
        SELECT * FROM micro_shots 
        WHERE shot_id = p_shot_id 
        ORDER BY sequence_no
    LOOP
        -- If this is not the first micro_shot, set its initial keyframe to previous final
        IF v_prev_final_kf IS NOT NULL THEN
            UPDATE micro_shots 
            SET keyframe_initial_id = v_prev_final_kf
            WHERE id = v_ms.id;
        END IF;
        
        -- Store this micro_shot's final keyframe for the next iteration
        v_prev_final_kf := v_ms.keyframe_final_id;
    END LOOP;
END;
$$;

-- Enable realtime for micro_shots
ALTER PUBLICATION supabase_realtime ADD TABLE public.micro_shots;

COMMENT ON TABLE public.micro_shots IS 'Subdivisions of shots for granular video generation with keyframe chaining';