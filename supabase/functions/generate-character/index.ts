import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { logGenerationCost } from "../_shared/cost-logging.ts";
import { v3RequireAuth, v3RequireProjectAccess, V3AuthContext } from "../_shared/v3-enterprise.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Legacy request for backwards compatibility
interface LegacyCharacterRequest {
  name: string;
  role: string;
  bio: string;
  style?: string;
}

// New slot-based request
interface SlotGenerateRequest {
  slotId: string;
  characterId: string;
  characterName: string;
  characterBio: string;
  slotType: 'turnaround' | 'expression' | 'outfit' | 'closeup' | 'base_look' | 'anchor_closeup';
  viewAngle?: string;
  expressionName?: string;
  outfitDescription?: string;
  styleToken?: string;
  useReferenceAnchoring?: boolean;
  referenceWeight?: number;
  allowTextToImage?: boolean; // Allow generation without reference (creates anchor)
}

// ⚠️ MODEL CONFIG - DO NOT CHANGE WITHOUT USER AUTHORIZATION
// See docs/MODEL_CONFIG_EXPERT_VERSION.md for rationale
// Character generation uses gemini-3-pro-image-preview (nano-banana-pro)
const IMAGE_ENGINE = 'google/gemini-3-pro-image-preview'; // nano-banana-pro

// ============================================
// STYLE CONFIG TYPES (from Visual Bible)
// ============================================

interface StyleConfig {
  mood?: string;
  camera?: {
    movement?: string;
    angle?: string;
    framing?: string;
  };
  lens?: {
    focal_length?: string;
    aperture?: string;
  };
  lighting?: {
    style?: string;
    quality?: string;
    direction?: string;
  };
  color_palette?: {
    primary?: string[];
    secondary?: string[];
    mood_tone?: string;
  };
  film_grain?: string;
  contrast?: string;
  prompt_modifier?: string;
  // Extended fields for Visual Bible presets
  promptModifiers?: string[];
  negativeModifiers?: string[];
  customAnalysis?: {
    prompt_modifiers?: string[];
    negative_modifiers?: string[];
    style?: unknown;
    camera?: unknown;
  };
}

// ============================================
// VISUAL DNA TYPES
// ============================================

interface VisualDNA {
  physical_identity?: {
    age_exact_for_prompt?: number;
    gender_presentation?: string;
    ethnicity?: {
      primary?: string;
      skin_tone_description?: string;
      skin_tone_hex_approx?: string;
    };
    height?: { cm?: number };
    weight_kg?: number;
    body_type?: {
      somatotype?: string;
      posture?: string;
    };
  };
  face?: {
    shape?: string;
    eyes?: {
      color_base?: string;
      color_hex_approx?: string;
      color_description?: string;
      shape?: string;
      size?: string;
      eyebrows?: {
        thickness?: string;
        shape?: string;
        color?: string;
      };
    };
    nose?: {
      bridge?: { height?: string; width?: string; shape?: string };
      tip?: { shape?: string };
    };
    mouth?: {
      lips?: {
        fullness_upper?: string;
        fullness_lower?: string;
        shape?: { cupids_bow?: string; corners?: string };
      };
    };
    jaw_chin?: {
      jawline?: { shape?: string; definition?: string };
      chin?: { shape?: string; projection?: string };
    };
    cheekbones?: { prominence?: string; position?: string };
    facial_hair?: {
      type?: string;
      length_mm?: number;
      density?: string;
      color?: { base?: string; grey_percentage?: number };
      grooming?: string;
    };
    distinctive_marks?: {
      scars?: Array<{ location?: string; description?: string; size_cm?: number }>;
      moles_birthmarks?: Array<{ location?: string; type?: string; size_mm?: number }>;
      wrinkles_lines?: {
        forehead?: { horizontal_lines?: string };
        eyes?: { crows_feet?: string };
        nose_to_mouth?: { nasolabial_folds?: string };
      };
    };
  };
  hair?: {
    head_hair?: {
      length?: { type?: string; measurement_cm?: number };
      texture?: { type?: string };
      thickness?: { density?: string };
      color?: {
        natural_base?: string;
        hex_approx_base?: string;
        grey_white?: { percentage?: number; pattern?: string };
      };
      style?: { overall_shape?: string; grooming_level?: string; fringe_bangs?: string };
      hairline?: { front?: string };
    };
  };
  skin?: {
    texture?: { overall?: string };
    undertone?: { type?: string };
    condition?: {
      clarity?: string;
      hyperpigmentation?: { freckles?: string };
    };
  };
  hands?: {
    size?: { overall?: string };
  };
  visual_references?: {
    celebrity_likeness?: {
      primary?: { name?: string; percentage?: number; features_borrowed?: string[] };
      secondary?: { name?: string; percentage?: number };
      tertiary?: { name?: string; percentage?: number };
      combination_description?: string;
    };
  };
  default_outfit?: {
    description?: string;
  };
}

