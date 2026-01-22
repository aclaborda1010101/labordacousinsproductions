/**
 * DECISION ENGINE v1.1
 * Central intelligence layer for all user actions
 * 
 * PRIORITIES (hard-coded):
 * #1 CERO INVENCIONES - Script import uses evidence-required extraction
 * #2 CONSISTENCIA - Canon drift detection + strict mode enforcement
 * #3 COSTE - Cost optimization only when #1 and #2 are satisfied
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

export type UserMode = 'assisted' | 'pro' | 'dev';
export type DecisionPhase = 'exploration' | 'production';
export type DecisionAssetType = 'script_import' | 'character' | 'location' | 'keyframe' | 'video' | 'scene' | 'shot';
export type ActionIntent = 'generate' | 'accept' | 'regenerate' | 'canon' | 'script_import' | 'reinforce_canon_and_regenerate';
export type BudgetMode = 'normal' | 'saver';
export type OutputType = 'image' | 'video' | 'text';

/**
 * PRIORITY ORDER (hard-coded):
 * #1 invention  - NEVER invent content (script import)
 * #2 canon      - Canon drift protection
 * #2 consistency - Visual consistency
 * #3 cost       - Cost optimization (only when #1 and #2 are satisfied)
 */
export interface RiskFlags {
  invention: boolean;   // Priority #1: Risk of AI inventing content
  canon: boolean;       // Priority #2: Canon drift or missing canon
  consistency: boolean; // Priority #2: Visual consistency risk
  cost: boolean;        // Priority #3: High cost potential
}

export interface DecisionPack {
  decisionId: string;            // Deterministic ID for correlation
  recommendedAction: ActionIntent;
  recommendedPresetId?: string;
  recommendedEngine?: string;
  riskFlags: RiskFlags;
  message: string;               // Microcopy for UI
  nextSteps: string[];           // Max 3 next step hints
  autopilotEligible: boolean;
  confidence: number;            // 0..1
  confidenceLabel: 'high' | 'medium' | 'low' | 'few_data' | 'friction';
  reason: string;                // Explanation for why this recommendation
  reinforceCanon: boolean;       // Should inject canon context
  suggestCanon: boolean;         // Should suggest marking canon
  switchPresetTo?: string;       // Suggest switching to this preset
  autoRetryEligible: boolean;    // Can auto-retry on failure
  fallbackEngine?: string;       // Fallback engine if primary fails
  estimatedCost?: number;        // Rough cost estimate in USD
  costWarning?: string;          // Warning message if cost is high
  chainLength: number;           // Current chain length for safety limits
  chainLimitReached: boolean;    // True if chain limit reached (image=3, video=2)
}

export interface TelemetrySummary {
  acceptRate: number;           // 0..1
  regenRate: number;            // avg regenerations per accepted
  regenRateLast6: number;       // regen rate in last 6 runs for entity
  timeToAcceptMedian: number;   // seconds
  overrideRate: number;         // % recommendation_overridden events
  engineFailureRate: number;    // timeout/500/network errors
  costPressure: number;         // 0..1 relative cost usage
  canonCoverage: number;        // % core assets with active canon
  canonDriftProxy: number;      // regen count after canon or warnings
  canonDriftHigh: boolean;      // true if drift >= 0.5 in last 6 or >= 2 post-canon regens
  totalRuns: number;
  recentFailStreak: number;     // consecutive fails in recent runs
  consecutiveFailures: number;  // 2+ triggers fallback
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
  outputType?: OutputType;
  budgetMode?: BudgetMode;
  currentRunId?: string;
  currentPresetId?: string;
  currentEngine?: string;
  entityId?: string; // character_id, location_id, etc.
  chainLength?: number;
}

/**
 * Evidence-required entity for script import (v1.1)
 */
export interface ExtractedEntity {
  name: string;
  type: 'character' | 'location' | 'scene' | 'prop';
  evidence: string[];       // Snippets from source text
  confidence: number;       // 0..1
  uncertain: boolean;       // True if evidence empty or ambiguous
}

// ─────────────────────────────────────────────────────────────
// CHAIN SAFETY LIMITS
// ─────────────────────────────────────────────────────────────

