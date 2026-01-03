import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface OutlineRequest {
  projectId: string;
  idea: string;
  format: 'film' | 'series';
  episodesCount?: number;
  episodeDurationMin?: number;
  filmDurationMin?: number;
  genre: string;
  tone: string;
  language: string;
  references?: string;
  referenceScripts?: Array<{
    title: string;
    content: string;
    genre: string | null;
    notes: string | null;
  }>;
  targets: {
    protagonists_min: number;
    supporting_min: number;
    extras_min: number;
    locations_min: number;
    hero_props_min: number;
    setpieces_min: number;
    subplots_min: number;
    twists_min: number;
    scenes_per_episode?: number;
    scenes_target?: number;
    dialogue_action_ratio: string;
  };
}

const SYSTEM_PROMPT = `Eres BLOCKBUSTER_FORGE_WRITER: guionista + showrunner + script editor con experiencia en producciones de nivel estudio (HBO, Netflix, A24).

TU MISIÓN: Crear un OUTLINE PROFESIONAL Y DETALLADO, listo para producción, segmentado por episodios.

FILOSOFÍA DE ESCRITURA:
- Cada personaje debe sentirse REAL: con contradicciones, deseos ocultos, y voces distintivas.
- Las tramas deben tejerse orgánicamente: setup → confrontation → payoff.
- Los diálogos deben ser REVELADORES: cada línea avanza trama O revela personaje.
- Las localizaciones son PERSONAJES: deben tener atmósfera, historia, y significado narrativo.

ESTRUCTURA PROFESIONAL:
1. BEAT SHEET completo siguiendo Save The Cat! con adaptaciones para series:
   - Opening Image (estado inicial del mundo)
   - Theme Stated (la pregunta moral central)
   - Set-Up (presentación de personajes y mundo)
   - Catalyst (el evento que lo cambia todo)
   - Debate (resistencia al cambio)
   - Break Into Two (decisión que inicia el viaje)
   - B Story (subplot emocional/relacional)
   - Fun and Games (la promesa del premise)
   - Midpoint (falsa victoria o falsa derrota)
   - Bad Guys Close In (complicaciones internas y externas)
   - All Is Lost (momento más oscuro)
   - Dark Night of the Soul (reflexión profunda)
   - Break Into Three (epifanía y plan final)
   - Finale (confrontación y resolución)
   - Final Image (contraste con Opening Image)

2. PERSONAJES con profundidad psicológica:
   - Backstory que informa sus decisiones
   - Flaw/herida emocional central
   - Want vs Need (deseo consciente vs necesidad inconsciente)
   - Arc transformacional claro
   - Relationships dinámicas (no estáticas)
   - Voice signature (forma única de hablar)

3. LOCALIZACIONES cinematográficas:
   - Descripción visual evocadora
   - Atmósfera sensorial (luz, sonido, textura)
   - Historia del lugar
   - Cómo refleja temas de la historia

4. SETPIECES memorables:
   - Stakes emocionales claros
   - Coreografía visual
   - Turning points dentro de la escena
   - Impacto en arcos de personajes

EXTENSIÓN REQUERIDA:
- Synopsis de serie: 400-600 palabras (narrativa fluida, no bullet points)
- Synopsis de episodio: 200-350 palabras
- Beat descriptions: 100-180 palabras cada uno
- Character descriptions: 120-180 palabras (incluir backstory relevante)
- Character arcs: 80-120 palabras (transformación completa)
- Location descriptions: 100-150 palabras (atmósfera cinematográfica)
- Setpiece descriptions: 150-250 palabras (coreografía detallada)
- Key scene descriptions: 80-120 palabras

REGLAS ABSOLUTAS:
- NUNCA entregues menos elementos que los targets mínimos.
- Cada elemento debe ser ÚNICO y ESPECÍFICO (no genérico).
- Los conflictos deben tener STAKES claros y escalada.
- Las subtramas deben conectar temáticamente con la trama principal.
- Los giros deben tener setup previo (foreshadowing sutil).

IDIOMA: Responde en el idioma indicado con riqueza literaria.`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const request: OutlineRequest = await req.json();
    const { idea, format, episodesCount, episodeDurationMin, filmDurationMin, genre, tone, language, references, referenceScripts, targets } = request;

    const safeIdea = idea?.length > 3000 ? `${idea.slice(0, 3000)}…` : idea;
    const safeReferences = references?.length ? references.slice(0, 1200) : references;

    if (!idea || !targets) {
      return new Response(
        JSON.stringify({ error: 'Se requiere idea y targets' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
    if (!ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY no está configurada');
    }

    const formatDescription = format === 'series' 
      ? `Serie de ${episodesCount || 6} episodios de ${episodeDurationMin || 45} minutos cada uno`
      : `Película de ${filmDurationMin || 100} minutos`;

    // Build reference scripts section
    let referenceSection = '';
    if (referenceScripts && referenceScripts.length > 0) {
      referenceSection = `\n\nGUIONES DE REFERENCIA (analiza estilo, ritmo y tono):\n`;
      for (const ref of referenceScripts.slice(0, 2)) {
        const excerpt = ref.content.slice(0, 2000);
        referenceSection += `\n• "${ref.title}" (${ref.genre || 'Drama'}):\n${excerpt}\n---\n`;
      }
    }

    const userPrompt = `CREA UN OUTLINE PROFESIONAL Y EXTENSO:

=== CONCEPTO ===
${safeIdea}

=== PARÁMETROS DE PRODUCCIÓN ===
Formato: ${formatDescription}
Género: ${genre}
Tono: ${tone}
Idioma: ${language}
${safeReferences ? `\nReferencias/Inspiración: ${safeReferences}` : ''}
${referenceSection}

=== TARGETS MÍNIMOS (OBLIGATORIO cumplir o superar) ===
• Protagonistas: ${targets.protagonists_min}
• Personajes secundarios: ${targets.supporting_min}
• Extras con diálogo: ${targets.extras_min}
• Localizaciones únicas: ${targets.locations_min}
• Props narrativos clave: ${targets.hero_props_min}
• Setpieces/secuencias de acción: ${targets.setpieces_min}
• Subtramas: ${targets.subplots_min}
• Giros/revelaciones: ${targets.twists_min}
${format === 'series' ? `• Escenas por episodio: ${targets.scenes_per_episode}` : `• Escenas totales: ${targets.scenes_target}`}
• Ratio diálogo/acción: ${targets.dialogue_action_ratio}

=== INSTRUCCIONES ESPECÍFICAS ===
1. Desarrolla personajes con PROFUNDIDAD PSICOLÓGICA (backstory, flaw, want/need).
2. Crea un beat_sheet COMPLETO con los 15 beats de Save The Cat! adaptados.
3. Diseña setpieces con COREOGRAFÍA VISUAL detallada.
4. Establece FORESHADOWING para cada giro importante.
5. Las subtramas deben RESONAR temáticamente con la trama A.
6. Cada episodio debe tener su propio MINI-ARCO satisfactorio + cliffhanger.

Devuelve el outline completo usando la herramienta deliver_outline.`;

    console.log('Generating professional outline with Claude Sonnet for:', idea.substring(0, 100));
    console.log('Targets:', JSON.stringify(targets));

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 16000,
        temperature: 0.4,
        system: SYSTEM_PROMPT,
        tools: [
          {
            name: 'deliver_outline',
            description: 'Entrega el outline profesional como objeto estructurado.',
            input_schema: {
              type: 'object',
              properties: {
                title: { type: 'string', description: 'Título evocador y memorable' },
                logline: { type: 'string', description: 'Logline de 2-3 frases que capture el conflicto central y stakes' },
                synopsis: { type: 'string', description: 'Synopsis narrativo de 400-600 palabras' },
                genre: { type: 'string' },
                tone: { type: 'string' },
                themes: { type: 'array', items: { type: 'string' }, description: 'Temas principales explorados' },
                
                beat_sheet: { 
                  type: 'array', 
                  items: { 
                    type: 'object',
                    properties: {
                      beat: { type: 'string' },
                      description: { type: 'string', description: '100-180 palabras describiendo el beat' },
                      episode: { type: 'number' },
                      scenes: { type: 'array', items: { type: 'string' } },
                      emotional_arc: { type: 'string' }
                    }
                  },
                  description: 'Los 15 beats de Save The Cat! completos'
                },
                
                episode_outlines: { 
                  type: 'array', 
                  items: { 
                    type: 'object',
                    properties: {
                      episode_number: { type: 'number' },
                      title: { type: 'string' },
                      synopsis: { type: 'string', description: '200-350 palabras' },
                      cold_open: { type: 'string', description: 'Hook inicial del episodio' },
                      act_breaks: { type: 'array', items: { type: 'string' } },
                      cliffhanger: { type: 'string' },
                      scenes_count: { type: 'number' },
                      key_scenes: { 
                        type: 'array', 
                        items: { 
                          type: 'object',
                          properties: {
                            slugline: { type: 'string' },
                            description: { type: 'string', description: '80-120 palabras' },
                            characters: { type: 'array', items: { type: 'string' } },
                            conflict: { type: 'string' },
                            resolution: { type: 'string' },
                            emotional_beat: { type: 'string' }
                          }
                        }
                      },
                      character_development: { type: 'array', items: { type: 'string' } },
                      subplot_progress: { type: 'array', items: { type: 'string' } },
                      thematic_resonance: { type: 'string' }
                    }
                  }
                },
                
                character_list: { 
                  type: 'array', 
                  items: { 
                    type: 'object',
                    properties: {
                      name: { type: 'string' },
                      role: { type: 'string', enum: ['protagonist', 'antagonist', 'supporting', 'recurring', 'extra_with_lines'] },
                      archetype: { type: 'string' },
                      description: { type: 'string', description: '120-180 palabras con apariencia, personalidad y backstory' },
                      backstory: { type: 'string', description: 'Historia previa relevante' },
                      flaw: { type: 'string', description: 'Defecto/herida emocional central' },
                      want: { type: 'string', description: 'Deseo consciente' },
                      need: { type: 'string', description: 'Necesidad inconsciente' },
                      arc: { type: 'string', description: '80-120 palabras de transformación' },
                      first_appearance: { type: 'string' },
                      relationships: { type: 'array', items: { type: 'string' } },
                      voice_signature: { type: 'string', description: 'Forma única de hablar' },
                      secret: { type: 'string' },
                      key_scenes: { type: 'array', items: { type: 'string' } }
                    }
                  }
                },
                
                location_list: { 
                  type: 'array', 
                  items: { 
                    type: 'object',
                    properties: {
                      name: { type: 'string' },
                      type: { type: 'string', enum: ['INT', 'EXT', 'INT/EXT'] },
                      description: { type: 'string', description: '100-150 palabras cinematográficas' },
                      atmosphere: { type: 'string' },
                      history: { type: 'string', description: 'Historia del lugar' },
                      thematic_meaning: { type: 'string' },
                      scenes_estimate: { type: 'number' },
                      time_variants: { type: 'array', items: { type: 'string' } },
                      sound_signature: { type: 'string' },
                      visual_motifs: { type: 'array', items: { type: 'string' } }
                    }
                  }
                },
                
                hero_props: { 
                  type: 'array', 
                  items: { 
                    type: 'object',
                    properties: {
                      name: { type: 'string' },
                      importance: { type: 'string', enum: ['plot_critical', 'character_defining', 'symbolic'] },
                      description: { type: 'string' },
                      visual_details: { type: 'string' },
                      first_appearance: { type: 'string' },
                      narrative_function: { type: 'string' },
                      symbolic_meaning: { type: 'string' }
                    }
                  }
                },
                
                setpieces: { 
                  type: 'array', 
                  items: { 
                    type: 'object',
                    properties: {
                      name: { type: 'string' },
                      episode: { type: 'number' },
                      description: { type: 'string', description: '150-250 palabras con coreografía' },
                      characters_involved: { type: 'array', items: { type: 'string' } },
                      location: { type: 'string' },
                      stakes: { type: 'string' },
                      choreography: { type: 'string', description: 'Secuencia de acciones visual' },
                      turning_points: { type: 'array', items: { type: 'string' } },
                      emotional_climax: { type: 'string' }
                    }
                  }
                },
                
                subplots: { 
                  type: 'array', 
                  items: { 
                    type: 'object',
                    properties: {
                      name: { type: 'string' },
                      description: { type: 'string' },
                      characters: { type: 'array', items: { type: 'string' } },
                      arc_episodes: { type: 'array', items: { type: 'number' } },
                      thematic_connection: { type: 'string', description: 'Cómo conecta con la trama A' },
                      resolution: { type: 'string' },
                      key_moments: { type: 'array', items: { type: 'string' } }
                    }
                  }
                },
                
                twists: { 
                  type: 'array', 
                  items: { 
                    type: 'object',
                    properties: {
                      name: { type: 'string' },
                      episode: { type: 'number' },
                      scene_approx: { type: 'number' },
                      description: { type: 'string' },
                      setup: { type: 'string', description: 'Foreshadowing previo' },
                      payoff: { type: 'string' },
                      impact_on_characters: { type: 'array', items: { type: 'string' } },
                      audience_expectation_subverted: { type: 'string' }
                    }
                  }
                },
                
                counts: { 
                  type: 'object',
                  properties: {
                    protagonists: { type: 'number' },
                    supporting: { type: 'number' },
                    extras_with_lines: { type: 'number' },
                    locations: { type: 'number' },
                    hero_props: { type: 'number' },
                    setpieces: { type: 'number' },
                    subplots: { type: 'number' },
                    twists: { type: 'number' },
                    total_scenes: { type: 'number' },
                    scenes_per_episode: { type: 'number' }
                  }
                },
                
                world_building: {
                  type: 'object',
                  properties: {
                    rules: { type: 'array', items: { type: 'string' } },
                    history: { type: 'string' },
                    social_dynamics: { type: 'string' },
                    visual_style: { type: 'string' }
                  }
                },
                
                assumptions: { type: 'array', items: { type: 'string' } },
                missing_info: { type: 'array', items: { type: 'string' } }
              },
              required: [
                'title',
                'logline',
                'synopsis',
                'genre',
                'tone',
                'themes',
                'beat_sheet',
                'episode_outlines',
                'character_list',
                'location_list',
                'hero_props',
                'setpieces',
                'subplots',
                'twists',
                'counts',
                'assumptions',
                'missing_info'
              ]
            }
          }
        ],
        tool_choice: { type: 'tool', name: 'deliver_outline' },
        messages: [{ role: 'user', content: userPrompt }]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Anthropic API error:', response.status, errorText);

      const lower = errorText.toLowerCase();

      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Claude: límite de tasa alcanzado. Intenta de nuevo en 1-2 minutos.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (response.status === 400 && lower.includes('credit balance is too low')) {
        return new Response(
          JSON.stringify({ error: 'Claude: créditos insuficientes en tu cuenta. Cambia la API key por una con saldo o recarga créditos en Anthropic.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (response.status === 401 || response.status === 403) {
        return new Response(
          JSON.stringify({ error: 'Claude: API key inválida o sin permisos.' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ error: `Claude API error (${response.status}): ${errorText}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();

    const toolUse = Array.isArray(data?.content)
      ? data.content.find((c: any) => c?.type === 'tool_use' && c?.name === 'deliver_outline')
      : null;

    let outline: any = toolUse?.input;

    // Fallback: si el modelo no devuelve tool_use, intenta extraer JSON del texto
    if (!outline) {
      const textBlock = Array.isArray(data?.content)
        ? data.content.find((c: any) => c?.type === 'text')
        : null;

      const content = textBlock?.text ?? data?.content?.[0]?.text;

      if (!content) {
        return new Response(
          JSON.stringify({ error: 'Claude no devolvió contenido.' }),
          { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const fenceMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
      const candidateRaw =
        fenceMatch?.[1]?.trim() ??
        (() => {
          const start = content.indexOf('{');
          const end = content.lastIndexOf('}');
          if (start === -1 || end === -1 || end <= start) return null;
          return content.slice(start, end + 1);
        })();

      if (!candidateRaw) {
        return new Response(
          JSON.stringify({ error: 'Claude devolvió una respuesta sin JSON.' }),
          { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const candidate = candidateRaw.replace(/,\s*([}\]])/g, '$1');

      try {
        outline = JSON.parse(candidate);
      } catch (parseError) {
        console.error('Parse error:', parseError, 'Content:', content.substring(0, 700));
        return new Response(
          JSON.stringify({ error: 'Claude devolvió un JSON inválido. Intenta generar de nuevo.' }),
          { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    console.log('Professional outline generated:', outline.title, 'counts:', JSON.stringify(outline.counts));

    return new Response(
      JSON.stringify({ success: true, outline }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in script-generate-outline:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
