/**
 * EPISODE CONTRACTS V11 - Structural Contract Extraction
 * 
 * Extracts non-negotiable structural contracts from the outline for each episode.
 * These contracts are used to ENFORCE structural adherence in script generation.
 * 
 * The script generator MUST execute these contracts - they are not suggestions.
 */

// ============================================================================
// CONTRACT TYPES
// ============================================================================

export interface ThreadContract {
  id: string;
  name: string;
  type: string;
  question: string;
  engine: string;
  stake: string;
  is_primary: boolean; // True if this is thread "A" for the episode
}

export interface TurningPointContract {
  tp: number;
  agent: string;
  event: string;
  consequence: string;
}

export interface FactionContract {
  name: string;
  objective: string;
  method: string;
  red_line?: string;
  characters_in_faction: string[];
}

export interface SetpieceContract {
  name: string;
  location_ref?: string;
  participants: string[];
  stakes: string;
  visual_hook?: string;
}

export interface CliffhangerContract {
  type: 'revelation' | 'danger' | 'decision' | 'arrival' | 'betrayal' | 'unknown';
  description: string;
  unresolved_question: string;
}

export interface MoralDilemmaContract {
  choice: string;
  cost_if_yes: string;
  cost_if_no: string;
  who_decides: string;
}

export interface EpisodeContract {
  episode_number: number;
  title: string;
  central_conflict: string;
  
  // Threads that MUST advance in this episode
  threads_required: ThreadContract[];
  
  // Turning points that MUST be executed as scenes
  turning_points: TurningPointContract[];
  
  // Factions active in this episode with their rules
  factions_in_play: FactionContract[];
  
  // The big scene of the episode
  setpiece: SetpieceContract;
  
  // How the episode ends (non-negotiable)
  cliffhanger: CliffhangerContract;
  
  // Moral dilemma if present
  moral_dilemma?: MoralDilemmaContract;
  
  // Explicit stakes for this episode
  stakes: string[];
  
  // Characters that MUST appear
  characters_required: string[];
  
  // Crossover event where threads collide
  crossover_event: string;
}

// ============================================================================
// EXTRACTION HELPERS
// ============================================================================

function extractThreadsForEpisode(
  outline: Record<string, unknown>,
  episodeNumber: number
): ThreadContract[] {
  const threads = outline.threads as Array<Record<string, unknown>> || [];
  const episodeBeat = (outline.episode_beats as Array<Record<string, unknown>>)?.[episodeNumber - 1];
  const threadUsage = episodeBeat?.thread_usage as Record<string, unknown> || {};
  
  const result: ThreadContract[] = [];
  const primaryThreadId = threadUsage.A as string;
  const secondaryThreadId = threadUsage.B as string;
  const tertiaryThreadId = threadUsage.C as string;
  
  // Find threads that apply to this episode
  for (const thread of threads) {
    const threadId = thread.id as string;
    
    // Check if thread is assigned to this episode via thread_usage
    const isPrimary = threadId === primaryThreadId;
    const isSecondary = threadId === secondaryThreadId;
    const isTertiary = threadId === tertiaryThreadId;
    
    if (isPrimary || isSecondary || isTertiary) {
      result.push({
        id: threadId,
        name: (thread.question as string)?.split('?')[0] || threadId,
        type: thread.type as string || 'subplot',
        question: thread.question as string || '',
        engine: thread.engine as string || '',
        stake: thread.stake as string || '',
        is_primary: isPrimary
      });
    }
  }
  
  return result;
}

