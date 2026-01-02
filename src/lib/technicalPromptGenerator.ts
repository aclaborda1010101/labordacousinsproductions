// ============================================
// TECHNICAL PROMPT GENERATOR
// Converts Visual DNA to engine-ready prompts
// ============================================

import type { CharacterVisualDNA } from './visualDNASchema';

export interface PromptContext {
  purpose: 'identity_closeup' | 'identity_turnaround' | 'expression' | 'outfit' | 'scene_shot';
  expression?: string;
  outfit_description?: string;
  view_angle?: string;
  scene_context?: {
    lighting?: string;
    environment?: string;
    mood?: string;
    time_of_day?: string;
  };
  engine?: 'gemini_image' | 'veo' | 'kling' | 'midjourney' | 'flux';
}

export interface TechnicalPrompt {
  master_prompt: string;
  negative_prompt: string;
  technical_params: {
    width: number;
    height: number;
    steps?: number;
    cfg_scale?: number;
    seed?: number;
  };
  validation_checks: string[];
  reference_requirements: string[];
  metadata: {
    character_id?: string;
    visual_dna_version: number;
    generated_at: string;
    purpose: string;
  };
}

// ============================================
// MAIN FUNCTION
// ============================================

export function generateTechnicalPrompt(
  visualDNA: CharacterVisualDNA,
  context: PromptContext
): TechnicalPrompt {
  const physical = visualDNA.physical_identity;
  const face = visualDNA.face;
  const hair = visualDNA.hair.head_hair;
  const skin = visualDNA.skin;
  const refs = visualDNA.visual_references;

  // Build components
  const subjectDescription = buildSubjectDescription(physical);
  const faceDescription = buildFaceDescription(face);
  const hairDescription = buildHairDescription(hair, face.facial_hair);
  const skinDescription = buildSkinDescription(skin);
  const celebrityReference = buildCelebrityReference(refs.celebrity_likeness);
  const photographySpecs = buildPhotographySpecs(context);
  const lightingSpecs = buildLightingSpecs(context.scene_context);

  // Assemble master prompt
  const masterPrompt = assembleMasterPrompt({
    purpose: context.purpose,
    subject: subjectDescription,
    face: faceDescription,
    hair: hairDescription,
    skin: skinDescription,
    celebrity: celebrityReference,
    photography: photographySpecs,
    lighting: lightingSpecs,
    expression: context.expression,
    outfit: context.outfit_description,
    viewAngle: context.view_angle,
    sceneContext: context.scene_context,
  });

  // Build negative prompt
  const negativePrompt = buildNegativePrompt(visualDNA, context);

  // Build validation checks
  const validationChecks = buildValidationChecks(visualDNA, context);

  // Build reference requirements
  const referenceRequirements = buildReferenceRequirements(context);

  // Technical parameters
  const technicalParams = getTechnicalParams(context);

  return {
    master_prompt: masterPrompt,
    negative_prompt: negativePrompt,
    technical_params: technicalParams,
    validation_checks: validationChecks,
    reference_requirements: referenceRequirements,
    metadata: {
      character_id: visualDNA.character_id,
      visual_dna_version: visualDNA.version,
      generated_at: new Date().toISOString(),
      purpose: context.purpose,
    },
  };
}

// ============================================
// COMPONENT BUILDERS
// ============================================

function buildSubjectDescription(physical: CharacterVisualDNA['physical_identity']): string {
  const parts: string[] = [];

  // Gender & Age
  parts.push(`${physical.gender_presentation} presenting`);
  parts.push(`age ${physical.age_exact_for_prompt}`);

  // Ethnicity & Skin
  const ethnicity = physical.ethnicity.primary.replace(/_/g, ' ');
  parts.push(`${ethnicity} ethnicity`);
  parts.push(`${physical.ethnicity.skin_tone_description} (${physical.ethnicity.skin_tone_hex_approx})`);

  // Height & Build
  const heightFt = Math.floor(physical.height.cm / 30.48);
  const heightIn = Math.round((physical.height.cm / 2.54) % 12);
  parts.push(`${physical.height.cm}cm (${heightFt}'${heightIn}") height`);
  parts.push(`${physical.body_type.somatotype.replace(/_/g, ' ')} build`);
  parts.push(`${physical.body_type.posture.replace(/_/g, ' ')} posture`);

  return parts.join(', ');
}

