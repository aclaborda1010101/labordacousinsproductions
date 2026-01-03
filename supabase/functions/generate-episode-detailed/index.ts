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

// Generate scenes in batches of 5 to avoid timeout
async function generateScenesBatch(
  apiKey: string,
  batchNum: number,
  startScene: number,
  endScene: number,
  episodeBeat: any,
  outline: any,
  previousScenes: any[],
  language: string
): Promise<any[]> {
  
  const charactersRef = outline.main_characters?.map((c: any) => 
    `• ${c.name}: ${c.description}`
  ).join('\n') || '';

  const locationsRef = outline.main_locations?.map((l: any) => 
    `• ${l.name}: ${l.description}`
  ).join('\n') || '';

  const prevContext = previousScenes.length > 0
    ? `ESCENAS PREVIAS (para continuidad):\n${previousScenes.slice(-2).map(s => 
        `Escena ${s.scene_number}: ${s.slugline} - ${s.mood || ''}`
      ).join('\n')}`
    : '';

  const prompt = `Genera SOLO las escenas ${startScene} a ${endScene}.

EPISODIO: "${episodeBeat?.title || 'Sin título'}"
BEAT: ${episodeBeat?.summary || 'Desarrollar la trama.'}

${prevContext}

PERSONAJES:
${charactersRef}

LOCALIZACIONES:
${locationsRef}

CADA ESCENA incluye:
- scene_number (del ${startScene} al ${endScene})
- slugline (INT./EXT. LUGAR - MOMENTO)
- action (100-150 palabras de acción visual)
- characters_present (array)
- dialogue (mínimo 6 líneas: {character, parenthetical?, line})
- mood
- duration_estimate_sec (60-120)

Responde SOLO JSON válido sin markdown:
{"scenes": [{...}, {...}]}`;

  console.log(`[Batch ${batchNum}] Generating scenes ${startScene}-${endScene}...`);

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      temperature: 0.8,
      system: `Eres un guionista profesional. Generas escenas cinematográficas en JSON válido. Idioma: ${language}`,
      messages: [{ role: 'user', content: prompt }]
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error(`[Batch ${batchNum}] API error:`, response.status, errText);
    throw new Error(`Claude API error: ${response.status}`);
  }

  const data = await response.json();
  const content = data.content?.[0]?.text || '';
  
  // Parse JSON
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.error(`[Batch ${batchNum}] No JSON in response`);
    throw new Error('No JSON found');
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    const scenes = parsed.scenes || [];
    console.log(`[Batch ${batchNum}] ✓ Got ${scenes.length} scenes`);
    return scenes;
  } catch (e) {
    console.error(`[Batch ${batchNum}] JSON parse error:`, e);
    throw new Error('Invalid JSON');
  }
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
    
    console.log(`=== Generating Episode ${episodeNumber}: "${episodeBeat?.title || 'Sin título'}" ===`);

    // Generate scenes in 3 batches of 5
    const allScenes: any[] = [];
    const totalScenes = 15;
    const batchSize = 5;
    const batches = Math.ceil(totalScenes / batchSize);

    for (let i = 0; i < batches; i++) {
      const startScene = i * batchSize + 1;
      const endScene = Math.min((i + 1) * batchSize, totalScenes);
      
      try {
        const batchScenes = await generateScenesBatch(
          ANTHROPIC_API_KEY,
          i + 1,
          startScene,
          endScene,
          episodeBeat,
          outline,
          allScenes,
          language
        );
        
        allScenes.push(...batchScenes);
      } catch (err) {
        console.error(`Batch ${i + 1} failed:`, err);
        // Continue with partial results if we have some scenes
        if (allScenes.length === 0) {
          throw err;
        }
        break;
      }
    }

    // Ensure field consistency
    for (const scene of allScenes) {
      if (!scene.action && scene.description) {
        scene.action = scene.description;
      }
    }

    // Calculate stats
    let totalDialogue = 0;
    for (const scene of allScenes) {
      totalDialogue += scene.dialogue?.length || 0;
    }

    const episode = {
      episode_number: episodeNumber,
      title: episodeBeat?.title || `Episodio ${episodeNumber}`,
      synopsis: episodeBeat?.summary || '',
      scenes: allScenes,
      total_scenes: allScenes.length,
      total_dialogue_lines: totalDialogue,
      total_duration_min: Math.round(allScenes.reduce((acc, s) => acc + (s.duration_estimate_sec || 90), 0) / 60)
    };

    console.log(`=== Episode ${episodeNumber} COMPLETE: ${episode.total_scenes} scenes, ${totalDialogue} dialogue lines ===`);

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
