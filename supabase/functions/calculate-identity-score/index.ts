import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface IdentityScoreRequest {
  generatedImageUrl: string;
  referenceImageUrls: string[];
  characterId: string;
  slotId?: string;
}

interface IdentityScoreResult {
  score: number; // 0-100
  passed: boolean;
  details: {
    facial_similarity: number;
    age_consistency: number;
    skin_tone_match: number;
    distinctive_features_match: number;
  };
  issues: string[];
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY not configured");
    }

    const { generatedImageUrl, referenceImageUrls, characterId, slotId } = await req.json() as IdentityScoreRequest;

    if (!generatedImageUrl || !referenceImageUrls?.length) {
      throw new Error("Missing required image URLs");
    }

    // Use Gemini Pro Vision to analyze identity consistency
    const analysisPrompt = `You are an expert in facial recognition and identity verification for film production.

Compare the GENERATED image against the REFERENCE images and evaluate identity consistency.

REFERENCE IMAGES (canonical identity):
${referenceImageUrls.map((url, i) => `Reference ${i + 1}: ${url}`).join('\n')}

GENERATED IMAGE (to evaluate):
${generatedImageUrl}

Analyze and score the following aspects (0-100 each):

1. **Facial Similarity**: Overall face shape, proportions, and structure match
2. **Age Consistency**: Does the apparent age match the references?
3. **Skin Tone Match**: Is the skin tone/complexion consistent?
4. **Distinctive Features Match**: Do unique features (moles, scars, freckles, eye color, nose shape, lip shape) match?

For each issue found, provide a specific description.

Respond in JSON format ONLY:
{
  "facial_similarity": <0-100>,
  "age_consistency": <0-100>,
  "skin_tone_match": <0-100>,
  "distinctive_features_match": <0-100>,
  "overall_score": <0-100>,
  "passed": <true if overall_score >= 85>,
  "issues": ["issue1", "issue2", ...]
}`;

    // Build message content with images
    const messageContent: Array<{type: string; text?: string; image_url?: {url: string}}> = [
      { type: "text", text: analysisPrompt }
    ];

    // Add reference images
    for (const refUrl of referenceImageUrls.slice(0, 4)) { // Limit to 4 references
      messageContent.push({
        type: "image_url",
        image_url: { url: refUrl }
      });
    }

    // Add generated image
    messageContent.push({
      type: "image_url",
      image_url: { url: generatedImageUrl }
    });

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          {
            role: "user",
            content: messageContent
          }
        ],
        temperature: 0.1, // Low temperature for consistent scoring
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI Gateway error:", response.status, errorText);
      // Return a default passing score if AI fails (don't block generation)
      return new Response(JSON.stringify({
        score: 75,
        passed: false,
        details: {
          facial_similarity: 75,
          age_consistency: 75,
          skin_tone_match: 75,
          distinctive_features_match: 75
        },
        issues: ["Identity analysis unavailable - manual review recommended"]
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiResponse = await response.json();
    const content = aiResponse.choices?.[0]?.message?.content || "";
    
    // Parse JSON from response
    let analysisResult;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        analysisResult = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("No JSON found in response");
      }
    } catch (parseError) {
      console.error("Failed to parse AI response:", content);
      analysisResult = {
        facial_similarity: 70,
        age_consistency: 70,
        skin_tone_match: 70,
        distinctive_features_match: 70,
        overall_score: 70,
        passed: false,
        issues: ["Analysis parsing failed - manual review recommended"]
      };
    }

    const result: IdentityScoreResult = {
      score: analysisResult.overall_score || 70,
      passed: analysisResult.passed || analysisResult.overall_score >= 85,
      details: {
        facial_similarity: analysisResult.facial_similarity || 70,
        age_consistency: analysisResult.age_consistency || 70,
        skin_tone_match: analysisResult.skin_tone_match || 70,
        distinctive_features_match: analysisResult.distinctive_features_match || 70,
      },
      issues: analysisResult.issues || []
    };

    // If slotId provided, update the slot with the identity score
    if (slotId && characterId) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      await supabase
        .from("character_pack_slots")
        .update({ identity_score: result.score })
        .eq("id", slotId);

      // Recalculate average identity score for character
      const { data: slots } = await supabase
        .from("character_pack_slots")
        .select("identity_score")
        .eq("character_id", characterId)
        .not("identity_score", "is", null);

      if (slots && slots.length > 0) {
        const avgScore = Math.round(
          slots.reduce((sum, s) => sum + (s.identity_score || 0), 0) / slots.length
        );
        
        await supabase
          .from("characters")
          .update({ identity_lock_score: avgScore })
          .eq("id", characterId);
      }
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Error calculating identity score:", error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : "Unknown error",
      score: 0,
      passed: false,
      details: {
        facial_similarity: 0,
        age_consistency: 0,
        skin_tone_match: 0,
        distinctive_features_match: 0
      },
      issues: ["Identity analysis failed"]
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
