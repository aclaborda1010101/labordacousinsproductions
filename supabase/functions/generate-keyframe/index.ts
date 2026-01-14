import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAuthOrDemo, requireProjectAccess, authErrorResponse } from "../_shared/auth.ts";
import { logGenerationCost, extractUserId } from "../_shared/cost-logging.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-demo-key",
};

// ============================================================================
// STYLE PROFILES - Global visual style lock (matches generate-keyframes-batch)
// ============================================================================
type StyleProfile = 'DISNEY_PIXAR_3D' | 'STORYBOARD_PENCIL' | 'REALISTIC';

const STYLE_PROFILES: Record<StyleProfile, {
  lock: string;
  negative: string;
  bannedWords: string[];
}> = {
  DISNEY_PIXAR_3D: {
    lock: `
═══════════════════════════════════════════════════════════════
STYLE LOCK (MANDATORY - DISNEY/PIXAR 3D ANIMATION)
═══════════════════════════════════════════════════════════════
3D animated family film look, Disney-Pixar inspired.
Soft global illumination, clean stylized materials.
Slightly exaggerated facial features, big expressive eyes.
Smooth skin shading, no pores, no photoreal micro-textures.
Warm, colorful, cinematic animation lighting.
16:9 composition. Character proportions: stylized, not realistic.
═══════════════════════════════════════════════════════════════`,
    negative: `NO photorealism, NO DSLR, NO live-action, NO film grain, NO real actors,
NO skin pores, NO realistic fabric micro-detail, NO photography terms,
NO cinematic still, NO naturalistic, NO real skin texture, NO visible pores`,
    bannedWords: [
      'DSLR', 'cinematic still', 'naturalistic', 'film grain', 
      'photoreal', 'photorealistic', 'live-action', 'real actors', 'pores',
      'realistic lighting', 'natural skin texture', 'visible pores',
      'professional photography', 'real fabric', 'skin texture',
      'cinematic photograph', 'Naturalistic_Daylight', 'natural daylight',
      'textura de poros', 'INDISTINGUIBLE de fotografía', 'fotografía cinematográfica',
      'imperfecciones naturales', 'venas sutiles', 'Naturalistic', 'hyperreal'
    ]
  },
  STORYBOARD_PENCIL: {
    lock: `
═══════════════════════════════════════════════════════════════
STYLE LOCK (MANDATORY - STORYBOARD PENCIL SKETCH)
═══════════════════════════════════════════════════════════════
Black and white pencil sketch storyboard style.
Hand-drawn feel, visible pencil strokes.
Simple shading, no color, clean linework.
Focus on composition and staging over detail.
═══════════════════════════════════════════════════════════════`,
    negative: `NO color, NO photorealism, NO 3D render, NO detailed textures`,
    bannedWords: ['photorealistic', 'DSLR', 'cinematic photograph', 'hyperreal']
  },
  REALISTIC: {
    lock: `
═══════════════════════════════════════════════════════════════
STYLE LOCK (MANDATORY - CINEMATIC REALISM)
═══════════════════════════════════════════════════════════════
ULTRA-DETAILED professional cinematic still, film-quality.
Natural skin with visible pores, real textures, photorealistic.
Film-accurate lighting, no CGI look.
═══════════════════════════════════════════════════════════════`,
    negative: `NO CGI render, NO plastic skin, NO airbrushed, NO cartoon, NO anime`,
    bannedWords: ['cartoon', 'anime', 'stylized', 'disney', 'pixar']
  }
};

// Sanitize prompt to remove style-incompatible words
function sanitizePromptForStyle(prompt: string, styleProfile: StyleProfile): string {
  const profile = STYLE_PROFILES[styleProfile];
  if (!profile?.bannedWords?.length) return prompt;
  
  let sanitized = prompt;
  for (const word of profile.bannedWords) {
    sanitized = sanitized.replace(new RegExp(word, 'gi'), '');
  }
  return sanitized.replace(/\s+/g, ' ').trim();
}