function extractTurningPoints(
  episodeBeat: Record<string, unknown>
): TurningPointContract[] {
  const tps = episodeBeat.turning_points as Array<unknown> || [];
  const result: TurningPointContract[] = [];
  
  for (let i = 0; i < tps.length; i++) {
    const tp = tps[i];
    
    if (typeof tp === 'object' && tp !== null) {
      const tpObj = tp as Record<string, unknown>;
      result.push({
        tp: (tpObj.tp as number) || (i + 1),
        agent: (tpObj.agent as string) || 'UNKNOWN',
        event: (tpObj.event as string) || '',
        consequence: (tpObj.consequence as string) || ''
      });
    } else if (typeof tp === 'string') {
      // Legacy string format - try to parse
      const match = tp.match(/^(.+?)\s*[:\-–]\s*(.+?)(?:\s*[→→>]\s*(.+))?$/);
      if (match) {
        result.push({
          tp: i + 1,
          agent: match[1].trim(),
          event: match[2].trim(),
          consequence: match[3]?.trim() || ''
        });
      } else {
        result.push({
          tp: i + 1,
          agent: 'UNSPECIFIED',
          event: tp,
          consequence: ''
        });
      }
    }
  }
  
  return result;
}

function extractFactionsForEpisode(
  outline: Record<string, unknown>,
  episodeNumber: number
): FactionContract[] {
  const factions = outline.factions as Array<Record<string, unknown>> || [];
  const episodeBeat = (outline.episode_beats as Array<Record<string, unknown>>)?.[episodeNumber - 1];
  const mainCharacters = outline.main_characters as Array<Record<string, unknown>> || [];
  
  // Get characters present in this episode from turning points and setpiece
  const charsInEpisode = new Set<string>();
  
  const tps = episodeBeat?.turning_points as Array<Record<string, unknown>> || [];
  for (const tp of tps) {
    if (tp?.agent) charsInEpisode.add((tp.agent as string).toLowerCase());
  }
  
  const setpiece = episodeBeat?.setpiece as Record<string, unknown>;
  const participants = setpiece?.participants as string[] || [];
  for (const p of participants) {
    charsInEpisode.add(p.toLowerCase());
  }
  
  // Map characters to factions
  const result: FactionContract[] = [];
  
  for (const faction of factions) {
    const factionName = faction.name as string;
    const leaderRef = faction.leader_ref as string;
    
    // Find characters in this faction
    const charsInFaction: string[] = [];
    
    for (const char of mainCharacters) {
      const charName = (char.name as string) || '';
      // Check if character's name matches leader_ref or if they're in the episode
      if (
        charName.toLowerCase() === leaderRef?.toLowerCase() ||
        charsInEpisode.has(charName.toLowerCase())
      ) {
        // TODO: Add proper faction membership tracking
        // For now, include leader and mentioned characters
        if (charName.toLowerCase() === leaderRef?.toLowerCase()) {
          charsInFaction.push(charName);
        }
      }
    }
    
    // Include faction if leader is in episode or has active characters
    if (charsInFaction.length > 0 || charsInEpisode.has(leaderRef?.toLowerCase() || '')) {
      result.push({
        name: factionName,
        objective: faction.objective as string || '',
        method: faction.method as string || '',
        red_line: faction.red_line as string,
        characters_in_faction: charsInFaction.length > 0 ? charsInFaction : [leaderRef || factionName]
      });
    }
  }
  
  // If no factions found, create a minimal entry based on active characters
  if (result.length === 0 && factions.length > 0) {
    // Include all factions as potentially active
    for (const faction of factions.slice(0, 3)) {
      result.push({
        name: faction.name as string,
        objective: faction.objective as string || '',
        method: faction.method as string || '',
        red_line: faction.red_line as string,
        characters_in_faction: [(faction.leader_ref as string) || 'leader']
      });
    }
  }
  
  return result;
}

function extractSetpiece(episodeBeat: Record<string, unknown>): SetpieceContract {
  const sp = episodeBeat.setpiece as Record<string, unknown> || {};
  
  return {
    name: (sp.name as string) || 'Unnamed Setpiece',
    location_ref: sp.location_ref as string,
    participants: (sp.participants as string[]) || [],
    stakes: (sp.stakes as string) || '',
    visual_hook: sp.visual_hook as string
  };
}