function buildFaceDescription(face: CharacterVisualDNA['face']): string {
  const sections: string[] = [];

  // Face shape
  sections.push(`FACE: ${face.shape.replace(/_/g, ' ')} shape`);

  // Eyes - CRITICAL
  const eyes = face.eyes;
  sections.push(
    `EYES: ${eyes.shape.replace(/_/g, ' ')} ${eyes.size.replace(/_/g, ' ')} eyes, ` +
    `${eyes.color_description} (${eyes.color_base.replace(/_/g, ' ')}, ${eyes.color_hex_approx}), ` +
    `${eyes.distance.replace(/_/g, ' ')} spacing`
  );

  // Eyebrows
  sections.push(
    `EYEBROWS: ${eyes.eyebrows.thickness} ${eyes.eyebrows.shape.replace(/_/g, ' ')}, ` +
    `${eyes.eyebrows.grooming.replace(/_/g, ' ')}, ${eyes.eyebrows.color}`
  );

  // Nose
  const nose = face.nose;
  sections.push(
    `NOSE: ${nose.bridge.height.replace(/_/g, ' ')} ${nose.bridge.shape.replace(/_/g, ' ')} bridge, ` +
    `${nose.bridge.width.replace(/_/g, ' ')} width, ${nose.tip.shape.replace(/_/g, ' ')} tip, ` +
    `${nose.nostrils.shape.replace(/_/g, ' ')} nostrils`
  );

  // Mouth & Lips
  const mouth = face.mouth;
  sections.push(
    `LIPS: ${mouth.lips.fullness_upper} upper lip, ${mouth.lips.fullness_lower} lower lip, ` +
    `${mouth.lips.shape.cupids_bow.replace(/_/g, ' ')} cupid's bow, ` +
    `${mouth.lips.shape.corners.replace(/_/g, ' ')} corners`
  );

  // Jaw & Chin
  const jaw = face.jaw_chin;
  sections.push(
    `JAW: ${jaw.jawline.shape.replace(/_/g, ' ')} jawline, ` +
    `${jaw.jawline.definition.replace(/_/g, ' ')} definition`
  );
  sections.push(
    `CHIN: ${jaw.chin.shape.replace(/_/g, ' ')}, ${jaw.chin.projection.replace(/_/g, ' ')} projection`
  );

  // Cheekbones
  sections.push(
    `CHEEKBONES: ${face.cheekbones.prominence.replace(/_/g, ' ')}, ` +
    `${face.cheekbones.position.replace(/_/g, ' ')} position`
  );

  // Distinctive marks
  if (face.distinctive_marks.scars.length > 0) {
    const scarDesc = face.distinctive_marks.scars
      .map((s) => `${s.size_cm}cm ${s.color.replace(/_/g, ' ')} scar on ${s.location}`)
      .join(', ');
    sections.push(`SCARS: ${scarDesc}`);
  }

  if (face.distinctive_marks.moles_birthmarks.length > 0) {
    const moleDesc = face.distinctive_marks.moles_birthmarks
      .map((m) => `${m.size_mm}mm ${m.type.replace(/_/g, ' ')} on ${m.location}`)
      .join(', ');
    sections.push(`MARKS: ${moleDesc}`);
  }

  // Wrinkles (if present)
  const wrinkles = face.distinctive_marks.wrinkles_lines;
  const wrinkleDesc: string[] = [];
  if (wrinkles.forehead.horizontal_lines !== 'none') {
    wrinkleDesc.push(`${wrinkles.forehead.horizontal_lines.replace(/_/g, ' ')} forehead lines`);
  }
  if (wrinkles.eyes.crows_feet !== 'none') {
    wrinkleDesc.push(`${wrinkles.eyes.crows_feet.replace(/_/g, ' ')} crow's feet`);
  }
  if (wrinkles.nose_to_mouth.nasolabial_folds !== 'none_smooth') {
    wrinkleDesc.push(`${wrinkles.nose_to_mouth.nasolabial_folds.replace(/_/g, ' ')} nasolabial folds`);
  }
  if (wrinkleDesc.length > 0) {
    sections.push(`AGING: ${wrinkleDesc.join(', ')}`);
  }

  return sections.join('.\n');
}

