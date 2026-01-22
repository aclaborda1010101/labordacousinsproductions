/**
 * Hook for accessing and managing Editorial Sources
 * SIMPLIFIED: editorial_source_* tables removed. Returns empty data.
 */

import { useState, useCallback } from 'react';
import type {
  AIEngineId,
  CentralEditorialRule,
  EngineEditorialRule,
  ProjectEditorialConfig,
  EditorialDecision,
  TransformedPrompt
} from '@/lib/editorialSourcesTypes';

interface UseEditorialSourcesOptions {
  projectId?: string;
  autoLoad?: boolean;
}

interface EditorialSourcesState {
  centralRules: CentralEditorialRule[];
  engineRules: EngineEditorialRule[];
  projectConfig: ProjectEditorialConfig | null;
  isLoading: boolean;
  error: string | null;
}

export function useEditorialSources(_options: UseEditorialSourcesOptions = {}) {
  const [state] = useState<EditorialSourcesState>({
    centralRules: [],
    engineRules: [],
    projectConfig: null,
    isLoading: false,
    error: null
  });

  // No-op - tables removed
  const loadSources = useCallback(async () => {
    console.log('[useEditorialSources] editorial_source_* tables removed');
  }, []);

  // Return empty transformation
  const transformPrompt = useCallback((
    userIntent: string,
    _engineId: AIEngineId,
    _bibleConstraints?: Record<string, unknown>
  ): TransformedPrompt => {
    return {
      originalIntent: userIntent,
      transformedPrompt: userIntent,
      rulesApplied: [],
      warnings: [],
      blockers: [],
      canProceed: true
    };
  }, []);

  // Return valid output
  const validateGeneratedOutput = useCallback((
    _outputDescription: string,
    _engineId: AIEngineId,
    _bibleConstraints?: Record<string, unknown>
  ) => {
    return {
      isValid: true,
      score: 100,
      issues: [],
      passedChecks: [],
      failedChecks: []
    };
  }, []);

  // No-op logging
  const logDecision = useCallback(async (_decision: EditorialDecision) => {
    console.log('[useEditorialSources] editorial_decisions_log table removed');
  }, []);

  // Return default engine
  const getRecommended = useCallback((
    purpose: 'character_portrait' | 'location' | 'keyframe' | 'video' | 'script'
  ): AIEngineId => {
    const defaults: Record<string, AIEngineId> = {
      character_portrait: 'nano-banana',
      location: 'flux-ultra',
      keyframe: 'flux-ultra',
      video: 'kling-v2',
      script: 'claude'
    };
    return defaults[purpose] || 'lovable-ai';
  }, []);

  // No-op update
  const updateProjectConfig = useCallback(async (
    _updates: Partial<Omit<ProjectEditorialConfig, 'projectId'>>
  ) => {
    console.log('[useEditorialSources] project_editorial_config table removed');
  }, []);

  // Return empty rules
  const getEngineRules = useCallback((_engineId: AIEngineId) => {
    return [];
  }, []);

  return {
    ...state,
    loadSources,
    transformPrompt,
    validateGeneratedOutput,
    logDecision,
    getRecommendedEngine: getRecommended,
    updateProjectConfig,
    getEngineRules
  };
}