function extractCliffhanger(episodeBeat: Record<string, unknown>): CliffhangerContract {
  const cliffhanger = episodeBeat.cliffhanger;
  
  // Can be string or object
  if (typeof cliffhanger === 'string') {
    // Infer type from content
    const lower = cliffhanger.toLowerCase();
    let type: CliffhangerContract['type'] = 'unknown';
    
    if (lower.includes('revela') || lower.includes('descubre') || lower.includes('aparece')) {
      type = 'revelation';
    } else if (lower.includes('peligro') || lower.includes('amenaza') || lower.includes('muerte')) {
      type = 'danger';
    } else if (lower.includes('decide') || lower.includes('elección') || lower.includes('dilema')) {
      type = 'decision';
    } else if (lower.includes('llega') || lower.includes('aparece') || lower.includes('entra')) {
      type = 'arrival';
    } else if (lower.includes('traición') || lower.includes('traiciona') || lower.includes('engaña')) {
      type = 'betrayal';
    }
    
    return {
      type,
      description: cliffhanger,
      unresolved_question: `¿Qué pasará después de que ${cliffhanger.substring(0, 50)}...?`
    };
  } else if (typeof cliffhanger === 'object' && cliffhanger !== null) {
    const ch = cliffhanger as Record<string, unknown>;
    return {
      type: (ch.type as CliffhangerContract['type']) || 'unknown',
      description: (ch.description as string) || (ch.text as string) || '',
      unresolved_question: (ch.unresolved_question as string) || (ch.question as string) || ''
    };
  }
  
  return {
    type: 'unknown',
    description: 'Cliffhanger not specified',
    unresolved_question: ''
  };
}

function extractMoralDilemma(
  episodeBeat: Record<string, unknown>,
  seasonArc: Record<string, unknown>
): MoralDilemmaContract | undefined {
  // Check episode-level dilemma
  const epDilemma = episodeBeat.moral_dilemma || episodeBeat.dilema || episodeBeat.ethical_choice;
  
  if (typeof epDilemma === 'object' && epDilemma !== null) {
    const d = epDilemma as Record<string, unknown>;
    return {
      choice: (d.choice as string) || (d.question as string) || '',
      cost_if_yes: (d.cost_if_yes as string) || (d.consequence_yes as string) || '',
      cost_if_no: (d.cost_if_no as string) || (d.consequence_no as string) || '',
      who_decides: (d.who_decides as string) || (d.character as string) || ''
    };
  } else if (typeof epDilemma === 'string') {
    return {
      choice: epDilemma,
      cost_if_yes: '',
      cost_if_no: '',
      who_decides: ''
    };
  }
  
  // Check if this episode contains the season arc's final_choice
  const finalChoice = seasonArc?.final_choice as string;
  if (finalChoice) {
    const epNum = episodeBeat.episode as number;
    const totalEps = 8; // Typical series length
    
    // Final choice typically in last 2 episodes
    if (epNum >= totalEps - 1) {
      return {
        choice: finalChoice,
        cost_if_yes: 'To be dramatized',
        cost_if_no: 'To be dramatized',
        who_decides: 'Protagonist'
      };
    }
  }
  
  return undefined;
}

function extractStakes(
  episodeBeat: Record<string, unknown>,
  threads: ThreadContract[],
  setpiece: SetpieceContract
): string[] {
  const stakes: string[] = [];
  
  // From setpiece
  if (setpiece.stakes) {
    stakes.push(setpiece.stakes);
  }
  
  // From threads
  for (const thread of threads) {
    if (thread.stake) {
      stakes.push(`[${thread.id}] ${thread.stake}`);
    }
  }
  
  // From episode beat if present
  const epStakes = episodeBeat.stakes as string | string[];
  if (typeof epStakes === 'string') {
    stakes.push(epStakes);
  } else if (Array.isArray(epStakes)) {
    stakes.push(...epStakes);
  }
  
  return [...new Set(stakes)]; // Dedupe
}

