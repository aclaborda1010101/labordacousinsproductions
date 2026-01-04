/**
 * DECISION ENGINE v1
 * Central intelligence layer for all user actions
 * 
 * Uses telemetry from generation_runs, editorial_events, and canon_assets
 * to provide smart recommendations and guardrails per action type.
 */

import { supabase } from '@/integrations/supabase/client';
import type { CreativeMode } from './modeCapabilities';
import { 
  getRecommendations, 
  type Recommendation,
  type AssetType as RecAssetType,
  type Phase,
  ENGINES 
} from './recommendations';

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

export type UserMode = 'assisted' | 'director' | 'pro' | 'dev';
export type DecisionPhase = 'exploration' | 'production';
export type DecisionAssetType = 'script_import' | 'character' | 'location' | 'keyframe';
export type ActionIntent = 'generate' | 'accept' | 'regenerate' | 'canon' | 'script_import';

export interface RiskFlags {
  cost: boolean;       // High cost potential
  canon: boolean;      // Canon drift or missing canon
  consistency: boolean; // Visual consistency risk
}

export interface DecisionPack {
  recommendedAction: ActionIntent;
  recommendedPresetId?: string;
  recommendedEngine?: string;
  riskFlags: RiskFlags;
  message: string;           // Microcopy for UI
  nextSteps: string[];       // Max 3 next step hints
  autopilotEligible: boolean;
  confidence: number;        // 0..1
  reason: string;            // Explanation for why this recommendation
  reinforceCanon: boolean;   // Should inject canon context
  suggestCanon: boolean;     // Should suggest marking canon
  switchPresetTo?: string;   // Suggest switching to this preset
  autoRetryEligible: boolean; // Can auto-retry on failure
  fallbackEngine?: string;   // Fallback engine if primary fails
}

export interface TelemetrySummary {
  acceptRate: number;           // 0..1
  regenRate: number;            // avg regenerations per accepted
  timeToAcceptMedian: number;   // seconds
  overrideRate: number;         // % recommendation_overridden events
  engineFailureRate: number;    // timeout/500/network errors
  canonCoverage: number;        // % core assets with active canon
  canonDriftProxy: number;      // regen count after canon or warnings
  totalRuns: number;
  recentFailStreak: number;     // consecutive fails in recent runs
}

export interface CanonSummary {
  character: number;
  location: number;
  keyframe: number;
  totalActive: number;
}

export interface DecisionContext {
  projectId: string;
  userMode: UserMode;
  phase: DecisionPhase;
  assetType: DecisionAssetType;
  currentRunId?: string;
  currentPresetId?: string;
  currentEngine?: string;
  entityId?: string; // character_id, location_id, etc.
}

// ─────────────────────────────────────────────────────────────
// TELEMETRY FETCHING
// ─────────────────────────────────────────────────────────────

/**
 * Fetch telemetry summary from generation_runs and editorial_events
 */
