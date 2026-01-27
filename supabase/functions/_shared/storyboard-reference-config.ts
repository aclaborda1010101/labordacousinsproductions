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
  // GitHub raw URL for reference storyboard image (AWARENESS #113)
  primaryReference: "https://raw.githubusercontent.com/aclaborda1010101/labordacousinsproductions/main/assets/storyboard-references/awareness-113-p4.jpg",
  
  styleReferences: {
    sb_tech_production: "https://raw.githubusercontent.com/aclaborda1010101/labordacousinsproductions/main/assets/storyboard-references/leyes-frontera-sec126.jpg",
    sb_cinematic_narrative: "https://raw.githubusercontent.com/aclaborda1010101/labordacousinsproductions/main/assets/storyboard-references/awareness-113-p4.jpg",
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
 * v2.0: Much more aggressive anti-comic instructions
 */
export function buildReferenceInstructionBlock(referenceUrl: string | null): string {
  if (!referenceUrl) return '';
  
  return `
██████████████████████████████████████████████████████████████████████████████
██  CRITICAL: COPY THE REFERENCE IMAGE STYLE EXACTLY                        ██
██████████████████████████████████████████████████████████████████████████████

LOOK AT THE FIRST ATTACHED IMAGE. That is a REAL storyboard from a Spanish film production.

YOUR OUTPUT MUST LOOK LIKE THAT IMAGE. NOT like a comic book. NOT like concept art.

WHAT THE REFERENCE SHOWS:
• Quick pencil/pen sketches - NOT polished drawings
• Simple gray shading (3 values max) - NOT dramatic lighting
• Functional linework - NOT beautiful art
• Clear but rough - like a sketch done in 5 minutes per frame
• Panel labels (P1, P2, etc.) and shot notations
• This is a WORKING DOCUMENT for film crew, not art to display

THE #1 MISTAKE TO AVOID:
Making it look "better" than the reference. DON'T. It should look ROUGHER, 
more like a quick sketch, less like finished art. If your output looks more 
polished than the reference, YOU FAILED.

THINK: "Am I making this too nice?" If yes, make it rougher.

═══════════════════════════════════════════════════════════════════════════════
COMPARISON:
❌ WRONG: Looks like Marvel/DC comics, manga, graphic novel, concept art
❌ WRONG: Dramatic shadows, artistic lighting, detailed backgrounds  
❌ WRONG: Stylized proportions, dynamic poses, action lines
❌ WRONG: Speech bubbles, sound effects, decorative borders
✅ RIGHT: Looks like a rough sketch a director drew in a meeting
✅ RIGHT: Simple, functional, readable at small size, minimal detail
═══════════════════════════════════════════════════════════════════════════════
`;
}
