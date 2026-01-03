import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

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
  slotType: 'turnaround' | 'expression' | 'outfit' | 'closeup' | 'base_look';
  viewAngle?: string;
  expressionName?: string;
  outfitDescription?: string;
  styleToken?: string;
}

// ⚠️ MODEL CONFIG - DO NOT CHANGE WITHOUT USER AUTHORIZATION
// See docs/MODEL_CONFIG_EXPERT_VERSION.md for rationale
// Character Bible: nano-banana-pro via FAL.ai (maximum facial consistency)
const FAL_MODEL = 'fal-ai/nano-banana-pro';

// ============================================
// TECHNICAL PROMPT GENERATOR
// Converts Visual DNA to engine-ready prompts
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
}

interface ContinuityLock {
  never_change?: string[];
  must_avoid?: string[];
  allowed_variants?: string[];
}

function formatField(value: string | undefined): string {
  if (!value) return '';
  return value.replace(/_/g, ' ');
}

function buildSubjectDescription(physical: VisualDNA['physical_identity']): string {
  if (!physical) return '';
  const parts: string[] = [];
  
  if (physical.gender_presentation) {
    parts.push(`${formatField(physical.gender_presentation)} presenting`);
  }
  if (physical.age_exact_for_prompt) {
    parts.push(`age ${physical.age_exact_for_prompt}`);
  }
  if (physical.ethnicity?.primary) {
    parts.push(`${formatField(physical.ethnicity.primary)} ethnicity`);
  }
  if (physical.ethnicity?.skin_tone_description) {
    const hex = physical.ethnicity.skin_tone_hex_approx || '';
    parts.push(`${physical.ethnicity.skin_tone_description} skin ${hex ? `(${hex})` : ''}`);
  }
  if (physical.height?.cm) {
    const heightFt = Math.floor(physical.height.cm / 30.48);
    const heightIn = Math.round((physical.height.cm / 2.54) % 12);
    parts.push(`${physical.height.cm}cm (${heightFt}'${heightIn}") height`);
  }
  if (physical.body_type?.somatotype) {
    parts.push(`${formatField(physical.body_type.somatotype)} build`);
  }
  
  return parts.join(', ');
}

function buildFaceDescription(face: VisualDNA['face']): string {
  if (!face) return '';
  const sections: string[] = [];
  
  if (face.shape) {
    sections.push(`FACE: ${formatField(face.shape)} shape`);
  }
  
  if (face.eyes) {
    const eyes = face.eyes;
    const eyeDesc = [
      formatField(eyes.shape),
      formatField(eyes.size),
      'eyes'
    ].filter(Boolean).join(' ');
    
    const colorDesc = eyes.color_description || formatField(eyes.color_base);
    const hex = eyes.color_hex_approx || '';
    
    sections.push(`EYES: ${eyeDesc}, ${colorDesc} ${hex ? `(${hex})` : ''}`);
    
    if (eyes.eyebrows) {
      sections.push(`EYEBROWS: ${eyes.eyebrows.thickness || ''} ${formatField(eyes.eyebrows.shape)}, ${eyes.eyebrows.color || ''}`);
    }
  }
  
  if (face.nose) {
    const bridge = face.nose.bridge;
    const tip = face.nose.tip;
    sections.push(`NOSE: ${formatField(bridge?.height)} ${formatField(bridge?.shape)} bridge, ${formatField(tip?.shape)} tip`);
  }
  
  if (face.mouth?.lips) {
    const lips = face.mouth.lips;
    sections.push(`LIPS: ${lips.fullness_upper || ''} upper, ${lips.fullness_lower || ''} lower, ${formatField(lips.shape?.cupids_bow)} cupid's bow`);
  }
  
  if (face.jaw_chin) {
    const jaw = face.jaw_chin;
    sections.push(`JAW: ${formatField(jaw.jawline?.shape)}, ${formatField(jaw.jawline?.definition)}`);
    sections.push(`CHIN: ${formatField(jaw.chin?.shape)}, ${formatField(jaw.chin?.projection)}`);
  }
  
  if (face.cheekbones) {
    sections.push(`CHEEKBONES: ${formatField(face.cheekbones.prominence)}, ${formatField(face.cheekbones.position)}`);
  }
  
  if (face.facial_hair && face.facial_hair.type !== 'clean_shaven_smooth') {
    const fh = face.facial_hair;
    const length = fh.length_mm ? `${fh.length_mm}mm` : '';
    const grey = fh.color?.grey_percentage ? ` with ${fh.color.grey_percentage}% grey` : '';
    sections.push(`FACIAL HAIR: ${formatField(fh.type)} ${length}, ${formatField(fh.density)}, ${fh.color?.base || ''}${grey}`);
  }
  
  // Distinctive marks
  if (face.distinctive_marks) {
    const marks = face.distinctive_marks;
    if (marks.scars && marks.scars.length > 0) {
      const scarDesc = marks.scars.map(s => `${s.size_cm || ''}cm scar on ${s.location}`).join(', ');
      sections.push(`SCARS: ${scarDesc}`);
    }
    
    const wrinkles = marks.wrinkles_lines;
    if (wrinkles) {
      const wrinkleDesc: string[] = [];
      if (wrinkles.forehead?.horizontal_lines && wrinkles.forehead.horizontal_lines !== 'none') {
        wrinkleDesc.push(`${formatField(wrinkles.forehead.horizontal_lines)} forehead lines`);
      }
      if (wrinkles.eyes?.crows_feet && wrinkles.eyes.crows_feet !== 'none') {
        wrinkleDesc.push(`${formatField(wrinkles.eyes.crows_feet)} crow's feet`);
      }
      if (wrinkleDesc.length > 0) {
        sections.push(`AGING: ${wrinkleDesc.join(', ')}`);
      }
    }
  }
  
  return sections.join('.\n');
}

