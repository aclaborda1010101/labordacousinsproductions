/**
 * NanoBanana Image Generator - Uses correct /v1/chat/completions multimodal format
 */

import { aiFetch } from "./ai-fetch.ts";

export interface ImageGenerationResult {
  success: boolean;
  imageBase64?: string;
  imageUrl?: string;
  error?: string;
}

export async function generateImageWithNanoBanana({
  lovableApiKey,
  model = "google/gemini-3-pro-image-preview",
  promptText,
  label = "image_gen",
}: {
  lovableApiKey: string;
  model?: string;
  promptText: string;
  label?: string;
}): Promise<ImageGenerationResult> {
  try {
    const payload = {
      model,
      modalities: ["image", "text"],
      messages: [
        {
          role: "user",
          content: promptText,
        },
      ],
    };

    const json = await aiFetch({
      url: "https://ai.gateway.lovable.dev/v1/chat/completions",
      apiKey: lovableApiKey,
      payload,
      label,
    });

    // Extract image from Lovable AI Gateway response format
    // Format: choices[0].message.images[0].image_url.url
    const choices = json?.choices as Array<{
      message?: {
        images?: Array<{
          image_url?: { url?: string };
        }>;
      };
    }>;

    const imageData = choices?.[0]?.message?.images?.[0]?.image_url?.url;

    if (!imageData) {
      console.error(
        `[${label}] No image in response:`,
        JSON.stringify(json).slice(0, 500)
      );
      return { success: false, error: "No image in response" };
    }

    // If it's a base64 data URL, extract just the base64 portion
    if (imageData.startsWith("data:image")) {
      const base64 = imageData.split(",")[1];
      return { success: true, imageBase64: base64, imageUrl: imageData };
    }

    // If it's a direct URL
    return { success: true, imageUrl: imageData };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error(`[${label}] Error:`, errMsg);
    return { success: false, error: errMsg };
  }
}