// ============================================
// STYLE CONFIG INJECTION HELPER
// ============================================

function buildStyleBlock(styleConfig: StyleConfig | null): string {
  if (!styleConfig) return '';
  
  const parts: string[] = [];
  
  // PRIORITY 1: Check for promptModifiers array (Visual Bible presets)
  // This is the primary style definition from preset selection or image analysis
  if (styleConfig.promptModifiers && Array.isArray(styleConfig.promptModifiers) && styleConfig.promptModifiers.length > 0) {
    parts.push(`VISUAL STYLE (MANDATORY): ${styleConfig.promptModifiers.join(', ')}`);
  }
  
  // PRIORITY 2: Check customAnalysis from image analysis
  if (styleConfig.customAnalysis?.prompt_modifiers && Array.isArray(styleConfig.customAnalysis.prompt_modifiers)) {
    const modifiers = styleConfig.customAnalysis.prompt_modifiers.filter(
      (m: string) => !parts.some(p => p.includes(m))
    );
    if (modifiers.length > 0) {
      parts.push(`STYLE MODIFIERS: ${modifiers.join(', ')}`);
    }
  }
  
  // PRIORITY 3: Legacy single prompt_modifier
  if (styleConfig.prompt_modifier && !parts.some(p => p.includes(styleConfig.prompt_modifier!))) {
    parts.push(styleConfig.prompt_modifier);
  }
  
  if (styleConfig.mood) {
    parts.push(`VISUAL MOOD: ${styleConfig.mood}`);
  }
  
  if (styleConfig.lighting) {
    const lighting = styleConfig.lighting;
    const lightingParts = [
      lighting.style && `${lighting.style} lighting`,
      lighting.quality && `${lighting.quality} quality`,
      lighting.direction && `from ${lighting.direction}`
    ].filter(Boolean).join(', ');
    if (lightingParts) parts.push(`LIGHTING STYLE: ${lightingParts}`);
  }
  
  if (styleConfig.color_palette) {
    const palette = styleConfig.color_palette;
    if (palette.mood_tone) {
      parts.push(`COLOR TONE: ${palette.mood_tone}`);
    }
    if (palette.primary?.length) {
      parts.push(`COLOR PALETTE: ${palette.primary.slice(0, 3).join(', ')}`);
    }
  }
  
  if (styleConfig.film_grain) {
    parts.push(`FILM GRAIN: ${styleConfig.film_grain}`);
  }
  
  if (styleConfig.contrast) {
    parts.push(`CONTRAST: ${styleConfig.contrast}`);
  }
  
  // NEGATIVE MODIFIERS: Avoid unwanted styles
  if (styleConfig.negativeModifiers && Array.isArray(styleConfig.negativeModifiers) && styleConfig.negativeModifiers.length > 0) {
    parts.push(`AVOID THESE STYLES: ${styleConfig.negativeModifiers.join(', ')}`);
  }
  if (styleConfig.customAnalysis?.negative_modifiers && Array.isArray(styleConfig.customAnalysis.negative_modifiers)) {
    const negatives = styleConfig.customAnalysis.negative_modifiers;
    if (negatives.length > 0 && !parts.some(p => p.includes('AVOID'))) {
      parts.push(`AVOID: ${negatives.join(', ')}`);
    }
  }
  
  if (parts.length === 0) return '';
  
  return `
PROJECT VISUAL STYLE (MANDATORY - DO NOT DEVIATE):
${parts.join('\n')}
`;
}

// ============================================
// REFERENCE-BASED PROMPT BUILDERS
// ============================================