// Get anti-AI negative prompts based on style (animated styles don't want skin pores)
function getAntiAIPrompts(styleProfile: StyleProfile): string[] {
  if (styleProfile === 'DISNEY_PIXAR_3D') {
    return [
      'photorealistic', 'live-action', 'real actors', 'DSLR',
      'film grain', 'real skin', 'skin pores', 'realistic fabric',
      'extra fingers', 'deformed hands', 'asymmetric clothing', 'floating objects',
      'text', 'watermark', 'logo', 'extra people', 'naturalistic daylight'
    ];
  }
  if (styleProfile === 'STORYBOARD_PENCIL') {
    return [
      'photorealistic', 'color', '3D render', 'CGI',
      'extra fingers', 'deformed hands', 'text', 'watermark'
    ];
  }
  // Realistic style - original anti-AI prompts
  return [
    'smooth plastic skin', 'poreless skin', 'airbrushed face', 'perfectly symmetrical face',
    'overly bright eyes', 'uniform lighting without falloff', 'perfectly clean textures',
    'stock photo look', 'CGI render appearance', 'wax figure look', 'mannequin appearance',
    'uncanny valley', 'video game graphics', 'hyper-smooth skin',
    'jpeg artifacts', 'visible noise pattern', 'watermark', 'text overlay',
    'extra fingers', 'deformed hands', 'asymmetric clothing', 'floating objects',
    'merged body parts', 'inconsistent shadows', 'multiple light sources without motivation'
  ];
}

// Build system prompt based on style profile
function getSystemPromptForStyle(styleProfile: StyleProfile): string {
  if (styleProfile === 'DISNEY_PIXAR_3D') {
    return `Eres PROMPT-ENGINE v4 "DISNEY-PIXAR 3D ANIMATION".
Sistema de especificación determinista para IA de imagen con calidad de ANIMACIÓN 3D estilo Disney-Pixar.

${STYLE_PROFILES.DISNEY_PIXAR_3D.lock}

ESTILO OBLIGATORIO: Disney-Pixar 3D Animation
- Personajes estilizados con ojos grandes expresivos
- Piel suave SIN poros ni texturas fotorealistas
- Materiales limpios y estilizados
- Iluminación cálida de animación cinematográfica
- Proporciones ligeramente exageradas (cabeza más grande, ojos más grandes)

PROHIBIDO ABSOLUTAMENTE:
- Fotorealismo de cualquier tipo
- Texturas de piel realistas (poros, venas, imperfecciones)
- Términos fotográficos (DSLR, film grain, cinematic still)
- Aspecto live-action
- Iluminación naturalista/Naturalistic_Daylight

REGLAS DE CONTINUIDAD ENTRE KEYFRAMES:
1) El vestuario de cada personaje DEBE ser IDÉNTICO al keyframe anterior.
2) La iluminación DEBE mantener la misma dirección y temperatura de color.
3) Los props en escena DEBEN estar en posiciones coherentes con el movimiento.
4) Las posiciones de personajes deben evolucionar naturalmente (no saltos).
5) El fondo DEBE ser el mismo set/localización.

CAMPOS OBLIGATORIOS EN TU RESPUESTA JSON:
{
  "prompt_text": "El prompt de imagen final, ESTILO DISNEY-PIXAR 3D obligatorio.",
  "negative_prompt": "${STYLE_PROFILES.DISNEY_PIXAR_3D.negative}",
  "continuity_locks": {...},
  "frame_geometry": {...},
  "staging_snapshot": {...},
  "determinism": { "guidance": 7.5, "steps": 30 },
  "negative_constraints": [${getAntiAIPrompts('DISNEY_PIXAR_3D').map(p => `"${p}"`).join(', ')}]
}

Genera el JSON completo sin explicaciones adicionales.`;
  }
  
  // Default: realistic style (original system prompt)
  return `Eres PROMPT-ENGINE v4 "NO-LOOSE-ENDS + FRAME GEOMETRY + CONTINUITY + ANTI-AI".
Sistema de especificación determinista para IA de imagen con calidad cinematográfica profesional.

PRINCIPIO CENTRAL: Si un detalle puede variar, variará. Por tanto: todo lo relevante debe quedar definido.
PRINCIPIO DE CONTINUIDAD: Cada keyframe ES UNA CONTINUACIÓN del anterior, NO una nueva generación.
PRINCIPIO ANTI-IA: La imagen debe ser INDISTINGUIBLE de fotografía cinematográfica real.

REGLAS ANTI-AMBIGÜEDAD (INNEGOCIABLES):
1) Prohibidas palabras vagas/subjetivas sin definición operacional.
2) Nada se deja "a decisión del modelo".
3) La escena debe ser reproducible.
4) Continuidad estricta por IDs de personajes y props.
5) Prohibido añadir gente extra, texto, logos, props no listados.

REGLAS DE CONTINUIDAD ENTRE KEYFRAMES:
1) El vestuario de cada personaje DEBE ser IDÉNTICO al keyframe anterior.
2) La iluminación DEBE mantener la misma dirección y temperatura de color.
3) Los props en escena DEBEN estar en posiciones coherentes con el movimiento.
4) Las posiciones de personajes deben evolucionar naturalmente (no saltos).
5) El fondo DEBE ser el mismo set/localización.

=== MANDATO ANTI-IA (para REALISTIC style) ===
PIEL: Textura de poros visible, imperfecciones naturales.
OJOS: Reflexiones realistas, venas sutiles en esclerótica.
CABELLO: Mechones sueltos naturales.
ILUMINACIÓN: Coherencia ESTRICTA con fuente de luz.
TEXTURAS: Ropa con arrugas, desgaste apropiado.
=== FIN MANDATO ANTI-IA ===

CAMPOS OBLIGATORIOS EN TU RESPUESTA JSON:
{
  "prompt_text": "El prompt de imagen final, ultradetallado y determinista.",
  "negative_prompt": "Lista de elementos prohibidos",
  "continuity_locks": {...},
  "frame_geometry": {...},
  "staging_snapshot": {...},
  "determinism": { "guidance": 7.5, "steps": 30 },
  "negative_constraints": [...]
}

Genera el JSON completo sin explicaciones adicionales.`;
}

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
  characterIdentities: Map<string, { name: string; identityLock: string }>,
  styleProfile: StyleProfile = 'DISNEY_PIXAR_3D' // NEW: Style profile parameter
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
  
  console.log(`[generateKeyframePrompt] Using style profile: ${styleProfile}`);

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

  // Get style-specific settings
  const styleSettings = STYLE_PROFILES[styleProfile];
  
  const userPrompt = `${styleSettings.lock}

Genera un keyframe para esta escena EN ESTILO ${styleProfile}:

${canvasSection}
CONTEXTO COMPLETO DEL PLANO:
- Escena: ${request.sceneDescription}
- Tipo de plano: ${request.shotType}
- Duración total: ${request.duration}s
- Tipo de frame: ${request.frameType} (timestamp: ${request.timestampSec}s)
- Cámara: ${request.cameraMovement || 'Static'}
- Focal: ${shotDetails.focalMm || 35}mm
- Altura cámara: ${shotDetails.cameraHeight || 'EyeLevel'}
- Iluminación: ${styleProfile === 'DISNEY_PIXAR_3D' ? 'Warm cinematic animation lighting' : shotDetails.lightingStyle || 'Natural soft light'}
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

NEGATIVO OBLIGATORIO: ${styleSettings.negative}

Genera el JSON completo con prompt_text, negative_prompt, continuity_locks, pose_data_per_character, frame_geometry, staging_snapshot, determinism, y negative_constraints.
El prompt_text DEBE ser ultra-específico sobre vestuario, posiciones y luz para garantizar continuidad.
${styleProfile === 'DISNEY_PIXAR_3D' ? 'El prompt_text DEBE especificar estilo Disney-Pixar 3D Animation al inicio.' : ''}`;

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: getSystemPromptForStyle(styleProfile) },
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

