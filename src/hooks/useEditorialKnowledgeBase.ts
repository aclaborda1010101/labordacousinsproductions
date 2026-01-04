/**
 * Hook for Editorial Knowledge Base v1
 * Provides style context, decisions, and visibility gating
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  FormatProfile,
  AnimationType,
  VisualStyle,
  UserLevel,
  AssetCategory,
  ProjectStyleContext,
  StyleDecision,
  UserLevelVisibility,
  getStyleDecision,
  getVisibility,
  FORMAT_PROFILES,
  ANIMATION_STYLES,
  USER_LEVEL_CONFIG,
} from '@/lib/editorialKnowledgeBase';

interface UseEditorialKnowledgeBaseOptions {
  projectId: string;
  assetType?: AssetCategory;
  enabled?: boolean;
}

interface UseEditorialKnowledgeBaseResult {
  // Loading state
  loading: boolean;

  // Style context
  context: ProjectStyleContext | null;
  formatProfile: FormatProfile;
  animationType: AnimationType;
  visualStyle: VisualStyle;
  userLevel: UserLevel;

  // Update functions
  setFormatProfile: (value: FormatProfile) => Promise<void>;
  setAnimationType: (value: AnimationType) => Promise<void>;
  setVisualStyle: (value: VisualStyle) => Promise<void>;
  setUserLevel: (value: UserLevel) => Promise<void>;

  // Decisions
  styleDecision: StyleDecision | null;
  visibility: UserLevelVisibility;

  // Helpers
  getStyleName: () => string;
  getFormatName: () => string;
  getUserLevelConfig: () => { label: string; icon: string; description: string };

  // Refresh
  refresh: () => Promise<void>;
}

// MVP: Default to 'normal' user level (not 'explorer')
const DEFAULT_CONTEXT: ProjectStyleContext = {
  formatProfile: 'short',
  animationType: '3D',
  visualStyle: 'pixar',
  userLevel: 'normal',
};

export function useEditorialKnowledgeBase({
  projectId,
  assetType = 'character',
  enabled = true,
}: UseEditorialKnowledgeBaseOptions): UseEditorialKnowledgeBaseResult {
  const [loading, setLoading] = useState(true);
  const [context, setContext] = useState<ProjectStyleContext | null>(null);

  const fetchContext = useCallback(async () => {
    if (!enabled || !projectId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      // Try projects table first
      const { data: projectData } = await supabase
        .from('projects')
        .select('format_profile, animation_type, visual_style, user_level')
        .eq('id', projectId)
        .maybeSingle();

      if (projectData) {
        setContext({
          formatProfile: (projectData.format_profile as FormatProfile) || 'short',
          animationType: (projectData.animation_type as AnimationType) || '3D',
          visualStyle: (projectData.visual_style as VisualStyle) || 'pixar',
          userLevel: (projectData.user_level as UserLevel) || 'normal',
        });
      } else {
        // Try editorial_projects table
        const { data: editorialData } = await supabase
          .from('editorial_projects')
          .select('format_profile, animation_type, visual_style, user_level')
          .eq('id', projectId)
          .maybeSingle();

        if (editorialData) {
          setContext({
            formatProfile: (editorialData.format_profile as FormatProfile) || 'short',
            animationType: (editorialData.animation_type as AnimationType) || '3D',
            visualStyle: (editorialData.visual_style as VisualStyle) || 'pixar',
            userLevel: (editorialData.user_level as UserLevel) || 'normal',
          });
        } else {
          setContext(DEFAULT_CONTEXT);
        }
      }
    } catch (err) {
      console.error('[EKB] Error fetching context:', err);
      setContext(DEFAULT_CONTEXT);
    } finally {
      setLoading(false);
    }
  }, [projectId, enabled]);

  useEffect(() => {
    fetchContext();
  }, [fetchContext]);

  // Update helpers
  const updateProjectField = useCallback(async (field: string, value: string) => {
    if (!projectId) return;

    // Try updating projects table
    const { error: projectError } = await supabase
      .from('projects')
      .update({ [field]: value })
      .eq('id', projectId);

    if (projectError) {
      // Try editorial_projects table
      await supabase
        .from('editorial_projects')
        .update({ [field]: value })
        .eq('id', projectId);
    }

    // Update local state
    setContext(prev => prev ? { ...prev, [toCamelCase(field)]: value } : null);
  }, [projectId]);

  const setFormatProfile = useCallback(async (value: FormatProfile) => {
    await updateProjectField('format_profile', value);
  }, [updateProjectField]);

  const setAnimationType = useCallback(async (value: AnimationType) => {
    await updateProjectField('animation_type', value);
  }, [updateProjectField]);

  const setVisualStyle = useCallback(async (value: VisualStyle) => {
    await updateProjectField('visual_style', value);
  }, [updateProjectField]);

  const setUserLevel = useCallback(async (value: UserLevel) => {
    await updateProjectField('user_level', value);
  }, [updateProjectField]);

  // Derived values
  const styleDecision = useMemo(() => {
    if (!context) return null;
    return getStyleDecision(context, assetType);
  }, [context, assetType]);

  const visibility = useMemo(() => {
    return getVisibility(context?.userLevel || 'normal');
  }, [context?.userLevel]);

  const getStyleName = useCallback(() => {
    if (!context) return 'Pixar';
    return ANIMATION_STYLES[context.visualStyle]?.name || context.visualStyle;
  }, [context]);

  const getFormatName = useCallback(() => {
    if (!context) return 'Cortometraje';
    return FORMAT_PROFILES[context.formatProfile]?.name || context.formatProfile;
  }, [context]);

  const getUserLevelConfig = useCallback(() => {
    return USER_LEVEL_CONFIG[context?.userLevel || 'explorer'];
  }, [context?.userLevel]);

  return {
    loading,
    context,
    formatProfile: context?.formatProfile || 'short',
    animationType: context?.animationType || '3D',
    visualStyle: context?.visualStyle || 'pixar',
    userLevel: context?.userLevel || 'normal',
    setFormatProfile,
    setAnimationType,
    setVisualStyle,
    setUserLevel,
    styleDecision,
    visibility,
    getStyleName,
    getFormatName,
    getUserLevelConfig,
    refresh: fetchContext,
  };
}

// Helper to convert snake_case to camelCase
function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}
