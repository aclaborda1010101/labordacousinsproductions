/**
 * FORMAT PROFILE - Selector de Ruta FILM vs SERIES
 * 
 * Bifurca completamente la lógica de generación basándose en el formato del proyecto.
 * - FILM: Estructura en 3 ACTOS, single-pass, sin episodios
 * - SERIES: Estructura episódica, fan-out A/B/C, con threads
 * - MINI: Estructura híbrida para miniseries (3-6 episodios)
 */

export type FormatType = 'FILM' | 'SERIES' | 'MINI';
export type StructureType = 'THREE_ACT' | 'EPISODIC' | 'HYBRID';

export interface FormatProfile {
  type: FormatType;
  duration_minutes: number | null;
  episodes: number | null;
  structure: StructureType;
  forbidden_words: string[];
  required_structure: string[];
  density_profile_key: string;
}

export interface ProjectFormatInput {
  format?: string | null;
  target_duration_min?: number | null;
  episodes_count?: number | null;
  creative_mode?: string | null;
}

/**
 * Construye el perfil de formato basado en la configuración del proyecto.
 * Este perfil determina qué prompts, estructuras y validaciones se aplican.
 */
export function buildFormatProfile(project: ProjectFormatInput): FormatProfile {
  const format = (project.format?.toLowerCase() || 'series') as string;
  const duration = project.target_duration_min || 110;
  const episodes = project.episodes_count || 10;
  
  // ═══════════════════════════════════════════════════════════════════════════
  // RUTA PELÍCULA
  // ═══════════════════════════════════════════════════════════════════════════
  if (format === 'film' || format === 'pelicula' || format === 'película' || format === 'movie') {
    return {
      type: 'FILM',
      duration_minutes: duration,
      episodes: null,
      structure: 'THREE_ACT',
      forbidden_words: [
        'episodio', 'episodios',
        'temporada', 'temporadas', 
        'capítulo', 'capítulos', 'capitulo', 'capitulos',
        'cliffhanger', 'cliffhangers',
        'season', 'seasons',
        'episode', 'episodes',
        'chapter', 'chapters',
        'serie', 'series'
      ],
      required_structure: [
        'ACT_I', 'ACT_II', 'ACT_III', 
        'inciting_incident', 
        'midpoint_reversal', 
        'climax',
        'resolution'
      ],
      density_profile_key: duration >= 110 ? 'film_120min' : 'film_90min'
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // RUTA MINISERIE
  // ═══════════════════════════════════════════════════════════════════════════
  if (format === 'mini' || format === 'miniserie' || format === 'miniseries' || 
      (format === 'series' && episodes <= 6)) {
    return {
      type: 'MINI',
      duration_minutes: null,
      episodes: Math.min(episodes, 6),
      structure: 'HYBRID',
      forbidden_words: [],
      required_structure: [
        'episode_beats', 
        'turning_points', 
        'season_arc',
        'midpoint_reversal'
      ],
      density_profile_key: 'miniserie_premium'
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // RUTA SERIE (DEFAULT)
  // ═══════════════════════════════════════════════════════════════════════════
  return {
    type: 'SERIES',
    duration_minutes: null,
    episodes: episodes,
    structure: 'EPISODIC',
    forbidden_words: [],
    required_structure: [
      'episode_beats', 
      'turning_points', 
      'cliffhanger',
      'season_arc',
      'threads'
    ],
    density_profile_key: episodes <= 6 ? 'streaming_limited' : 'streaming_standard'
  };
}

/**
 * Verifica si el texto contiene palabras prohibidas para el formato.
 * Retorna las violaciones encontradas.
 */
export function detectForbiddenWords(content: unknown, forbiddenWords: string[]): string[] {
  const violations: string[] = [];
  
  if (!content || forbiddenWords.length === 0) return violations;
  
  const textContent = typeof content === 'string' 
    ? content 
    : JSON.stringify(content);
  
  const lowerContent = textContent.toLowerCase();
  
  for (const word of forbiddenWords) {
    // Buscar como palabra completa (word boundary)
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    const matches = lowerContent.match(regex);
    if (matches) {
      violations.push(...matches);
    }
  }
  
  return [...new Set(violations)]; // Deduplicate
}

/**
 * Valida que el contenido tenga la estructura requerida para el formato.
 */
export function validateRequiredStructure(
  content: Record<string, unknown>, 
  requiredKeys: string[]
): { valid: boolean; missing: string[] } {
  const missing: string[] = [];
  
  for (const key of requiredKeys) {
    // Buscar la clave en cualquier nivel del objeto
    if (!hasNestedKey(content, key)) {
      missing.push(key);
    }
  }
  
  return {
    valid: missing.length === 0,
    missing
  };
}

/**
 * Busca una clave en un objeto anidado.
 */
function hasNestedKey(obj: Record<string, unknown>, key: string): boolean {
  if (key in obj) return true;
  
  for (const value of Object.values(obj)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      if (hasNestedKey(value as Record<string, unknown>, key)) return true;
    }
  }
  
  return false;
}

/**
 * Genera un resumen del perfil para logging/debugging.
 */
export function formatProfileSummary(profile: FormatProfile): string {
  return `[FORMAT] Type: ${profile.type} | Structure: ${profile.structure} | ` +
    `Duration: ${profile.duration_minutes || 'N/A'}min | Episodes: ${profile.episodes || 'N/A'} | ` +
    `Density Profile: ${profile.density_profile_key}`;
}
