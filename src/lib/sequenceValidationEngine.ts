/**
 * Sequence Validation Engine - Cinematographic Pipeline Validator
 * 
 * This engine validates cinematographic data at each pipeline stage:
 * Storyboard → Camera Plan → Technical Doc → Keyframes
 * 
 * Errors block progression; warnings allow continuation with Pro mode override.
 */

import {
  ValidationRule,
  ValidationResult,
  ValidationError,
  ValidationWarning,
  ValidationContext,
  PipelinePhase,
  getRulesForPhase,
  STORYBOARD_RULES,
  CAMERA_PLAN_RULES,
  TECH_DOC_RULES,
  KEYFRAMES_RULES,
} from './sequenceValidationRules';

export interface ValidateStoryboardInput {
  panels: any[];
  characterIds?: string[];
  visualDnaLocks?: string[];
}

export interface ValidateCameraPlanInput {
  shots: any[];
  blocking_diagrams?: any[];
  approvedPanels: string[];
  characterIds?: string[];
}

export interface ValidateTechDocInput {
  shots: any[];
  continuityLocks?: any;
}

export interface ValidateKeyframesInput {
  shots: any[];
  keyframes: Record<string, any[]>;
}

/**
 * Validate storyboard panels before generating Camera Plan
 */
export function validateStoryboard(input: ValidateStoryboardInput): ValidationResult {
  const { panels, characterIds, visualDnaLocks } = input;
  const context: ValidationContext = { characterIds, visualDnaLocks };
  
  return runValidation('storyboard', panels, context);
}

/**
 * Validate camera plan before generating Technical Doc
 */
export function validateCameraPlan(input: ValidateCameraPlanInput): ValidationResult {
  const { shots, blocking_diagrams = [], approvedPanels, characterIds } = input;
  
  const data = { shots, blocking_diagrams, approvedPanels, characterIds };
  
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];
  
  for (const rule of CAMERA_PLAN_RULES) {
    const result = rule.check(data);
    
    if (!result.passed) {
      const item = {
        code: rule.code,
        level: rule.level,
        message: result.message || rule.description,
        affectedItems: result.affectedItems,
      };
      
      if (rule.level === 'error') {
        errors.push(item as ValidationError);
      } else {
        warnings.push(item as ValidationWarning);
      }
    }
  }
  
  return {
    is_valid: errors.length === 0,
    blocking_errors: errors,
    warnings,
    can_proceed: errors.length === 0,
    phase: 'camera_plan',
  };
}

/**
 * Validate technical doc before generating Keyframes
 */
export function validateTechnicalDoc(input: ValidateTechDocInput): ValidationResult {
  const { shots, continuityLocks } = input;
  const context: ValidationContext = {};
  
  return runValidation('tech_doc', shots, context);
}

/**
 * Validate keyframes before render
 */
export function validateKeyframes(input: ValidateKeyframesInput): ValidationResult {
  const { shots, keyframes } = input;
  
  const data = { shots, keyframes };
  
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];
  
  for (const rule of KEYFRAMES_RULES) {
    const result = rule.check(data);
    
    if (!result.passed) {
      const item = {
        code: rule.code,
        level: rule.level,
        message: result.message || rule.description,
        affectedItems: result.affectedItems,
      };
      
      if (rule.level === 'error') {
        errors.push(item as ValidationError);
      } else {
        warnings.push(item as ValidationWarning);
      }
    }
  }
  
  return {
    is_valid: errors.length === 0,
    blocking_errors: errors,
    warnings,
    can_proceed: errors.length === 0,
    phase: 'keyframes',
  };
}

/**
 * Generic validation runner
 */
function runValidation(
  phase: PipelinePhase,
  data: any,
  context?: ValidationContext
): ValidationResult {
  const rules = getRulesForPhase(phase);
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];
  
  for (const rule of rules) {
    try {
      const result = rule.check(data, context);
      
      if (!result.passed) {
        const item = {
          code: rule.code,
          level: rule.level,
          message: result.message || rule.description,
          affectedItems: result.affectedItems,
        };
        
        if (rule.level === 'error') {
          errors.push(item as ValidationError);
        } else {
          warnings.push(item as ValidationWarning);
        }
      }
    } catch (err) {
      console.error(`Validation rule ${rule.code} failed:`, err);
    }
  }
  
  return {
    is_valid: errors.length === 0,
    blocking_errors: errors,
    warnings,
    can_proceed: errors.length === 0,
    phase,
  };
}

/**
 * Check 180° axis consistency between two panels
 */
export function checkAxisConsistency(panel1: any, panel2: any): boolean {
  const dir1 = panel1.staging?.spatial_info?.subject_direction || 
               panel1.spatial_info?.subject_direction;
  const dir2 = panel2.staging?.spatial_info?.subject_direction || 
               panel2.spatial_info?.subject_direction;
  
  if (!dir1 || !dir2) return true; // No data = no violation
  
  const opposites: Record<string, string> = {
    'towards_camera': 'away_from_camera',
    'away_from_camera': 'towards_camera',
    'lateral_left': 'lateral_right',
    'lateral_right': 'lateral_left',
  };
  
  return dir2 !== opposites[dir1];
}

/**
 * Check lens compatibility with shot type
 */
export function checkLensCompatibility(shotType: string, focalLength: number): {
  compatible: boolean;
  recommendation?: string;
} {
  const ranges: Record<string, [number, number]> = {
    'PPP': [85, 200],
    'PP': [50, 135],
    'PMC': [35, 85],
    'PM': [35, 50],
    'PG': [16, 35],
    'TOP_DOWN': [16, 24],
    '2SHOT': [24, 50],
    'OTS': [35, 85],
  };
  
  const range = ranges[shotType];
  if (!range) return { compatible: true };
  
  if (focalLength < range[0] || focalLength > range[1]) {
    return {
      compatible: false,
      recommendation: `Para ${shotType}, se recomienda ${range[0]}-${range[1]}mm (actual: ${focalLength}mm)`,
    };
  }
  
  return { compatible: true };
}

/**
 * Get validation summary for display
 */
export function getValidationSummary(result: ValidationResult): {
  icon: string;
  color: string;
  label: string;
} {
  if (result.blocking_errors.length > 0) {
    return {
      icon: '❌',
      color: 'text-destructive',
      label: `${result.blocking_errors.length} error(es) bloqueante(s)`,
    };
  }
  
  if (result.warnings.length > 0) {
    return {
      icon: '⚠️',
      color: 'text-amber-500',
      label: `${result.warnings.length} advertencia(s)`,
    };
  }
  
  return {
    icon: '✅',
    color: 'text-green-500',
    label: 'Validación completada',
  };
}

// Re-export types
export type { ValidationResult, ValidationError, ValidationWarning, PipelinePhase };
