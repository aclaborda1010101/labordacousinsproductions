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
}

// ════════════════════════════════════════════════════════════════
// CINEMATOGRAPHER ENGINE v2 - COMPLETE SCENE COVERAGE SYSTEM
// ════════════════════════════════════════════════════════════════

const SYSTEM_PROMPT = `Eres CINEMATOGRAPHER_ENGINE_v2: Director de Fotografía senior con 30 años en Hollywood.

TU MISIÓN CRÍTICA: Generar una secuencia de shots COMPLETA, CORRELATIVA y PROFESIONAL que cubra TODA la acción y diálogo de la escena. Los shots deben fluir naturalmente como una secuencia cinematográfica coherente.

═══════════════════════════════════════════════════════
REGLAS FUNDAMENTALES DE COVERAGE
═══════════════════════════════════════════════════════

1. COBERTURA TOTAL: Cada línea de acción y diálogo debe estar cubierta por un shot
2. FLUJO VISUAL: Los shots deben alternar tamaños lógicamente (Wide→Medium→Close→Wide)
3. CONTINUIDAD: Cada shot debe conectar visual y narrativamente con el anterior/siguiente
4. REGLA 180°: Mantener eje de cámara coherente en diálogos
5. TIMING REALISTA: Duración basada en acción real (diálogo = 1.5 seg/línea aprox)

═══════════════════════════════════════════════════════
ESTRUCTURA DE COBERTURA PROFESIONAL
═══════════════════════════════════════════════════════

INICIO DE ESCENA (obligatorio):
- Shot 1: ESTABLISHING/WIDE - Sitúa al espectador en el espacio
- Shot 2: MEDIUM/FULL - Introduce personajes principales

DESARROLLO (según acción/diálogo):
- Para DIÁLOGO: OTS alternados + inserts de reacción
- Para ACCIÓN: Tracking/Steadicam siguiendo movimiento
- Para TENSIÓN: Progresión de planos más cerrados
- Para REVELACIÓN: Insert o ECU del objeto/detalle

CIERRE DE ESCENA (obligatorio):
- Último shot: Transición natural a siguiente escena

═══════════════════════════════════════════════════════
ESPECIFICACIONES TÉCNICAS REQUERIDAS POR SHOT
═══════════════════════════════════════════════════════

FOCAL LENGTHS (mm):
- 16-24mm: Establisher, espacios amplios, distorsión expresiva
- 35mm: Medium wide, grupos, movimiento
- 50mm: Estándar, natural, medium shots
- 85mm: Retratos, close-ups, compresión elegante
- 135mm: ECU, aislamiento, intimidad extrema

CAMERA HEIGHT:
- GroundLevel: Poder, amenaza, perspectiva inusual
- LowAngle: Heroísmo, dominancia, autoridad
- EyeLevel: Neutral, objetivo, periodístico
- HighAngle: Vulnerabilidad, vigilancia, contexto
- Overhead: Coreografía, objetos, abstracción

STABILIZATION:
- Tripod: Estable, formal, control total
- Steadicam: Suave siguiendo acción
- Handheld_Controlled: Documental elegante, tensión sutil
- Handheld_Raw: Urgencia, caos, realismo extremo
- Gimbal: Movimiento fluido moderno
- Crane: Movimientos verticales épicos

═══════════════════════════════════════════════════════
AI GENERATION RISK PROFILES
═══════════════════════════════════════════════════════

HIGH RISK (requiere más control):
- Identity_Drift: Personaje cambia de aspecto entre shots
- Hand_Deform: Manos con dedos incorrectos
- Spatial_Jump: Objetos/personas cambian posición

MEDIUM RISK:
- Lighting_Flicker: Luz inconsistente
- Clothing_Morph: Ropa cambia textura/color
- Hair_Change: Peinado inconsistente
- Eye_Direction: Mirada no natural

LOW RISK:
- Background_Pop: Elementos de fondo inconsistentes
- Scale_Inconsistency: Proporciones variables

═══════════════════════════════════════════════════════
FORMATO DE SALIDA (JSON ESTRICTO)
═══════════════════════════════════════════════════════

{
  "scene_analysis": {
    "emotional_arc": "Descripción del viaje emocional de la escena",
    "visual_strategy": "Estrategia cinematográfica elegida",
    "coverage_approach": "Classical|Fluid|Documentary|Stylized",
    "key_moments": ["momento 1", "momento 2"],
    "axis_note": "Nota sobre eje de 180° si aplica"
  },
  "shots": [
    {
      "shot_no": 1,
      "shot_type": "ExtremeWide|Wide|Full|MediumWide|Medium|MediumClose|CloseUp|ExtremeCloseUp|OverShoulder|POV|Insert|TwoShot|GroupShot|Establishing",
      "duration_sec": 4,
      "effective_mode": "CINE|ULTRA",
      "hero": false,
      "camera": {
        "body": "ARRI_Alexa35|RED_V-Raptor|Sony_Venice3",
        "lens_model": "ARRI_Signature_Prime|Zeiss_Supreme|Cooke_S7|Panavision_Primo",
        "focal_mm": 35,
        "aperture": "T1.8|T2.0|T2.8|T4.0|T5.6",
        "movement": "Static|Pan_Left|Pan_Right|Tilt_Up|Tilt_Down|Dolly_In|Dolly_Out|Tracking_Follow|Tracking_Lead|Arc_Left|Arc_Right|Crane_Up|Crane_Down|Push_In|Pull_Out|Whip_Pan|Rack_Focus",
        "height": "GroundLevel|LowAngle|EyeLevel|HighAngle|Overhead",
        "stabilization": "Tripod|Steadicam|Handheld_Controlled|Handheld_Raw|Gimbal|Crane",
        "framing_notes": "Notas específicas de encuadre"
      },
      "lighting": {
        "style": "Naturalistic_Daylight|Golden_Hour|Blue_Hour|Tungsten_Warm|Fluorescent_Cool|Mixed_Practical|Hard_Key|Soft_Key|Backlight_Rim|Silhouette|Noir|Neon_Mixed",
        "key_position": "Front|45deg_Left|45deg_Right|Side|Back",
        "fill_ratio": "1:1|2:1|4:1|8:1|No_Fill",
        "color_temp_k": 5600,
        "practicals": ["prácticos en escena"],
        "notes": "Notas de iluminación"
      },
      "blocking": {
        "action": "Descripción precisa de la acción en este shot",
        "dialogue": "Línea de diálogo que cubre este shot (si aplica)",
        "character_positions": "Dónde están los personajes en frame",
        "eye_lines": "Hacia dónde miran los personajes",
        "viewer_notice": "¿Qué debe notar el espectador?",
        "intention": "Propósito dramático de este shot"
      },
      "characters_in_frame": ["character_id_1"],
      "ai_risks": ["Identity_Drift", "Hand_Deform"],
      "risk_mitigation": "Cómo mitigar los riesgos identificados",
      "continuity_anchors": ["Elementos visuales que anclan continuidad"],
      "transition_in": "Cómo entra este shot (CUT|DISSOLVE|MATCH_CUT)",
      "transition_out": "Cómo sale este shot",
      "sound_cue": "Sonido/música específico para este momento"
    }
  ],
  "sequence_notes": {
    "total_duration_sec": 45,
    "shot_count": 8,
    "coverage_type": "Full_Master|Single_Camera|Multi_Angle",
    "edit_rhythm": "Fast|Medium|Slow|Variable",
    "keyframes_required": 32
  },
  "qc_gates": {
    "identity_verification": true,
    "lighting_consistency": true,
    "spatial_continuity": true,
    "dialogue_sync": true,
    "recommended_keyframes_per_shot": 4
  },
  "production_warnings": ["Warnings específicos para esta escena"]
}

═══════════════════════════════════════════════════════
SHOT TYPES VÁLIDOS
═══════════════════════════════════════════════════════
ExtremeWide, Wide, Full, MediumWide, Medium, MediumClose, CloseUp, ExtremeCloseUp, OverShoulder, POV, Insert, Cutaway, Establishing, TwoShot, GroupShot, ReactionShot, DetailMacro, Aerial, DutchAngle

═══════════════════════════════════════════════════════
CAMERA MOVEMENTS VÁLIDOS  
═══════════════════════════════════════════════════════
Static, Pan_Left, Pan_Right, Tilt_Up, Tilt_Down, Dolly_In, Dolly_Out, Tracking_Follow, Tracking_Lead, Arc_Left, Arc_Right, Crane_Up, Crane_Down, Push_In, Pull_Out, Whip_Pan, Rack_Focus, Handheld_Controlled, Handheld_Raw, Steadicam, Gimbal

═══════════════════════════════════════════════════════
REGLAS DE CANTIDAD DE SHOTS
═══════════════════════════════════════════════════════
- Escena de 30 seg → 4-6 shots
- Escena de 60 seg → 6-10 shots  
- Escena de 120 seg → 10-15 shots
- Modo ULTRA → +20% más shots con más control
- Modo CINE → shots eficientes, menos cantidad

CRÍTICO: Cada shot debe tener PROPÓSITO narrativo. No generes shots de relleno.`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const request: ShotSuggestRequest = await req.json();
    const { scene, characters, location, stylePack, previousSceneContext, nextSceneContext, existingShots, language } = request;

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
ESCENA A CUBRIR COMPLETAMENTE
═══════════════════════════════════════════════════════

