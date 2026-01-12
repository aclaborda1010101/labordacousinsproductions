import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { 
  v3RequireAuth, 
  v3RequireProjectAccess,
  v3AcquireProjectLock,
  v3ReleaseProjectLock,
  v3CheckRateLimit,
  v3LogRunStart,
  v3LogRunComplete,
  v3Error,
  corsHeaders,
  V3AuthContext
} from "../_shared/v3-enterprise.ts";

// ⚠️ MODEL CONFIGS - Lovable AI Gateway (GPT-5 family)
type GenerationModelType = 'rapido' | 'profesional' | 'hollywood';

interface ModelConfig {
  apiModel: string;
  provider: 'lovable';
  maxTokens: number;
  temperature: number;
}

// GPT-5 Family for consistent quality across all tiers
const MODEL_CONFIGS: Record<GenerationModelType, ModelConfig> = {
  rapido: {
    apiModel: 'openai/gpt-5-mini', // Fast, good quality for quick outlines
    provider: 'lovable',
    maxTokens: 6000,
    temperature: 0.8
  },
  profesional: {
    apiModel: 'openai/gpt-5', // High quality professional tier
    provider: 'lovable',
    maxTokens: 8000,
    temperature: 0.7
  },
  hollywood: {
    apiModel: 'openai/gpt-5.2', // Latest model, best quality
    provider: 'lovable',
    maxTokens: 10000,
    temperature: 0.8
  }
};

// Fallback model when primary model fails parsing
const FALLBACK_MODEL_CONFIG: ModelConfig = {
  apiModel: 'google/gemini-2.5-flash', // Fast fallback - much faster than GPT models
  provider: 'lovable',
  maxTokens: 8000,
  temperature: 0.7
};

// Ultra-fast model for summarization and batch merge
const FAST_MODEL_CONFIG: ModelConfig = {
  apiModel: 'google/gemini-2.5-flash', // Fastest multimodal model
  provider: 'lovable',
  maxTokens: 6000,
  temperature: 0.5
};

// =============================================================================
// LIGHT MODE CONSTRAINTS (token safety)
// =============================================================================
const LIGHT_MODE_LIMITS = {
  MAX_SCENES: 30,
  MAX_SUMMARY_SENTENCES: 2,
  MAX_CHARACTERS: 25,
  MAX_LOCATIONS: 20,
  MAX_PROPS: 15,
  MAX_SUBPLOTS: 8,
  MAX_TWISTS: 10
};

// MASTER SHOWRUNNER ENGINE - Narrative Mode System Prompts
const NARRATIVE_MODE_PROMPTS = {
  serie_adictiva: `MODO: SERIE ADICTIVA 🔥
  
Objetivo: Enganchar desde el primer episodio.
- Ritmo ALTO, sin escenas de relleno
- Estructura clara con escalada de tensión
- Cliffhanger POTENTE al final de cada episodio
- Al menos 1 evento IRREVERSIBLE por episodio
- Claridad narrativa sin simplismo

REGLAS QC:
- Cada episodio DEBE terminar con algo que obligue a ver el siguiente
- Cada episodio DEBE cambiar el estado del mundo (algo irreversible ocurre)
- PROHIBIDO cerrar episodios con "resolución cómoda"`,

  voz_de_autor: `MODO: VOZ DE AUTOR ✍️
  
Objetivo: Respetar y amplificar la identidad del texto original.

ANTES de escribir, debes identificar el AUTHOR_DNA:
- Tempo narrativo (rápido/lento/variable)
- Densidad léxica (minimalista/denso/poético)
- Temas recurrentes
- Iconos visuales característicos
- Reglas del mundo (qué puede/no puede ocurrir)

REGLAS:
- El AUTHOR_DNA se inyecta en TODAS las escenas
- Los conceptos deben expresarse mediante ACCIONES visibles
- Los personajes centrales son columna vertebral, no decoración
- Mantén la poesía del lenguaje original`,

  giro_imprevisible: `MODO: GIRO IMPREVISIBLE 🔀
  
Objetivo: Sorprender y reconfigurar la percepción del espectador.
Inspiración: Trance, Ocean's Eleven, The Prestige, Mr. Robot, Dark

REGLAS:
- El espectador cree entender algo que NO es cierto
- Al menos 1 GIRO ESTRUCTURAL por episodio
- Al menos 1 RECONTEXTUALIZACIÓN mayor por arco
- Uso de narradores NO FIABLES
- Información OMITIDA estratégicamente
- Escenas que engañan (muestran una cosa, significan otra)
- PROHIBIDA narrativa lineal simple

TÉCNICAS OBLIGATORIAS:
- Foreshadowing que solo se entiende en retrospectiva
- Escenas que adquieren nuevo significado después del giro
- Personajes con motivaciones ocultas`
};

const MASTER_SHOWRUNNER_CORE = `Eres MASTER_SHOWRUNNER_ENGINE.

NO eres un generador de texto.
Eres un showrunner, guionista jefe y supervisor narrativo de nivel estudio.

Tu función es diseñar series y películas:
- ADICTIVAS
- Con identidad CLARA
- Con consecuencias IRREVERSIBLES
- Que NO parezcan escritas por una IA

INTERPRETACIÓN DE TERMINOLOGÍA:
- "Capítulos" = EPISODIOS (siempre interpretar como episodios de la serie)
- "Capítulo 1, 2, 3..." = Episodio 1, 2, 3...
- Si el usuario menciona "X capítulos", generar X EPISODIOS

NUNCA:
- Escribas narrativa genérica tipo "TV premium"
- Uses plantillas previsibles
- Conviertas ideas en exposición o lore
- Cierres episodios sin intriga real

SIEMPRE:
- Convierte ideas en ACCIONES
- Convierte conceptos en DECISIONES
- Convierte decisiones en CONSECUENCIAS
- Cambia el estado del mundo en cada episodio
- Deja al espectador con NECESIDAD de continuar

REGLAS QC (OBLIGATORIO):

Cada EPISODIO debe:
✓ Terminar con un cliffhanger REAL
✓ Cambiar el estado del mundo
✓ Incluir al menos UNO de:
  • Revelación que cambia todo
  • Pérdida irreversible
  • Decisión sin retorno
  • Información que recontextualiza lo anterior

Cada ESCENA debe:
✓ Tener OBJETIVO claro
✓ Tener CONFLICTO
✓ Forzar una DECISIÓN
✓ Generar CONSECUENCIA

Si alguna regla no se cumple → REESCRIBIR.`;

