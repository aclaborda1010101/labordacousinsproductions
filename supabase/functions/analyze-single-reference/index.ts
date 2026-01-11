import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { parseJsonSafe } from "../_shared/llmJson.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AnalyzeRequest {
  characterId: string;
  imageUrl: string;
  characterName?: string;
}

/**
 * Simplified analysis for a single reference image.
 * Extracts Visual DNA from ONE closeup image and saves it to the database.
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { characterId, imageUrl, characterName }: AnalyzeRequest = await req.json();

    if (!characterId || !imageUrl) {
      return new Response(
        JSON.stringify({ error: 'Se requiere characterId e imageUrl' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY no está configurada');
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    console.log(`[analyze-single-reference] Analyzing reference for character ${characterId}`);
    console.log(`[analyze-single-reference] Image URL: ${imageUrl.substring(0, 80)}...`);

    // Call Gemini with vision to analyze the single reference image
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-pro',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Analiza esta imagen de referencia de un personaje llamado "${characterName || 'personaje'}" y extrae sus características visuales técnicas.

IMPORTANTE: Necesito una descripción TÉCNICA y PRECISA para que la IA mantenga el parecido al generar imágenes nuevas de este personaje.

Analiza y extrae:
1. EDAD: Edad exacta estimada (número)
2. GÉNERO: male/female
3. ETNICIDAD: Descripción precisa del origen étnico y tono de piel (con código HEX aproximado)
4. ROSTRO: Forma de cara, tipo de ojos (forma, color con HEX), nariz, boca, mandíbula
5. CABELLO: Color exacto (incluyendo canas si las hay), largo, textura, estilo
6. PIEL: Tono, textura, marcas distintivas
7. RASGOS DISTINTIVOS: Cicatrices, lunares, barba, etc.

Responde ÚNICAMENTE con un JSON válido con esta estructura:
{
  "physical_identity": {
    "age_exact": número,
    "biological_sex": "male" o "female",
    "ethnicity_description": "descripción",
    "skin_tone_hex": "#XXXXXX",
    "height_estimate_cm": número
  },
  "face": {
    "shape": "oval/round/square/heart/oblong",
    "eyes": {
      "color": "descripción",
      "color_hex": "#XXXXXX",
      "shape": "almond/round/hooded/etc"
    },
    "nose": { "description": "descripción" },
    "mouth": { "description": "descripción" },
    "jaw": { "shape": "descripción" },
    "facial_hair": { "type": "none/stubble/beard/mustache", "description": "detalle" }
  },
  "hair": {
    "color": "descripción incluyendo canas",
    "color_hex": "#XXXXXX",
    "grey_percentage": número de 0 a 100,
    "length": "short/medium/long",
    "texture": "straight/wavy/curly",
    "style": "descripción"
  },
  "skin": {
    "texture": "descripción",
    "distinctive_marks": ["lista de marcas"]
  },
  "technical_prompt_fragment": "Frase técnica de 1 línea para usar en prompts de generación, ej: '45 year old Caucasian male with olive skin, short dark hair with 20% grey, brown almond eyes, square jaw, light stubble'"
}`
              },
              {
                type: 'image_url',
                image_url: { url: imageUrl }
              }
            ]
          }
        ],
        temperature: 0.1,
        max_tokens: 2500,
        response_format: { type: 'json_object' }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI Gateway error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Límite de tasa alcanzado. Intenta en 1 minuto.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      throw new Error(`AI Gateway error: ${response.status}`);
    }

    const aiData = await response.json();
    const content = aiData.choices?.[0]?.message?.content ?? '';

    console.log(`[analyze-single-reference] Raw AI content length: ${content.length}`);
    console.log(`[analyze-single-reference] Raw AI content (first 500 chars):`, content.substring(0, 500));
    console.log(
      `[analyze-single-reference] Raw AI content (last 300 chars):`,
      content.substring(Math.max(0, content.length - 300))
    );

    const parsed = parseJsonSafe<any>(content, 'analyze-single-reference');

    if (!parsed.ok || !parsed.json) {
      console.error('[analyze-single-reference] Visual DNA parse failed', {
        warnings: parsed.warnings,
        rawSnippetHash: parsed.rawSnippetHash,
      });

      throw new Error(
        `No se pudo parsear el Visual DNA (${parsed.rawSnippetHash ?? 'nohash'}): ${parsed.warnings.join(', ')}`
      );
    }

    const visualDNA = parsed.json;

    console.log(`[analyze-single-reference] Visual DNA extracted:`, JSON.stringify(visualDNA).substring(0, 300));

    // Deactivate existing active versions
    await supabase
      .from('character_visual_dna')
      .update({ is_active: false })
      .eq('character_id', characterId);

    // Determine next version number
    const { data: maxVersion } = await supabase
      .from('character_visual_dna')
      .select('version')
      .eq('character_id', characterId)
      .order('version', { ascending: false })
      .limit(1);

    const nextVersion = (maxVersion?.[0]?.version || 0) + 1;

    // Insert new Visual DNA version
    const { error: dnaError } = await supabase.from('character_visual_dna').insert({
      character_id: characterId,
      visual_dna: visualDNA,
      continuity_lock: {
        never_change: [
          'physical_identity.age_exact',
          'physical_identity.skin_tone_hex',
          'face.shape',
          'face.eyes.color_hex',
          'hair.color',
          'hair.grey_percentage'
        ],
        must_avoid: [
          'different eye color',
          'different skin tone',
          'different age appearance',
          'different hair color or grey pattern'
        ],
        extracted_from_references: true,
        extraction_date: new Date().toISOString()
      },
      version: nextVersion,
      version_name: 'Auto-extracted from reference',
      is_active: true,
      approved: false
    });

    if (dnaError) {
      console.error('Error saving Visual DNA:', dnaError);
      throw dnaError;
    }

    // Create or update reference anchor
    const { data: existingAnchor } = await supabase
      .from('reference_anchors')
      .select('id')
      .eq('character_id', characterId)
      .eq('anchor_type', 'identity_primary')
      .maybeSingle();

    if (existingAnchor) {
      await supabase
        .from('reference_anchors')
        .update({
          image_url: imageUrl,
          is_active: true,
          approved: true,
          metadata: { 
            source: 'pack_builder_upload', 
            analyzed_at: new Date().toISOString(),
            visual_dna_version: nextVersion
          }
        })
        .eq('id', existingAnchor.id);
    } else {
      await supabase
        .from('reference_anchors')
        .insert({
          character_id: characterId,
          anchor_type: 'identity_primary',
          image_url: imageUrl,
          priority: 1,
          is_active: true,
          approved: true,
          metadata: { 
            source: 'pack_builder_upload', 
            analyzed_at: new Date().toISOString(),
            visual_dna_version: nextVersion
          }
        });
    }

    console.log(`[analyze-single-reference] Analysis complete for character ${characterId}, version ${nextVersion}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        visualDNA,
        version: nextVersion,
        technicalPrompt: visualDNA.technical_prompt_fragment,
        message: `Visual DNA v${nextVersion} extraído de referencia`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in analyze-single-reference:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Error desconocido' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
