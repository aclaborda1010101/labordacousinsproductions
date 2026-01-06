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
  narrativeMode?: 'SERIE_ADICTIVA' | 'VOZ_AUTOR' | 'GIRO_IMPREVISIBLE';
  generateFullShots?: boolean;
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
// NARRATIVE MODE PROMPTS
// ═══════════════════════════════════════════════════════════════════════════

const NARRATIVE_MODE_PROMPTS = {
  SERIE_ADICTIVA: `MODO: SERIE ADICTIVA
Tu objetivo es crear contenido ALTAMENTE ADICTIVO al estilo de las mejores series de streaming.

REGLAS NARRATIVAS:
1. CLIFFHANGERS: Cada escena termina con tensión, revelación o pregunta abierta
2. RITMO FRENÉTICO: Escenas cortas, acción constante, cero tiempos muertos
3. GANCHOS EMOCIONALES: Al menos 2-3 momentos "wow" por episodio
4. CONFLICTO CONSTANTE: Ningún personaje está en paz, siempre hay fricción
5. STAKES CLAROS: El espectador sabe qué se pierde si el protagonista falla
6. INFORMACIÓN DOSIFICADA: Revelaciones graduales que mantienen el misterio

ESTRUCTURA DE CADA ESCENA:
- Hook en los primeros 10 segundos
- Escalada de tensión en el medio
- Cliffhanger o twist al final`,

  VOZ_AUTOR: `MODO: VOZ DE AUTOR
Tu objetivo es crear contenido con IDENTIDAD DISTINTIVA tipo auteur cinema.

REGLAS NARRATIVAS:
1. DIÁLOGOS ÚNICOS: Cada personaje tiene voz propia, reconocible sin ver quién habla
2. ATMÓSFERA DENSA: La ambientación es tan importante como la acción
3. SUBTEXTO: Lo no dicho es más importante que lo dicho
4. TEMPO CONTEMPLATIVO: Permitir "respirar" al espectador con silencios significativos
5. SIMBOLISMO VISUAL: Motivos recurrentes que refuerzan temas
6. PROFUNDIDAD PSICOLÓGICA: Motivaciones complejas, no héroes ni villanos puros

ESTRUCTURA DE CADA ESCENA:
- Establecimiento atmosférico
- Desarrollo de capas de significado
- Resonancia emocional duradera`,

  GIRO_IMPREVISIBLE: `MODO: GIRO IMPREVISIBLE
Tu objetivo es SUBVERTIR EXPECTATIVAS constantemente.

REGLAS NARRATIVAS:
1. ANTI-CLICHÉS: Si el espectador espera X, dale Y o Z
2. PERSONAJES IMPREDECIBLES: Las decisiones sorprenden pero son coherentes
3. NARRATIVA NO LINEAL: Flashbacks, flashforwards, perspectivas múltiples
4. FALSAS PISTAS: Plantar información que lleva a conclusiones erróneas
5. TWISTS ORGÁNICOS: Los giros se sienten inevitables en retrospectiva
6. REGLAS ROTAS: Las convenciones de género se subvierten

ESTRUCTURA DE CADA ESCENA:
- Setup que parece familiar
- Desarrollo que tuerce expectativas
- Resolución que redefine lo anterior`
};

// ═══════════════════════════════════════════════════════════════════════════
// SCENE GENERATOR + CINEMATOGRAPHER ENGINE v4
// Now includes full shot details with technical specs
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
SHOTS[] - CADA PLANO INCLUYE TODOS ESTOS CAMPOS:
═══════════════════════════════════════════════════════

shot_id: "S01", "S02"...
shot_no: 1, 2, 3...
shot_type: Wide | Medium | CloseUp | OTS | Insert | Establishing | TwoShot | ReactionShot
coverage_type: Master | Single | Two-Shot | OTS_A | OTS_B | Insert | Reaction
story_purpose: establish_geography | reveal_information | build_tension | emotional_connection | dialogue_focus | transition

camera_variation:
  - focal_mm: 24 | 35 | 50 | 85 | 135
  - aperture: "T2.0" | "T2.8" | "T4.0"
  - movement: Static | Pan | Dolly_In | Dolly_Out | Crane_Up | Steadicam | Tracking
  - height: EyeLevel | LowAngle | HighAngle | GroundLevel | Overhead
  - stabilization: Tripod | Steadicam | Handheld_Controlled | Gimbal
  - camera_body: ARRI_Alexa35 | RED_V_Raptor | Sony_Venice2
  - lens_model: ARRI_Signature_Prime | Zeiss_Supreme | Cooke_S7

blocking:
  - subject_positions: "A izquierda frame, B derecha, 2m separación"
  - screen_direction: "A mira derecha, B mira izquierda"
  - action: "Descripción de lo que pasa"
  - timing_breakdown: "sec 0-1: entrada; sec 1-2: reacción; sec 2-3: diálogo"
  
