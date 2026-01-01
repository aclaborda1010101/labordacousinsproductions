import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GenerateScenesRequest {
  projectId: string;
  episodeNo: number;
  synopsis: string;
  sceneCount?: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { projectId, episodeNo, synopsis, sceneCount = 5 } = await req.json() as GenerateScenesRequest;
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    console.log(`Generating scenes for project ${projectId}, episode ${episodeNo}`);

    // Create Supabase client
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // Fetch characters from bible
    const { data: characters } = await supabase
      .from('characters')
      .select('id, name, role, bio')
      .eq('project_id', projectId);

    console.log(`Found ${characters?.length || 0} characters`);

    // Fetch locations from bible
    const { data: locations } = await supabase
      .from('locations')
      .select('id, name, description')
      .eq('project_id', projectId);

    console.log(`Found ${locations?.length || 0} locations`);

    // Fetch style pack
    const { data: stylePack } = await supabase
      .from('style_packs')
      .select('*')
      .eq('project_id', projectId)
      .maybeSingle();

    // Build the prompt
    const characterList = characters?.map(c => `- ${c.name} (${c.role || 'character'}): ${c.bio || 'No description'}`).join('\n') || 'No characters defined';
    const locationList = locations?.map(l => `- ${l.name}: ${l.description || 'No description'}`).join('\n') || 'No locations defined';

    const prompt = `You are a professional screenwriter. Generate ${sceneCount} scenes for Episode ${episodeNo} based on the following:

SYNOPSIS:
${synopsis}

AVAILABLE CHARACTERS:
${characterList}

AVAILABLE LOCATIONS:
${locationList}

VISUAL STYLE:
- Aspect Ratio: ${stylePack?.aspect_ratio || '16:9'}
- Lens Style: ${stylePack?.lens_style || 'cinematic'}
- Grain: ${stylePack?.grain_level || 'subtle'}

Generate scenes in the following JSON format (array of objects):
[
  {
    "scene_no": 1,
    "slugline": "INT. LOCATION NAME - TIME OF DAY",
    "summary": "Brief description of what happens",
    "time_of_day": "DAY" or "NIGHT",
    "character_names": ["Character1", "Character2"],
    "location_name": "Location Name",
    "mood": "tense/romantic/action/dramatic/comedic",
    "shots": [
      {
        "shot_no": 1,
        "shot_type": "WIDE/MEDIUM/CLOSE-UP/INSERT/TRACKING",
        "dialogue_text": "Any dialogue for this shot or null",
        "duration_target": 3,
        "hero": false
      }
    ]
  }
]

Rules:
- Use ONLY the characters and locations provided
- Each scene should have 3-6 shots
- Mark emotionally important shots as "hero": true
- Sluglines must follow format: INT/EXT. LOCATION - DAY/NIGHT
- Keep dialogue natural and character-appropriate
- Ensure proper story flow between scenes

Return ONLY valid JSON, no additional text.`;

    console.log('Calling AI for scene generation...');

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: 'You are an expert screenwriter. Return only valid JSON without markdown formatting.' },
          { role: 'user', content: prompt }
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI API error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: 'Límite de peticiones excedido. Inténtalo más tarde.' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: 'Se requieren créditos adicionales.' }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      throw new Error('Failed to generate scenes');
    }

    const aiData = await response.json();
    let scenesText = aiData.choices?.[0]?.message?.content || '[]';
    
    // Clean up potential markdown formatting
    scenesText = scenesText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    
    console.log('AI response received, parsing...');

    let generatedScenes;
    try {
      generatedScenes = JSON.parse(scenesText);
    } catch (parseError) {
      console.error('Failed to parse AI response:', scenesText);
      throw new Error('Invalid JSON response from AI');
    }

    // Map character names to IDs
    const characterMap = new Map(characters?.map(c => [c.name.toLowerCase(), c.id]) || []);
    const locationMap = new Map(locations?.map(l => [l.name.toLowerCase(), l.id]) || []);

    // Insert scenes into database
    const insertedScenes = [];
    for (const scene of generatedScenes) {
      // Find character IDs
      const characterIds = (scene.character_names || [])
        .map((name: string) => characterMap.get(name.toLowerCase()))
        .filter(Boolean);

      // Find location ID
      const locationId = locationMap.get((scene.location_name || '').toLowerCase()) || null;

      // Insert scene
      const { data: insertedScene, error: sceneError } = await supabase
        .from('scenes')
        .insert({
          project_id: projectId,
          episode_no: episodeNo,
          scene_no: scene.scene_no,
          slugline: scene.slugline,
          summary: scene.summary,
          time_of_day: scene.time_of_day,
          character_ids: characterIds,
          location_id: locationId,
          mood: { primary: scene.mood },
          quality_mode: 'CINE',
        })
        .select()
        .single();

      if (sceneError) {
        console.error('Error inserting scene:', sceneError);
        continue;
      }

      console.log(`Inserted scene ${scene.scene_no}: ${scene.slugline}`);

      // Insert shots for this scene
      if (scene.shots && insertedScene) {
        for (const shot of scene.shots) {
          const { error: shotError } = await supabase
            .from('shots')
            .insert({
              scene_id: insertedScene.id,
              shot_no: shot.shot_no,
              shot_type: shot.shot_type,
              dialogue_text: shot.dialogue_text,
              duration_target: shot.duration_target || 3,
              hero: shot.hero || false,
              effective_mode: shot.hero ? 'ULTRA' : 'CINE',
            });

          if (shotError) {
            console.error('Error inserting shot:', shotError);
          }
        }
      }

      insertedScenes.push(insertedScene);
    }

    console.log(`Successfully generated ${insertedScenes.length} scenes`);

    return new Response(JSON.stringify({
      success: true,
      scenesGenerated: insertedScenes.length,
      scenes: insertedScenes,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error generating scenes:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Error desconocido' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
