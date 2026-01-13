/**
 * Technical Document Types - Schema definitivo para el Paso 3 del pipeline
 * Storyboard → Documento Técnico → Keyframes
 */

// =====================================================
// STORYBOARD TYPES
// =====================================================

export interface StoryboardPanel {
  id: string;
  scene_id: string;
  project_id: string;
  panel_no: number;
  panel_intent: string | null;
  shot_hint: string | null;
  image_prompt: string | null;
  image_url: string | null;
  notes: string | null;
  approved: boolean;
  created_at: string;
  updated_at: string;
}

export interface StoryboardPanelInput {
  scene_id: string;
  project_id: string;
  panel_no: number;
  panel_intent?: string;
  shot_hint?: string;
  image_prompt?: string;
  image_url?: string;
  notes?: string;
}

// =====================================================
// FOCUS TYPES
// =====================================================

export type FocusMode = 'follow' | 'fixed' | 'rack';
export type FocusEventType = 'hold' | 'rack' | 'pull';
export type DepthProfile = 'shallow' | 'medium' | 'deep';

export interface FocusEvent {
  t_s: number;
  target: string;
  transition_s: number;
  type: FocusEventType;
}

export interface FocusConfig {
  mode: FocusMode;
  base_distance_m: number;
  depth_profile: DepthProfile;
  events: FocusEvent[];
}

// =====================================================
// TIMING TYPES
// =====================================================

export type TimingBeatType = 'dialogue' | 'action' | 'reaction' | 'transition';

export interface TimingBeat {
  t_s: number;
  type: TimingBeatType;
  ref: string;
}

export interface TimingConfig {
  start_s: number;
  end_s: number;
  beats: TimingBeat[];
}

// =====================================================
// CAMERA PATH TYPES
// =====================================================

export type CameraPathType = 'static' | 'dolly' | 'crane' | 'arc' | 'handheld' | 'tracking' | 'steadicam';
export type PathSpeed = 'slow' | 'medium' | 'fast';
export type PathEasing = 'linear' | 'ease_in' | 'ease_out' | 'ease_in_out';

export interface PathPoint {
  x: number;
  y: number;
  z: number;
  t_s: number;
}

export interface CameraPath {
  type: CameraPathType;
  path: PathPoint[];
  speed: PathSpeed | null;
  easing: PathEasing | null;
}

export interface CameraPosition {
  x: number;
  y: number;
  z: number;
}

export interface CameraRotation {
  pan: number;
  tilt: number;
  roll: number;
}

// =====================================================
// CONSTRAINTS TYPES
// =====================================================

export interface ShotConstraints {
  must_keep: string[];
  must_not: string[];
  negatives: string[];
}

// =====================================================
// BLOCKING TYPES (Enhanced)
// =====================================================

export interface BlockingSubject {
  id: string;
  screen_pos: 'left' | 'center' | 'right' | 'off_screen';
  pose: string;
  action: string;
}

export interface BlockingProp {
  id: string;
  pos: string;
  state: 'static' | 'moving' | 'interacted';
}

export interface ShotBlocking {
  subjects: BlockingSubject[];
  props: BlockingProp[];
}

// =====================================================
// LIGHTING TYPES
// =====================================================

export interface LightSource {
  dir?: string;
  intensity: number;
  color_k?: number;
}

export interface ShotLighting {
  look: string;
  key: LightSource;
  fill: LightSource;
  back: LightSource;
  practicals: string[];
}

// =====================================================
// FRAME TYPES
// =====================================================

export type FrameSize = 'ECU' | 'CU' | 'MCU' | 'MS' | 'MLS' | 'LS' | 'VLS' | 'ELS' | 'PG';
export type CompositionRule = 'rule_of_thirds' | 'center' | 'golden_ratio' | 'symmetry' | 'dynamic';
export type Headroom = 'tight' | 'normal' | 'loose';
export type AspectRatio = '16:9' | '2.39:1' | '1.85:1' | '4:3' | '1:1';

export interface ShotFrame {
  size: FrameSize;
  composition: CompositionRule;
  headroom: Headroom;
  aspect_ratio: AspectRatio;
}

// =====================================================
// CAMERA SETUP TYPES (Scene-level)
// =====================================================

export interface LensDefault {
  focal_mm: number;
  aperture: number;
}

export interface SceneCamera {
  camera_id: string;
  role: 'OTS_A' | 'OTS_B' | 'WIDE_MASTER' | 'INSERT' | 'ROVING';
  sensor: 'S35' | 'FF' | 'LF';
  codec_profile: 'internal' | 'prores' | 'raw';
  lens_default: LensDefault;
}

// =====================================================
// CONTINUITY LOCK TYPES
// =====================================================

export interface ContinuityLock {
  enabled: boolean;
  locked_props: string[];
  wardrobe_lock: boolean;
  color_lock: boolean;
  time_of_day_lock: boolean;
}

// =====================================================
// EDIT PLAN TYPES
// =====================================================

export type EditMode = 'assisted' | 'pro';

export interface CutPoint {
  t_s: number;
  from: string;
  to: string;
  reason: string;
}

export interface EditPlan {
  mode: EditMode;
  recommended_cut_points: CutPoint[];
}

