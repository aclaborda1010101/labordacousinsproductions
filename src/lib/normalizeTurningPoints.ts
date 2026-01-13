/**
 * Normalize Turning Points - Converts string turning_points to structured objects
 * 
 * Problem: LLM sometimes returns turning_points as strings with format:
 *   "Evento... (Agent) → Consecuencia..."
 * 
 * QC expects objects: { tp, agent, event, consequence }
 * 
 * This normalizer runs on the frontend to display data correctly.
 */

export interface TPObj {
  tp: number;
  agent: string;
  event: string;
  consequence: string;
}

function safeTrim(x: unknown): string {
  return typeof x === 'string' ? x.trim() : '';
}

/**
 * Normalize a single turning point from string or object format
 * 
 * Supported string formats:
 * 1. "Evento (Agente) → Consecuencia"
 * 2. "Texto → Consecuencia" (agent defaults to "Narrador")
 * 3. Plain text (fallback)
 */
export function normalizeTurningPoint(tp: unknown, index: number): TPObj {
  // Already a valid object
  if (tp && typeof tp === 'object' && 'agent' in tp && 'event' in tp) {
    const o = tp as Record<string, unknown>;
    return {
      tp: typeof o.tp === 'number' ? o.tp : index + 1,
      agent: safeTrim(o.agent) || 'Narrador',
      event: safeTrim(o.event),
      consequence: safeTrim(o.consequence)
    };
  }

  // String parsing
  const s = String(tp ?? '').trim();
  
  // Pattern 1: "Evento (Agente) → Consecuencia"
  const match = s.match(/^(.+?)\s*\(([^)]+)\)\s*→\s*(.+)$/s);
  if (match) {
    return {
      tp: index + 1,
      event: match[1].trim(),
      agent: match[2].trim(),
      consequence: match[3].trim()
    };
  }

  // Pattern 2: "Texto → Consecuencia" (no explicit agent)
  const arrowMatch = s.match(/^(.+?)\s*→\s*(.+)$/s);
  if (arrowMatch) {
    // Try to extract agent from beginning (capitalized name)
    const agentMatch = arrowMatch[1].match(/^([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[yY]\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)?)/);
    return {
      tp: index + 1,
      agent: agentMatch ? agentMatch[1].trim() : 'Narrador',
      event: arrowMatch[1].trim(),
      consequence: arrowMatch[2].trim()
    };
  }

  // Fallback: plain string (still passes QC structurally)
  return {
    tp: index + 1,
    agent: 'Narrador',
    event: s.slice(0, 240).trim(),
    consequence: s.length > 240 ? s.slice(240).trim() : 'Aumenta la tensión del conflicto.'
  };
}

/**
 * Normalize all turning points in an array
 */
export function normalizeTurningPoints(tps: unknown[]): TPObj[] {
  if (!Array.isArray(tps)) return [];
  return tps.map((tp, i) => normalizeTurningPoint(tp, i));
}

/**
 * Normalize episode_beats array, converting all turning_points to objects
 */
export function normalizeEpisodeBeatsV11(beats: unknown[]): unknown[] {
  if (!Array.isArray(beats)) return [];
  
  return beats.map((ep: unknown) => {
    if (!ep || typeof ep !== 'object') return ep;
    
    const episode = ep as Record<string, unknown>;
    const tpsRaw = Array.isArray(episode.turning_points) ? episode.turning_points : [];
    
    return {
      ...episode,
      turning_points: normalizeTurningPoints(tpsRaw)
    };
  });
}

/**
 * Main normalizer: normalize entire outline, focusing on turning_points
 * Run this BEFORE QC validation to ensure consistent data structure
 */
export function normalizeOutlineV11<T extends Record<string, unknown>>(outline: T | null | undefined): T | null | undefined {
  if (!outline || typeof outline !== 'object') return outline;
  
  return {
    ...outline,
    episode_beats: normalizeEpisodeBeatsV11(outline.episode_beats as unknown[] || [])
  } as T;
}
