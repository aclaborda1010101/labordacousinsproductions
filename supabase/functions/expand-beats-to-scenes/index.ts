/**
 * expand-beats-to-scenes - Expand outline beats into concrete scenes
 * 
 * Uses CHUNKED approach: 3 parallel calls (one per act) for speed
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { fetchChatCompletion, hasApiAccess, initLovableCompat } from "../_shared/lovable-compat.ts";

initLovableCompat();

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ExpandRequest {
  projectId: string;
  durationMin: number;
  densityProfile?: string;
}

const SCENE_PROMPT = `Genera escenas para un acto de película. SOLO JSON, sin explicaciones.

{
  "scenes": [
    {
      "scene_number": 1,
      "slugline": "INT. LOCACIÓN - DÍA",
      "summary": "Descripción breve",
      "characters": ["NOMBRE1"],
      "mood": "tenso"
    }
  ]
}`;

async function generateActScenes(
  act: string, 
  numScenes: number, 
  context: { title: string; genre: string; synopsis: string; characters: string; locations: string }
): Promise<any[]> {
  const prompt = `Película: ${context.title}
Género: ${context.genre}
${act}: Genera EXACTAMENTE ${numScenes} escenas.
Personajes: ${context.characters}
Localizaciones: ${context.locations}
Sinopsis: ${context.synopsis.substring(0, 300)}

Responde SOLO con JSON válido. ${numScenes} escenas para ${act}.`;

  console.log(`[expand] Generating ${numScenes} scenes for ${act}...`);
  
  const response = await fetchChatCompletion({
    model: 'google/gemini-2.5-flash',
    max_tokens: 4000,
    messages: [
      { role: 'system', content: SCENE_PROMPT },
      { role: 'user', content: prompt }
    ]
  });

  const json = await response.json();
  const content = json.choices?.[0]?.message?.content || '';
  
  // Parse JSON
  try {
    const match = content.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, content];
    const parsed = JSON.parse(match[1] || content);
    const scenes = parsed.scenes || parsed.expanded_scenes || [];
    
    // Add act label to each scene
    return scenes.map((s: any, idx: number) => ({
      ...s,
      act,
      scene_number: s.scene_number || idx + 1
    }));
  } catch (e) {
    console.error(`[expand] Parse error for ${act}:`, e);
    return [];
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const bypassAuth = Deno.env.get('BYPASS_AUTH') === 'true';
    const authHeader = req.headers.get('Authorization');
    
    if (!bypassAuth && !authHeader) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const body: ExpandRequest = await req.json();
    const { projectId, durationMin = 90 } = body;

    if (!projectId) {
      return new Response(JSON.stringify({ error: 'projectId required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Fetch project
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, title, genre, format')
      .eq('id', projectId)
      .single();

    if (projectError || !project) {
      return new Response(JSON.stringify({ error: 'Project not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Get outline
    const { data: outline, error: outlineError } = await supabase
      .from('project_outlines')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (outlineError || !outline) {
      return new Response(JSON.stringify({ error: 'No outline found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Parse outline data
    const outlineData = outline.outline_json 
      ? (typeof outline.outline_json === 'string' ? JSON.parse(outline.outline_json) : outline.outline_json)
      : outline;

    // Extract context
    const characters = (outlineData.characters || [])
      .slice(0, 5)
      .map((c: any) => typeof c === 'string' ? c : c.name || c.character_name)
      .join(', ') || 'Protagonistas';
    
    const locations = (outlineData.locations || [])
      .slice(0, 5)
      .map((l: any) => typeof l === 'string' ? l : l.name || l.location_name)
      .join(', ') || 'Varias';

    const synopsis = outlineData.synopsis || outline.idea || '';

    if (!hasApiAccess()) {
      return new Response(JSON.stringify({ error: 'No API key configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const context = {
      title: project.title,
      genre: project.genre || 'drama',
      synopsis,
      characters,
      locations
    };

    // Target: 40 scenes total (10 + 20 + 10)
    console.log(`[expand] Starting chunked expansion for "${project.title}"...`);

    // Run all 3 acts in PARALLEL for speed
    const [act1Scenes, act2Scenes, act3Scenes] = await Promise.all([
      generateActScenes('ACT_I', 10, context),
      generateActScenes('ACT_II', 20, context),
      generateActScenes('ACT_III', 10, context)
    ]);

    const allScenes = [...act1Scenes, ...act2Scenes, ...act3Scenes];
    const totalScenes = allScenes.length;

    console.log(`[expand] Generated ${totalScenes} scenes (ACT_I: ${act1Scenes.length}, ACT_II: ${act2Scenes.length}, ACT_III: ${act3Scenes.length})`);

    if (totalScenes === 0) {
      return new Response(JSON.stringify({ 
        error: 'Failed to generate scenes',
        message: 'La IA no devolvió escenas válidas'
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Update BOTH episode_beats AND outline_json.episode_beats
    const updatedEpisodeBeats = [{
      episode: 1,
      scenes: allScenes,
      act_breakdown: {
        ACT_I: act1Scenes.length,
        ACT_II: act2Scenes.length,
        ACT_III: act3Scenes.length
      }
    }];

    // Merge with existing outline_json
    const updatedOutlineJson = {
      ...outlineData,
      episode_beats: updatedEpisodeBeats
    };

    const { error: updateError } = await supabase
      .from('project_outlines')
      .update({
        episode_beats: updatedEpisodeBeats,
        outline_json: updatedOutlineJson,
        updated_at: new Date().toISOString()
      })
      .eq('id', outline.id);

    if (updateError) {
      console.error('[expand] Update error:', updateError);
    }

    return new Response(JSON.stringify({
      success: true,
      scenesCount: totalScenes,
      actBreakdown: {
        ACT_I: act1Scenes.length,
        ACT_II: act2Scenes.length,
        ACT_III: act3Scenes.length
      },
      updatedOutline: {
        id: outline.id,
        episode_beats: [{
          episode: 1,
          scenes: allScenes
        }]
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('[expand] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
