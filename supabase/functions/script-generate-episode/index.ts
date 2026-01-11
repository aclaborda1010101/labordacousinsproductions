import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { logGenerationCost, extractAnthropicTokens, extractUserId } from "../_shared/cost-logging.ts";
import { 
  HOLLYWOOD_SYSTEM_PROMPT, 
  EPISODIC_ADDITIONS,
  getGenreRules,
  PROFESSIONAL_EXAMPLES
} from "../_shared/hollywood-writing-dna.ts";

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

// Build the Hollywood-tier system prompt for episodes
function buildEpisodeSystemPrompt(genre?: string): string {
  return `${HOLLYWOOD_SYSTEM_PROMPT}

${EPISODIC_ADDITIONS}

${genre ? getGenreRules(genre) : ''}

═══════════════════════════════════════════════════════════════════════════════
EJEMPLOS DE ESCRITURA PROFESIONAL (ESTUDIA Y EMULA)
═══════════════════════════════════════════════════════════════════════════════

${PROFESSIONAL_EXAMPLES.coldOpen}

${PROFESSIONAL_EXAMPLES.characterIntro}

${PROFESSIONAL_EXAMPLES.subtextDialogue}

═══════════════════════════════════════════════════════════════════════════════
EXTENSIÓN Y CALIDAD REQUERIDA
═══════════════════════════════════════════════════════════════════════════════

Para cada ESCENA debes entregar:

1. ACTION LINES (120-200 palabras):
   - Describe lo que VEMOS y OÍMOS
   - Verbos activos, tiempo presente
   - Detalles sensoriales (luz, sonido, textura)
   - Blocking claro de personajes
   - Micro-direcciones entre paréntesis cuando necesario

2. DIÁLOGOS (8-25 líneas según importancia):
   - Cada personaje con VOZ DISTINTIVA
   - Subtexto en cada intercambio
   - Interrupciones (--) para conflicto
   - Pausas (...) para peso
   - (beat) para timing actoral
   - NUNCA exposición tipo "Como sabes..."

3. ESTRUCTURA DE ESCENA:
   - Entra TARDE (en medio de la acción)
   - Sale TEMPRANO (antes de resolución)
   - Conflicto visible (aunque sea sutil)
   - TURN que cambia algo
   - Hook hacia la siguiente escena

4. CONTINUITY:
   - Time of day consistente
   - Estados emocionales que evolucionan
   - Props tracking
   - Wardrobe notes cuando relevante

ANTI-PATRONES PROHIBIDOS:
❌ "Sus ojos reflejan determinación" → NO puedes filmar "determinación"
❌ "Hay algo en su mirada" → VAGO
❌ "La tensión era palpable" → ABSTRACTO
❌ "Como sabes, Juan..." → EXPOSICIÓN TORPE
❌ Resumir diálogos → "Siguen hablando..." PROHIBIDO
❌ Todos hablan igual → SIN VOCES DISTINTIVAS
❌ Escenas sin conflicto → ABURRIDO

SIEMPRE ESCRIBE:
✅ "Sus manos tiemblan. Las esconde bajo la mesa."
✅ "Aparta la mirada. Traga saliva."
✅ Diálogos COMPLETOS, línea por línea
✅ Voces únicas para cada personaje
✅ Hooks al final de cada escena`;
}

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

    // Use Lovable AI Gateway
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY no está configurada');
    }

    const startTime = Date.now();

    // Build detailed character reference with voice notes
    const characterRef = characters.map(c => {
      const parts = [
        `### ${c.name.toUpperCase()} (${c.role})`,
        `Físico: ${c.description || 'Por definir visualmente'}`,
        c.backstory ? `Backstory: ${c.backstory}` : '',
        c.flaw ? `Flaw/Herida: ${c.flaw}` : '',
        c.want ? `Want (consciente): ${c.want}` : '',
        c.need ? `Need (inconsciente): ${c.need}` : '',
        c.secret ? `Secreto: ${c.secret}` : '',
        ``,
        `VOZ (CRÍTICO para diálogos):`,
        `- Vocabulario: ${c.vocabulary || 'Ajustar según educación y contexto'}`,
        `- Ritmo: ${c.speech_rhythm || 'Natural, pausas cuando piensa'}`,
        `- Tics verbales: ${c.verbal_tics || 'Ninguno específico'}`,
        `- Registro: ${c.register || 'Formal/informal según contexto'}`,
        `- Voice signature: ${c.voice_signature || 'Habla de forma directa'}`,
        c.catchphrase ? `- Frase característica: "${c.catchphrase}"` : '',
        ``,
        c.relationships?.length ? `Relaciones: ${c.relationships.join(', ')}` : ''
      ].filter(Boolean);
      return parts.join('\n');
    }).join('\n\n---\n\n');

    // Build detailed location reference
    const locationRef = locations.map(l => {
      const parts = [
        `### ${l.name} (${l.type})`,
        `Visual: ${l.description || 'Por definir'}`,
        l.atmosphere ? `Atmósfera emocional: ${l.atmosphere}` : '',
        l.sound_signature ? `Sonido ambiente: ${l.sound_signature}` : '',
        l.lighting_notes ? `Iluminación típica: ${l.lighting_notes}` : '',
        l.visual_motifs?.length ? `Motivos visuales: ${l.visual_motifs.join(', ')}` : '',
        l.story_function ? `Función narrativa: ${l.story_function}` : ''
      ].filter(Boolean);
      return parts.join('\n');
    }).join('\n\n');

    // Build key scenes reference
    const keyScenesRef = episodeOutline.key_scenes?.map((s: any, i: number) => 
      `${i + 1}. ${s.slugline}
   Conflicto: ${s.conflict || 'A desarrollar'}
   Personajes: ${s.characters?.join(', ') || 'A definir'}
   Objetivo: ${s.objective || 'Avanzar trama'}
   ${s.description}`
    ).join('\n\n') || 'Desarrollar según sinopsis del episodio';

    // Build the Hollywood-tier system prompt
    const detectedGenre = outline.genre || 'drama';
    const systemPrompt = buildEpisodeSystemPrompt(detectedGenre);

    const userPrompt = `ESCRIBE EL EPISODIO ${episodeNumber} CON CALIDAD HOLLYWOOD:

═══════════════════════════════════════════════════════════════════════════════
INFORMACIÓN DE LA SERIE
═══════════════════════════════════════════════════════════════════════════════

Título: "${outline.title}"
Género: ${outline.genre}
Tono: ${outline.tone}
Logline: ${outline.logline}
Temas: ${outline.themes?.join(', ') || 'Drama humano'}
Estilo visual: ${outline.visual_style || 'Cinematográfico'}

═══════════════════════════════════════════════════════════════════════════════
EPISODIO ${episodeNumber}: "${episodeOutline.title}"
═══════════════════════════════════════════════════════════════════════════════

SINOPSIS:
${episodeOutline.synopsis}

COLD OPEN (Hook antes de títulos):
${episodeOutline.cold_open || 'Crear un hook impactante que enganche en los primeros segundos'}

ACT BREAKS:
${episodeOutline.act_breaks?.join('\n• ') || 'Desarrollar naturalmente con cliffhangers en cada corte'}

CLIFFHANGER FINAL:
${episodeOutline.cliffhanger || 'Terminar con pregunta o revelación que exija ver el siguiente'}

DESARROLLO DE PERSONAJES ESTE EPISODIO:
${episodeOutline.character_development?.map((d: string) => `• ${d}`).join('\n') || '• Desarrollar arcos según sinopsis'}

PROGRESO DE SUBTRAMAS:
${episodeOutline.subplot_progress?.map((s: string) => `• ${s}`).join('\n') || '• Avanzar subtramas establecidas'}

═══════════════════════════════════════════════════════════════════════════════
ESCENAS CLAVE A DESARROLLAR
═══════════════════════════════════════════════════════════════════════════════

${keyScenesRef}

NÚMERO TOTAL DE ESCENAS: ${episodeOutline.scenes_count || 15}

═══════════════════════════════════════════════════════════════════════════════
BIBLIA DE PERSONAJES (VOCES ÚNICAS)
═══════════════════════════════════════════════════════════════════════════════

${characterRef}

═══════════════════════════════════════════════════════════════════════════════
BIBLIA DE LOCACIONES
═══════════════════════════════════════════════════════════════════════════════

${locationRef}

═══════════════════════════════════════════════════════════════════════════════
INSTRUCCIONES DE ESCRITURA
═══════════════════════════════════════════════════════════════════════════════

1. ESCRIBE TODAS LAS ESCENAS del episodio (${episodeOutline.scenes_count || 15} escenas).

2. COLD OPEN IMPACTANTE:
   - Primera imagen debe ENGANCHAR inmediatamente
   - Sonido o visual atmosférico ANTES de revelar personaje
   - Genera PREGUNTA que el episodio responderá

3. DIÁLOGOS PROFESIONALES (8-25 líneas por escena):
   - CADA personaje debe sonar ÚNICO según su voice_signature
   - SUBTEXTO: lo que dicen vs lo que quieren
   - Interrupciones (--) para conflicto activo
   - Pausas (...) y (beat) para peso dramático
   - NUNCA exposición tipo "Como sabes..."

4. ACCIÓN CINEMATOGRÁFICA (120-200 palabras por escena):
   - Describe lo que VEMOS y OÍMOS
   - Verbos activos, tiempo presente
   - Detalles sensoriales específicos
   - Blocking claro de personajes

5. ESTRUCTURA DE CADA ESCENA:
   - Objetivo claro
   - Conflicto (aunque sea sutil)
   - TURN que cambia algo
   - Hook hacia la siguiente escena
   - Entra TARDE, sale TEMPRANO

6. ACT BREAKS con mini-cliffhangers

7. CLIFFHANGER FINAL que exija ver el siguiente episodio

IDIOMA: ${language || 'es-ES'}

Usa la herramienta deliver_episode para entregar el episodio completo.`;

    console.log(`Generating Hollywood-tier episode ${episodeNumber} with Lovable AI`);

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-pro',
        max_completion_tokens: 32000,
        temperature: 0.75,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'deliver_episode',
              description: 'Entrega el episodio profesional como objeto estructurado.',
              parameters: {
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
                              line: { type: 'string', description: 'Línea de diálogo natural con subtexto' }
                            },
                            required: ['character', 'line']
                          },
                          description: '8-25 líneas de diálogo por escena según importancia'
                        },
                        
                        subtext: { type: 'string', description: 'Lo que los personajes realmente quieren/sienten' },
                        scene_objective: { type: 'string', description: 'Qué debe lograr esta escena' },
                        scene_turn: { type: 'string', description: 'Qué cambia durante la escena' },
                        conflict: { type: 'string', description: 'El conflicto central de la escena' },
                        hook_to_next: { type: 'string', description: 'Última línea o imagen que conecta con siguiente' },
                        
                        music_cue: { type: 'string' },
                        sfx_cue: { type: 'string' },
                        vfx: { type: 'array', items: { type: 'string' } },
                        
                        mood: { type: 'string' },
                        pacing: { type: 'string', description: 'frenético | tenso | contemplativo | explosivo' },
                        
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
                      cold_open: { type: 'string', description: 'Hook visual antes de títulos' },
                      act_one: { type: 'string' },
                      act_one_break: { type: 'string', description: 'Mini-cliffhanger' },
                      act_two: { type: 'string' },
                      midpoint: { type: 'string', description: 'Revelación o giro central' },
                      act_two_break: { type: 'string', description: 'Momento de todo está perdido' },
                      act_three: { type: 'string' },
                      climax: { type: 'string' },
                      resolution: { type: 'string' },
                      tag: { type: 'string', description: 'Cierre + setup siguiente' }
                    }
                  },
                  
                  cliffhanger: { type: 'string', description: 'Final que exige ver el siguiente episodio' },
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
          }
        ],
        tool_choice: { type: 'function', function: { name: 'deliver_episode' } }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Lovable AI error:', response.status, errorText);

      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Try again in a moment.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'Payment required - add credits to Lovable AI' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ error: `Lovable AI error (${response.status}): ${errorText}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    
    // Extract from tool call
    const toolCall = data?.choices?.[0]?.message?.tool_calls?.[0];
    let episode: any = toolCall?.function?.arguments 
      ? JSON.parse(toolCall.function.arguments) 
      : null;

    // Fallback: extract from text content
    if (!episode) {
      const content = data?.choices?.[0]?.message?.content;
      
      if (!content) {
        return new Response(
          JSON.stringify({ error: 'AI did not return content.' }),
          { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Try to parse JSON from content
      const fenceMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
      const candidateRaw = fenceMatch?.[1]?.trim() ?? (() => {
        const start = content.indexOf('{');
        const end = content.lastIndexOf('}');
        if (start === -1 || end === -1 || end <= start) return null;
        return content.slice(start, end + 1);
      })();

      if (!candidateRaw) {
        return new Response(
          JSON.stringify({ error: 'AI returned response without valid JSON.' }),
          { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const candidate = candidateRaw.replace(/,\s*([}\]])/g, '$1');

      try {
        episode = JSON.parse(candidate);
      } catch (parseError) {
        console.error('Parse error:', parseError, 'Content:', content.substring(0, 700));
        return new Response(
          JSON.stringify({ error: 'AI returned invalid JSON. Try again.' }),
          { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Count dialogue lines and action blocks
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

    const durationMs = Date.now() - startTime;
    console.log(`Hollywood-tier episode ${episodeNumber} generated: ${episode.scenes?.length || 0} scenes, ${totalDialogue} dialogue lines, ~${episode.estimated_page_count} pages in ${durationMs}ms`);

    // Log generation cost
    const userId = extractUserId(req.headers.get('authorization'));
    if (userId) {
      await logGenerationCost({
        userId,
        projectId: outline.projectId || undefined,
        slotType: 'episode_script_hollywood',
        engine: 'lovable-ai',
        model: 'google/gemini-2.5-pro',
        durationMs,
        success: true,
        category: 'script',
        metadata: {
          episodeNumber,
          scenesCount: episode.scenes?.length || 0,
          dialogueLines: totalDialogue,
          pageCount: episode.estimated_page_count,
          promptVersion: 'hollywood-dna-v1'
        }
      });
    }

    return new Response(
      JSON.stringify({ success: true, episode }),
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
