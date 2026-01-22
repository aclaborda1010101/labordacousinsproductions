/**
 * Short Templates v1
 * Template structures for short format projects with step-by-step guidance
 */

import { supabase } from '@/integrations/supabase/client';
import { VisualStyle } from './editorialKnowledgeBase';
import type { Json } from '@/integrations/supabase/types';

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

export interface TemplateStep {
  stepKey: string;
  label: string;
  recommendedPresetIds: string[];
  shotType: 'character' | 'location' | 'keyframe';
  notes: string;
}

export interface ShortTemplate {
  id: string;
  style_id: VisualStyle;
  name: string;
  description: string;
  steps: TemplateStep[];
  recommended_shots?: unknown;
  pacing: 'slow' | 'medium' | 'fast';
  duration_range: string;
  created_at: string;
}

export type TemplateStepStatus = 'pending' | 'in_progress' | 'done';

export interface TemplateProgress {
  templateId: string;
  currentStepIndex: number;
  stepStatuses: Record<string, TemplateStepStatus>;
  totalSteps: number;
  completedSteps: number;
}

// ─────────────────────────────────────────────────────────────
// FETCH TEMPLATES
// ─────────────────────────────────────────────────────────────

export async function fetchTemplatesForStyle(styleId: VisualStyle): Promise<ShortTemplate[]> {
  const { data, error } = await supabase
    .from('short_templates')
    .select('*')
    .eq('style_id', styleId);

  if (error) {
    console.error('[ShortTemplates] Error fetching templates:', error);
    return [];
  }

  return (data || []).map(t => ({
    ...t,
    steps: Array.isArray(t.steps) ? t.steps : JSON.parse(t.steps as string),
  })) as ShortTemplate[];
}

export async function fetchTemplateById(templateId: string): Promise<ShortTemplate | null> {
  const { data, error } = await supabase
    .from('short_templates')
    .select('*')
    .eq('id', templateId)
    .maybeSingle();

  if (error || !data) {
    console.error('[ShortTemplates] Error fetching template:', error);
    return null;
  }

  return {
    ...data,
    steps: Array.isArray(data.steps) ? data.steps : JSON.parse(data.steps as string),
  } as ShortTemplate;
}

export async function fetchAllTemplates(): Promise<ShortTemplate[]> {
  const { data, error } = await supabase
    .from('short_templates')
    .select('*');

  if (error) {
    console.error('[ShortTemplates] Error fetching all templates:', error);
    return [];
  }

  return (data || []).map(t => ({
    ...t,
    steps: Array.isArray(t.steps) ? t.steps : JSON.parse(t.steps as string),
  })) as ShortTemplate[];
}

// ─────────────────────────────────────────────────────────────
// PROJECT TEMPLATE MANAGEMENT
// ─────────────────────────────────────────────────────────────

export async function applyTemplateToProject(projectId: string, templateId: string): Promise<boolean> {
  const { error } = await supabase
    .from('projects')
    .update({
      active_template_id: templateId,
      active_template_step_index: 0,
    })
    .eq('id', projectId);

  if (error) {
    console.error('[ShortTemplates] Error applying template:', error);
    return false;
  }

  // Log event
  await logTemplateEvent(projectId, 'template_applied', { templateId });
  return true;
}

export async function advanceTemplateStep(projectId: string, currentIndex: number): Promise<boolean> {
  const { error } = await supabase
    .from('projects')
    .update({
      active_template_step_index: currentIndex + 1,
    })
    .eq('id', projectId);

  if (error) {
    console.error('[ShortTemplates] Error advancing step:', error);
    return false;
  }

  // Log event
  await logTemplateEvent(projectId, 'template_step_advanced', { 
    fromIndex: currentIndex, 
    toIndex: currentIndex + 1 
  });
  return true;
}

export async function clearProjectTemplate(projectId: string): Promise<boolean> {
  const { error } = await supabase
    .from('projects')
    .update({
      active_template_id: null,
      active_template_step_index: 0,
    })
    .eq('id', projectId);

  if (error) {
    console.error('[ShortTemplates] Error clearing template:', error);
    return false;
  }

  return true;
}

