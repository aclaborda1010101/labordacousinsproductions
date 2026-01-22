/**
 * useEditorialKnowledgeBase - SIMPLIFIED
 * editorial_projects table removed. Uses project settings from projects table.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  FormatProfile,
  AnimationType,
  VisualStyle,
  UserLevel,
  AssetCategory,
  getStyleDecision,
  getVisibility,
  FORMAT_PROFILES,
  ANIMATION_STYLES,
  USER_LEVEL_CONFIG,
} from '@/lib/editorialKnowledgeBase';

export type { FormatProfile, AnimationType, VisualStyle, UserLevel };
export { FORMAT_PROFILES, ANIMATION_STYLES, USER_LEVEL_CONFIG };

interface EditorialContext {
  formatProfile: FormatProfile;
  animationType: AnimationType;
  visualStyle: VisualStyle;
  userLevel: UserLevel;
}

const DEFAULT_CONTEXT: EditorialContext = {
  formatProfile: 'short',
  animationType: '3D',
  visualStyle: 'pixar',
  userLevel: 'normal',
};

interface UseEditorialKnowledgeBaseOptions {
  projectId?: string;
  assetType?: string;
  enabled?: boolean;
}

export function useEditorialKnowledgeBase(
  optionsOrProjectId: UseEditorialKnowledgeBaseOptions | string | null
) {
  // Handle both old signature (string) and new signature (object)
  const options: UseEditorialKnowledgeBaseOptions =
    typeof optionsOrProjectId === 'string'
      ? { projectId: optionsOrProjectId }
      : optionsOrProjectId || {};

  const { projectId, assetType = 'character', enabled = true } = options;

  const [context, setContext] = useState<EditorialContext>(DEFAULT_CONTEXT);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!projectId || !enabled) return;

    const fetchContext = async () => {
      setLoading(true);
      try {
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
          setContext(DEFAULT_CONTEXT);
        }
      } catch (err) {
        console.error('[EKB] Error fetching context:', err);
        setContext(DEFAULT_CONTEXT);
      } finally {
        setLoading(false);
      }
    };

    fetchContext();
  }, [projectId, enabled]);

  const updateContext = useCallback(
    async (updates: Partial<EditorialContext>) => {
      if (!projectId) return;

      try {
        await supabase
          .from('projects')
          .update({
            format_profile: updates.formatProfile,
            animation_type: updates.animationType,
            visual_style: updates.visualStyle,
            user_level: updates.userLevel,
          })
          .eq('id', projectId);

        setContext((prev) => ({ ...prev, ...updates }));
      } catch (err) {
        console.error('[EKB] Error updating context:', err);
      }
    },
    [projectId]
  );

  // Computed style decision
  const styleDecision = useMemo(() => {
    // Map assetType to valid AssetCategory (only character/location are valid)
    const validAssetTypes: AssetCategory[] = ['character', 'location'];
    const mappedAssetType: AssetCategory = validAssetTypes.includes(assetType as AssetCategory)
      ? (assetType as AssetCategory)
      : 'character';

    return getStyleDecision(
      {
        formatProfile: context.formatProfile,
        visualStyle: context.visualStyle,
        animationType: context.animationType,
        userLevel: context.userLevel,
      },
      mappedAssetType
    );
  }, [context, assetType]);

  // Visibility settings based on user level
  const visibility = useMemo(() => {
    return getVisibility(context.userLevel);
  }, [context.userLevel]);

  // Helper functions
  const getStyleName = useCallback(() => {
    return ANIMATION_STYLES[context.visualStyle]?.name || context.visualStyle;
  }, [context.visualStyle]);

  const getFormatName = useCallback(() => {
    return FORMAT_PROFILES[context.formatProfile]?.name || context.formatProfile;
  }, [context.formatProfile]);

  // Individual setters for compatibility
  const setFormatProfile = useCallback(
    (value: FormatProfile) => updateContext({ formatProfile: value }),
    [updateContext]
  );

  const setAnimationType = useCallback(
    (value: AnimationType) => updateContext({ animationType: value }),
    [updateContext]
  );

  const setVisualStyle = useCallback(
    (value: VisualStyle) => updateContext({ visualStyle: value }),
    [updateContext]
  );

  const setUserLevel = useCallback(
    (value: UserLevel) => updateContext({ userLevel: value }),
    [updateContext]
  );

  return {
    // Core context
    context,
    loading,
    updateContext,

    // Individual properties for convenience
    formatProfile: context.formatProfile,
    animationType: context.animationType,
    visualStyle: context.visualStyle,
    userLevel: context.userLevel,

    // Individual setters
    setFormatProfile,
    setAnimationType,
    setVisualStyle,
    setUserLevel,

    // Computed values
    styleDecision,
    visibility,

    // Helper functions
    getStyleName,
    getFormatName,
  };
}
