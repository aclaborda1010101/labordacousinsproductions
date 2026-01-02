import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { scriptText, projectId } = await req.json();

    if (!scriptText) {
      return new Response(
        JSON.stringify({ error: "Script text is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      console.error("OPENAI_API_KEY is not configured");
      return new Response(
        JSON.stringify({ error: "AI service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const systemPrompt = `You are a professional script breakdown assistant. Analyze the provided screenplay text and extract scenes.

For each scene, identify:
1. Slugline (scene heading like "INT. COFFEE SHOP - DAY")
2. A brief summary of what happens (1-2 sentences)
3. Characters present (names only)
4. Location name
5. Time of day (day, night, dawn, dusk, continuous)
6. Count of dialogue lines

Return a JSON object with this structure:
{
  "scenes": [
    {
      "slugline": "INT. COFFEE SHOP - DAY",
      "summary": "Sarah meets James for a tense confrontation about evidence.",
      "characters": ["SARAH", "JAMES"],
      "location": "Coffee Shop",
      "time_of_day": "day",
      "dialogue_count": 5
    }
  ]
}

Rules:
- Split scenes at INT./EXT. headers
- Extract character names from dialogue (they appear in ALL CAPS before dialogue)
- Parse location from slugline
- Keep summaries concise and action-focused
- Return valid JSON only`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Parse this screenplay:\n\n${scriptText}` }
        ],
        temperature: 0.3,
        response_format: { type: "json_object" }
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Usage limit reached. Please add credits." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      return new Response(
        JSON.stringify({ error: "AI service error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    // Parse JSON from response
    let scenes = [];
    try {
      // Try to extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        scenes = parsed.scenes || [];
      }
    } catch (parseError) {
      console.error("Error parsing AI response:", parseError);
      console.log("Raw content:", content);
      
      // Fallback: Create a basic scene from the script
      scenes = [{
        slugline: "SCENE 1",
        summary: "Imported scene from script",
        characters: [],
        location: "Unknown",
        time_of_day: "day",
        dialogue_count: 0
      }];
    }

    console.log(`Parsed ${scenes.length} scenes from script`);

    return new Response(
      JSON.stringify({ scenes }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("parse-script error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
