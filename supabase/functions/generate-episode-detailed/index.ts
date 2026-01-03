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

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY no está configurada');
    }

    const episodeBeat = outline.episode_beats?.find((e: any) => e.episode === episodeNumber);
    
    const charactersRef = outline.main_characters?.map((c: any) => 
      `• ${c.name} (${c.role}): ${c.description}`
    ).join('\n') || 'Sin personajes definidos';

    const locationsRef = outline.main_locations?.map((l: any) => 
      `• ${l.type}. ${l.name}: ${l.description}`
    ).join('\n') || 'Sin localizaciones definidas';

    console.log(`Generating detailed episode ${episodeNumber} for "${outline.title}"`);

    const systemPrompt = `Eres un GUIONISTA PROFESIONAL de Hollywood. Escribes GUIONES COMPLETOS con formato screenplay.

=== REGLAS ABSOLUTAS ===
1. MÍNIMO 15 ESCENAS por episodio
2. MÍNIMO 8 LÍNEAS DE DIÁLOGO por escena con personajes
3. ACCIÓN DESCRIPTIVA de 80-150 palabras por escena
4. Diálogos NATURALES con subtexto
5. CONFLICTO en cada escena
6. USA los personajes y localizaciones del outline

Idioma: ${language}`;

    const userPrompt = `ESCRIBE EL GUIÓN COMPLETO DEL EPISODIO ${episodeNumber}.

=== SERIE ===
Título: "${outline.title}"
Logline: ${outline.logline || ''}

=== EPISODIO ${episodeNumber}: "${episodeBeat?.title || `Episodio ${episodeNumber}`}" ===
Beat: ${episodeBeat?.summary || 'Desarrollar la trama.'}

=== PERSONAJES ===
${charactersRef}

=== LOCALIZACIONES ===
${locationsRef}

=== ESTRUCTURA ===
ACTO 1 (Esc 1-5): Setup, incidente incitador
ACTO 2A (Esc 6-8): Complicaciones
ACTO 2B (Esc 9-12): Midpoint, stakes aumentan
ACTO 3 (Esc 13-15+): Clímax, hook siguiente

RESPONDE SOLO CON JSON VÁLIDO (sin markdown):
{
  "episode_number": ${episodeNumber},
  "title": "string",
  "synopsis": "string (150-250 palabras)",
  "scenes": [
    {
      "scene_number": 1,
      "slugline": "INT./EXT. LUGAR - MOMENTO",
      "action": "Descripción visual 80-150 palabras",
      "characters_present": ["NOMBRE1", "NOMBRE2"],
      "dialogue": [
        {"character": "NOMBRE", "parenthetical": "(opcional)", "line": "Diálogo"}
      ],
      "mood": "Atmósfera emocional"
    }
  ],
  "total_duration_min": 45
}

GENERA 15+ ESCENAS CON 8+ LÍNEAS DE DIÁLOGO CADA UNA.`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        max_tokens: 16000,
        temperature: 0.8,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Lovable AI error:', response.status, errorText);
      
      return new Response(
        JSON.stringify({ error: `Error de AI (${response.status})` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    let content = data.choices?.[0]?.message?.content || '';
    
    console.log('AI response length:', content.length);
    
    // Clean markdown code blocks if present
    content = content.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    
    // Extract JSON from response
    let episode: any;
    const jsonStart = content.indexOf('{');
    const jsonEnd = content.lastIndexOf('}');
    
    if (jsonStart !== -1 && jsonEnd > jsonStart) {
      try {
        const jsonStr = content.slice(jsonStart, jsonEnd + 1);
        episode = JSON.parse(jsonStr);
      } catch (parseErr) {
        console.error('JSON parse error:', parseErr);
        // Try to fix common JSON issues
        try {
          const fixed = content
            .slice(jsonStart, jsonEnd + 1)
            .replace(/,\s*([}\]])/g, '$1')
            .replace(/\n/g, ' ')
            .replace(/\r/g, '');
          episode = JSON.parse(fixed);
        } catch {
          console.error('Failed to fix JSON');
          return new Response(
            JSON.stringify({ error: 'Formato de respuesta inválido' }),
            { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }
    } else {
      console.error('No JSON found in response');
      return new Response(
        JSON.stringify({ error: 'No se encontró JSON en la respuesta' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Ensure scenes array exists
    if (!episode.scenes || !Array.isArray(episode.scenes)) {
      episode.scenes = [];
    }

    // Calculate stats
    let totalDialogue = 0;
    for (const scene of episode.scenes) {
      if (!scene.action && scene.description) {
        scene.action = scene.description;
      }
      totalDialogue += scene.dialogue?.length || 0;
    }
    
    episode.episode_number = episodeNumber;
    episode.total_scenes = episode.scenes.length;
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
