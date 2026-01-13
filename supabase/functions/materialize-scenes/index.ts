/**
 * materialize-scenes - Extract and create scenes from outline into scenes table
 * 
 * This function parses the outline's episode_beats and idea text to extract
 * scene definitions, then inserts them into the scenes table for production.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { requireAuthOrDemo, requireProjectAccess, authErrorResponse, type AuthContext } from "../_shared/auth.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface MaterializeScenesRequest {
  projectId: string;
  outlineId?: string;
  deleteExisting?: boolean; // Default true - delete existing scenes first
}

interface ExtractedScene {
  scene_no: number;
  episode_no: number;
  slugline: string;
  summary: string;
  time_of_day: string;
  mood: string;
  character_names: string[];
  location_name: string;
  beats: any[];
}

// Parse time of day from slugline or content
function parseTimeOfDay(text: string): 'DAY' | 'NIGHT' | 'DAWN' | 'DUSK' {
  const lowerText = text.toLowerCase();
  if (lowerText.includes('noche') || lowerText.includes('night')) return 'NIGHT';
  if (lowerText.includes('amanecer') || lowerText.includes('dawn')) return 'DAWN';
  if (lowerText.includes('atardecer') || lowerText.includes('dusk') || lowerText.includes('crepúsculo')) return 'DUSK';
  return 'DAY';
}

// Extract INT/EXT from text
function parseIntExt(text: string): 'INT' | 'EXT' | 'INT/EXT' {
  const upper = text.toUpperCase();
  if (upper.includes('INT/EXT') || upper.includes('EXT/INT')) return 'INT/EXT';
  if (upper.includes('EXT')) return 'EXT';
  return 'INT';
}

// Extract scenes from outline's idea text (markdown format)
function extractScenesFromIdea(idea: string, episodeNo: number): ExtractedScene[] {
  const scenes: ExtractedScene[] = [];
  
  // Pattern: ESCENA X: LOCATION "TITLE" or similar
  const scenePattern = /ESCENA\s*(\d+)[:\.]?\s*([^\n"]+?)(?:\s*[""]([^""]+)[""])?\s*\n([\s\S]*?)(?=ESCENA\s*\d+|$)/gi;
  
  let match;
  while ((match = scenePattern.exec(idea)) !== null) {
    const sceneNo = parseInt(match[1], 10);
    const locationPart = match[2]?.trim() || '';
    const sceneName = match[3]?.trim() || '';
    const sceneContent = match[4]?.trim() || '';
    
    // Parse location: "CASA (SALÓN)" -> "CASA (SALÓN)"
    const location = locationPart.replace(/^\(|\)$/g, '').trim();
    
    // Extract character names from content (names in CAPS followed by colon or action)
    const characterPattern = /\b([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s]{1,20})\s*(?::|–|-|—|\()/g;
    const characterNames: string[] = [];
    let charMatch;
    while ((charMatch = characterPattern.exec(sceneContent)) !== null) {
      const name = charMatch[1].trim();
      if (name.length >= 2 && !characterNames.includes(name) && 
          !['ESCENA', 'ACCIÓN', 'NOTA', 'INT', 'EXT', 'DÍA', 'NOCHE'].includes(name)) {
        characterNames.push(name);
      }
    }
    
    // Build slugline
    const intExt = parseIntExt(location);
    const timeOfDay = parseTimeOfDay(sceneContent);
    const slugline = `${intExt}. ${location.toUpperCase()} - ${timeOfDay === 'DAY' ? 'DÍA' : timeOfDay === 'NIGHT' ? 'NOCHE' : timeOfDay}`;
    
    // Extract beats (lines starting with - or •)
    const beats: any[] = [];
    const beatPattern = /^[\-•]\s*(.+)$/gm;
    let beatMatch;
    let beatIndex = 0;
    while ((beatMatch = beatPattern.exec(sceneContent)) !== null) {
      beats.push({
        index: beatIndex++,
        type: 'action',
        text: beatMatch[1].trim()
      });
    }
    
    scenes.push({
      scene_no: sceneNo,
      episode_no: episodeNo,
      slugline,
      summary: sceneName || sceneContent.substring(0, 200).replace(/\n/g, ' ').trim(),
      time_of_day: timeOfDay,
      mood: 'neutral',
      character_names: characterNames,
      location_name: location,
      beats
    });
  }
  
  return scenes;
}

// Extract scenes from outline's episode_beats
function extractScenesFromEpisodeBeats(episodeBeats: any[]): ExtractedScene[] {
  const scenes: ExtractedScene[] = [];
  let globalSceneNo = 1;
  
  for (const ep of episodeBeats) {
    const episodeNo = ep.episode || 1;
    
    // If episode has scenes array
    if (Array.isArray(ep.scenes)) {
      for (let i = 0; i < ep.scenes.length; i++) {
        const sc = ep.scenes[i];
        scenes.push({
          scene_no: globalSceneNo++,
          episode_no: episodeNo,
          slugline: sc.slugline || `ESCENA ${i + 1}`,
          summary: sc.summary || sc.description || '',
          time_of_day: sc.time_of_day || 'DAY',
          mood: sc.mood || 'neutral',
          character_names: sc.character_names || sc.characters || [],
          location_name: sc.location_name || sc.location || '',
          beats: sc.beats || []
        });
      }
    }
    // If episode has key_beats as scenes
    else if (Array.isArray(ep.key_beats)) {
      for (let i = 0; i < ep.key_beats.length; i++) {
        const beat = ep.key_beats[i];
        // Convert beat to scene
        scenes.push({
          scene_no: globalSceneNo++,
          episode_no: episodeNo,
          slugline: `INT. LOCACIÓN - DÍA`,
          summary: typeof beat === 'string' ? beat : beat.description || beat.text || '',
          time_of_day: 'DAY',
          mood: 'neutral',
          character_names: ep.key_characters || [],
          location_name: ep.location || '',
          beats: [{ index: 0, type: 'action', text: typeof beat === 'string' ? beat : beat.description || '' }]
        });
      }
    }
    // If episode has turning_points, create scenes from them
    else if (Array.isArray(ep.turning_points) && ep.turning_points.length >= 3) {
      // Create 3 scenes from turning points for this episode
      for (let i = 0; i < Math.min(ep.turning_points.length, 4); i++) {
        const tp = ep.turning_points[i];
        scenes.push({
          scene_no: globalSceneNo++,
          episode_no: episodeNo,
          slugline: `INT. ${(ep.location || 'LOCACIÓN PRINCIPAL').toUpperCase()} - DÍA`,
          summary: typeof tp === 'string' ? tp : tp.event || tp.description || `Turning point ${i + 1}`,
          time_of_day: 'DAY',
          mood: 'neutral',
          character_names: Array.isArray(ep.key_characters) ? ep.key_characters : [],
          location_name: ep.location || '',
          beats: []
        });
      }
    }
  }
  
  return scenes;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let auth: AuthContext;
  try {
    auth = await requireAuthOrDemo(req);
  } catch (error) {
    return authErrorResponse(error as Error, corsHeaders);
  }

  try {
    const request: MaterializeScenesRequest = await req.json();
    const { projectId, outlineId, deleteExisting = true } = request;

    if (!projectId) {
      return new Response(
        JSON.stringify({ error: 'PROJECT_ID_REQUIRED', message: 'projectId es requerido' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify project access
    try {
      await requireProjectAccess(auth.supabase, auth.userId, projectId);
    } catch (error) {
      return authErrorResponse(error as Error, corsHeaders);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Fetch outline
    const query = adminClient
      .from('project_outlines')
      .select('id, outline_json, quality, status')
      .eq('project_id', projectId);
    
    if (outlineId) {
      query.eq('id', outlineId);
    } else {
      query.in('status', ['approved', 'completed', 'generating']).order('created_at', { ascending: false }).limit(1);
    }
    
    const { data: outlineData, error: outlineError } = await query.maybeSingle();
    
    if (outlineError) {
      console.error('[materialize-scenes] Outline fetch error:', outlineError);
      return new Response(
        JSON.stringify({ error: 'OUTLINE_FETCH_ERROR', message: outlineError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    if (!outlineData?.outline_json) {
      return new Response(
        JSON.stringify({ 
          error: 'NO_OUTLINE_FOUND', 
          message: 'No se encontró un outline válido. Genera un outline primero.',
          actionable: true,
          suggestedAction: 'generate_outline'
        }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const outline = outlineData.outline_json as any;
    let extractedScenes: ExtractedScene[] = [];

    // Try to extract from idea first (markdown text with scene definitions)
    if (outline.idea && typeof outline.idea === 'string' && outline.idea.includes('ESCENA')) {
      console.log('[materialize-scenes] Extracting from idea text');
      extractedScenes = extractScenesFromIdea(outline.idea, 1);
    }
    
    // If no scenes from idea, try episode_beats
    if (extractedScenes.length === 0 && Array.isArray(outline.episode_beats)) {
      console.log('[materialize-scenes] Extracting from episode_beats');
      extractedScenes = extractScenesFromEpisodeBeats(outline.episode_beats);
    }

    if (extractedScenes.length === 0) {
      return new Response(
        JSON.stringify({ 
          error: 'NO_SCENES_FOUND', 
          message: 'No se pudieron extraer escenas del outline. El outline no contiene definiciones de escenas.',
          debug: {
            hasIdea: !!outline.idea,
            ideaLength: outline.idea?.length || 0,
            hasEpisodeBeats: Array.isArray(outline.episode_beats),
            episodeBeatCount: outline.episode_beats?.length || 0
          }
        }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[materialize-scenes] Extracted scenes:', extractedScenes.length);

    // Fetch existing characters and locations for linking
    const { data: characters } = await adminClient
      .from('characters')
      .select('id, name')
      .eq('project_id', projectId);
    
    const { data: locations } = await adminClient
      .from('locations')
      .select('id, name')
      .eq('project_id', projectId);

    // Build lookup maps
    const characterMap = new Map<string, string>();
    (characters || []).forEach((c: any) => {
      characterMap.set(c.name.toLowerCase().trim(), c.id);
    });
    
    const locationMap = new Map<string, string>();
    (locations || []).forEach((l: any) => {
      locationMap.set(l.name.toLowerCase().trim(), l.id);
    });

    // Delete existing scenes if requested
    if (deleteExisting) {
      const { error: deleteError } = await adminClient
        .from('scenes')
        .delete()
        .eq('project_id', projectId);
      
      if (deleteError) {
        console.error('[materialize-scenes] Delete error:', deleteError);
      } else {
        console.log('[materialize-scenes] Deleted existing scenes');
      }
    }

    // Insert scenes
    let scenesCreated = 0;
    
    for (const scene of extractedScenes) {
      // Link character IDs
      const characterIds: string[] = [];
      for (const charName of scene.character_names) {
        const normalized = charName.toLowerCase().trim();
        if (characterMap.has(normalized)) {
          characterIds.push(characterMap.get(normalized)!);
        }
      }
      
      // Link location ID
      let locationId: string | null = null;
      if (scene.location_name) {
        const normalized = scene.location_name.toLowerCase().trim();
        // Try exact match first
        if (locationMap.has(normalized)) {
          locationId = locationMap.get(normalized)!;
        } else {
          // Try partial match
          for (const [locName, locId] of locationMap.entries()) {
            if (normalized.includes(locName) || locName.includes(normalized)) {
              locationId = locId;
              break;
            }
          }
        }
      }

      const { error: insertError } = await adminClient
        .from('scenes')
        .insert({
          project_id: projectId,
          episode_no: scene.episode_no,
          scene_no: scene.scene_no,
          slugline: scene.slugline,
          summary: scene.summary,
          time_of_day: scene.time_of_day,
          mood: { primary: scene.mood },
          character_ids: characterIds,
          location_id: locationId,
          beats: scene.beats,
          status: 'draft'
        });

      if (!insertError) {
        scenesCreated++;
      } else {
        console.error('[materialize-scenes] Insert error:', insertError);
      }
    }

    console.log('[materialize-scenes] Created scenes:', scenesCreated);

    return new Response(
      JSON.stringify({
        success: true,
        scenes: {
          extracted: extractedScenes.length,
          created: scenesCreated
        },
        message: `Materializadas ${scenesCreated} escenas desde el outline`
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[materialize-scenes] Error:', error);
    return new Response(
      JSON.stringify({ error: 'INTERNAL_ERROR', message: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
