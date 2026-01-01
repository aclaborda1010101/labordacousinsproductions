import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GenerateShotRequest {
  shotId: string;
  sceneDescription: string;
  shotType: string;
  duration: number;
  engine: 'veo' | 'kling' | 'lovable';
  characterRefs?: { name: string; token?: string; referenceUrl?: string }[];
  locationRef?: { name: string; token?: string; referenceUrl?: string };
  keyframeUrl?: string;
  dialogueText?: string;
  cameraMovement?: string;
  blocking?: string;
}

interface VideoResult {
  videoUrl: string | null;
  imageUrl?: string;
  thumbnailUrl?: string;
  metadata: any;
}

// Generate image using Lovable AI (Gemini)
async function generateImage(prompt: string): Promise<string> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY not configured');

  console.log('Generating image with Lovable AI...');

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3-pro-image-preview",
      messages: [{ role: "user", content: prompt }],
      modalities: ["image", "text"]
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Image generation error:', response.status, errorText);
    
    if (response.status === 429) {
      throw new Error('Rate limit exceeded. Please try again later.');
    }
    if (response.status === 402) {
      throw new Error('Payment required. Please add credits to continue.');
    }
    throw new Error(`Image generation failed: ${response.status}`);
  }

  const data = await response.json();
  const imageUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  
  if (!imageUrl) {
    console.error('No image URL in response:', JSON.stringify(data, null, 2));
    throw new Error('No image generated');
  }
  
  console.log('Image generated successfully');
  return imageUrl;
}

// Generate video with Veo 3.1 (external API - may fail)
async function generateWithVeo(prompt: string, duration: number, keyframeUrl?: string): Promise<VideoResult> {
  const VEO_API_KEY = Deno.env.get('VEO_API_KEY');
  if (!VEO_API_KEY) throw new Error('VEO_API_KEY not configured');

  console.log('Generating with Veo 3.1...');

  const requestBody: any = {
    prompt,
    duration_seconds: duration,
    aspect_ratio: "16:9",
    model: "veo-3.1"
  };

  if (keyframeUrl) {
    requestBody.image_url = keyframeUrl;
  }

  const createResponse = await fetch("https://generativelanguage.googleapis.com/v1beta/models/veo-2.0-generate-001:predictLongRunning", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${VEO_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      instances: [{ prompt }],
      parameters: {
        aspectRatio: "16:9",
        durationSeconds: duration
      }
    })
  });

  if (!createResponse.ok) {
    const error = await createResponse.text();
    console.error('Veo creation error:', error);
    throw new Error(`Veo API error: ${createResponse.status}`);
  }

  const createData = await createResponse.json();
  const operationName = createData.name;

  if (!operationName) {
    throw new Error('No operation name from Veo');
  }

  // Poll for completion
  let attempts = 0;
  const maxAttempts = 60;
  
  while (attempts < maxAttempts) {
    await new Promise(r => setTimeout(r, 5000));
    
    const statusResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/${operationName}`, {
      headers: { "Authorization": `Bearer ${VEO_API_KEY}` }
    });

    if (!statusResponse.ok) {
      attempts++;
      continue;
    }

    const statusData = await statusResponse.json();
    
    if (statusData.done) {
      if (statusData.error) {
        throw new Error(`Veo generation failed: ${statusData.error.message}`);
      }
      
      const videoUri = statusData.response?.generatedSamples?.[0]?.video?.uri;
      if (!videoUri) throw new Error('No video URL in Veo response');

      return {
        videoUrl: videoUri,
        thumbnailUrl: undefined,
        metadata: { engine: 'veo', operationName, duration }
      };
    }
    
    attempts++;
  }

  throw new Error('Veo generation timeout');
}

// Generate video with Kling 2.0 (external API - may fail)
async function generateWithKling(prompt: string, duration: number, keyframeUrl?: string): Promise<VideoResult> {
  const KLING_API_KEY = Deno.env.get('KLING_API_KEY');
  if (!KLING_API_KEY) throw new Error('KLING_API_KEY not configured');

  console.log('Generating with Kling 2.0...');

  const requestBody: any = {
    prompt,
    duration: duration.toString(),
    aspect_ratio: "16:9",
    model_name: "kling-v2"
  };

  if (keyframeUrl) {
    requestBody.image_url = keyframeUrl;
  }

  const createResponse = await fetch("https://api.klingai.com/v1/videos/image2video", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${KLING_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(requestBody)
  });

  if (!createResponse.ok) {
    const error = await createResponse.text();
    console.error('Kling creation error:', error);
    throw new Error(`Kling API error: ${createResponse.status}`);
  }

  const createData = await createResponse.json();
  const taskId = createData.data?.task_id;

  if (!taskId) throw new Error('No task ID from Kling');

  // Poll for completion
  let attempts = 0;
  const maxAttempts = 60;

  while (attempts < maxAttempts) {
    await new Promise(r => setTimeout(r, 5000));

    const statusResponse = await fetch(`https://api.klingai.com/v1/videos/image2video/${taskId}`, {
      headers: { "Authorization": `Bearer ${KLING_API_KEY}` }
    });

    if (!statusResponse.ok) {
      attempts++;
      continue;
    }

    const statusData = await statusResponse.json();
    const status = statusData.data?.task_status;

    if (status === 'succeed') {
      const videoUrl = statusData.data?.task_result?.videos?.[0]?.url;
      if (!videoUrl) throw new Error('No video URL in Kling response');

      return {
        videoUrl,
        thumbnailUrl: statusData.data?.task_result?.videos?.[0]?.cover_image_url,
        metadata: { engine: 'kling', taskId, duration }
      };
    }

    if (status === 'failed') {
      throw new Error(`Kling generation failed: ${statusData.data?.task_status_msg}`);
    }

    attempts++;
  }

  throw new Error('Kling generation timeout');
}

