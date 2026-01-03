import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ⚠️ MODEL CONFIG - DO NOT CHANGE WITHOUT USER AUTHORIZATION
const SCRIPT_MODEL = "claude-sonnet-4-20250514";

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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { idea, genre, tone, format, episodesCount, language, narrativeMode, densityTargets } = await req.json();

    if (!idea) {
      return new Response(
        JSON.stringify({ error: 'Idea requerida' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
    if (!ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY no configurada');
    }

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
- Setpieces (escenas de alto impacto visual): MÍNIMO ${densityTargets.setpieces_min || 4}
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
FORMATO: ${format === 'series' ? `${episodesCount || 6} episodios` : 'Película'}
MODO NARRATIVO: ${narrativeMode || 'serie_adictiva'}
${densityTargets ? `
DENSIDAD REQUERIDA:
- ${densityTargets.protagonists_min}+ protagonistas
- ${densityTargets.supporting_min}+ secundarios  
- ${densityTargets.locations_min}+ localizaciones
- ${densityTargets.subplots_min}+ subtramas
- ${densityTargets.twists_min}+ giros por episodio
` : `
CONSTRAINTS OBLIGATORIOS:
- Personajes principales: MÍNIMO 5
- Localizaciones: MÍNIMO 5`}
- Si es serie: un beat con cliffhanger por episodio
- Cada episodio DEBE tener un evento irreversible

Usa la herramienta deliver_outline para entregar el resultado.
Recuerda: NO narrativa genérica. Cada beat debe ser ESPECÍFICO y ADICTIVO.`;

    console.log(`[OUTLINE] Generating with ${SCRIPT_MODEL} | Mode: ${narrativeMode || 'serie_adictiva'}...`);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: SCRIPT_MODEL,
        max_tokens: 4000,
        temperature: 0.8,
        system: systemPrompt,
        tools: [
          {
            name: 'deliver_outline',
            description: 'Entrega el outline estructurado con estilo MASTER SHOWRUNNER.',
            input_schema: {
              type: 'object',
              properties: {
                title: { type: 'string', description: 'Título evocador y memorable' },
                logline: { type: 'string', description: '1-2 frases que VENDAN la serie con intriga' },
                genre: { type: 'string' },
                tone: { type: 'string' },
                narrative_mode: { type: 'string', description: 'Modo narrativo aplicado' },
                synopsis: { type: 'string', description: '150-250 palabras. NO resumen, sino PROMESA narrativa' },
                main_characters: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      name: { type: 'string' },
                      role: { type: 'string', enum: ['protagonist', 'antagonist', 'supporting'] },
                      description: { type: 'string', description: 'Físico + personalidad + FLAW' },
                      secret: { type: 'string', description: 'Qué oculta este personaje' },
                      want: { type: 'string', description: 'Deseo consciente' },
                      need: { type: 'string', description: 'Necesidad inconsciente' }
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
                      type: { type: 'string', enum: ['INT', 'EXT', 'INT/EXT'] },
                      description: { type: 'string' },
                      atmosphere: { type: 'string', description: 'Qué SIENTE el espectador aquí' }
                    },
                    required: ['name', 'type', 'description']
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
                      cliffhanger: { type: 'string', description: 'Cómo termina el episodio (debe generar NECESIDAD de ver más)' }
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
              required: ['title', 'logline', 'genre', 'tone', 'synopsis', 'main_characters', 'main_locations', 'episode_beats', 'qc_status']
            }
          }
        ],
        tool_choice: { type: 'tool', name: 'deliver_outline' },
        messages: [{ role: 'user', content: userPrompt }]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[OUTLINE ERROR]', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit alcanzado. Espera un momento.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 400 && errorText.toLowerCase().includes('credit')) {
        return new Response(
          JSON.stringify({ error: 'Créditos insuficientes en la cuenta de Claude.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      throw new Error(`Claude API error: ${response.status}`);
    }

    const data = await response.json();

    // Extract tool use result
    const toolUse = data.content?.find((c: any) => c.type === 'tool_use' && c.name === 'deliver_outline');
    let outline = toolUse?.input;

    if (!outline) {
      // Fallback: try to parse JSON from text
      const textBlock = data.content?.find((c: any) => c.type === 'text');
      const content = textBlock?.text ?? '';
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          outline = JSON.parse(jsonMatch[0]);
        } catch {
          throw new Error('No se pudo parsear el outline');
        }
      } else {
        throw new Error('Claude no devolvió outline');
      }
    }

    // Add narrative mode to outline if not present
    if (!outline.narrative_mode) {
      outline.narrative_mode = narrativeMode || 'serie_adictiva';
    }

    // Validate episode_beats
    if (!outline.episode_beats || outline.episode_beats.length === 0) {
      outline.episode_beats = Array.from({ length: episodesCount || 1 }, (_, i) => ({
        episode: i + 1,
        title: `Episodio ${i + 1}`,
        summary: 'Por generar',
        cliffhanger: 'Por definir'
      }));
    }

    // QC Check: Ensure each episode has cliffhanger
    const qcIssues: string[] = [];
    outline.episode_beats.forEach((ep: any, i: number) => {
      if (!ep.cliffhanger || ep.cliffhanger.length < 10) {
        qcIssues.push(`Episodio ${i + 1}: falta cliffhanger efectivo`);
      }
    });

    if (qcIssues.length > 0) {
      console.warn('[OUTLINE QC]', qcIssues);
      outline.qc_warnings = qcIssues;
    }

    console.log('[OUTLINE] Success:', outline.title, '| Mode:', outline.narrative_mode, '| Characters:', outline.main_characters?.length, '| Episodes:', outline.episode_beats?.length);

    return new Response(
      JSON.stringify({ success: true, outline }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[OUTLINE ERROR]', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
