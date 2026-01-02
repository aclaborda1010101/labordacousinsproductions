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
    beats?: { index: number; action: string; emotion?: string }[];
    quality_mode: 'CINE' | 'ULTRA';
    time_of_day?: string;
  };
  characters: {
    id: string;
    name: string;
    token?: string;
    has_refs: boolean;
  }[];
  location?: {
    id: string;
    name: string;
    token?: string;
    has_refs: boolean;
  };
  stylePack?: {
    camera_system?: string;
    lens_style?: string;
    lighting_rules?: any[];
    forbidden_rules?: any[];
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

const SYSTEM_PROMPT = `Eres SHOT_SUGGEST: un Director de Fotografía y Director experto de Hollywood.

TU MISIÓN: Proponer una secuencia de shots cinematográficos profesionales que:
1. Cubran toda la acción de la escena
2. Mantengan continuidad visual con escenas adyacentes
3. Sigan el sistema de cámara del proyecto (si se proporciona)
4. Consideren los riesgos de generación por IA

FORMATO DE SALIDA (JSON):
{
  "scene_analysis": {
    "emotional_arc": "descripción del arco emocional",
    "visual_themes": ["temas visuales clave"],
    "continuity_concerns": ["preocupaciones de continuidad"],
    "recommended_coverage": "tipo de cobertura recomendada"
  },
  "shots": [
    {
      "shot_no": 1,
      "shot_type": "CloseUp|Medium|Wide|ExtremeWide|OverShoulder|POV|Insert|TwoShot|GroupShot",
      "duration_sec": 3,
      "effective_mode": "CINE|ULTRA",
      "hero": false,
      "camera": {
        "movement": "Static|Pan_Left|Pan_Right|Dolly_In|Dolly_Out|Tracking|Steadicam|Handheld",
        "height": "EyeLevel|LowAngle|HighAngle|Overhead|GroundLevel",
        "focal_mm": 35,
        "lighting_style": "Naturalistic_Daylight|Soft_Key|Hard_Key|Backlight_Rim|Neon_Mixed"
      },
      "blocking": {
        "description": "descripción de la acción y posición de personajes",
        "action": "acción específica del shot",
        "viewer_notice": "qué debe notar el espectador",
        "intention": "intención dramática del shot"
      },
      "dialogue_text": "diálogo si aplica",
      "character_refs": ["ids de personajes en el shot"],
      "ai_risks": ["Identity_Drift", "Hand_Deform", "Lighting_Flicker"],
      "continuity_anchors": ["elementos que anclan la continuidad"],
      "transition_from_prev": "cómo conecta con el shot anterior",
      "transition_to_next": "cómo conecta con el siguiente"
    }
  ],
  "qc_gates": {
    "identity_check_required": true,
    "lighting_match_required": true,
    "spatial_continuity_required": true,
    "recommended_keyframes_per_shot": 4
  },
  "total_duration_sec": 30,
  "production_notes": "notas para producción"
}

REGLAS:
1. Incluye MÍNIMO 3 shots por escena, máximo 12
2. Alterna tamaños de plano para variedad visual
3. Marca como "hero": true los shots más importantes (máximo 2 por escena)
4. ULTRA mode = más shots, más keyframes, más control
5. CINE mode = eficiencia, menos shots pero bien planificados
6. Incluye siempre ai_risks relevantes para cada shot
7. Conecta cada shot con el anterior/siguiente mediante transiciones

SHOT TYPES VÁLIDOS:
ExtremeWide, Wide, Full, MediumWide, Medium, MediumClose, CloseUp, ExtremeCloseUp, OverShoulder, POV, Insert, Cutaway, Establishing, TwoShot, GroupShot, ReactionShot, DetailMacro

CAMERA MOVEMENTS VÁLIDOS:
Static, Handheld_Controlled, Handheld_Raw, Steadicam, Gimbal, Pan_Left, Pan_Right, Tilt_Up, Tilt_Down, Dolly_In, Dolly_Out, Tracking_Follow, Tracking_Lead, Arc_Orbit_Left, Arc_Orbit_Right, Crane_Up, Crane_Down, Zoom_In, Zoom_Out, Whip_Pan, Rack_Focus

AI RISKS A CONSIDERAR:
Identity_Drift, Hand_Deform, Lighting_Flicker, Spatial_Jump, Clothing_Morph, Hair_Change, Eye_Direction, Mouth_Artifact, Background_Pop, Scale_Inconsistency`;

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

    const userPrompt = `
ESCENA A CUBRIR:
Slugline: ${scene.slugline}
Resumen: ${scene.summary}
Modo de Calidad: ${scene.quality_mode}
Hora del día: ${scene.time_of_day || 'No especificada'}

${scene.beats?.length ? `BEATS DE LA ESCENA:
${scene.beats.map(b => `${b.index}. ${b.action}${b.emotion ? ` (${b.emotion})` : ''}`).join('\n')}` : ''}

PERSONAJES EN LA ESCENA:
${characters.map(c => `- ${c.name}${c.has_refs ? ' (✓ refs disponibles)' : ' (⚠ sin refs)'}`).join('\n')}

${location ? `LOCALIZACIÓN: ${location.name}${location.has_refs ? ' (✓ refs disponibles)' : ' (⚠ sin refs)'}` : ''}

${stylePack ? `STYLE PACK:
- Sistema de cámara: ${stylePack.camera_system || 'No especificado'}
- Estilo de lente: ${stylePack.lens_style || 'No especificado'}
${stylePack.forbidden_rules?.length ? `- PROHIBIDO: ${(stylePack.forbidden_rules as string[]).join(', ')}` : ''}` : ''}

${previousSceneContext ? `CONTEXTO ESCENA ANTERIOR: ${previousSceneContext}` : ''}
${nextSceneContext ? `CONTEXTO ESCENA SIGUIENTE: ${nextSceneContext}` : ''}

${existingShots?.length ? `SHOTS EXISTENTES (no regenerar):
${existingShots.map(s => `Shot ${s.shot_no}: ${s.shot_type}`).join('\n')}` : ''}

IDIOMA DE RESPUESTA: ${language || 'es-ES'}

Genera una propuesta de shots cinematográficos profesionales para cubrir esta escena.
Considera los riesgos de generación por IA y proporciona QC gates apropiados.`;

    console.log('Generating shot suggestions for scene:', scene.slugline);

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
      console.error('AI Gateway error:', response.status, errorText);
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
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        shotData = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      console.error('JSON parse error:', parseError);
      // Return a minimal valid response
      shotData = {
        scene_analysis: { emotional_arc: 'Unknown', visual_themes: [], continuity_concerns: [], recommended_coverage: 'Standard' },
        shots: [],
        qc_gates: { identity_check_required: true, lighting_match_required: true, spatial_continuity_required: true, recommended_keyframes_per_shot: 4 },
        total_duration_sec: 0,
        production_notes: 'Error parsing AI response',
        raw_response: content
      };
    }

    console.log('Shot suggestions generated:', shotData.shots?.length || 0, 'shots');

    return new Response(
      JSON.stringify({
        success: true,
        ...shotData
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in shot-suggest:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
