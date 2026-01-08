import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAuthOrDemo, requireProjectAccess, authErrorResponse } from "../_shared/auth.ts";
import { logGenerationCost, extractUserId } from "../_shared/cost-logging.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-demo-key",
};

// PROMPT-ENGINE v4 System Prompt - Deterministic Keyframe Generation with FULL CONTINUITY + ANTI-AI TELLS
const PROMPT_ENGINE_V4_SYSTEM = `Eres PROMPT-ENGINE v4 "NO-LOOSE-ENDS + FRAME GEOMETRY + CONTINUITY + ANTI-AI".
Sistema de especificación determinista para IA de imagen con calidad cinematográfica profesional.

PRINCIPIO CENTRAL: Si un detalle puede variar, variará. Por tanto: todo lo relevante debe quedar definido.
PRINCIPIO DE CONTINUIDAD: Cada keyframe ES UNA CONTINUACIÓN del anterior, NO una nueva generación.
PRINCIPIO ANTI-IA: La imagen debe ser INDISTINGUIBLE de fotografía cinematográfica real.

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

=== MANDATO ANTI-IA (CRÍTICO) ===
PIEL:
- Textura de poros visible a distancia apropiada
- Imperfecciones naturales: marcas, pecas, pequeñas irregularidades
- NO suavizado artificial, NO aspecto "porcelana"
- Variaciones de tono natural: rojeces sutiles, venas apenas visibles

OJOS:
- Reflexiones realistas de luz ambiental (NO highlights perfectos circulares)
- Venas sutiles en esclerótica
- Asimetría natural entre ambos ojos
- Iris con variaciones de color y textura

CABELLO:
- Mechones sueltos naturales, "flyaways"
- Variaciones de grosor y dirección
- Reflejos coherentes con fuente de luz única
- NO demasiado perfecto o simétrico

ILUMINACIÓN:
- Coherencia ESTRICTA con fuente de luz establecida
- Sombras con bordes variables (NO uniformes)
- Spill de color ambiental
- Falloff natural de la luz

TEXTURAS:
- Ropa con arrugas, pliegues naturales, desgaste apropiado al personaje
- Superficies con polvo, huellas, o uso visible donde narrativamente apropiado
- NO texturas "nuevas" o perfectamente limpias sin justificación
- Variación en materiales: brillo, mate, textil

COMPOSICIÓN:
- Asimetría compositiva natural
- Espacio negativo intencional
- NO centrado perfecto a menos que sea narrativo
=== FIN MANDATO ANTI-IA ===

SAFE ZONES (para UI/texto de app):
- ui_top_pct: 12% zona superior reservada
- ui_bottom_pct: 18% zona inferior reservada  
- ui_side_pct: 6% márgenes laterales
- action_safe_pct: 10% zona segura general

CAMPOS OBLIGATORIOS EN TU RESPUESTA JSON:
{
  "prompt_text": "El prompt de imagen final, ultradetallado y determinista. DEBE incluir vestuario exacto, posiciones exactas, iluminación exacta, Y texturas anti-IA.",
  "negative_prompt": "Lista EXTENSA de elementos prohibidos incluyendo artifacts de IA",
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
  "negative_constraints": ["smooth plastic skin", "poreless skin", "airbrushed face", "perfectly symmetrical face", "overly bright eyes", "CGI render", "wax figure", "mannequin", "stock photo", "no text", "no watermark", "no logos", "no extra people", "no wardrobe change", "no lighting change"]
}

Genera el JSON completo sin explicaciones adicionales.`;

// Enhanced negative prompts for anti-AI generation
const ANTI_AI_NEGATIVE_PROMPTS = [
  // Core anti-AI blocks
  'smooth plastic skin', 'poreless skin', 'airbrushed face', 'perfectly symmetrical face',
  'overly bright eyes', 'uniform lighting without falloff', 'perfectly clean textures',
  'stock photo look', 'CGI render appearance', 'wax figure look', 'mannequin appearance',
  'uncanny valley', 'video game graphics', 'hyper-smooth skin',
  // Technical artifacts
  'jpeg artifacts', 'visible noise pattern', 'watermark', 'text overlay',
  'border frame', 'vignette filter', 'chromatic aberration artifacts', 'banding', 'posterization',
  // Composition flaws
  'centered composition', 'amateur framing', 'snapshot aesthetic', 'flat depth',
  // AI-specific tells
  'extra fingers', 'deformed hands', 'asymmetric clothing', 'floating objects',
  'merged body parts', 'inconsistent shadows', 'multiple light sources without motivation',
  'blurry background with sharp subject only',
];

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

