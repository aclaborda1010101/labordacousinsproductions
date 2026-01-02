import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// PROMPT-ENGINE v3 System Prompt - Deterministic Keyframe Generation with FULL CONTINUITY
const PROMPT_ENGINE_V3_SYSTEM = `Eres PROMPT-ENGINE v3 "NO-LOOSE-ENDS + FRAME GEOMETRY + CONTINUITY".
Sistema de especificación determinista para IA de imagen.

PRINCIPIO CENTRAL: Si un detalle puede variar, variará. Por tanto: todo lo relevante debe quedar definido.
PRINCIPIO DE CONTINUIDAD: Cada keyframe ES UNA CONTINUACIÓN del anterior, NO una nueva generación.

REGLAS ANTI-AMBIGÜEDAD (INNEGOCIABLES):
1) Prohibidas palabras vagas/subjetivas sin definición operacional: "bonito", "épico", "moderno", "vibes".
2) Prohibido "etc.", "y demás", "detalles", "similar a".
3) Nada se deja "a decisión del modelo". Si faltan datos: asigna DEFAULT concreto.
4) La escena debe ser reproducible: especifica posiciones, distancias, orientaciones.
5) Continuidad estricta por IDs de personajes y props.
6) Prohibido añadir gente extra, texto, logos, props no listados.

REGLAS DE CONTINUIDAD ENTRE KEYFRAMES:
1) El vestuario de cada personaje DEBE ser IDÉNTICO al keyframe anterior.
2) La iluminación DEBE mantener la misma dirección y temperatura de color.
3) Los props en escena DEBEN estar en posiciones coherentes con el movimiento.
4) Las posiciones de personajes deben evolucionar naturalmente (no saltos).
5) El fondo DEBE ser el mismo set/localización.
6) Si hay keyframe previo, tu prompt DEBE referenciar explícitamente sus elementos.

SAFE ZONES (para UI/texto de app):
- ui_top_pct: 12% zona superior reservada
- ui_bottom_pct: 18% zona inferior reservada  
- ui_side_pct: 6% márgenes laterales
- action_safe_pct: 10% zona segura general

CAMPOS OBLIGATORIOS EN TU RESPUESTA JSON:
{
  "prompt_text": "El prompt de imagen final, ultradetallado y determinista. DEBE incluir vestuario exacto, posiciones exactas, iluminación exacta.",
  "negative_prompt": "Lista de elementos prohibidos",
  "continuity_locks": {
    "wardrobe_description": "Descripción EXACTA del vestuario de cada personaje que NO debe cambiar",
    "lighting_setup": "Dirección y tipo de luz que NO debe cambiar",
    "background_elements": "Elementos del fondo que deben mantenerse"
  },
  "frame_geometry": {
    "boxes_percent": [
      {
        "id": "character_id o prop_id",
        "type": "character|prop",
        "bbox": {"x": 0-100, "y": 0-100, "w": 0-100, "h": 0-100},
        "anchor": "center|top_left|bottom_center",
        "must_stay_within_safe_zone": true
      }
    ],
    "gaze_direction_map": [
      {"character_id": "id", "gaze_target": "camera|other_character|prop", "gaze_angle_deg": 0}
    ]
  },
  "staging_snapshot": {
    "subject_positions": [
      {"character_id": "id", "x_m": 0, "y_m": 0, "facing_deg": 0, "distance_to_camera_m": 2}
    ]
  },
  "determinism": {
    "seed": null,
    "guidance": 7.5,
    "steps": 30
  },
  "negative_constraints": ["no text", "no watermark", "no logos", "no extra people", "no wardrobe change", "no lighting change", ...]
}

Genera el JSON completo sin explicaciones adicionales.`;

interface ShotDetails {
  focalMm?: number;
  cameraHeight?: string;
  lightingStyle?: string;
  viewerNotice?: string;
  aiRisk?: string;
  intention?: string;
  dialogueText?: string;
  effectiveMode?: 'CINE' | 'ULTRA';
}

interface PreviousKeyframeData {
  promptText?: string;
  frameGeometry?: unknown;
  stagingSnapshot?: unknown;
}

