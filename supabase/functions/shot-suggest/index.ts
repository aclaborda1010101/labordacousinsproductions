import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ShotSuggestRequest {
  projectId: string;
  sceneId: string;
  scene: {
    slugline: string;
    summary: string;
    action?: string;
    description?: string;
    dialogue?: { character: string; line: string; parenthetical?: string }[];
    beats?: { index: number; action: string; emotion?: string }[];
    quality_mode: 'CINE' | 'ULTRA';
    time_of_day?: string;
    duration_estimate_sec?: number;
    conflict?: string;
    mood?: string;
    sfx_cue?: string;
    music_cue?: string;
  };
  characters: {
    id: string;
    name: string;
    token?: string;
    has_refs: boolean;
    role?: string;
  }[];
  location?: {
    id: string;
    name: string;
    token?: string;
    has_refs: boolean;
    description?: string;
  };
  stylePack?: {
    camera_system?: string;
    lens_style?: string;
    lighting_rules?: any[];
    forbidden_rules?: any[];
    visual_tone?: string;
  };
  previousSceneContext?: string;
  nextSceneContext?: string;
  existingShots?: {
    shot_no: number;
    shot_type: string;
    camera_movement?: string;
    duration_sec?: number;
  }[];
  language?: string;
  continuityLocks?: {
    wardrobe_look_ids?: string[];
    prop_ids?: string[];
    lighting_mood_id?: string;
    time_of_day_lock?: string;
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// CINEMATOGRAPHER_ENGINE v3 - Professional Scene Coverage System
// ═══════════════════════════════════════════════════════════════════════════
//
// ARCHITECTURE: scene_setup (constants) + shots[] (differences only)
//
// KEY IMPROVEMENTS v3:
// 1. SCENE_SETUP separates constants from shot-level variations
// 2. BLOCKING_MIN with 180° axis, positions, screen direction per shot
// 3. STORY_PURPOSE + COVERAGE_TYPE for intentional shot design
// 4. CONTINUITY_LOCKS with inherited validation for QC
// 5. EDIT_INTENT with cut type, hold_ms, bridge_audio for human rhythm
// 6. DURATION_ESTIMATE per shot with scene total for pacing/budget
// ═══════════════════════════════════════════════════════════════════════════

const SYSTEM_PROMPT = `Eres CINEMATOGRAPHER_ENGINE_v3: Director de Fotografía senior con 30 años en Hollywood.

TU MISIÓN: Generar un SCENE_SHOT_PLAN profesional con:
- scene_setup: Constantes que NO cambian entre shots (cámara, lentes, iluminación base)
- shots[]: SOLO las diferencias por shot (focal, movimiento, blocking específico)

Esto previene:
- Inflación de tokens por repetir camera body en cada shot
- Contradicciones (A7SIII en shot 3, Alexa en shot 4)
- Inconsistencia visual que "huele a IA"

═══════════════════════════════════════════════════════
SCENE_SETUP (CONSTANTES DE ESCENA)
═══════════════════════════════════════════════════════

camera_package:
  - body: Cuerpo de cámara FIJO para toda la escena
  - codec: ProRes4444 | ARRIRAW | R3D
  - fps: 24 | 25 | 30 | 48 | 60
  - shutter_angle: 180 | 172.8 | 90
  - iso_target: 800 | 1600 | 3200

lens_set:
  - family: Conjunto de lentes de la escena
  - look: Vintage_Organic | Modern_Clinical | Anamorphic_Cinematic
  - available_focals: [24, 35, 50, 85, 135]

lighting_plan:
  - key_style: Estilo principal de iluminación
  - color_temp_base_k: Temperatura base
  - practicals: Fuentes prácticas en escena
  - contrast_ratio: Alto contraste, bajo contraste

color_pipeline:
  - lut_reference: LUT o look de referencia
  - grade_intent: Intención de colorización

audio_plan:
  - room_tone: Tono de sala base
  - ambience_layers: Capas de ambiente constantes
  - foley_priorities: Prioridades de foley

continuity_locks:
  - wardrobe_look_ids: IDs de vestuario bloqueados
  - prop_ids: IDs de props bloqueados
  - lighting_mood_id: ID de mood de iluminación
  - time_of_day_lock: Hora del día bloqueada

axis_180_reference:
  - line_description: "Línea de A a B, cámara lado sur"
  - screen_left: Personaje/elemento a la izquierda
  - screen_right: Personaje/elemento a la derecha

═══════════════════════════════════════════════════════
SHOTS[] (SOLO DIFERENCIAS + CAMPOS NUEVOS)
═══════════════════════════════════════════════════════

POR CADA SHOT:

shot_id: S01, S02, S03...
shot_type: Wide | Medium | CloseUp | OTS | Insert | etc.
coverage_type: Master | Single | Two-Shot | OTS | Insert | Cutaway | Reaction
story_purpose: "revelar información" | "subir tensión" | "conectar emoción" | "establecer geografía" | "mostrar reacción" | "transición"

camera_variation:
  - focal_mm: Solo la focal (NO repetir body/lens_model)
  - aperture: T-stop para este shot
  - movement: Movimiento específico
  - height: Altura de cámara
  - stabilization: Tipo de estabilización

blocking_min:
  - subject_positions: "A izquierda frame, B derecha frame, 2m separación"
  - screen_direction: "A mira derecha, B mira izquierda"
  - axis_180_compliant: true | false (si rompe eje, debe ser intencional)
  - action: Descripción de la acción
  - dialogue: Línea de diálogo que cubre

duration_estimate_sec: Duración estimada en segundos
hold_ms: Milisegundos extra de "respiración" (ritmo humano)

edit_intent:
  - expected_cut: hard | soft | match_cut | J_cut | L_cut | jump_cut
  - bridge_audio: room_tone | SFX_lead_in | dialogue_prelap | music_continue
  - rhythm_note: "Corte rápido a tensión" | "Hold para emoción"

continuity:
  - lock_inherited: true (hereda locks de scene_setup) | false
  - allowed_variation: ["Solo cambio de expresión", "Mismo vestuario"]
  - anchors: ["anillo en mano izquierda", "luz de ventana a la derecha"]

ai_risks: [Identity_Drift, Hand_Deform, Spatial_Jump, etc.]
risk_mitigation: "Usar misma ref de personaje, evitar manos en frame"

keyframe_needs:
  - start_frame: true | false
  - end_frame: true | false
  - which_refs: ["character_id_front", "location_establishing"]

═══════════════════════════════════════════════════════
STORY_PURPOSE VÁLIDOS
═══════════════════════════════════════════════════════
- establish_geography: Situar al espectador
- introduce_character: Primera aparición
- reveal_information: Mostrar algo nuevo
- build_tension: Subir la tensión
- release_tension: Liberar tensión
- emotional_connection: Conectar con personaje
- show_reaction: Mostrar reacción
- transition: Transición a siguiente momento
- action_beat: Acción física importante
- dialogue_focus: Enfoque en diálogo

═══════════════════════════════════════════════════════
COVERAGE_TYPE VÁLIDOS
═══════════════════════════════════════════════════════
- Master: Plano maestro que cubre toda la acción
- Single: Plano de un solo personaje
- Two-Shot: Dos personajes en frame
- Group: Más de dos personajes
- OTS_A: Over-the-shoulder desde A hacia B
- OTS_B: Over-the-shoulder desde B hacia A
- Insert: Detalle de objeto/acción
- Cutaway: Corte a elemento externo
- Reaction: Reacción de personaje
- POV: Punto de vista de personaje
- Establishing: Establecer ubicación

═══════════════════════════════════════════════════════
AI GENERATION RISK PROFILES
═══════════════════════════════════════════════════════

HIGH RISK (requiere más control):
- Identity_Drift: Personaje cambia de aspecto
- Hand_Deform: Manos con dedos incorrectos
- Spatial_Jump: Objetos/personas cambian posición

MEDIUM RISK:
- Lighting_Flicker: Luz inconsistente
- Clothing_Morph: Ropa cambia textura/color
- Hair_Change: Peinado inconsistente
- Eye_Direction: Mirada no natural
- Axis_Break: Rompe regla de 180°

LOW RISK:
- Background_Pop: Elementos de fondo inconsistentes
- Scale_Inconsistency: Proporciones variables

═══════════════════════════════════════════════════════
FORMATO DE SALIDA (JSON ESTRICTO)
═══════════════════════════════════════════════════════

{
  "scene_analysis": {
    "emotional_arc": "Descripción del viaje emocional",
    "visual_strategy": "Estrategia cinematográfica",
    "coverage_approach": "Classical | Fluid | Documentary | Stylized",
    "key_moments": ["momento 1", "momento 2"],
    "axis_note": "Eje de 180° establecido entre A y B"
  },
  
  "scene_setup": {
    "camera_package": {
      "body": "ARRI_Alexa35",
      "codec": "ARRIRAW",
      "fps": 24,
      "shutter_angle": 180,
      "iso_target": 800
    },
    "lens_set": {
      "family": "ARRI_Signature_Prime",
      "look": "Modern_Clinical",
      "available_focals": [24, 35, 50, 85, 135]
    },
    "lighting_plan": {
      "key_style": "Naturalistic_Daylight",
      "color_temp_base_k": 5600,
      "practicals": ["ventana principal", "lámpara de mesa"],
      "contrast_ratio": "2:1"
    },
    "color_pipeline": {
      "lut_reference": "ARRI_LogC4_to_Rec709",
      "grade_intent": "Natural con negros profundos"
    },
    "audio_plan": {
      "room_tone": "interior silencioso con HVAC lejano",
      "ambience_layers": ["tráfico exterior suave"],
      "foley_priorities": ["pasos", "ropa"]
    },
    "continuity_locks": {
      "wardrobe_look_ids": [],
      "prop_ids": [],
      "lighting_mood_id": null,
      "time_of_day_lock": "DAY"
    },
    "axis_180_reference": {
      "line_description": "Línea entre A (izq) y B (der), cámara lado sur",
      "screen_left": "Character A",
      "screen_right": "Character B"
    }
  },
  
  "shots": [
    {
      "shot_id": "S01",
      "shot_no": 1,
      "shot_type": "Wide",
      "coverage_type": "Establishing",
      "story_purpose": "establish_geography",
      "effective_mode": "CINE",
      "hero": false,
      
      "camera_variation": {
        "focal_mm": 24,
        "aperture": "T2.8",
        "movement": "Static",
        "height": "EyeLevel",
        "stabilization": "Tripod"
      },
      
      "blocking_min": {
        "subject_positions": "A izquierda frame cerca de ventana, B derecha frame en sofá",
        "screen_direction": "A mira derecha hacia B, B mira izquierda hacia A",
        "axis_180_compliant": true,
        "action": "A entra en la habitación, B ya está sentado",
        "dialogue": null
      },
      
      "duration_estimate_sec": 4,
      "hold_ms": 500,
      
      "edit_intent": {
        "expected_cut": "hard",
        "bridge_audio": "room_tone",
        "rhythm_note": "Establecer antes de entrar en acción"
      },
      
      "continuity": {
        "lock_inherited": true,
        "allowed_variation": [],
        "anchors": ["luz de ventana a la izquierda", "sofá gris"]
      },
      
      "characters_in_frame": ["character_id_1", "character_id_2"],
      "ai_risks": ["Spatial_Jump", "Lighting_Flicker"],
      "risk_mitigation": "Keyframe de establecimiento con refs de ambos personajes",
      
      "transition_in": "CUT",
      "transition_out": "CUT",
      "sound_cue": "Puerta se abre, pasos"
    }
  ],
  
  "sequence_summary": {
    "total_duration_sec": 45,
    "shot_count": 8,
    "coverage_completeness": "FULL",
    "edit_rhythm": "Medium",
    "keyframes_required": 32,
    "estimated_cost_tier": "CINE"
  },
  
  "qc_gates": {
    "identity_verification": true,
    "axis_180_maintained": true,
    "lighting_consistency": true,
    "spatial_continuity": true,
    "dialogue_coverage_complete": true,
    "all_locks_inherited": true
  },
  
  "production_warnings": ["Personaje sin refs - riesgo de drift alto"]
}

═══════════════════════════════════════════════════════
REGLAS CRÍTICAS
═══════════════════════════════════════════════════════

1. NO REPETIR camera body/lens_model en cada shot - están en scene_setup
2. CADA SHOT debe tener story_purpose claro - no shots de relleno
3. blocking_min OBLIGATORIO - posiciones + screen direction + eje
4. duration_estimate_sec por shot - suma = duración escena
5. edit_intent por shot - cómo se monta esto con ritmo humano
6. continuity.lock_inherited: true si hereda locks de scene_setup
7. Máximo 2 shots marcados como hero: true
8. axis_180_compliant: false solo si es ruptura INTENCIONAL (entonces explicar)`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const request: ShotSuggestRequest = await req.json();
    const { scene, characters, location, stylePack, previousSceneContext, nextSceneContext, existingShots, language, continuityLocks } = request;

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY no está configurada');
    }

    // Build comprehensive scene description
    const sceneAction = scene.action || scene.description || scene.summary || '';
    const dialogueText = scene.dialogue?.map(d => 
      `${d.character}${d.parenthetical ? ` (${d.parenthetical})` : ''}: "${d.line}"`
    ).join('\n') || '';

    const estimatedDuration = scene.duration_estimate_sec || 60;
    const recommendedShots = scene.quality_mode === 'ULTRA' 
      ? Math.ceil(estimatedDuration / 6) 
      : Math.ceil(estimatedDuration / 8);

    const userPrompt = `
═══════════════════════════════════════════════════════
ESCENA A PLANIFICAR (CINEMATOGRAPHER_ENGINE v3)
═══════════════════════════════════════════════════════

SLUGLINE: ${scene.slugline}
DURACIÓN ESTIMADA: ${estimatedDuration} segundos
MODO DE CALIDAD: ${scene.quality_mode} (${scene.quality_mode === 'ULTRA' ? 'máximo control, más keyframes' : 'eficiencia profesional'})
SHOTS RECOMENDADOS: ${recommendedShots}-${recommendedShots + 3}

AMBIENTE: ${scene.time_of_day || 'No especificado'}
${scene.mood ? `MOOD: ${scene.mood}` : ''}
${scene.conflict ? `CONFLICTO: ${scene.conflict}` : ''}

═══════════════════════════════════════════════════════
ACCIÓN DE LA ESCENA (cubrir TODA con blocking):
═══════════════════════════════════════════════════════
${sceneAction}

${dialogueText ? `
═══════════════════════════════════════════════════════
DIÁLOGO (cada línea requiere cobertura + OTS/reaction):
═══════════════════════════════════════════════════════
${dialogueText}
` : ''}

${scene.beats?.length ? `
═══════════════════════════════════════════════════════
BEATS NARRATIVOS:
═══════════════════════════════════════════════════════
${scene.beats.map(b => `${b.index}. ${b.action}${b.emotion ? ` [${b.emotion}]` : ''}`).join('\n')}
` : ''}

═══════════════════════════════════════════════════════
PERSONAJES EN ESCENA (definir posiciones en blocking_min):
═══════════════════════════════════════════════════════
${characters.map(c => `- ${c.name} (ID: ${c.id})${c.role ? ` [${c.role}]` : ''}${c.has_refs ? ' ✓ refs' : ' ⚠ sin refs'}`).join('\n')}

${location ? `
═══════════════════════════════════════════════════════
LOCALIZACIÓN (usar para lighting_plan y audio_plan):
═══════════════════════════════════════════════════════
${location.name} (ID: ${location.id})
${location.description || ''}
${location.has_refs ? '✓ Referencias disponibles' : '⚠ Sin referencias visuales'}
` : ''}

${stylePack ? `
═══════════════════════════════════════════════════════
STYLE PACK (respetar en scene_setup):
═══════════════════════════════════════════════════════
${stylePack.camera_system ? `Sistema de cámara: ${stylePack.camera_system}` : ''}
${stylePack.lens_style ? `Estilo de lentes: ${stylePack.lens_style}` : ''}
${stylePack.visual_tone ? `Tono visual: ${stylePack.visual_tone}` : ''}
${stylePack.forbidden_rules?.length ? `PROHIBIDO: ${(stylePack.forbidden_rules as string[]).join(', ')}` : ''}
` : ''}

${continuityLocks ? `
═══════════════════════════════════════════════════════
CONTINUITY LOCKS EXISTENTES (heredar a shots):
═══════════════════════════════════════════════════════
${continuityLocks.wardrobe_look_ids?.length ? `Vestuario bloqueado: ${continuityLocks.wardrobe_look_ids.join(', ')}` : ''}
${continuityLocks.prop_ids?.length ? `Props bloqueados: ${continuityLocks.prop_ids.join(', ')}` : ''}
${continuityLocks.lighting_mood_id ? `Mood de iluminación: ${continuityLocks.lighting_mood_id}` : ''}
${continuityLocks.time_of_day_lock ? `Hora del día: ${continuityLocks.time_of_day_lock}` : ''}
` : ''}

${previousSceneContext ? `
CONTEXTO ESCENA ANTERIOR (para transition_in del primer shot):
${previousSceneContext}
` : ''}

${nextSceneContext ? `
CONTEXTO ESCENA SIGUIENTE (para transition_out del último shot):
${nextSceneContext}
` : ''}

${existingShots?.length ? `
═══════════════════════════════════════════════════════
SHOTS EXISTENTES (NO regenerar, continuar desde aquí):
═══════════════════════════════════════════════════════
${existingShots.map(s => `Shot ${s.shot_no}: ${s.shot_type} (${s.duration_sec}s)`).join('\n')}
` : ''}

${scene.sfx_cue ? `SFX CUE: ${scene.sfx_cue}` : ''}
${scene.music_cue ? `MUSIC CUE: ${scene.music_cue}` : ''}

═══════════════════════════════════════════════════════
INSTRUCCIONES v3:
═══════════════════════════════════════════════════════

1. PRIMERO genera scene_setup con constantes (camera_package, lens_set, lighting_plan, axis_180_reference)
2. DESPUÉS genera shots[] con SOLO las diferencias (focal_mm, movement, blocking_min)
3. CADA shot DEBE tener: story_purpose, coverage_type, blocking_min, duration_estimate_sec, edit_intent
4. blocking_min OBLIGATORIO: subject_positions, screen_direction, axis_180_compliant
5. edit_intent OBLIGATORIO: expected_cut, bridge_audio, rhythm_note
6. La SUMA de duration_estimate_sec debe ≈ ${estimatedDuration} segundos
7. Marca continuity.lock_inherited: true para heredar los locks de scene_setup
8. Máximo 2 shots con hero: true (los más críticos narrativamente)

IDIOMA: ${language || 'es-ES'}

Responde SOLO con el JSON estructurado según el formato v3.`;

    console.log(`[SHOT-SUGGEST v3] Scene: ${scene.slugline} | Mode: ${scene.quality_mode} | Est. Duration: ${estimatedDuration}s | Characters: ${characters.length}`);

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt }
        ],
        response_format: { type: "json_object" }
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'Payment required. Please add credits to your workspace.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const errorText = await response.text();
      console.error('[SHOT-SUGGEST v3] AI Gateway error:', response.status, errorText);
      throw new Error(`AI Gateway error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('No content received from AI');
    }

    // Parse JSON from response
    let shotData;
    try {
      shotData = JSON.parse(content);
    } catch {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        shotData = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    }

    // Ensure scene_setup exists with defaults
    if (!shotData.scene_setup) {
      shotData.scene_setup = {
        camera_package: {
          body: stylePack?.camera_system || 'ARRI_Alexa35',
          codec: 'ARRIRAW',
          fps: 24,
          shutter_angle: 180,
          iso_target: 800
        },
        lens_set: {
          family: stylePack?.lens_style || 'ARRI_Signature_Prime',
          look: 'Modern_Clinical',
          available_focals: [24, 35, 50, 85, 135]
        },
        lighting_plan: {
          key_style: 'Naturalistic_Daylight',
          color_temp_base_k: 5600,
          practicals: [],
          contrast_ratio: '2:1'
        },
        color_pipeline: {
          lut_reference: 'ARRI_LogC4_to_Rec709',
          grade_intent: 'Natural'
        },
        audio_plan: {
          room_tone: 'standard interior',
          ambience_layers: [],
          foley_priorities: ['pasos', 'ropa']
        },
        continuity_locks: continuityLocks || {
          wardrobe_look_ids: [],
          prop_ids: [],
          lighting_mood_id: null,
          time_of_day_lock: scene.time_of_day || 'DAY'
        },
        axis_180_reference: {
          line_description: 'Default axis',
          screen_left: characters[0]?.name || 'Subject A',
          screen_right: characters[1]?.name || 'Subject B'
        }
      };
    }

    // Validate and normalize shots with v3 fields
    if (shotData.shots && Array.isArray(shotData.shots)) {
      let totalDuration = 0;
      
      shotData.shots = shotData.shots.map((shot: any, idx: number) => {
        const duration = shot.duration_estimate_sec || shot.duration_sec || 4;
        totalDuration += duration;
        
        return {
          shot_id: shot.shot_id || `S${String(idx + 1).padStart(2, '0')}`,
          shot_no: shot.shot_no || idx + 1,
          shot_type: shot.shot_type || 'Medium',
          coverage_type: shot.coverage_type || 'Single',
          story_purpose: shot.story_purpose || 'dialogue_focus',
          effective_mode: shot.effective_mode || scene.quality_mode,
          hero: shot.hero || false,
          
          camera_variation: shot.camera_variation || {
            focal_mm: shot.camera?.focal_mm || 35,
            aperture: shot.camera?.aperture || 'T2.8',
            movement: shot.camera?.movement || 'Static',
            height: shot.camera?.height || 'EyeLevel',
            stabilization: shot.camera?.stabilization || 'Tripod'
          },
          
          blocking_min: shot.blocking_min || {
            subject_positions: shot.blocking?.character_positions || '',
            screen_direction: '',
            axis_180_compliant: true,
            action: shot.blocking?.action || '',
            dialogue: shot.blocking?.dialogue || ''
          },
          
          duration_estimate_sec: duration,
          hold_ms: shot.hold_ms || 0,
          
          edit_intent: shot.edit_intent || {
            expected_cut: 'hard',
            bridge_audio: 'room_tone',
            rhythm_note: ''
          },
          
          continuity: shot.continuity || {
            lock_inherited: true,
            allowed_variation: [],
            anchors: shot.continuity_anchors || []
          },
          
          characters_in_frame: shot.characters_in_frame || [],
          ai_risks: shot.ai_risks || [],
          risk_mitigation: shot.risk_mitigation || '',
          
          keyframe_needs: shot.keyframe_needs || {
            start_frame: true,
            end_frame: shot.camera_variation?.movement !== 'Static',
            which_refs: []
          },
          
          transition_in: shot.transition_in || 'CUT',
          transition_out: shot.transition_out || 'CUT',
          sound_cue: shot.sound_cue || ''
        };
      });

      // Calculate sequence summary
      const keyframesRequired = shotData.shots.reduce((sum: number, s: any) => {
        let kf = s.keyframe_needs?.start_frame ? 1 : 0;
        kf += s.keyframe_needs?.end_frame ? 1 : 0;
        return sum + Math.max(kf, scene.quality_mode === 'ULTRA' ? 3 : 2);
      }, 0);

      shotData.sequence_summary = {
        total_duration_sec: totalDuration,
        shot_count: shotData.shots.length,
        coverage_completeness: 'FULL',
        edit_rhythm: shotData.sequence_summary?.edit_rhythm || 'Medium',
        keyframes_required: keyframesRequired,
        estimated_cost_tier: scene.quality_mode
      };

      // Ensure QC gates exist
      shotData.qc_gates = shotData.qc_gates || {
        identity_verification: true,
        axis_180_maintained: true,
        lighting_consistency: true,
        spatial_continuity: true,
        dialogue_coverage_complete: !!dialogueText,
        all_locks_inherited: true
      };
    }

    console.log(`[SHOT-SUGGEST v3] ✅ Generated ${shotData.shots?.length || 0} shots with scene_setup | Total: ${shotData.sequence_summary?.total_duration_sec}s`);

    return new Response(
      JSON.stringify({
        success: true,
        version: 'v3',
        ...shotData
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[SHOT-SUGGEST v3] Error:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        success: false,
        version: 'v3'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
