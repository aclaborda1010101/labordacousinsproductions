/**
 * generate-angle-variants - Multi-Angle Meta-Prompting Pipeline
 * 
 * Inspired by Runway AI workflow: uses chained LLM calls to generate
 * multiple camera angle descriptions from a single reference image.
 * 
 * Pipeline:
 * 1. Intent Translator: Creates structured rules based on project context
 * 2. Angle Descriptor: Generates 4 detailed camera angle descriptions
 * 3. Returns JSON with angle variants ready for image generation
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Intent Translator System Prompt - Creates custom rules for the Angle Descriptor
const INTENT_TRANSLATOR_PROMPT = `You are a sophisticated intent translator and rule maker, designed to write a comprehensive set of system instructions based on a simple user prompt. These instructions will be given to an AI image or video model, so everything MUST have a foundation in visual media.

The user will write 1-2 sentences about what they are looking for, and you will write a set of custom instructions with the following mandatory categories:

- Identity (2-3 sentences)
[What purpose is this built for and how should it respond to user requests. Paragraph should always start with "you are a _____".]

- Rules (maximum 5 rules, all single sentences)
[What are the rules this custom instruction should follow - be descriptive!]

- Example (maximum 2 examples)
[Provide an example of user / instruction flow]

- DO NOT IGNORE THIS RULE (maximum 1 rule)
[One, singular rule that the custom instructions must follow in order to be successful]

Your output response should not exceed 1500 words. Please be clear, concise, and effective with building out custom instructions.

Each section header MUST be labeled with 2 hashtags followed by the header (## Identity)`;

// Angle Descriptor System Prompt - Generates camera angle variations
const ANGLE_DESCRIPTOR_PROMPT = `You are an expert camera operator and visual storyteller, designed to reimagine existing visual compositions from novel camera perspectives. Your purpose is to meticulously describe how a scene would appear from a specified or intelligently inferred new angle, focusing on changes in perspective, framing, depth, and the emotional impact these changes create. You will act as a director, guiding the viewer's eye through a fresh visual interpretation.

## Rules
- Every response must begin with "change the angle to..."
- Descriptions must be highly detailed and visually descriptive
- Focus on how the new angle alters perception of scale, emotion, key elements
- Maintain the subject's identity, features, and characteristics across all angles
- Output in JSON format with "ID:#" for each angle

## Example
User prompt: "An image shows a wide shot of a bustling city street at sunset. Describe it from a low-angle perspective, looking up."

Your response:
{
  "ID:1": "change the angle to a worms-eye view. The towering skyscrapers now loom majestically, their illuminated windows reflecting the fiery hues of the setting sun directly above. Pedestrians become silhouettes hurrying past, their legs and feet dominating the lower frame, creating a sense of urgency and overwhelming scale."
}

## DO NOT IGNORE THIS RULE
- The generated description must exclusively focus on what is visually observable from the new camera angle, ensuring every detail contributes to a vivid and immersive reimagining of the scene while maintaining the subject's core identity.`;

// Angle presets for different entity types
const ANGLE_PRESETS: Record<string, { angles: string[]; context: string }> = {
  character_turnaround: {
    angles: [
      "Close-up from slightly above, focusing on face and expression with soft, dramatic lighting",
      "Profile shot from the right side, capturing the silhouette and facial contours",
      "Three-quarter view from behind, showing back of head and shoulder line",
      "Wide establishing shot pulled back to reveal full body posture and stance",
    ],
    context: "character portrait turnaround for visual consistency in production",
  },
  character_expressions: {
    angles: [
      "Close-up frontal with neutral expression, even lighting highlighting facial features",
      "Slight Dutch angle with happy/smiling expression, warm lighting",
      "Close-up with sad/melancholic expression, cooler tones and subtle shadows",
      "Three-quarter view with surprised expression, dramatic side lighting",
    ],
    context: "expression sheet for character animation and continuity",
  },
  location_coverage: {
    angles: [
      "Wide establishing shot showing the full environment and spatial context",
      "Medium interior shot focusing on the main activity area",
      "Detail insert shot highlighting key props or architectural features",
      "Dramatic low-angle shot emphasizing atmosphere and scale",
    ],
    context: "location coverage for scene planning and visual development",
  },
  scene_coverage: {
    angles: [
      "Master wide shot capturing all characters and the environment",
      "Over-the-shoulder shot for dialogue scenes",
      "Close-up reaction shot focusing on emotional beats",
      "Insert shot for key narrative details or actions",
    ],
    context: "cinematic coverage for film/video production",
  },
};

interface RequestBody {
  referenceImageUrl: string;
  entityType: "character" | "location" | "scene" | "keyframe";
  entityName: string;
  description?: string;
  visualDNA?: Record<string, unknown>;
  projectStyle?: {
    visualStyle?: string;
    animationType?: string;
    genre?: string;
    tone?: string;
  };
  presetType?: keyof typeof ANGLE_PRESETS;
  customAngles?: string[];
  projectId?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: authError } = await supabase.auth.getClaims(token);
    if (authError || !claims?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body: RequestBody = await req.json();
    const {
      referenceImageUrl,
      entityType,
      entityName,
      description,
      visualDNA,
      projectStyle,
      presetType,
      customAngles,
    } = body;

    if (!referenceImageUrl || !entityType || !entityName) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: referenceImageUrl, entityType, entityName" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI service not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Determine which angles to request
    const preset = ANGLE_PRESETS[presetType || `${entityType}_turnaround`] || ANGLE_PRESETS.character_turnaround;
    const requestedAngles = customAngles?.length ? customAngles : preset.angles;

    // Build context for the Intent Translator
    const styleContext = projectStyle
      ? `Visual style: ${projectStyle.visualStyle || "cinematic"}. Animation type: ${projectStyle.animationType || "live action"}. Genre: ${projectStyle.genre || "drama"}. Tone: ${projectStyle.tone || "professional"}.`
      : "Cinematic, high-quality visual production.";

    const visualDNAContext = visualDNA
      ? `Subject identity: ${JSON.stringify(visualDNA).slice(0, 500)}`
      : "";

    const intentRequest = `Create instructions for reimagining a ${entityType} named "${entityName}" from multiple camera angles.
${description ? `Description: ${description}` : ""}
${styleContext}
${visualDNAContext}
Purpose: ${preset.context}`;

    console.log("[generate-angle-variants] Step 1: Intent Translation...");

    // Step 1: Intent Translator - Generate custom rules
    const intentResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: INTENT_TRANSLATOR_PROMPT },
          { role: "user", content: intentRequest },
        ],
        max_tokens: 2000,
      }),
    });

    if (!intentResponse.ok) {
      console.error("Intent translation failed:", await intentResponse.text());
      throw new Error("Intent translation failed");
    }

    const intentData = await intentResponse.json();
    const customRules = intentData.choices?.[0]?.message?.content || "";

    console.log("[generate-angle-variants] Step 2: Angle Description...");

    // Step 2: Angle Descriptor - Generate 4 angle variations
    // Combine the base system prompt with custom rules
    const combinedSystemPrompt = `${ANGLE_DESCRIPTOR_PROMPT}

## Custom Instructions for This Request
${customRules}`;

    const angleRequest = `Analyze this ${entityType} image and generate ${requestedAngles.length} different camera angle descriptions.

Subject: ${entityName}
${description ? `Description: ${description}` : ""}

Generate descriptions for these specific angles:
${requestedAngles.map((angle, i) => `${i + 1}. ${angle}`).join("\n")}

CRITICAL: Maintain the subject's core visual identity across all angles. Each description must start with "change the angle to..." and be detailed enough for image generation.

Return a valid JSON object with keys "ID:1", "ID:2", etc.`;

    const angleResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: combinedSystemPrompt },
          {
            role: "user",
            content: [
              { type: "text", text: angleRequest },
              { type: "image_url", image_url: { url: referenceImageUrl } },
            ],
          },
        ],
        max_tokens: 3000,
      }),
    });

    if (!angleResponse.ok) {
      const errorText = await angleResponse.text();
      console.error("Angle description failed:", errorText);
      throw new Error("Angle description failed");
    }

    const angleData = await angleResponse.json();
    const angleContent = angleData.choices?.[0]?.message?.content || "";

    // Parse the JSON response
    let anglesJson: Record<string, string> = {};
    try {
      // Extract JSON from markdown fences if present
      const jsonMatch = angleContent.match(/```(?:json)?\s*([\s\S]*?)```/);
      const jsonStr = jsonMatch ? jsonMatch[1].trim() : angleContent.trim();
      anglesJson = JSON.parse(jsonStr);
    } catch (parseError) {
      console.error("Failed to parse angle JSON:", parseError);
      // Try to extract individual angle descriptions
      const angleMatches = angleContent.matchAll(/"ID:(\d+)":\s*"([^"]+)"/g);
      for (const match of angleMatches) {
        anglesJson[`ID:${match[1]}`] = match[2];
      }
    }

    // Transform to structured response
    const variants = Object.entries(anglesJson).map(([id, description], index) => ({
      id: id.replace("ID:", "variant_"),
      angleIndex: index + 1,
      requestedAngle: requestedAngles[index] || `Angle ${index + 1}`,
      description: description as string,
      previewPrompt: (description as string).replace(/^change the angle to\s*/i, "").slice(0, 150) + "...",
    }));

    console.log(`[generate-angle-variants] Generated ${variants.length} angle variants`);

    return new Response(
      JSON.stringify({
        success: true,
        entityType,
        entityName,
        referenceImageUrl,
        variants,
        customRules: customRules.slice(0, 500) + "...", // Truncated for response size
        presetUsed: presetType || `${entityType}_turnaround`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[generate-angle-variants] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
