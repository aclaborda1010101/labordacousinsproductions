import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { 
  getEditorialSuggestions, 
  EditorialSuggestion, 
  EditorialSignals, 
  AssetType 
} from '@/lib/editorialAssistant';

interface UseEditorialAssistantProps {
  projectId: string;
  assetType: AssetType;
  currentRunId?: string;
  phase: 'exploration' | 'production';
  presetId?: string;
  enabled?: boolean;
}

interface UseEditorialAssistantReturn {
  suggestions: EditorialSuggestion[];
  signals: EditorialSignals | null;
  loading: boolean;
  logEvent: (eventType: string, suggestionId?: string, payload?: Record<string, unknown>) => Promise<void>;
  dismissSuggestion: (suggestionId: string) => void;
  refresh: () => Promise<void>;
}

export function useEditorialAssistant({
  projectId,
  assetType,
  currentRunId,
  phase,
  presetId,
  enabled = true
}: UseEditorialAssistantProps): UseEditorialAssistantReturn {
  const [suggestions, setSuggestions] = useState<EditorialSuggestion[]>([]);
  const [signals, setSignals] = useState<EditorialSignals | null>(null);
  const [loading, setLoading] = useState(false);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  const fetchSignals = useCallback(async (): Promise<EditorialSignals | null> => {
    if (!projectId) return null;

    try {
      // Fetch generation runs for this project and asset type
      const { data: runs, error } = await supabase
        .from('generation_runs')
        .select('id, status, preset_id, parent_run_id, created_at, accepted_at')
        .eq('project_id', projectId)
        .eq('run_type', assetType)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) {
        console.error('[useEditorialAssistant] Error fetching runs:', error);
        return null;
      }

      // Fetch canon assets count
      const { count: canonCount } = await supabase
        .from('canon_assets')
        .select('*', { count: 'exact', head: true })
        .eq('project_id', projectId)
        .eq('asset_type', assetType)
        .eq('is_active', true);

      // Calculate signals
      const acceptedRuns = runs?.filter(r => r.status === 'accepted') || [];
      const hasAcceptedRun = acceptedRuns.length > 0;
      const canonPresent = (canonCount || 0) > 0;
      const totalGenerations = runs?.length || 0;

      // Calculate regeneration chain for current run
      let regenerationsChain = 0;
      if (currentRunId && runs) {
        let runId: string | null = currentRunId;
        while (runId) {
          const run = runs.find(r => r.id === runId);
          if (run) {
            regenerationsChain++;
            runId = run.parent_run_id;
          } else {
            break;
          }
        }
      }

      // Calculate accept rate by preset
      const acceptRateByPreset: Record<string, { accepted: number; total: number; rate: number }> = {};
      runs?.forEach(run => {
        if (run.preset_id) {
          if (!acceptRateByPreset[run.preset_id]) {
            acceptRateByPreset[run.preset_id] = { accepted: 0, total: 0, rate: 0 };
          }
          acceptRateByPreset[run.preset_id].total++;
          if (run.status === 'accepted') {
            acceptRateByPreset[run.preset_id].accepted++;
          }
        }
      });
      Object.keys(acceptRateByPreset).forEach(key => {
        const stats = acceptRateByPreset[key];
        stats.rate = stats.total > 0 ? stats.accepted / stats.total : 0;
      });

      // Check for repeated fail pattern (3+ without accept in recent runs)
      const recentRuns = runs?.slice(0, 5) || [];
      const recentAccepts = recentRuns.filter(r => r.status === 'accepted').length;
      const repeatedFailPattern = recentRuns.length >= 3 && recentAccepts === 0;

      return {
        regenerationsChain,
        hasAcceptedRun,
        canonPresent,
        canonCount: canonCount || 0,
        phase,
        acceptRateByPreset,
        currentPresetId: presetId,
        repeatedFailPattern,
        totalGenerations
      };
    } catch (err) {
      console.error('[useEditorialAssistant] Exception:', err);
      return null;
    }
  }, [projectId, assetType, currentRunId, phase, presetId]);

  const refresh = useCallback(async () => {
    if (!enabled || !projectId) {
      setSuggestions([]);
      return;
    }

    setLoading(true);
    try {
      const newSignals = await fetchSignals();
      setSignals(newSignals);

      if (newSignals) {
        const allSuggestions = getEditorialSuggestions(assetType, newSignals);
        // Filter out dismissed suggestions
        const activeSuggestions = allSuggestions.filter(s => !dismissedIds.has(s.id));
        setSuggestions(activeSuggestions);
      } else {
        setSuggestions([]);
      }
    } finally {
      setLoading(false);
    }
  }, [enabled, projectId, assetType, fetchSignals, dismissedIds]);

  const logEvent = useCallback(async (
    eventType: string,
    suggestionId?: string,
    payload?: Record<string, unknown>
  ) => {
    try {
      // Use raw insert to avoid type issues with new table
      await supabase.from('editorial_events').insert([{
        project_id: projectId,
        run_id: currentRunId || null,
        asset_type: assetType,
        event_type: eventType,
        suggestion_id: suggestionId || null,
        payload: payload || {}
      }] as any);
    } catch (err) {
      console.error('[useEditorialAssistant] Error logging event:', err);
    }
  }, [projectId, currentRunId, assetType]);

  const dismissSuggestion = useCallback((suggestionId: string) => {
    setDismissedIds(prev => new Set([...prev, suggestionId]));
    setSuggestions(prev => prev.filter(s => s.id !== suggestionId));
  }, []);

  // Refresh when dependencies change
  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    suggestions,
    signals,
    loading,
    logEvent,
    dismissSuggestion,
    refresh
  };
}