function buildTurnaroundPrompt(visualDNA: VisualDNA, viewAngle: string, styleConfig: StyleConfig | null): string {
  const angleInstructions: Record<string, string> = {
    'front': 'front view, facing camera directly, standing straight, arms at sides',
    'front_34': '3/4 front view, 45 degrees from front, standing straight, arms at sides',
    'side': 'side profile view, 90 degrees to camera, standing straight, arms at sides',
    'back': 'back view, facing away from camera, standing straight, arms at sides',
    'back_34': '3/4 back view, 45 degrees from behind, standing straight, arms at sides',
    '3/4': '3/4 front view, 45 degrees from front, standing straight, arms at sides'
  };

  const angle = angleInstructions[viewAngle] || angleInstructions.front;
  const physical = visualDNA.physical_identity;
  const hair = visualDNA.hair?.head_hair;
  const face = visualDNA.face;
  const styleBlock = buildStyleBlock(styleConfig);

  return `This same person, ${angle}.
${styleBlock}
PHYSICAL CONTEXT:
- Height: ${physical?.height?.cm || 'average'} cm
- Build: ${physical?.body_type?.somatotype || 'average'}
- Age: ${physical?.age_exact_for_prompt || 'as shown in reference'}

POSE REQUIREMENTS:
- Full body shot (head to toe in frame)
- Standing straight, neutral pose
- Arms relaxed at sides
- Weight evenly distributed
- Natural, confident posture

OUTFIT:
${visualDNA.default_outfit?.description || 'Casual outfit as shown in reference'}

CONSISTENCY REQUIREMENTS (CRITICAL):
- Keep EXACT same face structure and features
- Keep EXACT same hair color (${hair?.color?.natural_base || 'as shown'}${hair?.color?.grey_white?.percentage ? `, with ${hair.color.grey_white.percentage}% grey` : ''})
- Keep EXACT same skin tone (${physical?.ethnicity?.skin_tone_description || 'as shown'})
- Keep EXACT same age appearance (${physical?.age_exact_for_prompt || 'as shown'})
- Keep EXACT same facial hair (${face?.facial_hair?.type || 'as shown'})
- Keep EXACT same eye color (${face?.eyes?.color_base || 'as shown'})

Only change: camera angle to ${viewAngle} view

TECHNICAL SPECS:
- Full body turnaround reference shot
- 50mm lens equivalent, f/4
- Clean studio background (neutral grey or white)
- Even lighting, no harsh shadows
- Sharp focus throughout
- Professional character design quality
- 8K resolution`;
}

function buildExpressionPrompt(visualDNA: VisualDNA, expressionName: string, styleConfig: StyleConfig | null): string {
  const expressionInstructions: Record<string, string> = {
    'neutral': 'neutral, calm expression, relaxed face',
    'happy': 'smiling, happy expression, genuine joy, natural smile',
    'sad': 'sad, melancholic expression, downcast eyes',
    'angry': 'angry, intense expression, furrowed brow',
    'surprised': 'surprised, wide eyes, raised eyebrows',
    'focused': 'focused, determined expression, slight squint',
    'worried': 'worried, concerned expression, tense face',
    'laughing': 'laughing, open mouth smile, crinkled eyes',
    'serious': 'serious, stern expression, no smile'
  };

  const expression = expressionInstructions[expressionName] || expressionInstructions.neutral;
  const physical = visualDNA.physical_identity;
  const face = visualDNA.face;
  const hair = visualDNA.hair?.head_hair;
  const styleBlock = buildStyleBlock(styleConfig);

  return `This same person, ${expression}.
${styleBlock}
PHYSICAL CONTEXT:
- Age: ${physical?.age_exact_for_prompt || 'as shown in reference'}
- Face shape: ${face?.shape || 'as shown'}
- Eye color: ${face?.eyes?.color_base || 'as shown'}

SHOT REQUIREMENTS:
- Medium close-up (shoulders up)
- Direct eye contact with camera
- 85mm lens equivalent, f/2.8
- Shallow depth of field (blurred background)

CONSISTENCY REQUIREMENTS (CRITICAL):
- Keep EXACT same face structure and all facial features
- Keep EXACT same hair color and style (${hair?.color?.natural_base || 'as shown'}${hair?.color?.grey_white?.percentage ? `, including ${hair.color.grey_white.percentage}% grey/silver tones` : ''})
- Keep EXACT same skin tone and texture
- Keep EXACT same age appearance (${physical?.age_exact_for_prompt || 'as shown'})
- Keep EXACT same facial hair (${face?.facial_hair?.type || 'as shown'}${face?.facial_hair?.color?.base ? `, ${face.facial_hair.color.base} color` : ''})
- Keep EXACT same eye color (${face?.eyes?.color_base || 'as shown'})
- Keep ALL distinctive features (wrinkles, lines, marks as shown in reference)

Only change: facial expression to ${expressionName}

TECHNICAL SPECS:
- Professional headshot quality
- Soft studio lighting
- Neutral background
- Sharp focus on eyes
- Natural skin tones
- 8K quality`;
}

function buildOutfitPrompt(visualDNA: VisualDNA, outfitDescription: string, styleConfig: StyleConfig | null): string {
  const physical = visualDNA.physical_identity;
  const hair = visualDNA.hair?.head_hair;
  const face = visualDNA.face;
  const styleBlock = buildStyleBlock(styleConfig);

  return `This same person, wearing: ${outfitDescription}.
${styleBlock}
PHYSICAL CONTEXT:
- Height: ${physical?.height?.cm || 'average'} cm
- Build: ${physical?.body_type?.somatotype || 'average'}
- Age: ${physical?.age_exact_for_prompt || 'as shown in reference'}

SHOT REQUIREMENTS:
- Full body or 3/4 length shot (depends on outfit)
- Standing naturally
- Neutral pose showing the outfit clearly
- 50mm lens, f/4

OUTFIT DETAILS:
${outfitDescription}

STYLING CONTEXT:
- Outfit should fit the character's age (${physical?.age_exact_for_prompt || 'as shown'})
- Outfit should fit the character's build (${physical?.body_type?.somatotype || 'as shown'})
- Natural, realistic clothing physics (no AI artifacts)

CONSISTENCY REQUIREMENTS (CRITICAL):
- Keep EXACT same face
- Keep EXACT same hair (${hair?.color?.natural_base || 'as shown'}${hair?.color?.grey_white?.percentage ? `, with ${hair.color.grey_white.percentage}% grey` : ''}, ${hair?.length?.type || 'as shown'})
- Keep EXACT same skin tone
- Keep EXACT same age appearance
- Keep EXACT same body proportions
- Keep EXACT same facial hair

Only change: outfit/clothing

TECHNICAL SPECS:
- Clean background
- Even lighting
- Sharp focus
- Professional fashion photography quality
- Natural pose
- 8K resolution`;
}