export async function getTelemetrySummary(
  projectId: string,
  assetType: DecisionAssetType
): Promise<TelemetrySummary> {
  const runType = assetType === 'script_import' ? 'script' : assetType;
  
  // Fetch recent generation runs
  const { data: runs } = await supabase
    .from('generation_runs')
    .select('id, status, preset_id, engine, parent_run_id, created_at, accepted_at, error, warnings')
    .eq('project_id', projectId)
    .eq('run_type', runType)
    .order('created_at', { ascending: false })
    .limit(100);

  // Fetch editorial events for override tracking
  const { data: events } = await supabase
    .from('editorial_events')
    .select('event_type, payload')
    .eq('project_id', projectId)
    .eq('asset_type', assetType === 'script_import' ? 'script' : assetType)
    .order('created_at', { ascending: false })
    .limit(50);

  if (!runs || runs.length === 0) {
    return {
      acceptRate: 0,
      regenRate: 1,
      timeToAcceptMedian: 0,
      overrideRate: 0,
      engineFailureRate: 0,
      canonCoverage: 0,
      canonDriftProxy: 0,
      totalRuns: 0,
      recentFailStreak: 0
    };
  }

  // Calculate accept rate
  const acceptedRuns = runs.filter(r => r.status === 'accepted');
  const acceptRate = runs.length > 0 ? acceptedRuns.length / runs.length : 0;

  // Calculate regen rate (avg chain length for accepted)
  let totalChain = 0;
  const chainMap = new Map<string, number>();
  for (const run of runs) {
    if (!run.parent_run_id) {
      chainMap.set(run.id, 1);
    }
  }
  for (const run of runs) {
    if (run.parent_run_id && chainMap.has(run.parent_run_id)) {
      chainMap.set(run.id, (chainMap.get(run.parent_run_id) || 1) + 1);
    }
  }
  for (const run of acceptedRuns) {
    totalChain += chainMap.get(run.id) || 1;
  }
  const regenRate = acceptedRuns.length > 0 ? totalChain / acceptedRuns.length : 1;

  // Calculate time to accept median
  const times = acceptedRuns
    .filter(r => r.created_at && r.accepted_at)
    .map(r => (new Date(r.accepted_at!).getTime() - new Date(r.created_at).getTime()) / 1000)
    .sort((a, b) => a - b);
  const timeToAcceptMedian = times.length > 0 ? times[Math.floor(times.length / 2)] : 0;

  // Calculate override rate from editorial_events
  const overrideEvents = events?.filter(e => e.event_type === 'recommendation_overridden') || [];
  const shownEvents = events?.filter(e => e.event_type === 'recommendation_shown') || [];
  const overrideRate = shownEvents.length > 0 ? overrideEvents.length / shownEvents.length : 0;

  // Calculate engine failure rate
  const failedRuns = runs.filter(r => r.status === 'failed' || r.error);
  const engineFailureRate = runs.length > 0 ? failedRuns.length / runs.length : 0;

  // Calculate recent fail streak
  let recentFailStreak = 0;
  for (const run of runs.slice(0, 10)) {
    if (run.status === 'failed' || run.error) {
      recentFailStreak++;
    } else if (run.status === 'accepted') {
      break;
    }
  }

  // Canon drift proxy: count warnings after canon was set
  const canonDriftProxy = runs.filter(r => 
    r.warnings && Array.isArray(r.warnings) && (r.warnings as unknown[]).length > 0
  ).length;

  return {
    acceptRate,
    regenRate,
    timeToAcceptMedian,
    overrideRate,
    engineFailureRate,
    canonCoverage: 0, // Will be calculated with canon summary
    canonDriftProxy,
    totalRuns: runs.length,
    recentFailStreak
  };
}

/**
 * Fetch canon assets summary
 */
export async function getCanonSummary(projectId: string): Promise<CanonSummary> {
  const { data: canons } = await supabase
    .from('canon_assets')
    .select('asset_type')
    .eq('project_id', projectId)
    .eq('is_active', true);

  if (!canons) {
    return { character: 0, location: 0, keyframe: 0, totalActive: 0 };
  }

  const character = canons.filter(c => c.asset_type === 'character').length;
  const location = canons.filter(c => c.asset_type === 'location').length;
  const keyframe = canons.filter(c => c.asset_type === 'keyframe').length;

  return {
    character,
    location,
    keyframe,
    totalActive: canons.length
  };
}

// ─────────────────────────────────────────────────────────────
// DECISION RULES
// ─────────────────────────────────────────────────────────────

/**
 * Get decision pack for GENERATE action
 */
function getGenerateDecision(
  telemetry: TelemetrySummary,
  canonSummary: CanonSummary,
  ctx: DecisionContext,
  recommendation: Recommendation | null
): Partial<DecisionPack> {
  const assetType = ctx.assetType === 'script_import' ? 'character' : ctx.assetType;
  const hasRelevantCanon = canonSummary[assetType as keyof Omit<CanonSummary, 'totalActive'>] > 0;
  
  const riskFlags: RiskFlags = {
    cost: ctx.phase === 'production',
    canon: !hasRelevantCanon && telemetry.totalRuns > 5,
    consistency: telemetry.regenRate > 2
  };

  // Determine message based on state
  let message = 'Generar nueva imagen';
  const nextSteps: string[] = [];

  if (hasRelevantCanon) {
    message = 'Generando con contexto canon activo';
    nextSteps.push('Canon inyectado automáticamente');
  } else if (telemetry.totalRuns > 5) {
    message = 'Considera marcar un canon para mejor consistencia';
    nextSteps.push('Marca canon tras aceptar');
  }

  if (telemetry.regenRate > 2.5) {
    nextSteps.push('Alta tasa de regeneración – considera cambiar preset');
  }

  if (ctx.phase === 'production') {
    nextSteps.push('Modo producción: mayor rigor aplicado');
  }

  // Suggest preset switch if high regen rate
  let switchPresetTo: string | undefined;
  if (telemetry.regenRate > 2.5 && recommendation?.recommendedPreset !== ctx.currentPresetId) {
    switchPresetTo = recommendation?.recommendedPreset;
  }

  return {
    recommendedAction: 'generate',
    recommendedPresetId: recommendation?.recommendedPreset,
    recommendedEngine: recommendation?.recommendedEngine,
    riskFlags,
    message,
    nextSteps: nextSteps.slice(0, 3),
    reinforceCanon: hasRelevantCanon,
    suggestCanon: false,
    switchPresetTo,
    autoRetryEligible: telemetry.engineFailureRate > 0.1,
    fallbackEngine: telemetry.engineFailureRate > 0.2 ? ENGINES.FLUX : undefined
  };
}

