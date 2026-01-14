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
- DYNAMIC: Use safe zone values from canvas_format if provided
- Default ui_top_pct: 12% zona superior reservada
- Default ui_bottom_pct: 18% zona inferior reservada  
- Default ui_side_pct: 6% márgenes laterales
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

// Pose data structure for motion continuity
interface PoseData {
  position: {
    x_m: number;
    y_m: number;
    screen_pos: 'left' | 'center' | 'right' | 'off_left' | 'off_right';
  };
  orientation: {
    facing_deg: number;
    gaze_target: string;
  };
  scale: {
    relative: number;
    in_frame_pct: number;
  };
  body_state: {
    posture: 'standing' | 'sitting' | 'crouching' | 'lying' | 'moving';
    gesture: string;
  };
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
  // NEW: Previous shot's final pose for continuity lock
  previousShotFinalPose?: Record<string, PoseData>;
  stylePack?: {
    description?: string;
    colorPalette?: string[];
    lightingRules?: string[];
    aspectRatio?: string;
  };
  // NEW: Canvas format from style_pack
  canvasFormat?: {
    aspect_ratio?: string;
    orientation?: string;
    safe_area?: {
      top?: number;
      bottom?: number;
      left?: number;
      right?: number;
    };
  };
}

// ⚠️ MODEL CONFIG - DO NOT CHANGE WITHOUT USER AUTHORIZATION
// See docs/MODEL_CONFIG_EXPERT_VERSION.md for rationale
// Keyframes: Nano Banana Pro via Lovable AI Gateway (maximum character consistency for Veo input)
const IMAGE_MODEL = 'google/gemini-3-pro-image-preview';

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

// Visual DNA type for keyframe identity lock
interface VisualDNAForKeyframe {
  physical_identity?: {
    age_exact_for_prompt?: number;
    ethnicity?: { skin_tone_description?: string };
  };
  face?: {
    shape?: string;
    eyes?: { color_base?: string; shape?: string };
    distinctive_marks?: {
      wrinkles_lines?: {
        forehead?: { horizontal_lines?: string };
        eyes?: { crows_feet?: string };
      };
    };
  };
  hair?: {
    head_hair?: {
      color?: { natural_base?: string; grey_white?: { percentage?: number } };
      length?: { type?: string };
      style?: { overall_shape?: string };
    };
  };
  skin?: {
    texture?: { overall?: string };
  };
}

// Build identity lock for keyframe generation from Visual DNA
function buildIdentityLockForKeyframe(visualDNA: VisualDNAForKeyframe, characterName: string): string {
  const parts: string[] = [];
  
  // Age - Critical for consistency
  if (visualDNA.physical_identity?.age_exact_for_prompt) {
    parts.push(`Age: EXACTLY ${visualDNA.physical_identity.age_exact_for_prompt} years`);
  }
  
  // Hair - Detailed to prevent drift
  const hair = visualDNA.hair?.head_hair;
  if (hair) {
    const baseColor = hair.color?.natural_base;
    const greyPercent = hair.color?.grey_white?.percentage;
    if (baseColor) {
      parts.push(`Hair: ${baseColor}${greyPercent && greyPercent > 0 ? ` with ${greyPercent}% grey` : ''}`);
    }
    if (hair.length?.type) parts.push(`Hair length: ${hair.length.type}`);
    if (hair.style?.overall_shape) parts.push(`Hair style: ${hair.style.overall_shape}`);
  }
  
  // Skin tone
  if (visualDNA.physical_identity?.ethnicity?.skin_tone_description) {
    parts.push(`Skin tone: ${visualDNA.physical_identity.ethnicity.skin_tone_description}`);
  }
  if (visualDNA.skin?.texture?.overall) {
    parts.push(`Skin texture: ${visualDNA.skin.texture.overall}`);
  }
  
  // Face
  if (visualDNA.face?.shape) {
    parts.push(`Face shape: ${visualDNA.face.shape}`);
  }
  if (visualDNA.face?.eyes) {
    const eyes = visualDNA.face.eyes;
    if (eyes.color_base) parts.push(`Eye color: ${eyes.color_base}`);
  }
  
  // Wrinkles for age consistency
  if (visualDNA.face?.distinctive_marks?.wrinkles_lines) {
    const wrinkles = visualDNA.face.distinctive_marks.wrinkles_lines;
    const wrinkleParts = [];
    if (wrinkles.forehead?.horizontal_lines) wrinkleParts.push(`forehead: ${wrinkles.forehead.horizontal_lines}`);
    if (wrinkles.eyes?.crows_feet) wrinkleParts.push(`crow's feet: ${wrinkles.eyes.crows_feet}`);
    if (wrinkleParts.length > 0) {
      parts.push(`Wrinkles: ${wrinkleParts.join(', ')}`);
    }
  }
  
  if (parts.length === 0) return '';
  
  return `
=== IDENTITY LOCK: ${characterName} (NON-NEGOTIABLE) ===
${parts.join('\n')}
RULES: Preserve EXACT age, hair color, skin tone, facial features. DO NOT de-age or smooth skin.
=== END IDENTITY LOCK ===`;
}