// Tool schema for structured output
const OUTLINE_TOOL_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'Título evocador y memorable' },
    logline: { type: 'string', description: '1-2 frases que VENDAN la serie con intriga' },
    genre: { type: 'string' },
    tone: { type: 'string' },
    narrative_mode: { type: 'string', description: 'Modo narrativo aplicado' },
    synopsis: { type: 'string', description: '150-250 palabras. NO resumen, sino PROMESA narrativa' },
    extracted_entities: {
      type: 'object',
      description: 'Entidades identificadas explícitamente en la idea del usuario',
      properties: {
        characters_from_idea: { type: 'array', items: { type: 'string' }, description: 'Nombres de personajes mencionados en la idea' },
        locations_from_idea: { type: 'array', items: { type: 'string' }, description: 'Lugares mencionados en la idea' },
        props_from_idea: { type: 'array', items: { type: 'string' }, description: 'Objetos importantes mencionados en la idea' }
      }
    },
    main_characters: {
      type: 'array',
      description: 'TODOS los personajes: protagonistas, antagonistas, secundarios, recurrentes, cameos, colectivos',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          role: { type: 'string', enum: ['protagonist', 'antagonist', 'supporting', 'recurring', 'cameo', 'extra_with_line', 'collective_entity'] },
          entity_type: { type: 'string', enum: ['individual', 'collective', 'civilization', 'historical_figure'], description: 'Tipo de entidad' },
          description: { type: 'string', description: 'Físico + personalidad + FLAW' },
          secret: { type: 'string', description: 'Qué oculta este personaje (opcional)' },
          want: { type: 'string', description: 'Deseo consciente (opcional)' },
          need: { type: 'string', description: 'Necesidad inconsciente (opcional)' },
          from_idea: { type: 'boolean', description: 'True si este personaje fue mencionado explícitamente en la idea' }
        },
        required: ['name', 'role', 'description']
      }
    },
    main_locations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          type: { type: 'string', enum: ['INT', 'EXT', 'INT/EXT', 'PLANETARY', 'COSMIC', 'HISTORICAL'] },
          scale: { type: 'string', enum: ['room', 'building', 'city', 'continent', 'planetary', 'cosmic'] },
          description: { type: 'string' },
          atmosphere: { type: 'string', description: 'Qué SIENTE el espectador aquí' },
          from_idea: { type: 'boolean', description: 'True si esta locación fue mencionada explícitamente en la idea' }
        },
        required: ['name', 'type', 'description']
      }
    },
    main_props: {
      type: 'array',
      description: 'Objetos importantes para la trama (armas, documentos, objetos simbólicos, vehículos, tecnología)',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          importance: { type: 'string', enum: ['hero', 'key', 'recurring'] },
          description: { type: 'string' },
          narrative_function: { type: 'string', description: 'Por qué este objeto es importante para la trama' },
          from_idea: { type: 'boolean', description: 'True si este prop fue mencionado explícitamente en la idea' }
        },
        required: ['name', 'importance', 'description']
      }
    },
    subplots: {
      type: 'array',
      description: 'Subtramas paralelas a la trama principal',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Nombre descriptivo de la subtrama' },
          description: { type: 'string', description: 'Resumen de qué trata la subtrama' },
          characters_involved: { type: 'array', items: { type: 'string' }, description: 'Personajes implicados' },
          resolution: { type: 'string', description: 'Cómo se resuelve (o si queda abierta)' }
        },
        required: ['name', 'description']
      }
    },
    plot_twists: {
      type: 'array',
      description: 'Giros narrativos principales de la historia',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Nombre del giro' },
          episode: { type: 'number', description: 'Episodio donde ocurre' },
          description: { type: 'string', description: 'Descripción del giro' },
          impact: { type: 'string', enum: ['minor', 'major', 'paradigm_shift'], description: 'Nivel de impacto' }
        },
        required: ['name', 'description', 'impact']
      }
    },
    episode_beats: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          episode: { type: 'number' },
          title: { type: 'string' },
          summary: { type: 'string', description: '3-4 frases: qué pasa + conflicto + consecuencia' },
          irreversible_event: { type: 'string', description: 'El evento que cambia todo este episodio' },
          cliffhanger: { type: 'string', description: 'Cómo termina el episodio (debe generar NECESIDAD de ver más)' },
          subplot_progress: { type: 'array', items: { type: 'string' }, description: 'Subtramas que avanzan en este episodio' }
        },
        required: ['episode', 'title', 'summary', 'cliffhanger']
      }
    },
    author_dna: {
      type: 'object',
      description: 'Solo para modo voz_de_autor',
      properties: {
        tempo: { type: 'string' },
        density: { type: 'string' },
        lexicon: { type: 'string' },
        poetry_level: { type: 'string' },
        core_themes: { type: 'array', items: { type: 'string' } },
        recurring_icons: { type: 'array', items: { type: 'string' } }
      }
    },
    qc_status: { type: 'string', enum: ['pass', 'fail'], description: 'Auto-QC: pass si cumple todas las reglas' }
  },
  required: ['title', 'logline', 'genre', 'tone', 'synopsis', 'main_characters', 'main_locations', 'main_props', 'subplots', 'plot_twists', 'episode_beats', 'qc_status']
};

// =============================================================================
// ROBUST JSON PARSING V2 (HARDENED - never crashes)
// =============================================================================

/**
 * Two-pass JSON parsing with salvage recovery.
 * Returns parsed object or throws with detailed info.
 */
function parseJsonSafe(raw: string, label: string): any {
  const input = (raw ?? '').trim();
  if (!input) throw new Error('Empty JSON input');

  // Pass 1: Clean common artifacts
  const cleanup = (s: string) => {
    let t = (s ?? '').trim();
    // Remove markdown fences
    t = t.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    // Fix occasional union-type artifacts: "mood": "x" | "y"
    t = t.replace(/"([^"]+)"\s*\|\s*"[^"]+"/g, '"$1"');
    t = t.replace(/:\s*"([^"]*)\s*\|\s*([^"]*)"/g, ': "$1 $2"');
    // Remove trailing commas before } or ]
    t = t.replace(/,(\s*[}\]])/g, '$1');
    return t;
  };

  // Extract largest balanced JSON structure
  const extractLargestJson = (s: string): string => {
    const t = cleanup(s);
    
    // Try to find markdown-fenced JSON first
    const mdMatch = t.match(/```json\s*([\s\S]*?)\s*```/i) || t.match(/```\s*([\s\S]*?)\s*```/i);
    if (mdMatch?.[1]) return mdMatch[1].trim();
    
    // Find first { and extract to the matching }
    const firstBrace = t.indexOf('{');
    if (firstBrace === -1) {
      // Try array
      const firstBracket = t.indexOf('[');
      if (firstBracket === -1) return t;
      return t.substring(firstBracket);
    }
    return t.substring(firstBrace);
  };

  // Repair truncated JSON by balancing braces/brackets
  const repairTruncation = (s: string): string => {
    let t = cleanup(s);
    
    // Find last valid closing character
    let lastValid = -1;
    for (let i = t.length - 1; i >= 0; i--) {
      if (t[i] === '}' || t[i] === ']' || t[i] === '"' || /[a-zA-Z0-9]/.test(t[i])) {
        lastValid = i;
        break;
      }
    }
    
    if (lastValid > 0 && lastValid < t.length - 1) {
      t = t.substring(0, lastValid + 1);
    }
    
    // Remove trailing incomplete key-value pairs
    // Pattern: ,"key": or ,"key" at end
    t = t.replace(/,\s*"[^"]*":\s*$/, '');
    t = t.replace(/,\s*"[^"]*"\s*$/, '');
    t = t.replace(/,\s*$/, '');
    
    // Count and balance
    const openBraces = (t.match(/\{/g) || []).length;
    const closeBraces = (t.match(/\}/g) || []).length;
    const openBrackets = (t.match(/\[/g) || []).length;
    const closeBrackets = (t.match(/\]/g) || []).length;
    
    // Close open strings if needed (heuristic)
    const quotes = (t.match(/"/g) || []).length;
    if (quotes % 2 !== 0) {
      t += '"';
    }
    
    // Add missing brackets first (inner), then braces (outer)
    t += ']'.repeat(Math.max(0, openBrackets - closeBrackets));
    t += '}'.repeat(Math.max(0, openBraces - closeBraces));
    
    return t;
  };

  const tryParse = (candidate: string) => {
    const t = cleanup(candidate);
    return JSON.parse(t);
  };

  // Pass 1: Direct parse
  try {
    return tryParse(input);
  } catch (err1) {
    console.warn(`[OUTLINE] JSON parse failed (${label}). Attempting extraction...`);
    console.warn('[OUTLINE] Raw (first 500 chars):', input.slice(0, 500));

    // Pass 2: Extract and parse
    const extracted = extractLargestJson(input);
    try {
      return tryParse(extracted);
    } catch (err2) {
      console.warn(`[OUTLINE] Extraction failed. Attempting truncation repair...`);
      
      // Pass 3: Repair truncation
      const repaired = repairTruncation(extracted);
      try {
        return tryParse(repaired);
      } catch (err3) {
        // Final attempt: aggressive repair
        console.warn(`[OUTLINE] Repair failed. Trying aggressive salvage...`);
        
        // Try to at least get partial data by finding complete objects
        const aggressiveRepair = repaired
          .replace(/,\s*"[^"]*":\s*\{[^}]*$/g, '') // Remove incomplete nested objects
          .replace(/,\s*"[^"]*":\s*\[[^\]]*$/g, '') // Remove incomplete arrays
          .replace(/,\s*"[^"]*":\s*"[^"]*$/g, ''); // Remove incomplete strings
        
        try {
          return tryParse(repairTruncation(aggressiveRepair));
        } catch {
          // Give up - will trigger fallback
          throw new Error(`All JSON parse attempts failed for ${label}`);
        }
      }
    }
  }
}

/**
 * Normalize and enforce LIGHT mode limits on outline.
 */
function normalizeOutline(input: any): any {
  const obj = (input && typeof input === 'object') ? input : {};
  const extracted = (obj.extracted_entities && typeof obj.extracted_entities === 'object') ? obj.extracted_entities : {};

  // Truncate summary to 2 sentences max for LIGHT mode
  const truncateSummary = (s: string): string => {
    if (!s || typeof s !== 'string') return '';
    const sentences = s.split(/(?<=[.!?])\s+/).slice(0, LIGHT_MODE_LIMITS.MAX_SUMMARY_SENTENCES);
    return sentences.join(' ');
  };

  // Process episode beats with LIGHT constraints
  let episodeBeats = Array.isArray(obj.episode_beats) ? obj.episode_beats : [];
  episodeBeats = episodeBeats.slice(0, LIGHT_MODE_LIMITS.MAX_SCENES).map((b: any) => ({
    ...b,
    summary: truncateSummary(b?.summary || '')
  }));

  return {
    ...obj,
    title: obj.title ?? null,
    logline: obj.logline ?? null,
    genre: obj.genre ?? null,
    tone: obj.tone ?? null,
    narrative_mode: obj.narrative_mode ?? null,
    synopsis: obj.synopsis ?? null,
    qc_status: obj.qc_status === 'pass' || obj.qc_status === 'fail' ? obj.qc_status : 'fail',

    extracted_entities: {
      ...extracted,
      characters_from_idea: Array.isArray(extracted.characters_from_idea) ? extracted.characters_from_idea : [],
      locations_from_idea: Array.isArray(extracted.locations_from_idea) ? extracted.locations_from_idea : [],
      props_from_idea: Array.isArray(extracted.props_from_idea) ? extracted.props_from_idea : [],
    },

    // Apply LIGHT mode caps
    main_characters: (Array.isArray(obj.main_characters) ? obj.main_characters : []).slice(0, LIGHT_MODE_LIMITS.MAX_CHARACTERS),
    main_locations: (Array.isArray(obj.main_locations) ? obj.main_locations : []).slice(0, LIGHT_MODE_LIMITS.MAX_LOCATIONS),
    main_props: (Array.isArray(obj.main_props) ? obj.main_props : []).slice(0, LIGHT_MODE_LIMITS.MAX_PROPS),
    subplots: (Array.isArray(obj.subplots) ? obj.subplots : []).slice(0, LIGHT_MODE_LIMITS.MAX_SUBPLOTS),
    plot_twists: (Array.isArray(obj.plot_twists) ? obj.plot_twists : []).slice(0, LIGHT_MODE_LIMITS.MAX_TWISTS),
    episode_beats: episodeBeats,
  };
}

/**
 * Build degraded fallback outline when parsing completely fails.
 */
function buildFallbackOutline(expectedEpisodes: number): any {
  return {
    title: null,
    logline: null,
    genre: null,
    tone: null,
    narrative_mode: null,
    synopsis: null,
    qc_status: 'fail',
    extracted_entities: {
      characters_from_idea: [],
      locations_from_idea: [],
      props_from_idea: []
    },
    main_characters: [],
    main_locations: [],
    main_props: [],
    subplots: [],
    plot_twists: [],
    episode_beats: Array.from({ length: expectedEpisodes }, (_, i) => ({
      episode: i + 1,
      title: `Episodio ${i + 1}`,
      summary: 'Por generar',
      cliffhanger: 'Por definir'
    }))
  };
}

/**
 * Log event to editorial_events table (best-effort, non-blocking).
 */
async function logEditorialEvent(
  projectId: string | null,
  eventType: string,
  payload: Record<string, any>
): Promise<void> {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !supabaseKey || !projectId) return;

    const supabase = createClient(supabaseUrl, supabaseKey);
    await supabase.from('editorial_events').insert({
      project_id: projectId,
      event_type: eventType,
      asset_type: 'outline',
      payload
    });
  } catch (e) {
    console.warn('[OUTLINE] Failed to log editorial event:', e);
  }
}

