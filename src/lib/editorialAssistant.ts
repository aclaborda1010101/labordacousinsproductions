/**
 * Editorial Assistant v1 - Suggestion Engine
 * Uses telemetry signals to provide smart, non-blocking suggestions
 */

export type AssetType = 'character' | 'location' | 'keyframe';
export type ActionType = 'apply_prompt_patch' | 'switch_preset' | 'set_phase' | 'open_canon_modal' | 'reorder_presets';

export interface EditorialSuggestion {
  id: string;
  title: string;
  message: string;
  actionLabel: string;
  actionType: ActionType;
  actionPayload?: Record<string, unknown>;
  priority: number; // Lower = higher priority
}

export interface EditorialSignals {
  regenerationsChain: number;
  hasAcceptedRun: boolean;
  canonPresent: boolean;
  canonCount: number;
  phase: 'exploration' | 'production';
  acceptRateByPreset: Record<string, { accepted: number; total: number; rate: number }>;
  currentPresetId?: string;
  repeatedFailPattern: boolean; // 3+ regenerations without accept
  totalGenerations: number;
}

/**
 * Get editorial suggestions based on signals
 * Returns 0-3 most relevant suggestions
 */
export function getEditorialSuggestions(
  assetType: AssetType,
  signals: EditorialSignals
): EditorialSuggestion[] {
  const suggestions: EditorialSuggestion[] = [];

  // A) Regeneration chain >= 3 without accept → suggest changing preset
  if (signals.regenerationsChain >= 3 && !signals.hasAcceptedRun) {
    const alternativePreset = getAlternativePreset(assetType, signals.currentPresetId);
    if (alternativePreset) {
      suggestions.push({
        id: 'change_preset',
        title: 'Cambia de preset',
        message: `Has regenerado ${signals.regenerationsChain} veces sin aceptar. Prueba con "${alternativePreset.label}" para mejores resultados.`,
        actionLabel: 'Cambiar preset',
        actionType: 'switch_preset',
        actionPayload: { presetId: alternativePreset.id, presetLabel: alternativePreset.label },
        priority: 1
      });
    }
  }

  // B) No canon for this type → suggest marking canon
  if (!signals.canonPresent && signals.hasAcceptedRun) {
    suggestions.push({
      id: 'mark_canon',
      title: 'Marca canon',
      message: `Tienes runs aceptados pero sin canon definido. Establecer canon mejora la consistencia en futuras generaciones.`,
      actionLabel: 'Establecer canon',
      actionType: 'open_canon_modal',
      priority: 2
    });
  }

  // C) Canon exists but still regenerating a lot → reinforce canon
  if (signals.canonPresent && signals.regenerationsChain >= 2) {
    suggestions.push({
      id: 'reinforce_canon',
      title: 'Refuerza canon',
      message: 'Tienes canon definido pero sigues regenerando. ¿Añadir instrucciones de canon estricto al prompt?',
      actionLabel: 'Aplicar canon estricto',
      actionType: 'apply_prompt_patch',
      actionPayload: {
        patch: getCanonReinforcementPatch(assetType)
      },
      priority: 3
    });
  }

  // D) A preset has significantly better accept rate → recommend it
  const recommendedPreset = getRecommendedPreset(signals.acceptRateByPreset, signals.currentPresetId);
  if (recommendedPreset && signals.totalGenerations >= 5) {
    suggestions.push({
      id: 'recommended_preset',
      title: 'Preset recomendado',
      message: `El preset "${recommendedPreset.label}" tiene ${Math.round(recommendedPreset.rate * 100)}% de aceptación en este proyecto.`,
      actionLabel: 'Usar recomendado',
      actionType: 'reorder_presets',
      actionPayload: { presetId: recommendedPreset.id, rate: recommendedPreset.rate },
      priority: 4
    });
  }

  // E) Exploration phase with many regenerations → suggest production
  if (signals.phase === 'exploration' && signals.totalGenerations >= 10 && signals.canonCount >= 2) {
    suggestions.push({
      id: 'upgrade_phase',
      title: '¿Pasar a producción?',
      message: 'Tienes varios canon definidos y experiencia con generaciones. ¿Quieres activar modo producción para mayor control?',
      actionLabel: 'Activar producción',
      actionType: 'set_phase',
      actionPayload: { phase: 'production' },
      priority: 5
    });
  }

  // Sort by priority and return top 3
  return suggestions
    .sort((a, b) => a.priority - b.priority)
    .slice(0, 3);
}

/**
 * Get alternative preset based on current one
 */
function getAlternativePreset(
  assetType: AssetType,
  currentPresetId?: string
): { id: string; label: string } | null {
  const presetAlternatives: Record<AssetType, Array<{ id: string; label: string }>> = {
    character: [
      { id: 'frontal', label: 'Retrato frontal' },
      { id: 'profile', label: 'Perfil' },
      { id: 'fullbody', label: 'Cuerpo completo' }
    ],
    location: [
      { id: 'establishing', label: 'Establishing shot' },
      { id: 'interior', label: 'Interior' },
      { id: 'detail', label: 'Detalle' }
    ],
    keyframe: [
      { id: 'wide', label: 'Plano general' },
      { id: 'medium', label: 'Plano medio' },
      { id: 'closeup', label: 'Primer plano' }
    ]
  };

  const options = presetAlternatives[assetType];
  if (!options) return null;

  // Return first option that's different from current
  const alternative = options.find(p => p.id !== currentPresetId);
  return alternative || null;
}

/**
 * Get canon reinforcement prompt patch based on asset type
 */
function getCanonReinforcementPatch(assetType: AssetType): string {
  const patches: Record<AssetType, string> = {
    character: 'MANTENER CANON ESTRICTO: conservar exactamente rostro, peinado, rasgos faciales y proporciones del personaje establecido. No alterar identidad visual.',
    location: 'MANTENER CANON ESTRICTO: conservar arquitectura, iluminación característica, paleta de colores y elementos distintivos de la localización establecida.',
    keyframe: 'MANTENER CANON ESTRICTO: respetar composición, iluminación, posiciones de personajes y continuidad visual con keyframes anteriores.'
  };
  return patches[assetType];
}

/**
 * Find best performing preset that's different from current
 */
function getRecommendedPreset(
  acceptRateByPreset: Record<string, { accepted: number; total: number; rate: number }>,
  currentPresetId?: string
): { id: string; label: string; rate: number } | null {
  const entries = Object.entries(acceptRateByPreset);
  if (entries.length < 2) return null;

  // Find preset with best rate that's not current and has at least 2 attempts
  const candidates = entries
    .filter(([id, stats]) => id !== currentPresetId && stats.total >= 2 && stats.rate >= 0.5)
    .sort((a, b) => b[1].rate - a[1].rate);

  if (candidates.length === 0) return null;

  const [id, stats] = candidates[0];
  return { id, label: formatPresetLabel(id), rate: stats.rate };
}

/**
 * Format preset ID to human label
 */
function formatPresetLabel(presetId: string): string {
  const labels: Record<string, string> = {
    frontal: 'Retrato frontal',
    profile: 'Perfil',
    fullbody: 'Cuerpo completo',
    establishing: 'Establishing shot',
    interior: 'Interior',
    detail: 'Detalle',
    wide: 'Plano general',
    medium: 'Plano medio',
    closeup: 'Primer plano'
  };
  return labels[presetId] || presetId;
}
