/**
 * useAutopilot - React hook for autopilot image generation
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { 
  AutopilotDecision, 
  getAutopilotDecision, 
  logAutopilotEvent,
  AutopilotSettings,
  getAutopilotSettings,
  saveAutopilotSettings
} from '@/lib/autopilot';
import { AssetType, Phase } from '@/lib/recommendations';

export interface UseAutopilotOptions {
  projectId: string;
  assetType: AssetType;
  availablePresets: string[];
  phase?: Phase;
  enabled?: boolean;
}

export interface UseAutopilotResult {
  loading: boolean;
  decision: AutopilotDecision | null;
  settings: AutopilotSettings | null;
  refresh: () => Promise<void>;
  logShown: () => Promise<void>;
  logFollowed: (engine: string, preset: string) => Promise<void>;
  logOverridden: (engine: string, preset: string) => Promise<void>;
  updateSettings: (newSettings: Partial<AutopilotSettings>) => Promise<boolean>;
}

export function useAutopilot({
  projectId,
  assetType,
  availablePresets,
  phase,
  enabled = true
}: UseAutopilotOptions): UseAutopilotResult {
  const [loading, setLoading] = useState(true);
  const [decision, setDecision] = useState<AutopilotDecision | null>(null);
  const [settings, setSettings] = useState<AutopilotSettings | null>(null);
  const hasLoggedShown = useRef(false);

  const fetchDecision = useCallback(async () => {
    if (!projectId || !enabled || availablePresets.length === 0) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const result = await getAutopilotDecision(
        projectId,
        assetType,
        availablePresets,
        phase
      );
      setDecision(result);
      setSettings(result.settings);
    } catch (err) {
      console.error('[useAutopilot] Error:', err);
    } finally {
      setLoading(false);
    }
  }, [projectId, assetType, availablePresets, phase, enabled]);

  useEffect(() => {
    fetchDecision();
  }, [fetchDecision]);

  // Reset logged state when params change
  useEffect(() => {
    hasLoggedShown.current = false;
  }, [projectId, assetType]);

  const logShown = useCallback(async () => {
    if (!decision || hasLoggedShown.current) return;
    hasLoggedShown.current = true;
    await logAutopilotEvent(projectId, assetType, 'autopilot_decision_shown', decision);
  }, [projectId, assetType, decision]);

  const logFollowed = useCallback(async (engine: string, preset: string) => {
    if (!decision) return;
    await logAutopilotEvent(projectId, assetType, 'autopilot_followed', decision, engine, preset);
  }, [projectId, assetType, decision]);

  const logOverridden = useCallback(async (engine: string, preset: string) => {
    if (!decision) return;
    await logAutopilotEvent(projectId, assetType, 'autopilot_overridden', decision, engine, preset);
  }, [projectId, assetType, decision]);

  const updateSettings = useCallback(async (newSettings: Partial<AutopilotSettings>): Promise<boolean> => {
    const success = await saveAutopilotSettings(projectId, newSettings);
    if (success) {
      const updated = await getAutopilotSettings(projectId);
      setSettings(updated);
      await fetchDecision();
    }
    return success;
  }, [projectId, fetchDecision]);

  return {
    loading,
    decision,
    settings,
    refresh: fetchDecision,
    logShown,
    logFollowed,
    logOverridden,
    updateSettings
  };
}