function extractRequiredCharacters(
  episodeBeat: Record<string, unknown>,
  turningPoints: TurningPointContract[],
  setpiece: SetpieceContract
): string[] {
  const chars = new Set<string>();
  
  // From turning points agents
  for (const tp of turningPoints) {
    if (tp.agent && tp.agent !== 'UNKNOWN' && tp.agent !== 'UNSPECIFIED') {
      chars.add(tp.agent);
    }
  }
  
  // From setpiece participants
  for (const p of setpiece.participants) {
    chars.add(p);
  }
  
  // From episode beat characters_present
  const beatChars = episodeBeat.characters_present as string[] || episodeBeat.key_characters as string[];
  if (Array.isArray(beatChars)) {
    for (const c of beatChars) {
      if (typeof c === 'string') chars.add(c);
      else if (typeof c === 'object' && c !== null) chars.add((c as Record<string, unknown>).name as string);
    }
  }
  
  return Array.from(chars);
}

// ============================================================================
// MAIN EXTRACTION FUNCTION
// ============================================================================

/**
 * Extract structural contracts for a specific episode from the outline.
 * These contracts are NON-NEGOTIABLE for script generation.
 */
export function extractEpisodeContract(
  outline: Record<string, unknown>,
  episodeNumber: number
): EpisodeContract {
  const episodeBeats = outline.episode_beats as Array<Record<string, unknown>> || [];
  const episodeBeat = episodeBeats[episodeNumber - 1] || {};
  const seasonArc = outline.season_arc as Record<string, unknown> || {};
  const threadUsage = episodeBeat.thread_usage as Record<string, unknown> || {};
  
  // Extract all contract components
  const threads = extractThreadsForEpisode(outline, episodeNumber);
  const turningPoints = extractTurningPoints(episodeBeat);
  const factions = extractFactionsForEpisode(outline, episodeNumber);
  const setpiece = extractSetpiece(episodeBeat);
  const cliffhanger = extractCliffhanger(episodeBeat);
  const moralDilemma = extractMoralDilemma(episodeBeat, seasonArc);
  const stakes = extractStakes(episodeBeat, threads, setpiece);
  const characters = extractRequiredCharacters(episodeBeat, turningPoints, setpiece);
  
  return {
    episode_number: episodeNumber,
    title: (episodeBeat.title as string) || `Episodio ${episodeNumber}`,
    central_conflict: (episodeBeat.central_conflict as string) || '',
    threads_required: threads,
    turning_points: turningPoints,
    factions_in_play: factions,
    setpiece,
    cliffhanger,
    moral_dilemma: moralDilemma,
    stakes,
    characters_required: characters,
    crossover_event: (threadUsage.crossover_event as string) || ''
  };
}

/**
 * Extract contracts for ALL episodes in the outline.
 */
export function extractAllContracts(outline: Record<string, unknown>): EpisodeContract[] {
  const episodeBeats = outline.episode_beats as Array<Record<string, unknown>> || [];
  return episodeBeats.map((_, idx) => extractEpisodeContract(outline, idx + 1));
}

// ============================================================================
// CONTRACT FORMATTING FOR PROMPTS
// ============================================================================

/**
 * Format an episode contract for inclusion in an AI prompt.
 * This creates an IMPERATIVE block that forces contract adherence.
 */
