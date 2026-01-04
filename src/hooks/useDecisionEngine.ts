import { useState, useEffect, useCallback } from 'react';
import { 
  getDecisionPack, 
  logDecisionEvent,
  creativeModeToUserMode,
  type DecisionPack, 
  type DecisionContext,
  type ActionIntent,
  type DecisionAssetType,
  type DecisionPhase,
  type UserMode,
  type DecisionEventType
} from '@/lib/decisionEngine';
import type { CreativeMode } from '@/lib/modeCapabilities';

export interface UseDecisionEngineProps {
  projectId: string;
  assetType: DecisionAssetType;
  creativeMode: CreativeMode;
  phase: DecisionPhase;
  currentRunId?: string;
  currentPresetId?: string;
  currentEngine?: string;
  entityId?: string;
  enabled?: boolean;
}

export interface UseDecisionEngineReturn {
  decision: DecisionPack | null;
  loading: boolean;
  error: Error | null;
  // Get decision for a specific action
  getDecisionFor: (action: ActionIntent, chainLength?: number) => Promise<DecisionPack | null>;
  // Apply the recommended decision
  applyDecision: () => void;
  // Log that decision was shown
  logShown: () => Promise<void>;
  // Log that decision was followed
  logFollowed: (chosenEngine?: string, chosenPreset?: string) => Promise<void>;
  // Log that decision was overridden
  logOverridden: (chosenEngine?: string, chosenPreset?: string, chosenAction?: ActionIntent) => Promise<void>;
  // Log autopilot events
  logAutopilotPrompted: () => Promise<void>;
  logAutopilotExecuted: () => Promise<void>;
  // Log cost warning shown
  logCostWarning: () => Promise<void>;
  // Refresh the decision
  refresh: () => Promise<void>;
}

/**
 * Hook to use the Decision Engine for smart recommendations
 */
export function useDecisionEngine({
  projectId,
  assetType,
  creativeMode,
  phase,
  currentRunId,
  currentPresetId,
  currentEngine,
  entityId,
  enabled = true
}: UseDecisionEngineProps): UseDecisionEngineReturn {
  const [decision, setDecision] = useState<DecisionPack | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const userMode = creativeModeToUserMode(creativeMode);

  const buildContext = useCallback((): DecisionContext => ({
    projectId,
    userMode,
    phase,
    assetType,
    currentRunId,
    currentPresetId,
    currentEngine,
    entityId
  }), [projectId, userMode, phase, assetType, currentRunId, currentPresetId, currentEngine, entityId]);

  const fetchDecision = useCallback(async (action: ActionIntent = 'generate', chainLength: number = 1) => {
    if (!enabled || !projectId) return null;
    
    setLoading(true);
    setError(null);
    
    try {
      const ctx = buildContext();
      const pack = await getDecisionPack(ctx, action, chainLength);
      setDecision(pack);
      return pack;
    } catch (err) {
      const e = err instanceof Error ? err : new Error('Unknown error');
      setError(e);
      console.error('[useDecisionEngine] Error:', e);
      return null;
    } finally {
      setLoading(false);
    }
  }, [enabled, projectId, buildContext]);

  const getDecisionFor = useCallback(async (action: ActionIntent, chainLength: number = 1): Promise<DecisionPack | null> => {
    return fetchDecision(action, chainLength);
  }, [fetchDecision]);

  const applyDecision = useCallback(() => {
    // This is a no-op placeholder - actual application happens in the consuming component
    // The component should read decision.recommendedPresetId, recommendedEngine, etc.
    console.log('[useDecisionEngine] Decision applied:', decision);
  }, [decision]);

  const logShown = useCallback(async () => {
    if (!decision || !projectId) return;
    await logDecisionEvent(projectId, assetType, 'decision_shown', decision);
  }, [decision, projectId, assetType]);

  const logFollowed = useCallback(async (chosenEngine?: string, chosenPreset?: string) => {
    if (!decision || !projectId) return;
    await logDecisionEvent(projectId, assetType, 'decision_followed', decision, {
      chosenEngine: chosenEngine || decision.recommendedEngine,
      chosenPreset: chosenPreset || decision.recommendedPresetId
    });
  }, [decision, projectId, assetType]);

  const logOverridden = useCallback(async (
    chosenEngine?: string, 
    chosenPreset?: string, 
    chosenAction?: ActionIntent
  ) => {
    if (!decision || !projectId) return;
    await logDecisionEvent(projectId, assetType, 'decision_overridden', decision, {
      chosenEngine,
      chosenPreset,
      chosenAction
    });
  }, [decision, projectId, assetType]);

  const logAutopilotPrompted = useCallback(async () => {
    if (!decision || !projectId) return;
    await logDecisionEvent(projectId, assetType, 'autopilot_prompted', decision);
  }, [decision, projectId, assetType]);

  const logAutopilotExecuted = useCallback(async () => {
    if (!decision || !projectId) return;
    await logDecisionEvent(projectId, assetType, 'autopilot_executed', decision);
  }, [decision, projectId, assetType]);

  const logCostWarning = useCallback(async () => {
    if (!decision || !projectId) return;
    await logDecisionEvent(projectId, assetType, 'cost_warning_shown', decision);
  }, [decision, projectId, assetType]);

  const refresh = useCallback(async () => {
    await fetchDecision('generate');
  }, [fetchDecision]);

  // Auto-fetch on mount and when dependencies change
  useEffect(() => {
    if (enabled && projectId) {
      fetchDecision('generate');
    }
  }, [enabled, projectId, assetType, phase, currentRunId, fetchDecision]);

  return {
    decision,
    loading,
    error,
    getDecisionFor,
    applyDecision,
    logShown,
    logFollowed,
    logOverridden,
    logAutopilotPrompted,
    logAutopilotExecuted,
    logCostWarning,
    refresh
  };
}

/**
 * Lightweight hook for just getting a decision without state management
 */
export function useDecisionOnce(
  projectId: string,
  assetType: DecisionAssetType,
  creativeMode: CreativeMode,
  phase: DecisionPhase,
  action: ActionIntent
): { decision: DecisionPack | null; loading: boolean } {
  const [decision, setDecision] = useState<DecisionPack | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    
    const fetch = async () => {
      const ctx: DecisionContext = {
        projectId,
        userMode: creativeModeToUserMode(creativeMode),
        phase,
        assetType
      };
      
      try {
        const pack = await getDecisionPack(ctx, action);
        if (!cancelled) setDecision(pack);
      } catch (err) {
        console.error('[useDecisionOnce] Error:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    
    fetch();
    return () => { cancelled = true; };
  }, [projectId, assetType, creativeMode, phase, action]);

  return { decision, loading };
}
