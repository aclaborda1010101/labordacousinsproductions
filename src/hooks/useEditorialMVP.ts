/**
 * Hook para gestionar datos del Sistema Editorial MVP
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import type {
  EditorialProject,
  EditorialRule,
  ProjectBible,
  AssetCharacter,
  AssetLocation,
  ProjectRuleOverride,
  GenerationRun,
  TelemetryEventType
} from '@/lib/editorialMVPTypes';

export function useEditorialMVP(projectId?: string) {
  const { user } = useAuth();
  const [projects, setProjects] = useState<EditorialProject[]>([]);
  const [currentProject, setCurrentProject] = useState<EditorialProject | null>(null);
  const [characters, setCharacters] = useState<AssetCharacter[]>([]);
  const [locations, setLocations] = useState<AssetLocation[]>([]);
  const [bible, setBible] = useState<ProjectBible | null>(null);
  const [rules, setRules] = useState<EditorialRule[]>([]);
  const [ruleOverrides, setRuleOverrides] = useState<ProjectRuleOverride[]>([]);
  const [runs, setRuns] = useState<GenerationRun[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Cargar proyectos del usuario
  const loadProjects = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('editorial_projects')
      .select('*')
      .eq('owner_id', user.id)
      .order('updated_at', { ascending: false });
    
    if (data) {
      setProjects(data.map(p => ({
        id: p.id,
        name: p.name,
        phase: p.phase as EditorialProject['phase'],
        ownerId: p.owner_id,
        createdAt: p.created_at,
        updatedAt: p.updated_at
      })));
    }
  }, [user]);

  // Cargar proyecto específico
  const loadProject = useCallback(async (id: string) => {
    const { data } = await supabase
      .from('editorial_projects')
      .select('*')
      .eq('id', id)
      .single();
    
    if (data) {
      setCurrentProject({
        id: data.id,
        name: data.name,
        phase: data.phase as EditorialProject['phase'],
        ownerId: data.owner_id,
        createdAt: data.created_at,
        updatedAt: data.updated_at
      });
    }
  }, []);

  // Cargar personajes
  const loadCharacters = useCallback(async (projId: string) => {
    const { data } = await supabase
      .from('asset_characters')
      .select('*')
      .eq('project_id', projId)
      .order('created_at');
    
    if (data) {
      setCharacters(data.map(c => ({
        id: c.id,
        projectId: c.project_id,
        name: c.name,
        traitsText: c.traits_text,
        referenceImageUrl: c.reference_image_url || undefined,
        fixedTraits: c.fixed_traits || [],
        createdAt: c.created_at,
        updatedAt: c.updated_at
      })));
    }
  }, []);

  // Cargar locaciones
  const loadLocations = useCallback(async (projId: string) => {
    const { data } = await supabase
      .from('asset_locations')
      .select('*')
      .eq('project_id', projId)
      .order('created_at');
    
    if (data) {
      setLocations(data.map(l => ({
        id: l.id,
        projectId: l.project_id,
        name: l.name,
        traitsText: l.traits_text,
        referenceImageUrl: l.reference_image_url || undefined,
        fixedElements: l.fixed_elements || [],
        createdAt: l.created_at,
        updatedAt: l.updated_at
      })));
    }
  }, []);

  // Cargar Bible
  const loadBible = useCallback(async (projId: string) => {
    const { data } = await supabase
      .from('project_bibles')
      .select('*')
      .eq('project_id', projId)
      .maybeSingle();
    
    if (data) {
      setBible({
        id: data.id,
        projectId: data.project_id,
        tone: data.tone || undefined,
        period: data.period || undefined,
        rating: data.rating || undefined,
        facts: (data.facts as string[]) || [],
        createdAt: data.created_at,
        updatedAt: data.updated_at
      });
    } else {
      setBible(null);
    }
  }, []);

  // Cargar reglas
  const loadRules = useCallback(async () => {
    const { data } = await supabase
      .from('editorial_rules_config')
      .select('*')
      .order('rule_code');
    
    if (data) {
      setRules(data.map(r => ({
        id: r.id,
        ruleCode: r.rule_code,
        ruleType: r.rule_type as EditorialRule['ruleType'],
        name: r.name,
        description: r.description,
        appliesTo: r.applies_to || [],
        scope: r.scope || [],
        severity: r.severity as EditorialRule['severity'],
        activeDefault: r.active_default,
        toggleable: r.toggleable,
        disableReasons: r.disable_reasons || [],
        validationMethod: r.validation_method as EditorialRule['validationMethod'],
        mustInclude: r.must_include || [],
        mustAvoid: r.must_avoid || [],
        negativePromptSnippets: r.negative_prompt_snippets || [],
        actionOnFail: r.action_on_fail as EditorialRule['actionOnFail'],
        actionOnFailProduction: r.action_on_fail_production as EditorialRule['actionOnFail'] | undefined,
        userMessageTemplate: r.user_message_template,
        appliesInExploration: r.applies_in_exploration,
        appliesInProduction: r.applies_in_production
      })));
    }
  }, []);

  // Cargar overrides de reglas
  const loadRuleOverrides = useCallback(async (projId: string) => {
    const { data } = await supabase
      .from('project_rule_overrides')
      .select('*')
      .eq('project_id', projId);
    
    if (data) {
      setRuleOverrides(data.map(o => ({
        id: o.id,
        projectId: o.project_id,
        ruleId: o.rule_id,
        isActive: o.is_active,
        disableReason: o.disable_reason || undefined
      })));
    }
  }, []);

  // Cargar runs de generación
  const loadRuns = useCallback(async (projId: string) => {
    const { data } = await supabase
      .from('generation_runs')
      .select('*')
      .eq('project_id', projId)
      .order('created_at', { ascending: false })
      .limit(20);
    
    if (data) {
      setRuns(data.map(r => ({
        id: r.id,
        projectId: r.project_id,
        engine: r.engine,
        inputIntent: r.input_intent,
        context: r.context || undefined,
        usedAssetIds: r.used_asset_ids || [],
        composedPrompt: r.composed_prompt,
        negativePrompt: r.negative_prompt || undefined,
        outputUrl: r.output_url || undefined,
        outputText: r.output_text || undefined,
        verdict: r.verdict as GenerationRun['verdict'],
        triggeredRules: r.triggered_rules || [],
        warnings: (r.warnings as GenerationRun['warnings']) || [],
        suggestions: (r.suggestions as GenerationRun['suggestions']) || [],
        rulePlan: r.rule_plan as unknown as GenerationRun['rulePlan'],
        createdAt: r.created_at
      })));
    }
  }, []);

  // Crear proyecto
  const createProject = useCallback(async (name: string, phase: 'exploracion' | 'produccion' = 'exploracion') => {
    if (!user) return null;
    
    const { data, error } = await supabase
      .from('editorial_projects')
      .insert([{ name, phase, owner_id: user.id }])
      .select()
      .single();
    
    if (error) throw error;
    
    // Crear Bible vacía
    await supabase
      .from('project_bibles')
      .insert([{ project_id: data.id }]);
    
    await loadProjects();
    return data.id;
  }, [user, loadProjects]);

  // Actualizar fase del proyecto
  const updateProjectPhase = useCallback(async (phase: 'exploracion' | 'produccion') => {
    if (!currentProject) return;
    
    await supabase
      .from('editorial_projects')
      .update({ phase })
      .eq('id', currentProject.id);
    
    setCurrentProject(prev => prev ? { ...prev, phase } : null);
  }, [currentProject]);

  // Crear personaje
  const createCharacter = useCallback(async (
    name: string, 
    traitsText: string, 
    fixedTraits: string[] = [],
    referenceImageUrl?: string
  ) => {
    if (!currentProject) return;
    
    await supabase
      .from('asset_characters')
      .insert([{
        project_id: currentProject.id,
        name,
        traits_text: traitsText,
        fixed_traits: fixedTraits,
        reference_image_url: referenceImageUrl
      }]);
    
    await loadCharacters(currentProject.id);
  }, [currentProject, loadCharacters]);

  // Actualizar personaje
  const updateCharacter = useCallback(async (
    id: string,
    updates: Partial<Pick<AssetCharacter, 'name' | 'traitsText' | 'fixedTraits' | 'referenceImageUrl'>>
  ) => {
    await supabase
      .from('asset_characters')
      .update({
        name: updates.name,
        traits_text: updates.traitsText,
        fixed_traits: updates.fixedTraits,
        reference_image_url: updates.referenceImageUrl
      })
      .eq('id', id);
    
    if (currentProject) {
      await loadCharacters(currentProject.id);
    }
  }, [currentProject, loadCharacters]);

  // Eliminar personaje
  const deleteCharacter = useCallback(async (id: string) => {
    await supabase
      .from('asset_characters')
      .delete()
      .eq('id', id);
    
    if (currentProject) {
      await loadCharacters(currentProject.id);
    }
  }, [currentProject, loadCharacters]);

  // Crear locación
  const createLocation = useCallback(async (
    name: string, 
    traitsText: string, 
    fixedElements: string[] = [],
    referenceImageUrl?: string
  ) => {
    if (!currentProject) return;
    
    await supabase
      .from('asset_locations')
      .insert([{
        project_id: currentProject.id,
        name,
        traits_text: traitsText,
        fixed_elements: fixedElements,
        reference_image_url: referenceImageUrl
      }]);
    
    await loadLocations(currentProject.id);
  }, [currentProject, loadLocations]);

  // Actualizar locación
  const updateLocation = useCallback(async (
    id: string,
    updates: Partial<Pick<AssetLocation, 'name' | 'traitsText' | 'fixedElements' | 'referenceImageUrl'>>
  ) => {
    await supabase
      .from('asset_locations')
      .update({
        name: updates.name,
        traits_text: updates.traitsText,
        fixed_elements: updates.fixedElements,
        reference_image_url: updates.referenceImageUrl
      })
      .eq('id', id);
    
    if (currentProject) {
      await loadLocations(currentProject.id);
    }
  }, [currentProject, loadLocations]);

  // Eliminar locación
  const deleteLocation = useCallback(async (id: string) => {
    await supabase
      .from('asset_locations')
      .delete()
      .eq('id', id);
    
    if (currentProject) {
      await loadLocations(currentProject.id);
    }
  }, [currentProject, loadLocations]);

  // Actualizar Bible
  const updateBible = useCallback(async (
    updates: Partial<Pick<ProjectBible, 'tone' | 'period' | 'rating' | 'facts'>>
  ) => {
    if (!currentProject) return;
    
    await supabase
      .from('project_bibles')
      .upsert([{
        project_id: currentProject.id,
        tone: updates.tone,
        period: updates.period,
        rating: updates.rating,
        facts: updates.facts
      }], { onConflict: 'project_id' });
    
    await loadBible(currentProject.id);
  }, [currentProject, loadBible]);

  // Toggle regla
  const toggleRule = useCallback(async (ruleId: string, isActive: boolean, disableReason?: string) => {
    if (!currentProject) return;
    
    await supabase
      .from('project_rule_overrides')
      .upsert([{
        project_id: currentProject.id,
        rule_id: ruleId,
        is_active: isActive,
        disable_reason: disableReason
      }], { onConflict: 'project_id,rule_id' });
    
    await loadRuleOverrides(currentProject.id);
  }, [currentProject, loadRuleOverrides]);

  // Guardar run de generación
  const saveGenerationRun = useCallback(async (run: Omit<GenerationRun, 'id' | 'createdAt'>) => {
    const { data, error } = await supabase
      .from('generation_runs')
      .insert([{
        project_id: run.projectId,
        engine: run.engine,
        input_intent: run.inputIntent,
        context: run.context,
        used_asset_ids: run.usedAssetIds,
        composed_prompt: run.composedPrompt,
        negative_prompt: run.negativePrompt,
        output_url: run.outputUrl,
        output_text: run.outputText,
        verdict: run.verdict,
        triggered_rules: run.triggeredRules,
        warnings: run.warnings as unknown as Record<string, never>[],
        suggestions: run.suggestions as unknown as Record<string, never>[],
        rule_plan: run.rulePlan as unknown as Record<string, never>
      }])
      .select()
      .single();
    
    if (error) throw error;
    
    if (currentProject) {
      await loadRuns(currentProject.id);
    }
    
    return data.id;
  }, [currentProject, loadRuns]);

  // Registrar evento de telemetría
  const logTelemetry = useCallback(async (
    runId: string | undefined,
    eventType: TelemetryEventType,
    payload: Record<string, unknown> = {}
  ) => {
    if (!currentProject) return;
    
    await supabase
      .from('telemetry_events')
      .insert([{
        project_id: currentProject.id,
        run_id: runId,
        event_type: eventType,
        payload: payload as unknown as Record<string, never>
      }]);
  }, [currentProject]);

  // Cargar todo al cambiar proyecto
  useEffect(() => {
    if (projectId) {
      setIsLoading(true);
      Promise.all([
        loadProject(projectId),
        loadCharacters(projectId),
        loadLocations(projectId),
        loadBible(projectId),
        loadRules(),
        loadRuleOverrides(projectId),
        loadRuns(projectId)
      ]).finally(() => setIsLoading(false));
    }
  }, [projectId, loadProject, loadCharacters, loadLocations, loadBible, loadRules, loadRuleOverrides, loadRuns]);

  // Cargar proyectos al inicio
  useEffect(() => {
    if (user) {
      loadProjects();
      loadRules();
    }
  }, [user, loadProjects, loadRules]);

  return {
    // Estado
    projects,
    currentProject,
    characters,
    locations,
    bible,
    rules,
    ruleOverrides,
    runs,
    isLoading,
    
    // Acciones
    loadProjects,
    createProject,
    updateProjectPhase,
    createCharacter,
    updateCharacter,
    deleteCharacter,
    createLocation,
    updateLocation,
    deleteLocation,
    updateBible,
    toggleRule,
    saveGenerationRun,
    logTelemetry
  };
}