// ============================================================================
// STRICT CONTINUITY EDIT PROMPT - For editing from previous keyframe
// ============================================================================
function buildInterframeEditPrompt(
  previousFrameType: string,
  request: KeyframeRequest,
  styleProfile: StyleProfile = 'DISNEY_PIXAR_3D' // NEW: Style profile parameter
): string {
  const shotDetails = request.shotDetails || {};
  const cameraMove = request.cameraMovement || 'static';
  const styleSettings = STYLE_PROFILES[styleProfile];
  
  return `
${styleSettings.lock}

═══════════════════════════════════════════════════════════════════════════════
EDIT MODE: STRICT CONTINUITY (Δt = ${request.timestampSec}s from start) - ${styleProfile}
═══════════════════════════════════════════════════════════════════════════════

EDIT the existing keyframe image. This is ${request.frameType} frame.
Time step from previous: ~1 second. Maintain STRICT continuity IN ${styleProfile} STYLE.

CONTEXT: ${request.sceneDescription}
Shot type: ${request.shotType}
Camera: ${cameraMove}

═══════════════════════════════════════════════════════════════════════════════
ALLOWED CHANGES ONLY (micro-movement for 1 second):
═══════════════════════════════════════════════════════════════════════════════
• Minimal natural movement (small head turn, slight hand shift, a tiny step)
• Very slight camera motion: ${cameraMove !== 'static' ? `subtle ${cameraMove}` : 'none'}
• Micro expression change if dialogue is happening
• Natural eye blink or gaze shift

═══════════════════════════════════════════════════════════════════════════════
FORBIDDEN CHANGES (ABSOLUTE - ZERO TOLERANCE):
═══════════════════════════════════════════════════════════════════════════════
• do NOT change art style (must remain EXACTLY ${styleProfile})
• ${styleProfile === 'DISNEY_PIXAR_3D' ? 'do NOT switch to photorealism or live-action' : 'do NOT switch to cartoon or anime'}
• do NOT add or remove characters
• do NOT change any animal species (dog STAYS dog, cat STAYS cat)
• do NOT change wardrobe, props, background elements
• do NOT change lighting direction or color temperature
• do NOT change framing or shot type beyond micro camera motion
• ${styleProfile === 'DISNEY_PIXAR_3D' ? 'do NOT add realistic skin pores or textures' : 'do NOT smooth skin or add airbrushed effects'}
• do NOT add text, watermarks, or new props

═══════════════════════════════════════════════════════════════════════════════
CONTINUITY LOCKS (MUST MATCH SOURCE IMAGE EXACTLY):
═══════════════════════════════════════════════════════════════════════════════
• Art style: ${styleProfile} (LOCKED)
• All character identities (faces, hair color, age)
• All wardrobe items (colors, textures, patterns)
• All props in scene (positions, types, colors)
• Lighting setup (direction, color, intensity)
• Background/set design

NEGATIVE: ${styleSettings.negative}

Characters: ${request.characters.map(c => c.name).join(', ')}
Keep all identities EXACTLY the same as the source image.
`.trim();
}

