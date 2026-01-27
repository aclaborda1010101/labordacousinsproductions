/**
 * Storyboard Reference Images Configuration
 * 
 * These images are used as visual anchors for the AI to understand
 * what a REAL production storyboard looks like (not comic/illustration).
 * 
 * Upload your reference images to Supabase Storage and add URLs here.
 * The first image in each array is used as the primary reference.
 */

export interface StoryboardReferenceConfig {
  // Primary reference image - sent with EVERY generation
  primaryReference: string | null;
  
  // Style-specific references (optional, override primary for that style)
  styleReferences: {
    sb_tech_production?: string;
    sb_cinematic_narrative?: string;
    sb_art_visual_dev?: string;
    sb_previz_animatic?: string;
  };
}

/**
 * Default configuration - UPDATE THESE URLs after uploading to Supabase Storage
 * 
 * To set up:
 * 1. Upload reference storyboard images to your Supabase project-assets bucket
 * 2. Get the public URLs
 * 3. Replace the null values below with the URLs
 * 
 * Example: 
 *   primaryReference: "https://xxxxx.supabase.co/storage/v1/object/public/project-assets/storyboard-refs/leyes-frontera.jpg"
 */
export const STORYBOARD_REFERENCE_CONFIG: StoryboardReferenceConfig = {
  // TODO: Replace with your uploaded reference image URL
  primaryReference: null,
  
  styleReferences: {
    sb_tech_production: null,
    sb_cinematic_narrative: null,
    sb_art_visual_dev: null,
    sb_previz_animatic: null,
  },
};

/**
 * Get the reference image URL for a given style preset
 */
export function getStoryboardReferenceUrl(
  stylePresetId: string,
  config: StoryboardReferenceConfig = STORYBOARD_REFERENCE_CONFIG
): string | null {
  // Check style-specific first
  const styleRef = config.styleReferences[stylePresetId as keyof typeof config.styleReferences];
  if (styleRef) return styleRef;
  
  // Fall back to primary reference
  return config.primaryReference;
}

/**
 * Reference image instruction block - prepended to prompts when reference is available
 */
export function buildReferenceInstructionBlock(referenceUrl: string | null): string {
  if (!referenceUrl) return '';
  
  return `
═══════════════════════════════════════════════════════════════════════════════
🎬 VISUAL REFERENCE (MATCH THIS EXACTLY)
═══════════════════════════════════════════════════════════════════════════════

The FIRST attached image is a REFERENCE STORYBOARD from a real film production.
Your output MUST match this visual style EXACTLY:

COPY FROM REFERENCE:
✓ The rough, sketchy line quality
✓ The simple grayscale shading approach  
✓ The functional, non-artistic feel
✓ The panel layout and labeling style
✓ The "working document" aesthetic

DO NOT:
✗ Make it look more polished than the reference
✗ Add artistic flourishes not in the reference
✗ Use comic book or manga styling
✗ Create finished illustration quality

The reference shows what REAL production storyboards look like.
Match it. Don't "improve" it with artistic interpretation.
═══════════════════════════════════════════════════════════════════════════════
`;
}