// =============================================================================
// V4.2: TIMEOUT CONFIGURATION - Optimized for different operations
// =============================================================================
const SUMMARIZE_TIMEOUT_MS = 15000; // 15 seconds for summarization
const GENERATION_TIMEOUT_MS = 45000; // 45 seconds for main generation
const BATCH_TIMEOUT_MS = 40000; // 40 seconds per batch
const MAX_EPISODES_PER_BATCH = 5; // Split large series into batches of 5

async function callWithTimeout<T>(
  promise: Promise<T>, 
  timeoutMs: number, 
  operationName: string
): Promise<T> {
  let timeoutId: number;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`AI_TIMEOUT:${operationName}`)), timeoutMs);
  });
  
  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutId!);
    return result;
  } catch (err) {
    clearTimeout(timeoutId!);
    throw err;
  }
}

// =============================================================================
// V4.2: SUMMARIZE LONG TEXT - For texts > 15k chars (reduced from 25k)
// =============================================================================
const MAX_IDEA_CHARS = 15000; // Reduced for faster processing

async function summarizeLongText(idea: string): Promise<{ summary: string; wasSummarized: boolean }> {
  if (idea.length <= MAX_IDEA_CHARS) {
    return { summary: idea, wasSummarized: false };
  }
  
  console.log(`[OUTLINE] Idea too long (${idea.length} chars). Summarizing with fast model...`);
  
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY not configured');
  
  const summaryPrompt = `Resume el siguiente texto para generación de outline audiovisual:\n\n${idea}`;
  const systemPrompt = `Eres un asistente que resume guiones y novelas para producción audiovisual.
          
INSTRUCCIONES:
1. Resume el texto manteniendo TODOS los elementos narrativos clave:
   - Nombres de TODOS los personajes mencionados
   - TODAS las localizaciones específicas
   - Arcos argumentales principales
   - Eventos clave y giros dramáticos
   - Relaciones entre personajes
   - Tono y género

2. Mantén el resumen en máximo 8,000 caracteres
3. NO omitas personajes ni localizaciones - son críticos para la producción
4. Usa el mismo idioma que el texto original`;

  // Try fast model first (google/gemini-2.5-flash)
  const tryModel = async (model: string): Promise<string | null> => {
    try {
      const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          max_completion_tokens: 4000,
          temperature: 0.3,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: summaryPrompt }
          ]
        })
      });
      
      if (!response.ok) {
        console.warn(`[OUTLINE] Summary with ${model} failed: ${response.status}`);
        return null;
      }
      
      const data = await response.json();
      return data.choices?.[0]?.message?.content || null;
    } catch (e) {
      console.warn(`[OUTLINE] Summary with ${model} exception:`, e);
      return null;
    }
  };

  // Try fast model with timeout
  let summaryText: string | null = null;
  
  try {
    summaryText = await callWithTimeout(
      tryModel('google/gemini-2.5-flash'),
      SUMMARIZE_TIMEOUT_MS,
      'summary_gemini'
    );
  } catch (e) {
    console.warn('[OUTLINE] Fast model timed out, trying fallback...');
  }
  
  // Fallback to gpt-5-mini if gemini failed
  if (!summaryText) {
    try {
      summaryText = await callWithTimeout(
        tryModel('openai/gpt-5-mini'),
        SUMMARIZE_TIMEOUT_MS,
        'summary_gpt5mini'
      );
    } catch (e) {
      console.warn('[OUTLINE] Fallback model also timed out');
    }
  }
  
  // Final fallback: truncate
  if (!summaryText) {
    console.error('[OUTLINE] All summary attempts failed, using truncated original');
    return { 
      summary: idea.slice(0, MAX_IDEA_CHARS) + '\n\n[TEXTO TRUNCADO - El documento original es más largo]', 
      wasSummarized: true 
    };
  }
  
  console.log(`[OUTLINE] Summarized ${idea.length} chars -> ${summaryText.length} chars`);
  return { summary: summaryText, wasSummarized: true };
}