interface KeyframeRequest {
  shotId: string;
  sceneDescription: string;
  shotType: string;
  duration: number;
  frameType: 'initial' | 'intermediate' | 'final';
  timestampSec: number;
  characters: Array<{
    id: string;
    name: string;
    token?: string;
    referenceUrl?: string;
  }>;
  location?: {
    id: string;
    name: string;
    token?: string;
    referenceUrl?: string;
  };
  cameraMovement?: string;
  blocking?: string;
  shotDetails?: ShotDetails;
  previousKeyframeUrl?: string;
  previousKeyframeData?: PreviousKeyframeData;
  stylePack?: {
    description?: string;
    colorPalette?: string[];
    lightingRules?: string[];
    aspectRatio?: string;
  };
}

async function generateKeyframePrompt(request: KeyframeRequest): Promise<{
  prompt_text: string;
  negative_prompt: string;
  continuity_locks: Record<string, string>;
  frame_geometry: Record<string, unknown>;
  staging_snapshot: Record<string, unknown>;
  determinism: Record<string, unknown>;
  negative_constraints: string[];
}> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) {
    throw new Error("LOVABLE_API_KEY is not configured");
  }

  // Build comprehensive prompt with all shot details
  const shotDetails = request.shotDetails || {};
  
  // Build continuity section if we have previous keyframe
  let continuitySection = '';
  if (request.previousKeyframeData?.promptText) {
    continuitySection = `
KEYFRAME ANTERIOR (MANTENER CONTINUIDAD ESTRICTA):
Prompt anterior: ${request.previousKeyframeData.promptText}
${request.previousKeyframeData.stagingSnapshot ? `Posiciones anteriores: ${JSON.stringify(request.previousKeyframeData.stagingSnapshot)}` : ''}

REGLA CRÍTICA: Este keyframe es ${request.timestampSec}s después. Los personajes deben:
1. Llevar EXACTAMENTE la misma ropa
2. Estar en el MISMO set/localización
3. Haber evolucionado sus posiciones de forma natural (no saltos)
4. Mantener la misma iluminación
`;
  }

  const userPrompt = `Genera un keyframe para esta escena:

CONTEXTO COMPLETO DEL PLANO:
- Escena: ${request.sceneDescription}
- Tipo de plano: ${request.shotType}
- Duración total: ${request.duration}s
- Tipo de frame: ${request.frameType} (timestamp: ${request.timestampSec}s)
- Cámara: ${request.cameraMovement || 'Static'}
- Focal: ${shotDetails.focalMm || 35}mm
- Altura cámara: ${shotDetails.cameraHeight || 'EyeLevel'}
- Iluminación: ${shotDetails.lightingStyle || 'Naturalistic_Daylight'}
- Blocking: ${request.blocking || 'No especificado'}
${shotDetails.dialogueText ? `- Diálogo: "${shotDetails.dialogueText}"` : ''}
${shotDetails.intention ? `- Intención del plano: ${shotDetails.intention}` : ''}
${shotDetails.viewerNotice ? `- ¿Qué debe notar el espectador?: ${shotDetails.viewerNotice}` : ''}
${shotDetails.aiRisk ? `- Riesgo IA a evitar: ${shotDetails.aiRisk}` : ''}
- Modo calidad: ${shotDetails.effectiveMode || 'CINE'}

PERSONAJES EN ESCENA:
${request.characters.map(c => `- ${c.name} (ID: ${c.id})${c.token ? ` [Token: ${c.token}]` : ''}`).join('\n')}

LOCALIZACIÓN:
${request.location ? `- ${request.location.name} (ID: ${request.location.id})${request.location.token ? ` [Token: ${request.location.token}]` : ''}` : 'No especificada'}

${request.stylePack ? `ESTILO VISUAL:
- ${request.stylePack.description || 'Hyperreal commercial'}
- Paleta: ${request.stylePack.colorPalette?.join(', ') || 'Natural'}
- Iluminación: ${request.stylePack.lightingRules?.join(', ') || 'Soft cinematic'}
- Aspect ratio: ${request.stylePack.aspectRatio || '16:9'}` : ''}

${continuitySection}

${request.previousKeyframeUrl ? `IMAGEN DE REFERENCIA: Hay un keyframe previo disponible. DEBES mantener:
- Mismo vestuario exacto para cada personaje
- Misma iluminación (dirección, color, intensidad)
- Mismo set/decorado
- Evolución natural de posiciones` : ''}

Genera el JSON completo con prompt_text, negative_prompt, continuity_locks, frame_geometry, staging_snapshot, determinism, y negative_constraints.
El prompt_text DEBE ser ultra-específico sobre vestuario, posiciones y luz para garantizar continuidad.`;

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: PROMPT_ENGINE_V3_SYSTEM },
        { role: "user", content: userPrompt }
      ],
      response_format: { type: "json_object" }
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Prompt generation failed:", errorText);
    throw new Error(`Prompt generation failed: ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  
  if (!content) {
    throw new Error("No content in response");
  }

  try {
    return JSON.parse(content);
  } catch {
    console.error("Failed to parse JSON response:", content);
    // Provide defaults if parsing fails - with continuity info
    const defaultWardrobe = request.characters.map(c => `${c.name}: professional attire`).join('; ');
    return {
      prompt_text: `Cinematic ${request.shotType} shot, ${request.shotDetails?.focalMm || 35}mm lens, ${request.shotDetails?.cameraHeight || 'eye level'}. ${request.sceneDescription}. ${request.characters.map(c => c.name).join(', ')} in ${request.location?.name || 'the scene'}. ${request.shotDetails?.lightingStyle || 'Natural lighting'}. Professional film quality, 16:9 aspect ratio.`,
      negative_prompt: "text, watermark, logo, extra people, blurry, low quality, deformed, wardrobe change, lighting inconsistency",
      continuity_locks: {
        wardrobe_description: defaultWardrobe,
        lighting_setup: request.shotDetails?.lightingStyle || 'Natural soft light from left',
        background_elements: request.location?.name || 'Interior set'
      },
      frame_geometry: {},
      staging_snapshot: {},
      determinism: { guidance: 7.5, steps: 30 },
      negative_constraints: ["no text", "no watermark", "no logos", "no extra people", "no wardrobe change", "no lighting change"]
    };
  }
}

async function generateImageWithNanoBananaPro(
  prompt: string,
  negativePrompt: string,
  referenceImages: string[] = []
): Promise<string> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) {
    throw new Error("LOVABLE_API_KEY is not configured");
  }

  console.log("Generating keyframe image with nano-banana-pro (Gemini 3 Pro Image)...");
  console.log("Prompt:", prompt.substring(0, 200) + "...");

  // Build message content with optional reference images
  const content: Array<{ type: string; text?: string; image_url?: { url: string } }> = [
    {
      type: "text",
      text: `${prompt}\n\nIMPORTANT - NEGATIVE CONSTRAINTS (DO NOT include): ${negativePrompt}\n\nMAINTAIN STRICT CONTINUITY with any reference images provided.`
    }
  ];

  // Add reference images if provided (for consistency) - prioritize previous keyframe
  for (const refUrl of referenceImages.slice(0, 3)) {
    if (refUrl && refUrl.startsWith('http')) {
      content.push({
        type: "image_url",
        image_url: { url: refUrl }
      });
    }
  }

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3-pro-image-preview",
      messages: [
        {
          role: "user",
          content: content.length === 1 ? content[0].text : content
        }
      ],
      modalities: ["image", "text"]
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Image generation failed:", response.status, errorText);
    throw new Error(`Image generation failed: ${response.status}`);
  }

  const data = await response.json();
  const imageUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;

  if (!imageUrl) {
    console.error("No image in response:", JSON.stringify(data).substring(0, 500));
    throw new Error("No image generated");
  }

  console.log("Image generated successfully (base64 length:", imageUrl.length, ")");
  return imageUrl;
}

async function uploadImageToStorage(
  supabaseUrl: string,
  supabaseKey: string,
  base64Data: string,
  shotId: string,
  frameType: string,
  timestampSec: number
): Promise<string> {
  // Create a fresh client for storage operations
  const storageClient = createClient(supabaseUrl, supabaseKey);
  
  // Extract base64 content
  const base64Content = base64Data.replace(/^data:image\/\w+;base64,/, '');
  const binaryString = atob(base64Content);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  const fileName = `keyframes/${shotId}/${frameType}_${timestampSec}s_${Date.now()}.png`;

  const { data, error } = await storageClient.storage
    .from('renders')
    .upload(fileName, bytes, {
      contentType: 'image/png',
      upsert: true
    });

  if (error) {
    console.error("Storage upload error:", error);
    throw new Error(`Failed to upload image: ${error.message}`);
  }

  const { data: urlData } = storageClient.storage
    .from('renders')
    .getPublicUrl(data.path);

  return urlData.publicUrl;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const request: KeyframeRequest = await req.json();
    console.log("=== Generate Keyframe Request ===");
    console.log("Shot ID:", request.shotId);
    console.log("Frame type:", request.frameType, "at", request.timestampSec, "s");
    console.log("Characters:", request.characters.map(c => c.name).join(", "));
    console.log("Shot details:", JSON.stringify(request.shotDetails || {}));
    console.log("Has previous keyframe:", !!request.previousKeyframeUrl);

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Step 1: Generate deterministic prompt with PROMPT-ENGINE v3
    console.log("Step 1: Generating prompt with PROMPT-ENGINE v3 (with continuity)...");
    const promptData = await generateKeyframePrompt(request);
    console.log("Prompt generated:", promptData.prompt_text.substring(0, 150) + "...");
    console.log("Continuity locks:", JSON.stringify(promptData.continuity_locks || {}));

    // Step 2: Collect reference images for consistency
    // IMPORTANT: Previous keyframe comes FIRST for continuity
    const referenceImages: string[] = [];
    if (request.previousKeyframeUrl) {
      referenceImages.push(request.previousKeyframeUrl);
    }
    for (const char of request.characters) {
      if (char.referenceUrl) {
        referenceImages.push(char.referenceUrl);
      }
    }
    if (request.location?.referenceUrl) {
      referenceImages.push(request.location.referenceUrl);
    }

    // Step 3: Generate image with nano-banana-pro (Gemini 3 Pro Image)
    console.log("Step 2: Generating image with nano-banana-pro...");
    console.log("Reference images:", referenceImages.length);
    const imageBase64 = await generateImageWithNanoBananaPro(
      promptData.prompt_text,
      promptData.negative_prompt,
      referenceImages
    );

    // Step 4: Upload to storage
    console.log("Step 3: Uploading to storage...");
    const imageUrl = await uploadImageToStorage(
      supabaseUrl,
      supabaseKey,
      imageBase64,
      request.shotId,
      request.frameType,
      request.timestampSec
    );
    console.log("Image uploaded:", imageUrl);

    // Step 5: Save keyframe to database with continuity data
    console.log("Step 4: Saving keyframe to database...");
    const { data: keyframe, error: dbError } = await supabase
      .from('keyframes')
      .insert({
        shot_id: request.shotId,
        image_url: imageUrl,
        prompt_text: promptData.prompt_text,
        timestamp_sec: request.timestampSec,
        frame_type: request.frameType,
        frame_geometry: promptData.frame_geometry,
        staging_snapshot: promptData.staging_snapshot,
        negative_constraints: promptData.negative_constraints,
        determinism: promptData.determinism,
        locks: {
          negative_prompt: promptData.negative_prompt,
          continuity_locks: promptData.continuity_locks,
          characters: request.characters.map(c => c.id),
          location: request.location?.id,
          shot_details: request.shotDetails
        }
      })
      .select()
      .single();

    if (dbError) {
      console.error("Database error:", dbError);
      throw new Error(`Failed to save keyframe: ${dbError.message}`);
    }

    console.log("=== Keyframe generated successfully ===");
    return new Response(
      JSON.stringify({
        success: true,
        keyframe: {
          id: keyframe.id,
          imageUrl,
          timestampSec: request.timestampSec,
          frameType: request.frameType,
          promptText: promptData.prompt_text,
          continuityLocks: promptData.continuity_locks
        }
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Generate keyframe error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