function buildHairDescription(
  hair: CharacterVisualDNA['hair']['head_hair'],
  facialHair: CharacterVisualDNA['face']['facial_hair']
): string {
  const sections: string[] = [];

  // Head hair
  const length = hair.length.measurement_cm
    ? `${hair.length.measurement_cm}cm`
    : hair.length.type.replace(/_/g, ' ');

  sections.push(
    `HAIR: ${length} length, ${hair.texture.type.replace(/_/g, ' ')} texture, ` +
    `${hair.thickness.density.replace(/_/g, ' ')} density`
  );

  // Hair color with grey
  const colorDesc =
    hair.color.grey_white.percentage > 0
      ? `${hair.color.natural_base} (${hair.color.hex_approx_base}) with ${hair.color.grey_white.percentage}% ${hair.color.grey_white.pattern.replace(/_/g, ' ')} grey`
      : `${hair.color.natural_base} (${hair.color.hex_approx_base})`;
  sections.push(`COLOR: ${colorDesc}`);

  // Style
  sections.push(`STYLE: ${hair.style.overall_shape}, ${hair.style.grooming_level.replace(/_/g, ' ')}`);

  if (hair.style.fringe_bangs !== 'none_forehead_exposed') {
    sections.push(`BANGS: ${hair.style.fringe_bangs.replace(/_/g, ' ')}`);
  }

  // Hairline
  if (hair.hairline.front !== 'straight_juvenile') {
    sections.push(`HAIRLINE: ${hair.hairline.front.replace(/_/g, ' ')}`);
  }

  // Facial hair
  if (facialHair.type !== 'clean_shaven_smooth') {
    const fhLength = facialHair.length_mm ? `${facialHair.length_mm}mm` : '';
    const fhGrey =
      facialHair.color.grey_percentage > 0
        ? ` with ${facialHair.color.grey_percentage}% grey`
        : '';
    sections.push(
      `FACIAL HAIR: ${facialHair.type.replace(/_/g, ' ')} ${fhLength}, ` +
      `${facialHair.density.replace(/_/g, ' ')}, ${facialHair.color.base}${fhGrey}, ` +
      `${facialHair.grooming.replace(/_/g, ' ')}`
    );
  } else {
    sections.push('FACIAL HAIR: clean shaven');
  }

  return sections.join('.\n');
}

function buildSkinDescription(skin: CharacterVisualDNA['skin']): string {
  const parts: string[] = [];

  // Texture
  parts.push(`${skin.texture.overall.replace(/_/g, ' ')} skin texture`);

  // Condition
  if (skin.condition.clarity !== 'perfectly_clear') {
    parts.push(`${skin.condition.clarity.replace(/_/g, ' ')} clarity`);
  }

  // Hyperpigmentation
  if (skin.condition.hyperpigmentation.freckles !== 'none') {
    parts.push(`${skin.condition.hyperpigmentation.freckles.replace(/_/g, ' ')} freckles`);
  }

  // Undertone
  parts.push(`${skin.undertone.type.replace(/_/g, ' ')} undertone`);

  return parts.join(', ');
}