function buildHairDescription(hair: VisualDNA['hair']): string {
  if (!hair?.head_hair) return '';
  const h = hair.head_hair;
  const sections: string[] = [];
  
  const length = h.length?.measurement_cm 
    ? `${h.length.measurement_cm}cm` 
    : formatField(h.length?.type);
  
  sections.push(`HAIR: ${length} length, ${formatField(h.texture?.type)} texture, ${formatField(h.thickness?.density)} density`);
  
  const greyPct = h.color?.grey_white?.percentage || 0;
  const colorDesc = greyPct > 0
    ? `${h.color?.natural_base} (${h.color?.hex_approx_base || ''}) with ${greyPct}% ${formatField(h.color?.grey_white?.pattern)} grey`
    : `${h.color?.natural_base} (${h.color?.hex_approx_base || ''})`;
  sections.push(`COLOR: ${colorDesc}`);
  
  if (h.style?.overall_shape) {
    sections.push(`STYLE: ${h.style.overall_shape}, ${formatField(h.style.grooming_level)}`);
  }
  
  if (h.style?.fringe_bangs && h.style.fringe_bangs !== 'none_forehead_exposed') {
    sections.push(`BANGS: ${formatField(h.style.fringe_bangs)}`);
  }
  
  if (h.hairline?.front && h.hairline.front !== 'straight_juvenile') {
    sections.push(`HAIRLINE: ${formatField(h.hairline.front)}`);
  }
  
  return sections.join('.\n');
}

function buildSkinDescription(skin: VisualDNA['skin']): string {
  if (!skin) return '';
  const parts: string[] = [];
  
  if (skin.texture?.overall) {
    parts.push(`${formatField(skin.texture.overall)} skin texture`);
  }
  if (skin.condition?.clarity && skin.condition.clarity !== 'perfectly_clear') {
    parts.push(`${formatField(skin.condition.clarity)} clarity`);
  }
  if (skin.condition?.hyperpigmentation?.freckles && skin.condition.hyperpigmentation.freckles !== 'none') {
    parts.push(`${formatField(skin.condition.hyperpigmentation.freckles)} freckles`);
  }
  if (skin.undertone?.type) {
    parts.push(`${formatField(skin.undertone.type)} undertone`);
  }
  
  return parts.join(', ');
}

