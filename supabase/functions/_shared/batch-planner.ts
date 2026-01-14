// =============================================================================
// BATCH PLANNER - Assign threads, turning points, and characters to batches
// Eliminates "disconnected batches" by planning upfront what each batch MUST cover
// =============================================================================

import type { EpisodeContract } from './episode-contracts.ts';

// =============================================================================
// TYPES
// =============================================================================

export interface BatchPlan {
  episode: number;
  batchIndex: number;           // 0-indexed
  batchNumber: number;          // 1-indexed for display
  sceneCount: number;
  
  // Required coverage for this batch
  requiredThreads: string[];          // Thread IDs to advance
  requiredTurningPoints: string[];    // TP IDs to execute
  requiredCharacters: string[];       // Characters that MUST appear
  requiredFactions?: string[];        // Factions in play
  
  // Narrative focus
  sceneFocus: string;                 // Brief description of batch focus
  isLastBatch: boolean;
  mustIncludeCliffhanger: boolean;
}

export interface GenerationState {
  // Accumulated coverage
  threadsAdvanced: string[];          // Thread IDs already covered
  turningPointsDone: string[];        // TP IDs already executed
  charactersUsed: string[];           // Characters already appeared
  factionsShown: string[];            // Factions already shown
  
  // Progress tracking
  scenesGenerated: number;
  batchesCompleted: number;
  
  // Repair tracking
  repairAttempts: number;
  lastRepairReason?: string;
}

export interface BatchResult {
  threads_advanced: string[];
  turning_points_executed: string[];
  characters_appeared: string[];
  factions_shown?: string[];
  scenes: any[];
}

// =============================================================================
// BATCH PLAN BUILDER
// =============================================================================

/**
 * Build a distribution plan for batches that ensures:
 * - Each thread is covered at least once
 * - Each turning point is covered at least once
 * - Last batch includes cliffhanger
 * - Round-robin distribution for balanced coverage
 */
export function buildBatchPlan(args: {
  episode: number;
  threads: Array<{ id: string; question?: string; name?: string }>;
  turningPoints: Array<{ id?: string; tp?: number; event?: string; agent?: string }>;
  characters?: string[];
  factions?: string[];
  totalBatches: number;
  scenesPerBatch: number;
  cliffhanger?: string;
}): BatchPlan[] {
  const { 
    episode, 
    threads, 
    turningPoints, 
    characters = [], 
    factions = [],
    totalBatches, 
    scenesPerBatch,
    cliffhanger
  } = args;
  
  const plans: BatchPlan[] = [];
  
  // Normalize TPs to have consistent ID format
  const normalizedTPs = turningPoints.map((tp, idx) => ({
    id: tp.id || `tp_${idx + 1}`,
    event: tp.event || '',
    agent: tp.agent || ''
  }));
  
  // Normalize threads to have consistent ID format
  const normalizedThreads = threads.map((t, idx) => ({
    id: t.id || `thread_${String.fromCharCode(65 + idx)}`, // A, B, C...
    question: t.question || t.name || ''
  }));
  
  for (let i = 0; i < totalBatches; i++) {
    const isLast = i === totalBatches - 1;
    
    // Round-robin thread assignment
    // First batch gets thread A, second gets B, etc.
    // Ensure all threads get covered at least once
    const threadIdx = i % normalizedThreads.length;
    const assignedThread = normalizedThreads[threadIdx];
    
    // Distribute TPs: aim for 1 per batch minimum
    // If more TPs than batches, some batches get 2
    const tpsPerBatch = Math.ceil(normalizedTPs.length / totalBatches);
    const startTpIdx = i * tpsPerBatch;
    const endTpIdx = Math.min(startTpIdx + tpsPerBatch, normalizedTPs.length);
    const assignedTPs = normalizedTPs.slice(startTpIdx, endTpIdx);
    
    // Character distribution - ensure main characters appear early
    const batchCharacters = characters.slice(
      Math.floor((i / totalBatches) * characters.length),
      Math.ceil(((i + 1) / totalBatches) * characters.length)
    );
    
    // Faction rotation if any
    const batchFactions = factions.length > 0 
      ? [factions[i % factions.length]]
      : undefined;
    
    // Build scene focus description
    let sceneFocus = '';
    if (assignedThread) {
      sceneFocus = `Avanzar thread "${assignedThread.id}"`;
    }
    if (assignedTPs.length > 0) {
      sceneFocus += ` + ejecutar TP${assignedTPs.map(tp => tp.id).join(', ')}`;
    }
    if (isLast && cliffhanger) {
      sceneFocus += ` + CLIFFHANGER`;
    }
    
    plans.push({
      episode,
      batchIndex: i,
      batchNumber: i + 1,
      sceneCount: scenesPerBatch,
      requiredThreads: assignedThread ? [assignedThread.id] : [],
      requiredTurningPoints: assignedTPs.map(tp => tp.id),
      requiredCharacters: batchCharacters,
      requiredFactions: batchFactions,
      sceneFocus: sceneFocus || `Batch ${i + 1}`,
      isLastBatch: isLast,
      mustIncludeCliffhanger: isLast && !!cliffhanger
    });
  }
  
  return plans;
}

