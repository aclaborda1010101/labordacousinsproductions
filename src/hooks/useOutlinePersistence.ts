/**
 * useOutlinePersistence - Hook for persisting and recovering script outlines
 * Ensures outline data survives page reloads and interruptions
 * V4.0: Supports polling for async generation (status: 'generating')
 * V7.0: Added stuck detection + stage-aware progress
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { getStageTimeout } from '@/lib/outlineStages';
import { invokeAuthedFunction } from '@/lib/invokeAuthedFunction';
import { normalizeOutlineForDisplay } from '@/lib/outlineEntityDisplay';

export interface PersistedOutline {
  id: string;
  project_id: string;
  outline_json: Record<string, unknown>;
  outline_parts?: Json; // V4.4: Phased generation parts data (uses Json for Supabase compat)
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
        .in('status', ['completed', 'generating', 'approved', 'queued', 'stalled', 'failed', 'timeout'])
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
        // V5: Reconstruct outline_json from outline_parts if empty but parts exist
        let outlineJson = data.outline_json as Record<string, unknown>;
        const outlineParts = data.outline_parts as Record<string, any> | null;
        
        if ((!outlineJson || Object.keys(outlineJson).length === 0) && outlineParts) {
          const scaffold = outlineParts.film_scaffold?.data;
          const actI = outlineParts.expand_act_i?.data;
          const actII = outlineParts.expand_act_ii?.data;
          const actIII = outlineParts.expand_act_iii?.data;
          
          if (scaffold || actI || actII || actIII) {
            console.log('[useOutlinePersistence] V5: Reconstructing outline_json from outline_parts');
            const allBeats = [
              ...(actI?.beats || []),
              ...(actII?.beats || []),
              ...(actIII?.beats || []),
            ];
            outlineJson = { 
              ...scaffold, 
              beats: allBeats.length > 0 ? allBeats : scaffold?.beats || [] 
            };
          }
        }
        
        // V8: Normalize outline fields + ensure descriptions are always populated
        // Uses centralised normalizeOutlineForDisplay to handle want/need/flaw -> description
        const normalizedOutlineJson = normalizeOutlineForDisplay({
          ...outlineJson,
          // Map cast → main_characters (fallback chain) - normalizeOutlineForDisplay handles this too
          main_characters: (outlineJson as any).main_characters 
            || (outlineJson as any).cast 
            || (outlineJson as any).characters 
            || [],
          // Map locations → main_locations
          main_locations: (outlineJson as any).main_locations 
            || (outlineJson as any).locations 
            || [],
        });
        
        const outline: PersistedOutline = {
          ...data,
          outline_json: normalizedOutlineJson,
          outline_parts: outlineParts, // V5: Include outline_parts for hasPartialOutline check
          qc_issues: Array.isArray(data.qc_issues) ? data.qc_issues as string[] : [],
          status: data.status as PersistedOutline['status'],
          error_message: data.status === 'error' && Array.isArray(data.qc_issues) && data.qc_issues.length > 0 
            ? String(data.qc_issues[0]) 
            : undefined,
        };
        setSavedOutline(outline);
        console.log('[useOutlinePersistence] V8: Loaded outline with normalized fields:', data.id, 'chars:', normalizedOutlineJson.main_characters?.length, 'locs:', normalizedOutlineJson.main_locations?.length);
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
  // V12.0: Improved terminal detection + adaptive polling for faster closure
  const startPolling = useCallback((outlineId: string, options: PollOptions = {}) => {
    const {
      onComplete,
      onError,
      maxPollDuration = 4 * 60 * 1000, // 4 minutes default
    } = options;

    // Stop any existing polling
    stopPolling();

    setIsPolling(true);
    pollStartTimeRef.current = Date.now();
    let attempt = 0;
    let highProgressSince: number | null = null; // Track when we hit high progress

    console.log('[useOutlinePersistence] Starting polling for outline:', outlineId);

    // V12.0: Adaptive backoff - faster when progress is high
    const getBackoffDelay = (att: number, progress: number | null) => {
      // Fast polling when progress >= 90%
      if (progress != null && progress >= 90) {
        return Math.min(1000 + att * 200, 2000); // 1s -> 1.2s -> 1.4s -> cap at 2s
      }
      // Normal backoff otherwise
      return Math.min(1500 + att * 500, 5000);
    };

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
          pollIntervalRef.current = setTimeout(poll, getBackoffDelay(attempt, null));
          return;
        }

        if (!data) {
          console.warn('[useOutlinePersistence] Outline not found during polling');
          pollIntervalRef.current = setTimeout(poll, getBackoffDelay(attempt, null));
          return;
        }

        const outline: PersistedOutline = {
          ...data,
          outline_json: data.outline_json as Record<string, unknown>,
          qc_issues: Array.isArray(data.qc_issues) ? data.qc_issues as string[] : [],
          status: data.status as PersistedOutline['status'],
          stage: data.stage ?? null,
          substage: data.substage ?? null,
          progress: data.progress ?? null,
          heartbeat_at: data.heartbeat_at ?? null,
          completed_at: data.completed_at ?? null,
          error_message: (data.status === 'error' && Array.isArray(data.qc_issues) && data.qc_issues.length > 0) 
            ? String(data.qc_issues[0]) 
            : undefined,
        };

        setSavedOutline(outline);

        // V12.0: Track when we first hit high progress
        if (data.progress != null && data.progress >= 90 && !highProgressSince) {
          highProgressSince = Date.now();
          console.log('[useOutlinePersistence] High progress detected, entering fast-poll mode');
        }

        // V12.0: Stuck detection using heartbeat_at
        const heartbeatAt = data.heartbeat_at;
        const currentUpdatedAt = data.updated_at;
        const lastActivityAt = heartbeatAt || currentUpdatedAt;
        const lastActivityTime = new Date(lastActivityAt).getTime();
        const timeSinceActivity = (Date.now() - lastActivityTime) / 1000;
        
        const isActivityStale = timeSinceActivity > 30;
        
        if (isActivityStale && data.status === 'generating') {
          if (!stuckSince) {
            setStuckSince(new Date());
            console.log('[useOutlinePersistence] No heartbeat for 30s, monitoring...');
          } else {
            const stuckDuration = (Date.now() - stuckSince.getTime()) / 1000;
            const stageTimeout = getStageTimeout(data.stage);
            if (stageTimeout > 0 && stuckDuration > stageTimeout) {
              console.warn('[useOutlinePersistence] Stuck detected:', data.stage, 'duration:', stuckDuration);
              setIsStuck(true);
            }
          }
        } else if (currentUpdatedAt !== lastUpdatedRef.current) {
          lastUpdatedRef.current = currentUpdatedAt;
          setStuckSince(null);
          setIsStuck(false);
        }

        // V12.0: ROBUST terminal detection - multiple conditions for immediate closure
        const hasValidContent = !!(data.outline_json as any)?.title;
        const qualityDone = data.quality && data.quality !== 'generating';
        const stageDone = data.stage === 'done';
        const progressComplete = data.progress != null && data.progress >= 99;
        
        // Terminal statuses - IMMEDIATE completion
        const isTerminalStatus = 
          data.status === 'completed' || 
          data.status === 'approved' ||
          data.status === 'failed' ||
          data.status === 'error' ||
          data.status === 'timeout' ||
          data.status === 'stalled';
        
        // Pragmatic completion - stage done OR high progress with content
        const isPragmaticComplete = 
          (stageDone && progressComplete) ||
          (stageDone && hasValidContent) ||
          (progressComplete && hasValidContent && qualityDone);

        // V12.0: Grace period completion - if at 100% for >10 seconds, consider done
        const highProgressDuration = highProgressSince ? (Date.now() - highProgressSince) / 1000 : 0;
        const isGracePeriodComplete = data.progress === 100 && highProgressDuration > 10 && hasValidContent;

        const isComplete = isTerminalStatus || isPragmaticComplete || isGracePeriodComplete;

        if (isComplete) {
          const isError = data.status === 'error' || data.status === 'failed' || data.status === 'timeout' || data.quality === 'error';
          
          if (isError) {
            console.error('[useOutlinePersistence] Outline generation failed:', outline.error_message);
            stopPolling();
            onError?.(outline.error_message || 'Error en la generación');
          } else {
            console.log('[useOutlinePersistence] Outline generation completed:', data.id, 'status:', data.status, 'via:', 
              isTerminalStatus ? 'terminal_status' : isPragmaticComplete ? 'pragmatic' : 'grace_period');
            stopPolling();
            onComplete?.(outline);
          }
        } else {
          // Still generating - schedule next poll with adaptive backoff
          pollIntervalRef.current = setTimeout(poll, getBackoffDelay(attempt, data.progress));
        }
      } catch (e) {
        console.error('[useOutlinePersistence] Poll error:', e);
        pollIntervalRef.current = setTimeout(poll, getBackoffDelay(attempt, null));
      }
    };

    // Initial poll
    poll();
  }, [stopPolling, stuckSince]);

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
    status?: 'generating' | 'draft' | 'completed' | 'approved' | 'rejected' | 'error';
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
            console.warn('[useOutlinePersistence] Stale outline ID, checking for existing data...');
            
            // V4.5: Before inserting, check if there's already an outline with valid data
            const { data: existingWithData } = await supabase
              .from('project_outlines')
              .select('id, outline_json, outline_parts')
              .eq('project_id', projectId)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle();
            
            // If existing outline has data in outline_json OR outline_parts, preserve it
            const existingHasData = existingWithData && (
              Object.keys(existingWithData.outline_json || {}).length > 0 ||
              Object.keys(existingWithData.outline_parts || {}).length > 0
            );
            
            if (existingHasData) {
              console.log('[useOutlinePersistence] V4.5: Found existing outline with data, updating instead of creating empty:', existingWithData.id);
              
              // Merge: keep existing data, update metadata
              const mergedPayload = {
                ...payload,
                outline_json: Object.keys(payload.outline_json || {}).length > 0 
                  ? payload.outline_json 
                  : existingWithData.outline_json,
                outline_parts: existingWithData.outline_parts, // Always preserve parts
              };
              
              const { data: updatedData, error: mergeError } = await supabase
                .from('project_outlines')
                .update(mergedPayload)
                .eq('id', existingWithData.id)
                .select()
                .single();
              
              if (!mergeError && updatedData) {
                setSavedOutline({
                  ...updatedData,
                  outline_json: updatedData.outline_json as Record<string, unknown>,
                  qc_issues: Array.isArray(updatedData.qc_issues) ? updatedData.qc_issues as string[] : [],
                  status: updatedData.status as PersistedOutline['status'],
                });
                console.log('[useOutlinePersistence] Updated existing outline with preserved data:', updatedData.id);
                return { success: true, id: updatedData.id };
              }
            }
            
            // Only insert new if no existing data found
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

      // V10.5: Check if there's already a completed/approved outline before inserting
      const { data: existingCompleted } = await supabase
        .from('project_outlines')
        .select('id, status')
        .eq('project_id', projectId)
        .in('status', ['completed', 'approved'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingCompleted) {
        console.warn('[useOutlinePersistence] Found existing completed outline, updating instead of inserting:', existingCompleted.id);
        const { data: updatedData, error: updateExistingError } = await supabase
          .from('project_outlines')
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq('id', existingCompleted.id)
          .select()
          .single();
        
        if (!updateExistingError && updatedData) {
          setSavedOutline({
            ...updatedData,
            outline_json: updatedData.outline_json as Record<string, unknown>,
            qc_issues: Array.isArray(updatedData.qc_issues) ? updatedData.qc_issues as string[] : [],
            status: updatedData.status as PersistedOutline['status'],
          });
          return { success: true, id: updatedData.id };
        }
      }

      // Insert new outline only if no completed outline exists
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

  // P0: Staleness threshold for UI (more aggressive than watchdog)
  const STALE_UI_MS = 120_000; // 2 minutes

  // P0: Detect if outline is stale (generating but no recent heartbeat)
  const isStaleGenerating = useMemo(() => {
    if (!savedOutline || savedOutline.status !== 'generating') return false;
    if (!savedOutline.heartbeat_at) return false;
    
    const heartbeatTime = new Date(savedOutline.heartbeat_at).getTime();
    const timeSinceHeartbeat = Date.now() - heartbeatTime;
    return timeSinceHeartbeat > STALE_UI_MS;
  }, [savedOutline]);

  // P0: Determine if there's valid work that allows resume
  // Resume is allowed when:
  // 1. Stale generating (process died) with valid work
  // 2. Failed but has recoverable work (e.g., 502 gateway error)
  // 3. Stalled by watchdog (ZOMBIE_TIMEOUT) with valid work
  // 4. Error but with ZOMBIE_TIMEOUT/HEARTBEAT_STALE error_code (recoverable timeout)
  const canResume = useMemo(() => {
    if (!savedOutline) return false;
    
    const parts = (savedOutline as any).outline_parts;
    if (!parts) return false;
    
    // Has valid work if ANY part is done (scaffold or any act)
    // P0.3: More robust check - recognize status: 'done' OR presence of valid data for scaffold
    const hasValidWork = ['film_scaffold', 'expand_act_i', 'expand_act_ii', 'expand_act_iii', 'part_a']
      .some(k => {
        const part = parts?.[k];
        if (!part) return false;
        // Recognize explicit done status OR scaffold with data (legacy format support)
        return part.status === 'done' || (k === 'film_scaffold' && part.data);
      });
    
    // Is incomplete if any required act/part is not done
    const isIncomplete = ['expand_act_ii', 'expand_act_iii', 'part_b', 'part_c']
      .some(k => parts?.[k]?.status !== 'done');
    
    // P0.2: Recoverable error codes from watchdog
    const errorCode = (savedOutline as any).error_code;
    const isRecoverableError = savedOutline.status === 'error' && 
      ['ZOMBIE_TIMEOUT', 'HEARTBEAT_STALE'].includes(errorCode);
    
    // Resume allowed if:
    // 1. Stale generating with valid work that's incomplete
    // 2. Failed but has recoverable work
    // 3. Stalled by watchdog
    // 4. Error with recoverable error_code
    const canResumeFromStale = isStaleGenerating && hasValidWork && isIncomplete;
    const canResumeFromFailed = savedOutline.status === 'failed' && hasValidWork && isIncomplete;
    const canResumeFromStalled = savedOutline.status === 'stalled' && hasValidWork && isIncomplete;
    const canResumeFromRecoverableError = isRecoverableError && hasValidWork && isIncomplete;
    
    return canResumeFromStale || canResumeFromFailed || canResumeFromStalled || canResumeFromRecoverableError;
  }, [isStaleGenerating, savedOutline]);

  // P0: Resume generation from last completed phase
  // V6: Returns { success, errorCode } for better error handling
  const resumeGeneration = useCallback(async (): Promise<{ success: boolean; errorCode?: string }> => {
    if (!savedOutline?.id) {
      console.warn('[useOutlinePersistence] No outline to resume');
      return { success: false };
    }

    try {
      console.log('[useOutlinePersistence] Resuming generation for outline:', savedOutline.id);
      
      // Re-invoke the worker directly with resume flag
      // Using outline_id bypasses status filter, worker will set to 'generating'
      const result = await invokeAuthedFunction('outline-worker', {
        outline_id: savedOutline.id,
        resume: true,
      });

      // V6: Check for specific error codes (MAX_ATTEMPTS_EXCEEDED, etc.)
      if (result && typeof result === 'object') {
        const code = (result as any).code;
        if (code === 'MAX_ATTEMPTS_EXCEEDED') {
          console.warn('[useOutlinePersistence] Resume blocked: MAX_ATTEMPTS_EXCEEDED');
          return { success: false, errorCode: 'MAX_ATTEMPTS_EXCEEDED' };
        }
        if ('success' in result && result.success === false) {
          console.error('[useOutlinePersistence] Resume invoke failed:', result);
          return { success: false, errorCode: code };
        }
      }

      // Restart polling
      startPolling(savedOutline.id, { 
        onComplete: () => loadOutline(),
        onError: (err) => console.error('[useOutlinePersistence] Resume poll error:', err),
      });

      // Clear stuck states and update local state to generating
      setStuckSince(null);
      setIsStuck(false);
      setSavedOutline(prev => prev ? { ...prev, status: 'generating' } : null);

      console.log('[useOutlinePersistence] Resume initiated for outline:', savedOutline.id);
      return { success: true };
    } catch (e: any) {
      console.error('[useOutlinePersistence] Resume error:', e);
      // V6: Parse error for specific codes
      const message = e?.message || '';
      if (message.includes('MAX_ATTEMPTS_EXCEEDED')) {
        return { success: false, errorCode: 'MAX_ATTEMPTS_EXCEEDED' };
      }
      return { success: false };
    }
  }, [savedOutline?.id, startPolling, loadOutline]);

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
    // P0: New staleness detection + resume
    isStaleGenerating,
    canResume,
    resumeGeneration,
  };
}