// =============================================================================
// V4.2: BATCH EPISODE GENERATION - Split large series into manageable chunks
// =============================================================================
async function generateEpisodeBatch(
  systemPrompt: string,
  baseUserPrompt: string,
  config: ModelConfig,
  startEpisode: number,
  endEpisode: number,
  totalEpisodes: number,
  previousContext?: string
): Promise<{ beats: any[]; parseWarnings: string[] }> {
  const batchSize = endEpisode - startEpisode + 1;
  const parseWarnings: string[] = [];
  
  const batchPrompt = `${baseUserPrompt}

━━━━━━━━━━━━━━━━━━━━━━━━━━
GENERACIÓN POR LOTES - LOTE ${startEpisode}-${endEpisode} de ${totalEpisodes}
━━━━━━━━━━━━━━━━━━━━━━━━━━
Genera SOLO los episodios ${startEpisode} a ${endEpisode} (${batchSize} episodios).
${previousContext ? `\nCONTEXTO DE EPISODIOS ANTERIORES:\n${previousContext}` : ''}

episode_beats debe contener EXACTAMENTE ${batchSize} elementos numerados ${startEpisode}..${endEpisode}.`;

  // Simplified tool schema for batch - only need episode_beats
  const BATCH_TOOL_SCHEMA = {
    type: 'object',
    properties: {
      episode_beats: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            episode: { type: 'number' },
            title: { type: 'string' },
            summary: { type: 'string' },
            irreversible_event: { type: 'string' },
            cliffhanger: { type: 'string' },
            subplot_progress: { type: 'array', items: { type: 'string' } }
          },
          required: ['episode', 'title', 'summary', 'cliffhanger']
        }
      }
    },
    required: ['episode_beats']
  };

  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY not configured');

  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.apiModel,
      max_completion_tokens: 4000,
      temperature: config.temperature,
      messages: [
        { role: 'system', content: systemPrompt + '\n\nGenera SOLO episode_beats en formato JSON usando la herramienta.' },
        { role: 'user', content: batchPrompt }
      ],
      tools: [
        {
          type: 'function',
          function: {
            name: 'deliver_episode_beats',
            description: 'Entrega los beats de episodios para este lote.',
            parameters: BATCH_TOOL_SCHEMA
          }
        }
      ],
      tool_choice: { type: 'function', function: { name: 'deliver_episode_beats' } }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[BATCH] API error:', response.status, errorText);
    parseWarnings.push(`BATCH_${startEpisode}_${endEpisode}_FAILED`);
    return { beats: [], parseWarnings };
  }

  const data = await response.json();
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  const toolArgs = toolCall?.function?.arguments;

  if (typeof toolArgs === 'string') {
    try {
      const parsed = parseJsonSafe(toolArgs, `batch_${startEpisode}_${endEpisode}`);
      const beats = Array.isArray(parsed.episode_beats) ? parsed.episode_beats : [];
      console.log(`[BATCH] Generated ${beats.length} beats for episodes ${startEpisode}-${endEpisode}`);
      return { beats, parseWarnings };
    } catch (e) {
      console.error('[BATCH] Parse failed:', e);
      parseWarnings.push(`BATCH_PARSE_${startEpisode}_${endEpisode}_FAILED`);
    }
  }

  return { beats: [], parseWarnings };
}

