/**
 * INTELLIGENT REPAIR PROMPTS V2.0 - Hollywood Architecture
 * 
 * Smart repair prompts that fix without degrading quality.
 * Follows strict contracts to preserve tone, genre, and structure.
 */

import type { NarrativeProfile } from "./narrative-profiles.ts";
import type { BatchPlan } from "./batch-planner.ts";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface FormatProfile {
  type: 'FILM' | 'SERIES';
  duration_minutes?: number;
  episodes_count?: number;
}

export interface FailReport {
  blockers: string[];
  warnings: string[];
  genericity_score?: number;
  observability_score?: number;
  missing_threads?: string[];
  missing_turning_points?: string[];
  generic_phrases_found?: string[];
  scene_depth_issues?: string[];
}

export interface RepairContext {
  originalJson: any;
  failReport: FailReport;
  batchContract?: BatchPlan;
  narrativeProfile: NarrativeProfile;
  formatProfile: FormatProfile;
}

// ═══════════════════════════════════════════════════════════════════════════
// CORE REPAIR SYSTEM PROMPT
// ═══════════════════════════════════════════════════════════════════════════

export const REPAIR_SYSTEM_PROMPT = `Eres Script Doctor Senior. Reparas SIN reescribir todo.
Objetivo: convertir puntos vagos en acciones filmables y cumplir el contrato del batch.

━━━━━━━━━━━━━━━━━━━━━━━━━━
NO PUEDES (PROHIBICIONES ABSOLUTAS)
━━━━━━━━━━━━━━━━━━━━━━━━━━
- Cambiar género, tono, narrative_profile, formato (FILM vs SERIES)
- Borrar escenas válidas que ya cumplan contrato
- Resumir o "hacerlo más corto" - SIEMPRE expandir, NUNCA contraer
- Introducir personajes fuera del cast permitido (salvo que el fix lo exija explícitamente)
- Cambiar localizaciones principales sin justificación
- Alterar el arco emocional general de la escena
- Usar NINGUNA de las frases prohibidas

━━━━━━━━━━━━━━━━━━━━━━━━━━
SÍ PUEDES (REPARACIONES PERMITIDAS)
━━━━━━━━━━━━━━━━━━━━━━━━━━
- Sustituir frases genéricas por eventos concretos con agente y consecuencia
- Insertar micro-beats (1-3 líneas) dentro de escenas existentes para cubrir threads
- Completar turning_points con evento+agente+consecuencia
- Expandir descripciones de situación (NUNCA acortar)
- Añadir detalles de blocking y posición física
- Mejorar subtexto en diálogos
- Ajustar props SOLO si el contrato exige y sin romper coherencia
- Especificar acciones vagas con verbos observables

━━━━━━━━━━━━━━━━━━━━━━━━━━
LENGUAJE PROHIBIDO (RECHAZO SI APARECE)
━━━━━━━━━━━━━━━━━━━━━━━━━━
- "todo cambia" / "algo cambia"
- "se dan cuenta de que..."
- "la tensión aumenta"
- "surge un conflicto" / "aparece una amenaza"
- "empiezan a..." / "comienzan a..."
- "las cosas se complican"
- "nada volverá a ser igual"
- "se revela un secreto" (sin decir cuál)
- "descubren la verdad" (sin especificar)

━━━━━━━━━━━━━━━━━━━━━━━━━━
REGLA DE PRECISIÓN: EVENTO OBSERVABLE
━━━━━━━━━━━━━━━━━━━━━━━━━━
Cada evento/turning point DEBE incluir:
1. EVENT: Acción observable con verbo físico (mata, roba, firma, golpea, publica, confiesa)
2. AGENT: Nombre propio del personaje que actúa
3. CONSEQUENCE: Cambio de estado del mundo (pérdida, captura, exposición, ruptura)

❌ INCORRECTO: "La situación se complica cuando descubren algo"
✅ CORRECTO: "María encuentra el diario de su padre, revelando que él ordenó el asesinato de su madre"

Devuelve SOLO JSON válido en el mismo esquema que recibiste.`;

// ═══════════════════════════════════════════════════════════════════════════
// SITUATION DETAIL REQUIREMENT (for Hollywood tier)
// ═══════════════════════════════════════════════════════════════════════════

