/**
 * Hook for accessing and managing Editorial Sources
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import type {
  AIEngineId,
  CentralEditorialRule,
  EngineEditorialRule,
  ProjectEditorialConfig,
  EditorialDecision,
  HierarchyContext,
  TransformedPrompt
} from '@/lib/editorialSourcesTypes';
import { transformPromptForEngine, validateOutput, getRecommendedEngine } from '@/lib/editorialEngine';

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

export function useEditorialSources(options: UseEditorialSourcesOptions = {}) {
  const { projectId, autoLoad = true } = options;
  const { user } = useAuth();
  
  const [state, setState] = useState<EditorialSourcesState>({
    centralRules: [],
    engineRules: [],
    projectConfig: null,
    isLoading: false,
    error: null
  });

  // Load central rules
  const loadCentralRules = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('editorial_source_central')
        .select('*')
        .eq('is_active', true)
        .order('priority', { ascending: false });

      if (error) throw error;

      const rules: CentralEditorialRule[] = (data || []).map(row => ({
        id: row.id,
        category: row.category as CentralEditorialRule['category'],
        ruleKey: row.rule_key,
        ruleName: row.rule_name,
        description: row.description,
        priority: row.priority,
        isActive: row.is_active,
        enforcementLevel: row.enforcement_level as CentralEditorialRule['enforcementLevel']
      }));

      return rules;
    } catch (err) {
      console.error('Error loading central rules:', err);
      return [];
    }
  }, []);

  // Load engine rules
  const loadEngineRules = useCallback(async (engineId?: AIEngineId) => {
    try {
      let query = supabase
        .from('editorial_source_engines')
        .select('*')
        .eq('is_active', true)
        .order('priority', { ascending: false });

      if (engineId) {
        query = query.eq('engine_id', engineId);
      }

      const { data, error } = await query;

      if (error) throw error;

      const rules: EngineEditorialRule[] = (data || []).map(row => ({
        id: row.id,
        engineId: row.engine_id as AIEngineId,
        engineDisplayName: row.engine_display_name,
        category: row.category as EngineEditorialRule['category'],
        ruleKey: row.rule_key,
        ruleName: row.rule_name,
        description: row.description,
        promptModification: row.prompt_modification || undefined,
        negativePatterns: row.negative_patterns || undefined,
        validationChecks: row.validation_checks as Record<string, unknown> || undefined,
        priority: row.priority,
        isActive: row.is_active
      }));

      return rules;
    } catch (err) {
      console.error('Error loading engine rules:', err);
      return [];
    }
  }, []);

  // Load project config
  const loadProjectConfig = useCallback(async (projId: string) => {
    try {
      const { data, error } = await supabase
        .from('project_editorial_config')
        .select('*')
        .eq('project_id', projId)
        .maybeSingle();

      if (error) throw error;

      if (!data) return null;

      const config: ProjectEditorialConfig = {
        projectId: data.project_id,
        centralRuleOverrides: (data.central_rule_overrides as unknown as Record<string, { active?: boolean; priority?: number }>) || {},
        engineRuleOverrides: (data.engine_rule_overrides as unknown as Record<string, Record<string, { active?: boolean }>>) || {},
        customCentralRules: (data.custom_central_rules as unknown as CentralEditorialRule[]) || [],
        customEngineRules: (data.custom_engine_rules as unknown as Record<string, EngineEditorialRule[]>) || {},
        preferredEngines: (data.preferred_engines as unknown as Record<string, AIEngineId>) || {}
      };

      return config;
    } catch (err) {
      console.error('Error loading project config:', err);
      return null;
    }
  }, []);

  // Load all sources
  const loadSources = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const [centralRules, engineRules] = await Promise.all([
        loadCentralRules(),
        loadEngineRules()
      ]);

      let projectConfig: ProjectEditorialConfig | null = null;
      if (projectId) {
        projectConfig = await loadProjectConfig(projectId);
      }

      setState({
        centralRules,
        engineRules,
        projectConfig,
        isLoading: false,
        error: null
      });
    } catch (err) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: err instanceof Error ? err.message : 'Error loading editorial sources'
      }));
    }
  }, [loadCentralRules, loadEngineRules, loadProjectConfig, projectId]);

  // Auto-load on mount
  useEffect(() => {
    if (autoLoad && user) {
      loadSources();
    }
  }, [autoLoad, user, loadSources]);

  // Transform prompt for engine
  const transformPrompt = useCallback((
    userIntent: string,
    engineId: AIEngineId,
    bibleConstraints?: Record<string, unknown>
  ): TransformedPrompt => {
    const context: HierarchyContext = {
      centralRules: state.centralRules,
      engineRules: state.engineRules.filter(r => r.engineId === engineId),
      bibleConstraints,
      userIntent
    };

    return transformPromptForEngine(userIntent, engineId, context, state.projectConfig || undefined);
  }, [state.centralRules, state.engineRules, state.projectConfig]);

  // Validate output
  const validateGeneratedOutput = useCallback((
    outputDescription: string,
    engineId: AIEngineId,
    bibleConstraints?: Record<string, unknown>
  ) => {
    const context: HierarchyContext = {
      centralRules: state.centralRules,
      engineRules: state.engineRules.filter(r => r.engineId === engineId),
      bibleConstraints,
      userIntent: ''
    };

    return validateOutput(outputDescription, engineId, context);
  }, [state.centralRules, state.engineRules]);

  // Log editorial decision
  const logDecision = useCallback(async (decision: EditorialDecision) => {
    if (!user) return;

    try {
      await supabase.from('editorial_decisions_log').insert([{
        project_id: decision.projectId,
        engine_id: decision.engineId,
        decision_type: decision.decisionType,
        original_intent: decision.originalIntent,
        modified_prompt: decision.modifiedPrompt,
        rules_applied: decision.rulesApplied,
        outcome: decision.outcome,
        user_action: decision.userAction,
        metadata: decision.metadata as unknown as Record<string, never>
      }]);
    } catch (err) {
      console.error('Error logging editorial decision:', err);
    }
  }, [user]);

  // Get recommended engine
  const getRecommended = useCallback((
    purpose: 'character_portrait' | 'location' | 'keyframe' | 'video' | 'script'
  ): AIEngineId => {
    return getRecommendedEngine(purpose, state.projectConfig || undefined);
  }, [state.projectConfig]);

  // Update project config
  const updateProjectConfig = useCallback(async (
    updates: Partial<Omit<ProjectEditorialConfig, 'projectId'>>
  ) => {
    if (!projectId) return;

    try {
      const { error } = await supabase
        .from('project_editorial_config')
        .upsert([{
          project_id: projectId,
          central_rule_overrides: updates.centralRuleOverrides as unknown as Record<string, never>,
          engine_rule_overrides: updates.engineRuleOverrides as unknown as Record<string, never>,
          custom_central_rules: updates.customCentralRules as unknown as Record<string, never>[],
          custom_engine_rules: updates.customEngineRules as unknown as Record<string, never>,
          preferred_engines: updates.preferredEngines as unknown as Record<string, never>,
          updated_at: new Date().toISOString()
        }], { onConflict: 'project_id' });

      if (error) throw error;

      // Reload config
      const newConfig = await loadProjectConfig(projectId);
      setState(prev => ({ ...prev, projectConfig: newConfig }));
    } catch (err) {
      console.error('Error updating project config:', err);
    }
  }, [projectId, loadProjectConfig]);

  // Get rules for specific engine
  const getEngineRules = useCallback((engineId: AIEngineId) => {
    return state.engineRules.filter(r => r.engineId === engineId);
  }, [state.engineRules]);

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