async function generateKeyframePrompt(
  request: KeyframeRequest,
  characterWardrobes: Map<string, { name: string; wardrobe: string }>,
  characterIdentities: Map<string, { name: string; identityLock: string }>
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

  // NEW: Build CONTINUITY LOCK section for initial keyframes
  let continuityLockSection = '';
  if (request.frameType === 'initial' && request.previousShotFinalPose && Object.keys(request.previousShotFinalPose).length > 0) {
    const poseLines = Object.entries(request.previousShotFinalPose).map(([charId, pose]) => {
      return `${charId}:
  - Screen position: ${pose.position?.screen_pos || 'center'}
  - Facing: ${pose.orientation?.facing_deg || 0}° towards ${pose.orientation?.gaze_target || 'camera'}
  - Frame occupancy: ${pose.scale?.in_frame_pct || 40}%
  - Posture: ${pose.body_state?.posture || 'standing'}`;
    }).join('\n');

    continuityLockSection = `
=== CONTINUITY LOCK (MANDATORY - INITIAL KEYFRAME) ===
This keyframe MUST start with characters in EXACTLY these positions from the previous shot:

${poseLines}

RULES:
1. NO "teleporting" - characters CANNOT jump positions between shots
2. NO scale change without camera movement justification
3. Screen direction MUST be preserved unless motivated by cut type
4. entry_pose MUST match exit_pose of previous shot

Generate pose_data_per_character that matches these constraints.
=== END CONTINUITY LOCK ===
`;
  }

  // Build canvas format section with dynamic safe zones
  const canvasFormat = request.canvasFormat;
  const safeZones = canvasFormat?.safe_area || { top: 12, bottom: 18, left: 6, right: 6 };
  const canvasSection = canvasFormat ? `
CANVAS FORMAT (GLOBAL - NEVER OVERRIDE):
- Aspect ratio: ${canvasFormat.aspect_ratio || '16:9'}
- Orientation: ${canvasFormat.orientation || 'horizontal'}
- Safe zones: top ${safeZones.top}%, bottom ${safeZones.bottom}%, left ${safeZones.left}%, right ${safeZones.right}%
- COMPOSE FOR THIS ASPECT RATIO. Keep action inside safe zones.
${canvasFormat.orientation === 'vertical' ? 
'- VERTICAL FORMAT: More medium shots, vertical subject alignment, characters closer to camera' : 
canvasFormat.orientation === 'square' ?
'- SQUARE FORMAT: Centered composition, balanced headroom/footroom' :
'- HORIZONTAL FORMAT: Use full horizontal space, rule of thirds laterally'}
` : '';

  const userPrompt = `Genera un keyframe para esta escena:

${canvasSection}
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
IDENTITY LOCKS (OBLIGATORIO - MANTENER EXACTO):
${Array.from(characterIdentities.values()).map(c => c.identityLock || `${c.name}: Use consistent appearance from previous keyframes`).join('\n\n')}
LOCALIZACIÓN:
${request.location ? `- ${request.location.name} (ID: ${request.location.id})${request.location.token ? ` [Token: ${request.location.token}]` : ''}` : 'No especificada'}

${request.stylePack ? `ESTILO VISUAL:
- ${request.stylePack.description || 'Hyperreal commercial'}
- Paleta: ${request.stylePack.colorPalette?.join(', ') || 'Natural'}
- Iluminación: ${request.stylePack.lightingRules?.join(', ') || 'Soft cinematic'}
- Aspect ratio: ${canvasFormat?.aspect_ratio || request.stylePack.aspectRatio || '16:9'}` : ''}

${continuitySection}

${continuityLockSection}

${request.previousKeyframeUrl ? `IMAGEN DE REFERENCIA: Hay un keyframe previo disponible. DEBES mantener:
- Mismo vestuario exacto para cada personaje (ver VESTUARIO BLOQUEADO)
- Misma iluminación (dirección, color, intensidad)
- Mismo set/decorado
- Evolución natural de posiciones` : ''}

IMPORTANTE: Incluye "pose_data_per_character" en tu respuesta JSON con la posición, orientación, escala y estado corporal de CADA personaje.

Genera el JSON completo con prompt_text, negative_prompt, continuity_locks, pose_data_per_character, frame_geometry, staging_snapshot, determinism, y negative_constraints.
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

async function generateWithLovableAI(
  prompt: string,
  negativePrompt: string
): Promise<{ imageUrl: string; seed: number }> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) {
    throw new Error("LOVABLE_API_KEY is not configured");
  }

  console.log(`[Lovable AI] Generating keyframe with ${IMAGE_MODEL}...`);

  // Generate image using Lovable AI Gateway
  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: IMAGE_MODEL,
      messages: [
        {
          role: 'user',
          content: `${prompt}\n\nNEGATIVE: ${negativePrompt}`
        }
      ],
      modalities: ['image', 'text']
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[Lovable AI] Generation error:', response.status, errorText);
    
    // Handle specific error codes
    if (response.status === 429) {
      throw new Error('Rate limit exceeded. Please try again later.');
    }
    if (response.status === 402) {
      throw new Error('Insufficient credits. Please add funds to your workspace.');
    }
    
    throw new Error(`Lovable AI generation failed: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const imageUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  const seed = Math.floor(Math.random() * 999999); // Lovable AI doesn't return seed, generate random

  if (!imageUrl) {
    console.error('[Lovable AI] No image in response:', JSON.stringify(data).substring(0, 500));
    throw new Error('No image generated by Lovable AI');
  }

  console.log('[Lovable AI] Keyframe generation complete, seed:', seed);
  return { imageUrl, seed };
}

