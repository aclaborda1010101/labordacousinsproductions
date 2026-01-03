import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { logGenerationCost, extractAnthropicTokens, extractUserId } from "../_shared/cost-logging.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface EpisodeRequest {
  outline: any;
  episodeNumber: number;
  episodeOutline: any;
  characters: any[];
  locations: any[];
  language?: string;
}

const SYSTEM_PROMPT = `Eres BLOCKBUSTER_FORGE_WRITER: guionista profesional con experiencia en HBO, Netflix, y producciones de estudio.

TU MISIÓN: Escribir un EPISODIO COMPLETO con calidad de producción profesional.

FILOSOFÍA DE ESCRITURA PROFESIONAL:

1. DIÁLOGOS QUE REVELAN:
   - Cada línea debe avanzar la trama O revelar personaje (idealmente ambos).
   - Subtexto: lo no dicho es tan importante como lo dicho.
   - Voces distintivas: cada personaje debe sonar único.
   - Evita exposición torpe: "show, don't tell".
   - Usa ritmo: líneas cortas para tensión, largas para reflexión.

2. ACCIÓN CINEMATOGRÁFICA:
   - Escribe para la cámara: describe lo que VEMOS y OÍMOS.
   - Verbos activos y específicos.
   - Detalles sensoriales (luz, sonido, textura).
   - Blocking claro: posiciones y movimientos de personajes.
   - Transiciones visuales entre escenas.

3. ESTRUCTURA DE ESCENA:
   - Cada escena tiene OBJETIVO, CONFLICTO, RESOLUCIÓN (o complicación).
   - Entra tarde, sal temprano: empieza en acción, termina en tensión.
   - Beats emocionales claros.
   - Progresión de stakes dentro de la escena.

4. CONTINUIDAD PROFESIONAL:
   - Time of day consistente.
   - Estados emocionales que evolucionan lógicamente.
   - Props y wardrobe tracking.
   - Geografía de locación clara.

EXTENSIÓN REQUERIDA:
- Action lines: 120-200 palabras por escena (cinematográfico y detallado)
- Diálogos: 8-20 líneas por escena según importancia dramática
- Parentheticals: usar con moderación para dirección actoral específica
- Synopsis de episodio: 300-450 palabras
- Scene summaries: 50-80 palabras

FORMATO PROFESIONAL DE DIÁLOGO:
- Character name en MAYÚSCULAS
- Parentheticals solo cuando necesarios (beat), (off), (V.O.), (CONT'D)
- Líneas de diálogo naturales, no expositivas
- Interrupciones con -- 
- Pausas con ... o (beat)

REGLAS ABSOLUTAS:
- NUNCA resumir con "siguen hablando..." o "la conversación continúa..."
- NUNCA usar diálogos genéricos o clichés
- SIEMPRE incluir conflicto (aunque sea sutil) en cada escena
- SIEMPRE dar dirección actoral implícita en la acción
- SIEMPRE mantener las voces de personajes consistentes

IDIOMA: Escribe en el idioma indicado con riqueza literaria.`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { outline, episodeNumber, episodeOutline, characters, locations, language }: EpisodeRequest = await req.json();

    if (!outline || !episodeOutline) {
      return new Response(
        JSON.stringify({ error: 'Se requiere outline y episodeOutline' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
    if (!ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY no está configurada');
    }

    // Build detailed character reference
    const characterRef = characters.map(c => {
      const parts = [
        `### ${c.name.toUpperCase()} (${c.role})`,
        `Descripción: ${c.description || 'Sin descripción'}`,
        c.backstory ? `Backstory: ${c.backstory}` : '',
        c.flaw ? `Flaw/Herida: ${c.flaw}` : '',
        c.want ? `Want: ${c.want}` : '',
        c.need ? `Need: ${c.need}` : '',
        `Voz: ${c.voice_signature || 'Habla de forma directa y natural'}`,
        c.relationships?.length ? `Relaciones: ${c.relationships.join(', ')}` : ''
      ].filter(Boolean);
      return parts.join('\n');
    }).join('\n\n');

    // Build detailed location reference
    const locationRef = locations.map(l => {
      const parts = [
        `### ${l.name} (${l.type})`,
        `Descripción: ${l.description || 'Sin descripción'}`,
        l.atmosphere ? `Atmósfera: ${l.atmosphere}` : '',
        l.sound_signature ? `Sonido: ${l.sound_signature}` : '',
        l.visual_motifs?.length ? `Motivos visuales: ${l.visual_motifs.join(', ')}` : ''
      ].filter(Boolean);
      return parts.join('\n');
    }).join('\n\n');

    // Build key scenes reference
    const keyScenesRef = episodeOutline.key_scenes?.map((s: any, i: number) => 
      `${i + 1}. ${s.slugline}\n   ${s.description}\n   Conflicto: ${s.conflict || 'A desarrollar'}\n   Personajes: ${s.characters?.join(', ') || 'A definir'}`
    ).join('\n\n') || 'Desarrollar según sinopsis del episodio';

    const userPrompt = `ESCRIBE EL EPISODIO ${episodeNumber} COMPLETO CON CALIDAD PROFESIONAL:

=== SERIE ===
Título: "${outline.title}"
Género: ${outline.genre}
Tono: ${outline.tone}
Logline: ${outline.logline}
Temas: ${outline.themes?.join(', ') || 'Drama humano'}

=== EPISODIO ${episodeNumber}: "${episodeOutline.title}" ===

SINOPSIS:
${episodeOutline.synopsis}

ESTRUCTURA:
- Cold Open: ${episodeOutline.cold_open || 'Hook impactante que enganche al espectador'}
- Act Breaks: ${episodeOutline.act_breaks?.join(' | ') || 'Desarrollar naturalmente'}
- Cliffhanger: ${episodeOutline.cliffhanger || 'Final que deje al espectador queriendo más'}

DESARROLLO DE PERSONAJES ESTE EPISODIO:
${episodeOutline.character_development?.map((d: string) => `• ${d}`).join('\n') || '• Desarrollar arcos según sinopsis'}

PROGRESO DE SUBTRAMAS:
${episodeOutline.subplot_progress?.map((s: string) => `• ${s}`).join('\n') || '• Avanzar subtramas establecidas'}

ESCENAS CLAVE A DESARROLLAR:
${keyScenesRef}

NÚMERO DE ESCENAS: ${episodeOutline.scenes_count || 15} (ajustar según ritmo dramático)

=== BIBLIA DE PERSONAJES ===
${characterRef}

=== BIBLIA DE LOCACIONES ===
${locationRef}

=== INSTRUCCIONES DE ESCRITURA ===

1. ESCRIBE TODAS LAS ESCENAS del episodio (${episodeOutline.scenes_count || 15} escenas aproximadamente).

2. DIÁLOGOS EXTENSOS Y NATURALES:
   - 8-20 líneas de diálogo por escena según importancia dramática
   - Cada personaje debe sonar ÚNICO según su voice_signature
   - Incluye subtexto: lo que dicen vs lo que quieren decir
   - Usa interrupciones (--) y pausas (...) naturalmente

3. ACCIÓN CINEMATOGRÁFICA:
   - 120-200 palabras de acción por escena
   - Describe lo que VEMOS y OÍMOS
   - Blocking claro de personajes
   - Detalles atmosféricos (luz, sonido, textura)

4. CADA ESCENA debe tener:
   - Objetivo claro
   - Conflicto (aunque sea sutil)
   - Cambio de estado al final
   - Continuity anchors para producción

5. INCLUYE NOTAS DE PRODUCCIÓN:
   - Music cues para momentos clave
   - SFX cues importantes
   - VFX requirements si aplica

IDIOMA: ${language || 'es-ES'}

Usa la herramienta deliver_episode para entregar el episodio completo.`;

    console.log(`Generating professional episode ${episodeNumber} with Claude Sonnet`);

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
        temperature: 0.5,
        system: SYSTEM_PROMPT,
        tools: [
          {
            name: 'deliver_episode',
            description: 'Entrega el episodio profesional como objeto estructurado.',
            input_schema: {
              type: 'object',
              properties: {
                episode_number: { type: 'number' },
                title: { type: 'string' },
                synopsis: { type: 'string', description: 'Synopsis narrativo de 300-450 palabras' },
                summary: { type: 'string', description: 'Resumen de 2-3 oraciones' },
                duration_min: { type: 'number' },
                teaser: { type: 'string', description: 'Descripción del cold open/teaser' },
                
                scenes: { 
                  type: 'array', 
                  items: { 
                    type: 'object',
                    properties: {
                      scene_number: { type: 'number' },
                      slugline: { type: 'string', description: 'INT./EXT. LOCALIZACIÓN - DÍA/NOCHE' },
                      summary: { type: 'string', description: 'Resumen de 50-80 palabras' },
                      characters: { type: 'array', items: { type: 'string' } },
                      
                      action: { type: 'string', description: 'Acción cinematográfica de 120-200 palabras' },
                      
                      dialogue: { 
                        type: 'array', 
                        items: { 
                          type: 'object',
                          properties: {
                            character: { type: 'string', description: 'Nombre en MAYÚSCULAS' },
                            parenthetical: { type: 'string', description: '(beat), (off), (V.O.), etc.' },
                            line: { type: 'string', description: 'Línea de diálogo natural' }
                          },
                          required: ['character', 'line']
                        },
                        description: '8-20 líneas de diálogo por escena'
                      },
                      
                      subtext: { type: 'string', description: 'Lo que los personajes realmente quieren/sienten' },
                      scene_objective: { type: 'string', description: 'Qué debe lograr esta escena' },
                      conflict: { type: 'string', description: 'El conflicto central de la escena' },
                      resolution: { type: 'string', description: 'Cómo cambia el estado al final' },
                      
                      music_cue: { type: 'string' },
                      sfx_cue: { type: 'string' },
                      vfx: { type: 'array', items: { type: 'string' } },
                      
                      mood: { type: 'string' },
                      pacing: { type: 'string', description: 'Ritmo de la escena: frenético, contemplativo, etc.' },
                      
                      continuity_anchors: { 
                        type: 'object',
                        properties: {
                          time_of_day: { type: 'string' },
                          weather: { type: 'string' },
                          character_states: { type: 'object', additionalProperties: { type: 'string' } },
                          props_in_use: { type: 'array', items: { type: 'string' } },
                          wardrobe_notes: { type: 'string' }
                        }
                      },
                      
                      director_notes: { type: 'string', description: 'Notas de dirección opcionales' }
                    },
                    required: ['scene_number', 'slugline', 'summary', 'characters', 'action', 'dialogue', 'mood', 'continuity_anchors']
                  }
                },
                
                act_structure: { 
                  type: 'object',
                  properties: {
                    cold_open: { type: 'string' },
                    act_one: { type: 'string' },
                    act_one_break: { type: 'string' },
                    act_two: { type: 'string' },
                    midpoint: { type: 'string' },
                    act_two_break: { type: 'string' },
                    act_three: { type: 'string' },
                    climax: { type: 'string' },
                    resolution: { type: 'string' },
                    tag: { type: 'string' }
                  }
                },
                
                cliffhanger: { type: 'string' },
                themes_explored: { type: 'array', items: { type: 'string' } },
                character_arcs_advanced: { type: 'object', additionalProperties: { type: 'string' } },
                
                total_dialogue_lines: { type: 'number' },
                total_action_blocks: { type: 'number' },
                estimated_page_count: { type: 'number' }
              },
              required: [
                'episode_number', 
                'title', 
                'synopsis', 
                'summary', 
                'duration_min', 
                'scenes', 
                'act_structure', 
                'cliffhanger',
                'total_dialogue_lines',
                'total_action_blocks'
              ]
            }
          }
        ],
        tool_choice: { type: 'tool', name: 'deliver_episode' },
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
    
    // Extract token usage for cost tracking
    const { inputTokens, outputTokens } = extractAnthropicTokens(data);
    const startTime = Date.now();

    const toolUse = Array.isArray(data?.content)
      ? data.content.find((c: any) => c?.type === 'tool_use' && c?.name === 'deliver_episode')
      : null;

    let episode: any = toolUse?.input;

    // Fallback: si el modelo no devuelve tool_use, intenta extraer JSON del texto
    if (!episode) {
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
        episode = JSON.parse(candidate);
      } catch (parseError) {
        console.error('Parse error:', parseError, 'Content:', content.substring(0, 700));
        return new Response(
          JSON.stringify({ error: 'Claude devolvió un JSON inválido. Intenta generar de nuevo.' }),
          { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Count dialogue lines
    let totalDialogue = 0;
    let totalActionBlocks = 0;
    if (episode.scenes) {
      for (const scene of episode.scenes) {
        totalDialogue += scene.dialogue?.length || 0;
        if (scene.action) totalActionBlocks++;
      }
    }
    episode.total_dialogue_lines = totalDialogue;
    episode.total_action_blocks = totalActionBlocks;
    episode.estimated_page_count = Math.ceil((totalDialogue + totalActionBlocks * 3) / 8);

    console.log(`Professional episode ${episodeNumber} generated: ${episode.scenes?.length || 0} scenes, ${totalDialogue} dialogue lines, ~${episode.estimated_page_count} pages`);
    console.log(`Token usage: ${inputTokens} in / ${outputTokens} out`);

    // Log generation cost with real token counts
    const userId = extractUserId(req.headers.get('authorization'));
    if (userId) {
      await logGenerationCost({
        userId,
        projectId: outline.projectId || undefined,
        slotType: 'episode_script',
        engine: 'anthropic',
        model: 'claude-sonnet-4-20250514',
        durationMs: Date.now() - startTime,
        success: true,
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        category: 'script',
        metadata: {
          episodeNumber,
          scenesCount: episode.scenes?.length || 0,
          dialogueLines: totalDialogue,
          pageCount: episode.estimated_page_count
        }
      });
    }

    return new Response(
      JSON.stringify({ success: true, episode, tokenUsage: { input: inputTokens, output: outputTokens } }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in script-generate-episode:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