// Lovable AI Gateway call with hardened parsing
async function callLovableAI(
  systemPrompt: string,
  userPrompt: string,
  config: ModelConfig,
  expectedEpisodes: number,
  overrideMaxTokens?: number // V3.4: Allow override for long texts
): Promise<{ outline: any; parseWarnings: string[]; durationMs: number }> {
  const parseWarnings: string[] = [];
  const callStartTime = Date.now();
  
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY not configured');
  
  const effectiveMaxTokens = overrideMaxTokens ?? config.maxTokens;

  console.log(`[OUTLINE] Calling Lovable AI: model=${config.apiModel}, maxTokens=${effectiveMaxTokens}, temp=${config.temperature}`);
  
  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.apiModel,
      max_completion_tokens: effectiveMaxTokens,
      temperature: config.temperature,
      messages: [
        { role: 'system', content: systemPrompt + '\n\nResponde ÚNICAMENTE en formato JSON válido usando la herramienta deliver_outline.' },
        { role: 'user', content: userPrompt }
      ],
      tools: [
        {
          type: 'function',
          function: {
            name: 'deliver_outline',
            description: 'Entrega el outline estructurado con estilo MASTER SHOWRUNNER.',
            parameters: OUTLINE_TOOL_SCHEMA
          }
        }
      ],
      tool_choice: { type: 'function', function: { name: 'deliver_outline' } }
    })
  });

  // Handle rate limits and payment required
  if (response.status === 429) {
    throw { status: 429, message: 'Rate limit exceeded. Try again later.', retryable: true };
  }
  if (response.status === 402) {
    throw { status: 402, message: 'Payment required - add credits to Lovable AI workspace' };
  }

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[OUTLINE Lovable AI ERROR]', response.status, errorText);
    throw new Error(`Lovable AI Gateway error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  
  // Extract tool call result (OpenAI-compatible format)
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  const toolArgs = toolCall?.function?.arguments;
  const content = data.choices?.[0]?.message?.content ?? '';
  const finishReason = data.choices?.[0]?.finish_reason;

  // DEBUG LOGGING: Log exactly what the model returns
  console.log('[OUTLINE DEBUG] Response structure:', JSON.stringify({
    hasToolCalls: !!data.choices?.[0]?.message?.tool_calls,
    toolCallsCount: data.choices?.[0]?.message?.tool_calls?.length ?? 0,
    toolCallName: toolCall?.function?.name ?? 'none',
    toolArgsLength: typeof toolArgs === 'string' ? toolArgs.length : 0,
    toolArgsPreview: typeof toolArgs === 'string' ? toolArgs.slice(0, 200) : 'N/A',
    contentLength: content?.length || 0,
    contentPreview: content?.slice(0, 200) || 'N/A',
    finishReason: finishReason
  }));
  
  const durationMs = Date.now() - callStartTime;
  console.log(`[OUTLINE] AI call completed in ${durationMs}ms`);

  // Try tool call arguments first
  if (toolCall?.function?.name === 'deliver_outline' && typeof toolArgs === 'string') {
    try {
      return { outline: normalizeOutline(parseJsonSafe(toolArgs, 'lovable.tool_call.arguments')), parseWarnings, durationMs };
    } catch (e) {
      parseWarnings.push('TOOL_CALL_PARSE_FAILED');
      console.warn('[OUTLINE] Tool-call JSON invalid. Details:', (e as Error).message);
      console.warn('[OUTLINE] Tool args (first 1000 chars):', toolArgs.slice(0, 1000));
    }
  }

  // Fallback: try to parse from content
  const candidate = content || (typeof toolArgs === 'string' ? toolArgs : '');

  if (candidate) {
    try {
      return { outline: normalizeOutline(parseJsonSafe(candidate, 'lovable.content')), parseWarnings, durationMs };
    } catch (e) {
      parseWarnings.push('CONTENT_PARSE_FAILED');
      console.warn('[OUTLINE] Content JSON also invalid. Details:', (e as Error).message);
    }
  }

  // Try aggressive JSON extraction from any available text
  const allText = [toolArgs, content].filter(Boolean).join('\n');
  if (allText) {
    // Look for JSON structure with episode_beats (key indicator of valid outline)
    const jsonMatch = allText.match(/\{[\s\S]*?"episode_beats"[\s\S]*?\[[\s\S]*?\][\s\S]*?\}/);
    if (jsonMatch) {
      try {
        console.log('[OUTLINE] Attempting aggressive JSON extraction...');
        return { outline: normalizeOutline(parseJsonSafe(jsonMatch[0], 'lovable.aggressive')), parseWarnings, durationMs };
      } catch (e) {
        parseWarnings.push('AGGRESSIVE_PARSE_FAILED');
        console.warn('[OUTLINE] Aggressive extraction also failed.');
      }
    }
  }

  // Return degraded fallback
  parseWarnings.push('LOVABLE_JSON_PARSE_FAILED');
  return { outline: buildFallbackOutline(expectedEpisodes), parseWarnings, durationMs };
}

// =============================================================================
// V4.0: POLLING ARCHITECTURE - Helper to update outline record in DB
// =============================================================================
async function updateOutlineRecord(
  supabaseClient: any,
  outlineId: string,
  updates: {
    status?: 'generating' | 'draft' | 'approved' | 'rejected' | 'error';
    outline_json?: any;
    quality?: string;
    qc_issues?: string[];
  }
): Promise<void> {
  try {
    const payload: Record<string, any> = { updated_at: new Date().toISOString() };
    if (updates.status !== undefined) payload.status = updates.status;
    if (updates.outline_json !== undefined) payload.outline_json = updates.outline_json;
    if (updates.quality !== undefined) payload.quality = updates.quality;
    if (updates.qc_issues !== undefined) payload.qc_issues = updates.qc_issues;

    const { error } = await supabaseClient
      .from('project_outlines')
      .update(payload)
      .eq('id', outlineId);
    
    if (error) {
      console.error('[OUTLINE] Failed to update outline record:', error);
    }
  } catch (e) {
    console.error('[OUTLINE] Exception updating outline record:', e);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // =======================================================================
  // V3.0 ENTERPRISE AUTHENTICATION
  // =======================================================================
  const authResult = await v3RequireAuth(req);
  if (authResult instanceof Response) {
    return authResult;
  }
  const auth: V3AuthContext = authResult;

  // Track for logging and cleanup
  let projectId: string | null = null;
  let lockAcquired = false;
  let runId: string | null = null;
  let outlineRecordId: string | null = null;
  const startTime = Date.now();

  try {
    const body = await req.json();
    const { 
      idea, 
      genre, 
      tone, 
      format, 
      episodesCount, 
      language, 
      narrativeMode, 
      densityTargets,
      disableDensity = false, // V3.0: Skip density constraints when true
      usePolling = true // V4.0: Enable polling by default
    } = body;

    // V3.1: Accept both qualityTier (frontend) and generationModel (legacy) for compatibility
    const generationModel = body.qualityTier || body.generationModel || 'rapido';
    // V3.1: Accept both projectId (frontend) and project_id (legacy) for compatibility
    projectId = body.projectId || body.project_id || null;

    if (!idea) {
      return v3Error('VALIDATION_ERROR', 'Idea requerida', 400);
    }

    // =======================================================================
    // V3.0 PROJECT ACCESS + LOCKING + RATE LIMIT
    // =======================================================================
    if (projectId) {
      const accessResult = await v3RequireProjectAccess(auth, projectId);
      if (accessResult instanceof Response) {
        return accessResult;
      }

      // V4.1: Auto-cleanup stale locks (older than 5 minutes)
      const STALE_LOCK_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
      try {
        const { data: staleLock } = await auth.supabase
          .from('project_locks')
          .select('created_at')
          .eq('project_id', projectId)
          .single();

        if (staleLock) {
          const lockAge = Date.now() - new Date(staleLock.created_at).getTime();
          if (lockAge > STALE_LOCK_THRESHOLD_MS) {
            console.log('[V3-LOCK] Cleaning stale lock:', { projectId, ageMinutes: Math.round(lockAge / 60000) });
            await auth.supabase
              .from('project_locks')
              .delete()
              .eq('project_id', projectId);
            
            // Also mark any stuck 'generating' outlines as error
            await auth.supabase
              .from('project_outlines')
              .update({ 
                status: 'error', 
                qc_issues: ['Timeout del servidor - generación interrumpida'] 
              })
              .eq('project_id', projectId)
              .eq('status', 'generating');
          }
        }
      } catch (e) {
        console.warn('[V3-LOCK] Stale lock check failed (non-critical):', e);
      }

      // Acquire project lock
      const lockResult = await v3AcquireProjectLock(
        auth.supabase,
        projectId,
        auth.userId,
        'outline_generation',
        300 // 5 minutes max for outline
      );

      if (!lockResult.acquired) {
        return v3Error('PROJECT_BUSY', 'Este proyecto ya está generando contenido', 409, lockResult.retryAfter);
      }
      lockAcquired = true;

      // Check rate limit
      const rateLimitResult = await v3CheckRateLimit(projectId, auth.userId, 'generate-outline-light', 5);
      if (!rateLimitResult.allowed) {
        await v3ReleaseProjectLock(auth.supabase, projectId);
        lockAcquired = false;
        return v3Error('RATE_LIMIT_EXCEEDED', 'Demasiadas solicitudes, espera un momento', 429, rateLimitResult.retryAfter);
      }
    }

    // Log run start
    runId = await v3LogRunStart({
      userId: auth.userId,
      projectId: projectId || undefined,
      functionName: 'generate-outline-light',
      provider: generationModel === 'hollywood' ? 'anthropic' : 'openai',
    });

    // Validate and get model config - NO truncation, NO auto-downgrade (user preference)
    const effectiveModelKey = (generationModel as GenerationModelType) in MODEL_CONFIGS 
      ? generationModel as GenerationModelType 
      : 'rapido';
    
    const modelConfig = MODEL_CONFIGS[effectiveModelKey];
    const effectiveMaxTokens = modelConfig.maxTokens;
    const ideaLength = idea.length;

    // Lovable AI Gateway - no external API key needed
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY no configurada');
    }

    // Episode count: prefer explicit mention in the idea (e.g. "8 capítulos"), otherwise use UI selection
    const defaultEpisodesCount = format === 'series'
      ? Math.max(1, Number(episodesCount || 6))
      : 1;

    const extractEpisodeCountFromIdea = (text: string): number | null => {
      if (!text) return null;
      const normalized = text.toLowerCase();
      const m = normalized.match(/(?:^|[^0-9])(\d{1,3})\s*(episodios?|cap[ií]tulos?)\b/);
      if (!m) return null;
      const n = Number(m[1]);
      if (!Number.isFinite(n) || n <= 0) return null;
      return n;
    };

    const explicitEpisodesCount = format === 'series'
      ? extractEpisodeCountFromIdea(idea)
      : null;

    const desiredEpisodesCount = format === 'series'
      ? (explicitEpisodesCount ?? defaultEpisodesCount)
      : 1;

    // Cap episodes for LIGHT mode
    const cappedEpisodesCount = Math.min(desiredEpisodesCount, LIGHT_MODE_LIMITS.MAX_SCENES);

    // =======================================================================
    // V4.0 POLLING: Create outline record in 'generating' state BEFORE generation
    // =======================================================================
    if (usePolling && projectId) {
      // Delete any existing outline for this project first
      await auth.supabase
        .from('project_outlines')
        .delete()
        .eq('project_id', projectId);

      // Create new outline record with 'generating' status
      const { data: outlineRecord, error: insertErr } = await auth.supabase
        .from('project_outlines')
        .insert({
          project_id: projectId,
          outline_json: {},
          quality: 'generating',
          qc_issues: [],
          status: 'generating',
          idea: idea.slice(0, 50000), // Store idea for reference (capped at 50K chars)
          genre: genre || null,
          tone: tone || null,
          format: format || null,
          episode_count: cappedEpisodesCount,
        })
        .select('id')
        .single();

      if (insertErr) {
        console.error('[OUTLINE] Failed to create generating outline record:', insertErr);
        // Continue without polling - fall back to synchronous mode
      } else {
        outlineRecordId = outlineRecord.id;
        console.log('[OUTLINE] Created generating outline record:', outlineRecordId);

        // Return immediately with outline_id for frontend to poll
        // But we'll continue processing in this same request
        // The frontend will start polling, and when this request completes,
        // the DB will have the updated outline
      }
    }

    // Select narrative mode prompt
    const modePrompt = NARRATIVE_MODE_PROMPTS[narrativeMode as keyof typeof NARRATIVE_MODE_PROMPTS] || NARRATIVE_MODE_PROMPTS.serie_adictiva;

    // Build density constraints from targets (skip if disableDensity is true)
    const densityConstraints = (!disableDensity && densityTargets) ? `
━━━━━━━━━━━━━━━━━━━━━━━━━━
DENSIDAD NARRATIVA (OBLIGATORIO CUMPLIR)
━━━━━━━━━━━━━━━━━━━━━━━━━━
- Protagonistas: MÍNIMO ${densityTargets.protagonists_min || 3}
- Personajes secundarios: MÍNIMO ${densityTargets.supporting_min || 10}
- Extras con líneas de diálogo: MÍNIMO ${densityTargets.extras_min || 15}
- Localizaciones distintas: MÍNIMO ${densityTargets.locations_min || 8}
- Props clave (objetos importantes para la trama): MÍNIMO ${densityTargets.hero_props_min || 5}
- Setpieces (escenas de alto impacto visual): MÍNNIMO ${densityTargets.setpieces_min || 4}
- Subtramas activas: MÍNIMO ${densityTargets.subplots_min || 3}
- Giros/twists por episodio: MÍNIMO ${densityTargets.twists_min || 2}
${densityTargets.scenes_per_episode ? `- Escenas por episodio: OBJETIVO ${densityTargets.scenes_per_episode}` : ''}
${densityTargets.scenes_target ? `- Escenas totales: OBJETIVO ${densityTargets.scenes_target}` : ''}
- Ratio diálogo/acción: ${densityTargets.dialogue_action_ratio || '55/45'}

IMPORTANTE: El outline DEBE cumplir estos mínimos para pasar QC. Si no los cumples, el outline será rechazado.
` : '';

    const systemPrompt = `${MASTER_SHOWRUNNER_CORE}

━━━━━━━━━━━━━━━━━━━━━━━━━━
${modePrompt}
━━━━━━━━━━━━━━━━━━━━━━━━━━
${densityConstraints}
Idioma de respuesta: ${language || 'es-ES'}

FORMATO LIGHT: Mantén summaries en máximo 2 frases. No incluyas diálogos completos.`;

    const userPrompt = `Genera un OUTLINE profesional para:

IDEA: ${idea}
GÉNERO: ${genre || 'Drama'}
TONO: ${tone || 'Realista'}
FORMATO: ${format === 'series' ? `Serie de ${cappedEpisodesCount} episodios` : 'Película'}
MODO NARRATIVO: ${narrativeMode || 'serie_adictiva'}

━━━━━━━━━━━━━━━━━━━━━━━━━━
REGLA DURA DE EPISODIOS (OBLIGATORIO)
━━━━━━━━━━━━━━━━━━━━━━━━━━
- "Capítulos" = EPISODIOS.
- Debes generar EXACTAMENTE ${cappedEpisodesCount} episodios.
- episode_beats debe contener EXACTAMENTE ${cappedEpisodesCount} elementos numerados 1..${cappedEpisodesCount}.
- Si tu salida no tiene ${cappedEpisodesCount} beats, es INCORRECTA y debes rehacerla.

━━━━━━━━━━━━━━━━━━━━━━━━━━
REGLA CRÍTICA DE PERSONAJES (OBLIGATORIO)
━━━━━━━━━━━━━━━━━━━━━━━━━━
CADA personaje DEBE ser una PERSONA CONCRETA con:
- Nombre propio Y apellido (ej: "Elena Vargas", "Marco Chen")
- Edad aproximada
- Profesión o rol específico

PROHIBIDO usar personajes conceptuales o grupales como:
❌ "Los que perdieron", "Quienes decidieron", "La sociedad"
❌ "El sistema", "Los vencedores", "La resistencia"  
❌ "El pasado", "El destino", "La verdad"

Si la idea habla de grupos abstractos (ej: "quienes eligieron perder"), 
CREA representantes individuales con nombres propios que encarnen ese grupo.

━━━━━━━━━━━━━━━━━━━━━━━━━━
EXTRACCIÓN DE ENTIDADES (PRIORIDAD MÁXIMA)
━━━━━━━━━━━━━━━━━━━━━━━━━━
ANTES de generar el outline, analiza TODA la IDEA/DOCUMENTO y extrae:
1. PERSONAJES: 
   - Cualquier nombre propio mencionado (ej: "Leonardo Laborda", "Nikos Anagnostou", "Daniel Weiss")
   - Personajes con títulos especiales (ej: "Aelion, Rey del Círculo", "Maera, Custodia de la Vida")
   - Roles específicos mencionados (ej: "el abuelo", "el profesor", "el guardián")
   - SI hay una sección "[ENTIDADES DETECTADAS]", incluye TODOS los personajes listados ahí
   
2. LOCACIONES: 
   - Lugares reales mencionados (ej: "MIT", "París", "Heidelberg", "Bolonia")
   - Lugares ficticios o fantásticos (ej: "Atlantis", "Zaia", "el Círculo Interior")
   - Universidades, instituciones, países, ciudades mencionados
   
3. PROPS: Objetos específicos mencionados que podrían ser importantes

REGLA CRÍTICA: Las entidades mencionadas en la IDEA tienen PRIORIDAD ABSOLUTA.
- Si el documento menciona 10 personajes, DEBEN aparecer los 10, aunque la densidad pida solo 3.
- Si el documento menciona 15 locaciones, DEBEN aparecer las 15.
- Los targets de densidad son MÍNIMOS, no límites. EL DOCUMENTO SIEMPRE GANA.
- Para personajes con títulos como "Rey del Círculo" o "Guardián del Fuego", USA el título como su rol.

Para cada entidad que crees, marca from_idea: true si fue mencionada explícitamente en la idea.
Incluye en extracted_entities TODOS los nombres/lugares/objetos que identificaste.

━━━━━━━━━━━━━━━━━━━━━━━━━━
REGLA CRÍTICA DE LOCALIZACIONES (OBLIGATORIO)
━━━━━━━━━━━━━━━━━━━━━━━━━━
CADA localización DEBE ser un LUGAR CONCRETO Y FILMABLE:
- Nombre específico del lugar (ej: "Archivo Histórico Municipal de Madrid", "Apartamento de Elena")
- Descripción visual detallada

PROHIBIDO usar localizaciones abstractas o temporales:
❌ "El pasado", "El futuro", "La memoria"
❌ "El inconsciente", "La mente", "El sueño"

Si la idea habla de conceptos abstractos, tradúcelos a ESPACIOS FÍSICOS filmables.

${(!disableDensity && densityTargets) ? `
DENSIDAD MÍNIMA OBLIGATORIA (estos son PISOS, no techos - puedes generar MÁS):
- ${densityTargets.protagonists_min}+ protagonistas (MÍNIMO, puede haber más si la historia lo requiere)
- ${densityTargets.supporting_min}+ secundarios (MÍNIMO, puede haber más)
- ${densityTargets.locations_min}+ localizaciones (MÍNIMO GARANTIZADO, genera MÁS si la historia lo requiere)
- ${densityTargets.hero_props_min || 5}+ props clave (MÍNIMO, puede haber más)
- ${densityTargets.subplots_min}+ subtramas (MÍNIMO, puede haber más)
- ${densityTargets.twists_min}+ giros por episodio (MÍNIMO, puede haber más)

⚠️ REGLA DE ORO: Si la historia naturalmente requiere MÁS entidades que estos mínimos, CRÉALAS.
Estos números son el PISO, no el TECHO. NO te limites artificialmente.
Para LOCALIZACIONES: incluye hogares de personajes, lugares de trabajo, espacios públicos relevantes.
` : disableDensity ? `
MODO LIBRE SIN LÍMITES: Extrae TODAS las localizaciones, personajes y elementos que la historia necesite.
NO hay límite superior - si la historia requiere 30 localizaciones, genera 30.
Incluye:
- Todas las localizaciones mencionadas explícitamente en la idea
- Todas las localizaciones que se deduzcan lógicamente (hogares de personajes, lugares de trabajo, etc.)
- Todos los personajes mencionados o necesarios para la trama
- Props y elementos relevantes para la narrativa
Sé EXHAUSTIVO, no minimalista. Extrae TODO lo que la historia necesite.
` : `
MÍNIMOS GARANTIZADOS (PISOS, no límites superiores - puedes generar MÁS):
- Personajes principales: MÍNIMO ${Math.min(3 + Math.floor(cappedEpisodesCount / 4), 8)} (puede haber más)
- Personajes secundarios: MÍNIMO ${Math.min(8 + cappedEpisodesCount, 25)} (puede haber más)
- Localizaciones: MÍNIMO ${Math.min(8 + cappedEpisodesCount, 25)} (puede haber MUCHAS más - sé exhaustivo)
- Props clave: MÍNIMO ${Math.min(3 + Math.floor(cappedEpisodesCount / 3), 10)} (puede haber más)
- Subtromas: MÍNIMO ${Math.max(2, Math.floor(cappedEpisodesCount / 2))} (puede haber más)

⚠️ REGLA DE ORO: Estos números son el PISO. Si la historia necesita 40 localizaciones, genera 40.
NO te limites artificialmente. Sé EXHAUSTIVO especialmente con localizaciones.
Para LOCALIZACIONES incluye: hogares de todos los personajes, lugares de trabajo, espacios públicos, lugares únicos de la trama.
`}
- Si es serie: un beat con cliffhanger por episodio
- Cada episodio DEBE tener un evento irreversible

FORMATO LIGHT: Mantén summaries CORTOS (máx 2 frases). Sin diálogos.

Usa la herramienta deliver_outline para entregar el resultado.
Recuerda: NO narrativa genérica. Cada beat debe ser ESPECÍFICO y ADICTIVO.`;

    // V4.1: Summarize long texts to avoid timeout
    let effectiveIdea = idea;
    let ideaWasSummarized = false;
    
    if (idea.length > MAX_IDEA_CHARS) {
      try {
        console.log(`[OUTLINE] Long text detected (${idea.length} chars). Summarizing...`);
        // Summarization now handles its own timeouts internally
        const summaryResult = await summarizeLongText(idea);
        effectiveIdea = summaryResult.summary;
        ideaWasSummarized = summaryResult.wasSummarized;
        
        // Update outline record to indicate summarization was used
        if (outlineRecordId && ideaWasSummarized) {
          await updateOutlineRecord(auth.supabase, outlineRecordId, {
            qc_issues: ['Texto largo resumido para procesamiento óptimo']
          });
        }
      } catch (summaryError) {
        console.warn('[OUTLINE] Summarization failed, using truncated text:', summaryError);
        effectiveIdea = idea.slice(0, MAX_IDEA_CHARS) + '\n\n[TEXTO TRUNCADO]';
        ideaWasSummarized = true;
      }
    }

    // Build actual user prompt with (potentially summarized) idea
    const actualUserPrompt = userPrompt.replace(
      `IDEA: ${idea}`,
      `IDEA: ${effectiveIdea}${ideaWasSummarized ? '\n\n[Nota: Este texto fue procesado para optimizar la generación]' : ''}`
    );

    console.log(
      `[OUTLINE] Generating with ${modelConfig.apiModel} (effective model: ${effectiveModelKey}) | Mode: ${narrativeMode || 'serie_adictiva'} | Target episodes: ${cappedEpisodesCount} | Idea length: ${effectiveIdea.length} chars (original: ${ideaLength}) | MaxTokens: ${effectiveMaxTokens}`
    );

    // V4.2: Call with timeout protection (45s for generation)
    let result: { outline: any; parseWarnings: string[]; durationMs: number };
    
    try {
      result = await callWithTimeout(
        callLovableAI(systemPrompt, actualUserPrompt, modelConfig, cappedEpisodesCount, effectiveMaxTokens),
        GENERATION_TIMEOUT_MS,
        'generate_outline'
      );
    } catch (timeoutError) {
      const errorMsg = (timeoutError as Error).message || 'Unknown timeout';
      console.error('[OUTLINE] AI call timeout:', errorMsg);
      
      // Update outline record with timeout error before function dies
      if (outlineRecordId) {
        await updateOutlineRecord(auth.supabase, outlineRecordId, {
          status: 'error',
          qc_issues: ['Timeout - el texto es muy largo o el servidor está saturado. Intenta con un texto más corto.']
        });
      }
      
      throw new Error(`AI_TIMEOUT: ${errorMsg}`);
    }

    // If primary model failed to parse, retry with fallback model (google/gemini-2.5-flash - much faster)
    if (result.parseWarnings.includes('LOVABLE_JSON_PARSE_FAILED')) {
      console.warn(`[OUTLINE] Primary model ${modelConfig.apiModel} failed to produce parseable JSON. Retrying with faster fallback model ${FALLBACK_MODEL_CONFIG.apiModel}...`);
      try {
        const fallbackResult = await callWithTimeout(
          callLovableAI(systemPrompt, actualUserPrompt, FALLBACK_MODEL_CONFIG, cappedEpisodesCount, effectiveMaxTokens),
          GENERATION_TIMEOUT_MS,
          'fallback_outline'
        );
        if (!fallbackResult.parseWarnings.includes('LOVABLE_JSON_PARSE_FAILED')) {
          console.log('[OUTLINE] Fallback model succeeded!');
          result = fallbackResult;
          result.parseWarnings.push('FALLBACK_MODEL_USED');
        } else {
          console.warn('[OUTLINE] Fallback model also failed to parse.');
        }
      } catch (fallbackError) {
        console.error('[OUTLINE] Fallback model call failed:', fallbackError);
      }
    }

    let { outline, parseWarnings, durationMs } = result;
    console.log(`[OUTLINE] Total AI processing time: ${durationMs}ms`);
    const expectedEpisodes = format === 'series' ? cappedEpisodesCount : 1;

    const buildPlaceholderBeats = (count: number) =>
      Array.from({ length: count }, (_, i) => ({
        episode: i + 1,
        title: `Episodio ${i + 1}`,
        summary: 'Por generar',
        cliffhanger: 'Por definir'
      }));

    const hasEpisodeBeats = Array.isArray(outline?.episode_beats) && outline.episode_beats.length > 0;

    // If AI returned wrong number of episode beats, retry once with explicit correction
    if (format === 'series' && hasEpisodeBeats && outline.episode_beats.length !== expectedEpisodes && parseWarnings.length === 0) {
      console.warn(
        `[OUTLINE QC] episode_beats mismatch (got ${outline.episode_beats.length}, expected ${expectedEpisodes}). Retrying once...`
      );

      const retryPrompt = `${userPrompt}

━━━━━━━━━━━━━━━━━━━━━━━━━━
CORRECCIÓN OBLIGATORIA
━━━━━━━━━━━━━━━━━━━━━━━━━━
Tu respuesta anterior devolvió ${outline.episode_beats.length} episodios, pero deben ser EXACTAMENTE ${expectedEpisodes}.
Reescribe el OUTLINE COMPLETO cumpliendo EXACTAMENTE ${expectedEpisodes} episodios.
episode_beats debe tener EXACTAMENTE ${expectedEpisodes} elementos (1..${expectedEpisodes}).`;

      try {
        const retried = await callLovableAI(systemPrompt, retryPrompt, modelConfig, expectedEpisodes, effectiveMaxTokens);

        if (Array.isArray(retried.outline?.episode_beats) && retried.outline.episode_beats.length > 0) {
          outline = retried.outline;
          parseWarnings = retried.parseWarnings;
        }
      } catch (e) {
        console.warn('[OUTLINE QC] Retry failed, will enforce beats length locally:', e);
      }
    }

    // Final enforcement: guarantee episode_beats length and minimal shape
    if (!Array.isArray(outline?.episode_beats) || outline.episode_beats.length === 0) {
      outline.episode_beats = buildPlaceholderBeats(expectedEpisodes);
    } else if (format === 'series') {
      const trimmed = outline.episode_beats.slice(0, expectedEpisodes);
      while (trimmed.length < expectedEpisodes) {
        trimmed.push({
          episode: trimmed.length + 1,
          title: `Episodio ${trimmed.length + 1}`,
          summary: 'Por generar',
          cliffhanger: 'Por definir'
        });
      }
      outline.episode_beats = trimmed.map((b: any, i: number) => ({
        ...b,
        episode: i + 1,
        title: b?.title || `Episodio ${i + 1}`,
        summary: b?.summary || 'Por generar',
        cliffhanger: b?.cliffhanger || 'Por definir'
      }));
    }

    // Add narrative mode to outline if not present
    if (!outline.narrative_mode) {
      outline.narrative_mode = narrativeMode || 'serie_adictiva';
    }

    // QC Check: Ensure each episode has cliffhanger
    const qcIssues: string[] = [];
    outline.episode_beats.forEach((ep: any, i: number) => {
      if (!ep.cliffhanger || ep.cliffhanger.length < 10) {
        qcIssues.push(`Episodio ${i + 1}: falta cliffhanger efectivo`);
      }
    });

    // Ensure main_props exists (may be empty if not provided by AI)
    if (!outline.main_props) {
      outline.main_props = [];
    }

    // Count entities from idea
    const entitiesFromIdea = {
      characters: outline.main_characters?.filter((c: any) => c.from_idea)?.length || 0,
      locations: outline.main_locations?.filter((l: any) => l.from_idea)?.length || 0,
      props: outline.main_props?.filter((p: any) => p.from_idea)?.length || 0
    };

    // Detect abstract/conceptual characters (RELAXED - only warn, don't degrade for collective entities)
    const abstractPatterns = /^(quienes |el grupo de |la sociedad|el sistema|el pasado|el futuro|la verdad|el destino)/i;
    const collectiveEntityPatterns = /^(los |las |el colectivo|la comunidad|la resistencia|el consejo|la orden)/i;
    
    const abstractCharacters = outline.main_characters?.filter((c: any) => 
      abstractPatterns.test(c.name?.toLowerCase() || '')
    ) || [];
    
    // Collective entities are valid for entity_type: 'collective' - just note them, don't warn
    const collectiveCharacters = outline.main_characters?.filter((c: any) => 
      collectiveEntityPatterns.test(c.name?.toLowerCase() || '') && 
      c.entity_type !== 'collective' && c.entity_type !== 'civilization'
    ) || [];
    
    if (abstractCharacters.length > 0) {
      const abstractNames = abstractCharacters.map((c: any) => c.name).join(', ');
      qcIssues.push(`Personajes abstractos detectados: ${abstractNames}. Considera dar nombres concretos.`);
      // Only add to parseWarnings if truly abstract (not collective entities)
      console.warn('[OUTLINE QC] Abstract characters detected:', abstractNames);
    }
    
    if (collectiveCharacters.length > 0) {
      const collectiveNames = collectiveCharacters.map((c: any) => c.name).join(', ');
      console.log('[OUTLINE QC] Collective entities noted (valid):', collectiveNames);
      // Mark them as collective to avoid future warnings
      collectiveCharacters.forEach((c: any) => { c.entity_type = 'collective'; });
    }

    // Detect abstract locations (RELAXED - historical/cosmic locations are valid)
    const abstractLocationPatterns = /^(el pasado|el futuro|la memoria|el sueño|la mente|el inconsciente)/i;
    const abstractLocations = outline.main_locations?.filter((l: any) =>
      abstractLocationPatterns.test(l.name?.toLowerCase() || '') &&
      l.type !== 'HISTORICAL' && l.type !== 'COSMIC' && l.scale !== 'cosmic'
    ) || [];

    if (abstractLocations.length > 0) {
      const abstractLocNames = abstractLocations.map((l: any) => l.name).join(', ');
      qcIssues.push(`Localizaciones abstractas detectadas: ${abstractLocNames}. Considera lugares filmables.`);
      console.warn('[OUTLINE QC] Abstract locations detected:', abstractLocNames);
    }

    if (qcIssues.length > 0) {
      console.warn('[OUTLINE QC]', qcIssues);
      outline.qc_warnings = qcIssues;
    }

    // Determine quality level - ONLY degrade for critical parse failures, not warnings
    // QC issues are informational, not blocking
    const criticalParseWarnings = parseWarnings.filter(w => 
      w.includes('PARSE_FAILED') || w.includes('GENERATION_ERROR')
    );
    const outlineQuality = criticalParseWarnings.length > 0 ? 'DEGRADED' : 'FULL';

    console.log('[OUTLINE] Success:', outline.title, 
      '| Quality:', outlineQuality,
      '| Model:', modelConfig.apiModel, 
      '| Mode:', outline.narrative_mode, 
      '| Characters:', outline.main_characters?.length, `(${entitiesFromIdea.characters} from idea)`,
      '| Locations:', outline.main_locations?.length, `(${entitiesFromIdea.locations} from idea)`,
      '| Props:', outline.main_props?.length, `(${entitiesFromIdea.props} from idea)`,
      '| Episodes:', outline.episode_beats?.length,
      '| Parse warnings:', parseWarnings.length > 0 ? parseWarnings.join(', ') : 'none'
    );

    // Log to editorial_events if there were parse warnings
    if (parseWarnings.length > 0 && projectId) {
      logEditorialEvent(projectId, 'outline_parse_warning', {
        warnings: parseWarnings,
        model: modelConfig.apiModel,
        duration_ms: Date.now() - startTime,
        outline_quality: outlineQuality
      });
    }

    // =======================================================================
    // V4.0 POLLING: Update outline record with completed data
    // =======================================================================
    if (outlineRecordId) {
      await updateOutlineRecord(auth.supabase, outlineRecordId, {
        status: 'draft',
        outline_json: outline,
        quality: outlineQuality,
        qc_issues: [...qcIssues, ...parseWarnings]
      });
      console.log('[OUTLINE] Updated outline record to draft status:', outlineRecordId);
    }

    // Always return 200 with success indicator
    return new Response(
      JSON.stringify({ 
        success: parseWarnings.length === 0,
        outline_quality: outlineQuality,
        warnings: parseWarnings.length > 0 ? parseWarnings : undefined,
        outline, 
        model: modelConfig.apiModel,
        // V4.0: Include polling info for frontend
        polling: usePolling && !!outlineRecordId,
        outline_id: outlineRecordId
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[OUTLINE ERROR]', error);
    
    // Log failure
    if (runId) {
      await v3LogRunComplete(runId, 'failed', undefined, undefined, 'GENERATION_ERROR', error?.message);
    }
    
    // Log failure event
    if (projectId) {
      logEditorialEvent(projectId, 'outline_generation_failed', {
        error: error?.message || 'Unknown error',
        duration_ms: Date.now() - startTime
      });
    }

    // =======================================================================
    // V4.0 POLLING: Update outline record with error status
    // =======================================================================
    if (outlineRecordId) {
      await updateOutlineRecord(auth.supabase, outlineRecordId, {
        status: 'error',
        qc_issues: [error?.message || 'Unknown error']
      });
      console.log('[OUTLINE] Updated outline record to error status:', outlineRecordId);
    }
    
    // Handle structured errors with status codes (rate limits, etc.)
    if (error.status) {
      return new Response(
        JSON.stringify({ success: false, code: 'API_ERROR', message: error.message }),
        { status: error.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // For unstructured errors, return 200 with degraded outline instead of 500
    console.warn('[OUTLINE] Returning degraded outline due to error');
    const fallbackOutline = buildFallbackOutline(6);
    
    return new Response(
      JSON.stringify({ 
        success: false,
        outline_quality: 'DEGRADED',
        warnings: ['GENERATION_ERROR', error?.message || 'Unknown error'],
        outline: fallbackOutline,
        model: 'fallback',
        polling: false,
        outline_id: outlineRecordId
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } finally {
    // =======================================================================
    // V3.0 LOCK RELEASE - Always release lock on exit
    // =======================================================================
    if (lockAcquired && projectId) {
      await v3ReleaseProjectLock(auth.supabase, projectId);
      console.log('[OUTLINE] Lock released for project:', projectId);
    }

    // Log run completion (if not already done in error handler)
    if (runId) {
      const durationMs = Date.now() - startTime;
      await v3LogRunComplete(runId, 'success', undefined, undefined, undefined, undefined);
    }
  }
});
