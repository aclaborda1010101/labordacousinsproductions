import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Engine-specific configurations
const ENGINE_CONFIGS = {
  veo: {
    maxLength: 2000,
    separator: ', ',
    priorityFields: ['visual_references', 'physical_identity', 'face', 'hair', 'skin'],
    stylePrefix: 'cinematic shot, film quality, ',
    negativePrefix: 'Avoid: ',
  },
  kling: {
    maxLength: 1500,
    separator: ', ',
    priorityFields: ['physical_identity', 'face', 'hair', 'visual_references'],
    stylePrefix: 'high quality, photorealistic, ',
    negativePrefix: 'Negative: ',
  },
  gemini: {
    maxLength: 3000,
    separator: '. ',
    priorityFields: ['visual_references', 'physical_identity', 'face', 'hair', 'skin', 'hands'],
    stylePrefix: '',
    negativePrefix: 'Do not include: ',
  },
  midjourney: {
    maxLength: 1000,
    separator: ', ',
    priorityFields: ['visual_references', 'face', 'hair', 'physical_identity'],
    stylePrefix: '',
    negativePrefix: '--no ',
  },
  flux: {
    maxLength: 1500,
    separator: ', ',
    priorityFields: ['physical_identity', 'face', 'hair', 'skin', 'visual_references'],
    stylePrefix: 'photorealistic portrait, ',
    negativePrefix: '',
  },
};

type Engine = keyof typeof ENGINE_CONFIGS;

// ============================================
// COMPONENT BUILDERS - Comprehensive
// ============================================

function buildSubjectDescription(physical: any): string {
  const parts: string[] = [];

  if (physical.gender_presentation) {
    parts.push(`${physical.gender_presentation} presenting`);
  }
  if (physical.age_exact_for_prompt || physical.age_exact) {
    parts.push(`age ${physical.age_exact_for_prompt || physical.age_exact}`);
  }

  if (physical.ethnicity?.primary) {
    parts.push(`${physical.ethnicity.primary.replace(/_/g, ' ')} ethnicity`);
  }
  if (physical.ethnicity?.skin_tone_description) {
    parts.push(`${physical.ethnicity.skin_tone_description} (${physical.ethnicity.skin_tone_hex_approx || ''})`);
  } else if (physical.ethnicity?.skin_tone) {
    parts.push(`${physical.ethnicity.skin_tone} skin tone`);
  }

  if (physical.height?.cm) {
    const heightFt = Math.floor(physical.height.cm / 30.48);
    const heightIn = Math.round((physical.height.cm / 2.54) % 12);
    parts.push(`${physical.height.cm}cm (${heightFt}'${heightIn}") height`);
  }
  if (physical.body_type?.somatotype) {
    parts.push(`${physical.body_type.somatotype.replace(/_/g, ' ')} build`);
  } else if (physical.body_type?.build) {
    parts.push(`${physical.body_type.build} build`);
  }
  if (physical.body_type?.posture) {
    parts.push(`${physical.body_type.posture.replace(/_/g, ' ')} posture`);
  }

  return parts.join(', ');
}