const CHAIN_LIMITS: Record<OutputType, number> = {
  image: 3,
  video: 2,
  text: 5
};

// ─────────────────────────────────────────────────────────────
// COST ESTIMATES (USD per generation)
// ─────────────────────────────────────────────────────────────

const ENGINE_COSTS: Record<string, number> = {
  'nano-banana': 0.02,
  'nano-banana-pro': 0.02,
  'fal-ai/nano-banana-pro': 0.02,
  'flux-pro': 0.05,
  'flux-1.1-pro-ultra': 0.08,
  'fal-ai/flux-pro/v1.1-ultra': 0.08,
  'kling': 0.15,
  'veo': 0.20,
  'claude-sonnet': 0.03,
  'gpt-4o-mini': 0.01,
  'gpt-4o': 0.02,
};

function estimateCost(engine?: string, preset?: string): number {
  const baseCost = ENGINE_COSTS[engine || 'nano-banana'] || 0.02;
  const multiplier = preset === 'ultra' ? 1.5 : preset === 'quality' ? 1.2 : 1.0;
  return baseCost * multiplier;
}

/**
 * Generate deterministic decision ID for correlation
 */
function generateDecisionId(ctx: DecisionContext, action: ActionIntent, recPreset?: string, recEngine?: string): string {
  const input = `${ctx.projectId}|${ctx.entityId || 'no-entity'}|${action}|${recPreset || ''}|${recEngine || ''}|${ctx.phase}`;
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `dec_${Math.abs(hash).toString(36)}`;
}

// ─────────────────────────────────────────────────────────────
// TELEMETRY FETCHING
// ─────────────────────────────────────────────────────────────

/**
 * Fetch telemetry summary from generation_runs and editorial_events
 */