async function generateWithLovableAI(
  prompt: string,
  negativePrompt: string,
  referenceImageUrls: string[] = [],
  styleProfile: StyleProfile = 'DISNEY_PIXAR_3D' // NEW: Style profile parameter
): Promise<{ imageUrl: string; seed: number }> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) {
    throw new Error("LOVABLE_API_KEY is not configured");
  }
  
  const styleSettings = STYLE_PROFILES[styleProfile];

  console.log(`[Lovable AI] Generating keyframe with ${IMAGE_MODEL} [style: ${styleProfile}]...`);
  
  // Sanitize prompt to remove banned words for this style
  const sanitizedPrompt = sanitizePromptForStyle(prompt, styleProfile);
  
  // Build final prompt with style lock prefix
  const finalPrompt = `${styleSettings.lock}\n\n${sanitizedPrompt}`;
  const finalNegative = `${negativePrompt}. ${styleSettings.negative}`;
  
  console.log(`[Lovable AI] Prompt sanitized, banned words removed for ${styleProfile}`);
  
  // Build multimodal content if we have references
  type ContentPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };
  const contentParts: ContentPart[] = [
    { type: "text", text: `${finalPrompt}\n\nNEGATIVE: ${finalNegative}` }
  ];
  
  // Add reference images (max 6)
  const validRefs = referenceImageUrls.filter(url => url && url.startsWith('http')).slice(0, 6);
  for (const url of validRefs) {
    contentParts.push({ type: "image_url", image_url: { url } });
  }
  
  console.log(`[Lovable AI] Using ${validRefs.length} reference images`);

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
          content: contentParts
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

