/**
 * useEditorialKnowledgeBase - SIMPLIFIED
 * editorial_projects table removed. Uses project settings from projects table.
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type FormatProfile = 'short' | 'feature' | 'series' | 'commercial';
export type AnimationType = '2D' | '3D' | 'mixed' | 'live_action';
export type VisualStyle = 'pixar' | 'anime' | 'realistic' | 'stylized' | 'custom';
export type UserLevel = 'beginner' | 'normal' | 'advanced' | 'pro';

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

export function useEditorialKnowledgeBase(projectId: string | null) {
  const [context, setContext] = useState<EditorialContext>(DEFAULT_CONTEXT);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!projectId) return;
    
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
  }, [projectId]);

  const updateContext = useCallback(async (updates: Partial<EditorialContext>) => {
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
      
      setContext(prev => ({ ...prev, ...updates }));
    } catch (err) {
      console.error('[EKB] Error updating context:', err);
    }
  }, [projectId]);

  return {
    context,
    loading,
    updateContext,
  };
}