/**
 * Get decision pack for ACCEPT action
 */
function getAcceptDecision(
  telemetry: TelemetrySummary,
  canonSummary: CanonSummary,
  ctx: DecisionContext
): Partial<DecisionPack> {
  const assetType = ctx.assetType === 'script_import' ? 'character' : ctx.assetType;
  const hasRelevantCanon = canonSummary[assetType as keyof Omit<CanonSummary, 'totalActive'>] > 0;
  
  const riskFlags: RiskFlags = {
    cost: false,
    canon: !hasRelevantCanon,
    consistency: false
  };

  let message = 'Aceptar resultado';
  const nextSteps: string[] = [];

  // Suggest marking as canon if no canon exists for this type
  const suggestCanon = !hasRelevantCanon;
  if (suggestCanon) {
    message = 'Aceptar y considera marcar como canon';
    nextSteps.push('Marcar como referencia canon ⭐');
  } else {
    nextSteps.push('Continuar con siguiente asset');
  }

  return {
    recommendedAction: 'accept',
    riskFlags,
    message,
    nextSteps: nextSteps.slice(0, 3),
    reinforceCanon: false,
    suggestCanon,
    autoRetryEligible: false
  };
}

/**
 * Get decision pack for REGENERATE action
 */
function getRegenerateDecision(
  telemetry: TelemetrySummary,
  canonSummary: CanonSummary,
  ctx: DecisionContext,
  recommendation: Recommendation | null,
  chainLength: number
): Partial<DecisionPack> {
  const assetType = ctx.assetType === 'script_import' ? 'character' : ctx.assetType;
  const hasRelevantCanon = canonSummary[assetType as keyof Omit<CanonSummary, 'totalActive'>] > 0;
  
  const riskFlags: RiskFlags = {
    cost: chainLength > 3,
    canon: hasRelevantCanon && chainLength > 2, // Canon drift risk
    consistency: chainLength > 2
  };

  let message = 'Regenerar imagen';
  const nextSteps: string[] = [];

  // Strong preset change suggestion after 2+ regenerations
  let switchPresetTo: string | undefined;
  if (chainLength >= 2 && recommendation?.recommendedPreset !== ctx.currentPresetId) {
    switchPresetTo = recommendation?.recommendedPreset;
    message = `Considera cambiar a preset "${switchPresetTo}"`;
    nextSteps.push(`Preset "${switchPresetTo}" tiene mejor aceptación`);
  }

  // Canon drift warning
  if (hasRelevantCanon && chainLength >= 2) {
    message = 'Activar refuerzo de canon estricto';
    nextSteps.push('Canon estricto inyectado');
  }

  // Auto-retry on technical error
  const autoRetryEligible = telemetry.recentFailStreak > 0;
  const fallbackEngine = telemetry.engineFailureRate > 0.3 ? 
    (ctx.currentEngine === ENGINES.NANO_BANANA ? ENGINES.FLUX : ENGINES.NANO_BANANA) : 
    undefined;

  if (autoRetryEligible) {
    nextSteps.push('Auto-retry disponible si falla');
  }

  return {
    recommendedAction: 'regenerate',
    recommendedPresetId: switchPresetTo || recommendation?.recommendedPreset,
    recommendedEngine: fallbackEngine || recommendation?.recommendedEngine,
    riskFlags,
    message,
    nextSteps: nextSteps.slice(0, 3),
    reinforceCanon: hasRelevantCanon && chainLength >= 2,
    suggestCanon: false,
    switchPresetTo,
    autoRetryEligible,
    fallbackEngine
  };
}

