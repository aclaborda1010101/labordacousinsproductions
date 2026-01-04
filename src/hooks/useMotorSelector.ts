/**
 * Hook for Motor Selector v1 - Engine/Preset recommendations
 */

import { useState, useEffect, useCallback } from 'react';
import { 
  getMotorRecommendation, 
  MetricsResult, 
  AssetType,
  Phase,
  logRecommendationEvent,
  isOverride
} from '@/lib/motorSelector';

interface UseMotorSelectorOptions {
  projectId: string;
  assetType: AssetType;
  phase?: Phase;
  enabled?: boolean;
}

interface UseMotorSelectorResult {
  loading: boolean;
  recommendation: MetricsResult['recommendation'];
  metrics: MetricsResult['metrics'];
  refresh: () => Promise<void>;
  checkOverride: (engine: string, preset: string) => boolean;
  logShown: () => Promise<void>;
  logOverride: (engine: string, preset: string) => Promise<void>;
  logFollowed: (engine: string, preset: string) => Promise<void>;
}

export function useMotorSelector({
  projectId,
  assetType,
  phase,
  enabled = true
}: UseMotorSelectorOptions): UseMotorSelectorResult {
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<MetricsResult>({ metrics: [], recommendation: null });
  const [hasLoggedShown, setHasLoggedShown] = useState(false);

  const fetchRecommendation = useCallback(async () => {
    if (!enabled || !projectId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const data = await getMotorRecommendation(projectId, assetType, phase);
      setResult(data);
    } catch (err) {
      console.error('[useMotorSelector] Error:', err);
    } finally {
      setLoading(false);
    }
  }, [projectId, assetType, phase, enabled]);

  useEffect(() => {
    fetchRecommendation();
  }, [fetchRecommendation]);

  // Reset logged state when recommendation changes
  useEffect(() => {
    setHasLoggedShown(false);
  }, [projectId, assetType, phase]);

  const checkOverride = useCallback((engine: string, preset: string): boolean => {
    return isOverride(engine, preset, result.recommendation);
  }, [result.recommendation]);

  const logShown = useCallback(async () => {
    if (hasLoggedShown || !result.recommendation) return;
    
    await logRecommendationEvent(
      projectId,
      assetType,
      'recommendation_shown',
      result.recommendation
    );
    setHasLoggedShown(true);
  }, [projectId, assetType, result.recommendation, hasLoggedShown]);

  const logOverride = useCallback(async (engine: string, preset: string) => {
    await logRecommendationEvent(
      projectId,
      assetType,
      'recommendation_overridden',
      result.recommendation,
      engine,
      preset
    );
  }, [projectId, assetType, result.recommendation]);

  const logFollowed = useCallback(async (engine: string, preset: string) => {
    await logRecommendationEvent(
      projectId,
      assetType,
      'recommendation_followed',
      result.recommendation,
      engine,
      preset
    );
  }, [projectId, assetType, result.recommendation]);

  return {
    loading,
    recommendation: result.recommendation,
    metrics: result.metrics,
    refresh: fetchRecommendation,
    checkOverride,
    logShown,
    logOverride,
    logFollowed
  };
}
