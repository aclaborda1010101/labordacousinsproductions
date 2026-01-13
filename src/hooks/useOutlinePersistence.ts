/**
 * useOutlinePersistence - Hook for persisting and recovering script outlines
 * Ensures outline data survives page reloads and interruptions
 * V4.0: Supports polling for async generation (status: 'generating')
 * V7.0: Added stuck detection + stage-aware progress
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { getStageTimeout } from '@/lib/outlineStages';
import { invokeAuthedFunction } from '@/lib/invokeAuthedFunction';

export interface PersistedOutline {
  id: string;
  project_id: string;
  outline_json: Record<string, unknown>;
  quality: string;
  qc_issues: string[];
  status: 'generating' | 'draft' | 'approved' | 'rejected' | 'error' | 'queued' | 'completed' | 'timeout' | 'failed' | 'stalled';
  idea?: string;
  genre?: string;
  tone?: string;
  format?: string;
  episode_count?: number;
  target_duration?: number;
  error_message?: string;
  error_code?: string | null;     // V11: Error classification code
  error_detail?: string | null;   // V11: Detailed error message
  stage?: string | null;       // 'summarize' | 'outline' | 'merge' | 'done'
  substage?: string | null;    // V9: 'arc' | 'episodes_1' | 'episodes_2' | 'qc' etc
  progress?: number | null;    // 0-100 progress indicator
  heartbeat_at?: string | null; // V9: Updated every 12s during processing
  completed_at?: string | null; // V9: When generation completed
  created_at: string;
  updated_at: string;
}

interface UseOutlinePersistenceOptions {
  projectId: string;
}

interface PollOptions {
  onComplete?: (outline: PersistedOutline) => void;
  onError?: (error: string) => void;
  maxPollDuration?: number; // Max polling duration in ms (default 10 min)
  pollInterval?: number; // Polling interval in ms (default 5s)
}

export function useOutlinePersistence({ projectId }: UseOutlinePersistenceOptions) {
  const [savedOutline, setSavedOutline] = useState<PersistedOutline | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  
  // V7: Stuck detection state
  const [stuckSince, setStuckSince] = useState<Date | null>(null);
  const [isStuck, setIsStuck] = useState(false);
  const lastUpdatedRef = useRef<string | null>(null);
  
  // Refs for polling (V5: use Timeout instead of Interval for backoff)
  const pollIntervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollStartTimeRef = useRef<number | null>(null);

  // Clear polling timeout
  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearTimeout(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    pollStartTimeRef.current = null;
    setIsPolling(false);
    setStuckSince(null);
    setIsStuck(false);
    lastUpdatedRef.current = null;
  }, []);

  // Load existing outline on mount
  const loadOutline = useCallback(async () => {
    if (!projectId) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      // V10.3: Prioritize completed/generating/approved outlines over draft
      // This prevents orphan drafts from hiding completed outlines
      let { data, error: fetchError } = await supabase
        .from('project_outlines')
        .select('*')
        .eq('project_id', projectId)
        .in('status', ['completed', 'generating', 'approved', 'queued'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      // Fallback: if no completed/generating outline, get any (including draft)
      if (!data && !fetchError) {
        const fallback = await supabase
          .from('project_outlines')
          .select('*')
          .eq('project_id', projectId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        data = fallback.data;
        fetchError = fallback.error;
      }

      if (fetchError) {
        console.error('[useOutlinePersistence] Error loading outline:', fetchError);
        setError(fetchError.message);
        return;
      }

      if (data) {
        const outline: PersistedOutline = {
          ...data,
          outline_json: data.outline_json as Record<string, unknown>,
          qc_issues: Array.isArray(data.qc_issues) ? data.qc_issues as string[] : [],
          status: data.status as PersistedOutline['status'],
          error_message: data.status === 'error' && Array.isArray(data.qc_issues) && data.qc_issues.length > 0 
            ? String(data.qc_issues[0]) 
            : undefined,
        };
        setSavedOutline(outline);
        console.log('[useOutlinePersistence] Loaded existing outline:', data.id, 'status:', data.status, 'quality:', data.quality);
        return outline;
      }
    } catch (e) {
      console.error('[useOutlinePersistence] Unexpected error:', e);
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
    return null;
  }, [projectId]);

  useEffect(() => {
    loadOutline();
    return () => stopPolling(); // Cleanup on unmount
  }, [loadOutline, stopPolling]);

  // Start polling for outline completion with backoff
  const startPolling = useCallback((outlineId: string, options: PollOptions = {}) => {
    const {
      onComplete,
      onError,
      maxPollDuration = 4 * 60 * 1000, // 4 minutes default (V5: reduced from 10)
    } = options;

    // Stop any existing polling
    stopPolling();

    setIsPolling(true);
    pollStartTimeRef.current = Date.now();
    let attempt = 0;

    console.log('[useOutlinePersistence] Starting polling for outline:', outlineId);

    // V5: Backoff suave: 1.5s -> 2s -> 2.5s -> ... -> 5s cap
    const getBackoffDelay = (att: number) => Math.min(1500 + att * 500, 5000);

    const poll = async () => {
      try {
        attempt++;
        
        // Check timeout
        if (pollStartTimeRef.current && Date.now() - pollStartTimeRef.current > maxPollDuration) {
          console.warn('[useOutlinePersistence] Polling timeout reached');
          stopPolling();
          onError?.('Timeout esperando outline. Intenta de nuevo o reduce el texto.');
          return;
        }

        const { data, error: fetchError } = await supabase
          .from('project_outlines')
          .select('*')
          .eq('id', outlineId)
          .single();

        if (fetchError) {
          console.error('[useOutlinePersistence] Polling error:', fetchError);
          // Schedule next poll with backoff
          pollIntervalRef.current = setTimeout(poll, getBackoffDelay(attempt));
          return;
        }

        if (!data) {
          console.warn('[useOutlinePersistence] Outline not found during polling');
          pollIntervalRef.current = setTimeout(poll, getBackoffDelay(attempt));
          return;
        }

        const outline: PersistedOutline = {
          ...data,
          outline_json: data.outline_json as Record<string, unknown>,
          qc_issues: Array.isArray(data.qc_issues) ? data.qc_issues as string[] : [],
          status: data.status as PersistedOutline['status'],
          stage: data.stage ?? null,
          progress: data.progress ?? null,
          error_message: (data.status === 'error' && Array.isArray(data.qc_issues) && data.qc_issues.length > 0) 
            ? String(data.qc_issues[0]) 
            : undefined,
        };

        setSavedOutline(outline);

        // V9: Stuck detection using heartbeat_at (more reliable than updated_at)
        const heartbeatAt = data.heartbeat_at;
        const currentUpdatedAt = data.updated_at;
        
        // Use heartbeat_at if available, otherwise fall back to updated_at
        const lastActivityAt = heartbeatAt || currentUpdatedAt;
        const lastActivityTime = new Date(lastActivityAt).getTime();
        const timeSinceActivity = (Date.now() - lastActivityTime) / 1000;
        
        // If no activity for 30+ seconds while generating, consider potentially stuck
        const isActivityStale = timeSinceActivity > 30;
        
        if (isActivityStale && data.status === 'generating') {
          if (!stuckSince) {
            setStuckSince(new Date());
            console.log('[useOutlinePersistence] No heartbeat for 30s, monitoring...');
          } else {
            // Check if we've been stuck longer than stage timeout
            const stuckDuration = (Date.now() - stuckSince.getTime()) / 1000;
            const stageTimeout = getStageTimeout(data.stage);
            if (stageTimeout > 0 && stuckDuration > stageTimeout) {
              console.warn('[useOutlinePersistence] Stuck detected:', data.stage, 'duration:', stuckDuration, 'no heartbeat for:', timeSinceActivity);
              setIsStuck(true);
            }
          }
        } else if (currentUpdatedAt !== lastUpdatedRef.current) {
          // Progress detected - reset stuck state
          lastUpdatedRef.current = currentUpdatedAt;
          setStuckSince(null);
          setIsStuck(false);
        }

        // V6: Robust completion check with defensive fallback
        // 1. status is 'completed' or 'approved'
        // 2. OR stage=done + progress=100 + has valid content (defensive fallback)
        // 3. OR has valid content (title) AND quality is not 'generating'
        const hasValidContent = !!(data.outline_json as any)?.title;
        const qualityDone = data.quality && data.quality !== 'generating';
        const stageDone = data.stage === 'done' && data.progress === 100;
        const isComplete = 
          data.status === 'completed' || 
          data.status === 'approved' ||
          (stageDone && hasValidContent) ||
          (hasValidContent && qualityDone);

        if (isComplete) {
          console.log('[useOutlinePersistence] Outline generation completed:', data.id, 'status:', data.status);
          stopPolling();
          onComplete?.(outline);
        } else if (data.status === 'error' || data.quality === 'error') {
          console.error('[useOutlinePersistence] Outline generation failed:', outline.error_message);
          stopPolling();
          onError?.(outline.error_message || 'Error en la generación');
        } else {
          // Still generating - schedule next poll with backoff
          pollIntervalRef.current = setTimeout(poll, getBackoffDelay(attempt));
        }
      } catch (e) {
        console.error('[useOutlinePersistence] Poll error:', e);
        // Schedule next poll with backoff
        pollIntervalRef.current = setTimeout(poll, getBackoffDelay(attempt));
      }
    };

    // Initial poll
    poll();
  }, [stopPolling]);

  // Create a new outline in 'generating' state (returns immediately)
  const createGeneratingOutline = useCallback(async (params: {
    idea?: string;
    genre?: string;
    tone?: string;
    format?: string;
    episodeCount?: number;
    targetDuration?: number;
    qualityTier?: string;
    narrativeMode?: string;
  }): Promise<{ success: boolean; outlineId?: string; error?: string }> => {
    if (!projectId) {
      return { success: false, error: 'No project ID' };
    }

    try {
      const payload = {
        project_id: projectId,
        outline_json: {}, // Empty initially
        quality: 'generating',
        qc_issues: [],
        idea: params.idea,
        genre: params.genre,
        tone: params.tone,
        format: params.format,
        episode_count: params.episodeCount,
        target_duration: params.targetDuration,
        status: 'generating',
        updated_at: new Date().toISOString(),
      };

      // Delete any existing outline for this project first to avoid duplicates
      if (savedOutline?.id) {
        await supabase
          .from('project_outlines')
          .delete()
          .eq('id', savedOutline.id);
      }

      // Insert new outline
      const { data, error: insertError } = await supabase
        .from('project_outlines')
        .insert(payload)
        .select()
        .single();

      if (insertError) {
        console.error('[useOutlinePersistence] Create generating outline error:', insertError);
        return { success: false, error: insertError.message };
      }

      setSavedOutline({
        ...data,
        outline_json: data.outline_json as Record<string, unknown>,
        qc_issues: Array.isArray(data.qc_issues) ? data.qc_issues as string[] : [],
        status: data.status as PersistedOutline['status'],
      });
      
      console.log('[useOutlinePersistence] Created generating outline:', data.id);
      return { success: true, outlineId: data.id };
    } catch (e) {
      console.error('[useOutlinePersistence] Create generating outline error:', e);
      return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  }, [projectId, savedOutline?.id]);

  // Save or update outline (for completion from backend or manual save)
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
    status?: 'generating' | 'draft' | 'approved' | 'rejected' | 'error';
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
          .maybeSingle(); // V4.3: Use maybeSingle to avoid PGRST116 errors

        // V4.3: Handle stale ID (record was deleted/replaced) - fallback to insert
        if (updateError || !data) {
          const errorCode = (updateError as any)?.code;
          const isStaleId = !data || errorCode === 'PGRST116' || errorCode === '22P02';
          
          if (isStaleId) {
            console.warn('[useOutlinePersistence] Stale outline ID, inserting new record instead');
            
            // Insert new outline since the old one doesn't exist
            const { data: newData, error: insertError } = await supabase
              .from('project_outlines')
              .insert(payload)
              .select()
              .single();

            if (insertError) {
              console.error('[useOutlinePersistence] Fallback insert error:', insertError);
              return { success: false, error: insertError.message };
            }

            setSavedOutline({
              ...newData,
              outline_json: newData.outline_json as Record<string, unknown>,
              qc_issues: Array.isArray(newData.qc_issues) ? newData.qc_issues as string[] : [],
              status: newData.status as PersistedOutline['status'],
            });
            console.log('[useOutlinePersistence] Saved new outline (stale ID recovery):', newData.id);
            return { success: true, id: newData.id };
          }
          
          console.error('[useOutlinePersistence] Update error:', updateError);
          return { success: false, error: updateError?.message || 'Update failed' };
        }

        setSavedOutline({
          ...data,
          outline_json: data.outline_json as Record<string, unknown>,
          qc_issues: Array.isArray(data.qc_issues) ? data.qc_issues as string[] : [],
          status: data.status as PersistedOutline['status'],
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
        status: data.status as PersistedOutline['status'],
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
      stopPolling();
      console.log('[useOutlinePersistence] Outline deleted');
      return true;
    } catch (e) {
      console.error('[useOutlinePersistence] Delete error:', e);
      return false;
    }
  }, [savedOutline?.id, stopPolling]);

  // V7: Retry current stage if stuck
  const retryCurrentStage = useCallback(async (): Promise<boolean> => {
    if (!savedOutline?.id) {
      console.warn('[useOutlinePersistence] No outline to retry');
      return false;
    }

    try {
      console.log('[useOutlinePersistence] Retrying current stage for outline:', savedOutline.id);
      
      // Reset stuck state and clear error, bump updated_at
      const { error: updateError } = await supabase
        .from('project_outlines')
        .update({
          updated_at: new Date().toISOString(),
        })
        .eq('id', savedOutline.id);

      if (updateError) {
        console.error('[useOutlinePersistence] Retry update error:', updateError);
        return false;
      }

      // Re-invoke the worker
      await invokeAuthedFunction('outline-worker', {
        outline_id: savedOutline.id,
      });

      // Reset stuck state
      setStuckSince(null);
      setIsStuck(false);
      lastUpdatedRef.current = null;

      console.log('[useOutlinePersistence] Retry initiated for outline:', savedOutline.id);
      return true;
    } catch (e) {
      console.error('[useOutlinePersistence] Retry error:', e);
      return false;
    }
  }, [savedOutline?.id]);

  return {
    savedOutline,
    isLoading,
    error,
    isPolling,
    isStuck,
    stuckSince,
    saveOutline,
    approveOutline,
    deleteOutline,
    refreshOutline: loadOutline,
    createGeneratingOutline,
    startPolling,
    stopPolling,
    retryCurrentStage,
    hasRecoverableOutline: !!savedOutline && savedOutline.status === 'draft',
    isGenerating: savedOutline?.status === 'generating',
  };
}
