/**
 * Hook for Short Templates v1
 * Manages template state, progress, and step navigation
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  ShortTemplate,
  TemplateStep,
  fetchTemplateById,
  fetchTemplatesForStyle,
  applyTemplateToProject,
  advanceTemplateStep,
  clearProjectTemplate,
  getCurrentStep,
  getTemplatePresetBias,
  logTemplateShown,
} from '@/lib/shortTemplates';
import { VisualStyle, FormatProfile } from '@/lib/editorialKnowledgeBase';

interface UseShortTemplateOptions {
  projectId: string;
  visualStyle: VisualStyle;
  formatProfile: FormatProfile;
  enabled?: boolean;
}

interface UseShortTemplateResult {
  // Loading
  loading: boolean;

  // Template data
  template: ShortTemplate | null;
  availableTemplates: ShortTemplate[];
  
  // Current step
  currentStepIndex: number;
  currentStep: TemplateStep | null;
  totalSteps: number;
  isComplete: boolean;
  progress: number; // 0-100

  // Actions
  applyTemplate: (templateId: string) => Promise<boolean>;
  advanceStep: () => Promise<boolean>;
  goToStep: (index: number) => Promise<boolean>;
  clearTemplate: () => Promise<boolean>;

  // Preset bias for autopilot
  presetBias: Record<string, number>;

  // Refresh
  refresh: () => Promise<void>;
}

export function useShortTemplate({
  projectId,
  visualStyle,
  formatProfile,
  enabled = true,
}: UseShortTemplateOptions): UseShortTemplateResult {
  const [loading, setLoading] = useState(true);
  const [template, setTemplate] = useState<ShortTemplate | null>(null);
  const [availableTemplates, setAvailableTemplates] = useState<ShortTemplate[]>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  // Only load templates for 'short' format
  const isShortFormat = formatProfile === 'short';

  const fetchData = useCallback(async () => {
    if (!enabled || !projectId || !isShortFormat) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      // Fetch available templates for style
      const templates = await fetchTemplatesForStyle(visualStyle);
      setAvailableTemplates(templates);

      // Fetch project's active template
      const { data: projectData } = await supabase
        .from('projects')
        .select('active_template_id, active_template_step_index')
        .eq('id', projectId)
        .maybeSingle();

      if (projectData?.active_template_id) {
        const activeTemplate = await fetchTemplateById(projectData.active_template_id);
        setTemplate(activeTemplate);
        setCurrentStepIndex(projectData.active_template_step_index || 0);

        // Log template shown
        if (activeTemplate) {
          await logTemplateShown(projectId, activeTemplate.id);
        }
      } else {
        setTemplate(null);
        setCurrentStepIndex(0);
      }
    } catch (err) {
      console.error('[useShortTemplate] Error:', err);
    } finally {
      setLoading(false);
    }
  }, [projectId, visualStyle, isShortFormat, enabled]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Current step
  const currentStep = useMemo(() => {
    if (!template) return null;
    return getCurrentStep(template, currentStepIndex);
  }, [template, currentStepIndex]);

  const totalSteps = template?.steps?.length || 0;
  const isComplete = currentStepIndex >= totalSteps;
  const progress = totalSteps > 0 ? Math.round((currentStepIndex / totalSteps) * 100) : 0;

  // Preset bias for autopilot v2
  const presetBias = useMemo(() => {
    return getTemplatePresetBias(template, currentStepIndex);
  }, [template, currentStepIndex]);

  // Actions
  const applyTemplate = useCallback(async (templateId: string) => {
    const success = await applyTemplateToProject(projectId, templateId);
    if (success) {
      const newTemplate = await fetchTemplateById(templateId);
      setTemplate(newTemplate);
      setCurrentStepIndex(0);
    }
    return success;
  }, [projectId]);

  const advanceStep = useCallback(async () => {
    if (isComplete) return false;
    const success = await advanceTemplateStep(projectId, currentStepIndex);
    if (success) {
      setCurrentStepIndex(prev => prev + 1);
    }
    return success;
  }, [projectId, currentStepIndex, isComplete]);

  const goToStep = useCallback(async (index: number) => {
    if (index < 0 || index >= totalSteps) return false;
    const { error } = await supabase
      .from('projects')
      .update({ active_template_step_index: index })
      .eq('id', projectId);

    if (error) {
      console.error('[useShortTemplate] Error going to step:', error);
      return false;
    }

    setCurrentStepIndex(index);
    return true;
  }, [projectId, totalSteps]);

  const clearTemplate = useCallback(async () => {
    const success = await clearProjectTemplate(projectId);
    if (success) {
      setTemplate(null);
      setCurrentStepIndex(0);
    }
    return success;
  }, [projectId]);

  return {
    loading,
    template,
    availableTemplates,
    currentStepIndex,
    currentStep,
    totalSteps,
    isComplete,
    progress,
    applyTemplate,
    advanceStep,
    goToStep,
    clearTemplate,
    presetBias,
    refresh: fetchData,
  };
}
