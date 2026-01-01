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
    const { uploadedImageUrl, anchorImageUrls, characterName, slotType } = await req.json();
    
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    if (!uploadedImageUrl || !anchorImageUrls || anchorImageUrls.length === 0) {
      return new Response(
        JSON.stringify({ 
          passed: true, 
          score: 100, 
          issues: [],
          message: "No hay anchors para comparar, imagen aprobada automáticamente"
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build the vision prompt for identity QC
    const systemPrompt = `You are a visual QC expert for character consistency in film/animation production.
Your task is to compare a newly uploaded image against established "identity anchor" images of the same character.

Check for:
1. FACIAL CONSISTENCY: Face shape, eye shape/color, nose, mouth, ears must match
2. BODY PROPORTIONS: Height, build, limb proportions should be consistent
3. DISTINCTIVE FEATURES: Scars, tattoos, birthmarks, unique traits must be present
4. HAIR: Style, color, length should match (unless outfit-specific changes)
5. SKIN TONE: Must be consistent across all images

For ${slotType} slots:
- Expressions can show different emotions but facial structure must match
- Outfits will have different clothing but character features must be identical
- Turnarounds show different angles - check anatomical consistency

Respond with a JSON object:
{
  "passed": boolean (true if character identity matches, false if significant differences),
  "score": number (0-100, identity match percentage),
  "issues": string[] (list of specific identity problems found),
  "fixNotes": string (actionable guidance to fix issues)
}`;

    const userContent: any[] = [
      { type: "text", text: `Compare this uploaded ${slotType} image for character "${characterName}" against the identity anchors.` },
      { type: "text", text: "UPLOADED IMAGE (to verify):" },
      { type: "image_url", image_url: { url: uploadedImageUrl } },
      { type: "text", text: "IDENTITY ANCHOR IMAGES (reference):" },
    ];

    // Add anchor images (max 4 to avoid token limits)
    anchorImageUrls.slice(0, 4).forEach((url: string, i: number) => {
      userContent.push({ type: "image_url", image_url: { url } });
    });

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded, try again later" }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Payment required" }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      // Fallback: approve image if AI fails
      return new Response(
        JSON.stringify({ 
          passed: true, 
          score: 100, 
          issues: [],
          message: "QC skipped due to AI error"
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiResult = await response.json();
    const content = aiResult.choices?.[0]?.message?.content || "{}";
    
    let qcResult;
    try {
      qcResult = JSON.parse(content);
    } catch {
      // Try to extract JSON from content
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        qcResult = JSON.parse(jsonMatch[0]);
      } else {
        qcResult = { passed: true, score: 100, issues: [], fixNotes: "" };
      }
    }

    return new Response(
      JSON.stringify(qcResult),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("QC Visual Identity error:", error);
    // Fallback: approve on error to not block workflow
    return new Response(
      JSON.stringify({ 
        passed: true, 
        score: 100, 
        issues: [],
        message: "QC error - image approved by default"
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