async function uploadImageToStorage(
  supabaseUrl: string,
  supabaseKey: string,
  imageUrl: string,
  shotId: string,
  frameType: string,
  timestampSec: number
): Promise<string> {
  // Handle base64 image from Lovable AI or URL from other sources
  let imageBytes: Uint8Array;
  
  if (imageUrl.startsWith('data:image/')) {
    // Base64 image from Lovable AI
    const base64Data = imageUrl.replace(/^data:image\/\w+;base64,/, '');
    imageBytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
  } else {
    // URL image - download it
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw new Error('Failed to download image');
    }
    const imageBlob = await imageResponse.blob();
    const imageBuffer = await imageBlob.arrayBuffer();
    imageBytes = new Uint8Array(imageBuffer);
  }

  // Create a fresh client for storage operations
  const storageClient = createClient(supabaseUrl, supabaseKey);
  
  const fileName = `keyframes/${shotId}/${frameType}_${timestampSec}s_${Date.now()}.jpg`;

  const { data, error } = await storageClient.storage
    .from('renders')
    .upload(fileName, imageBytes, {
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

    // Fetch wardrobe locks AND visual DNA for all characters in this keyframe
    const characterIds = request.characters.map(c => c.id);
    const characterWardrobes = new Map<string, { name: string; wardrobe: string }>();
    const characterIdentities = new Map<string, { name: string; identityLock: string }>();
    
    if (characterIds.length > 0) {
      // Fetch characters with visual DNA
      const { data: charactersData, error: charError } = await supabase
        .from('characters')
        .select(`
          id, name, wardrobe_lock_json,
          character_visual_dna!character_visual_dna_character_id_fkey(
            visual_dna,
            is_active
          )
        `)
        .in('id', characterIds);
      
      if (charError) {
        console.error('Error fetching character data:', charError);
      } else if (charactersData) {
        for (const char of charactersData) {
          // Wardrobe lock
          if (char.wardrobe_lock_json) {
            characterWardrobes.set(char.id, {
              name: char.name,
              wardrobe: formatWardrobeLock(char.wardrobe_lock_json as WardrobeLock)
            });
          }
          
          // Visual DNA -> Identity Lock
          const activeDNA = (char.character_visual_dna as any[])?.find((v: any) => v.is_active);
          if (activeDNA?.visual_dna) {
            characterIdentities.set(char.id, {
              name: char.name,
              identityLock: buildIdentityLockForKeyframe(activeDNA.visual_dna, char.name)
            });
          }
        }
        console.log(`Loaded ${characterWardrobes.size} wardrobe locks, ${characterIdentities.size} identity locks for keyframe`);
      }
    }

    // Step 1: Generate deterministic prompt with PROMPT-ENGINE v4
    console.log("Step 1: Generating prompt with PROMPT-ENGINE v4 (with identity + continuity)...");
    const promptData = await generateKeyframePrompt(request, characterWardrobes, characterIdentities);
    console.log("Prompt generated:", promptData.prompt_text.substring(0, 150) + "...");
    console.log("Continuity locks:", JSON.stringify(promptData.continuity_locks || {}));

    // Step 2: Generate image with Lovable AI (Nano Banana Pro)
    console.log("Step 2: Generating image with Lovable AI (gemini-3-pro-image-preview)...");
    const { imageUrl: generatedImageUrl, seed } = await generateWithLovableAI(
      promptData.prompt_text,
      promptData.negative_prompt
    );

    // Step 3: Upload to storage
    console.log("Step 3: Uploading to storage...");
    const imageUrl = await uploadImageToStorage(
      supabaseUrl,
      supabaseKey,
      generatedImageUrl,
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
          engine: IMAGE_MODEL
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
        engine: IMAGE_MODEL,
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
        engine: IMAGE_MODEL
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