function buildFaceDescription(face: any): string {
  const sections: string[] = [];

  if (face.shape) {
    sections.push(`FACE: ${face.shape.replace(/_/g, ' ')} shape`);
  }

  // Eyes - CRITICAL for identity
  if (face.eyes) {
    const eyes = face.eyes;
    const eyeParts: string[] = [];
    
    if (eyes.shape) eyeParts.push(`${eyes.shape.replace(/_/g, ' ')}`);
    if (eyes.size) eyeParts.push(`${eyes.size.replace(/_/g, ' ')}`);
    eyeParts.push('eyes');
    
    if (eyes.color_description) {
      eyeParts.push(`${eyes.color_description}`);
    } else if (eyes.color || eyes.color_base) {
      eyeParts.push(`${(eyes.color || eyes.color_base).replace(/_/g, ' ')}`);
    }
    
    if (eyes.color_hex_approx || eyes.color_hex) {
      eyeParts.push(`(${eyes.color_hex_approx || eyes.color_hex})`);
    }
    
    if (eyes.distance) {
      eyeParts.push(`${eyes.distance.replace(/_/g, ' ')} spacing`);
    }
    
    sections.push(`EYES: ${eyeParts.join(', ')}`);
    
    // Eyebrows
    if (eyes.eyebrows || face.eyebrows) {
      const brows = eyes.eyebrows || face.eyebrows;
      const browParts: string[] = [];
      if (brows.thickness) browParts.push(brows.thickness);
      if (brows.shape) browParts.push(brows.shape.replace(/_/g, ' '));
      if (brows.grooming) browParts.push(brows.grooming.replace(/_/g, ' '));
      if (brows.color) browParts.push(brows.color);
      if (browParts.length > 0) {
        sections.push(`EYEBROWS: ${browParts.join(', ')}`);
      }
    }
  }

  // Nose
  if (face.nose) {
    const nose = face.nose;
    const noseParts: string[] = [];
    
    if (nose.bridge) {
      if (nose.bridge.height) noseParts.push(`${nose.bridge.height.replace(/_/g, ' ')} bridge`);
      if (nose.bridge.shape) noseParts.push(`${nose.bridge.shape.replace(/_/g, ' ')}`);
      if (nose.bridge.width) noseParts.push(`${nose.bridge.width.replace(/_/g, ' ')} width`);
    } else if (nose.shape) {
      noseParts.push(`${nose.shape} shape`);
    }
    
    if (nose.tip?.shape) noseParts.push(`${nose.tip.shape.replace(/_/g, ' ')} tip`);
    if (nose.nostrils?.shape) noseParts.push(`${nose.nostrils.shape.replace(/_/g, ' ')} nostrils`);
    
    if (noseParts.length > 0) {
      sections.push(`NOSE: ${noseParts.join(', ')}`);
    }
  }

  // Mouth & Lips
  if (face.mouth) {
    const mouth = face.mouth;
    const mouthParts: string[] = [];
    
    if (mouth.lips) {
      if (mouth.lips.fullness_upper) mouthParts.push(`${mouth.lips.fullness_upper} upper lip`);
      if (mouth.lips.fullness_lower) mouthParts.push(`${mouth.lips.fullness_lower} lower lip`);
      if (mouth.lips.shape?.cupids_bow) mouthParts.push(`${mouth.lips.shape.cupids_bow.replace(/_/g, ' ')} cupid's bow`);
      if (mouth.lips.shape?.corners) mouthParts.push(`${mouth.lips.shape.corners.replace(/_/g, ' ')} corners`);
    } else if (mouth.lip_fullness) {
      mouthParts.push(`${mouth.lip_fullness} lips`);
    }
    
    if (mouthParts.length > 0) {
      sections.push(`LIPS: ${mouthParts.join(', ')}`);
    }
  }

  // Jaw & Chin
  if (face.jaw_chin) {
    const jaw = face.jaw_chin;
    const jawParts: string[] = [];
    
    if (jaw.jawline?.shape) jawParts.push(`${jaw.jawline.shape.replace(/_/g, ' ')} jawline`);
    if (jaw.jawline?.definition) jawParts.push(`${jaw.jawline.definition.replace(/_/g, ' ')} definition`);
    if (jaw.jaw_shape) jawParts.push(`${jaw.jaw_shape} jawline`);
    
    if (jawParts.length > 0) {
      sections.push(`JAW: ${jawParts.join(', ')}`);
    }
    
    if (jaw.chin?.shape) {
      sections.push(`CHIN: ${jaw.chin.shape.replace(/_/g, ' ')}, ${(jaw.chin.projection || 'average').replace(/_/g, ' ')} projection`);
    } else if (jaw.chin) {
      sections.push(`CHIN: ${jaw.chin}`);
    }
  }

  // Cheekbones
  if (face.cheekbones) {
    const cheeks = face.cheekbones;
    const cheekParts: string[] = [];
    if (cheeks.prominence) cheekParts.push(cheeks.prominence.replace(/_/g, ' '));
    if (cheeks.position) cheekParts.push(`${cheeks.position.replace(/_/g, ' ')} position`);
    if (cheekParts.length > 0) {
      sections.push(`CHEEKBONES: ${cheekParts.join(', ')}`);
    }
  }

  // Distinctive marks
  if (face.distinctive_marks) {
    const marks = face.distinctive_marks;
    
    if (marks.scars?.length > 0) {
      const scarDesc = marks.scars
        .map((s: any) => `${s.size_cm || ''}cm ${(s.color || '').replace(/_/g, ' ')} scar on ${s.location}`)
        .join(', ');
      sections.push(`SCARS: ${scarDesc}`);
    }
    
    if (marks.moles_birthmarks?.length > 0) {
      const moleDesc = marks.moles_birthmarks
        .map((m: any) => `${m.size_mm || ''}mm ${(m.type || '').replace(/_/g, ' ')} on ${m.location}`)
        .join(', ');
      sections.push(`MARKS: ${moleDesc}`);
    }
    
    // Wrinkles
    if (marks.wrinkles_lines || marks.wrinkles) {
      const wrinkles = marks.wrinkles_lines || marks.wrinkles;
      const wrinkleDesc: string[] = [];
      
      if (wrinkles.forehead?.horizontal_lines && wrinkles.forehead.horizontal_lines !== 'none') {
        wrinkleDesc.push(`${wrinkles.forehead.horizontal_lines.replace(/_/g, ' ')} forehead lines`);
      }
      if (wrinkles.eyes?.crows_feet && wrinkles.eyes.crows_feet !== 'none') {
        wrinkleDesc.push(`${wrinkles.eyes.crows_feet.replace(/_/g, ' ')} crow's feet`);
      }
      if (wrinkles.nose_to_mouth?.nasolabial_folds && wrinkles.nose_to_mouth.nasolabial_folds !== 'none_smooth') {
        wrinkleDesc.push(`${wrinkles.nose_to_mouth.nasolabial_folds.replace(/_/g, ' ')} nasolabial folds`);
      }
      
      if (wrinkleDesc.length > 0) {
        sections.push(`AGING: ${wrinkleDesc.join(', ')}`);
      }
    }
  }

  return sections.join('.\n');
}