export const SITUATION_DETAIL_REQUIREMENT = `
━━━━━━━━━━━━━━━━━━━━━━━━━━
DETALLE DE SITUACIÓN (OBLIGATORIO PARA CADA ESCENA)
━━━━━━━━━━━━━━━━━━━━━━━━━━
Cada escena/beat clave DEBE tener descripción de situación con:

1. CONTEXTO FÍSICO (1-2 frases)
   - Luz (natural, artificial, dirección, intensidad)
   - Espacio (dimensiones, distribución, elementos clave)
   - Sonido ambiente (silencio tenso, ruido de fondo, música diegética)

2. ACCIÓN VISIBLE (1-2 frases)
   - Qué HACE cada personaje (posición, gesto, movimiento)
   - Blocking: dónde están físicamente unos respecto a otros
   - Objetos que manipulan o ignoran

3. OBJETIVO INMEDIATO (1 frase)
   - Qué QUIERE conseguir el protagonista de la escena en ESTE momento
   - Por qué es urgente

4. OBSTÁCULO TANGIBLE (1 frase)
   - Qué/quién se OPONE activamente
   - Por qué no puede simplemente conseguirlo

5. CAMBIO DE ESTADO (1 frase)
   - Cómo termina la escena DIFERENTE de como empezó
   - Qué ha ganado/perdido el protagonista

REGLAS:
- No poesía. No adjetivos vacíos.
- Todo debe ser FILMABLE: un director debe poder grabarlo.
- Mínimo 8 líneas de descripción por escena clave.
━━━━━━━━━━━━━━━━━━━━━━━━━━`;

// ═══════════════════════════════════════════════════════════════════════════
// REPAIR PROMPT BUILDER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build an intelligent repair prompt that targets specific failures.
 */
export function buildIntelligentRepairPrompt(context: RepairContext): string {
  const { originalJson, failReport, batchContract, narrativeProfile, formatProfile } = context;
  
  // Extract scene summary for context
  const scenes = originalJson?.scenes || [];
  const scenesSummary = scenes.slice(0, 5).map((s: any, i: number) => 
    `  ${i + 1}. ${s.slugline || 'Sin slugline'}: ${(s.action_summary || '').slice(0, 80)}...`
  ).join('\n') || '  (sin escenas)';
  
  // Build blocker-specific instructions
  const blockerInstructions: string[] = [];
  
  if (failReport.genericity_score && failReport.genericity_score > 25) {
    blockerInstructions.push(`
🔴 GENERICIDAD ALTA (${failReport.genericity_score}):
Frases detectadas: ${failReport.generic_phrases_found?.join(', ') || 'varias'}
→ REEMPLAZA cada frase genérica por un EVENTO CONCRETO con AGENTE y CONSECUENCIA.
→ Usa verbos de acción física: mata, roba, descubre, publica, firma, golpea, huye.`);
  }
  
  if (failReport.observability_score && failReport.observability_score < 0.7) {
    blockerInstructions.push(`
🔴 OBSERVABILIDAD BAJA (${Math.round(failReport.observability_score * 100)}%):
→ Los turning points carecen de estructura EVENTO+AGENTE+CONSECUENCIA.
→ Cada TP debe responder: ¿QUIÉN hace QUÉ y QUÉ PROVOCA?`);
  }
  
  if (failReport.missing_threads && failReport.missing_threads.length > 0) {
    blockerInstructions.push(`
🔴 THREADS FALTANTES:
${failReport.missing_threads.map(t => `  • ${t}`).join('\n')}
→ Inserta un BEAT explícito de cada thread en acción o diálogo de alguna escena.`);
  }
  
  if (failReport.missing_turning_points && failReport.missing_turning_points.length > 0) {
    blockerInstructions.push(`
🔴 TURNING POINTS NO EJECUTADOS:
${failReport.missing_turning_points.map(tp => `  • ${tp}`).join('\n')}
→ Cada TP debe aparecer como ACCIÓN VISIBLE en una escena.`);
  }
  
  if (failReport.scene_depth_issues && failReport.scene_depth_issues.length > 0) {
    blockerInstructions.push(`
🔴 ESCENAS SUPERFICIALES:
${failReport.scene_depth_issues.slice(0, 3).map(i => `  • ${i}`).join('\n')}
→ EXPANDE las descripciones de situación siguiendo SITUATION_DETAIL_REQUIREMENT.`);
  }
  
  // Build narrative profile block
  const profileBlock = `
PERFIL NARRATIVO (NO CAMBIAR):
- ID: ${narrativeProfile.id}
- Método: ${narrativeProfile.narrative_method}
- Conflicto: ${narrativeProfile.conflict_style}
- Ritmo: ${narrativeProfile.pacing}
- Diálogo: ${narrativeProfile.dialogue_style}`;

  // Build format block
  const formatBlock = formatProfile.type === 'FILM' 
    ? `FORMATO: PELÍCULA (${formatProfile.duration_minutes || 'N/A'} min) - SIN episodios/temporadas`
    : `FORMATO: SERIE (${formatProfile.episodes_count || 'N/A'} episodios)`;

  return `
═══════════════════════════════════════════════════════════════
🔧 REPAIR MODE - REESCRIBIR BATCH FALLIDO
═══════════════════════════════════════════════════════════════

El batch anterior FALLÓ el contrato. Debes REPARARLO sin degradar.

${formatBlock}
${profileBlock}

━━━━━━━━━━━━━━━━━━━━━━━━━━
❌ FALLOS DETECTADOS
━━━━━━━━━━━━━━━━━━━━━━━━━━
${failReport.blockers.map(b => `• ${b}`).join('\n')}

${blockerInstructions.join('\n')}

━━━━━━━━━━━━━━━━━━━━━━━━━━
📝 ESCENAS A REPARAR
━━━━━━━━━━━━━━━━━━━━━━━━━━
${scenesSummary}

━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 OBJETIVO DE LA REPARACIÓN
━━━━━━━━━━━━━━━━━━━━━━━━━━
1. MANTENER mismos personajes, localizaciones y continuidad
2. EXPANDIR descripciones (NUNCA acortar)
3. REEMPLAZAR lenguaje genérico por eventos observables
4. COMPLETAR turning points con agente+evento+consecuencia
${batchContract?.requiredThreads?.length ? `5. INSERTAR beats de threads: ${batchContract.requiredThreads.join(', ')}` : ''}

━━━━━━━━━━━━━━━━━━━━━━━━━━
📤 OUTPUT REQUERIDO
━━━━━━━━━━━━━━━━━━━━━━━━━━
Devuelve JSON con:
- scenes: [...escenas REPARADAS con problemas corregidos...]
- patch_notes: [...lista de cambios realizados (máx 10)...]
- threads_advanced: [...]
- turning_points_executed: [...]

Cada patch_note debe indicar: { "scene": N, "change": "descripción del cambio", "reason": "blocker corregido" }

⚠️ NO justifiques, NO expliques fuera del JSON. Solo repara.
═══════════════════════════════════════════════════════════════`;
}