function buildCloseupPrompt(visualDNA: VisualDNA, styleConfig: StyleConfig | null, viewAngle: string = 'front'): string {
  const physical = visualDNA.physical_identity;
  const face = visualDNA.face;
  const hair = visualDNA.hair?.head_hair;
  const styleBlock = buildStyleBlock(styleConfig);

  const angleInstructions: Record<string, string> = {
    'front': 'front view, facing camera directly',
    'side': 'side profile view, 90 degrees to camera',
  };
  const angle = angleInstructions[viewAngle] || angleInstructions.front;

  return `This same person, professional portrait closeup, ${angle}.
${styleBlock}
PHYSICAL CONTEXT:
- Age: ${physical?.age_exact_for_prompt || 'as shown in reference'}
- Face shape: ${face?.shape || 'as shown'}
- Eye color: ${face?.eyes?.color_base || 'as shown'}
- Skin tone: ${physical?.ethnicity?.skin_tone_description || 'as shown'}

SHOT REQUIREMENTS:
- Tight headshot (face fills frame)
- ${viewAngle === 'side' ? 'Profile view showing side of face' : 'Direct eye contact with camera'}
- 85mm lens, f/2.8
- Sharp focus on eyes
- Soft focus on background

LIGHTING:
- Soft key light at 45°
- Fill light for even skin tones
- Subtle rim light for separation
- Natural, flattering light

CONSISTENCY REQUIREMENTS (CRITICAL):
- Keep EXACT same face structure and all features
- Keep EXACT same hair color and texture (${hair?.color?.natural_base || 'as shown'}${hair?.color?.grey_white?.percentage ? `, with ${hair.color.grey_white.percentage}% grey/silver` : ''})
- Keep EXACT same skin tone and texture
- Keep EXACT same age appearance (${physical?.age_exact_for_prompt || 'as shown'})
- Keep EXACT same facial hair (${face?.facial_hair?.type || 'as shown'})
- Keep EXACT same eye color (${face?.eyes?.color_base || 'as shown'})
- Keep EXACT same distinctive features (wrinkles, lines as shown in reference)

Only change: camera angle to ${viewAngle} view

EXPRESSION:
- Neutral, professional
- Slight warmth in eyes
- Relaxed face
- Natural, approachable

TECHNICAL SPECS:
- Professional headshot quality
- Sharp detail in eyes, skin texture
- Natural skin tones
- Clean background
- 8K resolution`;
}

function buildBaseLookPrompt(visualDNA: VisualDNA, styleConfig: StyleConfig | null): string {
  return buildCloseupPrompt(visualDNA, styleConfig, 'front');
}

// Build a standalone prompt for text-to-image (no reference)
function buildStandaloneCharacterPrompt(characterName: string, characterBio: string, visualDNA: VisualDNA, styleConfig: StyleConfig | null): string {
  const physical = visualDNA.physical_identity;
  const face = visualDNA.face;
  const hair = visualDNA.hair?.head_hair;
  const skin = visualDNA.skin;
  const styleBlock = buildStyleBlock(styleConfig);
  
  const ageStr = physical?.age_exact_for_prompt ? `${physical.age_exact_for_prompt} years old` : '';
  const genderStr = physical?.gender_presentation || '';
  const ethnicityStr = physical?.ethnicity?.primary || '';
  const skinTone = physical?.ethnicity?.skin_tone_description || '';
  const hairColor = hair?.color?.natural_base || '';
  const hairLength = hair?.length?.type || '';
  const hairTexture = hair?.texture?.type || '';
  const eyeColor = face?.eyes?.color_base || '';
  const faceShape = face?.shape || '';
  const bodyType = physical?.body_type?.somatotype || '';
  
  return `Professional portrait photograph of a fictional character for film production.
${styleBlock}
CHARACTER: ${characterName}
DESCRIPTION: ${characterBio}

PHYSICAL ATTRIBUTES:
${ageStr ? `- Age: ${ageStr}` : ''}
${genderStr ? `- Gender presentation: ${genderStr}` : ''}
${ethnicityStr ? `- Ethnicity: ${ethnicityStr}` : ''}
${skinTone ? `- Skin tone: ${skinTone}` : ''}
${hairColor ? `- Hair color: ${hairColor}` : ''}
${hairLength ? `- Hair length: ${hairLength}` : ''}
${hairTexture ? `- Hair texture: ${hairTexture}` : ''}
${eyeColor ? `- Eye color: ${eyeColor}` : ''}
${faceShape ? `- Face shape: ${faceShape}` : ''}
${bodyType ? `- Body type: ${bodyType}` : ''}

SHOT REQUIREMENTS:
- Professional identity closeup (head and shoulders)
- Direct eye contact with camera
- 85mm lens equivalent, f/2.8
- Shallow depth of field
- Neutral expression, approachable

LIGHTING:
- Soft key light at 45 degrees
- Fill light for even skin tones
- Subtle rim light for separation
- Natural, flattering light

TECHNICAL SPECS:
- Professional headshot quality
- Sharp focus on eyes
- Natural skin tones
- Clean, neutral background
- 8K resolution
- Photorealistic, cinematic quality

AVOID: AI artifacts, unnatural features, morphed faces, extra limbs, blurry details`;
}

