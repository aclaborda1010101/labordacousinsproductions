/**
 * Sequence Validation Rules - Cinematographic pipeline validation
 * 
 * These rules enforce professional film production standards at each pipeline stage.
 * Errors block progression; warnings allow continuation with acknowledgment.
 */

export type ValidationLevel = 'error' | 'warning';
export type PipelinePhase = 'storyboard' | 'camera_plan' | 'tech_doc' | 'keyframes';

export interface ValidationRule {
  code: string;
  name: string;
  level: ValidationLevel;
  phase: PipelinePhase;
  description: string;
  check: (data: any, context?: ValidationContext) => ValidationCheckResult;
}

export interface ValidationContext {
  characterIds?: string[];
  locationId?: string;
  visualDnaLocks?: string[];
  previousPanelAxis?: string;
}

export interface ValidationCheckResult {
  passed: boolean;
  message?: string;
  affectedItems?: string[];
}

export interface ValidationError {
  code: string;
  level: 'error';
  message: string;
  affectedItems?: string[];
}

export interface ValidationWarning {
  code: string;
  level: 'warning';
  message: string;
  affectedItems?: string[];
}

export interface ValidationResult {
  is_valid: boolean;
  blocking_errors: ValidationError[];
  warnings: ValidationWarning[];
  can_proceed: boolean;
  phase: PipelinePhase;
}

// =============================================================================
// STORYBOARD VALIDATION RULES
// =============================================================================
export const STORYBOARD_RULES: ValidationRule[] = [
  {
    code: 'SB_001',
    name: 'Panel sin panel_code',
    level: 'error',
    phase: 'storyboard',
    description: 'Cada panel debe tener un código identificador (P1, P2, etc.)',
    check: (panels: any[]) => {
      const missing = panels.filter(p => !p.panel_code && !p.panel_id);
      return {
        passed: missing.length === 0,
        message: `${missing.length} panel(es) sin código identificador`,
        affectedItems: missing.map((_, i) => `Panel ${i + 1}`),
      };
    },
  },
  {
    code: 'SB_002',
    name: 'Panel sin shot_hint',
    level: 'error',
    phase: 'storyboard',
    description: 'Cada panel debe tener un tipo de plano (PG, PM, PP, etc.)',
    check: (panels: any[]) => {
      const missing = panels.filter(p => !p.shot_hint);
      return {
        passed: missing.length === 0,
        message: `${missing.length} panel(es) sin tipo de plano`,
        affectedItems: missing.map(p => p.panel_code || `Panel ${p.panel_no}`),
      };
    },
  },
  {
    code: 'SB_003',
    name: 'Personaje sin visual_dna_lock',
    level: 'error',
    phase: 'storyboard',
    description: 'Los personajes en el storyboard deben tener Visual DNA bloqueado',
    check: (panels: any[], context?: ValidationContext) => {
      if (!context?.visualDnaLocks || context.visualDnaLocks.length === 0) {
        // No locks defined - check if panels have characters
        const panelsWithChars = panels.filter(p => 
          p.characters_present && p.characters_present.length > 0
        );
        if (panelsWithChars.length > 0) {
          return {
            passed: false,
            message: 'No hay Visual DNA locks definidos para los personajes',
            affectedItems: panelsWithChars.map(p => p.panel_code || `Panel ${p.panel_no}`),
          };
        }
      }
      return { passed: true };
    },
  },
  {
    code: 'SB_004',
    name: 'Eje 180° roto entre paneles',
    level: 'error',
    phase: 'storyboard',
    description: 'La consistencia del eje de cámara debe mantenerse entre paneles consecutivos',
    check: (panels: any[]) => {
      const violations: string[] = [];
      
      for (let i = 1; i < panels.length; i++) {
        const prev = panels[i - 1];
        const curr = panels[i];
        
        const prevAxis = prev.staging?.spatial_info?.subject_direction || 
                        prev.spatial_info?.subject_direction;
        const currAxis = curr.staging?.spatial_info?.subject_direction || 
                        curr.spatial_info?.subject_direction;
        const axisLocked = curr.continuity?.axis_locked ?? 
                          curr.staging?.spatial_info?.axis_locked;
        
        // If axis is locked and directions are opposite, it's a violation
        if (axisLocked && prevAxis && currAxis) {
          const isOpposite = (
            (prevAxis === 'towards_camera' && currAxis === 'away_from_camera') ||
            (prevAxis === 'away_from_camera' && currAxis === 'towards_camera') ||
            (prevAxis === 'lateral_left' && currAxis === 'lateral_right') ||
            (prevAxis === 'lateral_right' && currAxis === 'lateral_left')
          );
          
          if (isOpposite) {
            violations.push(`${prev.panel_code || `P${prev.panel_no}`} → ${curr.panel_code || `P${curr.panel_no}`}`);
          }
        }
      }
      
      return {
        passed: violations.length === 0,
        message: `Ruptura del eje 180° detectada en ${violations.length} transición(es)`,
        affectedItems: violations,
      };
    },
  },
  {
    code: 'SB_005',
    name: 'Cambio de dirección sin transición',
    level: 'warning',
    phase: 'storyboard',
    description: 'Un cambio abrupto de dirección de cámara puede confundir al espectador',
    check: (panels: any[]) => {
      const abruptChanges: string[] = [];
      
      for (let i = 1; i < panels.length; i++) {
        const prev = panels[i - 1];
        const curr = panels[i];
        
        const prevPos = prev.staging?.spatial_info?.camera_relative_position ||
                       prev.spatial_info?.camera_relative_position;
        const currPos = curr.staging?.spatial_info?.camera_relative_position ||
                       curr.spatial_info?.camera_relative_position;
        
        // Major position changes without a transitional shot
        if (prevPos && currPos && prevPos !== currPos) {
          const isAbrupt = (
            (prevPos === 'front' && currPos === 'behind') ||
            (prevPos === 'behind' && currPos === 'front') ||
            (prevPos === 'left' && currPos === 'right') ||
            (prevPos === 'right' && currPos === 'left')
          );
          
          if (isAbrupt) {
            abruptChanges.push(`${prev.panel_code || `P${prev.panel_no}`} → ${curr.panel_code || `P${curr.panel_no}`}`);
          }
        }
      }
      
      return {
        passed: abruptChanges.length === 0,
        message: `${abruptChanges.length} cambio(s) de dirección abrupto(s)`,
        affectedItems: abruptChanges,
      };
    },
  },
  {
    code: 'SB_006',
    name: 'Panel sin intent',
    level: 'warning',
    phase: 'storyboard',
    description: 'Cada panel debe tener una descripción de intención narrativa',
    check: (panels: any[]) => {
      const missing = panels.filter(p => !p.panel_intent || p.panel_intent.length < 10);
      return {
        passed: missing.length === 0,
        message: `${missing.length} panel(es) sin intención narrativa clara`,
        affectedItems: missing.map(p => p.panel_code || `Panel ${p.panel_no}`),
      };
    },
  },
];

