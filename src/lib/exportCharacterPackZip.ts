import JSZip from 'jszip';
import { supabase } from '@/integrations/supabase/client';

interface PackSlot {
  id: string;
  slot_type: string;
  slot_index: number;
  image_url: string | null;
  expression_name: string | null;
  view_angle: string | null;
  outfit_id: string | null;
}

interface Outfit {
  id: string;
  name: string;
}

export async function exportCharacterPackZip(
  characterId: string,
  characterName: string
): Promise<Blob> {
  const zip = new JSZip();
  
  // Fetch all slots for this character
  const { data: slots, error: slotsError } = await supabase
    .from('character_pack_slots')
    .select('*')
    .eq('character_id', characterId)
    .not('image_url', 'is', null);
    
  if (slotsError) throw new Error('Error fetching character pack slots');
  
  // Fetch outfits for naming
  const { data: outfits, error: outfitsError } = await supabase
    .from('character_outfits')
    .select('id, name')
    .eq('character_id', characterId);
    
  if (outfitsError) throw new Error('Error fetching outfits');
  
  const outfitMap = new Map((outfits || []).map(o => [o.id, o.name]));
  
  // Create folders and download images
  const anchorsFolder = zip.folder('01_Anchors');
  const turnaroundsFolder = zip.folder('02_Turnarounds');
  const expressionsFolder = zip.folder('03_Expressions');
  const outfitsFolder = zip.folder('04_Outfits');
  
  const downloadImage = async (url: string): Promise<ArrayBuffer> => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch image: ${url}`);
    return await response.arrayBuffer();
  };
  
  const processedSlots = (slots as PackSlot[]) || [];
  
  for (const slot of processedSlots) {
    if (!slot.image_url) continue;
    
    try {
      const imageData = await downloadImage(slot.image_url);
      const extension = slot.image_url.split('.').pop()?.split('?')[0] || 'png';
      
      switch (slot.slot_type) {
        case 'anchor_closeup':
        case 'anchor_fullbody':
          anchorsFolder?.file(`${slot.slot_type}_${slot.slot_index}.${extension}`, imageData);
          break;
        case 'turnaround':
          turnaroundsFolder?.file(`${slot.view_angle || slot.slot_index}.${extension}`, imageData);
          break;
        case 'expression':
          expressionsFolder?.file(`${slot.expression_name || slot.slot_index}.${extension}`, imageData);
          break;
        case 'outfit':
          const outfitName = slot.outfit_id ? outfitMap.get(slot.outfit_id) || 'outfit' : 'outfit';
          const safeOutfitName = outfitName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
          outfitsFolder?.file(`${safeOutfitName}_${slot.slot_index}.${extension}`, imageData);
          break;
      }
    } catch (e) {
      console.error(`Failed to process slot ${slot.id}:`, e);
    }
  }
  
  // Add a manifest file
  const manifest = {
    character: characterName,
    exportedAt: new Date().toISOString(),
    totalImages: processedSlots.length,
    breakdown: {
      anchors: processedSlots.filter(s => s.slot_type.startsWith('anchor')).length,
      turnarounds: processedSlots.filter(s => s.slot_type === 'turnaround').length,
      expressions: processedSlots.filter(s => s.slot_type === 'expression').length,
      outfits: processedSlots.filter(s => s.slot_type === 'outfit').length,
    }
  };
  
  zip.file('manifest.json', JSON.stringify(manifest, null, 2));
  
  return await zip.generateAsync({ type: 'blob' });
}