function buildHairDescription(hair: any, facialHair?: any): string {
  const sections: string[] = [];

  // Head hair - support both old and new schema
  const headHair = hair.head_hair || hair;
  
  // Length
  let length = '';
  if (headHair.length?.measurement_cm) {
    length = `${headHair.length.measurement_cm}cm`;
  } else if (headHair.length?.type) {
    length = headHair.length.type.replace(/_/g, ' ');
  } else if (headHair.length) {
    length = headHair.length;
  }

  const hairParts: string[] = [];
  if (length) hairParts.push(`${length} length`);
  
  if (headHair.texture?.type) {
    hairParts.push(`${headHair.texture.type.replace(/_/g, ' ')} texture`);
  } else if (headHair.texture) {
    hairParts.push(`${headHair.texture} texture`);
  }
  
  if (headHair.thickness?.density) {
    hairParts.push(`${headHair.thickness.density.replace(/_/g, ' ')} density`);
  } else if (headHair.thickness) {
    hairParts.push(`${headHair.thickness} thickness`);
  }

  if (hairParts.length > 0) {
    sections.push(`HAIR: ${hairParts.join(', ')}`);
  }

  // Hair color
  let colorDesc = '';
  if (headHair.color?.natural_base) {
    colorDesc = `${headHair.color.natural_base} (${headHair.color.hex_approx_base || ''})`;
    if (headHair.color.grey_white?.percentage > 0) {
      colorDesc += ` with ${headHair.color.grey_white.percentage}% ${headHair.color.grey_white.pattern?.replace(/_/g, ' ') || ''} grey`;
    }
  } else if (headHair.color?.base) {
    colorDesc = `${headHair.color.base} (${headHair.color.color_hex || ''})`;
  }
  if (colorDesc) {
    sections.push(`COLOR: ${colorDesc}`);
  }

  // Style
  if (headHair.style?.overall_shape) {
    sections.push(`STYLE: ${headHair.style.overall_shape}, ${headHair.style.grooming_level?.replace(/_/g, ' ') || ''}`);
  } else if (headHair.style) {
    sections.push(`STYLE: ${headHair.style}`);
  }

  // Hairline
  if (headHair.hairline?.front && headHair.hairline.front !== 'straight_juvenile') {
    sections.push(`HAIRLINE: ${headHair.hairline.front.replace(/_/g, ' ')}`);
  }

  // Facial hair - support both locations
  const fh = facialHair || headHair.facial_hair || hair.facial_hair;
  if (fh) {
    if (fh.type && fh.type !== 'clean_shaven_smooth' && fh.type !== 'clean_shaven') {
      const fhParts: string[] = [];
      fhParts.push(fh.type.replace(/_/g, ' '));
      if (fh.length_mm) fhParts.push(`${fh.length_mm}mm`);
      if (fh.density) fhParts.push(fh.density.replace(/_/g, ' '));
      if (fh.color?.base) fhParts.push(fh.color.base);
      if (fh.color?.grey_percentage > 0) fhParts.push(`with ${fh.color.grey_percentage}% grey`);
      if (fh.grooming) fhParts.push(fh.grooming.replace(/_/g, ' '));
      
      sections.push(`FACIAL HAIR: ${fhParts.join(', ')}`);
    } else {
      sections.push('FACIAL HAIR: clean shaven');
    }
  }

  return sections.join('.\n');
}