// =====================================================
// VISUAL STYLE TYPES
// =====================================================

export interface VisualStyleReferences {
  character_pack_id?: string;
  location_pack_id?: string;
  lookbook_ids?: string[];
}

export interface VisualStyle {
  style_id: string;
  references: VisualStyleReferences;
}

// =====================================================
// SCENE TECHNICAL DOC (Main Entity)
// =====================================================

export type TechnicalDocStatus = 'draft' | 'approved' | 'locked';

export interface SceneTechnicalDoc {
  id: string;
  scene_id: string;
  project_id: string;
  visual_style: VisualStyle;
  cameras: SceneCamera[];
  continuity_lock: ContinuityLock;
  edit_plan: EditPlan;
  status: TechnicalDocStatus;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface SceneTechnicalDocInput {
  scene_id: string;
  project_id: string;
  visual_style?: Partial<VisualStyle>;
  cameras?: SceneCamera[];
  continuity_lock?: Partial<ContinuityLock>;
  edit_plan?: Partial<EditPlan>;
}

// =====================================================
// ENHANCED SHOT (With Technical Doc fields)
// =====================================================

export interface TechnicalShot {
  id: string;
  shot_id: string;
  shot_order: number;
  camera_id: string;
  shot_type: string;
  
  // Frame & Composition
  frame?: ShotFrame;
  
  // Blocking
  blocking?: ShotBlocking;
  
  // Camera Setup
  camera_position: CameraPosition;
  camera_rotation: CameraRotation;
  camera_path: CameraPath;
  
  // Lighting
  lighting?: ShotLighting;
  
  // Focus
  focus_config: FocusConfig;
  
  // Timing
  timing_config: TimingConfig;
  
  // Constraints
  constraints: ShotConstraints;
  
  // Relations
  storyboard_panel_id?: string;
  scene_id: string;
}

// =====================================================
// UI PRESETS (For Assisted Mode)
// =====================================================

export const CAMERA_MOVEMENT_PRESETS: Record<string, Partial<CameraPath>> = {
  'static': { type: 'static', path: [], speed: null, easing: null },
  'dolly_in_slow': { type: 'dolly', speed: 'slow', easing: 'ease_in_out' },
  'dolly_out_slow': { type: 'dolly', speed: 'slow', easing: 'ease_out' },
  'arc_left': { type: 'arc', speed: 'medium', easing: 'linear' },
  'arc_right': { type: 'arc', speed: 'medium', easing: 'linear' },
  'crane_up': { type: 'crane', speed: 'slow', easing: 'ease_in' },
  'crane_down': { type: 'crane', speed: 'slow', easing: 'ease_out' },
  'handheld_light': { type: 'handheld', speed: 'slow', easing: null },
  'handheld_dynamic': { type: 'handheld', speed: 'medium', easing: null },
  'steadicam_follow': { type: 'steadicam', speed: 'medium', easing: 'linear' },
  'tracking_lateral': { type: 'tracking', speed: 'medium', easing: 'linear' },
};

export const FOCUS_PRESETS: Record<string, Partial<FocusConfig>> = {
  'follow_subject': { mode: 'follow', depth_profile: 'medium' },
  'fixed_deep': { mode: 'fixed', depth_profile: 'deep' },
  'shallow_bokeh': { mode: 'fixed', depth_profile: 'shallow' },
  'rack_ab': { mode: 'rack', depth_profile: 'shallow' },
};

export const LIGHTING_PRESETS: Record<string, Partial<ShotLighting>> = {
  'soft_natural': { 
    look: 'soft_natural',
    key: { dir: 'window', intensity: 0.8, color_k: 5600 },
    fill: { intensity: 0.4 },
    back: { intensity: 0.2 },
    practicals: []
  },
  'dramatic_low_key': {
    look: 'low_key',
    key: { dir: 'side', intensity: 0.9, color_k: 3200 },
    fill: { intensity: 0.15 },
    back: { intensity: 0.3 },
    practicals: ['practical_lamp']
  },
  'high_key_studio': {
    look: 'high_key',
    key: { dir: 'front', intensity: 0.7, color_k: 5600 },
    fill: { intensity: 0.5 },
    back: { intensity: 0.4 },
    practicals: []
  },
  'night_practical': {
    look: 'practical_night',
    key: { dir: 'practical', intensity: 0.5, color_k: 2700 },
    fill: { intensity: 0.1 },
    back: { intensity: 0.15 },
    practicals: ['lamp', 'tv_glow', 'window_moonlight']
  },
};

// =====================================================
// LOCK ICONS (For UI display)
// =====================================================

export const LOCK_ICONS = {
  color: '🎨',
  wardrobe: '👕',
  props: '🧩',
  time_of_day: '⏰',
} as const;

// =====================================================
// SHOT STATUS (For workflow)
// =====================================================

export type ShotTechnicalStatus = 'pending' | 'configured' | 'approved' | 'stale';

export function getShotTechnicalStatus(shot: Partial<TechnicalShot>): ShotTechnicalStatus {
  if (!shot.focus_config || !shot.timing_config) return 'pending';
  if (shot.constraints?.must_keep?.length === 0) return 'pending';
  return 'configured';
}