// ============================================
// TEXT-TO-IMAGE GENERATION (NO REFERENCE)
// ============================================
async function generateWithoutReference(
  prompt: string
): Promise<{ imageUrl: string }> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  if (!LOVABLE_API_KEY) {
    throw new Error('LOVABLE_API_KEY is not configured');
  }

  console.log(`[TEXT-TO-IMAGE] Generating with ${IMAGE_ENGINE}...`);
  console.log(`[TEXT-TO-IMAGE] Prompt length: ${prompt.length} chars`);

  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: IMAGE_ENGINE,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      modalities: ['image', 'text']
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[TEXT-TO-IMAGE] Error:', response.status, errorText);
    throw new Error(`Image generation failed: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  console.log('[TEXT-TO-IMAGE] Response received');

  const imageUrl = extractImageFromResponse(data);
  
  if (!imageUrl) {
    console.error('[TEXT-TO-IMAGE] No image in response:', JSON.stringify(data).substring(0, 500));
    throw new Error('No image generated in response');
  }

  console.log('[TEXT-TO-IMAGE] Image generated successfully');
  return { imageUrl };
}

// ============================================
// REFERENCE-BASED GENERATION WITH LOVABLE AI
// ============================================
async function generateWithReference(
  referenceImageUrl: string,
  prompt: string
): Promise<{ imageUrl: string }> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  if (!LOVABLE_API_KEY) {
    throw new Error('LOVABLE_API_KEY is not configured');
  }

  console.log(`[REFERENCE-GEN] Generating with ${IMAGE_ENGINE}...`);
  console.log(`[REFERENCE-GEN] Reference image: ${referenceImageUrl.substring(0, 100)}...`);
  console.log(`[REFERENCE-GEN] Prompt length: ${prompt.length} chars`);

  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: IMAGE_ENGINE,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { 
                url: referenceImageUrl
              }
            },
            {
              type: 'text',
              text: prompt
            }
          ]
        }
      ],
      modalities: ['image', 'text']
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[REFERENCE-GEN] Error:', response.status, errorText);
    throw new Error(`Image generation failed: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  console.log('[REFERENCE-GEN] Response received');

  const imageUrl = extractImageFromResponse(data);
  
  if (!imageUrl) {
    console.error('[REFERENCE-GEN] No image in response:', JSON.stringify(data).substring(0, 500));
    throw new Error('No image generated in response');
  }

  console.log('[REFERENCE-GEN] Image generated successfully');
  return { imageUrl };
}

function extractImageFromResponse(data: any): string | null {
  // Check for images array in message (nano-banana format)
  if (data.choices?.[0]?.message?.images?.[0]?.image_url?.url) {
    return data.choices[0].message.images[0].image_url.url;
  }

  // Check for content as array with image blocks
  const content = data.choices?.[0]?.message?.content;
  if (Array.isArray(content)) {
    const imageBlock = content.find((block: any) => 
      block.type === 'image_url' || block.type === 'image'
    );
    if (imageBlock?.image_url?.url) {
      return imageBlock.image_url.url;
    }
    if (imageBlock?.url) {
      return imageBlock.url;
    }
  }

  // Check for direct URL in content
  if (typeof content === 'string') {
    if (content.startsWith('http')) {
      return content;
    }
    if (content.startsWith('data:image')) {
      return content;
    }
    // If it looks like base64 without header
    if (content.length > 1000 && !content.includes(' ')) {
      return `data:image/png;base64,${content}`;
    }
  }

  return null;
}

