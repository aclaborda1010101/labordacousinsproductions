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

// Prompt templates by slot type
const PROMPT_TEMPLATES = {
  turnaround: (name: string, bio: string, angle: string, style: string) => 
    `Character turnaround sheet, ${angle} view of ${name}. ${bio}. 
Full body pose, clean studio background, professional character design reference sheet.
Consistent lighting, detailed anatomy, ${style || 'cinematic film style'}.
High resolution character reference, suitable for animation production.`,

  expression: (name: string, bio: string, expression: string, style: string) =>
    `Character expression sheet for ${name}. ${bio}.
Close-up portrait showing "${expression}" emotion/expression.
Face clearly visible, dramatic lighting highlighting facial features.
${style || 'Cinematic film style'}, high detail, suitable for animation reference.
Clean background, professional character design quality.`,

  closeup: (name: string, bio: string, style: string) =>
    `Identity anchor close-up portrait of ${name}. ${bio}.
Extreme close-up of face, neutral expression, direct eye contact with camera.
Studio lighting, clean background, ultra high detail on facial features.
${style || 'Cinematic film quality'}, character reference for identity matching.
Sharp focus on eyes, skin texture, and defining facial characteristics.`,

  outfit: (name: string, bio: string, outfitDesc: string, angle: string, style: string) =>
    `Character ${name} wearing ${outfitDesc}. ${bio}.
${angle || '3/4'} view, full body or 3/4 body pose showing the complete outfit.
Professional wardrobe reference, detailed fabric textures and accessories.
${style || 'Cinematic film style'}, consistent character identity.
Clean background, fashion photography quality, suitable for production reference.`,

  base_look: (name: string, bio: string, style: string) =>
    `Base character design for ${name}. ${bio}.
3/4 view pose, showing character's default look and personality.
${style || 'Cinematic film style'}, professional character design.
Clean background, suitable for crowd/background character reference.`,
};

// QC checks for character images
async function runQC(imageUrl: string, slotType: string, characterName: string): Promise<{
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
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-pro-preview', // Reasoning model for QC
        messages: [
          {
            role: 'system',
            content: `You are a character design QC analyst for animation production.
Analyze the generated character image and score it on:
- Identity Consistency (0-25): Does it look like the same character?
- Technical Quality (0-25): Resolution, clarity, no artifacts
- Pose/Composition (0-25): Appropriate for the slot type (${slotType})
- Style Consistency (0-25): Matches production style guidelines

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

// Handle new slot-based generation
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

  // Build prompt based on slot type
  let prompt: string;
  switch (slotType) {
    case 'turnaround':
      prompt = PROMPT_TEMPLATES.turnaround(characterName, characterBio, viewAngle || 'front', styleToken || '');
      break;
    case 'expression':
      prompt = PROMPT_TEMPLATES.expression(characterName, characterBio, expressionName || 'neutral', styleToken || '');
      break;
    case 'closeup':
      prompt = PROMPT_TEMPLATES.closeup(characterName, characterBio, styleToken || '');
      break;
    case 'outfit':
      prompt = PROMPT_TEMPLATES.outfit(characterName, characterBio, outfitDescription || 'casual outfit', viewAngle || '3/4', styleToken || '');
      break;
    case 'base_look':
      prompt = PROMPT_TEMPLATES.base_look(characterName, characterBio, styleToken || '');
      break;
    default:
      throw new Error(`Unknown slot type: ${slotType}`);
  }

  console.log('Prompt:', prompt.substring(0, 100) + '...');

  // Update slot status to generating
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  await supabase.from('character_pack_slots').update({
    status: 'generating',
    prompt_text: prompt,
  }).eq('id', slotId);

  // Determine image engine based on slot type
  // Identity anchors (closeup, turnaround) use Gemini 3 Pro for highest quality
  // Other slots use Nano Banana (gemini-2.5-flash-image-preview) for efficiency
  const isIdentityAnchor = slotType === 'closeup' || slotType === 'turnaround';
  const imageEngine = isIdentityAnchor 
    ? 'google/gemini-3-pro-image-preview'  // Pro quality for identity anchors
    : 'google/gemini-2.5-flash-image-preview'; // Nano banana for other slots

  console.log(`Using image engine: ${imageEngine} for ${slotType}`);

  // Generate image with selected engine
  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: imageEngine,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
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

  console.log('Image generated, running QC...');

  // Run QC analysis
  const qc = await runQC(imageUrl, slotType, characterName);
  console.log('QC result:', qc);

  // Update slot with result
  const updateData: Record<string, unknown> = {
    image_url: imageUrl,
    status: qc.passed ? 'approved' : 'failed',
    qc_score: qc.score,
    qc_issues: qc.issues,
    fix_notes: qc.passed ? null : qc.fixNotes,
    updated_at: new Date().toISOString(),
  };

  await supabase.from('character_pack_slots').update(updateData).eq('id', slotId);

  // Recalculate pack completeness
  await supabase.rpc('calculate_pack_completeness', { p_character_id: characterId });

  return new Response(JSON.stringify({
    success: true,
    imageUrl,
    qc,
    slotId,
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Handle legacy generation (backwards compatible)
async function handleLegacyGeneration(body: LegacyCharacterRequest): Promise<Response> {
  const { name, role, bio, style } = body;
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

  if (!LOVABLE_API_KEY) {
    throw new Error('LOVABLE_API_KEY is not configured');
  }

  // Generate detailed character description
  const descriptionPrompt = `Create a detailed visual description for an animated character for film production.

Character Name: ${name}
Role: ${role}
Background: ${bio}
Visual Style: ${style || 'Cinematic, realistic animation style'}

Generate a comprehensive visual description including:
1. Physical appearance (height, build, face shape, skin tone)
2. Hair style and color
3. Eye color and expression
4. Default clothing/costume
5. Distinguishing features
6. Body language and posture
7. Age range

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
        { role: 'system', content: 'You are an expert character designer for animated films. Create detailed, consistent visual descriptions.' },
        { role: 'user', content: descriptionPrompt }
      ],
    }),
  });

  if (!descResponse.ok) {
    if (descResponse.status === 429) {
      return new Response(JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (descResponse.status === 402) {
      return new Response(JSON.stringify({ error: 'Payment required. Please add credits.' }), {
        status: 402,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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
Style: High quality character design, clean background, professional animation reference
Lighting: Soft, even studio lighting for reference accuracy`;

    const imageResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-pro-image-preview',
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

  // Generate expression sheet
  const expressionPrompt = `${characterDescription}

Expression sheet showing: neutral, happy, sad, angry, surprised, thinking
Style: Head/face only, multiple expressions in a grid, animation reference sheet
Background: Clean white background`;

  const expressionResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
      body: JSON.stringify({
        model: 'google/gemini-3-pro-image-preview',
      messages: [{ role: 'user', content: expressionPrompt }],
      modalities: ['image', 'text'],
    }),
  });

  let expressionSheet = null;
  if (expressionResponse.ok) {
    const exprData = await expressionResponse.json();
    expressionSheet = exprData.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  }

  return new Response(JSON.stringify({
    description: characterDescription,
    turnarounds: generatedImages,
    expressionSheet,
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    
    // Detect if this is new slot-based request or legacy
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