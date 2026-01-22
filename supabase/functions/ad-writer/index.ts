import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { logGenerationCost, extractUserId } from "../_shared/cost-logging.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============================================================================
// AD-WRITER: Specialized Edge Function for Advertising Content Generation
// ============================================================================
// Unlike narrative scripts, ads are BEAT-MAPPED to exact temporal positions
// with brand constraints and conversion/awareness objectives.
// ============================================================================

interface AdWriterRequest {
  projectId: string;
  adType: '15s' | '30s' | '60s' | '90s';
  objective: 'awareness' | 'conversion' | 'engagement' | 'brand';
  product: {
    name: string;
    category: string;
    tagline?: string;
    keyBenefits: string[];
    targetAudience?: string;
  };
  brandRules?: {
    tone: string;
    mustInclude?: string[];
    mustAvoid?: string[];
    colorPalette?: string[];
    logoPlacement?: 'start' | 'end' | 'both' | 'subtle';
  };
  style?: {
    visualStyle?: string;
    referenceAds?: string[];
    musicStyle?: string;
    pacing?: 'slow' | 'medium' | 'fast' | 'dynamic';
  };
  language?: string;
}

interface AdBeat {
  beat_type: 'hook' | 'problem' | 'solution' | 'benefit' | 'social_proof' | 'cta' | 'logo_reveal' | 'product_shot';
  timestamp_start_sec: number;
  timestamp_end_sec: number;
  duration_sec: number;
  shot_type: string;
  camera_movement?: string;
  description: string;
  text_overlay?: string;
  voiceover?: string;
  sound_design: string;
  visual_hook: string;
  product_visible: boolean;
}

interface AdResult {
  duration_sec: number;
  title: string;
  campaign_tagline: string;
  target_platform: string[];
  beats: AdBeat[];
  music_cue: string;
  total_voiceover_text: string;
  brand_safety_score: number;
  cta_text: string;
  cta_timing_sec: number;
}

// Beat templates by ad duration - defines the temporal structure
const AD_BEAT_TEMPLATES: Record<string, { beats: Array<{ type: AdBeat['beat_type']; duration_range: [number, number] }> }> = {
  '15s': {
    beats: [
      { type: 'hook', duration_range: [2, 3] },
      { type: 'benefit', duration_range: [4, 6] },
      { type: 'product_shot', duration_range: [3, 4] },
      { type: 'cta', duration_range: [3, 4] },
    ]
  },
  '30s': {
    beats: [
      { type: 'hook', duration_range: [3, 5] },
      { type: 'problem', duration_range: [4, 6] },
      { type: 'solution', duration_range: [5, 7] },
      { type: 'benefit', duration_range: [5, 7] },
      { type: 'cta', duration_range: [4, 5] },
    ]
  },
  '60s': {
    beats: [
      { type: 'hook', duration_range: [3, 5] },
      { type: 'problem', duration_range: [8, 12] },
      { type: 'solution', duration_range: [10, 15] },
      { type: 'benefit', duration_range: [10, 12] },
      { type: 'social_proof', duration_range: [8, 10] },
      { type: 'product_shot', duration_range: [5, 8] },
      { type: 'cta', duration_range: [5, 8] },
    ]
  },
  '90s': {
    beats: [
      { type: 'hook', duration_range: [5, 8] },
      { type: 'problem', duration_range: [12, 18] },
      { type: 'solution', duration_range: [15, 20] },
      { type: 'benefit', duration_range: [15, 18] },
      { type: 'social_proof', duration_range: [10, 15] },
      { type: 'product_shot', duration_range: [8, 10] },
      { type: 'logo_reveal', duration_range: [3, 5] },
      { type: 'cta', duration_range: [6, 10] },
    ]
  }
};