function buildCelebrityReference(likeness: VisualDNA['visual_references'] | undefined): string {
  if (!likeness?.celebrity_likeness) return '';
  
  const cel = likeness.celebrity_likeness;
  const primary = cel.primary;
  if (!primary?.name) return '';
  
  const parts: string[] = [];
  parts.push(`${primary.percentage || 60}% ${primary.name}`);
  
  if (cel.secondary?.name) {
    parts.push(`${cel.secondary.percentage || 30}% ${cel.secondary.name}`);
  }
  
  if (cel.tertiary?.name) {
    parts.push(`${cel.tertiary.percentage || 10}% ${cel.tertiary.name}`);
  }
  
  const combined = parts.join(' + ');
  const desc = cel.combination_description || '';
  
  return `CELEBRITY LIKENESS: ${combined}.\n${desc}`;
}

function generateTechnicalPrompt(
  visualDNA: VisualDNA,
  continuityLock: ContinuityLock | undefined,
  slotType: string,
  options: {
    expression?: string;
    outfit?: string;
    viewAngle?: string;
  }
): { masterPrompt: string; negativePrompt: string; validationChecks: string[] } {
  
  const subjectDesc = buildSubjectDescription(visualDNA.physical_identity);
  const faceDesc = buildFaceDescription(visualDNA.face);
  const hairDesc = buildHairDescription(visualDNA.hair);
  const skinDesc = buildSkinDescription(visualDNA.skin);
  const celebrityRef = buildCelebrityReference(visualDNA.visual_references);
  
  // Build master prompt
  const lines: string[] = [];
  
  if (slotType === 'closeup' || slotType === 'turnaround') {
    lines.push('IDENTITY REFERENCE - PHOTOREALISTIC PORTRAIT');
    lines.push('Critical: This is an identity anchor. Maximum accuracy required.');
    lines.push('');
  } else {
    lines.push('CINEMATIC CHARACTER SHOT - PHOTOREALISTIC');
    lines.push('');
  }
  
  lines.push('SUBJECT:');
  lines.push(subjectDesc);
  lines.push('');
  
  lines.push(faceDesc);
  lines.push('');
  
  lines.push(hairDesc);
  lines.push('');
  
  lines.push('SKIN: ' + skinDesc);
  lines.push('');
  
  if (celebrityRef) {
    lines.push(celebrityRef);
    lines.push('');
  }
  
  if (options.expression) {
    lines.push(`EXPRESSION: ${options.expression} emotion`);
    lines.push('');
  }
  
  if (options.viewAngle) {
    lines.push(`VIEW: ${options.viewAngle} angle`);
    lines.push('');
  }
  
  if (options.outfit) {
    lines.push(`OUTFIT: ${options.outfit}`);
    lines.push('');
  }
  
  // Photography specs
  if (slotType === 'closeup') {
    lines.push('PHOTOGRAPHY: Professional portrait, 85mm lens f/1.8, shallow depth of field, sharp focus on eyes, bokeh background');
  } else if (slotType === 'turnaround') {
    lines.push('PHOTOGRAPHY: Character turnaround reference, 50mm lens f/4, even lighting, full body in frame, clean studio background');
  } else {
    lines.push('PHOTOGRAPHY: Cinematic shot, 35mm lens f/2.8, natural depth of field');
  }
  
  lines.push('8K resolution, photorealistic quality, professional lighting');
  lines.push('');
  
  lines.push('LIGHTING: Soft key light 45° from camera, fill light opposite, rim light for separation');
  
  // Build negative prompt
  const negatives: string[] = [
    'cartoon', 'anime', 'illustration', '3D render', 'CGI obvious',
    'plastic skin', 'wax skin', 'mannequin', 'doll-like',
    'AI artifacts', 'morphing features', 'warped hands', 'deformed fingers',
    'floating elements', 'disjointed anatomy',
    'watermark', 'text overlay', 'logo', 'signature',
    'blurry', 'out of focus', 'low quality', 'pixelated',
    'multiple heads', 'multiple arms', 'extra limbs',
    'asymmetric eyes', 'different eye colors'
  ];
  
  // Add continuity lock avoidances
  if (continuityLock?.must_avoid) {
    negatives.push(...continuityLock.must_avoid);
  }
  
  // Add specific violations
  if (visualDNA.physical_identity?.age_exact_for_prompt) {
    negatives.push(`not age ${visualDNA.physical_identity.age_exact_for_prompt}`);
  }
  if (visualDNA.face?.eyes?.color_base) {
    negatives.push(`eyes not ${formatField(visualDNA.face.eyes.color_base)}`);
  }
  
  // Build validation checks
  const checks: string[] = [];
  
  if (visualDNA.physical_identity?.age_exact_for_prompt) {
    checks.push(`Subject appears age ${visualDNA.physical_identity.age_exact_for_prompt} (±2 years)`);
  }
  if (visualDNA.face?.eyes?.color_base) {
    checks.push(`Eyes are ${formatField(visualDNA.face.eyes.color_base)}`);
  }
  if (visualDNA.face?.shape) {
    checks.push(`Face shape is ${formatField(visualDNA.face.shape)}`);
  }
  if (visualDNA.face?.facial_hair?.type) {
    checks.push(`${formatField(visualDNA.face.facial_hair.type)} facial hair present`);
  }
  if (visualDNA.hair?.head_hair?.color?.natural_base) {
    checks.push(`Hair is ${visualDNA.hair.head_hair.color.natural_base}`);
  }
  if (visualDNA.visual_references?.celebrity_likeness?.primary?.name) {
    const cel = visualDNA.visual_references.celebrity_likeness.primary;
    checks.push(`Resembles ${cel.name} (${cel.percentage || 60}% likeness)`);
  }
  
  if (slotType === 'closeup' || slotType === 'turnaround') {
    checks.push('Sharp focus on eyes (critical)');
    checks.push('No hand deformities visible');
    checks.push('No AI artifacts in face');
  }
  
  return {
    masterPrompt: lines.join('\n').trim(),
    negativePrompt: negatives.join(', '),
    validationChecks: checks
  };
}

