/**
 * NanoBanana Image Generator - Uses correct /v1/chat/completions multimodal format
 * 
 * Features:
 * - Correct Lovable AI Gateway format with modalities: ["image", "text"]
 * - Deterministic generation with seed support
 * - Automatic persistence to generation_run_logs
 * - Extracts base64 or URL from response
 * - MULTIMODAL REFERENCES: Can accept reference images for identity consistency
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { aiFetch } from "./ai-fetch.ts";

export interface ImageGenerationResult {
  success: boolean;
  imageBase64?: string;
  imageUrl?: string;
  error?: string;
  requestId?: string;
}

export interface ImageGenerationOptions {
  lovableApiKey: string;
  model?: string;
  promptText: string;
  referenceImageUrls?: string[];  // NEW: URLs of reference images for multimodal input
  label?: string;
  // For determinism
  seed?: number;
  // For logging persistence
  supabase?: SupabaseClient;
  projectId?: string;
  userId?: string;
}

// ============================================================================
// SHOT ANCHOR REQUIREMENTS - Maps shot types to required identity anchors
// ============================================================================

export const SHOT_ANCHOR_REQUIREMENTS: Record<string, string[]> = {
  'PP': ['ref_closeup_front', 'closeup_profile'],       // Primer plano: máxima precisión
  'PMC': ['ref_closeup_front', 'closeup_profile'],      // Plano medio corto
  'PM': ['ref_closeup_front'],                          // Plano medio
  'PA': ['ref_closeup_front'],                          // Plano americano
  'PG': [],                                             // Plano general: cara no crítica
  'OTS': ['ref_closeup_front'],                         // Over the shoulder
  '2SHOT': ['ref_closeup_front'],                       // Dos personajes
  'INSERT': [],                                         // Inserto: sin persona
};

export async function generateImageWithNanoBanana({
  lovableApiKey,
  model = "google/gemini-3-pro-image-preview",
  promptText,
  referenceImageUrls = [],
  label = "image_gen",
  seed,
  supabase,
  projectId,
  userId,
}: ImageGenerationOptions): Promise<ImageGenerationResult> {
  const requestId = crypto.randomUUID();
  
  try {
    // Build multimodal content array
    type ContentPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };
    const contentParts: ContentPart[] = [
      { type: "text", text: promptText },
    ];
    
    // Add reference images (max 6 to avoid payload too large)
    const validRefs = referenceImageUrls
      .filter(url => url && url.startsWith('http'))
      .slice(0, 6);
    
    for (const url of validRefs) {
      contentParts.push({
        type: "image_url",
        image_url: { url }
      });
    }
    
    // Diagnostic logging
    console.log(`[${label}] multimodal_refs`, { 
      ref_count: validRefs.length, 
      first_host: validRefs[0] ? new URL(validRefs[0]).host : 'none',
      prompt_length: promptText.length,
      payload_est_kb: Math.round((promptText.length + validRefs.length * 100) / 1024)
    });

    const payload: Record<string, unknown> = {
      model,
      modalities: ["image", "text"],
      messages: [
        {
          role: "user",
          content: contentParts,  // NOW MULTIMODAL ARRAY
        },
      ],
    };

    // Add seed for deterministic generation if provided
    if (seed !== undefined) {
      payload.seed = seed;
    }

    const json = await aiFetch({
      url: "https://ai.gateway.lovable.dev/v1/chat/completions",
      apiKey: lovableApiKey,
      payload,
      label,
      supabase,
      projectId,
      userId,
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
      return { success: false, error: "No image in response", requestId };
    }

    // If it's a base64 data URL, extract just the base64 portion
    if (imageData.startsWith("data:image")) {
      const base64 = imageData.split(",")[1];
      return { success: true, imageBase64: base64, imageUrl: imageData, requestId };
    }

    // If it's a direct URL
    return { success: true, imageUrl: imageData, requestId };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error(`[${label}] Error:`, errMsg);
    return { success: false, error: errMsg, requestId };
  }
}

// ============================================================================
// EDIT IMAGE WITH NANO BANANA - Identity Fix Pass (Paso B)
// ============================================================================

export interface ImageEditOptions {
  lovableApiKey: string;
  model?: string;
  sourceImageUrl: string;           // Image to edit (staging image)
  editInstruction: string;          // "Edit only face + hairline..."
  identityAnchorUrls?: string[];    // Reference images for identity matching
  label?: string;
  seed?: number;
  supabase?: SupabaseClient;
  projectId?: string;
  userId?: string;
}

/**
 * Edit an existing image using multimodal AI (inpainting/editing)
 * Used for Identity Fix Pass (Paso B) - only modifies face/hair while preserving composition
 */
export async function editImageWithNanoBanana({
  lovableApiKey,
  model = "google/gemini-3-pro-image-preview",
  sourceImageUrl,
  editInstruction,
  identityAnchorUrls = [],
  label = "image_edit",
  seed,
  supabase,
  projectId,
  userId,
}: ImageEditOptions): Promise<ImageGenerationResult> {
  const requestId = crypto.randomUUID();
  
  try {
    // Build multimodal content array with source image FIRST
    type ContentPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };
    const contentParts: ContentPart[] = [];
    
    // 1. Edit instruction (text)
    contentParts.push({ type: "text", text: editInstruction });
    
    // 2. Source image to edit (the staging image)
    if (sourceImageUrl && sourceImageUrl.startsWith('http')) {
      contentParts.push({
        type: "image_url",
        image_url: { url: sourceImageUrl }
      });
    }
    
    // 3. Identity anchor images (references)
    const validAnchors = identityAnchorUrls
      .filter(url => url && url.startsWith('http'))
      .slice(0, 4);  // Max 4 anchors for identity
    
    for (const url of validAnchors) {
      contentParts.push({
        type: "image_url",
        image_url: { url }
      });
    }
    
    // Diagnostic logging
    console.log(`[${label}] edit_request`, { 
      anchor_count: validAnchors.length, 
      source_host: sourceImageUrl ? new URL(sourceImageUrl).host : 'none',
      instruction_length: editInstruction.length,
    });

    const payload: Record<string, unknown> = {
      model,
      modalities: ["image", "text"],
      messages: [
        {
          role: "user",
          content: contentParts,
        },
      ],
    };

    // Add seed for deterministic generation if provided
    if (seed !== undefined) {
      payload.seed = seed;
    }

    const json = await aiFetch({
      url: "https://ai.gateway.lovable.dev/v1/chat/completions",
      apiKey: lovableApiKey,
      payload,
      label,
      supabase,
      projectId,
      userId,
    });

    // Extract image from response
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
      return { success: false, error: "No image in response", requestId };
    }

    // If it's a base64 data URL, extract just the base64 portion
    if (imageData.startsWith("data:image")) {
      const base64 = imageData.split(",")[1];
      return { success: true, imageBase64: base64, imageUrl: imageData, requestId };
    }

    // If it's a direct URL
    return { success: true, imageUrl: imageData, requestId };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error(`[${label}] Error:`, errMsg);
    return { success: false, error: errMsg, requestId };
  }
}
