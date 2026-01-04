/**
 * Hook for Recommendations v1 - Engine + Preset recommendations
 */

import { useState, useEffect, useCallback } from 'react';
import { 
  getRecommendations, 
  RecommendationsResult,
  AssetType,
  Phase,
  logRecommendationEvent,
  isOverride
} from '@/lib/recommendations';

interface UseRecommendationsOptions {
  projectId: string;
  assetType: AssetType;
  availablePresets: string[];
  phase?: Phase;
  enabled?: boolean;
}

interface UseRecommendationsResult {
  loading: boolean;
  recommendation: RecommendationsResult['recommendation'];
  orderedPresets: RecommendationsResult['orderedPresets'];
  presetMetrics: RecommendationsResult['presetMetrics'];
  engineMetrics: RecommendationsResult['engineMetrics'];
  refresh: () => Promise<void>;
  checkOverride: (engine: string, preset: string) => boolean;
  logShown: () => Promise<void>;
  logOverride: (engine: string, preset: string) => Promise<void>;
  logFollowed: (engine: string, preset: string) => Promise<void>;
}

export function useRecommendations({
  projectId,
  assetType,
  availablePresets,
  phase,
  enabled = true
}: UseRecommendationsOptions): UseRecommendationsResult {
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<RecommendationsResult>({
    presetMetrics: [],
    engineMetrics: [],
    engineGlobalMetrics: [],
    recommendation: null,
    orderedPresets: []
  });
  const [hasLoggedShown, setHasLoggedShown] = useState(false);

  const fetchRecommendations = useCallback(async () => {
    if (!enabled || !projectId || availablePresets.length === 0) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const data = await getRecommendations(projectId, assetType, availablePresets, phase);
      setResult(data);
    } catch (err) {
      console.error('[useRecommendations] Error:', err);
    } finally {
      setLoading(false);
    }
  }, [projectId, assetType, availablePresets, phase, enabled]);

  useEffect(() => {
    fetchRecommendations();
  }, [fetchRecommendations]);

  // Reset logged state when params change
  useEffect(() => {
    setHasLoggedShown(false);
  }, [projectId, assetType, phase]);

  const checkOverrideFunc = useCallback((engine: string, preset: string): boolean => {
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
    orderedPresets: result.orderedPresets,
    presetMetrics: result.presetMetrics,
    engineMetrics: result.engineMetrics,
    refresh: fetchRecommendations,
    checkOverride: checkOverrideFunc,
    logShown,
    logOverride,
    logFollowed
  };
}
