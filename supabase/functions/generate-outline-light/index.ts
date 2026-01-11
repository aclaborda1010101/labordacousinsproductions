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

const MODEL_CONFIGS: Record<GenerationModelType, ModelConfig> = {
  rapido: {
    apiModel: 'openai/gpt-5-mini',
    provider: 'lovable',
    maxTokens: 4000,
    temperature: 0.8
  },
  profesional: {
    apiModel: 'openai/gpt-5',
    provider: 'lovable',
    maxTokens: 4000,
    temperature: 0.7
  },
  hollywood: {
    apiModel: 'openai/gpt-5.2',
    provider: 'lovable',
    maxTokens: 4000,
    temperature: 0.8
  }
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

// Lovable AI Gateway call with hardened parsing
async function callLovableAI(
  systemPrompt: string,
  userPrompt: string,
  config: ModelConfig,
  expectedEpisodes: number
): Promise<{ outline: any; parseWarnings: string[] }> {
  const parseWarnings: string[] = [];
  
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
      max_tokens: config.maxTokens,
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

  // Try tool call arguments first
  if (toolCall?.function?.name === 'deliver_outline' && typeof toolArgs === 'string') {
    try {
      return { outline: normalizeOutline(parseJsonSafe(toolArgs, 'lovable.tool_call.arguments')), parseWarnings };
    } catch (e) {
      parseWarnings.push('TOOL_CALL_PARSE_FAILED');
      console.warn('[OUTLINE] Tool-call JSON invalid. Falling back to content parsing...');
    }
  }

  // Fallback: try to parse from content
  const content = data.choices?.[0]?.message?.content ?? '';
  const candidate = content || (typeof toolArgs === 'string' ? toolArgs : '');

  if (candidate) {
    try {
      return { outline: normalizeOutline(parseJsonSafe(candidate, 'lovable.content')), parseWarnings };
    } catch (e) {
      parseWarnings.push('CONTENT_PARSE_FAILED');
      console.warn('[OUTLINE] Content JSON also invalid. Using fallback outline.');
    }
  }

  // Return degraded fallback
  parseWarnings.push('LOVABLE_JSON_PARSE_FAILED');
  return { outline: buildFallbackOutline(expectedEpisodes), parseWarnings };
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
  const startTime = Date.now();

  try {
    const { 
      idea, 
      genre, 
      tone, 
      format, 
      episodesCount, 
      language, 
      narrativeMode, 
      densityTargets,
      generationModel = 'rapido',
      project_id,
      disableDensity = false // V3.0: Skip density constraints when true
    } = await req.json();

    projectId = project_id || null;

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

    // Validate and get model config
    const modelKey = (generationModel as GenerationModelType) in MODEL_CONFIGS 
      ? generationModel as GenerationModelType 
      : 'rapido';
    const modelConfig = MODEL_CONFIGS[modelKey];

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
EXTRACCIÓN DE ENTIDADES (PRIORIDAD MÁXIMA)
━━━━━━━━━━━━━━━━━━━━━━━━━━
ANTES de generar el outline, analiza la IDEA y extrae:
1. PERSONAJES: Cualquier nombre propio o rol específico mencionado (ej: "María", "el detective", "un hacker")
2. LOCACIONES: Cualquier lugar específico mencionado (ej: "Nueva York", "una fábrica abandonada", "el hospital")
3. PROPS: Objetos específicos mencionados que podrían ser importantes (ej: "un diario", "el arma del crimen", "las cartas")

REGLA CRÍTICA: Las entidades mencionadas en la IDEA tienen PRIORIDAD ABSOLUTA.
- Si la idea menciona 8 personajes, deben aparecer los 8, aunque la densidad pida solo 3.
- Si la idea menciona 12 locaciones, deben aparecer las 12.
- Los targets de densidad son MÍNIMOS, no límites. La idea siempre gana.

Para cada entidad que crees, marca from_idea: true si fue mencionada explícitamente en la idea.
Incluye en extracted_entities TODOS los nombres/lugares/objetos que identificaste.
${(!disableDensity && densityTargets) ? `
DENSIDAD MÍNIMA REQUERIDA (si la idea no especifica más):
- ${densityTargets.protagonists_min}+ protagonistas
- ${densityTargets.supporting_min}+ secundarios  
- ${densityTargets.locations_min}+ localizaciones
- ${densityTargets.hero_props_min || 5}+ props clave
- ${densityTargets.subplots_min}+ subtramas
- ${densityTargets.twists_min}+ giros por episodio
` : disableDensity ? `
MODO LIBRE: Genera SOLO los personajes, locaciones y elementos que se desprendan naturalmente de la idea.
NO inventes entidades adicionales. Sé fiel a lo que el usuario ha descrito.
` : `
MÍNIMOS POR DEFECTO (si la idea no especifica más):
- Personajes principales: MÍNIMO 5
- Localizaciones: MÍNIMO 5
- Props clave: MÍNIMO 3`}
- Si es serie: un beat con cliffhanger por episodio
- Cada episodio DEBE tener un evento irreversible

FORMATO LIGHT: Mantén summaries CORTOS (máx 2 frases). Sin diálogos.

Usa la herramienta deliver_outline para entregar el resultado.
Recuerda: NO narrativa genérica. Cada beat debe ser ESPECÍFICO y ADICTIVO.`;

    console.log(
      `[OUTLINE] Generating with ${modelConfig.apiModel} (${modelConfig.provider}) | Mode: ${narrativeMode || 'serie_adictiva'} | Target episodes: ${cappedEpisodesCount}...`
    );

    // Call Lovable AI Gateway with hardened parsing
    let result: { outline: any; parseWarnings: string[] };
    result = await callLovableAI(systemPrompt, userPrompt, modelConfig, cappedEpisodesCount);

    let { outline, parseWarnings } = result;
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
        const retried = await callLovableAI(systemPrompt, retryPrompt, modelConfig, expectedEpisodes);

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

    if (qcIssues.length > 0) {
      console.warn('[OUTLINE QC]', qcIssues);
      outline.qc_warnings = qcIssues;
    }

    // Determine quality level
    const outlineQuality = parseWarnings.length > 0 ? 'DEGRADED' : 'FULL';

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

    // Always return 200 with success indicator
    return new Response(
      JSON.stringify({ 
        success: parseWarnings.length === 0,
        outline_quality: outlineQuality,
        warnings: parseWarnings.length > 0 ? parseWarnings : undefined,
        outline, 
        model: modelConfig.apiModel 
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
        model: 'fallback'
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