// =============================================================================
// STATE BLOCK BUILDER - Inject accumulated state into prompt
// =============================================================================

/**
 * Build a text block that tells the LLM what has been covered and what remains
 */
export function buildStateBlock(
  plan: BatchPlan,
  state: GenerationState,
  contract: {
    allThreads: string[];
    allTurningPoints: string[];
    allCharacters: string[];
  }
): string {
  // Calculate remaining items
  const remainingThreads = contract.allThreads.filter(
    t => !state.threadsAdvanced.includes(t)
  );
  const remainingTPs = contract.allTurningPoints.filter(
    tp => !state.turningPointsDone.includes(tp)
  );
  const remainingCharacters = contract.allCharacters.filter(
    c => !state.charactersUsed.includes(c.toLowerCase())
  );
  
  return `
═══════════════════════════════════════════════════════════════
📊 ESTADO ACUMULADO (BATCH ${plan.batchNumber}) - NO IGNORAR
═══════════════════════════════════════════════════════════════

▸ THREADS CUBIERTOS: ${state.threadsAdvanced.length > 0 ? state.threadsAdvanced.join(', ') : 'Ninguno aún'}
▸ THREADS PENDIENTES: ${remainingThreads.length > 0 ? remainingThreads.join(', ') : 'Todos cubiertos ✓'}

▸ TURNING POINTS EJECUTADOS: ${state.turningPointsDone.length > 0 ? state.turningPointsDone.join(', ') : 'Ninguno aún'}
▸ TURNING POINTS PENDIENTES: ${remainingTPs.length > 0 ? remainingTPs.join(', ') : 'Todos ejecutados ✓'}

▸ PERSONAJES USADOS: ${state.charactersUsed.length > 0 ? state.charactersUsed.join(', ') : 'Ninguno aún'}
▸ PERSONAJES PENDIENTES: ${remainingCharacters.length > 0 ? remainingCharacters.join(', ') : 'Todos aparecidos ✓'}

▸ ESCENAS GENERADAS: ${state.scenesGenerated}
▸ BATCHES COMPLETADOS: ${state.batchesCompleted}

⚠️ PRIORIZA CUBRIR LO PENDIENTE EN ESTE BATCH:
   - Threads: ${plan.requiredThreads.join(', ') || 'Flexibles'}
   - TPs: ${plan.requiredTurningPoints.join(', ') || 'Flexibles'}
═══════════════════════════════════════════════════════════════`;
}

// =============================================================================
// BATCH CONTRACT BLOCK - Hard constraint for this specific batch
// =============================================================================

/**
 * Build the contract block that MUST be fulfilled by this batch
 */
export function buildBatchContractBlock(plan: BatchPlan, threadDetails?: Array<{ id: string; question: string }>): string {
  const threadDescriptions = plan.requiredThreads.map(tid => {
    const detail = threadDetails?.find(t => t.id === tid);
    return detail ? `   - ${tid}: "${detail.question}"` : `   - ${tid}`;
  }).join('\n');
  
  const tpDescriptions = plan.requiredTurningPoints.map(tp => `   - ${tp}`).join('\n');
  const charDescriptions = plan.requiredCharacters.length > 0 
    ? plan.requiredCharacters.map(c => `   - ${c}`).join('\n')
    : '   (sin requisito específico)';
  
  return `
═══════════════════════════════════════════════════════════════
⚠️ CONTRATO DEL BATCH ${plan.batchNumber} - CUMPLIMIENTO OBLIGATORIO
═══════════════════════════════════════════════════════════════

Este batch ES INVÁLIDO si no cumple:

1) THREADS A AVANZAR (mínimo 1):
${threadDescriptions || '   (sin requisito específico)'}

2) TURNING POINTS A EJECUTAR (mínimo 1):
${tpDescriptions || '   (sin requisito específico)'}

3) PERSONAJES OBLIGATORIOS:
${charDescriptions}

${plan.mustIncludeCliffhanger ? `
4) ⚠️ CLIFFHANGER OBLIGATORIO:
   Este es el último batch - DEBE terminar con el cliffhanger planificado.
` : ''}

📤 SALIDA OBLIGATORIA (en JSON final):
{
  "threads_advanced": ["thread_id_1", ...],
  "turning_points_executed": ["tp_1", ...],
  "characters_appeared": ["nombre_1", ...]
}

Si este batch NO declara cumplimiento → ES RECHAZADO AUTOMÁTICAMENTE.
═══════════════════════════════════════════════════════════════`;
}

// =============================================================================
// STATE UPDATE - Update state after batch completion
// =============================================================================

/**
 * Update generation state with results from a completed batch
 */
