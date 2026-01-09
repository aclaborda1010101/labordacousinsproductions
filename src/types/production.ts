/**
 * Production Types - Tipos para el flujo de propuesta de producción editable
 */

export type QualityMode = 'CINE' | 'ULTRA';

// Shot propuesto por shot-suggest antes de insertar en BD
export interface ProposedShot {
  shot_id: string;        // S01, S02, etc.
  shot_no: number;
  shot_type: string;
  coverage_type: string;
  story_purpose: string;
  effective_mode: QualityMode;
  hero: boolean;
  
  camera_variation: {
    focal_mm: number;
    aperture: string;
    movement: string;
    height: string;
    stabilization: string;
  };
  
  blocking_min: {
    subject_positions: string;
    screen_direction: string;
    axis_180_compliant: boolean;
    action: string;
    dialogue: string | null;
  };
  
  duration_estimate_sec: number;
  hold_ms?: number;
  
  edit_intent?: {
    expected_cut: string;
    bridge_audio: string;
    rhythm_note: string;
  };
  
  continuity?: {
    lock_inherited: boolean;
    allowed_variation: string[];
    anchors: string[];
  };
  
  characters_in_frame?: string[];
  ai_risks?: string[];
  risk_mitigation?: string;
  
  transition_in?: string;
  transition_out?: string;
  sound_cue?: string;
  
  // Para edición en UI
  isSelected?: boolean;
  isEditing?: boolean;
}

// Scene Setup constantes de escena
export interface SceneSetup {
  camera_package: {
    body: string;
    codec: string;
    fps: number;
    shutter_angle: number;
    iso_target: number;
  };
  
  lens_set: {
    family: string;
    look: string;
    available_focals: number[];
  };
  
  lighting_plan: {
    key_style: string;
    color_temp_base_k: number;
    practicals: string[];
    contrast_ratio: string;
  };
  
  color_pipeline?: {
    lut_reference: string;
    grade_intent: string;
  };
  
  audio_plan: {
    room_tone: string;
    ambience_layers: string[];
    foley_priorities: string[];
  };
  
  continuity_locks?: {
    wardrobe_look_ids: string[];
    prop_ids: string[];
    lighting_mood_id: string | null;
    time_of_day_lock: string;
  };
  
  axis_180_reference?: {
    line_description: string;
    screen_left: string;
    screen_right: string;
  };
}

// Análisis de escena
export interface SceneAnalysis {
  emotional_arc: string;
  visual_strategy: string;
  coverage_approach: string;
  key_moments: string[];
  axis_note?: string;
}

// Resumen de secuencia
export interface SequenceSummary {
  total_duration_sec: number;
  shot_count: number;
  coverage_completeness: string;
  edit_rhythm: string;
  keyframes_required: number;
  estimated_cost_tier: QualityMode;
}

// Gates de QC
export interface QCGates {
  identity_verification: boolean;
  axis_180_maintained: boolean;
  lighting_consistency: boolean;
  spatial_continuity: boolean;
  dialogue_coverage_complete: boolean;
  all_locks_inherited: boolean;
}

// Propuesta completa de producción para una escena
export interface ProductionProposal {
  sceneId: string;
  scene_analysis: SceneAnalysis;
  scene_setup: SceneSetup;
  shots: ProposedShot[];
  sequence_summary: SequenceSummary;
  qc_gates?: QCGates;
  production_warnings: string[];
  
  // Metadatos
  generated_at: string;
  status: 'pending' | 'approved' | 'rejected' | 'edited';
}

// Props para el panel de propuesta
export interface ProductionProposalPanelProps {
  sceneId: string;
  sceneSlugline: string;
  sceneNo: number;
  episodeNo: number;
  proposal: ProductionProposal;
  onUpdateProposal: (proposal: ProductionProposal) => void;
  onRemoveShot: (shotId: string) => void;
  onAddShot: () => void;
}

// Props para el modal de revisión
export interface ProductionReviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  proposals: Map<string, ProductionProposal>;
  scenes: Array<{
    id: string;
    scene_no: number;
    episode_no: number;
    slugline: string;
  }>;
  onUpdateProposal: (sceneId: string, proposal: ProductionProposal) => void;
  onApprove: () => Promise<void>;
  isApproving: boolean;
}

// Opciones disponibles para edición
export const SHOT_TYPES = [
  'Wide', 'Medium', 'CloseUp', 'ExtremeCloseUp', 
  'OTS', 'Insert', 'POV', 'Establishing', 'Full'
] as const;

export const COVERAGE_TYPES = [
  'Master', 'Single', 'Two-Shot', 'Group', 
  'OTS_A', 'OTS_B', 'Insert', 'Cutaway', 
  'Reaction', 'POV', 'Establishing'
] as const;

export const STORY_PURPOSES = [
  'establish_geography',
  'introduce_character',
  'reveal_information',
  'build_tension',
  'release_tension',
  'emotional_connection',
  'show_reaction',
  'transition',
  'action_beat',
  'dialogue_focus'
] as const;

export const CAMERA_MOVEMENTS = [
  'Static', 'Pan_Left', 'Pan_Right', 'Tilt_Up', 'Tilt_Down',
  'Dolly_In', 'Dolly_Out', 'Dolly_Left', 'Dolly_Right',
  'Crane_Up', 'Crane_Down', 'Tracking', 'Handheld', 'Steadicam'
] as const;

export const CAMERA_HEIGHTS = [
  'Low', 'EyeLevel', 'High', 'Overhead', 'Dutch'
] as const;

export const STABILIZATION_TYPES = [
  'Tripod', 'Steadicam', 'Gimbal', 'Handheld', 'Dolly', 'Crane'
] as const;