dialogue: (línea de diálogo que cubre este plano, o null)

duration_sec: 3-8 segundos por plano

lighting:
  - style: Naturalistic_Daylight | Soft_Key | Hard_Dramatic | Noir_Contrast
  - color_temp: Daylight_5600K | Tungsten_3200K | Mixed
  - key_light_direction: Left | Right | Front | Back

sound_design:
  - room_tone: "descripción del tono ambiente"
  - ambience: ["elemento1", "elemento2"]
  - foley: ["acción1", "acción2"]

transition:
  - type: CUT | DISSOLVE | MATCH_CUT | J_CUT | L_CUT
  - to_next: "hard_cut" | "audio_prelap" | "visual_match"
  - bridge_audio: room_tone | dialogue_prelap | SFX_lead_in

edit_intent:
  - expected_cut: hard | soft | match_cut
  - hold_ms: 0-800 (milisegundos extra para "respirar")
  - rhythm_note: "Corte rápido" | "Hold para emoción"
  - viewer_notice: "¿Qué debe notar el espectador?"
  - intention: "¿Qué siente/aprende el espectador?"

ai_risks: [Identity_Drift, Hand_Deform, Spatial_Jump, Face_Morph]
risk_mitigation: "Evitar manos, usar misma ref"

keyframe_hints:
  - start_frame: "Descripción exacta del frame inicial"
  - end_frame: "Descripción exacta del frame final"
  - mid_frames: ["Descripción de frames intermedios si hay movimiento significativo"]

continuity:
  - wardrobe_notes: "Descripción del vestuario en este plano"
  - props_in_frame: ["prop1", "prop2"]
  - match_to_previous: "Notas de raccord con plano anterior"

