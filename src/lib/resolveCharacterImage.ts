/**
 * resolveCharacterImage - Unified image resolution for characters
 * Priority: canon_assets > character_pack_slots (hero) > generation_runs > turnaround_urls
 */

import { supabase } from '@/integrations/supabase/client';

export interface CharacterImageData {
  imageUrl: string | null;
  source: 'canon' | 'pack_slot' | 'generation_run' | 'turnaround' | 'none';
}

interface CharacterImageParams {
  canonAssetId?: string | null;
  currentRunId?: string | null;
  acceptedRunId?: string | null;
  turnaroundUrls?: Record<string, string> | null;
  // Pre-fetched values (to avoid extra queries)
  canonImage?: string | null;
  heroImage?: string | null;
  currentRunImage?: string | null;
  acceptedRunImage?: string | null;
}

/**
 * Resolves the best available image for a character
 * Uses pre-fetched data when available, otherwise returns based on priority
 */
export function resolveCharacterImageSync(params: CharacterImageParams): CharacterImageData {
  const {
    canonImage,
    heroImage,
    acceptedRunImage,
    currentRunImage,
    turnaroundUrls,
  } = params;

  // Priority 1: Canon asset
  if (canonImage) {
    return { imageUrl: canonImage, source: 'canon' };
  }

  // Priority 2: Hero slot from pack
  if (heroImage) {
    return { imageUrl: heroImage, source: 'pack_slot' };
  }

  // Priority 3: Accepted run image
  if (acceptedRunImage) {
    return { imageUrl: acceptedRunImage, source: 'generation_run' };
  }

  // Priority 4: Current run image
  if (currentRunImage) {
    return { imageUrl: currentRunImage, source: 'generation_run' };
  }

  // Priority 5: Legacy turnaround URLs
  if (turnaroundUrls?.front) {
    return { imageUrl: turnaroundUrls.front, source: 'turnaround' };
  }

  return { imageUrl: null, source: 'none' };
}

/**
 * Fetches images for multiple characters in batch
 * Returns a map of characterId -> CharacterImageData
 */
export async function fetchCharacterImages(
  characters: Array<{
    id: string;
    current_run_id?: string | null;
    accepted_run_id?: string | null;
    canon_asset_id?: string | null;
    turnaround_urls?: Record<string, string> | null;
  }>
): Promise<Map<string, CharacterImageData>> {
  const result = new Map<string, CharacterImageData>();
  const charIds = characters.map(c => c.id);
  
  if (charIds.length === 0) {
    return result;
  }

  // Batch fetch hero slots
  const { data: heroSlots } = await supabase
    .from('character_pack_slots')
    .select('character_id, image_url')
    .in('character_id', charIds)
    .in('slot_type', ['hero_front', 'closeup_front', 'anchor_closeup'])
    .not('image_url', 'is', null);

  const heroImages = new Map<string, string>();
  if (heroSlots) {
    heroSlots.forEach(slot => {
      if (!heroImages.has(slot.character_id) && slot.image_url) {
        heroImages.set(slot.character_id, slot.image_url);
      }
    });
  }

  // Batch fetch generation run images
  const runIds = characters.flatMap(c => 
    [c.current_run_id, c.accepted_run_id].filter(Boolean)
  ) as string[];

  const runImages = new Map<string, string>();
  if (runIds.length > 0) {
    const { data: runs } = await supabase
      .from('generation_runs')
      .select('id, output_url')
      .in('id', runIds);
    
    if (runs) {
      runs.forEach(r => {
        if (r.output_url) {
          runImages.set(r.id, r.output_url);
        }
      });
    }
  }

  // Batch fetch canon assets
  const canonIds = characters
    .map(c => c.canon_asset_id)
    .filter(Boolean) as string[];

  const canonImages = new Map<string, string>();
  if (canonIds.length > 0) {
    const { data: canons } = await supabase
      .from('canon_assets')
      .select('id, image_url')
      .in('id', canonIds);

    if (canons) {
      canons.forEach(c => {
        if (c.image_url) {
          canonImages.set(c.id, c.image_url);
        }
      });
    }
  }

  // Resolve images for each character
  for (const char of characters) {
    const imageData = resolveCharacterImageSync({
      canonImage: char.canon_asset_id ? canonImages.get(char.canon_asset_id) : null,
      heroImage: heroImages.get(char.id) || null,
      acceptedRunImage: char.accepted_run_id ? runImages.get(char.accepted_run_id) : null,
      currentRunImage: char.current_run_id ? runImages.get(char.current_run_id) : null,
      turnaroundUrls: char.turnaround_urls,
    });

    result.set(char.id, imageData);
  }

  return result;
}
