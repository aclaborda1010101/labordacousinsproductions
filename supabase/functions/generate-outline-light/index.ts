import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ⚠️ MODEL CONFIGS - Multi-provider support
type GenerationModelType = 'rapido' | 'profesional' | 'hollywood';

interface ModelConfig {
  apiModel: string;
  provider: 'openai' | 'anthropic';
  maxTokens: number;
  temperature: number;
}

const MODEL_CONFIGS: Record<GenerationModelType, ModelConfig> = {
  rapido: {
    apiModel: 'gpt-4o-mini',
    provider: 'openai',
    maxTokens: 4000,
    temperature: 0.8
  },
  profesional: {
    apiModel: 'gpt-4o',
    provider: 'openai',
    maxTokens: 4000,
    temperature: 0.7
  },
  hollywood: {
    apiModel: 'claude-sonnet-4-20250514',
    provider: 'anthropic',
    maxTokens: 4000,
    temperature: 0.8
  }
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

// OpenAI API call
async function callOpenAI(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  config: ModelConfig
): Promise<any> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.apiModel,
      max_tokens: config.maxTokens,
      temperature: config.temperature,
      messages: [
        { role: 'system', content: systemPrompt },
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

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[OUTLINE OpenAI ERROR]', response.status, errorText);
    
    if (response.status === 429) {
      throw { status: 429, message: 'Rate limit alcanzado. Espera un momento.' };
    }
    throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  
  // Extract tool call result
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  if (toolCall?.function?.name === 'deliver_outline') {
    try {
      return JSON.parse(toolCall.function.arguments);
    } catch {
      throw new Error('Failed to parse OpenAI tool call response');
    }
  }
  
  // Fallback: try to parse from content
  const content = data.choices?.[0]?.message?.content ?? '';
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch {
      throw new Error('No se pudo parsear el outline de OpenAI');
    }
  }
  
  throw new Error('OpenAI no devolvió outline válido');
}

