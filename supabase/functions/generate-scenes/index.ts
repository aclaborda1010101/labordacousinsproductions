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
  isTeaser?: boolean;
  teaserType?: '60s' | '30s';
  teaserData?: {
    title: string;
    logline: string;
    music_cue: string;
    voiceover_text?: string;
    scenes: Array<{
      shot_type: string;
      duration_sec: number;
      description: string;
      character?: string;
      dialogue_snippet?: string;
      visual_hook: string;
      sound_design: string;
    }>;
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// SCENE GENERATOR + CINEMATOGRAPHER ENGINE v3
// Generates complete scenes with professional shot plans, dialogues & transitions
// ═══════════════════════════════════════════════════════════════════════════

const SCENE_GENERATION_PROMPT = `Eres SHOWRUNNER + DOP con 30 años en Hollywood.

TU MISIÓN: Generar escenas COMPLETAS con planos profesionales listos para producción.

═══════════════════════════════════════════════════════
ESTRUCTURA DE CADA ESCENA
═══════════════════════════════════════════════════════

Cada escena DEBE incluir:
1. Información básica (slugline, summary, mood)
2. Diálogos completos distribuidos
3. SCENE_SETUP con configuración técnica constante
4. SHOTS[] con detalles cinematográficos y transiciones

═══════════════════════════════════════════════════════
SCENE_SETUP (CONSTANTES DE ESCENA - NO cambian entre shots)
═══════════════════════════════════════════════════════

camera_package:
  - body: ARRI_Alexa35 | RED_V_Raptor | Sony_Venice2
  - codec: ARRIRAW | R3D | ProRes4444
  - fps: 24 | 25
  - shutter_angle: 180
  - iso_target: 800 | 1600

lens_set:
  - family: ARRI_Signature_Prime | Zeiss_Supreme | Cooke_S7
  - look: Vintage_Organic | Modern_Clinical | Anamorphic_Cinematic
  - available_focals: [24, 35, 50, 85, 135]

lighting_plan:
  - key_style: Natural_Window | Soft_Diffused | Hard_Dramatic | Neon_Practical
  - color_temp_base_k: 3200 | 4500 | 5600
  - contrast_ratio: "4:1" | "2:1" | "8:1"

audio_plan:
  - room_tone: "habitación silenciosa" | "ciudad de fondo" | "naturaleza"
  - ambience_layers: ["aire acondicionado", "tráfico lejano"]
  
axis_180_reference:
  - line_description: "Línea imaginaria entre personajes principales"
  - screen_left: "Personaje A"
  - screen_right: "Personaje B"

═══════════════════════════════════════════════════════
SHOTS[] - CADA PLANO INCLUYE:
═══════════════════════════════════════════════════════

shot_id: "S01", "S02"...
shot_type: Wide | Medium | CloseUp | OTS | Insert | Establishing
coverage_type: Master | Single | Two-Shot | OTS_A | OTS_B | Insert | Reaction
story_purpose: establish_geography | reveal_information | build_tension | emotional_connection | dialogue_focus | transition

camera_variation:
  - focal_mm: 35 | 50 | 85 | 135
  - aperture: "T2.0" | "T2.8" | "T4.0"
  - movement: Static | Pan | Dolly_In | Dolly_Out | Crane_Up | Steadicam
  - height_cm: 120 (pecho) | 160 (ojos) | 80 (bajo) | 200 (alto)
  - stabilization: Tripod | Steadicam | Handheld_Controlled | Dolly

blocking:
  - subject_positions: "A izquierda frame, B derecha, 2m separación"
  - screen_direction: "A mira derecha, B mira izquierda"
  - action: "Descripción de lo que pasa"
  
dialogue: (línea de diálogo que cubre este plano, o null)

duration_sec: 3-8 segundos por plano

transition:
  - type: CUT | DISSOLVE | MATCH_CUT | J_CUT | L_CUT
  - to_next: "hard_cut" | "audio_prelap" | "visual_match"
  - bridge_audio: room_tone | dialogue_prelap | SFX_lead_in

edit_intent:
  - expected_cut: hard | soft | match_cut
  - hold_ms: 0-800 (milisegundos extra para "respirar")
  - rhythm_note: "Corte rápido" | "Hold para emoción"

ai_risks: [Identity_Drift, Hand_Deform, Spatial_Jump]
risk_mitigation: "Evitar manos, usar misma ref"

═══════════════════════════════════════════════════════
REGLAS CRÍTICAS
═══════════════════════════════════════════════════════

1. CADA ESCENA tiene 4-8 planos que cubren TODA la acción y diálogo
2. Los diálogos se DISTRIBUYEN entre planos (no todo en uno)
3. TODAS las transiciones entre planos están definidas
4. El shot_type y coverage_type deben tener sentido narrativo
5. Planos "hero" (emocionales) marcar como hero: true
6. La secuencia de planos respeta el eje de 180°
7. FORMATO: Solo JSON válido sin markdown

═══════════════════════════════════════════════════════
FORMATO DE SALIDA (ARRAY DE ESCENAS)
═══════════════════════════════════════════════════════

[
  {
    "scene_no": 1,
    "slugline": "INT. LOCATION - DAY/NIGHT",
    "summary": "Descripción de lo que pasa",
    "time_of_day": "DAY" | "NIGHT",
    "character_names": ["Personaje1", "Personaje2"],
    "location_name": "Nombre del lugar",
    "mood": "tense" | "romantic" | "action" | "dramatic",
    
    "scene_setup": {
      "camera_package": { "body": "...", "codec": "...", "fps": 24, "shutter_angle": 180, "iso_target": 800 },
      "lens_set": { "family": "...", "look": "...", "available_focals": [35, 50, 85] },
      "lighting_plan": { "key_style": "...", "color_temp_base_k": 5600, "contrast_ratio": "4:1" },
      "audio_plan": { "room_tone": "...", "ambience_layers": ["..."] },
      "axis_180_reference": { "line_description": "...", "screen_left": "A", "screen_right": "B" }
    },
    
    "shots": [
      {
        "shot_id": "S01",
        "shot_no": 1,
        "shot_type": "Wide",
        "coverage_type": "Master",
        "story_purpose": "establish_geography",
        "camera_variation": {
          "focal_mm": 35,
          "aperture": "T2.8",
          "movement": "Static",
          "height_cm": 160,
          "stabilization": "Tripod"
        },
        "blocking": {
          "subject_positions": "A izquierda, B derecha",
          "screen_direction": "A mira derecha",
          "action": "Ambos personajes entran a la habitación"
        },
        "dialogue": null,
        "duration_sec": 4,
        "transition": {
          "type": "CUT",
          "to_next": "hard_cut",
          "bridge_audio": "room_tone"
        },
        "edit_intent": {
          "expected_cut": "hard",
          "hold_ms": 200,
          "rhythm_note": "Establecer espacio"
        },
        "hero": false,
        "ai_risks": ["Spatial_Jump"],
        "risk_mitigation": "Usar establishing con personajes pequeños en frame"
      },
      {
        "shot_id": "S02",
        "shot_no": 2,
        "shot_type": "Medium",
        "coverage_type": "Two-Shot",
        "story_purpose": "dialogue_focus",
        "camera_variation": {
          "focal_mm": 50,
          "aperture": "T2.0",
          "movement": "Static",
          "height_cm": 160,
          "stabilization": "Tripod"
        },
        "blocking": {
          "subject_positions": "A y B en frame",
          "screen_direction": "Perfil",
          "action": "Comienzan a hablar"
        },
        "dialogue": "Línea de diálogo aquí...",
        "duration_sec": 5,
        "transition": {
          "type": "CUT",
          "to_next": "hard_cut",
          "bridge_audio": "dialogue_prelap"
        },
        "edit_intent": {
          "expected_cut": "soft",
          "hold_ms": 400,
          "rhythm_note": "Dar espacio al diálogo"
        },
        "hero": false,
        "ai_risks": ["Identity_Drift"],
        "risk_mitigation": "Mantener refs consistentes"
      }
    ]
  }
]`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { projectId, episodeNo, synopsis, sceneCount = 5, isTeaser, teaserType, teaserData } = await req.json() as GenerateScenesRequest;
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const contentType = isTeaser ? `teaser ${teaserType}` : `episode ${episodeNo}`;
    console.log(`Generating complete scenes with shots for project ${projectId}, ${contentType}`);

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

    // Fetch style pack for visual consistency
    const { data: stylePack } = await supabase
      .from('style_packs')
      .select('*')
      .eq('project_id', projectId)
      .maybeSingle();

    // Build context for AI
    const characterList = characters?.map(c => `- ${c.name} (${c.role || 'character'}): ${c.bio || 'No description'}`).join('\n') || 'No characters defined';
    const locationList = locations?.map(l => `- ${l.name}: ${l.description || 'No description'}`).join('\n') || 'No locations defined';

    // Build user prompt based on content type
    let userPrompt: string;
    
    if (isTeaser && teaserData) {
      // TEASER MODE - convert teaser shots to scenes
      const teaserShots = teaserData.scenes.map((shot, idx) => ({
        shot_no: idx + 1,
        shot_type: shot.shot_type,
        duration_sec: shot.duration_sec,
        description: shot.description,
        character: shot.character,
        dialogue: shot.dialogue_snippet,
        visual_hook: shot.visual_hook,
        sound_design: shot.sound_design
      }));
      
      userPrompt = `Genera 1 escena COMPLETA para TEASER ${teaserType}.

TÍTULO: ${teaserData.title}
LOGLINE: ${teaserData.logline}
MÚSICA: ${teaserData.music_cue}
${teaserData.voiceover_text ? `VOICE OVER: ${teaserData.voiceover_text}` : ''}

SECUENCIA DE PLANOS DEL TEASER:
${JSON.stringify(teaserShots, null, 2)}

PERSONAJES DISPONIBLES:
${characterList}

LOCALIZACIONES DISPONIBLES:
${locationList}

ESTILO VISUAL:
- Aspect Ratio: ${stylePack?.aspect_ratio || '16:9'}
- Lens Style: ${stylePack?.lens_style || 'cinematic'}
- Visual Tone: ${stylePack?.visual_tone || 'dramatic'}

REQUISITOS:
1. Crea UNA escena contenedora tipo "TEASER SEQUENCE"
2. CADA plano del teaser se convierte en un shot de producción
3. Incluye configuración técnica profesional (cámara, lentes, iluminación)
4. Las TRANSICIONES son RÁPIDAS estilo tráiler (cortes dinámicos)
5. Marca shots emocionales como "hero": true
6. El ritmo es de TRÁILER: rápido, impactante, cinematográfico

Retorna SOLO JSON válido con la estructura de escenas.`;
    } else {
      // EPISODE MODE - normal scene generation
      userPrompt = `Genera ${sceneCount} escenas COMPLETAS para Episodio ${episodeNo}.

SINOPSIS:
${synopsis}

PERSONAJES DISPONIBLES:
${characterList}

LOCALIZACIONES DISPONIBLES:
${locationList}

ESTILO VISUAL:
- Aspect Ratio: ${stylePack?.aspect_ratio || '16:9'}
- Lens Style: ${stylePack?.lens_style || 'cinematic'}
- Visual Tone: ${stylePack?.visual_tone || 'dramatic'}

REQUISITOS:
1. Cada escena tiene 4-8 planos que cubren TODA la acción
2. Los DIÁLOGOS se distribuyen entre los planos (campo "dialogue" en cada shot)
3. Las TRANSICIONES están definidas entre planos (campo "transition")
4. Usa SOLO los personajes y localizaciones proporcionados
5. Marca planos emocionales como "hero": true
6. La secuencia respeta continuidad cinematográfica

Retorna SOLO JSON válido, sin texto adicional.`;
    }

    console.log('Calling AI for complete scene generation with shots...');

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: SCENE_GENERATION_PROMPT },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7,
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
    
    console.log('AI response received, parsing complete scene data...');

    let generatedScenes;
    try {
      generatedScenes = JSON.parse(scenesText);
    } catch (parseError) {
      console.error('Failed to parse AI response:', scenesText.substring(0, 500));
      throw new Error('Invalid JSON response from AI');
    }

    // Map character names to IDs
    const characterMap = new Map(characters?.map(c => [c.name.toLowerCase(), c.id]) || []);
    const locationMap = new Map(locations?.map(l => [l.name.toLowerCase(), l.id]) || []);

    // Insert scenes and shots into database
    const insertedScenes = [];
    let totalShotsInserted = 0;

    for (const scene of generatedScenes) {
      // Find character IDs
      const characterIds = (scene.character_names || [])
        .map((name: string) => characterMap.get(name.toLowerCase()))
        .filter(Boolean);

      // Find location ID
      const locationId = locationMap.get((scene.location_name || '').toLowerCase()) || null;

      // Insert scene with setup metadata - handle teaser episode numbers
      const sceneEpisodeNo = isTeaser ? episodeNo : scene.scene_no ? episodeNo : episodeNo;
      const sceneSlugline = isTeaser 
        ? `TEASER ${teaserType} - ${scene.slugline || 'PROMOTIONAL SEQUENCE'}` 
        : scene.slugline;

      const { data: insertedScene, error: sceneError } = await supabase
        .from('scenes')
        .insert({
          project_id: projectId,
          episode_no: episodeNo,
          scene_no: scene.scene_no || 1,
          slugline: sceneSlugline,
          summary: scene.summary || (isTeaser ? `Teaser promocional ${teaserType}: ${teaserData?.logline || ''}` : ''),
          time_of_day: scene.time_of_day,
          character_ids: characterIds,
          location_id: locationId,
          mood: { primary: scene.mood || (isTeaser ? 'cinematic' : 'dramatic') },
          quality_mode: isTeaser ? 'ULTRA' : 'CINE',
          // Store scene_setup in parsed_json for production use
          parsed_json: {
            scene_setup: scene.scene_setup || null,
            generated_with: 'cinematographer_engine_v3',
            is_teaser: isTeaser || false,
            teaser_type: teaserType || null,
            teaser_metadata: isTeaser ? {
              title: teaserData?.title,
              logline: teaserData?.logline,
              music_cue: teaserData?.music_cue,
              voiceover_text: teaserData?.voiceover_text
            } : null
          }
        })
        .select()
        .single();

      if (sceneError) {
        console.error('Error inserting scene:', sceneError);
        continue;
      }

      const sceneLabel = isTeaser ? `teaser ${teaserType}` : `scene ${scene.scene_no}`;
      console.log(`Inserted ${sceneLabel}: ${sceneSlugline}`);

      // Insert shots with full cinematographic data
      if (scene.shots && insertedScene) {
        for (const shot of scene.shots) {
          // Build camera JSON from variation
          const cameraData = shot.camera_variation ? {
            focal_mm: shot.camera_variation.focal_mm,
            aperture: shot.camera_variation.aperture,
            movement: shot.camera_variation.movement,
            height_cm: shot.camera_variation.height_cm,
            stabilization: shot.camera_variation.stabilization
          } : null;

          // Build blocking JSON
          const blockingData = shot.blocking ? {
            subject_positions: shot.blocking.subject_positions,
            screen_direction: shot.blocking.screen_direction,
            action: shot.blocking.action
          } : null;

          const { error: shotError } = await supabase
            .from('shots')
            .insert({
              scene_id: insertedScene.id,
              shot_no: shot.shot_no || parseInt(shot.shot_id?.replace('S', '') || '1'),
              shot_type: shot.shot_type?.toLowerCase() || 'medium',
              dialogue_text: shot.dialogue || null,
              duration_target: shot.duration_sec || 3,
              hero: shot.hero || isTeaser || false, // All teaser shots are hero quality
              effective_mode: (shot.hero || isTeaser) ? 'ULTRA' : 'CINE',
              // Store full cinematographic data
              camera: cameraData,
              blocking: blockingData,
              // Store additional metadata
              coverage_type: shot.coverage_type || null,
              story_purpose: shot.story_purpose || null,
              transition_in: shot.transition?.type || (isTeaser ? 'MATCH_CUT' : 'CUT'),
              transition_out: shot.transition?.to_next || (isTeaser ? 'visual_match' : 'hard_cut'),
              edit_intent: shot.edit_intent || (isTeaser ? { expected_cut: 'hard', hold_ms: 100, rhythm_note: 'Trailer rhythm' } : null),
              ai_risk: shot.ai_risks || [],
              continuity_notes: shot.risk_mitigation || null
            });

          if (shotError) {
            console.error('Error inserting shot:', shotError);
          } else {
            totalShotsInserted++;
          }
        }
      }

      insertedScenes.push(insertedScene);
    }

    const contentLabel = isTeaser ? `teaser ${teaserType}` : 'scenes';
    console.log(`Successfully generated ${insertedScenes.length} ${contentLabel} with ${totalShotsInserted} shots`);

    return new Response(JSON.stringify({
      success: true,
      scenesGenerated: insertedScenes.length,
      shotsGenerated: totalShotsInserted,
      scenes: insertedScenes,
      isTeaser: isTeaser || false,
      teaserType: teaserType || null,
      message: isTeaser 
        ? `Teaser ${teaserType} generado con ${totalShotsInserted} planos` 
        : `${insertedScenes.length} escenas con ${totalShotsInserted} planos generados automáticamente`
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