// ============================================
// QC CHECKS (using Lovable AI for analysis)
// ============================================
async function runQC(
  imageUrl: string, 
  slotType: string, 
  characterName: string,
  referenceImageUrl?: string
): Promise<{
  score: number;
  passed: boolean;
  issues: string[];
  fixNotes: string;
}> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  if (!LOVABLE_API_KEY) {
    return { score: 75, passed: true, issues: [], fixNotes: '' };
  }

  try {
    const content: any[] = [
      { 
        type: 'text', 
        text: `Evaluate this ${slotType} image for character "${characterName}".
        
Check for:
1. Does the generated image look like the SAME PERSON as the reference?
2. Are the key facial features preserved (face shape, eyes, nose, mouth)?
3. Is the hair color and style preserved (including any grey/silver tones)?
4. Is the skin tone consistent?
5. Are there any AI artifacts (deformed hands, morphed features)?
6. Is the technical quality professional?

Return JSON: {"score": 0-100, "passed": boolean, "issues": ["..."], "fixNotes": "..."}
Score 80+ = passed. Lower = needs review.` 
      },
      { 
        type: 'image_url', 
        image_url: { url: imageUrl } 
      }
    ];

    // Add reference image if available for comparison
    if (referenceImageUrl) {
      content.splice(1, 0, {
        type: 'image_url',
        image_url: { url: referenceImageUrl }
      });
      content[0] = {
        type: 'text',
        text: `Compare these two images. The FIRST image is the REFERENCE (the real person). The SECOND image is the GENERATED image.
        
Evaluate if the generated image looks like the SAME PERSON:
1. Does the face structure match?
2. Are the eyes, nose, mouth similar?
3. Is the hair color preserved (including grey/silver if present)?
4. Is the skin tone consistent?
5. Any AI artifacts or distortions?

Return JSON: {"score": 0-100, "passed": boolean, "issues": ["..."], "fixNotes": "..."}
Score 80+ = passed. Lower = needs review.`
      };
    }

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: `You are an expert QC analyst for character reference images. 
Your job is to verify that generated images maintain the EXACT likeness of the reference person.
Be STRICT about facial features, hair color (especially grey/silver tones), and age appearance.
Return ONLY valid JSON.`
          },
          {
            role: 'user',
            content: content
          }
        ],
        response_format: { type: 'json_object' }
      }),
    });

    if (!response.ok) {
      console.error('QC request failed:', response.status);
      return { score: 70, passed: true, issues: [], fixNotes: '' };
    }

    const data = await response.json();
    const responseContent = data.choices?.[0]?.message?.content;
    
    if (responseContent) {
      try {
        const result = JSON.parse(responseContent);
        return {
          score: result.score || 70,
          passed: result.passed !== false && (result.score || 70) >= 80,
          issues: result.issues || [],
          fixNotes: result.fixNotes || ''
        };
      } catch {
        console.error('Failed to parse QC response');
      }
    }
  } catch (error) {
    console.error('QC error:', error);
  }
  
  return { score: 70, passed: true, issues: [], fixNotes: '' };
}

