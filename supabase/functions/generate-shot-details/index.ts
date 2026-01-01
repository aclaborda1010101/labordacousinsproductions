import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GenerateShotDetailsRequest {
  sceneDescription: string;
  shotNo: number;
  totalShots: number;
  characters: string[];
  location?: string;
  dialogue?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY not configured');

    const request: GenerateShotDetailsRequest = await req.json();
    const { sceneDescription, shotNo, totalShots, characters, location, dialogue } = request;

    console.log(`Generating shot details for shot ${shotNo} of ${totalShots}`);

    const prompt = `You are a professional cinematographer. Analyze this scene and suggest the best shot composition.

Scene: ${sceneDescription}
Shot number: ${shotNo}${totalShots > 1 ? ` of ${totalShots}` : ''}
Characters: ${characters.length > 0 ? characters.join(', ') : 'None specified'}
Location: ${location || 'Not specified'}
${dialogue ? `Dialogue: "${dialogue}"` : ''}

Respond with a JSON object containing:
{
  "shotType": "one of: extreme-wide, wide, full, medium-wide, medium, medium-close, close-up, extreme-close, over-shoulder, pov, insert",
  "cameraMovement": "one of: static, pan-left, pan-right, tilt-up, tilt-down, dolly-in, dolly-out, tracking, crane-up, crane-down, handheld, steadicam",
  "cameraAngle": "description of the camera angle (e.g., eye-level, low-angle, high-angle, dutch)",
  "blockingDescription": "brief description of character positions and movements",
  "blockingAction": "the main action happening in this shot",
  "duration": number between 2-10 seconds
}

Consider:
- If there's dialogue, use medium or close-up shots
- Establish scenes with wider shots first
- Use camera movement to add dynamism
- Match the emotional tone of the scene

Return ONLY the JSON object, no additional text.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI error:', response.status, errorText);
      
      if (response.status === 429) {
        throw new Error('Rate limit exceeded');
      }
      if (response.status === 402) {
        throw new Error('Payment required');
      }
      throw new Error(`AI request failed: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    
    console.log('AI response:', content);

    // Parse JSON from response
    let details;
    try {
      // Try to extract JSON from response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        details = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      // Provide defaults
      details = {
        shotType: 'medium',
        cameraMovement: 'static',
        cameraAngle: 'eye-level',
        blockingDescription: 'Standard framing',
        blockingAction: 'Scene action',
        duration: 3
      };
    }

    return new Response(JSON.stringify(details), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in generate-shot-details:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const status = errorMessage.includes('Rate limit') ? 429 : 
                   errorMessage.includes('Payment required') ? 402 : 500;
    
    return new Response(JSON.stringify({
      error: errorMessage,
      // Provide defaults even on error
      shotType: 'medium',
      cameraMovement: 'static',
      cameraAngle: 'eye-level',
      blockingDescription: '',
      blockingAction: '',
      duration: 3
    }), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
