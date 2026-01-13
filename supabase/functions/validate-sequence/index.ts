import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ValidationRequest {
  scene_id: string;
  project_id: string;
  phase: 'storyboard' | 'camera_plan' | 'tech_doc' | 'keyframes';
}

interface ValidationError {
  code: string;
  level: 'error';
  message: string;
  affectedItems?: string[];
}

interface ValidationWarning {
  code: string;
  level: 'warning';
  message: string;
  affectedItems?: string[];
}

interface ValidationResult {
  is_valid: boolean;
  blocking_errors: ValidationError[];
  warnings: ValidationWarning[];
  can_proceed: boolean;
  phase: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { scene_id, project_id, phase }: ValidationRequest = await req.json();

    if (!scene_id || !project_id || !phase) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: scene_id, project_id, phase" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let result: ValidationResult;

    switch (phase) {
      case 'storyboard':
        result = await validateStoryboard(supabase, scene_id, project_id);
        break;
      case 'camera_plan':
        result = await validateCameraPlan(supabase, scene_id, project_id);
        break;
      case 'tech_doc':
        result = await validateTechDoc(supabase, scene_id, project_id);
        break;
      case 'keyframes':
        result = await validateKeyframes(supabase, scene_id, project_id);
        break;
      default:
        return new Response(
          JSON.stringify({ error: `Unknown phase: ${phase}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    return new Response(
      JSON.stringify({ success: true, ...result }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[validate-sequence] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// =============================================================================
// STORYBOARD VALIDATION
// =============================================================================
async function validateStoryboard(supabase: any, sceneId: string, projectId: string): Promise<ValidationResult> {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // Fetch panels
  const { data: panels, error: panelsError } = await supabase
    .from('storyboard_panels')
    .select('*')
    .eq('scene_id', sceneId)
    .order('panel_no');

  if (panelsError) {
    throw new Error(`Failed to fetch panels: ${panelsError.message}`);
  }

  if (!panels || panels.length === 0) {
    errors.push({
      code: 'SB_000',
      level: 'error',
      message: 'No hay paneles de storyboard para esta secuencia',
    });
    return { is_valid: false, blocking_errors: errors, warnings, can_proceed: false, phase: 'storyboard' };
  }

  // SB_001: Panel sin panel_code
  const missingCodes = panels.filter((p: any) => !p.panel_code);
  if (missingCodes.length > 0) {
    errors.push({
      code: 'SB_001',
      level: 'error',
      message: `${missingCodes.length} panel(es) sin código identificador`,
      affectedItems: missingCodes.map((p: any) => `Panel ${p.panel_no}`),
    });
  }

  // SB_002: Panel sin shot_hint
  const missingShotHint = panels.filter((p: any) => !p.shot_hint);
  if (missingShotHint.length > 0) {
    errors.push({
      code: 'SB_002',
      level: 'error',
      message: `${missingShotHint.length} panel(es) sin tipo de plano`,
      affectedItems: missingShotHint.map((p: any) => p.panel_code || `Panel ${p.panel_no}`),
    });
  }

  // SB_003: Check Visual DNA locks
  const panelsWithChars = panels.filter((p: any) => p.characters_present && p.characters_present.length > 0);
  if (panelsWithChars.length > 0) {
    // Get characters for this project
    const charIds = [...new Set(panelsWithChars.flatMap((p: any) => p.characters_present || []))];
    
    const { data: characters } = await supabase
      .from('characters')
      .select('id, visual_dna, active_visual_dna_id')
      .in('id', charIds);

    const charsWithoutDNA = characters?.filter((c: any) => !c.visual_dna && !c.active_visual_dna_id) || [];
    if (charsWithoutDNA.length > 0) {
      errors.push({
        code: 'SB_003',
        level: 'error',
        message: `${charsWithoutDNA.length} personaje(s) sin Visual DNA definido`,
        affectedItems: charsWithoutDNA.map((c: any) => c.id),
      });
    }
  }

  // SB_004: 180° axis consistency
  const axisViolations: string[] = [];
  for (let i = 1; i < panels.length; i++) {
    const prev = panels[i - 1];
    const curr = panels[i];
    
    const prevDir = prev.staging?.spatial_info?.subject_direction;
    const currDir = curr.staging?.spatial_info?.subject_direction;
    const axisLocked = curr.continuity?.axis_locked;
    
    if (axisLocked && prevDir && currDir) {
      const isOpposite = (
        (prevDir === 'towards_camera' && currDir === 'away_from_camera') ||
        (prevDir === 'away_from_camera' && currDir === 'towards_camera') ||
        (prevDir === 'lateral_left' && currDir === 'lateral_right') ||
        (prevDir === 'lateral_right' && currDir === 'lateral_left')
      );
      
      if (isOpposite) {
        axisViolations.push(`${prev.panel_code} → ${curr.panel_code}`);
      }
    }
  }
  
  if (axisViolations.length > 0) {
    errors.push({
      code: 'SB_004',
      level: 'error',
      message: `Ruptura del eje 180° en ${axisViolations.length} transición(es)`,
      affectedItems: axisViolations,
    });
  }

  // SB_005: Abrupt direction changes (warning)
  const abruptChanges: string[] = [];
  for (let i = 1; i < panels.length; i++) {
    const prev = panels[i - 1];
    const curr = panels[i];
    
    const prevPos = prev.staging?.spatial_info?.camera_relative_position;
    const currPos = curr.staging?.spatial_info?.camera_relative_position;
    
    if (prevPos && currPos && prevPos !== currPos) {
      const isAbrupt = (
        (prevPos === 'front' && currPos === 'behind') ||
        (prevPos === 'behind' && currPos === 'front')
      );
      
      if (isAbrupt) {
        abruptChanges.push(`${prev.panel_code} → ${curr.panel_code}`);
      }
    }
  }
  
  if (abruptChanges.length > 0) {
    warnings.push({
      code: 'SB_005',
      level: 'warning',
      message: `${abruptChanges.length} cambio(s) de dirección abrupto(s)`,
      affectedItems: abruptChanges,
    });
  }

  // SB_006: Panel sin intent (warning)
  const missingIntent = panels.filter((p: any) => !p.panel_intent || p.panel_intent.length < 10);
  if (missingIntent.length > 0) {
    warnings.push({
      code: 'SB_006',
      level: 'warning',
      message: `${missingIntent.length} panel(es) con intención narrativa incompleta`,
      affectedItems: missingIntent.map((p: any) => p.panel_code || `Panel ${p.panel_no}`),
    });
  }

  // Check for unapproved panels
  const unapprovedPanels = panels.filter((p: any) => !p.approved);
  if (unapprovedPanels.length > 0) {
    warnings.push({
      code: 'SB_007',
      level: 'warning',
      message: `${unapprovedPanels.length} panel(es) sin aprobar`,
      affectedItems: unapprovedPanels.map((p: any) => p.panel_code || `Panel ${p.panel_no}`),
    });
  }

  return {
    is_valid: errors.length === 0,
    blocking_errors: errors,
    warnings,
    can_proceed: errors.length === 0,
    phase: 'storyboard',
  };
}

// =============================================================================
// CAMERA PLAN VALIDATION
// =============================================================================
async function validateCameraPlan(supabase: any, sceneId: string, projectId: string): Promise<ValidationResult> {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // Fetch camera plan
  const { data: cameraPlan } = await supabase
    .from('scene_camera_plan')
    .select('*')
    .eq('scene_id', sceneId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!cameraPlan) {
    errors.push({
      code: 'CP_000',
      level: 'error',
      message: 'No hay Camera Plan para esta secuencia',
    });
    return { is_valid: false, blocking_errors: errors, warnings, can_proceed: false, phase: 'camera_plan' };
  }

  const shots = cameraPlan.shots_list || [];
  const blockingDiagrams = cameraPlan.blocking_diagrams || [];

  // Get approved panel refs
  const { data: approvedPanels } = await supabase
    .from('storyboard_panels')
    .select('panel_code')
    .eq('scene_id', sceneId)
    .eq('approved', true);

  const approvedPanelCodes = (approvedPanels || []).map((p: any) => p.panel_code);

  // CP_001: Shot sin panel_ref válido
  const invalidRefs = shots.filter((s: any) => 
    !s.panel_ref || !approvedPanelCodes.includes(s.panel_ref)
  );
  if (invalidRefs.length > 0) {
    errors.push({
      code: 'CP_001',
      level: 'error',
      message: `${invalidRefs.length} shot(s) con referencia de panel inválida`,
      affectedItems: invalidRefs.map((s: any) => `Shot ${s.shot_no}: ${s.panel_ref || 'sin ref'}`),
    });
  }

  // CP_003: Movement incompatible with shot_type (warning)
  const incompatibleMovements: string[] = [];
  const badCombos: Record<string, string[]> = {
    'PPP': ['tracking_fast', 'crane_fast', 'whip_pan'],
    'PP': ['tracking_fast', 'whip_pan'],
    'INSERT': ['crane', 'steadicam', 'tracking'],
  };

  for (const shot of shots) {
    const shotType = shot.shot_type_hint;
    const movement = shot.movement;
    
    if (shotType && movement && badCombos[shotType]?.includes(movement)) {
      incompatibleMovements.push(`Shot ${shot.shot_no}: ${shotType} con ${movement}`);
    }
  }
  
  if (incompatibleMovements.length > 0) {
    warnings.push({
      code: 'CP_003',
      level: 'warning',
      message: `${incompatibleMovements.length} combinación(es) movimiento/plano cuestionable(s)`,
      affectedItems: incompatibleMovements,
    });
  }

  return {
    is_valid: errors.length === 0,
    blocking_errors: errors,
    warnings,
    can_proceed: errors.length === 0,
    phase: 'camera_plan',
  };
}

// =============================================================================
// TECHNICAL DOC VALIDATION
// =============================================================================
async function validateTechDoc(supabase: any, sceneId: string, projectId: string): Promise<ValidationResult> {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // Fetch technical doc
  const { data: techDoc } = await supabase
    .from('scene_technical_docs')
    .select('*')
    .eq('scene_id', sceneId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!techDoc) {
    errors.push({
      code: 'TD_000',
      level: 'error',
      message: 'No hay Documento Técnico para esta secuencia',
    });
    return { is_valid: false, blocking_errors: errors, warnings, can_proceed: false, phase: 'tech_doc' };
  }

  // Fetch shots with technical specs
  const { data: shots } = await supabase
    .from('shots')
    .select('*')
    .eq('scene_id', sceneId)
    .order('shot_no');

  if (!shots || shots.length === 0) {
    errors.push({
      code: 'TD_001',
      level: 'error',
      message: 'No hay shots definidos para esta secuencia',
    });
    return { is_valid: false, blocking_errors: errors, warnings, can_proceed: false, phase: 'tech_doc' };
  }

  // TD_001: Shot sin foco definido
  const missingFocus = shots.filter((s: any) => 
    !s.camera?.focus && !s.focus
  );
  if (missingFocus.length > 0) {
    warnings.push({
      code: 'TD_001',
      level: 'warning',
      message: `${missingFocus.length} shot(s) sin configuración de foco`,
      affectedItems: missingFocus.map((s: any) => `Shot ${s.shot_no}`),
    });
  }

  // TD_002: Lens compatibility check
  const lensRanges: Record<string, [number, number]> = {
    'PPP': [85, 200],
    'PP': [50, 135],
    'PMC': [35, 85],
    'PM': [35, 50],
    'PG': [16, 35],
  };

  const incompatibleLens: string[] = [];
  for (const shot of shots) {
    const shotType = shot.shot_type;
    const focal = shot.camera?.lens?.focal_mm || shot.focal_length;
    const range = lensRanges[shotType];
    
    if (focal && range && (focal < range[0] || focal > range[1])) {
      incompatibleLens.push(`Shot ${shot.shot_no}: ${shotType} con ${focal}mm`);
    }
  }
  
  if (incompatibleLens.length > 0) {
    errors.push({
      code: 'TD_002',
      level: 'error',
      message: `${incompatibleLens.length} shot(s) con lente incompatible`,
      affectedItems: incompatibleLens,
    });
  }

  // TD_005: Shot sin timing
  const missingTiming = shots.filter((s: any) => 
    !s.duration_target && !s.duration_sec
  );
  if (missingTiming.length > 0) {
    warnings.push({
      code: 'TD_005',
      level: 'warning',
      message: `${missingTiming.length} shot(s) sin duración definida`,
      affectedItems: missingTiming.map((s: any) => `Shot ${s.shot_no}`),
    });
  }

  // Check tech doc status
  if (techDoc.status !== 'approved' && techDoc.status !== 'locked') {
    warnings.push({
      code: 'TD_006',
      level: 'warning',
      message: 'Documento Técnico no está aprobado',
    });
  }

  return {
    is_valid: errors.length === 0,
    blocking_errors: errors,
    warnings,
    can_proceed: errors.length === 0,
    phase: 'tech_doc',
  };
}

// =============================================================================
// KEYFRAMES VALIDATION
// =============================================================================
async function validateKeyframes(supabase: any, sceneId: string, projectId: string): Promise<ValidationResult> {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // Fetch shots
  const { data: shots } = await supabase
    .from('shots')
    .select('id, shot_no')
    .eq('scene_id', sceneId)
    .order('shot_no');

  if (!shots || shots.length === 0) {
    errors.push({
      code: 'KF_000',
      level: 'error',
      message: 'No hay shots para generar keyframes',
    });
    return { is_valid: false, blocking_errors: errors, warnings, can_proceed: false, phase: 'keyframes' };
  }

  // Fetch keyframes for all shots
  const shotIds = shots.map((s: any) => s.id);
  const { data: keyframes } = await supabase
    .from('keyframes')
    .select('*')
    .in('shot_id', shotIds);

  // KF_001: Shots without keyframes
  const shotsWithKeyframes = new Set((keyframes || []).map((kf: any) => kf.shot_id));
  const shotsWithoutKf = shots.filter((s: any) => !shotsWithKeyframes.has(s.id));
  
  if (shotsWithoutKf.length > 0) {
    errors.push({
      code: 'KF_001',
      level: 'error',
      message: `${shotsWithoutKf.length} shot(s) sin keyframe`,
      affectedItems: shotsWithoutKf.map((s: any) => `Shot ${s.shot_no}`),
    });
  }

  // KF_002: Identity validation
  const lowIdentityKf = (keyframes || []).filter((kf: any) => 
    kf.identity_score !== null && kf.identity_score < 70
  );
  if (lowIdentityKf.length > 0) {
    warnings.push({
      code: 'KF_002',
      level: 'warning',
      message: `${lowIdentityKf.length} keyframe(s) con score de identidad bajo`,
      affectedItems: lowIdentityKf.map((kf: any) => `Keyframe con score ${kf.identity_score}`),
    });
  }

  return {
    is_valid: errors.length === 0,
    blocking_errors: errors,
    warnings,
    can_proceed: errors.length === 0,
    phase: 'keyframes',
  };
}