/**
 * Get decision pack for CANON action
 */
function getCanonDecision(
  telemetry: TelemetrySummary,
  canonSummary: CanonSummary,
  ctx: DecisionContext
): Partial<DecisionPack> {
  const assetType = ctx.assetType === 'script_import' ? 'character' : ctx.assetType;
  const existingCanon = canonSummary[assetType as keyof Omit<CanonSummary, 'totalActive'>];
  
  const riskFlags: RiskFlags = {
    cost: false,
    canon: existingCanon > 0, // Will replace existing
    consistency: false
  };

  let message = 'Marcar como referencia canon';
  const nextSteps: string[] = [];

  if (existingCanon > 0) {
    message = 'Reemplazará canon actual';
    nextSteps.push('Canon anterior se desactivará');
  }

  nextSteps.push('Futuras generaciones usarán este canon');
  nextSteps.push('Mayor consistencia visual garantizada');

  return {
    recommendedAction: 'canon',
    riskFlags,
    message,
    nextSteps: nextSteps.slice(0, 3),
    reinforceCanon: false,
    suggestCanon: false,
    autoRetryEligible: false
  };
}

/**
 * Get decision pack for SCRIPT_IMPORT action
 */
function getScriptImportDecision(
  ctx: DecisionContext
): Partial<DecisionPack> {
  const riskFlags: RiskFlags = {
    cost: false,
    canon: false,
    consistency: false
  };

  return {
    recommendedAction: 'script_import',
    riskFlags,
    message: 'Importar y analizar guion',
    nextSteps: [
      'Extracción de personajes, localizaciones, props',
      'Campos ambiguos marcados como "no especificado"',
      'Revisión manual recomendada'
    ],
    reinforceCanon: false,
    suggestCanon: false,
    autoRetryEligible: false
  };
}

// ─────────────────────────────────────────────────────────────
// MAIN API
// ─────────────────────────────────────────────────────────────

/**
 * Get complete decision pack for a given context and action intent
 */
export async function getDecisionPack(
  ctx: DecisionContext,
  actionIntent: ActionIntent,
  chainLength: number = 1
): Promise<DecisionPack> {
  // Fetch telemetry and canon data in parallel
  const [telemetry, canonSummary] = await Promise.all([
    getTelemetrySummary(ctx.projectId, ctx.assetType),
    getCanonSummary(ctx.projectId)
  ]);

  // Update canon coverage in telemetry
  const totalCoreAssets = await getCoreAssetCount(ctx.projectId);
  telemetry.canonCoverage = totalCoreAssets > 0 ? canonSummary.totalActive / totalCoreAssets : 0;

  // Get recommendation from existing system (reuse, don't duplicate)
  let recommendation: Recommendation | null = null;
  if (ctx.assetType !== 'script_import') {
    const recAssetType = ctx.assetType as RecAssetType;
    const phase = ctx.phase as Phase;
    const presets = getPresetsForAssetType(ctx.assetType);
    const result = await getRecommendations(ctx.projectId, recAssetType, presets, phase);
    recommendation = result.recommendation;
  }

  // Calculate autopilot eligibility
  const autopilotEligible = 
    telemetry.totalRuns >= 10 && 
    telemetry.regenRate <= 1.3 &&
    (recommendation?.confidence === 'high' || recommendation?.confidence === 'medium');

  // Calculate overall confidence
  let confidence = 0.5;
  if (recommendation) {
    confidence = recommendation.confidence === 'high' ? 0.9 : 
                 recommendation.confidence === 'medium' ? 0.7 : 0.5;
  }
  if (telemetry.totalRuns < 5) confidence *= 0.7;
  if (telemetry.engineFailureRate > 0.2) confidence *= 0.8;

  // Get action-specific decision
  let actionDecision: Partial<DecisionPack>;
  switch (actionIntent) {
    case 'generate':
      actionDecision = getGenerateDecision(telemetry, canonSummary, ctx, recommendation);
      break;
    case 'accept':
      actionDecision = getAcceptDecision(telemetry, canonSummary, ctx);
      break;
    case 'regenerate':
      actionDecision = getRegenerateDecision(telemetry, canonSummary, ctx, recommendation, chainLength);
      break;
    case 'canon':
      actionDecision = getCanonDecision(telemetry, canonSummary, ctx);
      break;
    case 'script_import':
      actionDecision = getScriptImportDecision(ctx);
      break;
    default:
      actionDecision = getGenerateDecision(telemetry, canonSummary, ctx, recommendation);
  }

  // Build reason string
  const reasons: string[] = [];
  if (recommendation) {
    reasons.push(`Basado en ${telemetry.totalRuns} runs`);
    reasons.push(`Aceptación ${Math.round(telemetry.acceptRate * 100)}%`);
  }
  if (telemetry.regenRate > 2) {
    reasons.push('Alta tasa de regeneración');
  }
  if (canonSummary.totalActive > 0) {
    reasons.push(`${canonSummary.totalActive} canon activos`);
  }

  return {
    recommendedAction: actionIntent,
    recommendedPresetId: actionDecision.recommendedPresetId || recommendation?.recommendedPreset,
    recommendedEngine: actionDecision.recommendedEngine || recommendation?.recommendedEngine,
    riskFlags: actionDecision.riskFlags || { cost: false, canon: false, consistency: false },
    message: actionDecision.message || '',
    nextSteps: actionDecision.nextSteps || [],
    autopilotEligible,
    confidence,
    reason: reasons.join(' | ') || 'Sin datos suficientes',
    reinforceCanon: actionDecision.reinforceCanon || false,
    suggestCanon: actionDecision.suggestCanon || false,
    switchPresetTo: actionDecision.switchPresetTo,
    autoRetryEligible: actionDecision.autoRetryEligible || false,
    fallbackEngine: actionDecision.fallbackEngine
  };
}

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