// Shot type recommendations by beat type
const SHOT_RECOMMENDATIONS: Record<AdBeat['beat_type'], string[]> = {
  hook: ['extreme_close_up', 'drone_reveal', 'whip_pan', 'slow_motion_impact'],
  problem: ['medium_shot', 'over_shoulder', 'pov', 'handheld_documentary'],
  solution: ['product_hero', 'demonstration', 'before_after_split', 'macro_detail'],
  benefit: ['lifestyle_wide', 'user_in_context', 'emotional_close_up', 'montage'],
  social_proof: ['testimonial_frame', 'user_generated_style', 'split_screen_reviews'],
  cta: ['product_packshot', 'logo_lockup', 'text_card', 'animated_end_card'],
  logo_reveal: ['logo_animation', 'product_to_logo', 'cinematic_reveal'],
  product_shot: ['360_turntable', 'hero_lighting', 'in_use_detail', 'beauty_shot']
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID().slice(0, 8);
  const startTime = Date.now();

  try {
    // Auth validation
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ code: 401, message: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ code: 401, message: 'Invalid JWT' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[AD-WRITER][${requestId}] User: ${user.id}`);

    const body = await req.json() as AdWriterRequest;
    const { 
      projectId, 
      adType, 
      objective, 
      product, 
      brandRules, 
      style,
      language = 'es-ES' 
    } = body;

    // Input validation
    const missingFields: string[] = [];
    if (!projectId) missingFields.push('projectId');
    if (!adType || !['15s', '30s', '60s', '90s'].includes(adType)) missingFields.push('adType (15s|30s|60s|90s)');
    if (!objective) missingFields.push('objective');
    if (!product?.name) missingFields.push('product.name');
    if (!product?.keyBenefits?.length) missingFields.push('product.keyBenefits');

    if (missingFields.length > 0) {
      return new Response(
        JSON.stringify({
          error: 'MISSING_INPUT',
          missing: missingFields,
          detail: 'Completa los datos del producto antes de generar el anuncio',
          requestId
        }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    // Get beat template for this ad duration
    const template = AD_BEAT_TEMPLATES[adType];
    const targetDuration = parseInt(adType.replace('s', ''));

    console.log(`[AD-WRITER][${requestId}] Generating ${adType} ad for "${product.name}" (${objective})`);

    // Build specialized ad prompt
    const systemPrompt = `Eres un director creativo de publicidad de élite especializado en contenido de alto impacto.

CONTEXTO CRÍTICO:
- Los anuncios NO son narrativas cinematográficas - son MÁQUINAS DE CONVERSIÓN
- Cada segundo debe justificar su existencia con impacto medible
- El ritmo es más rápido que el cine: cortes cada 2-4 segundos típicamente
- El producto/marca debe ser memorable después de una sola visualización

ESTRUCTURA TEMPORAL OBLIGATORIA para ${adType}:
${template.beats.map((b, i) => `Beat ${i + 1}: ${b.type.toUpperCase()} (${b.duration_range[0]}-${b.duration_range[1]}s)`).join('\n')}

OBJETIVO: ${objective.toUpperCase()}
${objective === 'conversion' ? '- CTA debe ser claro, urgente, con acción específica' : ''}
${objective === 'awareness' ? '- Enfócate en memorabilidad emocional sobre CTA' : ''}
${objective === 'engagement' ? '- Crea curiosidad que invite a interactuar' : ''}
${objective === 'brand' ? '- Prioriza valores de marca sobre producto específico' : ''}

REGLAS DE MARCA:
${brandRules?.tone ? `- Tono: ${brandRules.tone}` : '- Tono: profesional pero accesible'}
${brandRules?.mustInclude?.length ? `- DEBE incluir: ${brandRules.mustInclude.join(', ')}` : ''}
${brandRules?.mustAvoid?.length ? `- PROHIBIDO: ${brandRules.mustAvoid.join(', ')}` : ''}
${brandRules?.logoPlacement ? `- Logo: ${brandRules.logoPlacement}` : '- Logo: al final'}

SHOT TYPES RECOMENDADOS POR BEAT:
${Object.entries(SHOT_RECOMMENDATIONS).map(([beat, shots]) => `${beat}: ${shots.slice(0, 3).join(', ')}`).join('\n')}

IMPORTANTE:
- Los tiempos DEBEN sumar EXACTAMENTE ${targetDuration} segundos
- Cada beat debe tener timestamp_start_sec y timestamp_end_sec precisos
- No uses lenguaje cinematográfico genérico - sé específico para publicidad
- El voiceover debe ser conciso y memorable

Responde usando la herramienta generate_ad.`;

    const userPrompt = `Genera un anuncio de ${adType} para:

PRODUCTO: ${product.name}
CATEGORÍA: ${product.category}
${product.tagline ? `TAGLINE: ${product.tagline}` : ''}
BENEFICIOS CLAVE:
${product.keyBenefits.map((b, i) => `${i + 1}. ${b}`).join('\n')}
${product.targetAudience ? `AUDIENCIA: ${product.targetAudience}` : ''}

ESTILO VISUAL: ${style?.visualStyle || 'moderno y premium'}
${style?.referenceAds?.length ? `REFERENCIAS: ${style.referenceAds.join(', ')}` : ''}
MÚSICA: ${style?.musicStyle || 'energética y moderna'}
RITMO: ${style?.pacing || 'dynamic'}

IDIOMA: ${language}

GENERA:
- Estructura beat-by-beat con tiempos exactos
- Cada beat con shot_type específico
- Voiceover y text overlays donde aplique
- CTA final impactante
- Brand safety score (0-100)

Los tiempos DEBEN sumar EXACTAMENTE ${targetDuration} segundos.`;

    const toolSchema = {
      name: "generate_ad",
      description: `Genera un anuncio publicitario de ${adType} con estructura beat-by-beat`,
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Título interno del anuncio" },
          campaign_tagline: { type: "string", description: "Tagline de la campaña" },
          target_platform: {
            type: "array",
            items: { type: "string" },
            description: "Plataformas objetivo: TV, YouTube, Instagram, TikTok, etc."
          },
          music_cue: { type: "string", description: "Descripción del estilo musical" },
          total_voiceover_text: { type: "string", description: "Texto completo del voiceover" },
          cta_text: { type: "string", description: "Texto del call-to-action" },
          cta_timing_sec: { type: "number", description: "Segundo donde aparece el CTA" },
          brand_safety_score: { 
            type: "number", 
            description: "Puntuación de seguridad de marca 0-100" 
          },
          beats: {
            type: "array",
            description: `Secuencia de beats que suman exactamente ${targetDuration} segundos`,
            items: {
              type: "object",
              properties: {
                beat_type: { 
                  type: "string",
                  enum: ["hook", "problem", "solution", "benefit", "social_proof", "cta", "logo_reveal", "product_shot"]
                },
                timestamp_start_sec: { type: "number" },
                timestamp_end_sec: { type: "number" },
                duration_sec: { type: "number" },
                shot_type: { type: "string" },
                camera_movement: { type: "string" },
                description: { type: "string" },
                text_overlay: { type: "string" },
                voiceover: { type: "string" },
                sound_design: { type: "string" },
                visual_hook: { type: "string" },
                product_visible: { type: "boolean" }
              },
              required: ["beat_type", "timestamp_start_sec", "timestamp_end_sec", "duration_sec", "shot_type", "description", "sound_design", "visual_hook", "product_visible"]
            }
          }
        },
        required: ["title", "campaign_tagline", "target_platform", "music_cue", "cta_text", "cta_timing_sec", "brand_safety_score", "beats"]
      }
    };

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        max_tokens: 4000,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        tools: [{ type: 'function', function: toolSchema }],
        tool_choice: { type: 'function', function: { name: 'generate_ad' } }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[AD-WRITER][${requestId}] AI error:`, response.status, errorText.slice(0, 500));

      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'RATE_LIMITED', detail: 'Intenta en unos segundos', requestId }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'CREDITS_EXHAUSTED', detail: 'Añade créditos a tu workspace', requestId }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      throw new Error(`AI Gateway error: ${response.status}`);
    }

    const data = await response.json();
    const toolCall = data?.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall?.function?.arguments) {
      throw new Error('No ad content generated');
    }

    let parsedAd;
    try {
      parsedAd = JSON.parse(toolCall.function.arguments);
    } catch {
      throw new Error('Failed to parse ad response');
    }

    // Validate total duration
    const totalDuration = parsedAd.beats?.reduce((sum: number, b: AdBeat) => sum + b.duration_sec, 0) || 0;
    const durationDiff = Math.abs(totalDuration - targetDuration);

    if (durationDiff > 1) {
      console.warn(`[AD-WRITER][${requestId}] Duration mismatch: got ${totalDuration}s, expected ${targetDuration}s`);
    }

    const adResult: AdResult = {
      duration_sec: targetDuration,
      ...parsedAd
    };

    const inputTokens = data?.usage?.prompt_tokens || 0;
    const outputTokens = data?.usage?.completion_tokens || 0;

    console.log(`[AD-WRITER][${requestId}] Generated: ${adResult.beats?.length || 0} beats, ${totalDuration}s total`);

    // Log cost
    const userId = extractUserId(req.headers.get('authorization'));
    if (userId) {
      await logGenerationCost({
        userId,
        projectId,
        slotType: 'ad',
        engine: 'lovable',
        model: 'google/gemini-3-flash-preview',
        durationMs: Date.now() - startTime,
        success: true,
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        category: 'other',
        metadata: {
          adType,
          objective,
          productName: product.name,
          beatsCount: adResult.beats?.length || 0,
          brandSafetyScore: adResult.brand_safety_score
        }
      });
    }

    // Save to narrative_state if format is 'ad'
    const { error: stateError } = await supabase
      .from('narrative_state')
      .upsert({
        project_id: projectId,
        format: 'ad',
        unit_type: 'ad',
        unit_ref: adType,
        current_phase: 'generated',
        narrative_goal: adResult.campaign_tagline,
        scenes_written_count: adResult.beats?.length || 0,
        hard_facts: {
          product: product.name,
          objective,
          cta: adResult.cta_text,
          duration: targetDuration
        }
      }, { onConflict: 'project_id,format,unit_type,unit_ref' });

    if (stateError) {
      console.warn(`[AD-WRITER][${requestId}] Failed to save state:`, stateError.message);
    }

    return new Response(
      JSON.stringify({
        success: true,
        ad: adResult,
        tokenUsage: { input: inputTokens, output: outputTokens },
        durationValidation: {
          target: targetDuration,
          actual: totalDuration,
          valid: durationDiff <= 1
        },
        requestId
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error(`[AD-WRITER][${requestId}] ERROR:`, error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
        requestId
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