// ═══════════════════════════════════════════════════════════════════════════
// SPECIALIZED REPAIR PROMPTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build a repair prompt specifically for genericity issues.
 */
export function buildGenericityRepairPrompt(
  genericPhrases: string[],
  sceneTexts: string[]
): string {
  return `
━━━━━━━━━━━━━━━━━━━━━━━━━━
REPARACIÓN DE GENERICIDAD
━━━━━━━━━━━━━━━━━━━━━━━━━━

FRASES GENÉRICAS DETECTADAS:
${genericPhrases.map(p => `❌ "${p}"`).join('\n')}

PARA CADA FRASE, proporciona un REEMPLAZO que incluya:
1. QUIÉN (agente con nombre propio)
2. HACE QUÉ (verbo de acción observable)
3. PROVOCANDO QUÉ (consecuencia visible)

EJEMPLO:
❌ "Todo cambia cuando descubren la verdad"
✅ "María encuentra el contrato falsificado en el escritorio de Carlos, confirmando que él robó la herencia"

Devuelve JSON con array "replacements": [{ "original": "...", "replacement": "..." }]`;
}

/**
 * Build a repair prompt specifically for scene depth issues.
 */
export function buildSceneDepthRepairPrompt(
  shallowScenes: Array<{ scene_number: number; current_length: number; min_required: number }>
): string {
  return `
━━━━━━━━━━━━━━━━━━━━━━━━━━
REPARACIÓN DE PROFUNDIDAD DE ESCENAS
━━━━━━━━━━━━━━━━━━━━━━━━━━

ESCENAS SUPERFICIALES:
${shallowScenes.map(s => `• Escena ${s.scene_number}: ${s.current_length}/${s.min_required} caracteres`).join('\n')}

${SITUATION_DETAIL_REQUIREMENT}

Para cada escena superficial, EXPANDE la descripción siguiendo los 5 elementos obligatorios.

Devuelve JSON con array "expanded_scenes": [{ "scene_number": N, "new_raw_content": "..." }]`;
}

/**
 * Build a repair prompt for turning points that lack structure.
 */
export function buildTurningPointRepairPrompt(
  invalidTPs: Array<{ tp_number: number; current_text: string; missing: string[] }>
): string {
  return `
━━━━━━━━━━━━━━━━━━━━━━━━━━
REPARACIÓN DE TURNING POINTS
━━━━━━━━━━━━━━━━━━━━━━━━━━

TURNING POINTS INVÁLIDOS:
${invalidTPs.map(tp => `
TP ${tp.tp_number}: "${tp.current_text}"
Falta: ${tp.missing.join(', ')}`).join('\n')}

ESTRUCTURA REQUERIDA:
- EVENT: Acción observable (verbo físico: mata, roba, firma, golpea, publica)
- AGENT: Nombre propio del personaje que ejecuta la acción
- CONSEQUENCE: Cambio de estado del mundo (pérdida, exposición, ruptura, captura)

EJEMPLO:
❌ "Las cosas se complican para el protagonista"
✅ { 
  "event": "Carlos publica las fotos comprometedoras en el periódico", 
  "agent": "Carlos", 
  "consequence": "María pierde su candidatura y su familia la repudia públicamente" 
}

Devuelve JSON con array "repaired_tps": [{ "tp_number": N, "event": "...", "agent": "...", "consequence": "..." }]`;
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER: Build full repair context string
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Combine system prompt with situation detail requirement for Hollywood tier.
 */
export function getFullRepairSystemPrompt(isHollywoodTier: boolean): string {
  if (isHollywoodTier) {
    return REPAIR_SYSTEM_PROMPT + '\n\n' + SITUATION_DETAIL_REQUIREMENT;
  }
  return REPAIR_SYSTEM_PROMPT;
}
