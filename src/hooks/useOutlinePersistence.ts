/**
 * useOutlinePersistence - Hook for persisting and recovering script outlines
 * Ensures outline data survives page reloads and interruptions
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';

export interface PersistedOutline {
  id: string;
  project_id: string;
  outline_json: Record<string, unknown>;
  quality: string;
  qc_issues: string[];
  status: 'draft' | 'approved' | 'rejected';
  idea?: string;
  genre?: string;
  tone?: string;
  format?: string;
  episode_count?: number;
  target_duration?: number;
  created_at: string;
  updated_at: string;
}

interface UseOutlinePersistenceOptions {
  projectId: string;
}

export function useOutlinePersistence({ projectId }: UseOutlinePersistenceOptions) {
  const [savedOutline, setSavedOutline] = useState<PersistedOutline | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load existing outline on mount
  const loadOutline = useCallback(async () => {
    if (!projectId) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      const { data, error: fetchError } = await supabase
        .from('project_outlines')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (fetchError) {
        console.error('[useOutlinePersistence] Error loading outline:', fetchError);
        setError(fetchError.message);
        return;
      }

      if (data) {
        setSavedOutline({
          ...data,
          outline_json: data.outline_json as Record<string, unknown>,
          qc_issues: Array.isArray(data.qc_issues) ? data.qc_issues as string[] : [],
          status: data.status as 'draft' | 'approved' | 'rejected',
        });
        console.log('[useOutlinePersistence] Loaded existing outline:', data.id, 'quality:', data.quality);
      }
    } catch (e) {
      console.error('[useOutlinePersistence] Unexpected error:', e);
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadOutline();
  }, [loadOutline]);

  // Save or update outline
  const saveOutline = useCallback(async (params: {
    outline: Json;
    
    quality: string;
    qcIssues?: string[];
    idea?: string;
    genre?: string;
    tone?: string;
    format?: string;
    episodeCount?: number;
    targetDuration?: number;
    status?: 'draft' | 'approved' | 'rejected';
  }): Promise<{ success: boolean; id?: string; error?: string }> => {
    if (!projectId) {
      return { success: false, error: 'No project ID' };
    }

    try {
      const payload = {
        project_id: projectId,
        outline_json: params.outline,
        quality: params.quality,
        qc_issues: params.qcIssues || [],
        idea: params.idea,
        genre: params.genre,
        tone: params.tone,
        format: params.format,
        episode_count: params.episodeCount,
        target_duration: params.targetDuration,
        status: params.status || 'draft',
        updated_at: new Date().toISOString(),
      };

      // Check if we have an existing outline to update
      if (savedOutline?.id) {
        const { data, error: updateError } = await supabase
          .from('project_outlines')
          .update(payload)
          .eq('id', savedOutline.id)
          .select()
          .single();

        if (updateError) {
          console.error('[useOutlinePersistence] Update error:', updateError);
          return { success: false, error: updateError.message };
        }

        setSavedOutline({
          ...data,
          outline_json: data.outline_json as Record<string, unknown>,
          qc_issues: Array.isArray(data.qc_issues) ? data.qc_issues as string[] : [],
          status: data.status as 'draft' | 'approved' | 'rejected',
        });
        console.log('[useOutlinePersistence] Updated outline:', data.id);
        return { success: true, id: data.id };
      }

      // Insert new outline
      const { data, error: insertError } = await supabase
        .from('project_outlines')
        .insert(payload)
        .select()
        .single();

      if (insertError) {
        console.error('[useOutlinePersistence] Insert error:', insertError);
        return { success: false, error: insertError.message };
      }

      setSavedOutline({
        ...data,
        outline_json: data.outline_json as Record<string, unknown>,
        qc_issues: Array.isArray(data.qc_issues) ? data.qc_issues as string[] : [],
        status: data.status as 'draft' | 'approved' | 'rejected',
      });
      console.log('[useOutlinePersistence] Saved new outline:', data.id);
      return { success: true, id: data.id };
    } catch (e) {
      console.error('[useOutlinePersistence] Save error:', e);
      return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  }, [projectId, savedOutline?.id]);

  // Approve outline (marks it ready for script generation)
  const approveOutline = useCallback(async (): Promise<boolean> => {
    if (!savedOutline?.id) {
      console.warn('[useOutlinePersistence] No outline to approve');
      return false;
    }

    try {
      const { error: updateError } = await supabase
        .from('project_outlines')
        .update({ status: 'approved', updated_at: new Date().toISOString() })
        .eq('id', savedOutline.id);

      if (updateError) {
        console.error('[useOutlinePersistence] Approve error:', updateError);
        return false;
      }

      setSavedOutline(prev => prev ? { ...prev, status: 'approved' } : null);
      console.log('[useOutlinePersistence] Outline approved:', savedOutline.id);
      return true;
    } catch (e) {
      console.error('[useOutlinePersistence] Approve error:', e);
      return false;
    }
  }, [savedOutline?.id]);

  // Delete outline (start fresh)
  const deleteOutline = useCallback(async (): Promise<boolean> => {
    if (!savedOutline?.id) return true;

    try {
      const { error: deleteError } = await supabase
        .from('project_outlines')
        .delete()
        .eq('id', savedOutline.id);

      if (deleteError) {
        console.error('[useOutlinePersistence] Delete error:', deleteError);
        return false;
      }

      setSavedOutline(null);
      console.log('[useOutlinePersistence] Outline deleted');
      return true;
    } catch (e) {
      console.error('[useOutlinePersistence] Delete error:', e);
      return false;
    }
  }, [savedOutline?.id]);

  return {
    savedOutline,
    isLoading,
    error,
    saveOutline,
    approveOutline,
    deleteOutline,
    refreshOutline: loadOutline,
    hasRecoverableOutline: !!savedOutline && savedOutline.status === 'draft',
  };
}