export function formatContractForPrompt(contract: EpisodeContract): string {
  const lines: string[] = [];
  
  lines.push(`═══════════════════════════════════════════════════════════════`);
  lines.push(`⚠️ CONTRATOS ESTRUCTURALES - VIOLACIÓN = RECHAZO AUTOMÁTICO`);
  lines.push(`═══════════════════════════════════════════════════════════════`);
  lines.push(``);
  
  // Threads
  lines.push(`📌 THREADS QUE DEBEN AVANZAR EN ESTE EPISODIO:`);
  for (const thread of contract.threads_required) {
    const marker = thread.is_primary ? '🔴 PRINCIPAL' : '🟡 SECUNDARIO';
    lines.push(`  • [${thread.id}] ${marker}: "${thread.question}"`);
    lines.push(`    Motor narrativo: ${thread.engine}`);
    lines.push(`    En juego: ${thread.stake}`);
  }
  lines.push(``);
  
  // Turning Points
  lines.push(`📌 TURNING POINTS (ejecutar TODOS con escena dedicada):`);
  for (const tp of contract.turning_points) {
    lines.push(`  TP${tp.tp}:`);
    lines.push(`    AGENTE: ${tp.agent}`);
    lines.push(`    EVENTO: ${tp.event}`);
    lines.push(`    CONSECUENCIA: ${tp.consequence}`);
    lines.push(``);
  }
  
  // Factions
  if (contract.factions_in_play.length > 0) {
    lines.push(`📌 FACCIONES EN JUEGO (respetar reglas operativas):`);
    for (const faction of contract.factions_in_play) {
      lines.push(`  • ${faction.name}`);
      lines.push(`    Objetivo: ${faction.objective}`);
      lines.push(`    Método: ${faction.method}`);
      if (faction.red_line) {
        lines.push(`    ⛔ NUNCA haría: ${faction.red_line}`);
      }
    }
    lines.push(``);
  }
  
  // Setpiece
  lines.push(`📌 SETPIECE OBLIGATORIO:`);
  lines.push(`  Nombre: ${contract.setpiece.name}`);
  lines.push(`  Participantes: ${contract.setpiece.participants.join(', ')}`);
  lines.push(`  En juego: ${contract.setpiece.stakes}`);
  if (contract.setpiece.visual_hook) {
    lines.push(`  Visual: ${contract.setpiece.visual_hook}`);
  }
  lines.push(``);
  
  // Moral Dilemma
  if (contract.moral_dilemma) {
    lines.push(`📌 DILEMA MORAL DEL EPISODIO:`);
    lines.push(`  Elección: ${contract.moral_dilemma.choice}`);
    lines.push(`  Quien decide: ${contract.moral_dilemma.who_decides}`);
    if (contract.moral_dilemma.cost_if_yes) {
      lines.push(`  Coste si SÍ: ${contract.moral_dilemma.cost_if_yes}`);
    }
    if (contract.moral_dilemma.cost_if_no) {
      lines.push(`  Coste si NO: ${contract.moral_dilemma.cost_if_no}`);
    }
    lines.push(``);
  }
  
  // Cliffhanger
  lines.push(`📌 CLIFFHANGER OBLIGATORIO (última escena):`);
  lines.push(`  TIPO: ${contract.cliffhanger.type}`);
  lines.push(`  DESCRIPCIÓN: ${contract.cliffhanger.description}`);
  lines.push(`  PREGUNTA SIN RESPONDER: ${contract.cliffhanger.unresolved_question}`);
  lines.push(``);
  
  // Crossover Event
  if (contract.crossover_event) {
    lines.push(`📌 EVENTO CRUCE DE TRAMAS:`);
    lines.push(`  ${contract.crossover_event}`);
    lines.push(``);
  }
  
  // Stakes
  if (contract.stakes.length > 0) {
    lines.push(`📌 STAKES EXPLÍCITOS:`);
    for (const stake of contract.stakes) {
      lines.push(`  • ${stake}`);
    }
    lines.push(``);
  }
  
  // Characters
  lines.push(`📌 PERSONAJES QUE DEBEN APARECER:`);
  lines.push(`  ${contract.characters_required.join(', ')}`);
  lines.push(``);
  
  // Anti-simplification rules
  lines.push(`═══════════════════════════════════════════════════════════════`);
  lines.push(`⛔ PROHIBICIONES ABSOLUTAS:`);
  lines.push(`═══════════════════════════════════════════════════════════════`);
  lines.push(`  • NO resumas tramas - EXPANDE cada thread con escenas completas`);
  lines.push(`  • NO omitas turning points - CADA UNO requiere escena dedicada`);
  lines.push(`  • NO simplifiques dilemas - El personaje SUFRE la decisión`);
  lines.push(`  • NO cambies el cliffhanger planificado - ES el indicado arriba`);
  lines.push(`  • NO ignores reglas de facción - Personajes actúan SEGÚN su facción`);
  lines.push(`  • NO inventes personajes - USA SOLO los del contrato + biblia`);
  lines.push(``);
  
  return lines.join('\n');
}