hero: true/false (planos emocionales clave)

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
8. CADA shot tiene TODOS los campos requeridos

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
          "height": "EyeLevel",
          "stabilization": "Tripod",
          "camera_body": "ARRI_Alexa35",
          "lens_model": "ARRI_Signature_Prime"
        },
        "blocking": {
          "subject_positions": "A izquierda, B derecha",
          "screen_direction": "A mira derecha",
          "action": "Ambos personajes entran a la habitación",
          "timing_breakdown": "sec 0-1: entrada; sec 1-2: posicionamiento; sec 2-4: establecimiento"
        },
        "dialogue": null,
        "duration_sec": 4,
        "lighting": {
          "style": "Naturalistic_Daylight",
          "color_temp": "Daylight_5600K",
          "key_light_direction": "Left"
        },
        "sound_design": {
          "room_tone": "Silencio tenso",
          "ambience": ["aire acondicionado sutil"],
          "foley": ["pasos sobre madera", "puerta cerrándose"]
        },
        "transition": {
          "type": "CUT",
          "to_next": "hard_cut",
          "bridge_audio": "room_tone"
        },
        "edit_intent": {
          "expected_cut": "hard",
          "hold_ms": 200,
          "rhythm_note": "Establecer espacio",
          "viewer_notice": "La tensión entre los personajes",
          "intention": "El espectador siente la incomodidad del momento"
        },
        "ai_risks": ["Spatial_Jump"],
        "risk_mitigation": "Usar establishing con personajes pequeños en frame",
        "keyframe_hints": {
          "start_frame": "Puerta cerrada, habitación vacía",
          "end_frame": "Ambos personajes en sus posiciones finales",
          "mid_frames": ["Puerta abriéndose", "Personajes entrando"]
        },
        "continuity": {
          "wardrobe_notes": "A con traje azul, B con vestido rojo",
          "props_in_frame": ["mesa central", "lámpara"],
          "match_to_previous": "Primera escena, no hay referencia anterior"
        },
        "hero": false
      }
    ]
  }
]`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ═══════════════════════════════════════════════════════════════════════════
    // JWT VALIDATION (internal enforcement since verify_jwt = false at gateway)
    // ═══════════════════════════════════════════════════════════════════════════
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Validate JWT using anon client
    const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } }
    });
    
    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getUser(token);
    
    if (claimsError || !claimsData?.user) {
      console.error('[generate-scenes] JWT validation failed:', claimsError?.message);
      return new Response(JSON.stringify({ error: 'Invalid JWT' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userId = claimsData.user.id;
    console.log(`[generate-scenes] Authenticated user: ${userId}`);

    const { 
      projectId, 
      episodeNo, 
      synopsis, 
      sceneCount = 8, 
      narrativeMode = 'SERIE_ADICTIVA',
      generateFullShots = true,
      isTeaser, 
      teaserType, 
      teaserData 
    } = await req.json() as GenerateScenesRequest;
    
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const contentType = isTeaser ? `teaser ${teaserType}` : `episode ${episodeNo}`;
    console.log(`Generating complete scenes with shots for project ${projectId}, ${contentType}, mode: ${narrativeMode}`);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

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

    // Get narrative mode prompt
    const narrativeModePrompt = NARRATIVE_MODE_PROMPTS[narrativeMode] || NARRATIVE_MODE_PROMPTS.SERIE_ADICTIVA;

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
7. CADA shot debe tener TODOS los campos: camera_variation, blocking, lighting, sound_design, edit_intent, keyframe_hints, continuity

Retorna SOLO JSON válido con la estructura de escenas.`;
    } else {
      // EPISODE MODE - normal scene generation with narrative mode
      userPrompt = `${narrativeModePrompt}

═══════════════════════════════════════════════════════
GENERA ${sceneCount} ESCENAS COMPLETAS PARA EPISODIO ${episodeNo}
═══════════════════════════════════════════════════════

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

REQUISITOS CRÍTICOS:
1. Cada escena tiene 4-8 planos que cubren TODA la acción
2. Los DIÁLOGOS se distribuyen entre los planos
3. Las TRANSICIONES están definidas entre planos
4. Usa SOLO los personajes y localizaciones proporcionados
5. Marca planos emocionales como "hero": true
6. La secuencia respeta continuidad cinematográfica
7. CADA shot debe incluir TODOS los campos:
   - camera_variation (focal_mm, aperture, movement, height, stabilization, camera_body, lens_model)
   - blocking (subject_positions, screen_direction, action, timing_breakdown)
   - lighting (style, color_temp, key_light_direction)
   - sound_design (room_tone, ambience, foley)
   - edit_intent (expected_cut, hold_ms, rhythm_note, viewer_notice, intention)
   - keyframe_hints (start_frame, end_frame, mid_frames)
   - continuity (wardrobe_notes, props_in_frame, match_to_previous)

Retorna SOLO JSON válido, sin texto adicional.`;
    }

    console.log('Calling AI for complete scene generation with shots...');

    // Use AbortController with 150 second timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 150000);

    try {
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
          max_tokens: 16000, // Increased for more detailed output
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

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
        // Additional cleanup for common AI formatting issues
        // Fix TypeScript-style union types that sometimes appear: "mood": "intense" | "dramatic"
        scenesText = scenesText.replace(/"([^"]+)"\s*\|\s*"[^"]+"/g, '"$1"');
        // Fix single | in strings
        scenesText = scenesText.replace(/:\s*"([^"]*)\s*\|\s*([^"]*)"/g, ': "$1"');
        // Remove trailing commas before closing brackets
        scenesText = scenesText.replace(/,(\s*[\]}])/g, '$1');
        
        generatedScenes = JSON.parse(scenesText);
      } catch (parseError) {
        console.error('Failed to parse AI response:', scenesText.substring(0, 500));
        
        // Attempt to extract valid JSON array
        const arrayMatch = scenesText.match(/\[\s*\{[\s\S]*\}\s*\]/);
        if (arrayMatch) {
          try {
            let extracted = arrayMatch[0];
            extracted = extracted.replace(/"([^"]+)"\s*\|\s*"[^"]+"/g, '"$1"');
            extracted = extracted.replace(/,(\s*[\]}])/g, '$1');
            generatedScenes = JSON.parse(extracted);
            console.log('Successfully extracted and parsed JSON from response');
          } catch (e) {
            throw new Error('Invalid JSON response from AI');
          }
        } else {
          throw new Error('Invalid JSON response from AI');
        }
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

        // Insert scene with setup metadata
        const sceneSlugline = isTeaser 
          ? `TEASER ${teaserType} - ${scene.slugline || 'PROMOTIONAL SEQUENCE'}` 
          : scene.slugline;

        // Use upsert to handle duplicates (e.g., regenerating teasers)
        const sceneData = {
          project_id: projectId,
          episode_no: episodeNo,
          scene_no: scene.scene_no || 1,
          slugline: sceneSlugline,
          summary: scene.summary || (isTeaser ? `Teaser promocional ${teaserType}: ${teaserData?.logline || ''}` : ''),
          time_of_day: scene.time_of_day,
          character_ids: characterIds,
          location_id: locationId,
          mood: { primary: typeof scene.mood === 'string' ? scene.mood : (isTeaser ? 'cinematic' : 'dramatic') },
          quality_mode: isTeaser ? 'ULTRA' : 'CINE',
          parsed_json: {
            scene_setup: scene.scene_setup || null,
            generated_with: 'cinematographer_engine_v4',
            narrative_mode: narrativeMode,
            is_teaser: isTeaser || false,
            teaser_type: teaserType || null,
            teaser_metadata: isTeaser ? {
              title: teaserData?.title,
              logline: teaserData?.logline,
              music_cue: teaserData?.music_cue,
              voiceover_text: teaserData?.voiceover_text
            } : null
          }
        };

        // First try to get existing scene
        const { data: existingScene } = await supabase
          .from('scenes')
          .select('id')
          .eq('project_id', projectId)
          .eq('episode_no', episodeNo)
          .eq('scene_no', scene.scene_no || 1)
          .maybeSingle();

        let insertedScene;
        let sceneError;

        if (existingScene) {
          // Update existing scene
          const { data, error } = await supabase
            .from('scenes')
            .update(sceneData)
            .eq('id', existingScene.id)
            .select()
            .single();
          insertedScene = data;
          sceneError = error;
          
          // Delete existing shots for regeneration
          if (!sceneError) {
            await supabase.from('shots').delete().eq('scene_id', existingScene.id);
          }
        } else {
          // Insert new scene
          const { data, error } = await supabase
            .from('scenes')
            .insert(sceneData)
            .select()
            .single();
          insertedScene = data;
          sceneError = error;
        }

        if (sceneError) {
          console.error('Error upserting scene:', sceneError);
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
              height: shot.camera_variation.height,
              stabilization: shot.camera_variation.stabilization,
              camera_body: shot.camera_variation.camera_body,
              lens_model: shot.camera_variation.lens_model
            } : null;

            // Build blocking JSON
            const blockingData = shot.blocking ? {
              subject_positions: shot.blocking.subject_positions,
              screen_direction: shot.blocking.screen_direction,
              action: shot.blocking.action,
              timing_breakdown: shot.blocking.timing_breakdown
            } : null;

            // Build lighting JSON
            const lightingData = shot.lighting ? {
              style: shot.lighting.style,
              color_temp: shot.lighting.color_temp,
              key_light_direction: shot.lighting.key_light_direction
            } : null;

            // Build sound design JSON
            const soundDesignData = shot.sound_design ? {
              room_tone: shot.sound_design.room_tone,
              ambience: shot.sound_design.ambience,
              foley: shot.sound_design.foley
            } : null;

            // Build edit intent JSON
            const editIntentData = shot.edit_intent ? {
              expected_cut: shot.edit_intent.expected_cut,
              hold_ms: shot.edit_intent.hold_ms,
              rhythm_note: shot.edit_intent.rhythm_note,
              viewer_notice: shot.edit_intent.viewer_notice,
              intention: shot.edit_intent.intention
            } : null;

            // Build keyframe hints JSON
            const keyframeHintsData = shot.keyframe_hints ? {
              start_frame: shot.keyframe_hints.start_frame,
              end_frame: shot.keyframe_hints.end_frame,
              mid_frames: shot.keyframe_hints.mid_frames
            } : null;

            // Build continuity JSON
            const continuityData = shot.continuity ? {
              wardrobe_notes: shot.continuity.wardrobe_notes,
              props_in_frame: shot.continuity.props_in_frame,
              match_to_previous: shot.continuity.match_to_previous
            } : null;

            const { error: shotError } = await supabase
              .from('shots')
              .insert({
                scene_id: insertedScene.id,
                shot_no: shot.shot_no || parseInt(shot.shot_id?.replace('S', '') || '1'),
                shot_type: shot.shot_type?.toLowerCase() || 'medium',
                dialogue_text: shot.dialogue || null,
                duration_target: shot.duration_sec || 4,
                hero: shot.hero || isTeaser || false,
                effective_mode: (shot.hero || isTeaser) ? 'ULTRA' : 'CINE',
                camera: cameraData,
                blocking: blockingData,
                coverage_type: shot.coverage_type || null,
                story_purpose: shot.story_purpose || null,
                transition_in: shot.transition?.type || (isTeaser ? 'MATCH_CUT' : 'CUT'),
                transition_out: shot.transition?.to_next || (isTeaser ? 'visual_match' : 'hard_cut'),
                edit_intent: editIntentData,
                ai_risk: shot.ai_risks || [],
                continuity_notes: continuityData ? JSON.stringify(continuityData) : (shot.risk_mitigation || null),
                lighting: lightingData,
                sound_plan: soundDesignData, // Using sound_plan column for sound_design data
                keyframe_hints: keyframeHintsData,
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
        narrativeMode,
        isTeaser: isTeaser || false,
        teaserType: teaserType || null,
        message: isTeaser 
          ? `Teaser ${teaserType} generado con ${totalShotsInserted} planos` 
          : `${insertedScenes.length} escenas con ${totalShotsInserted} planos generados automáticamente (modo: ${narrativeMode})`
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } catch (fetchError: unknown) {
      clearTimeout(timeoutId);
      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        console.error('Request timed out after 150 seconds');
        return new Response(JSON.stringify({ 
          error: 'La generación tardó demasiado. Intenta con menos escenas o vuelve a intentar.' 
        }), {
          status: 504,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      throw fetchError;
    }

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