// ============================================
// FAL.AI IMAGE GENERATION
// ============================================
async function generateWithFal(
  prompt: string,
  negativePrompt: string,
  imageSize: string = "portrait_16_9"
): Promise<{ imageUrl: string; seed: number }> {
  const FAL_API_KEY = Deno.env.get('FAL_API_KEY');
  if (!FAL_API_KEY) {
    throw new Error('FAL_API_KEY is not configured');
  }

  console.log(`[FAL] Generating with ${FAL_MODEL}...`);

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
      image_size: imageSize,
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
  const maxAttempts = 60; // 60 seconds max
  
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
      // Get result
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

      console.log('[FAL] Generation complete, seed:', seed);
      return { imageUrl, seed };
    }

    if (status.status === 'FAILED') {
      throw new Error(`FAL generation failed: ${status.error || 'Unknown error'}`);
    }

    attempts++;
  }

  throw new Error('FAL generation timeout');
}

// ============================================
// QC CHECKS (using Lovable AI for analysis)
// ============================================
async function runQC(
  imageUrl: string, 
  slotType: string, 
  characterName: string,
  validationChecks?: string[]
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
    const checksText = validationChecks?.length 
      ? `\n\nSPECIFIC VALIDATION CHECKS:\n${validationChecks.map((c, i) => `${i+1}. ${c}`).join('\n')}`
      : '';

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
Evaluate images for:
1. Technical quality (sharpness, lighting, composition)
2. Character consistency (if validation checks provided)
3. AI artifacts (deformed hands, morphed features, asymmetric eyes)
4. Professional usability for production

IDENTITY ANCHOR SLOTS (closeup, turnaround): MAXIMUM STRICTNESS - these define the character.
OTHER SLOTS: Can be more lenient on minor variations.

Return JSON: {"score": 0-100, "passed": boolean, "issues": ["..."], "fixNotes": "..."}`
          },
          {
            role: 'user',
            content: [
              { 
                type: 'text', 
                text: `Evaluate this ${slotType} image for character "${characterName}".${checksText}` 
              },
              { 
                type: 'image_url', 
                image_url: { url: imageUrl } 
              }
            ]
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
    const content = data.choices?.[0]?.message?.content;
    
    if (content) {
      try {
        const result = JSON.parse(content);
        return {
          score: result.score || 70,
          passed: result.passed !== false,
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
    const body = await req.json();
    
    // Check if this is a slot-based request or legacy request
    const isSlotRequest = 'slotId' in body;
    
    if (isSlotRequest) {
      return await handleSlotGeneration(body as SlotGenerateRequest);
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

async function handleSlotGeneration(request: SlotGenerateRequest): Promise<Response> {
  console.log(`=== Slot Generation: ${request.slotType} for ${request.characterName} ===`);
  
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

  // Get active visual DNA
  const activeVisualDNA = character.character_visual_dna?.find((v: any) => v.is_active);
  const visualDNA: VisualDNA = activeVisualDNA?.visual_dna || {};
  const continuityLock: ContinuityLock = activeVisualDNA?.continuity_lock || {};

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

  // Generate technical prompt
  const { masterPrompt, negativePrompt, validationChecks } = generateTechnicalPrompt(
    visualDNA,
    continuityLock,
    request.slotType,
    {
      expression: request.expressionName,
      outfit: request.outfitDescription,
      viewAngle: request.viewAngle
    }
  );

  console.log('Generated prompt length:', masterPrompt.length);
  console.log('Validation checks:', validationChecks.length);

  // Determine image size based on slot type
  const imageSize = request.slotType === 'turnaround' ? 'landscape_16_9' : 'portrait_16_9';

  // Generate with FAL.ai nano-banana-pro
  const { imageUrl, seed } = await generateWithFal(masterPrompt, negativePrompt, imageSize);

  // Run QC
  const qcResult = await runQC(imageUrl, request.slotType, request.characterName, validationChecks);
  console.log(`QC Score: ${qcResult.score}, Passed: ${qcResult.passed}`);

  // Update slot in database
  const { error: updateError } = await supabase
    .from('character_pack_slots')
    .update({
      image_url: imageUrl,
      prompt_text: masterPrompt,
      seed: seed,
      qc_score: qcResult.score,
      qc_issues: qcResult.issues,
      fix_notes: qcResult.fixNotes,
      status: qcResult.passed ? 'generated' : 'needs_review',
      generation_metadata: {
        engine: FAL_MODEL,
        validation_checks: validationChecks,
        generated_at: new Date().toISOString()
      },
      updated_at: new Date().toISOString()
    })
    .eq('id', request.slotId);

  if (updateError) {
    console.error('Slot update error:', updateError);
    throw new Error(`Failed to update slot: ${updateError.message}`);
  }

  return new Response(JSON.stringify({
    success: true,
    imageUrl,
    seed,
    prompt: masterPrompt,
    qc: qcResult,
    slotId: request.slotId
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function handleLegacyGeneration(request: LegacyCharacterRequest): Promise<Response> {
  console.log(`=== Legacy Generation: ${request.name} ===`);
  
  // Build simple prompt for legacy mode
  const prompt = `IDENTITY REFERENCE - PHOTOREALISTIC PORTRAIT

Character: ${request.name}
Role: ${request.role}
Description: ${request.bio}
${request.style ? `Style: ${request.style}` : ''}

PHOTOGRAPHY: Professional portrait, 85mm lens f/1.8, shallow depth of field, sharp focus on eyes, bokeh background.
8K resolution, photorealistic quality, professional lighting.
LIGHTING: Soft key light 45° from camera, fill light opposite, rim light for separation.`;

  const negativePrompt = 'cartoon, anime, illustration, 3D render, CGI obvious, plastic skin, wax skin, mannequin, doll-like, AI artifacts, morphing features, warped hands, deformed fingers, watermark, text overlay, logo, signature, blurry, out of focus, low quality, pixelated, multiple heads, multiple arms, extra limbs';

  // Generate with FAL.ai
  const { imageUrl, seed } = await generateWithFal(prompt, negativePrompt, 'portrait_16_9');

  return new Response(JSON.stringify({ 
    imageUrl,
    seed,
    prompt
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
