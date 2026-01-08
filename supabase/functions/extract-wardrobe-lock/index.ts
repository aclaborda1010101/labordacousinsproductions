import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface WardrobeLockRequest {
  characterId: string;
  imageUrl: string;
  outfitName?: string;
}

interface WardrobeLock {
  primary_outfit: string;
  top: string;
  bottom: string;
  footwear: string;
  accessories: string[];
  hair_style: string;
  makeup_style: string;
  color_palette: string[];
  fabric_textures: string[];
  distinctive_elements: string[];
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

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { characterId, imageUrl, outfitName } = await req.json() as WardrobeLockRequest;

    if (!characterId || !imageUrl) {
      throw new Error("Missing characterId or imageUrl");
    }

    // Use Gemini Pro Vision to extract detailed wardrobe description
    const extractionPrompt = `You are a professional costume designer and wardrobe supervisor for film production.

Analyze this image and extract a DETAILED wardrobe description that can be used to ensure EXACT consistency across all future shots.

Focus on:
1. **Primary Outfit**: One-sentence overall description
2. **Top/Upper Body**: Specific garment type, color, pattern, fit, collar style, sleeves
3. **Bottom/Lower Body**: Pants/skirt type, color, fit, length
4. **Footwear**: Type, color, style, condition
5. **Accessories**: Watches, jewelry, bags, belts, glasses (with specific details like "silver watch on left wrist")
6. **Hair Style**: Cut, length, color, styling (parted left, slicked back, messy, etc.)
7. **Makeup Style**: Natural, dramatic, specific features (red lipstick, smoky eyes, etc.)
8. **Color Palette**: Exact colors used (use descriptive names like "navy blue", "cream white")
9. **Fabric Textures**: Cotton, silk, leather, denim, etc.
10. **Distinctive Elements**: Any unique or notable features

Be EXTREMELY specific - these descriptions will be injected into AI image generation prompts.

Respond in JSON format ONLY:
{
  "primary_outfit": "Complete outfit summary in one sentence",
  "top": "Detailed top/upper body description",
  "bottom": "Detailed bottom/lower body description",
  "footwear": "Detailed footwear description",
  "accessories": ["accessory 1 with details", "accessory 2 with details"],
  "hair_style": "Detailed hair description",
  "makeup_style": "Makeup description or 'natural/none'",
  "color_palette": ["color1", "color2", "color3"],
  "fabric_textures": ["texture1", "texture2"],
  "distinctive_elements": ["element1", "element2"]
}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: extractionPrompt },
              { type: "image_url", image_url: { url: imageUrl } }
            ]
          }
        ],
        temperature: 0.2,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI Gateway error:", response.status, errorText);
      throw new Error("Failed to analyze wardrobe");
    }

    const aiResponse = await response.json();
    const content = aiResponse.choices?.[0]?.message?.content || "";
    
    // Parse JSON from response
    let wardrobeLock: WardrobeLock;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        wardrobeLock = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("No JSON found in response");
      }
    } catch (parseError) {
      console.error("Failed to parse AI response:", content);
      throw new Error("Failed to parse wardrobe analysis");
    }

    // Save to character
    const { error: updateError } = await supabase
      .from("characters")
      .update({ 
        wardrobe_lock_json: {
          ...wardrobeLock,
          outfit_name: outfitName || "Default",
          locked_at: new Date().toISOString(),
          source_image: imageUrl
        }
      })
      .eq("id", characterId);

    if (updateError) {
      console.error("Failed to save wardrobe lock:", updateError);
      throw new Error("Failed to save wardrobe lock");
    }

    return new Response(JSON.stringify({
      success: true,
      wardrobeLock
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Error extracting wardrobe:", error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : "Unknown error"
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