function buildCelebrityReference(
  likeness: CharacterVisualDNA['visual_references']['celebrity_likeness']
): string {
  if (!likeness.primary?.name) return '';

  const parts: string[] = [];

  parts.push(`${likeness.primary.percentage}% ${likeness.primary.name}`);

  if (likeness.secondary?.name) {
    parts.push(`${likeness.secondary.percentage}% ${likeness.secondary.name}`);
  }

  if (likeness.tertiary?.name) {
    parts.push(`${likeness.tertiary.percentage}% ${likeness.tertiary.name}`);
  }

  const combined = parts.join(' + ');

  return `CELEBRITY LIKENESS: ${combined}.\n${likeness.combination_description || ''}`;
}

function buildPhotographySpecs(context: PromptContext): string {
  const specs: string[] = [];

  if (context.purpose.includes('identity') || context.purpose === 'identity_closeup') {
    specs.push('Professional portrait photography');
    specs.push('85mm lens f/1.8');
    specs.push('shallow depth of field');
    specs.push('sharp focus on eyes');
    specs.push('bokeh background blur');
  } else if (context.purpose === 'identity_turnaround') {
    specs.push('Character turnaround reference sheet');
    specs.push('50mm lens f/4');
    specs.push('even depth of field');
    specs.push('full body in frame');
    specs.push('clean studio background');
  } else {
    specs.push('Cinematic shot');
    specs.push('35mm lens f/2.8');
    specs.push('natural depth of field');
  }

  specs.push('8K resolution');
  specs.push('photorealistic quality');
  specs.push('professional lighting');

  return specs.join(', ');
}

function buildLightingSpecs(sceneContext?: PromptContext['scene_context']): string {
  if (!sceneContext?.lighting) {
    return 'Soft key light 45° from camera, fill light opposite, rim light for separation';
  }

  return sceneContext.lighting;
}

// ============================================
// ASSEMBLY
// ============================================

function assembleMasterPrompt(components: {
  purpose: string;
  subject: string;
  face: string;
  hair: string;
  skin: string;
  celebrity: string;
  photography: string;
  lighting: string;
  expression?: string;
  outfit?: string;
  viewAngle?: string;
  sceneContext?: PromptContext['scene_context'];
}): string {
  const lines: string[] = [];

  // Header
  if (components.purpose.includes('identity')) {
    lines.push('IDENTITY REFERENCE - PHOTOREALISTIC PORTRAIT');
    lines.push('Critical: This is an identity anchor. Maximum accuracy required.');
  } else {
    lines.push('CINEMATIC CHARACTER SHOT - PHOTOREALISTIC');
  }

  lines.push('');

  // Subject
  lines.push('SUBJECT:');
  lines.push(components.subject);
  lines.push('');

  // Face
  lines.push(components.face);
  lines.push('');

  // Hair
  lines.push(components.hair);
  lines.push('');

  // Skin
  lines.push('SKIN: ' + components.skin);
  lines.push('');

  // Celebrity reference
  if (components.celebrity) {
    lines.push(components.celebrity);
    lines.push('');
  }

  // Expression
  if (components.expression) {
    lines.push(`EXPRESSION: ${components.expression} emotion`);
    lines.push('');
  }

  // View angle
  if (components.viewAngle) {
    lines.push(`VIEW: ${components.viewAngle} angle`);
    lines.push('');
  }

  // Outfit
  if (components.outfit) {
    lines.push(`OUTFIT: ${components.outfit}`);
    lines.push('');
  }

  // Scene context
  if (components.sceneContext) {
    if (components.sceneContext.environment) {
      lines.push(`ENVIRONMENT: ${components.sceneContext.environment}`);
    }
    if (components.sceneContext.time_of_day) {
      lines.push(`TIME: ${components.sceneContext.time_of_day}`);
    }
    if (components.sceneContext.mood) {
      lines.push(`MOOD: ${components.sceneContext.mood}`);
    }
    lines.push('');
  }

  // Photography
  lines.push('PHOTOGRAPHY:');
  lines.push(components.photography);
  lines.push('');

  // Lighting
  lines.push('LIGHTING:');
  lines.push(components.lighting);

  return lines.join('\n').trim();
}