// =============================================================================
// CAMERA PLAN VALIDATION RULES
// =============================================================================
export const CAMERA_PLAN_RULES: ValidationRule[] = [
  {
    code: 'CP_001',
    name: 'Shot sin panel_ref válido',
    level: 'error',
    phase: 'camera_plan',
    description: 'Cada shot debe referenciar un panel aprobado del storyboard',
    check: (data: { shots: any[], approvedPanels: string[] }) => {
      const invalidRefs = data.shots.filter(s => 
        !s.panel_ref || !data.approvedPanels.includes(s.panel_ref)
      );
      return {
        passed: invalidRefs.length === 0,
        message: `${invalidRefs.length} shot(s) con referencia de panel inválida`,
        affectedItems: invalidRefs.map(s => `Shot ${s.shot_no}: ${s.panel_ref || 'sin ref'}`),
      };
    },
  },
  {
    code: 'CP_002',
    name: 'Cámaras ocupando mismo espacio',
    level: 'error',
    phase: 'camera_plan',
    description: 'Dos posiciones de cámara no pueden ocupar el mismo espacio físico',
    check: (data: { blocking_diagrams: any[] }) => {
      const collisions: string[] = [];
      
      for (const diagram of data.blocking_diagrams || []) {
        const cams = diagram.camera_marks || [];
        for (let i = 0; i < cams.length; i++) {
          for (let j = i + 1; j < cams.length; j++) {
            const c1 = cams[i];
            const c2 = cams[j];
            if (c1.pos && c2.pos) {
              const dist = Math.sqrt(
                Math.pow(c1.pos.x - c2.pos.x, 2) + 
                Math.pow(c1.pos.y - c2.pos.y, 2)
              );
              if (dist < 0.1) { // Too close
                collisions.push(`Cams ${c1.cam_id} y ${c2.cam_id}`);
              }
            }
          }
        }
      }
      
      return {
        passed: collisions.length === 0,
        message: `${collisions.length} colisión(es) de cámara detectada(s)`,
        affectedItems: collisions,
      };
    },
  },
  {
    code: 'CP_003',
    name: 'Movimiento incompatible con shot_type',
    level: 'warning',
    phase: 'camera_plan',
    description: 'Algunos movimientos de cámara no son óptimos para ciertos tipos de plano',
    check: (data: { shots: any[] }) => {
      const incompatible: string[] = [];
      
      // Rules: PPP shouldn't have fast movement, PG shouldn't have tight tracking
      const rules: Record<string, string[]> = {
        'PPP': ['tracking_fast', 'crane_fast', 'whip_pan'],
        'PP': ['tracking_fast', 'whip_pan'],
        'INSERT': ['crane', 'steadicam', 'tracking'],
      };
      
      for (const shot of data.shots || []) {
        const shotType = shot.shot_type_hint || shot.shot_type;
        const movement = shot.camera?.movement?.type || shot.movement;
        
        if (shotType && movement && rules[shotType]?.includes(movement)) {
          incompatible.push(`Shot ${shot.shot_no}: ${shotType} con ${movement}`);
        }
      }
      
      return {
        passed: incompatible.length === 0,
        message: `${incompatible.length} combinación(es) movimiento/plano cuestionable(s)`,
        affectedItems: incompatible,
      };
    },
  },
  {
    code: 'CP_004',
    name: 'Blocking sin personajes definidos',
    level: 'error',
    phase: 'camera_plan',
    description: 'Los diagramas de blocking deben incluir todos los personajes de la escena',
    check: (data: { blocking_diagrams: any[], characterIds: string[] }) => {
      if (!data.characterIds || data.characterIds.length === 0) {
        return { passed: true }; // No characters to check
      }
      
      const missingChars: string[] = [];
      
      for (const diagram of data.blocking_diagrams || []) {
        const entityIds = (diagram.entities || [])
          .filter((e: any) => e.kind === 'character')
          .map((e: any) => e.id);
        
        const missing = data.characterIds.filter(id => !entityIds.includes(id));
        if (missing.length > 0) {
          missingChars.push(`${diagram.blocking_id}: faltan ${missing.length} personaje(s)`);
        }
      }
      
      return {
        passed: missingChars.length === 0,
        message: `${missingChars.length} diagrama(s) con personajes faltantes`,
        affectedItems: missingChars,
      };
    },
  },
];

