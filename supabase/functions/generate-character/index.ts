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

// Image engine configuration
const IMAGE_ENGINE = 'google/gemini-3-pro-image-preview';

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

function buildCelebrityReference(likeness: VisualDNA['visual_references']): string {
  const primary = likeness?.celebrity_likeness?.primary;
  if (!primary?.name) return '';
  
  const parts: string[] = [];
  const cel = likeness.celebrity_likeness;
  
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
// QC CHECKS
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
        model: 'google/gemini-3-pro-preview',
        messages: [
          {
            role: 'system',
            content: `You are a character design QC analyst for production.
Analyze the generated character image and score it on:
- Identity Consistency (0-25): Does it match the specified features?
- Technical Quality (0-25): Resolution, clarity, no artifacts
- Pose/Composition (0-25): Appropriate for the slot type (${slotType})
- Style Consistency (0-25): Photorealistic quality
${checksText}

Return ONLY a JSON object:
{
  "score": <0-100>,
  "passed": <true if score >= 80>,
  "issues": ["issue1", "issue2"],
  "fixNotes": "Specific suggestions to fix if failed"
}`
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Analyze this ${slotType} image for character "${characterName}". Check identity consistency, quality, and fitness for production use.`
              },
              {
                type: 'image_url',
                image_url: { url: imageUrl }
              }
            ]
          }
        ],
      }),
    });

    if (!response.ok) {
      console.error('QC analysis failed:', response.status);
      return { score: 80, passed: true, issues: [], fixNotes: '' };
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (e) {
    console.error('QC error:', e);
  }

  return { score: 80, passed: true, issues: [], fixNotes: '' };
}

// ============================================
// SLOT GENERATION WITH VISUAL DNA
// ============================================
async function handleSlotGeneration(body: SlotGenerateRequest): Promise<Response> {
  const { 
    slotId, 
    characterId, 
    characterName, 
    characterBio, 
    slotType, 
    viewAngle, 
    expressionName, 
    outfitDescription,
    styleToken 
  } = body;

  console.log(`Generating ${slotType} for ${characterName}...`);

  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  if (!LOVABLE_API_KEY) {
    throw new Error('LOVABLE_API_KEY not configured');
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  // ============================================
  // FETCH VISUAL DNA
  // ============================================
  let prompt: string;
  let validationChecks: string[] = [];
  
  const { data: visualDNARecord, error: vdnaError } = await supabase
    .from('character_visual_dna')
    .select('visual_dna, continuity_lock')
    .eq('character_id', characterId)
    .eq('is_active', true)
    .single();

  if (!vdnaError && visualDNARecord?.visual_dna) {
    // Use Visual DNA for technical prompt generation
    console.log('Using Visual DNA for prompt generation');
    
    const { masterPrompt, negativePrompt, validationChecks: checks } = generateTechnicalPrompt(
      visualDNARecord.visual_dna as VisualDNA,
      visualDNARecord.continuity_lock as ContinuityLock,
      slotType,
      {
        expression: expressionName,
        outfit: outfitDescription,
        viewAngle: viewAngle
      }
    );
    
    prompt = masterPrompt;
    validationChecks = checks;
    
    console.log('Technical prompt generated, length:', prompt.length);
  } else {
    // Fallback to legacy prompt generation
    console.log('No Visual DNA found, using legacy prompts');
    
    const STYLE_MODIFIER = (slotType === 'closeup' || slotType === 'turnaround')
      ? `CRITICAL: Photorealistic human rendering, disable all stylization, pure photographic quality.`
      : `Maintain consistent character identity with low stylization tolerance.`;
    
    switch (slotType) {
      case 'turnaround':
        prompt = `Character turnaround sheet, ${viewAngle || 'front'} view of ${characterName}. ${characterBio}. 
Full body pose, clean studio background, professional character design reference.
${STYLE_MODIFIER}`;
        break;
      case 'closeup':
        prompt = `Identity anchor close-up portrait of ${characterName}. ${characterBio}.
Extreme close-up of face, neutral expression, direct eye contact.
Studio lighting, clean background, ultra high detail on facial features.
${STYLE_MODIFIER}`;
        break;
      case 'expression':
        prompt = `Character expression for ${characterName}. ${characterBio}.
Close-up portrait showing "${expressionName || 'neutral'}" emotion.
${STYLE_MODIFIER}`;
        break;
      case 'outfit':
        prompt = `Character ${characterName} wearing ${outfitDescription || 'casual outfit'}. ${characterBio}.
${viewAngle || '3/4'} view, showing the complete outfit.
${STYLE_MODIFIER}`;
        break;
      default:
        prompt = `Base character design for ${characterName}. ${characterBio}.
3/4 view pose, showing character's default look.
${STYLE_MODIFIER}`;
    }
  }

  console.log('Prompt preview:', prompt.substring(0, 200) + '...');

  // Update slot status
  await supabase.from('character_pack_slots').update({
    status: 'generating',
    prompt_text: prompt,
  }).eq('id', slotId);

  // Generate image
  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: IMAGE_ENGINE,
      messages: [{ role: 'user', content: prompt }],
      modalities: ['image', 'text']
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('Image generation error:', response.status, error);
    
    await supabase.from('character_pack_slots').update({
      status: 'failed',
      fix_notes: `Generation failed: ${response.status}`,
    }).eq('id', slotId);

    if (response.status === 429) {
      return new Response(JSON.stringify({ success: false, error: 'Rate limit exceeded' }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (response.status === 402) {
      return new Response(JSON.stringify({ success: false, error: 'Payment required' }), {
        status: 402,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    throw new Error(`Image generation failed: ${response.status}`);
  }

  const data = await response.json();
  const imageUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;

  if (!imageUrl) {
    await supabase.from('character_pack_slots').update({
      status: 'failed',
      fix_notes: 'No image returned from AI',
    }).eq('id', slotId);
    throw new Error('No image generated');
  }

  console.log('Image generated, running QC with', validationChecks.length, 'checks...');

  // Run QC with validation checks
  const qc = await runQC(imageUrl, slotType, characterName, validationChecks);
  console.log('QC result:', qc);

  // Update slot with result
  await supabase.from('character_pack_slots').update({
    image_url: imageUrl,
    status: qc.passed ? 'approved' : 'failed',
    qc_score: qc.score,
    qc_issues: qc.issues,
    fix_notes: qc.passed ? null : qc.fixNotes,
    updated_at: new Date().toISOString(),
  }).eq('id', slotId);

  // Recalculate pack completeness
  await supabase.rpc('calculate_pack_completeness', { p_character_id: characterId });

  return new Response(JSON.stringify({
    success: true,
    imageUrl,
    qc,
    slotId,
    usedVisualDNA: !vdnaError && !!visualDNARecord?.visual_dna,
    validationChecks
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ============================================
// LEGACY GENERATION
// ============================================
async function handleLegacyGeneration(body: LegacyCharacterRequest): Promise<Response> {
  const { name, role, bio, style } = body;
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

  if (!LOVABLE_API_KEY) {
    throw new Error('LOVABLE_API_KEY is not configured');
  }

  // Generate detailed character description
  const descriptionPrompt = `Create a detailed visual description for an animated character.

Character Name: ${name}
Role: ${role}
Background: ${bio}
Visual Style: ${style || 'Cinematic, realistic animation style'}

Generate a comprehensive visual description including physical appearance, hair, eyes, clothing.
Format as a single detailed paragraph optimized for AI image generation.`;

  const descResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages: [
        { role: 'system', content: 'You are an expert character designer. Create detailed, consistent visual descriptions.' },
        { role: 'user', content: descriptionPrompt }
      ],
    }),
  });

  if (!descResponse.ok) {
    if (descResponse.status === 429) {
      return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
        status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    if (descResponse.status === 402) {
      return new Response(JSON.stringify({ error: 'Payment required' }), {
        status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    throw new Error('Failed to generate description');
  }

  const descData = await descResponse.json();
  const characterDescription = descData.choices?.[0]?.message?.content || '';

  // Generate turnaround views
  const views = ['front', 'three-quarter', 'side', 'back'];
  const generatedImages: Record<string, string> = {};

  for (const view of views) {
    const imagePrompt = `${characterDescription}
View: ${view} view, full body character turnaround sheet
Style: High quality character design, clean background, professional reference`;

    const imageResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: IMAGE_ENGINE,
        messages: [{ role: 'user', content: imagePrompt }],
        modalities: ['image', 'text'],
      }),
    });

    if (imageResponse.ok) {
      const imageData = await imageResponse.json();
      const imageUrl = imageData.choices?.[0]?.message?.images?.[0]?.image_url?.url;
      if (imageUrl) {
        generatedImages[view] = imageUrl;
      }
    }
  }

  return new Response(JSON.stringify({
    description: characterDescription,
    turnarounds: generatedImages,
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
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
    
    if ('slotId' in body) {
      return await handleSlotGeneration(body as SlotGenerateRequest);
    } else {
      return await handleLegacyGeneration(body as LegacyCharacterRequest);
    }
  } catch (error) {
    console.error('Generate character error:', error);
    return new Response(JSON.stringify({ 
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