SLUGLINE: ${scene.slugline}
DURACIÓN ESTIMADA: ${estimatedDuration} segundos
MODO DE CALIDAD: ${scene.quality_mode} (${scene.quality_mode === 'ULTRA' ? 'máximo control' : 'eficiencia profesional'})
SHOTS RECOMENDADOS: ${recommendedShots}-${recommendedShots + 3}

AMBIENTE: ${scene.time_of_day || 'No especificado'}
${scene.mood ? `MOOD: ${scene.mood}` : ''}
${scene.conflict ? `CONFLICTO: ${scene.conflict}` : ''}

═══════════════════════════════════════════════════════
ACCIÓN DE LA ESCENA (cubrir TODO):
═══════════════════════════════════════════════════════
${sceneAction}

${dialogueText ? `
═══════════════════════════════════════════════════════
DIÁLOGO COMPLETO (cada línea debe tener cobertura):
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
PERSONAJES EN ESCENA:
═══════════════════════════════════════════════════════
${characters.map(c => `- ${c.name} (ID: ${c.id})${c.role ? ` [${c.role}]` : ''}${c.has_refs ? ' ✓ refs' : ' ⚠ sin refs'}`).join('\n')}

${location ? `
═══════════════════════════════════════════════════════
LOCALIZACIÓN:
═══════════════════════════════════════════════════════
${location.name} (ID: ${location.id})
${location.description || ''}
${location.has_refs ? '✓ Referencias disponibles' : '⚠ Sin referencias visuales'}
` : ''}

${stylePack ? `
═══════════════════════════════════════════════════════
STYLE PACK DEL PROYECTO:
═══════════════════════════════════════════════════════
${stylePack.camera_system ? `Sistema de cámara: ${stylePack.camera_system}` : ''}
${stylePack.lens_style ? `Estilo de lentes: ${stylePack.lens_style}` : ''}
${stylePack.visual_tone ? `Tono visual: ${stylePack.visual_tone}` : ''}
${stylePack.forbidden_rules?.length ? `PROHIBIDO: ${(stylePack.forbidden_rules as string[]).join(', ')}` : ''}
` : ''}

${previousSceneContext ? `
CONTEXTO ESCENA ANTERIOR (para continuidad):
${previousSceneContext}
` : ''}

${nextSceneContext ? `
CONTEXTO ESCENA SIGUIENTE (para transición):
${nextSceneContext}
` : ''}

${existingShots?.length ? `
═══════════════════════════════════════════════════════
SHOTS EXISTENTES (NO regenerar, solo continuar desde aquí):
═══════════════════════════════════════════════════════
${existingShots.map(s => `Shot ${s.shot_no}: ${s.shot_type} (${s.duration_sec}s) - ${s.camera_movement || 'static'}`).join('\n')}
` : ''}

${scene.sfx_cue ? `SFX CUE: ${scene.sfx_cue}` : ''}
${scene.music_cue ? `MUSIC CUE: ${scene.music_cue}` : ''}

═══════════════════════════════════════════════════════
INSTRUCCIONES FINALES:
═══════════════════════════════════════════════════════

1. Genera una secuencia COMPLETA de shots que cubra TODA la acción y diálogo
2. Los shots deben ser CORRELATIVOS (1, 2, 3...) y fluir naturalmente
3. Incluye TODOS los detalles técnicos: focal_mm, aperture, movement, height, lighting
4. Identifica AI RISKS específicos para cada shot
5. Cada shot debe tener PROPÓSITO narrativo claro (intention)
6. Marca máximo 2 shots como "hero": true (los más importantes)

IDIOMA: ${language || 'es-ES'}

Responde SOLO con el JSON estructurado según el formato especificado.`;

    console.log(`[SHOT-SUGGEST] Scene: ${scene.slugline} | Mode: ${scene.quality_mode} | Est. Duration: ${estimatedDuration}s`);

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
      console.error('[SHOT-SUGGEST] AI Gateway error:', response.status, errorText);
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
      // Try direct parse first (for json_object mode)
      shotData = JSON.parse(content);
    } catch {
      // Fallback: extract JSON from markdown/text
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        shotData = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    }

    // Validate and normalize shots
    if (shotData.shots && Array.isArray(shotData.shots)) {
      shotData.shots = shotData.shots.map((shot: any, idx: number) => ({
        shot_no: shot.shot_no || idx + 1,
        shot_type: shot.shot_type || 'Medium',
        duration_sec: shot.duration_sec || 4,
        effective_mode: shot.effective_mode || scene.quality_mode,
        hero: shot.hero || false,
        camera: {
          body: shot.camera?.body || 'ARRI_Alexa35',
          lens_model: shot.camera?.lens_model || 'ARRI_Signature_Prime',
          focal_mm: shot.camera?.focal_mm || 35,
          aperture: shot.camera?.aperture || 'T2.8',
          movement: shot.camera?.movement || 'Static',
          height: shot.camera?.height || 'EyeLevel',
          stabilization: shot.camera?.stabilization || 'Tripod',
          framing_notes: shot.camera?.framing_notes || ''
        },
        lighting: shot.lighting || {
          style: 'Naturalistic_Daylight',
          key_position: 'Front',
          fill_ratio: '2:1',
          color_temp_k: 5600,
          practicals: [],
          notes: ''
        },
        blocking: shot.blocking || {
          action: '',
          dialogue: '',
          character_positions: '',
          eye_lines: '',
          viewer_notice: '',
          intention: ''
        },
        characters_in_frame: shot.characters_in_frame || shot.character_refs || [],
        ai_risks: shot.ai_risks || [],
        risk_mitigation: shot.risk_mitigation || '',
        continuity_anchors: shot.continuity_anchors || [],
        transition_in: shot.transition_in || 'CUT',
        transition_out: shot.transition_out || 'CUT',
        sound_cue: shot.sound_cue || ''
      }));

      // Calculate totals
      const totalDuration = shotData.shots.reduce((sum: number, s: any) => sum + (s.duration_sec || 4), 0);
      const keyframesRequired = shotData.shots.length * (scene.quality_mode === 'ULTRA' ? 5 : 4);

      shotData.sequence_notes = {
        ...shotData.sequence_notes,
        total_duration_sec: totalDuration,
        shot_count: shotData.shots.length,
        keyframes_required: keyframesRequired
      };
    }

    console.log(`[SHOT-SUGGEST] ✅ Generated ${shotData.shots?.length || 0} shots for scene`);

    return new Response(
      JSON.stringify({
        success: true,
        ...shotData
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[SHOT-SUGGEST] Error:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        success: false 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