// ============================================================================
// EDIT KEYFRAME - For K1/K2 frames using correlative pipeline
// ============================================================================
async function editKeyframeWithLovableAI(
  previousFrameUrl: string,
  editPrompt: string,
  identityAnchors: string[] = []
): Promise<{ imageUrl: string; seed: number }> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) {
    throw new Error("LOVABLE_API_KEY is not configured");
  }

  console.log(`[Lovable AI] Editing keyframe with ${IMAGE_MODEL} (correlative mode)...`);
  
  // Build multimodal content: instruction + source + identity refs
  type ContentPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };
  const contentParts: ContentPart[] = [
    { type: "text", text: editPrompt }
  ];
  
  // Add source image to edit
  if (previousFrameUrl && previousFrameUrl.startsWith('http')) {
    contentParts.push({ type: "image_url", image_url: { url: previousFrameUrl } });
  }
  
  // Add identity anchors (max 4)
  const validAnchors = identityAnchors.filter(url => url && url.startsWith('http')).slice(0, 4);
  for (const url of validAnchors) {
    contentParts.push({ type: "image_url", image_url: { url } });
  }
  
  console.log(`[Lovable AI] Edit mode: source + ${validAnchors.length} identity anchors`);

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
          content: contentParts
        }
      ],
      modalities: ['image', 'text']
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[Lovable AI] Edit error:', response.status, errorText);
    
    if (response.status === 429) {
      throw new Error('Rate limit exceeded. Please try again later.');
    }
    if (response.status === 402) {
      throw new Error('Insufficient credits. Please add funds to your workspace.');
    }
    
    throw new Error(`Lovable AI edit failed: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const imageUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  const seed = Math.floor(Math.random() * 999999);

  if (!imageUrl) {
    console.error('[Lovable AI] No image in edit response:', JSON.stringify(data).substring(0, 500));
    throw new Error('No image generated by Lovable AI edit');
  }

  console.log('[Lovable AI] Keyframe edit complete, seed:', seed);
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

    // Get shot to verify project access AND fetch style_profile from scene
    const { data: shot } = await supabase
      .from('shots')
      .select('scene_id, scenes(project_id, style_profile)')
      .eq('id', request.shotId)
      .single();
    
    const projectId = (shot?.scenes as any)?.project_id;
    const sceneStyleProfile = (shot?.scenes as any)?.style_profile as StyleProfile || 'DISNEY_PIXAR_3D';
    
    console.log(`[generate-keyframe] Using style profile from scene: ${sceneStyleProfile}`);
    
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
    const promptData = await generateKeyframePrompt(request, characterWardrobes, characterIdentities, sceneStyleProfile);
    console.log("Prompt generated:", promptData.prompt_text.substring(0, 150) + "...");
    console.log("Continuity locks:", JSON.stringify(promptData.continuity_locks || {}));

    // Fetch character identity anchors for generation
    const identityAnchors: string[] = [];
    if (characterIds.length > 0) {
      const { data: slots } = await supabase
        .from('character_pack_slots')
        .select('image_url')
        .in('character_id', characterIds)
        .in('slot_type', ['ref_closeup_front', 'closeup_profile', 'identity_primary'])
        .in('status', ['accepted', 'uploaded', 'generated'])
        .not('image_url', 'is', null)
        .limit(6);
      
      for (const slot of slots || []) {
        if (slot.image_url && slot.image_url.startsWith('http')) {
          identityAnchors.push(slot.image_url);
        }
      }
      console.log(`Loaded ${identityAnchors.length} identity anchor images`);
    }

    // Step 2: Generate or Edit image based on correlative pipeline
    let generatedImageUrl: string;
    let seed: number;
    
    // Determine if we should use edit mode (correlative pipeline)
    // Use edit mode when: not initial frame AND have previous keyframe
    const shouldUseEditMode = request.frameType !== 'initial' && request.previousKeyframeUrl;
    
    if (shouldUseEditMode && request.previousKeyframeUrl) {
      // CORRELATIVE MODE: Edit from previous keyframe
      console.log("Step 2: EDIT mode (correlative pipeline) with Lovable AI...");
      console.log("Source frame URL:", request.previousKeyframeUrl.substring(0, 80) + "...");
      
      const editPrompt = buildInterframeEditPrompt(
        request.frameType === 'intermediate' ? 'K0' : 'K1',
        request,
        sceneStyleProfile
      );
      
      const result = await editKeyframeWithLovableAI(
        request.previousKeyframeUrl,
        editPrompt,
        identityAnchors
      );
      
      generatedImageUrl = result.imageUrl;
      seed = result.seed;
      
      console.log("Edit complete (correlative mode)");
    } else {
      // GENERATE MODE: Create new keyframe (K0 or fallback)
      console.log("Step 2: GENERATE mode with Lovable AI (gemini-3-pro-image-preview)...");
      
      const result = await generateWithLovableAI(
        promptData.prompt_text,
        promptData.negative_prompt,
        identityAnchors,
        sceneStyleProfile
      );
      
      generatedImageUrl = result.imageUrl;
      seed = result.seed;
    }

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
    // Determine generation mode for metadata
    const generationMode = shouldUseEditMode ? 'edit' : 'generate';
    
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
          engine: IMAGE_MODEL,
          generation_mode: generationMode,
          correlative_source: shouldUseEditMode ? request.previousKeyframeUrl : null,
          identity_anchors_count: identityAnchors.length,
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
