import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { v3RequireAuth, V3AuthContext } from "../_shared/v3-enterprise.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============================================
// QC ISSUE TO PROMPT CORRECTIONS MAPPING
// ============================================
const QC_ISSUE_CORRECTIONS: Record<string, string[]> = {
  'hair': [
    'CRITICAL HAIR LOCK: Preserve EXACT hair color including all grey/silver/white tones',
    'Grey hair percentage must match reference exactly - do not darken or change',
    'Maintain exact hair style, length, and texture from reference'
  ],
  'skin': [
    'CRITICAL SKIN LOCK: Match exact skin undertone and color from reference',
    'Preserve all skin texture, freckles, moles, and natural variations',
    'Maintain consistent skin color throughout the image'
  ],
  'age': [
    'CRITICAL AGE LOCK: Character must appear exactly the same age as reference',
    'Preserve all wrinkles, lines, and age indicators visible in reference',
    'Do not smooth, enhance, or de-age skin unnaturally'
  ],
  'face': [
    'CRITICAL FACE LOCK: Maintain exact facial structure and proportions from reference',
    'Eye shape, nose shape, mouth shape must be identical to reference',
    'Preserve exact face width, jawline, and cheekbone structure'
  ],
  'eyes': [
    'CRITICAL EYES LOCK: Maintain exact eye color, shape and spacing from reference',
    'Preserve eye size, eyelid shape, and any distinctive eye features',
    'Ensure both eyes are symmetrical and anatomically correct'
  ],
  'artifacts': [
    'Ensure anatomically correct hands with exactly 5 fingers per hand',
    'No morphed, distorted, or blended features',
    'Clean, professional render quality with no visible AI artifacts'
  ],
  'likeness': [
    'This must look like the EXACT SAME PERSON as the reference',
    'Preserve all distinctive facial features that make this person unique',
    'The viewer should immediately recognize this as the same individual'
  ],
  'lighting': [
    'Use consistent lighting direction matching the reference style',
    'Avoid harsh shadows that distort facial features',
    'Maintain proper highlight and shadow balance for realistic skin'
  ],
  'quality': [
    'Generate at highest quality with sharp details',
    'Ensure proper focus on facial features',
    'No blur, noise, or compression artifacts'
  ]
};

interface ImproveQCRequest {
  slotId: string;
  characterId: string;
  projectId: string;
  currentIssues: string[];
  fixNotes: string;
  previousPrompt?: string;
}

interface EnhancedPromptResult {
  enhancedPrompt: string;
  corrections: string[];
  confidenceBoost: number;
}

// Analyze issues and generate specific prompt corrections
function analyzeIssuesAndGenerateCorrections(issues: string[], fixNotes: string): { corrections: string[]; categories: string[] } {
  const corrections: string[] = [];
  const categories: Set<string> = new Set();
  
  const allText = [...issues, fixNotes].join(' ').toLowerCase();
  
  // Match issues to correction categories
  for (const [category, categoryCorrections] of Object.entries(QC_ISSUE_CORRECTIONS)) {
    const categoryPatterns: Record<string, string[]> = {
      'hair': ['hair', 'grey', 'gray', 'silver', 'white hair', 'hair color', 'pelo', 'cabello', 'canas'],
      'skin': ['skin', 'tone', 'complexion', 'piel', 'tono'],
      'age': ['age', 'young', 'old', 'wrinkle', 'edad', 'joven', 'viejo', 'arrugas'],
      'face': ['face', 'facial', 'structure', 'proportion', 'cara', 'rostro'],
      'eyes': ['eye', 'eyes', 'ojos', 'ojo'],
      'artifacts': ['artifact', 'hand', 'finger', 'morph', 'distort', 'deform', 'artefacto', 'mano', 'dedo'],
      'likeness': ['likeness', 'same person', 'recognize', 'identity', 'parecido', 'misma persona'],
      'lighting': ['light', 'shadow', 'bright', 'dark', 'luz', 'sombra', 'iluminación'],
      'quality': ['quality', 'blur', 'sharp', 'focus', 'calidad', 'borroso', 'enfoque']
    };
    
    const patterns = categoryPatterns[category] || [category];
    if (patterns.some(pattern => allText.includes(pattern))) {
      categories.add(category);
      corrections.push(...categoryCorrections);
    }
  }
  
  // If no specific matches, add general likeness correction
  if (corrections.length === 0) {
    categories.add('likeness');
    corrections.push(...QC_ISSUE_CORRECTIONS['likeness']);
    corrections.push(...QC_ISSUE_CORRECTIONS['quality']);
  }
  
  return { corrections: [...new Set(corrections)], categories: [...categories] };
}

