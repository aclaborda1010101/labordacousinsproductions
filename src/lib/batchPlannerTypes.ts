// =============================================================================
// BATCH PLANNER TYPES - Frontend types mirroring backend batch-planner.ts
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

export interface DensityGateResult {
  status: 'PASS' | 'FAIL' | 'WARN';
  density_score: number;
  required_fixes?: Array<{
    type: string;
    title: string;
    current?: number;
    required?: number;
    fix_hint?: string;
    // Backend alternative fields
    why_needed?: string;
    where_to_apply?: string;
    acceptance_test?: string;
  }>;
  human_summary?: string;
  warnings?: string[];
}

export interface BatchValidationResult {
  passed: boolean;
  blockers: string[];
  canRepair: boolean;
  declaredThreads: string[];
  declaredTPs: string[];
}

// =============================================================================
// CLIENT-SIDE BATCH PLAN BUILDER
// =============================================================================

/**
 * Build batch plan on client side (mirrors backend buildBatchPlan)
 */
export function buildClientBatchPlan(
  episode: number,
  outline: any,
  totalBatches: number,
  scenesPerBatch: number
): BatchPlan[] {
  const episodeBeat = outline?.episode_beats?.[episode - 1];
  const threads = outline?.threads || [];
  const turningPoints = episodeBeat?.turning_points || [];
  const characters = episodeBeat?.characters_present || 
                     outline?.main_characters?.map((c: any) => typeof c === 'string' ? c : c.name) || 
                     [];
  const factions = outline?.factions?.map((f: any) => typeof f === 'string' ? f : f.name) || [];
  const cliffhanger = episodeBeat?.cliffhanger;

  const plans: BatchPlan[] = [];

  // Normalize threads to have IDs
  const normalizedThreads = threads.map((t: any, idx: number) => ({
    id: t.id || `thread_${String.fromCharCode(65 + idx)}`,
    question: t.question || t.name || ''
  }));

  // Normalize TPs to have IDs
  const normalizedTPs = turningPoints.map((tp: any, idx: number) => ({
    id: tp.id || `tp_${idx + 1}`,
    event: tp.event || '',
    agent: tp.agent || ''
  }));

  for (let i = 0; i < totalBatches; i++) {
    const isLast = i === totalBatches - 1;
    
    // Round-robin thread assignment
    const threadIdx = i % (normalizedThreads.length || 1);
    const assignedThread = normalizedThreads[threadIdx];
    
    // Distribute TPs: aim for 1 per batch minimum
    const tpsPerBatch = Math.ceil(normalizedTPs.length / totalBatches);
    const startTpIdx = i * tpsPerBatch;
    const endTpIdx = Math.min(startTpIdx + tpsPerBatch, normalizedTPs.length);
    const assignedTPs = normalizedTPs.slice(startTpIdx, endTpIdx);
    
    // Character distribution
    const batchChars = characters.slice(
      Math.floor((i / totalBatches) * characters.length),
      Math.ceil(((i + 1) / totalBatches) * characters.length)
    );

    // Faction rotation
    const batchFactions = factions.length > 0 
      ? [factions[i % factions.length]]
      : undefined;

    // Build scene focus description
    let sceneFocus = '';
    if (assignedThread?.id) {
      sceneFocus = `Thread "${assignedThread.id}"`;
    }
    if (assignedTPs.length > 0) {
      sceneFocus += (sceneFocus ? ' + ' : '') + `TP: ${assignedTPs.map((tp: any) => tp.id).join(', ')}`;
    }
    if (isLast && cliffhanger) {
      sceneFocus += ' + CLIFFHANGER';
    }

    plans.push({
      episode,
      batchIndex: i,
      batchNumber: i + 1,
      sceneCount: scenesPerBatch,
      requiredThreads: assignedThread?.id ? [assignedThread.id] : [],
      requiredTurningPoints: assignedTPs.map((tp: any) => tp.id),
      requiredCharacters: batchChars.map((c: any) => typeof c === 'string' ? c : c.name),
      requiredFactions: batchFactions,
      sceneFocus: sceneFocus || `Batch ${i + 1}`,
      isLastBatch: isLast,
      mustIncludeCliffhanger: isLast && !!cliffhanger
    });
  }

  return plans;
}

/**
 * Create initial empty generation state
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

/**
 * Update generation state with batch results (client-side fallback if backend doesn't return it)
 */
export function updateGenerationStateClient(
  currentState: GenerationState,
  batchResult: {
    threads_advanced?: string[];
    turning_points_executed?: string[];
    characters_appeared?: string[];
    factions_shown?: string[];
    scenes?: any[];
  }
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
 * Validate batch result against plan (client-side)
 */
export function validateBatchResult(
  batchResult: any,
  plan: BatchPlan
): BatchValidationResult {
  const blockers: string[] = [];
  
  const declaredThreads = batchResult.threads_advanced || batchResult._qc?.threads_advanced || [];
  const declaredTPs = batchResult.turning_points_executed || batchResult._qc?.turning_points_executed || [];
  
  // Check threads coverage
  if (plan.requiredThreads.length > 0) {
    const coveredThreads = plan.requiredThreads.filter(t => declaredThreads.includes(t));
    if (coveredThreads.length === 0) {
      blockers.push(`THREADS: Ninguno cubierto de [${plan.requiredThreads.join(', ')}]`);
    }
  }
  
  // Check TPs coverage
  if (plan.requiredTurningPoints.length > 0) {
    const coveredTPs = plan.requiredTurningPoints.filter(tp => declaredTPs.includes(tp));
    if (coveredTPs.length === 0) {
      blockers.push(`TPs: Ninguno ejecutado de [${plan.requiredTurningPoints.join(', ')}]`);
    }
  }
  
  // Check cliffhanger requirement
  if (plan.mustIncludeCliffhanger && !batchResult._qc?.has_cliffhanger) {
    // This is a soft warning, not a blocker
    console.warn('[validateBatchResult] Last batch may be missing cliffhanger');
  }
  
  return {
    passed: blockers.length === 0,
    blockers,
    canRepair: blockers.length <= 2,
    declaredThreads,
    declaredTPs
  };
}