/**
 * Get available presets for an asset type
 */
function getPresetsForAssetType(assetType: DecisionAssetType): string[] {
  switch (assetType) {
    case 'character':
      return ['frontal', 'profile', 'fullbody', '3/4'];
    case 'location':
      return ['establishing', 'interior', 'detail', 'wide', '3/4'];
    case 'keyframe':
      return ['wide', 'medium', 'closeup', 'establishing'];
    default:
      return [];
  }
}

/**
 * Get total core asset count for canon coverage calculation
 */
async function getCoreAssetCount(projectId: string): Promise<number> {
  const [{ count: charCount }, { count: locCount }] = await Promise.all([
    supabase.from('characters').select('*', { count: 'exact', head: true }).eq('project_id', projectId),
    supabase.from('locations').select('*', { count: 'exact', head: true }).eq('project_id', projectId)
  ]);
  return (charCount || 0) + (locCount || 0);
}

/**
 * Log decision engine event to editorial_events
 */
export async function logDecisionEvent(
  projectId: string,
  assetType: DecisionAssetType,
  eventType: 'decision_shown' | 'decision_followed' | 'decision_overridden',
  decisionPack: DecisionPack,
  userChoice?: {
    chosenEngine?: string;
    chosenPreset?: string;
    chosenAction?: ActionIntent;
  }
): Promise<void> {
  try {
    await supabase.from('editorial_events').insert([{
      project_id: projectId,
      asset_type: assetType === 'script_import' ? 'script' : assetType,
      event_type: eventType,
      payload: {
        recommendedAction: decisionPack.recommendedAction,
        recommendedEngine: decisionPack.recommendedEngine,
        recommendedPreset: decisionPack.recommendedPresetId,
        confidence: decisionPack.confidence,
        autopilotEligible: decisionPack.autopilotEligible,
        riskFlags: decisionPack.riskFlags,
        reinforceCanon: decisionPack.reinforceCanon,
        ...userChoice
      }
    }] as any);
  } catch (err) {
    console.error('[DecisionEngine] Error logging event:', err);
  }
}

/**
 * Convert creative mode to user mode
 */
export function creativeModeToUserMode(mode: CreativeMode): UserMode {
  switch (mode) {
    case 'ASSISTED': return 'assisted';
    case 'DIRECTOR': return 'director';
    case 'PRO': return 'pro';
    default: return 'assisted';
  }
}