// ─────────────────────────────────────────────────────────────
// GET CURRENT STEP
// ─────────────────────────────────────────────────────────────

export function getCurrentStep(template: ShortTemplate, stepIndex: number): TemplateStep | null {
  if (!template.steps || stepIndex < 0 || stepIndex >= template.steps.length) {
    return null;
  }
  return template.steps[stepIndex];
}

export function getStepByKey(template: ShortTemplate, stepKey: string): TemplateStep | null {
  return template.steps.find(s => s.stepKey === stepKey) || null;
}

// ─────────────────────────────────────────────────────────────
// PRESET BOOST FOR AUTOPILOT v2
// ─────────────────────────────────────────────────────────────

const TEMPLATE_PRESET_BOOST = 0.08; // Higher than style bias (0.05)

/**
 * Get preset boost based on current template step
 * Used by Autopilot v2 to favor recommended presets
 */
export function getTemplatePresetBias(
  template: ShortTemplate | null,
  stepIndex: number
): Record<string, number> {
  if (!template) return {};

  const step = getCurrentStep(template, stepIndex);
  if (!step) return {};

  const bias: Record<string, number> = {};
  for (const presetId of step.recommendedPresetIds) {
    bias[presetId] = TEMPLATE_PRESET_BOOST;
  }

  return bias;
}

// ─────────────────────────────────────────────────────────────
// QA CHECKS
// ─────────────────────────────────────────────────────────────

export interface TemplateQAWarning {
  type: 'style_mismatch' | 'no_canon' | 'too_many_shots' | 'wrong_animation_type';
  message: string;
  suggestion: string;
}

export function runTemplateQAChecks(
  projectData: {
    animation_type?: string;
    visual_style?: string;
    format_profile?: string;
  },
  shotsCount: number,
  hasCanon: boolean,
  selectedPresetId?: string
): TemplateQAWarning[] {
  const warnings: TemplateQAWarning[] = [];

  // Check: Too many shots for a short
  if (projectData.format_profile === 'short' && shotsCount > 25) {
    warnings.push({
      type: 'too_many_shots',
      message: `${shotsCount} shots puede ser demasiado para un cortometraje`,
      suggestion: 'Considera reducir el número de shots o cambiar a formato Serie',
    });
  }

  // Check: No canon but needs consistency
  if (!hasCanon && shotsCount > 3) {
    warnings.push({
      type: 'no_canon',
      message: 'No hay personaje marcado como Canon',
      suggestion: 'Marca un personaje como Canon ⭐ para mantener consistencia visual',
    });
  }

  // Check: 2D preset on 3D animation type (simplified check)
  const is2DStyle = ['ghibli', 'anime', 'cartoon', 'sports_epic'].includes(projectData.visual_style || '');
  const is3DAnimationType = projectData.animation_type === '3D';
  
  if (is3DAnimationType && is2DStyle) {
    warnings.push({
      type: 'wrong_animation_type',
      message: `Estilo ${projectData.visual_style} es típicamente 2D, pero el proyecto es 3D`,
      suggestion: 'Considera cambiar el tipo de animación a 2D o elegir un estilo 3D como Pixar o Realista',
    });
  }

  return warnings;
}

// ─────────────────────────────────────────────────────────────
// EVENT LOGGING
// ─────────────────────────────────────────────────────────────

async function logTemplateEvent(
  projectId: string,
  eventType: 'template_shown' | 'template_applied' | 'template_step_advanced',
  payload: { templateId?: string; fromIndex?: number; toIndex?: number }
): Promise<void> {
  // editorial_events table removed - log to console only
  console.log('[ShortTemplates] Event:', eventType, { projectId });
      event_type: eventType,
      asset_type: 'template',
      payload: payload as Json,
    }]);
  } catch (err) {
    console.error('[ShortTemplates] Error logging event:', err);
  }
}

export async function logTemplateShown(projectId: string, templateId: string): Promise<void> {
  await logTemplateEvent(projectId, 'template_shown', { templateId });
}
