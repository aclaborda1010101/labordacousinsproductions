import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AudioDesignRequest {
  projectId: string;
  targetType: 'shot' | 'scene' | 'location';
  targetId: string;
  location?: {
    id: string;
    name: string;
    type: string;
    profile_json?: any;
  };
  scene?: {
    id: string;
    slugline: string;
    summary: string;
    mood: string;
  };
  shot?: {
    id: string;
    duration_sec: number;
    blocking_description: string;
    actions: string[];
  };
  usePresets?: boolean;
  language?: string;
}

const SYSTEM_PROMPT = `Eres SOUND_DESIGNER: diseñador de sonido profesional de cine.

TU MISIÓN: Crear capas de audio profesionales para producción cinematográfica.

REGLAS OBLIGATORIAS:
1. Room Tone: SIEMPRE presente, describe la "firma sonora" del espacio
2. Ambience: MÍNIMO 2 capas (ej: ciudad lejana + viento cercano)
3. Foley: MÍNIMO 2 capas (ej: pasos + ropa)
4. Mix Notes: instrucciones técnicas de mezcla

OUTPUT JSON:
{
  "room_tone": {
    "description": "Large warehouse reverb with 2.5 second decay, low rumble from distant machinery",
    "frequency_profile": "Low rumble (60-120Hz), mid-range emptiness (500Hz-2kHz), natural decay",
    "reverb_size": "large|medium|small|none",
    "decay_time_seconds": 2.5
  },
  "ambience_layers": [
    {
      "layer": 1,
      "description": "Distant city traffic hum",
      "volume": "low|medium|high",
      "panning": "centered|stereo_wide|left|right",
      "loop": true,
      "fade_behavior": "constant|swell|pulse"
    },
    {
      "layer": 2,
      "description": "Wind through broken windows, occasional gusts",
      "volume": "low",
      "panning": "stereo_wide",
      "loop": true,
      "fade_behavior": "swell"
    }
  ],
  "foley_layers": [
    {
      "layer": 1,
      "description": "Heavy boots on concrete: deliberate heel-toe pattern",
      "timing": ["0.0s", "0.8s", "3.0s", "3.8s"],
      "volume": "medium",
      "sync_to_action": "character_footsteps",
      "variation_notes": "Each step slightly different weight, realistic human variation"
    },
    {
      "layer": 2,
      "description": "Tactical vest fabric rustle with each movement",
      "timing": "continuous_during_movement",
      "volume": "low",
      "sync_to_action": "character_body_movement",
      "variation_notes": "Subtle, not overpowering"
    }
  ],
  "mix_notes": {
    "dynamics": "Wide dynamic range: very quiet ambience with sudden loud footsteps for impact",
    "eq": "Roll off below 60Hz to avoid rumble, boost 1-3kHz for footstep clarity",
    "reverb": "Natural warehouse reverb, no artificial enhancement",
    "compression": "Minimal compression to preserve dynamic range",
    "special_notes": "Keep background very quiet to emphasize isolation and tension"
  },
  "assumptions": ["Assumed warehouse is mostly empty based on context"],
  "missing_info": []
}

IMPORTANTE:
- Describe sonidos específicos, no genéricos
- Timing preciso para foley sincronizado con acción
- Mix notes técnicas y ejecutables
- NO uses términos vagos como "sonido ambiente", sé específico`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const request: AudioDesignRequest = await req.json();
    const { projectId, targetType, targetId, location, scene, shot, usePresets, language } = request;

    console.log(`Audio design request for ${targetType} ${targetId}`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // If usePresets, try to auto-fill from presets library
    if (usePresets && location) {
      console.log('Attempting to use presets...');
      const { data: presets } = await supabase
        .from('audio_presets')
        .select('*')
        .in('category', ['room_tone', 'ambience', 'foley'])
        .limit(20);

      if (presets && presets.length > 0) {
        const roomTone = presets.find(p => 
          p.category === 'room_tone' && 
          p.tags?.some((t: string) => location.type?.toLowerCase().includes(t))
        );

        const ambiences = presets.filter(p => 
          p.category === 'ambience' && 
          p.tags?.some((t: string) => 
            location.type?.toLowerCase().includes(t) || 
            location.name?.toLowerCase().includes(t)
          )
        ).slice(0, 2);

        const foleys = presets.filter(p => p.category === 'foley').slice(0, 2);

        if (roomTone && ambiences.length >= 2 && foleys.length >= 2) {
          const audioLayer = {
            room_tone: roomTone.preset_data,
            ambience_layers: ambiences.map((a, i) => ({
              layer: i + 1,
              ...a.preset_data,
              description: a.description
            })),
            foley_layers: foleys.map((f, i) => ({
              layer: i + 1,
              ...f.preset_data,
              description: f.description
            })),
            mix_notes: {
              dynamics: "Balanced",
              eq: "Standard frequency response",
              reverb: "Match room tone",
              compression: "Light"
            }
          };

          const insertData: any = {
            project_id: projectId,
            room_tone: audioLayer.room_tone,
            ambience_layers: audioLayer.ambience_layers,
            foley_layers: audioLayer.foley_layers,
            mix_notes: audioLayer.mix_notes,
            validated: true
          };

          if (targetType === 'shot') insertData.shot_id = targetId;
          else if (targetType === 'scene') insertData.scene_id = targetId;
          else if (targetType === 'location') insertData.location_id = targetId;

          const { data: savedLayer, error } = await supabase
            .from('audio_layers')
            .insert(insertData)
            .select()
            .single();

          if (error) throw error;

          console.log('Audio layer created from presets');

          return new Response(JSON.stringify({
            success: true,
            audioLayer: savedLayer,
            method: 'presets'
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }
    }

    // Use AI to generate custom audio design
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    const userPrompt = `
GENERAR AUDIO PARA: ${targetType.toUpperCase()}

${location ? `LOCALIZACIÓN:
- Nombre: ${location.name}
- Tipo: ${location.type}
${location.profile_json ? `- Detalles: ${JSON.stringify(location.profile_json).substring(0, 200)}` : ''}
` : ''}

${scene ? `ESCENA:
- Slugline: ${scene.slugline}
- Resumen: ${scene.summary}
- Mood: ${scene.mood}
` : ''}

${shot ? `SHOT:
- Duración: ${shot.duration_sec}s
- Blocking: ${shot.blocking_description}
- Acciones: ${shot.actions.join(', ')}
` : ''}

IDIOMA: ${language || 'es-ES'}

Genera un diseño de audio PROFESIONAL con:
- Room Tone específico para este espacio
- Mínimo 2 capas de Ambience (fondo lejano + cercano)
- Mínimo 2 capas de Foley (acciones + movimientos)
- Mix Notes técnicas

Sé ESPECÍFICO: no "sonido de ciudad", sino "tráfico lejano en autopista a 2km con claxons ocasionales".
`;

    console.log('Generating audio design with AI...');

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
      const errorText = await response.text();
      console.error('AI API error:', response.status, errorText);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`AI request failed: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    console.log('AI response received, parsing JSON...');

    // Parse JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('No JSON found in response:', content);
      throw new Error('No JSON found in AI response');
    }

    const audioDesign = JSON.parse(jsonMatch[0]);

    // Validate minimum requirements
    const ambienceCount = audioDesign.ambience_layers?.length || 0;
    const foleyCount = audioDesign.foley_layers?.length || 0;

    if (ambienceCount < 2) {
      throw new Error('AI generated less than 2 ambience layers');
    }
    if (foleyCount < 2) {
      throw new Error('AI generated less than 2 foley layers');
    }
    if (!audioDesign.room_tone) {
      throw new Error('AI did not generate room tone');
    }

    // Save to DB
    const insertData: any = {
      project_id: projectId,
      room_tone: audioDesign.room_tone,
      ambience_layers: audioDesign.ambience_layers,
      foley_layers: audioDesign.foley_layers,
      mix_notes: audioDesign.mix_notes,
      validated: true
    };

    if (targetType === 'shot') insertData.shot_id = targetId;
    else if (targetType === 'scene') insertData.scene_id = targetId;
    else if (targetType === 'location') insertData.location_id = targetId;

    const { data: savedLayer, error } = await supabase
      .from('audio_layers')
      .insert(insertData)
      .select()
      .single();

    if (error) throw error;

    // Update shot reference if applicable
    if (targetType === 'shot') {
      await supabase
        .from('shots')
        .update({ audio_layer_id: savedLayer.id })
        .eq('id', targetId);
    }

    console.log('Audio design saved successfully:', savedLayer.id);

    return new Response(JSON.stringify({
      success: true,
      audioLayer: savedLayer,
      method: 'ai_generated',
      assumptions: audioDesign.assumptions || [],
      missing_info: audioDesign.missing_info || []
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Audio design error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
