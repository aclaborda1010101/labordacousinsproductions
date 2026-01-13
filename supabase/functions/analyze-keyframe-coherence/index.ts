import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAuthOrDemo, authErrorResponse } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-demo-key",
};

/**
 * Analyze Keyframe Coherence
 * Extracts visual parameters from a keyframe image for temporal continuity
 */

interface CoherenceAnalysis {
  lighting: {
    direction: 'left' | 'right' | 'front' | 'back' | 'top' | 'mixed';
    temperature: 'warm' | 'neutral' | 'cool';
    intensity: 'low' | 'medium' | 'high';
    keyToFillRatio: string;
    practicalSources: string[];
  };
  color: {
    dominantPalette: string[];
    saturationLevel: 'muted' | 'natural' | 'vibrant';
    contrastLevel: 'low' | 'medium' | 'high';
    tintShift: string;
  };
  characters: Array<{
    id: string;
    name: string;
    position: { x: number; y: number };
    facing: 'camera' | 'left' | 'right' | 'away';
    wardrobeDescription: string;
    expressionState: string;
  }>;
  background: {
    description: string;
    keyElements: string[];
    depthLayers: string[];
  };
  atmosphere: {
    particles: string[];
    fogLevel: 'none' | 'subtle' | 'medium' | 'heavy';
    weatherIndication: string;
  };
  technicalNotes: string[];
}

interface AnalysisRequest {
  imageUrl: string;
  keyframeId: string;
  shotId: string;
  projectId: string;
  previousAnalysis?: CoherenceAnalysis;
  characters?: Array<{ id: string; name: string }>;
}

const ANALYSIS_SYSTEM_PROMPT = `You are a professional cinematography analyst specializing in visual continuity for film production.

Your task is to analyze a keyframe image and extract precise technical parameters that MUST be maintained in subsequent keyframes to ensure seamless visual continuity.

You must return a JSON object with the exact structure provided, with accurate and specific observations.

CRITICAL CONTINUITY ELEMENTS TO IDENTIFY:
1. LIGHTING: Exact direction, temperature, and source types. This must NOT change between keyframes.
2. COLOR: Dominant palette, saturation, contrast. Must remain consistent.
3. CHARACTER POSITIONS: Where each visible character is located (as percentage of frame).
4. WARDROBE: What each visible character is wearing. Must be IDENTICAL in next keyframe.
5. BACKGROUND: What is visible behind the subjects. Must be the same set/location.
6. ATMOSPHERE: Any particles, fog, weather that must persist.

Be extremely specific. Vague descriptions lead to continuity errors.`;