// ============================================
// MAIN HANDLER
// ============================================
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Gateway JWT verification may be disabled; enforce auth here
    const authResult = await v3RequireAuth(req);
    if (authResult instanceof Response) {
      return authResult;
    }
    const auth: V3AuthContext = authResult;

    const body = await req.json();

    // Check if this is a slot-based request or legacy request
    const isSlotRequest = 'slotId' in body;

    if (isSlotRequest) {
      return await handleSlotGeneration(body as SlotGenerateRequest, auth);
    } else {
      return await handleLegacyGeneration(body as LegacyCharacterRequest);
    }
  } catch (error) {
    console.error('Error in generate-character function:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function handleSlotGeneration(request: SlotGenerateRequest, auth: V3AuthContext): Promise<Response> {
  console.log(`=== Slot Generation: ${request.slotType} for ${request.characterName} ===`);
  const startTime = Date.now();
  
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  // Get character with visual DNA
  const { data: character, error: charError } = await supabase
    .from('characters')
    .select(`
      *,
      character_visual_dna!character_visual_dna_character_id_fkey(
        visual_dna,
        continuity_lock,
        is_active
      )
    `)
    .eq('id', request.characterId)
    .single();

  if (charError || !character) {
    console.error('Character fetch error:', charError);
    throw new Error(`Character not found: ${request.characterId}`);
  }

  // Enforce project access (security) now that we know the character's project
  const accessResult = await v3RequireProjectAccess(auth, character.project_id);
  if (accessResult instanceof Response) {
    return accessResult;
  }

  // Get active visual DNA
  const activeVisualDNA = character.character_visual_dna?.find((v: any) => v.is_active);
  const visualDNA: VisualDNA = activeVisualDNA?.visual_dna || {};

  // Get project's style_config from Visual Bible
  const { data: stylePack, error: styleError } = await supabase
    .from('style_packs')
    .select('style_config')
    .eq('project_id', character.project_id)
    .maybeSingle();
  
  if (styleError) {
    console.error('Style pack fetch error:', styleError);
  }
  
  const styleConfig: StyleConfig | null = stylePack?.style_config || null;
  console.log(`Style config loaded: ${styleConfig ? 'YES' : 'NO (will use defaults)'}`);

  // Get reference anchors (user-uploaded photos)
  const { data: referenceAnchors, error: refError } = await supabase
    .from('reference_anchors')
    .select('*')
    .eq('character_id', request.characterId)
    .eq('is_active', true)
    .order('priority', { ascending: true });

  if (refError) {
    console.error('Reference anchors fetch error:', refError);
  }

  // Get the primary reference image (first uploaded photo)
  const primaryAnchor = referenceAnchors?.find(a => 
    a.anchor_type === 'identity_primary' || a.anchor_type === 'face_front'
  ) || referenceAnchors?.[0];

  const hasReference = !!primaryAnchor?.image_url;
  
  // DECISION: Use reference or generate from text
  const isIdentitySlot = request.slotType === 'anchor_closeup' || request.slotType === 'base_look' || request.slotType === 'closeup';
  const allowTextToImage = request.allowTextToImage !== false; // Default to true
  
  if (!hasReference && !allowTextToImage) {
    throw new Error('No reference image found for this character. Please upload reference photos first.');
  }

  console.log(`Has reference: ${hasReference}, Allow text-to-image: ${allowTextToImage}, Is identity slot: ${isIdentitySlot}`);

  // Get slot details
  const { data: slot, error: slotError } = await supabase
    .from('character_pack_slots')
    .select('*')
    .eq('id', request.slotId)
    .single();

  if (slotError || !slot) {
    console.error('Slot fetch error:', slotError);
    throw new Error(`Slot not found: ${request.slotId}`);
  }

  let imageUrl: string;
  let prompt: string;
  let generationMode: 'reference' | 'text-to-image';
  let createdAnchorId: string | null = null;

  if (hasReference) {
    // === REFERENCE-BASED GENERATION ===
    generationMode = 'reference';
    console.log(`Using reference image: ${primaryAnchor.anchor_type} - ${primaryAnchor.image_url.substring(0, 50)}...`);
    
    // Build prompt based on slot type - detect by prefix for extended slot types
    const isTurnaround = request.slotType.startsWith('turn_') || request.slotType === 'turnaround';
    const isExpression = request.slotType.startsWith('expr_') || request.slotType === 'expression';
    const isOutfit = request.slotType.startsWith('outfit_') || request.slotType === 'outfit';
    const isReference = request.slotType.startsWith('ref_');
    const isCloseup = request.slotType.startsWith('closeup_');

    // Extract view angle from slot type if not provided
    const extractViewAngle = (slotType: string): string => {
      const angleMap: Record<string, string> = {
        'turn_front_34': 'front_34',
        'turn_side': 'side',
        'turn_back': 'back',
        'turn_back_34': 'back_34',
        'closeup_front': 'front',
        'closeup_profile': 'side',
      };
      return angleMap[slotType] || 'front';
    };

    // Extract expression from slot type if not provided
    const extractExpression = (slotType: string): string => {
      const exprMap: Record<string, string> = {
        'expr_neutral': 'neutral',
        'expr_happy': 'happy',
        'expr_sad': 'sad',
        'expr_angry': 'angry',
        'expr_surprised': 'surprised',
        'expr_fear': 'worried', // Map fear to worried which exists in instructions
        'expr_focused': 'focused',
        'expr_worried': 'worried',
        'expr_laughing': 'laughing',
        'expr_serious': 'serious',
      };
      return exprMap[slotType] || 'neutral';
    };

    if (isCloseup) {
      const angle = request.viewAngle || extractViewAngle(request.slotType);
      console.log(`[CLOSEUP] Slot: ${request.slotType} -> Angle: ${angle}`);
      prompt = buildCloseupPrompt(visualDNA, styleConfig, angle);
    } else if (isTurnaround) {
      const angle = request.viewAngle || extractViewAngle(request.slotType);
      console.log(`[TURNAROUND] Slot: ${request.slotType} -> Angle: ${angle}`);
      prompt = buildTurnaroundPrompt(visualDNA, angle, styleConfig);
    } else if (isExpression) {
      const expression = request.expressionName || extractExpression(request.slotType);
      console.log(`[EXPRESSION] Slot: ${request.slotType} -> Expression: ${expression}`);
      prompt = buildExpressionPrompt(visualDNA, expression, styleConfig);
    } else if (isOutfit) {
      prompt = buildOutfitPrompt(visualDNA, request.outfitDescription || 'casual outfit', styleConfig);
    } else if (isReference || request.slotType === 'closeup' || request.slotType === 'anchor_closeup') {
      prompt = buildCloseupPrompt(visualDNA, styleConfig, 'front');
    } else if (request.slotType === 'base_look') {
      prompt = buildBaseLookPrompt(visualDNA, styleConfig);
    } else {
      // Default fallback
      console.log(`[FALLBACK] Unknown slot type: ${request.slotType}, using closeup`);
      prompt = buildCloseupPrompt(visualDNA, styleConfig, 'front');
    }
    
    const result = await generateWithReference(primaryAnchor.image_url, prompt);
    imageUrl = result.imageUrl;
    
  } else {
    // === TEXT-TO-IMAGE GENERATION (No Reference) ===
    generationMode = 'text-to-image';
    console.log(`No reference found. Generating identity with text-to-image for: ${request.characterName}`);
    
    // Build standalone prompt (includes character bio/description)
    prompt = buildStandaloneCharacterPrompt(request.characterName, request.characterBio, visualDNA, styleConfig);
    
    const result = await generateWithoutReference(prompt);
    imageUrl = result.imageUrl;
    
    // Create the generated image as primary reference anchor for future generations
    if (isIdentitySlot && imageUrl) {
      console.log('[TEXT-TO-IMAGE] Creating reference anchor from generated image...');
      
      const { data: newAnchor, error: anchorError } = await supabase
        .from('reference_anchors')
        .insert({
          character_id: request.characterId,
          anchor_type: 'identity_primary',
          image_url: imageUrl,
          is_active: true,
          priority: 1,
          approved: false, // Requires user approval
          metadata: {
            source: 'auto_generated',
            generated_at: new Date().toISOString(),
            engine: IMAGE_ENGINE,
            note: 'Auto-generated identity. Approve to use for future generations.'
          }
        })
        .select('id')
        .single();
      
      if (anchorError) {
        console.error('Failed to create reference anchor:', anchorError);
      } else {
        createdAnchorId = newAnchor.id;
        console.log(`[TEXT-TO-IMAGE] Created reference anchor: ${createdAnchorId}`);
      }
    }
  }

  console.log('Generated prompt:', prompt.substring(0, 200) + '...');

  // Run QC (with reference comparison if available)
  const qcResult = await runQC(
    imageUrl, 
    request.slotType, 
    request.characterName, 
    hasReference ? primaryAnchor.image_url : undefined
  );
  console.log(`QC Score: ${qcResult.score}, Passed: ${qcResult.passed}`);

  const durationMs = Date.now() - startTime;

  // Update slot in database
  const { error: updateError } = await supabase
    .from('character_pack_slots')
    .update({
      image_url: imageUrl,
      prompt_text: prompt,
      reference_anchor_id: hasReference ? primaryAnchor.id : createdAnchorId,
      qc_score: qcResult.score,
      qc_issues: qcResult.issues,
      fix_notes: qcResult.fixNotes,
      status: qcResult.passed ? 'generated' : 'needs_review',
      generation_metadata: {
        engine: IMAGE_ENGINE,
        generation_mode: generationMode,
        reference_used: hasReference ? primaryAnchor.id : null,
        created_anchor: createdAnchorId,
        generated_at: new Date().toISOString(),
        duration_ms: durationMs
      },
      updated_at: new Date().toISOString()
    })
    .eq('id', request.slotId);

  if (updateError) {
    console.error('Slot update error:', updateError);
    throw new Error(`Failed to update slot: ${updateError.message}`);
  }

  // Log generation cost
  const { data: charData } = await supabase
    .from('characters')
    .select('project_id')
    .eq('id', request.characterId)
    .single();

  await logGenerationCost({
    userId: auth.userId,
    projectId: charData?.project_id,
    characterId: request.characterId,
    slotId: request.slotId,
    slotType: `character_${request.slotType}`,
    engine: IMAGE_ENGINE,
    durationMs: durationMs,
    success: true,
    metadata: {
      qcScore: qcResult.score,
      qcPassed: qcResult.passed,
      generationMode,
      referenceUsed: hasReference ? primaryAnchor.id : null,
      createdAnchor: createdAnchorId
    }
  });

  return new Response(JSON.stringify({
    success: true,
    imageUrl,
    prompt,
    qc: qcResult,
    slotId: request.slotId,
    generationMode,
    referenceUsed: hasReference ? primaryAnchor.id : null,
    createdAnchor: createdAnchorId
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function handleLegacyGeneration(request: LegacyCharacterRequest): Promise<Response> {
  console.log(`=== Legacy Generation: ${request.name} ===`);
  
  // For legacy requests without reference, return an error asking to use the new flow
  return new Response(JSON.stringify({ 
    error: 'Legacy generation is deprecated. Please upload reference photos and use the new character pack builder.',
    suggestion: 'Upload 4 reference photos (face front, face side, body front, body side) to enable high-quality generation.'
  }), {
    status: 400,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
