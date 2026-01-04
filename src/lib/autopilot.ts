/**
 * AUTOPILOT v1 - Confidence-based automatic engine+preset selection (IMAGE only)
 * Only activates when confidence is high enough
 */

import { supabase } from '@/integrations/supabase/client';
import { 
  Recommendation, 
  AssetType, 
  Phase, 
  getRecommendations, 
  ENGINES 
} from './recommendations';

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

export interface AutopilotSettings {
  autopilotImageEnabled: boolean;
  autopilotConfidenceThreshold: number;
  autopilotMinRuns: number;
  autopilotMaxRegens: number;
}

export interface AutopilotDecision {
  shouldAutopilot: boolean;
  recommendation: Recommendation | null;
  confidence: number;
  reason: string;
  settings: AutopilotSettings;
}

const DEFAULT_SETTINGS: AutopilotSettings = {
  autopilotImageEnabled: true,
  autopilotConfidenceThreshold: 0.75,
  autopilotMinRuns: 10,
  autopilotMaxRegens: 1.3
};

// ─────────────────────────────────────────────────────────────
// SETTINGS
// ─────────────────────────────────────────────────────────────

/**
 * Get autopilot settings for a project
 */
export async function getAutopilotSettings(projectId: string): Promise<AutopilotSettings> {
  try {
    const { data, error } = await supabase
      .from('project_autopilot_settings')
      .select('*')
      .eq('project_id', projectId)
      .maybeSingle();

    if (error || !data) {
      return DEFAULT_SETTINGS;
    }

    return {
      autopilotImageEnabled: data.autopilot_image_enabled ?? true,
      autopilotConfidenceThreshold: data.autopilot_confidence_threshold ?? 0.75,
      autopilotMinRuns: data.autopilot_min_runs ?? 10,
      autopilotMaxRegens: data.autopilot_max_regens ?? 1.3
    };
  } catch (err) {
    console.warn('[Autopilot] Error fetching settings:', err);
    return DEFAULT_SETTINGS;
  }
}

/**
 * Save autopilot settings for a project
 */
export async function saveAutopilotSettings(
  projectId: string, 
  settings: Partial<AutopilotSettings>
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('project_autopilot_settings')
      .upsert({
        project_id: projectId,
        autopilot_image_enabled: settings.autopilotImageEnabled,
        autopilot_confidence_threshold: settings.autopilotConfidenceThreshold,
        autopilot_min_runs: settings.autopilotMinRuns,
        autopilot_max_regens: settings.autopilotMaxRegens,
        updated_at: new Date().toISOString()
      }, { onConflict: 'project_id' });

    return !error;
  } catch (err) {
    console.error('[Autopilot] Error saving settings:', err);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────
// CONFIDENCE CALCULATION
// ─────────────────────────────────────────────────────────────

/**
 * Calculate autopilot confidence score
 * confidence = min(1, acceptRate) * min(1, totalRuns/minRuns) * min(1, maxRegens/avgRegens)
 */
export function calculateAutopilotConfidence(
  recommendation: Recommendation,
  settings: AutopilotSettings
): number {
  const { basedOnRuns, acceptRate, avgRegenerations } = recommendation;
  const { autopilotMinRuns, autopilotMaxRegens } = settings;

  // Component scores
  const acceptRateScore = Math.min(1, acceptRate);
  const volumeScore = Math.min(1, basedOnRuns / autopilotMinRuns);
  const stabilityScore = avgRegenerations > 0 
    ? Math.min(1, autopilotMaxRegens / avgRegenerations)
    : 1;

  // Combined confidence
  const confidence = acceptRateScore * volumeScore * stabilityScore;
  
  return Math.round(confidence * 100) / 100; // Round to 2 decimals
}

// ─────────────────────────────────────────────────────────────
// MAIN AUTOPILOT API
// ─────────────────────────────────────────────────────────────

/**
 * Get autopilot decision for image generation
 */
export async function getAutopilotDecision(
  projectId: string,
  assetType: AssetType,
  availablePresets: string[],
  phase?: Phase
): Promise<AutopilotDecision> {
  const settings = await getAutopilotSettings(projectId);

  // If autopilot disabled, return early
  if (!settings.autopilotImageEnabled) {
    return {
      shouldAutopilot: false,
      recommendation: null,
      confidence: 0,
      reason: 'Autopilot desactivado para este proyecto',
      settings
    };
  }

  // Get recommendations
  const { recommendation } = await getRecommendations(
    projectId,
    assetType,
    availablePresets,
    phase
  );

  if (!recommendation || recommendation.confidence === 'low') {
    return {
      shouldAutopilot: false,
      recommendation,
      confidence: 0,
      reason: 'Datos insuficientes para autopilot',
      settings
    };
  }

  // Calculate autopilot confidence
  const confidence = calculateAutopilotConfidence(recommendation, settings);

  // Check all conditions
  const meetsConfidence = confidence >= settings.autopilotConfidenceThreshold;
  const meetsMinRuns = recommendation.basedOnRuns >= settings.autopilotMinRuns;
  const meetsMaxRegens = recommendation.avgRegenerations <= settings.autopilotMaxRegens;

  const shouldAutopilot = meetsConfidence && meetsMinRuns && meetsMaxRegens;

  let reason: string;
  if (shouldAutopilot) {
    reason = `Autopilot: ${(confidence * 100).toFixed(0)}% confianza | ${recommendation.basedOnRuns} runs | ${(recommendation.acceptRate * 100).toFixed(0)}% aceptación`;
  } else {
    const issues: string[] = [];
    if (!meetsConfidence) issues.push(`confianza ${(confidence * 100).toFixed(0)}% < ${(settings.autopilotConfidenceThreshold * 100).toFixed(0)}%`);
    if (!meetsMinRuns) issues.push(`${recommendation.basedOnRuns} runs < ${settings.autopilotMinRuns} mínimo`);
    if (!meetsMaxRegens) issues.push(`${recommendation.avgRegenerations.toFixed(1)} regens > ${settings.autopilotMaxRegens} máximo`);
    reason = `No autopilot: ${issues.join(', ')}`;
  }

  return {
    shouldAutopilot,
    recommendation,
    confidence,
    reason,
    settings
  };
}

// ─────────────────────────────────────────────────────────────
// TRACKING
// ─────────────────────────────────────────────────────────────

/**
 * Log autopilot events to editorial_events
 */
export async function logAutopilotEvent(
  projectId: string,
  assetType: AssetType,
  eventType: 'autopilot_decision_shown' | 'autopilot_followed' | 'autopilot_overridden',
  decision: AutopilotDecision,
  chosenEngine?: string,
  chosenPreset?: string
): Promise<void> {
  try {
    await supabase.from('editorial_events').insert([{
      project_id: projectId,
      asset_type: assetType,
      event_type: eventType,
      payload: {
        recommendedEngine: decision.recommendation?.recommendedEngine ?? null,
        recommendedPreset: decision.recommendation?.recommendedPreset ?? null,
        confidence: decision.confidence,
        shouldAutopilot: decision.shouldAutopilot,
        reason: decision.reason,
        chosenEngine: chosenEngine ?? null,
        chosenPreset: chosenPreset ?? null,
        autopilotImageEnabled: decision.settings.autopilotImageEnabled,
        autopilotConfidenceThreshold: decision.settings.autopilotConfidenceThreshold,
        autopilotMinRuns: decision.settings.autopilotMinRuns,
        autopilotMaxRegens: decision.settings.autopilotMaxRegens
      }
    }]);
  } catch (err) {
    console.error('[Autopilot] Error logging event:', err);
  }
}