// ⚠️ MODEL CONFIG - DO NOT CHANGE WITHOUT USER AUTHORIZATION
// See docs/MODEL_CONFIG_EXPERT_VERSION.md for rationale
// Keyframes: nano-banana-pro via FAL.ai (maximum character consistency for Veo input)
const FAL_MODEL = 'fal-ai/nano-banana-pro';

// Wardrobe lock helper - format for injection
interface WardrobeLock {
  primary_outfit?: string;
  top?: string;
  bottom?: string;
  footwear?: string;
  accessories?: string[];
  hair_style?: string;
}

function formatWardrobeLock(lock: WardrobeLock): string {
  const parts: string[] = [];
  if (lock.primary_outfit) parts.push(lock.primary_outfit);
  if (lock.top) parts.push(`Top: ${lock.top}`);
  if (lock.bottom) parts.push(`Bottom: ${lock.bottom}`);
  if (lock.footwear) parts.push(`Footwear: ${lock.footwear}`);
  if (lock.accessories?.length) parts.push(`Accessories: ${lock.accessories.join(', ')}`);
  if (lock.hair_style) parts.push(`Hair: ${lock.hair_style}`);
  return parts.join('. ') || 'As established in previous keyframes';
}

async function generateKeyframePrompt(
  request: KeyframeRequest,
  characterWardrobes: Map<string, { name: string; wardrobe: string }>
): Promise<{
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
  
  // Build wardrobe section from locked wardrobes
  let wardrobeSection = '';
  if (characterWardrobes.size > 0) {
    const wardrobeLines: string[] = [];
    characterWardrobes.forEach((data, charId) => {
      wardrobeLines.push(`- ${data.name}: ${data.wardrobe}`);
    });
    wardrobeSection = `
VESTUARIO BLOQUEADO POR PERSONAJE (OBLIGATORIO - NO CAMBIAR):
${wardrobeLines.join('\n')}
`;
  }
  
  // Build continuity section if we have previous keyframe
  let continuitySection = '';
  if (request.previousKeyframeData?.promptText) {
    continuitySection = `
KEYFRAME ANTERIOR (MANTENER CONTINUIDAD ESTRICTA):
Prompt anterior: ${request.previousKeyframeData.promptText}
${request.previousKeyframeData.stagingSnapshot ? `Posiciones anteriores: ${JSON.stringify(request.previousKeyframeData.stagingSnapshot)}` : ''}

REGLA CRÍTICA: Este keyframe es ${request.timestampSec}s después. Los personajes deben:
1. Llevar EXACTAMENTE la misma ropa (ver VESTUARIO BLOQUEADO arriba)
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
${wardrobeSection}
LOCALIZACIÓN:
${request.location ? `- ${request.location.name} (ID: ${request.location.id})${request.location.token ? ` [Token: ${request.location.token}]` : ''}` : 'No especificada'}

${request.stylePack ? `ESTILO VISUAL:
- ${request.stylePack.description || 'Hyperreal commercial'}
- Paleta: ${request.stylePack.colorPalette?.join(', ') || 'Natural'}
- Iluminación: ${request.stylePack.lightingRules?.join(', ') || 'Soft cinematic'}
- Aspect ratio: ${request.stylePack.aspectRatio || '16:9'}` : ''}

${continuitySection}

${request.previousKeyframeUrl ? `IMAGEN DE REFERENCIA: Hay un keyframe previo disponible. DEBES mantener:
- Mismo vestuario exacto para cada personaje (ver VESTUARIO BLOQUEADO)
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
        { role: "system", content: PROMPT_ENGINE_V4_SYSTEM },
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
    // Provide defaults if parsing fails - with wardrobe info
    const defaultWardrobe = Array.from(characterWardrobes.values())
      .map(d => `${d.name}: ${d.wardrobe}`)
      .join('; ') || request.characters.map(c => `${c.name}: professional attire`).join('; ');
    return {
      prompt_text: `Cinematic ${request.shotType} shot, ${request.shotDetails?.focalMm || 35}mm lens, ${request.shotDetails?.cameraHeight || 'eye level'}. ${request.sceneDescription}. ${request.characters.map(c => c.name).join(', ')} in ${request.location?.name || 'the scene'}. Wardrobe: ${defaultWardrobe}. ${request.shotDetails?.lightingStyle || 'Natural lighting'}. Professional film quality, 16:9 aspect ratio.`,
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

async function generateWithFal(
  prompt: string,
  negativePrompt: string
): Promise<{ imageUrl: string; seed: number }> {
  const FAL_API_KEY = Deno.env.get("FAL_API_KEY");
  if (!FAL_API_KEY) {
    throw new Error("FAL_API_KEY is not configured");
  }

  console.log(`[FAL] Generating keyframe with ${FAL_MODEL}...`);

  // Submit request to FAL queue
  const submitResponse = await fetch(`https://queue.fal.run/${FAL_MODEL}`, {
    method: 'POST',
    headers: {
      'Authorization': `Key ${FAL_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt: prompt,
      negative_prompt: negativePrompt,
      image_size: "landscape_16_9",
      num_images: 1,
      enable_safety_checker: false,
      output_format: "jpeg"
    }),
  });

  if (!submitResponse.ok) {
    const errorText = await submitResponse.text();
    console.error('[FAL] Submit error:', submitResponse.status, errorText);
    throw new Error(`FAL submit failed: ${submitResponse.status} - ${errorText}`);
  }

  const queueData = await submitResponse.json();
  const requestId = queueData.request_id;
  console.log('[FAL] Request queued:', requestId);

  // Poll for result
  let attempts = 0;
  const maxAttempts = 60;
  
  while (attempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const statusResponse = await fetch(`https://queue.fal.run/${FAL_MODEL}/requests/${requestId}/status`, {
      headers: {
        'Authorization': `Key ${FAL_API_KEY}`,
      },
    });

    if (!statusResponse.ok) {
      attempts++;
      continue;
    }

    const status = await statusResponse.json();
    
    if (status.status === 'COMPLETED') {
      const resultResponse = await fetch(`https://queue.fal.run/${FAL_MODEL}/requests/${requestId}`, {
        headers: {
          'Authorization': `Key ${FAL_API_KEY}`,
        },
      });

      if (!resultResponse.ok) {
        throw new Error('Failed to get FAL result');
      }

      const result = await resultResponse.json();
      const imageUrl = result.images?.[0]?.url;
      const seed = result.seed || Math.floor(Math.random() * 999999);
      
      if (!imageUrl) {
        throw new Error('No image in FAL response');
      }

      console.log('[FAL] Keyframe generation complete, seed:', seed);
      return { imageUrl, seed };
    }

    if (status.status === 'FAILED') {
      throw new Error(`FAL generation failed: ${status.error || 'Unknown error'}`);
    }

    attempts++;
  }

  throw new Error('FAL generation timeout');
}

async function uploadImageToStorage(
  supabaseUrl: string,
  supabaseKey: string,
  imageUrl: string,
  shotId: string,
  frameType: string,
  timestampSec: number
): Promise<string> {
  // Download image from FAL
  const imageResponse = await fetch(imageUrl);
  if (!imageResponse.ok) {
    throw new Error('Failed to download image from FAL');
  }
  const imageBlob = await imageResponse.blob();
  const imageBuffer = await imageBlob.arrayBuffer();
  const bytes = new Uint8Array(imageBuffer);

  // Create a fresh client for storage operations
  const storageClient = createClient(supabaseUrl, supabaseKey);
  
  const fileName = `keyframes/${shotId}/${frameType}_${timestampSec}s_${Date.now()}.jpg`;

  const { data, error } = await storageClient.storage
    .from('renders')
    .upload(fileName, bytes, {
      contentType: 'image/jpeg',
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

  const startTime = Date.now();
  
  try {
    // Auth check
    const { userId, supabase } = await requireAuthOrDemo(req);
    console.log("[AUTH] Authenticated user:", userId);

    const request: KeyframeRequest = await req.json();
    console.log("=== Generate Keyframe Request ===");
    console.log("Shot ID:", request.shotId);
    console.log("Frame type:", request.frameType, "at", request.timestampSec, "s");
    console.log("Characters:", request.characters.map(c => c.name).join(", "));
    console.log("Shot details:", JSON.stringify(request.shotDetails || {}));
    console.log("Has previous keyframe:", !!request.previousKeyframeUrl);

    // Get supabase credentials for storage operations
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Get shot to verify project access
    const { data: shot } = await supabase
      .from('shots')
      .select('scene_id, scenes(project_id)')
      .eq('id', request.shotId)
      .single();
    
    const projectId = (shot?.scenes as any)?.project_id;
    if (projectId) {
      await requireProjectAccess(supabase, userId, projectId);
    }

    // Fetch wardrobe locks for all characters in this keyframe
    const characterIds = request.characters.map(c => c.id);
    const characterWardrobes = new Map<string, { name: string; wardrobe: string }>();
    
    if (characterIds.length > 0) {
      const { data: charactersData, error: charError } = await supabase
        .from('characters')
        .select('id, name, wardrobe_lock_json')
        .in('id', characterIds);
      
      if (charError) {
        console.error('Error fetching character wardrobes:', charError);
      } else if (charactersData) {
        for (const char of charactersData) {
          if (char.wardrobe_lock_json) {
            characterWardrobes.set(char.id, {
              name: char.name,
              wardrobe: formatWardrobeLock(char.wardrobe_lock_json as WardrobeLock)
            });
          }
        }
        console.log(`Loaded ${characterWardrobes.size} wardrobe locks for keyframe generation`);
      }
    }

    // Step 1: Generate deterministic prompt with PROMPT-ENGINE v3
    console.log("Step 1: Generating prompt with PROMPT-ENGINE v3 (with continuity)...");
    const promptData = await generateKeyframePrompt(request, characterWardrobes);
    console.log("Prompt generated:", promptData.prompt_text.substring(0, 150) + "...");
    console.log("Continuity locks:", JSON.stringify(promptData.continuity_locks || {}));

    // Step 2: Generate image with FAL nano-banana-pro
    console.log("Step 2: Generating image with FAL nano-banana-pro...");
    const { imageUrl: falImageUrl, seed } = await generateWithFal(
      promptData.prompt_text,
      promptData.negative_prompt
    );

    // Step 3: Upload to storage
    console.log("Step 3: Uploading to storage...");
    const imageUrl = await uploadImageToStorage(
      supabaseUrl,
      supabaseKey,
      falImageUrl,
      request.shotId,
      request.frameType,
      request.timestampSec
    );
    console.log("Image uploaded:", imageUrl);

    // Step 4: Save keyframe to database with continuity data
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
        seed: seed,
        locks: {
          negative_prompt: promptData.negative_prompt,
          continuity_locks: promptData.continuity_locks,
          characters: request.characters.map(c => c.id),
          location: request.location?.id,
          shot_details: request.shotDetails,
          engine: FAL_MODEL
        }
      })
      .select()
      .single();

    if (dbError) {
      console.error("Database error:", dbError);
      throw new Error(`Failed to save keyframe: ${dbError.message}`);
    }

    console.log("=== Keyframe generated successfully ===");
    
    // Log generation cost (reuse userId from auth)
    if (userId) {
      await logGenerationCost({
        userId,
        slotType: 'keyframe',
        engine: FAL_MODEL,
        durationMs: Date.now() - startTime,
        success: true,
        metadata: {
          shotId: request.shotId,
          frameType: request.frameType
        }
      });
    }
    
    return new Response(
      JSON.stringify({
        success: true,
        keyframe,
        prompt: promptData.prompt_text,
        seed,
        engine: FAL_MODEL
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in generate-keyframe:", error);
    
    if (error instanceof Error && error.message.includes('AUTH')) {
      return authErrorResponse(new Error(error.message), corsHeaders);
    }
    
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
