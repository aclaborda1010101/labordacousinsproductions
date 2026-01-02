import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Engine-specific prompt templates
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
    usesParameters: true,
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

interface VisualDNA {
  physical_identity?: {
    age_exact?: number;
    biological_sex?: string;
    gender_presentation?: string;
    ethnicity?: {
      primary?: string;
      skin_tone?: string;
    };
    height_cm?: number;
    body_type?: {
      build?: string;
      musculature?: string;
      posture?: string;
    };
  };
  face?: {
    shape?: string;
    eyes?: {
      color?: string;
      color_hex?: string;
      shape?: string;
      size?: string;
    };
    eyebrows?: {
      thickness?: string;
      shape?: string;
      color?: string;
    };
    nose?: {
      shape?: string;
      width?: string;
    };
    mouth?: {
      lip_fullness?: string;
      lip_shape?: string;
    };
    jaw_chin?: {
      jaw_shape?: string;
      chin?: string;
    };
    distinctive_marks?: {
      scars?: Array<{ location: string; description: string }>;
      moles?: Array<{ location: string }>;
    };
  };
  hair?: {
    length?: string;
    texture?: string;
    color?: {
      base?: string;
      color_hex?: string;
    };
    style?: string;
    facial_hair?: {
      type?: string;
      density?: string;
    };
  };
  skin?: {
    texture?: string;
    condition?: string;
  };
  hands?: {
    size?: string;
    distinctive_features?: string[];
  };
  visual_references?: {
    celebrity_likeness?: {
      primary?: { name?: string; percentage?: number };
      secondary?: { name?: string; percentage?: number };
      combination_note?: string;
    };
    art_style?: string;
  };
}

interface ContinuityLock {
  never_change: string[];
  must_avoid: string[];
  allowed_variants: Array<{
    field_path: string;
    allowed_values: string[];
  }>;
}

function buildPromptSection(dna: VisualDNA, section: string): string[] {
  const parts: string[] = [];

  switch (section) {
    case 'visual_references':
      if (dna.visual_references?.celebrity_likeness?.primary?.name) {
        const primary = dna.visual_references.celebrity_likeness.primary;
        const secondary = dna.visual_references.celebrity_likeness.secondary;
        if (secondary?.name && primary.percentage && secondary.percentage) {
          parts.push(`looks like ${primary.percentage}% ${primary.name} and ${secondary.percentage}% ${secondary.name}`);
        } else if (primary.name) {
          parts.push(`resembles ${primary.name}`);
        }
      }
      if (dna.visual_references?.art_style) {
        parts.push(dna.visual_references.art_style);
      }
      break;

    case 'physical_identity':
      if (dna.physical_identity?.age_exact) {
        parts.push(`${dna.physical_identity.age_exact} year old`);
      }
      if (dna.physical_identity?.biological_sex) {
        parts.push(dna.physical_identity.biological_sex);
      }
      if (dna.physical_identity?.ethnicity?.primary) {
        parts.push(`${dna.physical_identity.ethnicity.primary} ethnicity`);
      }
      if (dna.physical_identity?.ethnicity?.skin_tone) {
        parts.push(`${dna.physical_identity.ethnicity.skin_tone} skin tone`);
      }
      if (dna.physical_identity?.body_type?.build) {
        parts.push(`${dna.physical_identity.body_type.build} build`);
      }
      if (dna.physical_identity?.body_type?.posture) {
        parts.push(`${dna.physical_identity.body_type.posture} posture`);
      }
      break;

    case 'face':
      if (dna.face?.shape) {
        parts.push(`${dna.face.shape} face shape`);
      }
      if (dna.face?.eyes?.color) {
        parts.push(`${dna.face.eyes.color} eyes`);
      }
      if (dna.face?.eyes?.shape) {
        parts.push(`${dna.face.eyes.shape} eye shape`);
      }
      if (dna.face?.eyebrows?.thickness && dna.face?.eyebrows?.shape) {
        parts.push(`${dna.face.eyebrows.thickness} ${dna.face.eyebrows.shape} eyebrows`);
      }
      if (dna.face?.nose?.shape) {
        parts.push(`${dna.face.nose.shape} nose`);
      }
      if (dna.face?.mouth?.lip_fullness) {
        parts.push(`${dna.face.mouth.lip_fullness} lips`);
      }
      if (dna.face?.jaw_chin?.jaw_shape) {
        parts.push(`${dna.face.jaw_chin.jaw_shape} jawline`);
      }
      // Add distinctive marks
      if (dna.face?.distinctive_marks?.scars?.length) {
        dna.face.distinctive_marks.scars.forEach(scar => {
          parts.push(`${scar.description} scar on ${scar.location}`);
        });
      }
      break;

    case 'hair':
      const hairParts: string[] = [];
      if (dna.hair?.length) hairParts.push(dna.hair.length);
      if (dna.hair?.texture) hairParts.push(dna.hair.texture);
      if (dna.hair?.color?.base) hairParts.push(dna.hair.color.base);
      if (hairParts.length) {
        parts.push(`${hairParts.join(' ')} hair`);
      }
      if (dna.hair?.style) {
        parts.push(`hair styled ${dna.hair.style}`);
      }
      if (dna.hair?.facial_hair?.type && dna.hair.facial_hair.type !== 'clean_shaven') {
        parts.push(dna.hair.facial_hair.type.replace(/_/g, ' '));
      } else if (dna.hair?.facial_hair?.type === 'clean_shaven') {
        parts.push('clean shaven');
      }
      break;

    case 'skin':
      if (dna.skin?.texture) {
        parts.push(`${dna.skin.texture.replace(/_/g, ' ')} skin`);
      }
      break;

    case 'hands':
      if (dna.hands?.size) {
        parts.push(`${dna.hands.size} hands`);
      }
      if (dna.hands?.distinctive_features?.length) {
        parts.push(dna.hands.distinctive_features.join(', '));
      }
      break;
  }

  return parts;
}

