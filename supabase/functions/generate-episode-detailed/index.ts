import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface EpisodeRequest {
  outline: any;
  episodeNumber: number;
  language?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { outline, episodeNumber, language = 'es-ES' }: EpisodeRequest = await req.json();

    if (!outline || !episodeNumber) {
      return new Response(
        JSON.stringify({ error: 'Se requiere outline y episodeNumber' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
    if (!ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY no está configurada');
    }

    const episodeBeat = outline.episode_beats?.find((e: any) => e.episode === episodeNumber);
    
    const charactersRef = outline.main_characters?.map((c: any) => 
      `• ${c.name} (${c.role}): ${c.description}`
    ).join('\n') || 'Sin personajes definidos';

    const locationsRef = outline.main_locations?.map((l: any) => 
      `• ${l.type}. ${l.name}: ${l.description}`
    ).join('\n') || 'Sin localizaciones definidas';

    const systemPrompt = `Eres un GUIONISTA PROFESIONAL de Hollywood. Escribes GUIONES COMPLETOS con formato screenplay estándar.

=== REGLAS ABSOLUTAS ===
1. MÍNIMO 15 ESCENAS por episodio - NO MENOS
2. MÍNIMO 8 LÍNEAS DE DIÁLOGO por escena con personajes hablando
3. ACCIÓN DESCRIPTIVA de 100-200 palabras por escena (visual, cinematográfica)
4. NO uses "FADE IN/FADE OUT" como contenido - eso lo añadimos nosotros
5. Cada escena tiene: slugline, acción, diálogos, mood
6. Diálogos NATURALES y con subtexto, NO expositivos
7. CONFLICTO en cada escena - algo está en juego
8. USA los personajes y localizaciones del outline

=== FORMATO DE DIÁLOGO ===
Cada línea de diálogo incluye:
- character: Nombre en MAYÚSCULAS
- parenthetical: (acotación de actuación, opcional)
- line: El diálogo completo

Idioma de escritura: ${language}`;

    const userPrompt = `ESCRIBE EL GUIÓN COMPLETO DEL EPISODIO ${episodeNumber}.

=== INFORMACIÓN DE LA SERIE ===
Título: "${outline.title}"
Género: ${outline.genre || 'Drama'}
Tono: ${outline.tone || 'Cinematográfico'}
Logline: ${outline.logline || ''}

=== EPISODIO ${episodeNumber}: "${episodeBeat?.title || `Episodio ${episodeNumber}`}" ===
Resumen del beat: ${episodeBeat?.summary || 'Desarrollar la trama principal del episodio.'}

=== PERSONAJES A USAR ===
${charactersRef}

=== LOCALIZACIONES A USAR ===
${locationsRef}

=== ESTRUCTURA REQUERIDA ===
ACTO 1 (Escenas 1-5): Setup, mundo ordinario, incidente incitador
ACTO 2A (Escenas 6-8): Complicaciones, obstáculos iniciales  
ACTO 2B (Escenas 9-12): Midpoint, giro, stakes aumentan
ACTO 3 (Escenas 13-15+): Clímax, resolución del episodio, hook para siguiente

=== EJEMPLO DE ESCENA CORRECTA ===
{
  "scene_number": 1,
  "slugline": "EXT. CERN - CAMPUS PRINCIPAL - AMANECER",
  "action": "El complejo del CERN emerge de la neblina matinal. Los edificios científicos se alzan como catedrales del conocimiento. Un grupo de investigadores camina apresuradamente hacia el edificio principal, sus rostros marcados por la urgencia. ELENA VÁSQUEZ, 38, cabello oscuro recogido, bata de laboratorio sobre ropa casual, consulta su tablet mientras camina sin aminorar el paso. A su lado, PIERRE DUBOIS, 52, calvicie incipiente, gafas de montura gruesa, intenta seguirle el ritmo mientras revisa un informe impreso.",
  "characters_present": ["ELENA VÁSQUEZ", "PIERRE DUBOIS"],
  "dialogue": [
    {
      "character": "ELENA VÁSQUEZ",
      "parenthetical": "sin levantar la vista del tablet",
      "line": "Pierre, los datos no tienen sentido. Las mediciones de esta madrugada... es como si las constantes fundamentales hubieran cambiado."
    },
    {
      "character": "PIERRE DUBOIS",
      "parenthetical": "ajustándose las gafas, nervioso",
      "line": "He revisado los instrumentos tres veces. No es un error de calibración. Algo ocurrió a las 3:47 AM, tiempo universal."
    },
    {
      "character": "ELENA VÁSQUEZ",
      "line": "¿Algo? Pierre, las lecturas sugieren una alteración cuántica a escala planetaria. Eso es imposible."
    },
    {
      "character": "PIERRE DUBOIS",
      "parenthetical": "deteniéndose en seco",
      "line": "Imposible era la palabra favorita de la física antes del amanecer de hoy."
    },
    {
      "character": "ELENA VÁSQUEZ",
      "parenthetical": "con una mezcla de fascinación y miedo",
      "line": "¿Estás diciendo que alguien o algo reescribió las leyes de la física?"
    },
    {
      "character": "PIERRE DUBOIS",
      "line": "No solo las reescribió. Las seleccionó. La energía cinética de los proyectiles... específicamente anulada."
    },
    {
      "character": "ELENA VÁSQUEZ",
      "parenthetical": "susurrando",
      "line": "Alguien apagó las armas. Todas las armas del mundo."
    },
    {
      "character": "PIERRE DUBOIS",
      "line": "Y lo hizo en una sola noche, como si fuera tan simple como apagar un interruptor."
    }
  ],
  "mood": "Tensión creciente, asombro científico mezclado con inquietud existencial",
  "duration_estimate_sec": 120
}

=== IMPORTANTE ===
- ESCRIBE 15+ ESCENAS COMPLETAS
- CADA ESCENA CON DIÁLOGO EXTENSO (8+ líneas)
- ACCIÓN VISUAL Y CINEMATOGRÁFICA
- USA la herramienta deliver_episode para entregar

GENERA AHORA EL EPISODIO COMPLETO.`;

    console.log(`Generating detailed episode ${episodeNumber} for "${outline.title}"`);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 12000,
        temperature: 0.85,
        system: systemPrompt,
        tools: [
          {
            name: 'deliver_episode',
            description: 'Entrega el episodio completo con todas las escenas, diálogos y acción.',
            input_schema: {
              type: 'object',
              properties: {
                episode_number: { type: 'number' },
                title: { type: 'string', description: 'Título del episodio' },
                synopsis: { type: 'string', description: 'Resumen del episodio (150-250 palabras)' },
                scenes: {
                  type: 'array',
                  description: 'MÍNIMO 15 escenas completas',
                  items: {
                    type: 'object',
                    properties: {
                      scene_number: { type: 'number' },
                      slugline: { type: 'string', description: 'INT./EXT. LOCALIZACIÓN - MOMENTO DEL DÍA' },
                      action: { type: 'string', description: 'Descripción visual de 100-200 palabras. Acción, movimiento, atmósfera.' },
                      characters_present: { 
                        type: 'array', 
                        items: { type: 'string' },
                        description: 'Nombres de personajes en la escena'
                      },
                      dialogue: {
                        type: 'array',
                        description: 'MÍNIMO 8 líneas de diálogo para escenas con personajes',
                        items: {
                          type: 'object',
                          properties: {
                            character: { type: 'string', description: 'Nombre del personaje en MAYÚSCULAS' },
                            parenthetical: { type: 'string', description: 'Acotación de actuación (opcional)' },
                            line: { type: 'string', description: 'El texto del diálogo' }
                          },
                          required: ['character', 'line']
                        }
                      },
                      mood: { type: 'string', description: 'Atmósfera emocional de la escena' },
                      duration_estimate_sec: { type: 'number', description: 'Duración estimada en segundos (60-180)' }
                    },
                    required: ['scene_number', 'slugline', 'action', 'characters_present', 'mood']
                  }
                },
                total_duration_min: { type: 'number', description: 'Duración total estimada del episodio' }
              },
              required: ['episode_number', 'title', 'synopsis', 'scenes', 'total_duration_min']
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

      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Límite de tasa alcanzado. Intenta en 1-2 minutos.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (response.status === 400 && errorText.toLowerCase().includes('credit')) {
        return new Response(
          JSON.stringify({ error: 'Créditos insuficientes en Claude.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ error: `Error de Claude (${response.status})` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();

    const toolUse = Array.isArray(data?.content)
      ? data.content.find((c: any) => c?.type === 'tool_use' && c?.name === 'deliver_episode')
      : null;

    let episode = toolUse?.input;

    if (!episode) {
      // Fallback: try to parse JSON from text
      const textBlock = data?.content?.find((c: any) => c?.type === 'text');
      const content = textBlock?.text ?? '';
      const start = content.indexOf('{');
      const end = content.lastIndexOf('}');
      if (start !== -1 && end > start) {
        try {
          episode = JSON.parse(content.slice(start, end + 1).replace(/,\s*([}\]])/g, '$1'));
        } catch {
          return new Response(
            JSON.stringify({ error: 'Claude devolvió formato inválido.' }),
            { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      } else {
        return new Response(
          JSON.stringify({ error: 'Claude no devolvió episodio.' }),
          { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Calculate stats and ensure consistent field naming
    let totalDialogue = 0;
    if (episode.scenes && Array.isArray(episode.scenes)) {
      for (const scene of episode.scenes) {
        // Ensure 'action' field exists (some responses might use 'description')
        if (!scene.action && scene.description) {
          scene.action = scene.description;
        }
        totalDialogue += scene.dialogue?.length || 0;
      }
    }
    
    episode.total_scenes = episode.scenes?.length || 0;
    episode.total_dialogue_lines = totalDialogue;

    console.log(`Episode ${episodeNumber} generated: ${episode.total_scenes} scenes, ${totalDialogue} dialogue lines`);

    return new Response(
      JSON.stringify({ success: true, episode }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in generate-episode-detailed:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Error desconocido' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