async function analyzeImageWithAI(
  imageUrl: string,
  characters: Array<{ id: string; name: string }>,
  previousAnalysis?: CoherenceAnalysis
): Promise<CoherenceAnalysis> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) {
    throw new Error("LOVABLE_API_KEY is not configured");
  }

  const characterList = characters.length > 0 
    ? `Known characters that may be present: ${characters.map(c => `${c.name} (ID: ${c.id})`).join(', ')}`
    : 'Character identities unknown - describe based on appearance.';

  const continuityContext = previousAnalysis 
    ? `\n\nPREVIOUS KEYFRAME ANALYSIS (for comparison):
- Lighting was: ${previousAnalysis.lighting.direction} direction, ${previousAnalysis.lighting.temperature} temperature
- Characters were positioned: ${JSON.stringify(previousAnalysis.characters.map(c => ({ name: c.name, position: c.position })))}
- Wardrobe was: ${previousAnalysis.characters.map(c => `${c.name}: ${c.wardrobeDescription}`).join('; ')}

Flag any CHANGES from this previous state.`
    : '';

  const userPrompt = `Analyze this keyframe image for visual continuity parameters.

${characterList}
${continuityContext}

Return a JSON object with this exact structure:
{
  "lighting": {
    "direction": "left|right|front|back|top|mixed",
    "temperature": "warm|neutral|cool",
    "intensity": "low|medium|high",
    "keyToFillRatio": "description like '3:1' or 'soft even'",
    "practicalSources": ["list of visible light sources like 'window left', 'lamp background'"]
  },
  "color": {
    "dominantPalette": ["#hex1", "#hex2", "#hex3", "#hex4", "#hex5"],
    "saturationLevel": "muted|natural|vibrant",
    "contrastLevel": "low|medium|high",
    "tintShift": "description like 'slight magenta in shadows' or 'none'"
  },
  "characters": [
    {
      "id": "character_id or 'unknown_1'",
      "name": "character name",
      "position": { "x": 0-100, "y": 0-100 },
      "facing": "camera|left|right|away",
      "wardrobeDescription": "EXACT clothing description - color, style, accessories",
      "expressionState": "emotional state visible in face/body"
    }
  ],
  "background": {
    "description": "detailed description of the setting",
    "keyElements": ["list of notable background elements that must persist"],
    "depthLayers": ["foreground", "midground", "background elements"]
  },
  "atmosphere": {
    "particles": ["dust", "smoke", "rain", etc. or empty array],
    "fogLevel": "none|subtle|medium|heavy",
    "weatherIndication": "visible weather or 'interior/none'"
  },
  "technicalNotes": ["any other continuity-critical observations"]
}`;

  // Use vision-capable model
  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: ANALYSIS_SYSTEM_PROMPT },
        { 
          role: "user", 
          content: [
            { type: "text", text: userPrompt },
            { type: "image_url", image_url: { url: imageUrl } }
          ]
        }
      ],
      response_format: { type: "json_object" },
      max_tokens: 2000, // Gemini uses max_tokens (not OpenAI)
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("AI analysis failed:", errorText);
    throw new Error(`AI analysis failed: ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("No content in AI response");
  }

  try {
    return JSON.parse(content) as CoherenceAnalysis;
  } catch {
    console.error("Failed to parse coherence analysis:", content);
    throw new Error("Failed to parse AI response as JSON");
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { userId, supabase } = await requireAuthOrDemo(req);
    console.log("[AUTH] Authenticated user:", userId);

    const request: AnalysisRequest = await req.json();
    console.log("=== Analyze Keyframe Coherence ===");
    console.log("Keyframe ID:", request.keyframeId);
    console.log("Has previous analysis:", !!request.previousAnalysis);

    // Validate image URL
    if (!request.imageUrl) {
      throw new Error("imageUrl is required");
    }

    // Perform AI analysis
    const analysis = await analyzeImageWithAI(
      request.imageUrl,
      request.characters || [],
      request.previousAnalysis
    );

    console.log("Analysis complete. Found", analysis.characters.length, "characters");
    console.log("Lighting:", analysis.lighting.direction, analysis.lighting.temperature);

    // Store analysis in database for future reference
    const { error: insertError } = await supabase
      .from('continuity_anchors')
      .upsert({
        project_id: request.projectId,
        name: `keyframe_coherence_${request.keyframeId}`,
        anchor_type: 'keyframe_coherence',
        description: `Coherence analysis for keyframe ${request.keyframeId}`,
        value: analysis as unknown,
      }, {
        onConflict: 'project_id,name',
      });

    if (insertError) {
      console.error("Failed to store analysis:", insertError);
      // Don't throw - analysis was successful, storage is secondary
    }

    // Build prompt injection for next keyframe generation
    const promptInjection = buildContinuityPromptInjection(analysis);

    return new Response(
      JSON.stringify({
        success: true,
        analysis,
        promptInjection,
        analyzedAt: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in analyze-keyframe-coherence:", error);
    
    if (error instanceof Error && error.message.includes('AUTH')) {
      return authErrorResponse(new Error(error.message), corsHeaders);
    }
    
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function buildContinuityPromptInjection(analysis: CoherenceAnalysis): string {
  const characterDescriptions = analysis.characters.map(c => 
    `${c.name}: positioned at ${c.position.x}%, ${c.position.y}% of frame, facing ${c.facing}. Wearing: ${c.wardrobeDescription}. Expression: ${c.expressionState}`
  ).join('\n');

  return `
=== CONTINUITY LOCK FROM PREVIOUS KEYFRAME (MANDATORY) ===

LIGHTING (DO NOT CHANGE):
- Direction: ${analysis.lighting.direction}
- Temperature: ${analysis.lighting.temperature}
- Intensity: ${analysis.lighting.intensity}
- Key-to-fill ratio: ${analysis.lighting.keyToFillRatio}
- Practical sources: ${analysis.lighting.practicalSources.join(', ') || 'none visible'}

COLOR GRADING (DO NOT CHANGE):
- Dominant palette: ${analysis.color.dominantPalette.join(', ')}
- Saturation: ${analysis.color.saturationLevel}
- Contrast: ${analysis.color.contrastLevel}
- Tint: ${analysis.color.tintShift}

CHARACTERS (WARDROBE IDENTICAL, POSITIONS CAN EVOLVE NATURALLY):
${characterDescriptions}

BACKGROUND (SAME LOCATION):
${analysis.background.description}
Key elements that MUST be visible: ${analysis.background.keyElements.join(', ')}

ATMOSPHERE:
- Particles: ${analysis.atmosphere.particles.join(', ') || 'none'}
- Fog: ${analysis.atmosphere.fogLevel}
- Weather: ${analysis.atmosphere.weatherIndication}

${analysis.technicalNotes.length > 0 ? `ADDITIONAL NOTES:\n${analysis.technicalNotes.join('\n')}` : ''}

=== END CONTINUITY LOCK ===
`;
}