// Use LLM to generate enhanced prompt based on issues
async function generateEnhancedPrompt(
  issues: string[],
  fixNotes: string,
  previousPrompt: string | undefined,
  characterName: string,
  slotType: string
): Promise<EnhancedPromptResult> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  
  // Get rule-based corrections first
  const { corrections, categories } = analyzeIssuesAndGenerateCorrections(issues, fixNotes);
  
  // Calculate confidence boost based on how specific the issues are
  const confidenceBoost = Math.min(25, 5 + (corrections.length * 3));
  
  // Build enhanced prompt
  let enhancedPrompt = '';
  
  if (LOVABLE_API_KEY) {
    try {
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
              content: `You are an expert prompt engineer for AI image generation. 
Your job is to enhance prompts to fix specific QC issues while preserving the original intent.
You must return ONLY the enhanced prompt text, no explanations.
The enhanced prompt should be concise but include CRITICAL instructions to fix the issues.`
            },
            {
              role: 'user',
              content: `Original character: ${characterName}
Slot type: ${slotType}
Previous prompt: ${previousPrompt || 'Not available'}

QC ISSUES DETECTED:
${issues.map(i => `- ${i}`).join('\n')}

FIX NOTES FROM QC:
${fixNotes || 'No specific notes'}

MANDATORY CORRECTIONS TO INCLUDE:
${corrections.map(c => `- ${c}`).join('\n')}

Generate an enhanced prompt that:
1. Preserves the original character description
2. Adds CRITICAL instructions to fix the detected issues
3. Uses strong language like "MUST", "EXACTLY", "CRITICAL" for important corrections
4. Is optimized for the Gemini image generation model

Return ONLY the enhanced prompt text.`
            }
          ],
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;
        if (content) {
          enhancedPrompt = content.trim();
        }
      }
    } catch (error) {
      console.error('[improve-character-qc] LLM enhancement failed:', error);
    }
  }
  
  // Fallback: build prompt from corrections if LLM failed
  if (!enhancedPrompt) {
    const basePrompt = previousPrompt || `Professional portrait of ${characterName} for ${slotType}`;
    enhancedPrompt = `${basePrompt}

=== CRITICAL CORRECTIONS (MUST FOLLOW) ===
${corrections.join('\n')}
=== END CORRECTIONS ===`;
  }
  
  return {
    enhancedPrompt,
    corrections: categories,
    confidenceBoost
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check
    const authResult = await v3RequireAuth(req);
    if (authResult instanceof Response) {
      return authResult;
    }
    const auth: V3AuthContext = authResult;

    const body: ImproveQCRequest = await req.json();
    const { slotId, characterId, projectId, currentIssues, fixNotes, previousPrompt } = body;

    if (!slotId || !characterId) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: slotId, characterId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[improve-character-qc] Processing slot ${slotId} for character ${characterId}`);
    console.log(`[improve-character-qc] Issues: ${currentIssues.join(', ')}`);
    console.log(`[improve-character-qc] Fix notes: ${fixNotes}`);

    // Get character info
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: character, error: charError } = await supabase
      .from('characters')
      .select('name, bio, role')
      .eq('id', characterId)
      .single();

    if (charError || !character) {
      return new Response(
        JSON.stringify({ error: 'Character not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get slot info
    const { data: slot, error: slotError } = await supabase
      .from('character_pack_slots')
      .select('slot_type, view_angle, expression_name, prompt_text')
      .eq('id', slotId)
      .single();

    if (slotError || !slot) {
      return new Response(
        JSON.stringify({ error: 'Slot not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate enhanced prompt
    const result = await generateEnhancedPrompt(
      currentIssues,
      fixNotes,
      previousPrompt || slot.prompt_text,
      character.name,
      slot.slot_type
    );

    console.log(`[improve-character-qc] Generated enhanced prompt with ${result.corrections.length} correction categories`);
    console.log(`[improve-character-qc] Confidence boost: +${result.confidenceBoost}%`);

    // Store the enhanced prompt for the regeneration
    const { error: updateError } = await supabase
      .from('character_pack_slots')
      .update({ 
        prompt_text: result.enhancedPrompt,
        fix_notes: `Auto-enhanced: ${result.corrections.join(', ')}`,
        status: 'pending_improvement'
      })
      .eq('id', slotId);

    if (updateError) {
      console.error('[improve-character-qc] Failed to update slot:', updateError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        enhancedPrompt: result.enhancedPrompt,
        corrections: result.corrections,
        confidenceBoost: result.confidenceBoost,
        message: `Prompt enhanced with ${result.corrections.length} correction categories. Expected improvement: +${result.confidenceBoost}%`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[improve-character-qc] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