function buildSkinDescription(skin: any): string {
  const parts: string[] = [];

  if (skin.texture?.overall) {
    parts.push(`${skin.texture.overall.replace(/_/g, ' ')} skin texture`);
  } else if (skin.texture) {
    parts.push(`${skin.texture.replace(/_/g, ' ')} skin`);
  }

  if (skin.condition?.clarity && skin.condition.clarity !== 'perfectly_clear') {
    parts.push(`${skin.condition.clarity.replace(/_/g, ' ')} clarity`);
  }

  if (skin.condition?.hyperpigmentation?.freckles && skin.condition.hyperpigmentation.freckles !== 'none') {
    parts.push(`${skin.condition.hyperpigmentation.freckles.replace(/_/g, ' ')} freckles`);
  }

  if (skin.undertone?.type) {
    parts.push(`${skin.undertone.type.replace(/_/g, ' ')} undertone`);
  }

  return parts.join(', ');
}

function buildCelebrityReference(likeness: any): string {
  if (!likeness?.primary?.name) return '';

  const parts: string[] = [];

  parts.push(`${likeness.primary.percentage || 60}% ${likeness.primary.name}`);

  if (likeness.secondary?.name) {
    parts.push(`${likeness.secondary.percentage || 30}% ${likeness.secondary.name}`);
  }

  if (likeness.tertiary?.name) {
    parts.push(`${likeness.tertiary.percentage || 10}% ${likeness.tertiary.name}`);
  }

  const combined = parts.join(' + ');
  const description = likeness.combination_description || likeness.combination_note || '';

  return `CELEBRITY LIKENESS: ${combined}${description ? `.\n${description}` : ''}`;
}

