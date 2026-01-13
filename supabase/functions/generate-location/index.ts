import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logGenerationCost, extractUserId } from "../_shared/cost-logging.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface LocationGenerationRequest {
  locationName: string;
  locationDescription: string;
  viewAngle: string;
  timeOfDay?: string;
  weather?: string;
  styleToken?: string;
  projectStyle?: {
    colorPalette?: any;
    lensStyle?: string;
    grainLevel?: string;
  };
  // Reference-based generation
  projectId?: string;
  locationId?: string;
  referenceImageUrl?: string;
  // NEW: 360° multi-angle references
  spatialReferenceUrls?: string[];
  mode?: 'text_to_image' | 'stylize_from_reference';
  stylePackId?: string;
}

// Use Gemini 3 Pro Image for locations - best available for cinematic environments
const IMAGE_MODEL = 'google/gemini-3-pro-image-preview';

// Supported image formats for Gemini
const SUPPORTED_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];
const VALID_MIME_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'];

// Convert image URL to base64 data URL
async function urlToBase64(url: string): Promise<string | null> {
  try {
    console.log(`[generate-location] urlToBase64 called with: ${url}`);
    
    // First fetch to check content type
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`[generate-location] Failed to fetch image: ${response.status}`);
      return null;
    }
    
    const contentType = response.headers.get('content-type') || '';
    console.log(`[generate-location] Content-Type header: ${contentType}`);
    
    // Validate by content type first (more reliable)
    const isValidType = VALID_MIME_TYPES.some(t => contentType.toLowerCase().includes(t));
    
    // Also check URL extension as fallback
    const urlLower = url.toLowerCase();
    const hasValidExtension = SUPPORTED_EXTENSIONS.some(ext => urlLower.includes(ext));
    
    if (!isValidType && !hasValidExtension) {
      console.log(`[generate-location] Skipping unsupported format. ContentType: ${contentType}, URL: ${url}`);
      return null;
    }
    
    const arrayBuffer = await response.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    
    // Convert to base64 in chunks to avoid call stack issues with large images
    let binary = '';
    const chunkSize = 32768;
    for (let i = 0; i < uint8Array.length; i += chunkSize) {
      const chunk = uint8Array.subarray(i, i + chunkSize);
      binary += String.fromCharCode.apply(null, Array.from(chunk));
    }
    const base64 = btoa(binary);
    
    // Use the actual content type or infer from extension
    const mimeType = contentType.split(';')[0] || 'image/jpeg';
    
    console.log(`[generate-location] Converted to base64: ${base64.length} chars, type: ${mimeType}`);
    
    return `data:${mimeType};base64,${base64}`;
  } catch (error) {
    console.error(`[generate-location] Error converting URL to base64:`, error);
    return null;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    // Validate auth internally
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      console.error('[generate-location] Missing or invalid Authorization header');
      return new Response(
        JSON.stringify({ error: 'Unauthorized', code: 401 }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const token = authHeader.replace('Bearer ', '');
    const { data: claims, error: authError } = await supabase.auth.getUser(token);
    if (authError || !claims?.user) {
      console.error('[generate-location] Invalid JWT:', authError?.message);
      return new Response(
        JSON.stringify({ error: 'Unauthorized', code: 401 }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[generate-location] Authenticated user: ${claims.user.id}`);

    const {
      locationName, 
      locationDescription, 
      viewAngle, 
      timeOfDay = 'day',
      weather = 'clear',
      styleToken,
      projectStyle,
      projectId,
      locationId,
      referenceImageUrl,
      spatialReferenceUrls,
      mode = (referenceImageUrl || spatialReferenceUrls?.length) ? 'stylize_from_reference' : 'text_to_image',
      stylePackId
    }: LocationGenerationRequest = await req.json();

    // Collect all reference images (primary + spatial 360°)
    const allReferenceUrls: string[] = [];
    if (referenceImageUrl) allReferenceUrls.push(referenceImageUrl);
    if (spatialReferenceUrls?.length) allReferenceUrls.push(...spatialReferenceUrls);
    
    console.log(`[generate-location] References available: ${allReferenceUrls.length} (primary: ${referenceImageUrl ? 1 : 0}, spatial: ${spatialReferenceUrls?.length || 0})`);

    console.log(`[generate-location] Generating: ${locationName}, view: ${viewAngle}, time: ${timeOfDay}, mode: ${mode}`);

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    // Load project style pack if available
    let styleLockBlock = '';
    let negativeModifiers = '';
    
    if (projectId) {
      // Use service role to fetch style pack
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
      
      const { data: stylePack } = await supabaseAdmin
        .from('style_packs')
        .select('style_config, token, prompt_modifiers, negative_modifiers')
        .eq('project_id', projectId)
        .eq('is_active', true)
        .maybeSingle();
      
      if (stylePack) {
        console.log(`[generate-location] Found style pack for project, applying style lock`);
        
        const styleConfig = stylePack.style_config as any;
        
        // Build style lock block from project's Visual Bible
        const styleParts: string[] = [];
        
        if (styleConfig?.style_name) {
          styleParts.push(`Art style: ${styleConfig.style_name}`);
        }
        if (styleConfig?.animation_type) {
          styleParts.push(`Animation type: ${styleConfig.animation_type}`);
        }
        if (styleConfig?.lighting?.key_style) {
          styleParts.push(`Lighting: ${styleConfig.lighting.key_style}`);
        }
        if (styleConfig?.color_grading?.mood) {
          styleParts.push(`Color mood: ${styleConfig.color_grading.mood}`);
        }
        if (stylePack.prompt_modifiers) {
          styleParts.push(stylePack.prompt_modifiers);
        }
        
        if (styleParts.length > 0) {
          styleLockBlock = `\n\n=== STYLE LOCK (MANDATORY - DO NOT DEVIATE) ===\n${styleParts.join('\n')}\n=== END STYLE LOCK ===`;
        }
        
        if (stylePack.negative_modifiers) {
          negativeModifiers = stylePack.negative_modifiers;
        }
      }
    }

    // Build the view angle description
    const viewDescriptions: Record<string, string> = {
      'establishing': 'wide establishing shot showing the full scope and environment',
      'detail': 'close-up detail shot focusing on textures and distinctive features',
      '3/4': 'three-quarter angle showing depth and spatial relationships',
      'close-up': 'intimate close-up of a specific architectural element',
      'alternate': 'alternative perspective from an unexpected angle'
    };

    const viewDesc = viewDescriptions[viewAngle] || viewAngle;

    // Build the time of day description
    const timeDescriptions: Record<string, string> = {
      'day': 'bright daylight, natural sunlight',
      'night': 'nighttime with artificial lighting and moonlight',
      'dawn': 'early morning golden hour light, warm tones',
      'dusk': 'evening golden hour, warm sunset colors'
    };

    const timeDesc = timeDescriptions[timeOfDay] || timeOfDay;

    // Build the weather description
    const weatherDescriptions: Record<string, string> = {
      'clear': 'clear weather',
      'rain': 'rainy conditions with wet surfaces',
      'fog': 'foggy atmospheric conditions',
      'overcast': 'overcast sky with diffused lighting',
      'snow': 'snowy conditions with snow coverage'
    };

    const weatherDesc = weatherDescriptions[weather] || weather;

    // Build style context
    let styleContext = '';
    if (projectStyle) {
      if (projectStyle.lensStyle) {
        styleContext += ` Shot with ${projectStyle.lensStyle} lens style.`;
      }
      if (projectStyle.grainLevel && projectStyle.grainLevel !== 'none') {
        styleContext += ` Apply ${projectStyle.grainLevel} film grain.`;
      }
    }
    if (styleToken) {
      styleContext += ` Apply visual style token: ${styleToken}.`;
    }

    // Construct the prompt based on mode
    let prompt: string;
    let messageContent: any;
    
    // Convert reference URLs to base64 for API compatibility
    const base64References: string[] = [];
    if (mode === 'stylize_from_reference' && allReferenceUrls.length > 0) {
      console.log(`[generate-location] Converting ${allReferenceUrls.length} reference URLs to base64...`);
      
      for (const url of allReferenceUrls) {
        const base64 = await urlToBase64(url);
        if (base64) {
          base64References.push(base64);
        }
      }
      
      console.log(`[generate-location] Successfully converted ${base64References.length}/${allReferenceUrls.length} references`);
    }
    
    if (mode === 'stylize_from_reference' && base64References.length > 0) {
      // Multimodal: Use all reference photos for comprehensive spatial understanding
      const hasMultipleRefs = base64References.length > 1;
      
      prompt = hasMultipleRefs 
        ? `You have been given ${base64References.length} reference photos of the same location from different angles (360° coverage). Use ALL of them to understand the complete 3D space, then generate a ${viewDesc} view.

SPATIAL UNDERSTANDING:
- Analyze all reference images to build a mental 3D model of this space
- Understand how walls, furniture, and objects connect across views
- Maintain architectural consistency and proportions from all angles

GENERATE THIS VIEW: ${viewDesc}
- Camera position for this specific view type
- Use information from ALL reference photos to ensure accuracy
- The output should feel like a new camera angle of the SAME real space

APPLY STYLE:
- Convert to the project's visual style (cartoon/3D/anime if animated project)
- Apply consistent lighting: ${timeDesc}
- Weather conditions: ${weatherDesc}
${styleLockBlock}
${styleContext}

Location: ${locationName}
Description: ${locationDescription || locationName}

CRITICAL: The generated view must be architecturally consistent with ALL provided reference photos. This is the same physical space viewed from a different angle.`
        : `Transform this reference photo into the project's art style while maintaining the exact composition, layout, architecture, and spatial arrangement.

KEEP EXACTLY:
- The room layout and furniture positions
- Architectural elements (windows, doors, walls)
- The perspective and camera angle
- Key objects and their placement

APPLY STYLE:
- Convert to the project's visual style (cartoon/3D/anime if animated project)
- Apply consistent lighting: ${timeDesc}
- Weather conditions: ${weatherDesc}
${styleLockBlock}
${styleContext}

Location: ${locationName}
Description: ${locationDescription || locationName}
View: ${viewDesc}

CRITICAL: The output must look like a stylized illustration of this EXACT space, not a generic location. Preserve all unique architectural and decorative elements visible in the reference.`;

      // Build multimodal content with all reference images as base64
      messageContent = [
        {
          type: 'text',
          text: prompt
        },
        ...base64References.map(base64Url => ({
          type: 'image_url',
          image_url: { url: base64Url }
        }))
      ];
      
      console.log(`[generate-location] Using multimodal with ${base64References.length} base64 references`);
    } else {
      // Text-only generation
      prompt = `Cinematic film still, location scouting photograph.

Location: ${locationName}
Description: ${locationDescription || locationName}

View: ${viewDesc}
Lighting: ${timeDesc}
Weather: ${weatherDesc}
${styleContext}
${styleLockBlock}

Ultra high resolution, 16:9 aspect ratio, professional cinematography, anamorphic lens characteristics, natural color grading, film-like depth of field, architectural accuracy, environmental storytelling.`;

      messageContent = prompt;
    }

    // Add negative prompt if available
    const systemContent = negativeModifiers 
      ? `You are a cinematic location artist. AVOID: ${negativeModifiers}`
      : undefined;

    console.log(`[generate-location] Using Lovable AI (${IMAGE_MODEL}) with mode: ${mode}`);

    // Call Lovable AI Gateway
    const messages: any[] = [];
    if (systemContent) {
      messages.push({ role: 'system', content: systemContent });
    }
    messages.push({ role: 'user', content: messageContent });

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: IMAGE_MODEL,
        messages,
        modalities: ['image', 'text']
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[generate-location] Lovable AI error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(JSON.stringify({ 
          error: 'Rate limit exceeded. Please try again later.',
          code: 'RATE_LIMITED',
          retryable: true,
          retryAfterSeconds: 30
        }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      if (response.status === 402) {
        return new Response(JSON.stringify({ 
          error: 'Payment required. Please add credits to your Lovable workspace.',
          code: 'PAYMENT_REQUIRED'
        }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      throw new Error(`Lovable AI failed: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    
    // Extract base64 image from response
    const imageBase64 = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    
    if (!imageBase64) {
      console.error('[generate-location] No image in response:', JSON.stringify(data).substring(0, 500));
      throw new Error('No image generated by Lovable AI');
    }

    // Upload to Supabase Storage
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
    const imageBuffer = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
    
    const fileName = `locations/${crypto.randomUUID()}.png`;
    
    // Use service role for storage upload
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    
    const { error: uploadError } = await supabaseAdmin
      .storage
      .from('renders')
      .upload(fileName, imageBuffer, {
        contentType: 'image/png',
        upsert: false
      });

    if (uploadError) {
      console.error('[generate-location] Storage upload error:', uploadError);
      throw new Error(`Failed to upload image: ${uploadError.message}`);
    }

    // Get public URL
    const { data: { publicUrl } } = supabaseAdmin
      .storage
      .from('renders')
      .getPublicUrl(fileName);

    const generationTimeMs = Date.now() - startTime;
    console.log(`[generate-location] Complete in ${generationTimeMs}ms, URL: ${publicUrl}`);

    // Log generation cost
    const userId = extractUserId(req.headers.get('authorization'));
    if (userId) {
      await logGenerationCost({
        userId,
        slotType: 'location_image',
        engine: IMAGE_MODEL,
        durationMs: generationTimeMs,
        success: true,
        metadata: { viewAngle, timeOfDay, weather, mode, hasReference: !!referenceImageUrl }
      });
    }

    return new Response(JSON.stringify({ 
      imageUrl: publicUrl,
      seed: Math.floor(Math.random() * 999999),
      prompt,
      mode,
      metadata: {
        viewAngle,
        timeOfDay,
        weather,
        engine: IMAGE_MODEL,
        generatedAt: new Date().toISOString(),
        generationTimeMs,
        hadReference: !!referenceImageUrl
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[generate-location] Error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