// Generate with Lovable AI (keyframe only - always works)
async function generateWithLovable(prompt: string, duration: number): Promise<VideoResult> {
  console.log('Generating keyframe with Lovable AI...');
  
  const imageUrl = await generateImage(
    `Cinematic film still, professional cinematography: ${prompt}. 16:9 aspect ratio, high production value, dramatic lighting.`
  );
  
  return {
    videoUrl: null,
    imageUrl,
    thumbnailUrl: imageUrl,
    metadata: { engine: 'lovable', duration, type: 'keyframe' }
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const request: GenerateShotRequest = await req.json();
    const { 
      shotId, 
      sceneDescription, 
      shotType, 
      duration, 
      engine, 
      characterRefs, 
      locationRef, 
      keyframeUrl,
      dialogueText,
      cameraMovement,
      blocking
    } = request;

    console.log(`Generating shot ${shotId} with ${engine}, duration: ${duration}s`);

    // Build detailed prompt
    let prompt = `Cinematic ${shotType} shot: ${sceneDescription}`;

    if (characterRefs && characterRefs.length > 0) {
      const charDescs = characterRefs.map(c => c.token || c.name).join(', ');
      prompt += ` Characters: ${charDescs}.`;
    }

    if (locationRef) {
      prompt += ` Location: ${locationRef.token || locationRef.name}.`;
    }

    if (dialogueText) {
      prompt += ` Dialogue moment: "${dialogueText}".`;
    }

    if (cameraMovement) {
      prompt += ` Camera: ${cameraMovement}.`;
    }

    if (blocking) {
      prompt += ` Blocking: ${blocking}.`;
    }

    prompt += ` Professional cinematography, high production value, ${duration} seconds duration.`;

    console.log('Prompt:', prompt);

    let result: VideoResult;

    // If engine is lovable or no external APIs work, use Lovable AI directly
    if (engine === 'lovable') {
      result = await generateWithLovable(prompt, duration);
    } else {
      // Try external engine first, fallback to Lovable AI
      try {
        // Generate keyframe first if not provided
        let finalKeyframeUrl = keyframeUrl;
        if (!finalKeyframeUrl) {
          console.log('Generating keyframe first...');
          try {
            finalKeyframeUrl = await generateImage(
              `Cinematic keyframe for: ${sceneDescription}. ${shotType} shot composition. Professional film quality, 16:9 aspect ratio.`
            );
            console.log('Keyframe generated successfully');
          } catch (e) {
            console.warn('Keyframe generation failed:', e);
          }
        }

        if (engine === 'veo') {
          result = await generateWithVeo(prompt, duration, finalKeyframeUrl);
        } else {
          result = await generateWithKling(prompt, duration, finalKeyframeUrl);
        }

        // Add keyframe to result
        result.imageUrl = finalKeyframeUrl || undefined;
        
      } catch (videoError) {
        console.error(`${engine} video generation failed:`, videoError);
        
        // Fallback to Lovable AI keyframe
        console.log('Falling back to Lovable AI keyframe...');
        result = await generateWithLovable(prompt, duration);
        
        return new Response(JSON.stringify({
          success: true,
          fallback: true,
          videoUrl: null,
          imageUrl: result.imageUrl,
          thumbnailUrl: result.thumbnailUrl,
          error: `Video generation failed, using keyframe. Error: ${videoError instanceof Error ? videoError.message : 'Unknown'}`,
          metadata: result.metadata
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    return new Response(JSON.stringify({
      success: true,
      fallback: engine === 'lovable',
      videoUrl: result.videoUrl,
      imageUrl: result.imageUrl,
      thumbnailUrl: result.thumbnailUrl,
      metadata: result.metadata
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in generate-shot:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const status = errorMessage.includes('Rate limit') ? 429 : 
                   errorMessage.includes('Payment required') ? 402 : 500;
    
    return new Response(JSON.stringify({
      success: false,
      error: errorMessage
    }), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
