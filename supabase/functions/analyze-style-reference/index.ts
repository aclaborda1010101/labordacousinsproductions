import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface StyleAnalysisResult {
  preset_match: string | null;
  confidence: number;
  camera: {
    recommended_body: string;
    recommended_lens: string;
    focal_length: string;
    aperture: string;
  };
  style: {
    lighting: string;
    color_palette: string[];
    mood: string;
    contrast: 'low' | 'medium' | 'high';
    saturation: 'muted' | 'natural' | 'vibrant';
    grain: 'none' | 'subtle' | 'medium' | 'heavy';
    era: string;
    genre_hints: string[];
  };
  composition: {
    typical_framing: string[];
    movement_style: string[];
    aspect_ratio_suggestion: string;
  };
  prompt_modifiers: string[];
  negative_modifiers: string[];
  description: string;
}

const SYSTEM_PROMPT = `You are an expert cinematographer and visual style analyst. 
Analyze the provided reference image and extract detailed visual style information.

Return a JSON object with this exact structure:
{
  "preset_match": "noir" | "epic" | "documentary" | "fantasy" | "realistic" | "vintage" | "horror" | "comedy" | null,
  "confidence": 0.0-1.0,
  "camera": {
    "recommended_body": "camera body recommendation",
    "recommended_lens": "lens recommendation", 
    "focal_length": "e.g. 35mm",
    "aperture": "e.g. f/2.8"
  },
  "style": {
    "lighting": "detailed lighting description",
    "color_palette": ["#hex1", "#hex2", "#hex3", "#hex4"],
    "mood": "mood description",
    "contrast": "low" | "medium" | "high",
    "saturation": "muted" | "natural" | "vibrant",
    "grain": "none" | "subtle" | "medium" | "heavy",
    "era": "time period or 'contemporary'",
    "genre_hints": ["genre1", "genre2"]
  },
  "composition": {
    "typical_framing": ["framing style 1", "framing style 2"],
    "movement_style": ["movement 1", "movement 2"],
    "aspect_ratio_suggestion": "16:9" | "2.39:1" | "1.85:1" | "4:3"
  },
  "prompt_modifiers": ["modifier1", "modifier2", "..."],
  "negative_modifiers": ["avoid1", "avoid2", "..."],
  "description": "2-3 sentence natural language description of the visual style"
}

Be specific and professional. Extract concrete technical recommendations.
For color_palette, provide 4 hex colors that capture the dominant palette.
For prompt_modifiers, provide 6-10 descriptive terms useful for AI image generation.
Match to a preset if the style clearly fits; otherwise use null.`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageUrl, imageBase64 } = await req.json();

    if (!imageUrl && !imageBase64) {
      return new Response(
        JSON.stringify({ error: 'imageUrl or imageBase64 required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    // Build image content for the API
    const imageContent = imageBase64 
      ? { type: 'image_url', image_url: { url: imageBase64 } }
      : { type: 'image_url', image_url: { url: imageUrl } };

    console.log('=== ANALYZE STYLE REFERENCE ===');
    console.log('Image source:', imageUrl ? 'URL' : 'Base64');

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Analyze this reference image and extract the visual style information. Return only valid JSON.' },
              imageContent,
            ],
          },
        ],
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI API error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'Payment required. Please add credits.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      throw new Error(`AI API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    
    console.log('Raw AI response:', content.substring(0, 500));

    // Parse JSON from response
    let analysis: StyleAnalysisResult;
    try {
      // Try to extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        analysis = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      console.error('JSON parse error:', parseError);
      // Return a default analysis if parsing fails
      analysis = {
        preset_match: null,
        confidence: 0.5,
        camera: {
          recommended_body: 'ARRI Alexa Mini',
          recommended_lens: 'Zeiss Supreme Prime',
          focal_length: '35mm',
          aperture: 'f/2.8',
        },
        style: {
          lighting: 'natural lighting',
          color_palette: ['#2c2c2c', '#5a5a5a', '#8b8b8b', '#d4d4d4'],
          mood: 'neutral',
          contrast: 'medium',
          saturation: 'natural',
          grain: 'subtle',
          era: 'contemporary',
          genre_hints: ['drama'],
        },
        composition: {
          typical_framing: ['medium shot', 'close-up'],
          movement_style: ['static', 'subtle dolly'],
          aspect_ratio_suggestion: '16:9',
        },
        prompt_modifiers: ['cinematic', 'professional lighting'],
        negative_modifiers: ['amateur', 'low quality'],
        description: 'Unable to fully analyze the image. Using default cinematic settings.',
      };
    }

    console.log('Analysis complete:', {
      preset_match: analysis.preset_match,
      confidence: analysis.confidence,
      mood: analysis.style?.mood,
    });

    return new Response(
      JSON.stringify({ success: true, analysis }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error in analyze-style-reference:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
