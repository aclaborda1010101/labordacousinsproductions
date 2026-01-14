/**
 * QC Storyboard Identity - Post-generation identity verification
 * 
 * Compares generated storyboard panels against character reference images
 * to detect identity drift (face, hair, age, proportions).
 * 
 * Returns identity_score per character and overall QC verdict.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { MODEL_CONFIG } from "../_shared/model-config.ts";
import { aiFetch } from "../_shared/ai-fetch.ts";

// Vision QC model
const VISION_QC_MODEL = 'google/gemini-2.5-flash'; // Fast + accurate for comparison tasks

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============================================================================
// THRESHOLDS BY SHOT TYPE
// ============================================================================

const IDENTITY_THRESHOLDS: Record<string, number> = {
  'PP': 0.85,      // Primer Plano - face dominates
  'PMC': 0.80,     // Plano Medio Corto
  'ECU': 0.85,     // Extreme Close Up
  'CLOSE': 0.85,   // Close up
  'PM': 0.75,      // Plano Medio
  'OTS': 0.75,     // Over The Shoulder
  '2SHOT': 0.72,   // Two Shot
  'PA': 0.70,      // Plano Americano
  'PG': 0.65,      // Plano General
  'TRACK': 0.65,   // Tracking shot
  'INSERT': 0.50,  // Insert - usually no face
  'DEFAULT': 0.70, // Fallback
};

function getThreshold(shotHint: string): number {
  const upper = (shotHint || 'DEFAULT').toUpperCase();
  
  // Check for close-up indicators
  if (upper.includes('CLOSE') || upper.includes('PP') || upper.includes('ECU')) {
    return IDENTITY_THRESHOLDS['PP'];
  }
  if (upper.includes('PMC')) {
    return IDENTITY_THRESHOLDS['PMC'];
  }
  if (upper.includes('OTS')) {
    return IDENTITY_THRESHOLDS['OTS'];
  }
  if (upper.includes('2SHOT')) {
    return IDENTITY_THRESHOLDS['2SHOT'];
  }
  if (upper.includes('PG') || upper.includes('WIDE')) {
    return IDENTITY_THRESHOLDS['PG'];
  }
  if (upper.includes('INSERT')) {
    return IDENTITY_THRESHOLDS['INSERT'];
  }
  
  return IDENTITY_THRESHOLDS[upper] || IDENTITY_THRESHOLDS['DEFAULT'];
}

// ============================================================================
// IDENTITY ISSUES
// ============================================================================

type IdentityIssue = 
  | 'FACE_DRIFT'
  | 'HAIR_DRIFT'
  | 'AGE_SHIFT'
  | 'PROPORTION_ERROR'
  | 'WARDROBE_DRIFT'
  | 'NO_FACE_DETECTED'
  | 'WRONG_CHARACTER';

interface CharacterQCResult {
  identity_score: number;
  issues: IdentityIssue[];
  status: 'pass' | 'fail' | 'uncertain';
  confidence: number;
  notes: string;
}

interface QCResult {
  characters: Record<string, CharacterQCResult>;
  overall_score: number;
  needs_regen: boolean;
  verified_at: string;
  shot_hint: string;
  threshold_used: number;
}

// ============================================================================
// QC PROMPT
// ============================================================================

const QC_SYSTEM_PROMPT = `You are a strict visual identity QC system for storyboard production.
Your job is to compare a generated panel against character reference images and detect any identity drift.

You must be STRICT. Even small differences in face shape, hairline, age, or proportions should be flagged.

Return ONLY valid JSON, no markdown.`;

function buildQCPrompt(characterName: string, shotHint: string): string {
  return `TASK: Identity verification for storyboard panel.

CHARACTER TO VERIFY: ${characterName}
SHOT TYPE: ${shotHint}

The FIRST image is the REFERENCE (canon identity).
The SECOND image is the GENERATED PANEL to verify.

COMPARE AND SCORE each aspect 0.0-1.0 (1.0 = perfect match):

1. FACE SHAPE: Does the face structure match? (jawline, cheekbones, nose shape, eye spacing)
2. HAIR: Does the hairstyle, hairline, volume, and length match?
3. AGE: Does the apparent age match the reference?
4. PROPORTIONS: Does the body proportions match? (height, build, head-to-body ratio)
5. WARDROBE: If visible, does the clothing match?

Calculate OVERALL identity_score as weighted average:
- FACE: 40%
- HAIR: 25%
- AGE: 20%
- PROPORTIONS: 10%
- WARDROBE: 5%

ISSUES to flag (only if score < 0.75 in that category):
- FACE_DRIFT: Face structure differs significantly
- HAIR_DRIFT: Hairstyle, color, or length differs
- AGE_SHIFT: Character appears younger or older
- PROPORTION_ERROR: Body proportions are wrong
- WARDROBE_DRIFT: Clothing differs from reference
- NO_FACE_DETECTED: Cannot see face clearly in panel
- WRONG_CHARACTER: This appears to be a different person entirely

OUTPUT (JSON only, no markdown):
{
  "identity_score": 0.0-1.0,
  "issues": ["ISSUE_TYPE"],
  "confidence": 0.0-1.0,
  "notes": "Brief explanation",
  "face_score": 0.0-1.0,
  "hair_score": 0.0-1.0,
  "age_score": 0.0-1.0,
  "proportion_score": 0.0-1.0,
  "wardrobe_score": 0.0-1.0
}`;
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      panelId, 
      panelImageUrl, 
      characterIds,
      shotHint = 'PM',
    } = await req.json();

    if (!panelId || !panelImageUrl || !characterIds?.length) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Missing required fields: panelId, panelImageUrl, characterIds' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    const threshold = getThreshold(shotHint);
    const characterResults: Record<string, CharacterQCResult> = {};
    let totalScore = 0;
    let charCount = 0;

    // Process each character
    for (const charId of characterIds) {
      // Get character reference image (prioritize ref_closeup_front or identity_primary)
      const { data: refSlot } = await supabase
        .from('character_pack_slots')
        .select('image_url, slot_type')
        .eq('character_id', charId)
        .in('slot_type', ['ref_closeup_front', 'identity_primary', 'closeup_front', 'frontal'])
        .in('status', ['accepted', 'uploaded', 'generated'])
        .not('image_url', 'is', null)
        .order('slot_type')
        .limit(1)
        .single();

      if (!refSlot?.image_url) {
        // No reference - can't verify
        characterResults[charId] = {
          identity_score: 0.5,
          issues: [],
          status: 'uncertain',
          confidence: 0,
          notes: 'No reference image available for comparison',
        };
        continue;
      }

      // Get character name for prompt
      const { data: charData } = await supabase
        .from('characters')
        .select('name')
        .eq('id', charId)
        .single();

      const charName = charData?.name || 'Character';

      // Call Vision AI for comparison
      try {
        const aiResponse = await aiFetch({
          url: 'https://ai.gateway.lovable.dev/v1/chat/completions',
          apiKey: LOVABLE_API_KEY,
          payload: {
            model: VISION_QC_MODEL,
            messages: [
              { role: 'system', content: QC_SYSTEM_PROMPT },
              {
                role: 'user',
                content: [
                  { type: 'text', text: buildQCPrompt(charName, shotHint) },
                  { 
                    type: 'image_url', 
                    image_url: { url: refSlot.image_url } 
                  },
                  { 
                    type: 'image_url', 
                    image_url: { url: panelImageUrl } 
                  },
                ],
              },
            ],
            max_tokens: 500,
            temperature: 0.1,
          },
          label: `qc-identity-${charName}`,
        });

        const content = (aiResponse as any)?.choices?.[0]?.message?.content || '';
        
        // Parse JSON response
        let qcData: any;
        try {
          // Handle potential markdown wrapping
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            qcData = JSON.parse(jsonMatch[0]);
          } else {
            throw new Error('No JSON found in response');
          }
        } catch (parseErr) {
          console.error(`Failed to parse QC response for ${charName}:`, content);
          qcData = {
            identity_score: 0.6,
            issues: [],
            confidence: 0.3,
            notes: 'Failed to parse AI response',
          };
        }

        const score = Number(qcData.identity_score) || 0.5;
        const status = score >= threshold ? 'pass' : 'fail';

        characterResults[charId] = {
          identity_score: score,
          issues: (qcData.issues || []) as IdentityIssue[],
          status,
          confidence: Number(qcData.confidence) || 0.7,
          notes: qcData.notes || '',
        };

        totalScore += score;
        charCount++;

      } catch (aiErr) {
        console.error(`AI QC failed for ${charName}:`, aiErr);
        characterResults[charId] = {
          identity_score: 0.5,
          issues: [],
          status: 'uncertain',
          confidence: 0,
          notes: `AI analysis failed: ${aiErr instanceof Error ? aiErr.message : 'Unknown error'}`,
        };
      }
    }

    // Calculate overall score
    const overallScore = charCount > 0 ? totalScore / charCount : 0.5;
    const needsRegen = overallScore < threshold || 
      Object.values(characterResults).some(r => r.status === 'fail');

    const qcResult: QCResult = {
      characters: characterResults,
      overall_score: overallScore,
      needs_regen: needsRegen,
      verified_at: new Date().toISOString(),
      shot_hint: shotHint,
      threshold_used: threshold,
    };

    // Save to panel
    const { error: updateError } = await supabase
      .from('storyboard_panels')
      .update({ identity_qc: qcResult })
      .eq('id', panelId);

    if (updateError) {
      console.error('Failed to save QC result:', updateError);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        qc: qcResult,
        needs_regen: needsRegen,
        threshold,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('qc-storyboard-identity error:', err);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: err instanceof Error ? err.message : 'Unknown error' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