function generatePrompt(
  dna: VisualDNA,
  engine: Engine,
  options?: {
    shotType?: string;
    expression?: string;
    outfit?: string;
    action?: string;
    lighting?: string;
    continuityLock?: ContinuityLock;
  }
): { positive: string; negative: string } {
  const config = ENGINE_CONFIGS[engine];
  const promptParts: string[] = [];

  // Add style prefix
  if (config.stylePrefix) {
    promptParts.push(config.stylePrefix.trim());
  }

  // Add shot type if provided
  if (options?.shotType) {
    promptParts.push(options.shotType);
  }

  // Build sections based on priority
  for (const section of config.priorityFields) {
    const sectionParts = buildPromptSection(dna, section);
    promptParts.push(...sectionParts);
  }

  // Add expression if provided
  if (options?.expression) {
    promptParts.push(`${options.expression} expression`);
  }

  // Add outfit if provided
  if (options?.outfit) {
    promptParts.push(`wearing ${options.outfit}`);
  }

  // Add action if provided
  if (options?.action) {
    promptParts.push(options.action);
  }

  // Add lighting if provided
  if (options?.lighting) {
    promptParts.push(`${options.lighting} lighting`);
  }

  // Build positive prompt
  let positive = promptParts.filter(Boolean).join(config.separator);

  // Truncate if needed
  if (positive.length > config.maxLength) {
    positive = positive.substring(0, config.maxLength - 3) + '...';
  }

  // Build negative prompt from must_avoid
  let negative = '';
  if (options?.continuityLock?.must_avoid?.length) {
    const avoidTerms = options.continuityLock.must_avoid.join(', ');
    if (engine === 'midjourney') {
      negative = `${config.negativePrefix}${avoidTerms}`;
    } else {
      negative = `${config.negativePrefix}${avoidTerms}`;
    }
  }

  // Add common negative terms
  const commonNegatives = ['deformed', 'blurry', 'bad anatomy', 'extra limbs', 'bad hands', 'extra fingers'];
  if (negative) {
    negative += ', ' + commonNegatives.join(', ');
  } else {
    negative = config.negativePrefix + commonNegatives.join(', ');
  }

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
    } = await req.json();

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
      // Fallback to character profile_json
      const { data: character, error: charError } = await supabase
        .from('characters')
        .select('profile_json, name')
        .eq('id', characterId)
        .single();

      if (charError || !character?.profile_json) {
        throw new Error('No Visual DNA found for character');
      }

      // Use profile_json as basic DNA
      const basicDNA = character.profile_json as VisualDNA;
      const result = generatePrompt(basicDNA, engine as Engine, {
        shotType,
        expression,
        outfit,
        action,
        lighting,
      });

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

    const visualDNA = visualDnaRecord.visual_dna as VisualDNA;
    const continuityLock = visualDnaRecord.continuity_lock as ContinuityLock;

    const result = generatePrompt(visualDNA, engine as Engine, {
      shotType,
      expression,
      outfit,
      action,
      lighting,
      continuityLock,
    });

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
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