// =============================================================================
// TECHNICAL DOC VALIDATION RULES
// =============================================================================
export const TECH_DOC_RULES: ValidationRule[] = [
  {
    code: 'TD_001',
    name: 'Shot sin foco definido',
    level: 'error',
    phase: 'tech_doc',
    description: 'Cada shot debe tener configuración de foco (target, depth)',
    check: (shots: any[]) => {
      const missing = shots.filter(s => 
        !s.focus || (!s.focus.target && !s.focus.target_entity)
      );
      return {
        passed: missing.length === 0,
        message: `${missing.length} shot(s) sin configuración de foco`,
        affectedItems: missing.map(s => `Shot ${s.shot_no}`),
      };
    },
  },
  {
    code: 'TD_002',
    name: 'Lente incompatible con shot_type',
    level: 'error',
    phase: 'tech_doc',
    description: 'La distancia focal debe ser apropiada para el tipo de plano',
    check: (shots: any[]) => {
      const incompatible: string[] = [];
      
      // Lens recommendations per shot type (focal length ranges in mm)
      const lensRanges: Record<string, [number, number]> = {
        'PPP': [85, 200],  // Extreme close-up: telephoto
        'PP': [50, 135],   // Close-up: portrait lenses
        'PMC': [35, 85],   // Medium close: standard to portrait
        'PM': [35, 50],    // Medium: standard
        'PG': [16, 35],    // Wide: wide angle
        'TOP_DOWN': [16, 24], // Very wide
      };
      
      for (const shot of shots) {
        const shotType = shot.shot_type;
        const focal = shot.camera?.lens?.focal_mm || shot.focal_length;
        const range = lensRanges[shotType];
        
        if (focal && range && (focal < range[0] || focal > range[1])) {
          incompatible.push(`Shot ${shot.shot_no}: ${shotType} con ${focal}mm (recomendado: ${range[0]}-${range[1]}mm)`);
        }
      }
      
      return {
        passed: incompatible.length === 0,
        message: `${incompatible.length} shot(s) con lente no óptima`,
        affectedItems: incompatible,
      };
    },
  },
  {
    code: 'TD_003',
    name: 'Movimiento sin path',
    level: 'warning',
    phase: 'tech_doc',
    description: 'Los movimientos de cámara deben tener trayectoria definida',
    check: (shots: any[]) => {
      const missingPath: string[] = [];
      
      const movementsNeedingPath = ['dolly', 'tracking', 'crane', 'arc', 'steadicam'];
      
      for (const shot of shots) {
        const movType = shot.camera?.movement?.type;
        if (movType && movementsNeedingPath.includes(movType)) {
          const hasPath = shot.camera?.movement?.path && 
                         shot.camera.movement.path.length >= 2;
          if (!hasPath) {
            missingPath.push(`Shot ${shot.shot_no}: ${movType} sin trayectoria`);
          }
        }
      }
      
      return {
        passed: missingPath.length === 0,
        message: `${missingPath.length} shot(s) con movimiento sin trayectoria`,
        affectedItems: missingPath,
      };
    },
  },
  {
    code: 'TD_004',
    name: 'Continuity lock roto',
    level: 'error',
    phase: 'tech_doc',
    description: 'Los valores bloqueados en continuidad no deben cambiar',
    check: (shots: any[], context?: ValidationContext) => {
      // This would need continuity data to validate
      // For now, check if locks exist
      const locksViolated: string[] = [];
      
      for (const shot of shots) {
        if (shot.constraints?.never_change) {
          for (const field of shot.constraints.never_change) {
            // Check if the field has a different value than expected
            // This is a simplified check
            if (shot[field] === undefined) {
              locksViolated.push(`Shot ${shot.shot_no}: campo '${field}' no definido`);
            }
          }
        }
      }
      
      return {
        passed: locksViolated.length === 0,
        message: `${locksViolated.length} violación(es) de continuidad`,
        affectedItems: locksViolated,
      };
    },
  },
  {
    code: 'TD_005',
    name: 'Shot sin timing definido',
    level: 'warning',
    phase: 'tech_doc',
    description: 'Cada shot debe tener duración especificada',
    check: (shots: any[]) => {
      const missing = shots.filter(s => 
        !s.timing?.duration_sec && !s.duration_target && !s.duration_sec
      );
      return {
        passed: missing.length === 0,
        message: `${missing.length} shot(s) sin duración definida`,
        affectedItems: missing.map(s => `Shot ${s.shot_no}`),
      };
    },
  },
];

