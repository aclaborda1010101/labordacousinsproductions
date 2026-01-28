/**
 * Image Generation via Gemini 2.0 Flash
 * 
 * Uses Gemini's native image generation capability
 * Returns base64 image data
 */

export interface ImageGenerateOptions {
  prompt: string;
  aspectRatio?: "1:1" | "3:4" | "4:3" | "9:16" | "16:9";
  numberOfImages?: number;
  negativePrompt?: string;
}

export interface ImageGenerateResult {
  images: Array<{
    base64: string;
    mimeType: string;
  }>;
  modelUsed: string;
}

export async function generateImage(options: ImageGenerateOptions): Promise<ImageGenerateResult> {
  const apiKey = Deno.env.get("GOOGLE_AI_API_KEY");
  if (!apiKey) {
    throw new Error("GOOGLE_AI_API_KEY is not configured");
  }

  const { prompt, aspectRatio = "1:1", negativePrompt } = options;

  console.log("[IMAGEN3] Generating image with Gemini 2.0 Flash...");
  console.log("[IMAGEN3] Prompt:", prompt.substring(0, 100) + "...");
  console.log("[IMAGEN3] Aspect ratio:", aspectRatio);

  // Build the full prompt with image generation instructions
  let fullPrompt = `Generate a high-quality image based on this description:\n\n${prompt}`;
  
  if (negativePrompt) {
    fullPrompt += `\n\nAvoid: ${negativePrompt}`;
  }
  
  fullPrompt += `\n\nAspect ratio: ${aspectRatio}. Generate the image now.`;

  const requestBody = {
    contents: [{
      parts: [{ text: fullPrompt }]
    }],
    generationConfig: {
      responseModalities: ["TEXT", "IMAGE"],
      temperature: 0.8,
    }
  };

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  const responseText = await response.text();

  if (!response.ok) {
    console.error("[IMAGEN3] Error:", response.status, responseText.substring(0, 500));
    throw new Error(`Image generation failed: ${response.status} - ${responseText.substring(0, 200)}`);
  }

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(responseText);
  } catch {
    console.error("[IMAGEN3] Non-JSON response:", responseText.substring(0, 500));
    throw new Error("Gemini returned non-JSON response");
  }

  // Extract images from Gemini response
  const candidates = data.candidates as Array<{ content: { parts: Array<{ inlineData?: { mimeType: string; data: string }; text?: string }> } }> || [];
  
  const images: Array<{ base64: string; mimeType: string }> = [];
  
  for (const candidate of candidates) {
    for (const part of candidate?.content?.parts || []) {
      if (part.inlineData) {
        images.push({
          base64: part.inlineData.data,
          mimeType: part.inlineData.mimeType || "image/png",
        });
      }
    }
  }

  if (images.length === 0) {
    // Check if there's text response explaining why no image
    const textParts = candidates[0]?.content?.parts?.filter(p => p.text) || [];
    const textResponse = textParts.map(p => p.text).join(' ');
    
    console.error("[IMAGEN3] No images in response. Text response:", textResponse.substring(0, 300));
    
    if (textResponse.toLowerCase().includes('cannot') || textResponse.toLowerCase().includes('unable')) {
      throw new Error(`CONTENT_BLOCKED: ${textResponse.substring(0, 200)}`);
    }
    
    throw new Error("No images generated - model returned text only");
  }

  console.log("[IMAGEN3] Generated", images.length, "image(s)");

  return {
    images,
    modelUsed: "gemini-2.0-flash-exp",
  };
}

/**
 * Convert base64 image to data URL for embedding
 */
export function toDataUrl(base64: string, mimeType: string = "image/png"): string {
  return `data:${mimeType};base64,${base64}`;
}

/**
 * Upload base64 image to Supabase Storage and return public URL
 */
export async function uploadToStorage(
  supabase: any,
  base64: string,
  bucket: string,
  path: string,
  mimeType: string = "image/png"
): Promise<string> {
  // Convert base64 to Uint8Array
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(path, bytes, {
      contentType: mimeType,
      upsert: true,
    });

  if (error) {
    throw new Error(`Storage upload failed: ${error.message}`);
  }

  // Get public URL
  const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(path);
  return urlData.publicUrl;
}