function buildNegativePrompt(
  visualDNA: CharacterVisualDNA,
  _context: PromptContext
): string {
  const negatives: string[] = [
    // AI artifacts
    'cartoon',
    'anime',
    'illustration',
    '3D render',
    'CGI obvious',
    'plastic skin',
    'wax skin',
    'mannequin',
    'doll-like',
    'AI artifacts',
    'morphing features',
    'warped hands',
    'deformed fingers',
    'floating elements',
    'disjointed anatomy',

    // Overlays
    'watermark',
    'text overlay',
    'logo',
    'signature',
    'copyright mark',
    'subtitles',
    'captions',

    // Quality issues
    'blurry',
    'out of focus',
    'low quality',
    'pixelated',
    'compressed',
    'jpeg artifacts',
    'noise',
    'grain excessive',

    // Unnatural elements
    'multiple heads',
    'multiple arms',
    'extra limbs',
    'missing limbs',
    'asymmetric eyes',
    'different eye colors',
    'teeth showing when mouth closed',
    'tongue visible inappropriately',
  ];

  // Add continuity locks
  const locks = visualDNA.continuity_lock;
  if (locks?.must_avoid?.length > 0) {
    negatives.push(...locks.must_avoid);
  }

  // Add specific field violations
  negatives.push(`not age ${visualDNA.physical_identity.age_exact_for_prompt}`);
  negatives.push(`eyes not ${visualDNA.face.eyes.color_base.replace(/_/g, ' ')}`);
  negatives.push(`face not ${visualDNA.face.shape.replace(/_/g, ' ')}`);

  return negatives.join(', ');
}

function buildValidationChecks(
  visualDNA: CharacterVisualDNA,
  context: PromptContext
): string[] {
  const checks: string[] = [];

  const age = visualDNA.physical_identity.age_exact_for_prompt;
  checks.push(`Subject appears age ${age} (±2 years tolerance)`);
  checks.push(`Eyes are ${visualDNA.face.eyes.color_base.replace(/_/g, ' ')}`);
  checks.push(`Face shape is ${visualDNA.face.shape.replace(/_/g, ' ')}`);
  checks.push(`${visualDNA.face.facial_hair.type.replace(/_/g, ' ')} facial hair present`);
  checks.push(`Hair is ${visualDNA.hair.head_hair.color.natural_base}`);

  if (context.purpose.includes('identity')) {
    checks.push('Sharp focus on eyes (critical)');
    checks.push('No hand deformities visible');
    checks.push('No AI artifacts in face');
    checks.push('Skin texture appears natural');
  }

  // Celebrity likeness
  if (visualDNA.visual_references.celebrity_likeness.primary?.name) {
    checks.push(
      `Resembles ${visualDNA.visual_references.celebrity_likeness.primary.name} ` +
        `(${visualDNA.visual_references.celebrity_likeness.primary.percentage}% likeness)`
    );
  }

  return checks;
}

function buildReferenceRequirements(context: PromptContext): string[] {
  const reqs: string[] = [];

  if (context.purpose.includes('identity')) {
    reqs.push('Previous approved identity closeup (for consistency check)');
    reqs.push('Celebrity reference images if available');
  }

  if (context.purpose === 'scene_shot') {
    reqs.push('Character pack identity anchors');
    reqs.push('Previous scene shot end frame (for continuity)');
  }

  return reqs;
}

function getTechnicalParams(context: PromptContext): TechnicalPrompt['technical_params'] {
  const baseParams = {
    steps: 50,
    cfg_scale: 7.5,
  };

  if (context.purpose === 'identity_closeup') {
    return {
      width: 768,
      height: 1024,
      ...baseParams,
    };
  }

  if (context.purpose === 'identity_turnaround') {
    return {
      width: 1024,
      height: 1024,
      ...baseParams,
    };
  }

  // Scene shots - 16:9
  return {
    width: 1024,
    height: 576,
    ...baseParams,
  };
}

export default generateTechnicalPrompt;