// =============================================================================
// KEYFRAMES VALIDATION RULES
// =============================================================================
export const KEYFRAMES_RULES: ValidationRule[] = [
  {
    code: 'KF_001',
    name: 'Shot sin keyframe inicial',
    level: 'error',
    phase: 'keyframes',
    description: 'Cada shot debe tener al menos un keyframe de referencia',
    check: (data: { shots: any[], keyframes: Record<string, any[]> }) => {
      const missing = data.shots.filter(s => 
        !data.keyframes[s.id] || data.keyframes[s.id].length === 0
      );
      return {
        passed: missing.length === 0,
        message: `${missing.length} shot(s) sin keyframe inicial`,
        affectedItems: missing.map(s => `Shot ${s.shot_no}`),
      };
    },
  },
  {
    code: 'KF_002',
    name: 'Keyframe sin aprobación de identidad',
    level: 'error',
    phase: 'keyframes',
    description: 'Los keyframes con personajes deben pasar validación de identidad',
    check: (data: { keyframes: any[] }) => {
      const unvalidated = data.keyframes.filter(kf => 
        kf.has_characters && (!kf.identity_score || kf.identity_score < 70)
      );
      return {
        passed: unvalidated.length === 0,
        message: `${unvalidated.length} keyframe(s) sin validación de identidad`,
        affectedItems: unvalidated.map(kf => `Keyframe ${kf.id}`),
      };
    },
  },
];

// =============================================================================
// RULE COLLECTIONS BY PHASE
// =============================================================================
export const RULES_BY_PHASE: Record<PipelinePhase, ValidationRule[]> = {
  storyboard: STORYBOARD_RULES,
  camera_plan: CAMERA_PLAN_RULES,
  tech_doc: TECH_DOC_RULES,
  keyframes: KEYFRAMES_RULES,
};

export function getRulesForPhase(phase: PipelinePhase): ValidationRule[] {
  return RULES_BY_PHASE[phase] || [];
}

export function getAllRules(): ValidationRule[] {
  return [
    ...STORYBOARD_RULES,
    ...CAMERA_PLAN_RULES,
    ...TECH_DOC_RULES,
    ...KEYFRAMES_RULES,
  ];
}