function buildPhotographySpecs(purpose: string): string {
  const specs: string[] = [];

  if (purpose.includes('identity') || purpose === 'identity_closeup') {
    specs.push('Professional portrait photography');
    specs.push('85mm lens f/1.8');
    specs.push('shallow depth of field');
    specs.push('sharp focus on eyes');
    specs.push('bokeh background blur');
  } else if (purpose === 'identity_turnaround') {
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

// ============================================
// MAIN PROMPT GENERATOR
// ============================================

function generateAdvancedPrompt(
  visualDNA: any,
  engine: Engine,
  options: {
    shotType?: string;
    expression?: string;
    outfit?: string;
    action?: string;
    lighting?: string;
    purpose?: string;
    continuityLock?: any;
  }
): { positive: string; negative: string } {
  const config = ENGINE_CONFIGS[engine];
  const purpose = options.purpose || 'scene_shot';
  
  // Build sections
  const sections: string[] = [];
  
  // Header based on purpose
  if (purpose.includes('identity')) {
    sections.push('IDENTITY REFERENCE - PHOTOREALISTIC PORTRAIT');
    sections.push('Critical: This is an identity anchor. Maximum accuracy required.');
    sections.push('');
  } else {
    sections.push('CINEMATIC CHARACTER SHOT - PHOTOREALISTIC');
    sections.push('');
  }

  // Add style prefix
  if (config.stylePrefix) {
    sections.push(config.stylePrefix.trim());
  }

  // Shot type
  if (options.shotType) {
    sections.push(`SHOT TYPE: ${options.shotType}`);
    sections.push('');
  }

  // Subject description
  if (visualDNA.physical_identity) {
    sections.push('SUBJECT:');
    sections.push(buildSubjectDescription(visualDNA.physical_identity));
    sections.push('');
  }

  // Face description
  if (visualDNA.face) {
    sections.push(buildFaceDescription(visualDNA.face));
    sections.push('');
  }

  // Hair description
  if (visualDNA.hair) {
    sections.push(buildHairDescription(visualDNA.hair, visualDNA.face?.facial_hair));
    sections.push('');
  }

  // Skin description
  if (visualDNA.skin) {
    sections.push('SKIN: ' + buildSkinDescription(visualDNA.skin));
    sections.push('');
  }

  // Celebrity likeness
  if (visualDNA.visual_references?.celebrity_likeness) {
    const celeb = buildCelebrityReference(visualDNA.visual_references.celebrity_likeness);
    if (celeb) {
      sections.push(celeb);
      sections.push('');
    }
  }

  // Expression
  if (options.expression) {
    sections.push(`EXPRESSION: ${options.expression} emotion`);
    sections.push('');
  }

  // Outfit
  if (options.outfit) {
    sections.push(`OUTFIT: ${options.outfit}`);
    sections.push('');
  }

  // Action
  if (options.action) {
    sections.push(`ACTION: ${options.action}`);
    sections.push('');
  }

  // Photography specs
  sections.push('PHOTOGRAPHY:');
  sections.push(buildPhotographySpecs(purpose));
  sections.push('');

  // Lighting
  sections.push('LIGHTING:');
  sections.push(options.lighting || 'Soft key light 45° from camera, fill light opposite, rim light for separation');

  // Build positive prompt
  let positive = sections.filter(Boolean).join('\n').trim();

  // Truncate if needed
  if (positive.length > config.maxLength) {
    positive = positive.substring(0, config.maxLength - 3) + '...';
  }

  // Build negative prompt
  const negatives: string[] = [
    'cartoon', 'anime', 'illustration', '3D render', 'CGI obvious',
    'plastic skin', 'wax skin', 'mannequin', 'doll-like',
    'AI artifacts', 'morphing features', 'warped hands', 'deformed fingers',
    'floating elements', 'disjointed anatomy',
    'watermark', 'text overlay', 'logo', 'signature',
    'blurry', 'out of focus', 'low quality', 'pixelated',
    'multiple heads', 'multiple arms', 'extra limbs',
    'asymmetric eyes', 'different eye colors',
  ];

  // Add continuity lock must_avoid
  if (options.continuityLock?.must_avoid?.length) {
    negatives.push(...options.continuityLock.must_avoid);
  }

  // Add specific field violations
  if (visualDNA.physical_identity?.age_exact_for_prompt) {
    negatives.push(`not age ${visualDNA.physical_identity.age_exact_for_prompt}`);
  }
  if (visualDNA.face?.eyes?.color_base) {
    negatives.push(`eyes not ${visualDNA.face.eyes.color_base.replace(/_/g, ' ')}`);
  }
  if (visualDNA.face?.shape) {
    negatives.push(`face not ${visualDNA.face.shape.replace(/_/g, ' ')}`);
  }

  const negative = config.negativePrefix + negatives.join(', ');

  return { positive, negative };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      characterId, 
      engine = 'gemini',
      shotType,
      expression,
      outfit,
      action,
      lighting,
      purpose,
    } = await req.json();

    console.log(`Generating technical prompt for character ${characterId}, engine: ${engine}`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch active visual DNA for character
    const { data: visualDnaRecord, error: dnaError } = await supabase
      .from('character_visual_dna')
      .select('visual_dna, continuity_lock')
      .eq('character_id', characterId)
      .eq('is_active', true)
      .single();

    if (dnaError || !visualDnaRecord) {
      console.log('No Visual DNA found, falling back to profile_json');
      
      // Fallback to character profile_json
      const { data: character, error: charError } = await supabase
        .from('characters')
        .select('profile_json, name')
        .eq('id', characterId)
        .single();

      if (charError || !character?.profile_json) {
        throw new Error('No Visual DNA or profile_json found for character');
      }

      // Use profile_json as basic DNA
      const basicDNA = character.profile_json as any;
      const result = generateAdvancedPrompt(basicDNA, engine as Engine, {
        shotType,
        expression,
        outfit,
        action,
        lighting,
        purpose,
      });

      console.log('Generated prompt from profile_json, length:', result.positive.length);

      return new Response(
        JSON.stringify({ 
          success: true, 
          prompt: result,
          source: 'profile_json',
          characterName: character.name,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const visualDNA = visualDnaRecord.visual_dna as any;
    const continuityLock = visualDnaRecord.continuity_lock as any;

    console.log('Found Visual DNA, generating advanced prompt');

    const result = generateAdvancedPrompt(visualDNA, engine as Engine, {
      shotType,
      expression,
      outfit,
      action,
      lighting,
      purpose,
      continuityLock,
    });

    console.log('Generated prompt from Visual DNA, length:', result.positive.length);

    return new Response(
      JSON.stringify({ 
        success: true, 
        prompt: result,
        source: 'visual_dna',
        engine,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error generating prompt:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