export async function getTelemetrySummary(
  projectId: string,
  assetType: DecisionAssetType,
  entityId?: string
): Promise<TelemetrySummary> {
  const runType = assetType === 'script_import' ? 'script' : assetType;
  
  // Fetch recent generation runs
  let runsQuery = supabase
    .from('generation_runs')
    .select('id, status, preset_id, engine, parent_run_id, created_at, accepted_at, error, warnings')
    .eq('project_id', projectId)
    .eq('run_type', runType)
    .order('created_at', { ascending: false })
    .limit(100);

  const { data: runs } = await runsQuery;

  // editorial_events table removed - use empty data
  const events: Array<{ event_type: string; payload: unknown }> = [];

  if (!runs || runs.length === 0) {
    return {
      acceptRate: 0,
      regenRate: 1,
      regenRateLast6: 0,
      timeToAcceptMedian: 0,
      overrideRate: 0,
      engineFailureRate: 0,
      costPressure: 0,
      canonCoverage: 0,
      canonDriftProxy: 0,
      canonDriftHigh: false,
      totalRuns: 0,
      recentFailStreak: 0,
      consecutiveFailures: 0
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

  // Calculate regen rate in last 6 runs (for canon drift detection)
  const last6Runs = runs.slice(0, 6);
  const last6Accepted = last6Runs.filter(r => r.status === 'accepted');
  const last6Chain = last6Accepted.reduce((acc, r) => acc + (chainMap.get(r.id) || 1), 0);
  const regenRateLast6 = last6Accepted.length > 0 ? last6Chain / last6Accepted.length : 0;

  // Calculate time to accept median
  const times = acceptedRuns
    .filter(r => r.created_at && r.accepted_at)
    .map(r => (new Date(r.accepted_at!).getTime() - new Date(r.created_at).getTime()) / 1000)
    .sort((a, b) => a - b);
  const timeToAcceptMedian = times.length > 0 ? times[Math.floor(times.length / 2)] : 0;

  // Calculate override rate from editorial_events
  const overrideEvents = events?.filter(e => 
    e.event_type === 'recommendation_overridden' || 
    e.event_type === 'decision_overridden'
  ) || [];
  const shownEvents = events?.filter(e => 
    e.event_type === 'recommendation_shown' || 
    e.event_type === 'decision_shown'
  ) || [];
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

  // Calculate consecutive failures (for fallback trigger)
  let consecutiveFailures = 0;
  for (const run of runs.slice(0, 5)) {
    if (run.status === 'failed' || run.error) {
      consecutiveFailures++;
    } else {
      break;
    }
  }

  // Canon drift proxy: count warnings after canon was set
  const canonDriftProxy = runs.filter(r => 
    r.warnings && Array.isArray(r.warnings) && (r.warnings as unknown[]).length > 0
  ).length;

  // Canon drift high: if regenRate >= 0.5 in last 6 OR >= 2 post-canon regenerations
  const canonDriftHigh = regenRateLast6 >= 0.5 || canonDriftProxy >= 2;

  // Cost pressure: ratio of expensive engine usage
  const expensiveEngines = ['flux-1.1-pro-ultra', 'fal-ai/flux-pro/v1.1-ultra', 'veo', 'kling'];
  const expensiveRuns = runs.filter(r => expensiveEngines.includes(r.engine || '')).length;
  const costPressure = runs.length > 0 ? expensiveRuns / runs.length : 0;

  return {
    acceptRate,
    regenRate,
    regenRateLast6,
    timeToAcceptMedian,
    overrideRate,
    engineFailureRate,
    costPressure,
    canonCoverage: 0, // Will be calculated with canon summary
    canonDriftProxy,
    canonDriftHigh,
    totalRuns: runs.length,
    recentFailStreak,
    consecutiveFailures
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
    invention: false, // Generate never invents
    cost: ctx.phase === 'production',
    canon: !hasRelevantCanon && telemetry.totalRuns > 5,
    consistency: telemetry.regenRate > 2 || telemetry.canonDriftHigh
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
    invention: false,
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
  const outputType = ctx.outputType || 'image';
  const chainLimit = CHAIN_LIMITS[outputType];
  const chainLimitReached = chainLength >= chainLimit;
  
  const riskFlags: RiskFlags = {
    invention: false,
    cost: chainLength > 3,
    canon: hasRelevantCanon && (chainLength > 2 || telemetry.canonDriftHigh),
    consistency: chainLength > 2 || telemetry.canonDriftHigh
  };

  let message = 'Regenerar imagen';
  const nextSteps: string[] = [];
  let recommendedAction: ActionIntent = 'regenerate';

  // Strong preset change suggestion after 2+ regenerations
  let switchPresetTo: string | undefined;
  if (chainLength >= 2 && recommendation?.recommendedPreset !== ctx.currentPresetId) {
    switchPresetTo = recommendation?.recommendedPreset;
    message = `Considera cambiar a preset "${switchPresetTo}"`;
    nextSteps.push(`Preset "${switchPresetTo}" tiene mejor aceptación`);
  }

  // Canon drift detection - trigger reinforce mode
  if (telemetry.canonDriftHigh || (hasRelevantCanon && chainLength >= 2)) {
    recommendedAction = 'reinforce_canon_and_regenerate';
    message = 'Estoy detectando deriva respecto al canon. Recomiendo reforzarlo y regenerar en modo estricto.';
    nextSteps.length = 0;
    nextSteps.push('Canon estricto inyectado');
    nextSteps.push('Preset más estable aplicado');
  }

  // Chain limit reached
  if (chainLimitReached) {
    message = `Hemos intentado ${chainLength} veces. Para mejorar resultados: cambia preset o refuerza canon.`;
    nextSteps.length = 0;
    nextSteps.push('Cambiar preset');
    if (!hasRelevantCanon) {
      nextSteps.push('Marcar canon');
    }
    nextSteps.push('Editar brief / añadir detalles');
  }

  // Auto-retry on technical error
  const autoRetryEligible = telemetry.recentFailStreak > 0 && !chainLimitReached;
  const fallbackEngine = (telemetry.engineFailureRate > 0.25 || telemetry.consecutiveFailures >= 2) ? 
    (ctx.currentEngine === ENGINES.NANO_BANANA ? ENGINES.FLUX : ENGINES.NANO_BANANA) : 
    undefined;

  if (autoRetryEligible) {
    nextSteps.push('Auto-retry disponible si falla');
  }

  return {
    recommendedAction,
    recommendedPresetId: switchPresetTo || recommendation?.recommendedPreset,
    recommendedEngine: fallbackEngine || recommendation?.recommendedEngine,
    riskFlags,
    message,
    nextSteps: nextSteps.slice(0, 3),
    reinforceCanon: hasRelevantCanon && (chainLength >= 2 || telemetry.canonDriftHigh),
    suggestCanon: false,
    switchPresetTo,
    autoRetryEligible,
    fallbackEngine,
    chainLimitReached
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
    invention: false,
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
 * Get decision pack for SCRIPT_IMPORT action (v1.1 - Evidence Required)
 */
function getScriptImportDecision(
  ctx: DecisionContext
): Partial<DecisionPack> {
  // Priority #1: INVENTION RISK - Script import is the highest risk for AI hallucination
  const riskFlags: RiskFlags = {
    invention: true, // Always flag as risk - extraction must be strictly analytical
    cost: false,
    canon: false,
    consistency: false
  };

  return {
    recommendedAction: 'script_import',
    riskFlags,
    message: 'Extracción analítica – SOLO contenido explícito del guion',
    nextSteps: [
      'Solo personajes/localizaciones con EVIDENCIA en texto',
      'Sin evidencia → "INCIERTO" (no confirmado)',
      'Revisión manual obligatoria antes de confirmar'
    ],
    reinforceCanon: false,
    suggestCanon: false,
    autoRetryEligible: false,
    // Script import should never be autopiloted
    autopilotEligible: false
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
    getTelemetrySummary(ctx.projectId, ctx.assetType, ctx.entityId),
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

  // Calculate autopilot eligibility with chain safety limits
  const outputType = ctx.outputType || 'image';
  const chainLimit = CHAIN_LIMITS[outputType];
  const chainLimitReached = chainLength >= chainLimit;
  
  const autopilotEligible = 
    telemetry.totalRuns >= 10 && 
    telemetry.regenRate <= 1.3 &&
    (recommendation?.confidence === 'high' || recommendation?.confidence === 'medium') &&
    !chainLimitReached;

  // Calculate overall confidence with labels
  let confidence = 0.5;
  let confidenceLabel: 'high' | 'medium' | 'low' | 'few_data' | 'friction' = 'medium';
  
  if (telemetry.totalRuns < 10) {
    confidenceLabel = 'few_data';
    confidence = 0.4;
  } else if (telemetry.regenRate > 2 || telemetry.overrideRate > 0.3) {
    confidenceLabel = 'friction';
    confidence = 0.5;
  } else if (recommendation) {
    confidence = recommendation.confidence === 'high' ? 0.9 : 
                 recommendation.confidence === 'medium' ? 0.7 : 0.5;
    confidenceLabel = recommendation.confidence === 'high' ? 'high' : 
                      recommendation.confidence === 'medium' ? 'medium' : 'low';
  }
  
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
    case 'reinforce_canon_and_regenerate':
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
  if (telemetry.canonDriftHigh) {
    reasons.push('Deriva de canon detectada');
  }
  if (canonSummary.totalActive > 0) {
    reasons.push(`${canonSummary.totalActive} canon activos`);
  }

  // Calculate estimated cost
  const recEngine = actionDecision.recommendedEngine || recommendation?.recommendedEngine || ctx.currentEngine;
  const recPreset = actionDecision.recommendedPresetId || recommendation?.recommendedPreset || ctx.currentPresetId;
  const estCost = estimateCost(recEngine, recPreset);
  
  // Cost warning threshold
  const costWarning = estCost > 0.1 ? `Coste estimado: $${estCost.toFixed(2)}` : undefined;

  // Default risk flags with invention field
  const defaultRiskFlags: RiskFlags = { invention: false, cost: false, canon: false, consistency: false };
  const finalRiskFlags = actionDecision.riskFlags || defaultRiskFlags;

  // Autopilot soft: never auto for script_import or canon, never when cost is high
  // Also respect chain limits
  const softAutopilot = autopilotEligible && 
    actionIntent !== 'script_import' && 
    actionIntent !== 'canon' &&
    estCost <= 0.1 &&
    !chainLimitReached;

  // Generate decision ID for correlation
  const decisionId = generateDecisionId(ctx, actionIntent, recPreset, recEngine);

  return {
    decisionId,
    recommendedAction: actionDecision.recommendedAction || actionIntent,
    recommendedPresetId: actionDecision.recommendedPresetId || recommendation?.recommendedPreset,
    recommendedEngine: actionDecision.recommendedEngine || recommendation?.recommendedEngine,
    riskFlags: finalRiskFlags,
    message: actionDecision.message || '',
    nextSteps: actionDecision.nextSteps || [],
    autopilotEligible: actionDecision.autopilotEligible ?? softAutopilot,
    confidence,
    confidenceLabel,
    reason: reasons.join(' | ') || 'Sin datos suficientes',
    reinforceCanon: actionDecision.reinforceCanon || false,
    suggestCanon: actionDecision.suggestCanon || false,
    switchPresetTo: actionDecision.switchPresetTo,
    autoRetryEligible: actionDecision.autoRetryEligible || false,
    fallbackEngine: actionDecision.fallbackEngine,
    estimatedCost: estCost,
    costWarning,
    chainLength,
    chainLimitReached: actionDecision.chainLimitReached || chainLimitReached
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
 * Decision event types for logging (v1.1)
 */
export type DecisionEventType = 
  | 'decision_shown'
  | 'decision_followed'
  | 'decision_overridden'
  | 'autopilot_prompted'
  | 'autopilot_executed'
  | 'cost_warning_shown'
  | 'engine_fallback_applied'
  | 'chain_limit_reached';

export type OverrideReason = 
  | 'changed_preset'
  | 'changed_engine'
  | 'ignored_recommendation'
  | 'manual_regenerate';

/**
 * Log decision engine event to editorial_events (v1.1 - includes decision_id)
 */
export async function logDecisionEvent(
  projectId: string,
  assetType: DecisionAssetType,
  eventType: DecisionEventType,
  decisionPack: DecisionPack,
  userChoice?: {
    chosenEngine?: string;
    chosenPreset?: string;
    chosenAction?: ActionIntent;
    overrideReason?: OverrideReason;
  }
): Promise<void> {
  try {
    // editorial_events table removed - log to console only
    console.log('[DecisionEngine] Event:', eventType, {
      project_id: projectId,
      asset_type: assetType === 'script_import' ? 'script' : assetType,
      event_type: eventType,
      payload: {
        decisionId: decisionPack.decisionId,
        recommendedAction: decisionPack.recommendedAction,
        recommendedEngine: decisionPack.recommendedEngine,
        recommendedPreset: decisionPack.recommendedPresetId,
        confidence: decisionPack.confidence,
        confidenceLabel: decisionPack.confidenceLabel,
        autopilotEligible: decisionPack.autopilotEligible,
        riskFlags: decisionPack.riskFlags,
        reinforceCanon: decisionPack.reinforceCanon,
        estimatedCost: decisionPack.estimatedCost,
        chainLength: decisionPack.chainLength,
        chainLimitReached: decisionPack.chainLimitReached,
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
    case 'PRO': return 'pro';
    default: return 'assisted';
  }
}

/**
 * Validate extracted entities for invention risk (v1.1)
 * Returns entities with invention risk flagged
 */
export function validateExtractedEntities(entities: ExtractedEntity[]): {
  valid: ExtractedEntity[];
  uncertain: ExtractedEntity[];
  inventionRisk: boolean;
} {
  const valid: ExtractedEntity[] = [];
  const uncertain: ExtractedEntity[] = [];
  
  for (const entity of entities) {
    // Entity without evidence is uncertain
    if (!entity.evidence || entity.evidence.length === 0) {
      entity.uncertain = true;
      entity.confidence = 0.3;
      uncertain.push(entity);
    } else if (entity.confidence < 0.5) {
      entity.uncertain = true;
      uncertain.push(entity);
    } else {
      entity.uncertain = false;
      valid.push(entity);
    }
  }
  
  // Invention risk if any entity was marked as confirmed without evidence
  const inventionRisk = entities.some(e => 
    !e.uncertain && (!e.evidence || e.evidence.length === 0)
  );
  
  return { valid, uncertain, inventionRisk };
}