export function updateGenerationState(
  currentState: GenerationState,
  batchResult: BatchResult,
  plan: BatchPlan
): GenerationState {
  const newThreads = batchResult.threads_advanced || [];
  const newTPs = batchResult.turning_points_executed || [];
  const newChars = batchResult.characters_appeared || [];
  const newFactions = batchResult.factions_shown || [];
  
  return {
    threadsAdvanced: [
      ...new Set([...currentState.threadsAdvanced, ...newThreads])
    ],
    turningPointsDone: [
      ...new Set([...currentState.turningPointsDone, ...newTPs])
    ],
    charactersUsed: [
      ...new Set([
        ...currentState.charactersUsed, 
        ...newChars.map(c => c.toLowerCase())
      ])
    ],
    factionsShown: [
      ...new Set([...currentState.factionsShown, ...newFactions])
    ],
    scenesGenerated: currentState.scenesGenerated + (batchResult.scenes?.length || 0),
    batchesCompleted: currentState.batchesCompleted + 1,
    repairAttempts: currentState.repairAttempts,
    lastRepairReason: currentState.lastRepairReason
  };
}

/**
 * Create initial empty state
 */
export function createInitialState(): GenerationState {
  return {
    threadsAdvanced: [],
    turningPointsDone: [],
    charactersUsed: [],
    factionsShown: [],
    scenesGenerated: 0,
    batchesCompleted: 0,
    repairAttempts: 0
  };
}

// =============================================================================
// REPAIR PROMPT BUILDER
// =============================================================================

/**
 * Build a repair prompt for a batch that failed contract validation
 */
export function buildRepairPrompt(
  failedBatch: BatchResult,
  plan: BatchPlan,
  blockers: string[]
): string {
  const scenesSummary = failedBatch.scenes?.slice(0, 4).map((s: any) => 
    `  - ${s.slugline || 'Sin slugline'}: ${(s.action_summary || '').slice(0, 100)}`
  ).join('\n') || '  (sin escenas)';
  
  return `
═══════════════════════════════════════════════════════════════
🔧 REPAIR MODE - REESCRIBIR BATCH FALLIDO
═══════════════════════════════════════════════════════════════

El batch anterior FALLÓ el contrato. Debes REESCRIBIRLO.

❌ FALLOS DETECTADOS:
${blockers.map(b => `   • ${b}`).join('\n')}

📝 ESCENAS A REESCRIBIR (mantener continuidad):
${scenesSummary}

🎯 OBJETIVO DE LA REESCRITURA:
- Mantener mismos personajes y localizaciones
- Mantener continuidad de acciones ya establecidas
${plan.requiredThreads.length > 0 ? `- INSERTAR beat del thread: ${plan.requiredThreads[0]}` : ''}
${plan.requiredTurningPoints.length > 0 ? `- EJECUTAR turning point: ${plan.requiredTurningPoints[0]}` : ''}

📋 INSTRUCCIONES:
1. NO añadas escenas nuevas - reescribe las ${failedBatch.scenes?.length || 4} existentes
2. Mantén sluglines y localizaciones similares
3. Introduce un beat explícito del thread requerido en acción o diálogo
4. Cierra con consecuencia ligada al turning point
5. Declara cumplimiento en JSON final

📤 Devuelve JSON con:
- scenes: [...escenas reescritas con thread/TP integrados...]
- threads_advanced: [...]
- turning_points_executed: [...]
- characters_appeared: [...]

⚠️ NO justifiques, NO expliques. Solo reescribe.
═══════════════════════════════════════════════════════════════`;
}

// =============================================================================
// VALIDATION HELPERS
// =============================================================================

/**
 * Check if batch plan is valid for the contract
 */
export function validateBatchPlan(
  plans: BatchPlan[],
  contract: {
    totalThreads: number;
    totalTPs: number;
    requiredCharacters: number;
  }
): { valid: boolean; warnings: string[] } {
  const warnings: string[] = [];
  
  // Check all threads are covered
  const allAssignedThreads = plans.flatMap(p => p.requiredThreads);
  const uniqueThreads = new Set(allAssignedThreads);
  
  if (uniqueThreads.size < contract.totalThreads) {
    warnings.push(`Solo ${uniqueThreads.size}/${contract.totalThreads} threads asignados a batches`);
  }
  
  // Check all TPs are covered
  const allAssignedTPs = plans.flatMap(p => p.requiredTurningPoints);
  const uniqueTPs = new Set(allAssignedTPs);
  
  if (uniqueTPs.size < contract.totalTPs) {
    warnings.push(`Solo ${uniqueTPs.size}/${contract.totalTPs} TPs asignados a batches`);
  }
  
  // Check last batch has cliffhanger requirement
  const lastPlan = plans[plans.length - 1];
  if (lastPlan && !lastPlan.mustIncludeCliffhanger) {
    warnings.push('Último batch no tiene requisito de cliffhanger');
  }
  
  return {
    valid: warnings.length === 0,
    warnings
  };
}