// Anthropic API call
async function callAnthropic(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  config: ModelConfig
): Promise<any> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.apiModel,
      max_tokens: config.maxTokens,
      temperature: config.temperature,
      system: systemPrompt,
      tools: [
        {
          name: 'deliver_outline',
          description: 'Entrega el outline estructurado con estilo MASTER SHOWRUNNER.',
          input_schema: OUTLINE_TOOL_SCHEMA
        }
      ],
      tool_choice: { type: 'tool', name: 'deliver_outline' },
      messages: [{ role: 'user', content: userPrompt }]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[OUTLINE Anthropic ERROR]', response.status, errorText);
    
    if (response.status === 429) {
      throw { status: 429, message: 'Rate limit alcanzado. Espera un momento.' };
    }
    if (response.status === 400 && errorText.toLowerCase().includes('credit')) {
      throw { status: 402, message: 'Créditos insuficientes en la cuenta de Claude.' };
    }
    throw new Error(`Anthropic API error: ${response.status}`);
  }

  const data = await response.json();

  // Extract tool use result
  const toolUse = data.content?.find((c: any) => c.type === 'tool_use' && c.name === 'deliver_outline');
  if (toolUse?.input) {
    return toolUse.input;
  }

  // Fallback: try to parse JSON from text
  const textBlock = data.content?.find((c: any) => c.type === 'text');
  const content = textBlock?.text ?? '';
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch {
      throw new Error('No se pudo parsear el outline de Claude');
    }
  }
  
  throw new Error('Claude no devolvió outline');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

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
      generationModel = 'rapido' // Default to fast model
    } = await req.json();

    if (!idea) {
      return new Response(
        JSON.stringify({ error: 'Idea requerida' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate and get model config
    const modelKey = (generationModel as GenerationModelType) in MODEL_CONFIGS 
      ? generationModel as GenerationModelType 
      : 'rapido';
    const modelConfig = MODEL_CONFIGS[modelKey];

    // Get API key based on provider
    let apiKey: string | undefined;
    if (modelConfig.provider === 'openai') {
      apiKey = Deno.env.get('OPENAI_API_KEY');
      if (!apiKey) {
        throw new Error('OPENAI_API_KEY no configurada');
      }
    } else {
      apiKey = Deno.env.get('ANTHROPIC_API_KEY');
      if (!apiKey) {
        throw new Error('ANTHROPIC_API_KEY no configurada');
      }
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

    // Select narrative mode prompt
    const modePrompt = NARRATIVE_MODE_PROMPTS[narrativeMode as keyof typeof NARRATIVE_MODE_PROMPTS] || NARRATIVE_MODE_PROMPTS.serie_adictiva;

    // Build density constraints from targets
    const densityConstraints = densityTargets ? `
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
Idioma de respuesta: ${language || 'es-ES'}`;

    const userPrompt = `Genera un OUTLINE profesional para:

IDEA: ${idea}
GÉNERO: ${genre || 'Drama'}
TONO: ${tone || 'Realista'}
FORMATO: ${format === 'series' ? `Serie de ${desiredEpisodesCount} episodios` : 'Película'}
MODO NARRATIVO: ${narrativeMode || 'serie_adictiva'}

━━━━━━━━━━━━━━━━━━━━━━━━━━
REGLA DURA DE EPISODIOS (OBLIGATORIO)
━━━━━━━━━━━━━━━━━━━━━━━━━━
- "Capítulos" = EPISODIOS.
- Debes generar EXACTAMENTE ${desiredEpisodesCount} episodios.
- episode_beats debe contener EXACTAMENTE ${desiredEpisodesCount} elementos numerados 1..${desiredEpisodesCount}.
- Si tu salida no tiene ${desiredEpisodesCount} beats, es INCORRECTA y debes rehacerla.

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
${densityTargets ? `
DENSIDAD MÍNIMA REQUERIDA (si la idea no especifica más):
- ${densityTargets.protagonists_min}+ protagonistas
- ${densityTargets.supporting_min}+ secundarios  
- ${densityTargets.locations_min}+ localizaciones
- ${densityTargets.hero_props_min || 5}+ props clave
- ${densityTargets.subplots_min}+ subtramas
- ${densityTargets.twists_min}+ giros por episodio
` : `
MÍNIMOS POR DEFECTO (si la idea no especifica más):
- Personajes principales: MÍNIMO 5
- Localizaciones: MÍNIMO 5
- Props clave: MÍNIMO 3`}
- Si es serie: un beat con cliffhanger por episodio
- Cada episodio DEBE tener un evento irreversible

Usa la herramienta deliver_outline para entregar el resultado.
Recuerda: NO narrativa genérica. Cada beat debe ser ESPECÍFICO y ADICTIVO.`;

    console.log(
      `[OUTLINE] Generating with ${modelConfig.apiModel} (${modelConfig.provider}) | Mode: ${narrativeMode || 'serie_adictiva'} | Target episodes: ${desiredEpisodesCount}...`
    );

    // Call the appropriate API
    let outline: any;
    if (modelConfig.provider === 'openai') {
      outline = await callOpenAI(apiKey, systemPrompt, userPrompt, modelConfig);
    } else {
      outline = await callAnthropic(apiKey, systemPrompt, userPrompt, modelConfig);
    }

    const expectedEpisodes = format === 'series' ? desiredEpisodesCount : 1;

    const buildPlaceholderBeats = (count: number) =>
      Array.from({ length: count }, (_, i) => ({
        episode: i + 1,
        title: `Episodio ${i + 1}`,
        summary: 'Por generar',
        cliffhanger: 'Por definir'
      }));

    const hasEpisodeBeats = Array.isArray(outline?.episode_beats) && outline.episode_beats.length > 0;

    // If AI returned wrong number of episode beats, retry once with explicit correction
    if (format === 'series' && hasEpisodeBeats && outline.episode_beats.length !== expectedEpisodes) {
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
        const retried = modelConfig.provider === 'openai'
          ? await callOpenAI(apiKey, systemPrompt, retryPrompt, modelConfig)
          : await callAnthropic(apiKey, systemPrompt, retryPrompt, modelConfig);

        if (Array.isArray(retried?.episode_beats) && retried.episode_beats.length > 0) {
          outline = retried;
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

    console.log('[OUTLINE] Success:', outline.title, 
      '| Model:', modelConfig.apiModel, 
      '| Mode:', outline.narrative_mode, 
      '| Characters:', outline.main_characters?.length, `(${entitiesFromIdea.characters} from idea)`,
      '| Locations:', outline.main_locations?.length, `(${entitiesFromIdea.locations} from idea)`,
      '| Props:', outline.main_props?.length, `(${entitiesFromIdea.props} from idea)`,
      '| Episodes:', outline.episode_beats?.length
    );

    return new Response(
      JSON.stringify({ success: true, outline, model: modelConfig.apiModel }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[OUTLINE ERROR]', error);
    
    // Handle structured errors with status codes
    if (error.status) {
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: error.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
