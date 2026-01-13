import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { v3RequireAuth, v3RequireProjectAccess } from "../_shared/v3-enterprise.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SYSTEM_PROMPT = `Eres un experto en diseño de personajes para producción cinematográfica. 
Tu tarea es generar una estructura JSON de "Visual DNA" con atributos físicos ESPECÍFICOS y MEDIBLES para generación consistente de imágenes con IA.

IMPORTANTE: Genera valores CONCRETOS, no vagos. Por ejemplo:
- ✅ "age_exact": 42 (no "40-50")
- ✅ "height_cm": 178 (no "alto")
- ✅ "color_hex": "#6B5B3D" (no "marrón")

Responde SOLO con el JSON, sin explicaciones adicionales.`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authResult = await v3RequireAuth(req);
    if (authResult instanceof Response) {
      return authResult;
    }
    const auth = authResult;

    const { characterId, characterName, projectId } = await req.json();

    // Validate that at least one identifier is provided
    if (!characterId && !characterName) {
      return new Response(JSON.stringify({
        error: 'CHARACTER_IDENTIFIER_MISSING',
        message: 'Se requiere characterId o characterName',
        hint: 'Proporciona characterId (UUID) o characterName + projectId',
      }), { 
        status: 400, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

    let character = null;

    // 1. Try to find by characterId first (primary lookup)
    if (characterId) {
      const { data } = await supabaseAdmin
        .from('characters')
        .select('*')
        .eq('id', characterId)
        .single();
      character = data;
      
      if (character) {
        console.log(`[generate-visual-dna] Found character by ID: ${character.name}`);
      }
    }

    // 2. Fallback: search by name + projectId (case-insensitive)
    if (!character && characterName && projectId) {
      const normalizedName = characterName.trim().toLowerCase();
      console.log(`[generate-visual-dna] Searching by name: "${normalizedName}" in project ${projectId}`);
      
      const { data } = await supabaseAdmin
        .from('characters')
        .select('*')
        .eq('project_id', projectId)
        .ilike('name', `%${normalizedName}%`)
        .maybeSingle();
      character = data;
      
      if (character) {
        console.log(`[generate-visual-dna] Found character by name fallback: ${character.name}`);
      }
    }

    // 3. Return 404 with helpful payload if not found
    if (!character) {
      console.warn(`[generate-visual-dna] Character not found`, { characterId, characterName, projectId });
      return new Response(JSON.stringify({
        error: 'CHARACTER_NOT_FOUND',
        characterId: characterId || null,
        characterName: characterName || null,
        projectId: projectId || null,
        hint: 'Asegúrate de que el personaje existe en la Bible del proyecto. Usa "Crear personajes desde outline" si aún no existen.',
        actionable: true,
        suggestedAction: 'materialize_characters',
      }), { 
        status: 404, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    const accessResult = await v3RequireProjectAccess(auth, character.project_id);
    if (accessResult instanceof Response) {
      return accessResult;
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    // Use the actual character name from DB (not the potentially partial search term)
    const finalCharacterName = character.name;

    const userPrompt = `Genera un Visual DNA completo para este personaje:

NOMBRE: ${finalCharacterName}
BIOGRAFÍA: ${character.bio || 'No proporcionada'}
ROL: ${character.role || 'No especificado'}
TIPO: ${character.character_role || 'protagonist'}
ARCO: ${character.arc || 'No especificado'}

Genera el JSON con esta estructura exacta (rellena todos los campos con valores específicos):
{
  "physical_identity": {
    "age_exact": number,
    "biological_sex": "male"|"female",
    "gender_presentation": "masculine"|"feminine"|"androgynous",
    "ethnicity": { "primary": string, "secondary": string, "skin_tone": string },
    "height_cm": number,
    "body_type": { "build": string, "musculature": string, "weight_appearance": string, "posture": string }
  },
  "face": {
    "shape": string,
    "eyes": { "color": string, "color_hex": string, "shape": string, "size": string, "distance": string, "distinctive_features": string[] },
    "eyebrows": { "thickness": string, "shape": string, "color": string },
    "nose": { "bridge": string, "shape": string, "width": string, "distinctive_features": string[] },
    "mouth": { "lip_fullness": string, "lip_shape": string, "lip_color": string },
    "jaw_chin": { "jaw_shape": string, "chin": string, "jawline_definition": string },
    "cheekbones": { "prominence": string, "shape": string },
    "forehead": { "height": string, "width": string },
    "distinctive_marks": {
      "scars": [],
      "moles": [],
      "wrinkles": { "forehead": string, "eyes_crows_feet": string, "nasolabial_folds": string, "other": string[] }
    }
  },
  "hair": {
    "length": string,
    "texture": string,
    "thickness": string,
    "color": { "base": string, "highlights": string[], "color_hex": string },
    "style": string,
    "distinctive_features": string[],
    "facial_hair": { "type": string, "length_mm": number, "density": string, "color": string, "grooming": string, "distinctive_features": string[] }
  },
  "skin": { "texture": string, "condition": string, "sun_exposure": string, "distinctive_features": string[] },
  "hands": { "size": string, "fingers": string, "skin_texture": string, "nails": { "length": string, "condition": string }, "distinctive_features": string[] },
  "voice": { "pitch": string, "tone": string, "accent": string, "speech_pattern": string, "distinctive_features": string[] },
  "movement": { "gait": string, "posture_default": string, "gestures": string[], "tics_habits": string[] },
  "visual_references": {
    "celebrity_likeness": { "primary": { "name": string, "percentage": number }, "secondary": { "name": string, "percentage": number }, "combination_note": string },
    "art_style": "photorealistic",
    "era_reference": string
  }
}`;

    console.log('[generate-visual-dna] Calling Lovable AI Gateway...', {
      characterId: character.id,
      characterName: finalCharacterName,
      userId: auth.userId,
    });

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
        temperature: 0, // Deterministic for consistent JSON
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[generate-visual-dna] Lovable AI Gateway error:', response.status, errorText);

      if (response.status === 429) {
        return new Response(JSON.stringify({ 
          error: 'RATE_LIMIT_EXCEEDED',
          message: 'Límite de peticiones excedido. Inténtalo más tarde.',
          actionable: true,
        }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ 
          error: 'PAYMENT_REQUIRED',
          message: 'Se requieren créditos adicionales.',
          actionable: true,
        }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      throw new Error(`AI Gateway error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    console.log('[generate-visual-dna] Received response from AI, parsing JSON...');

    let visualDNA;
    try {
      // Try to extract JSON from markdown code blocks or raw content
      const jsonMatch = content?.match(/```(?:json)?\s*([\s\S]*?)```/) || content?.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? ((jsonMatch as any)[1] || (jsonMatch as any)[0]) : content;
      visualDNA = JSON.parse((jsonStr || '').trim());
      console.log('[generate-visual-dna] Visual DNA parsed successfully');
    } catch (e) {
      console.error('[generate-visual-dna] JSON parse error:', e);
      console.error('[generate-visual-dna] Raw content:', content?.substring(0, 1000));
      
      return new Response(JSON.stringify({
        error: 'INVALID_JSON_RESPONSE',
        message: 'El modelo no devolvió JSON válido. Intenta de nuevo.',
        rawSnippet: content?.substring(0, 200),
        actionable: true,
      }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        visualDNA,
        characterId: character.id,
        characterName: finalCharacterName,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[generate-visual-dna] Error:', error);
    return new Response(
      JSON.stringify({ 
        error: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Error desconocido',
        actionable: false,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
