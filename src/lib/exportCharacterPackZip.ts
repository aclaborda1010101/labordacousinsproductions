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
  
  // Create folders matching the 14-slot system
  const closeupFolder = zip.folder('01_Closeups');
  const fullbodyFolder = zip.folder('02_Fullbody');
  const expressionsFolder = zip.folder('03_Expressions');
  const outfitsFolder = zip.folder('04_Outfits');
  
  const downloadImage = async (url: string): Promise<ArrayBuffer> => {
    try {
      const response = await fetch(url, { mode: 'cors' });
      if (!response.ok) {
        console.warn(`HTTP ${response.status} fetching: ${url}`);
        throw new Error(`Failed to fetch image: ${response.status}`);
      }
      return await response.arrayBuffer();
    } catch (error) {
      console.error(`Error downloading ${url}:`, error);
      throw error;
    }
  };
  
  const processedSlots = (slots as PackSlot[]) || [];
  let successCount = 0;
  
  for (const slot of processedSlots) {
    if (!slot.image_url) continue;
    
    try {
      const imageData = await downloadImage(slot.image_url);
      const extension = slot.image_url.split('.').pop()?.split('?')[0] || 'png';
      
      // Determine folder and filename based on slot_type prefix
      let folder: JSZip | null = null;
      let fileName: string;
      
      if (slot.slot_type.startsWith('closeup_')) {
        folder = closeupFolder;
        const angle = slot.slot_type.replace('closeup_', '');
        fileName = `closeup_${angle}_${slot.slot_index}`;
      } else if (slot.slot_type.startsWith('fullbody_')) {
        folder = fullbodyFolder;
        const angle = slot.slot_type.replace('fullbody_', '');
        fileName = `fullbody_${angle}_${slot.slot_index}`;
      } else if (slot.slot_type.startsWith('expression_')) {
        folder = expressionsFolder;
        fileName = slot.expression_name || `expression_${slot.slot_index}`;
      } else if (slot.slot_type.startsWith('outfit_')) {
        folder = outfitsFolder;
        const outfitName = slot.outfit_id ? outfitMap.get(slot.outfit_id) || 'outfit' : 'outfit';
        const safeOutfitName = outfitName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        fileName = `${safeOutfitName}_${slot.slot_index}`;
      } else if (slot.slot_type.startsWith('turn_')) {
        // Legacy turnaround support
        folder = fullbodyFolder;
        const angle = slot.view_angle || slot.slot_type.replace('turn_', '');
        fileName = `turnaround_${angle}_${slot.slot_index}`;
      } else if (slot.slot_type.startsWith('anchor_')) {
        // Legacy anchor support
        folder = closeupFolder;
        fileName = `anchor_${slot.slot_type.replace('anchor_', '')}_${slot.slot_index}`;
      } else {
        // Fallback for any other types
        folder = closeupFolder;
        fileName = `${slot.slot_type}_${slot.slot_index}`;
      }
      
      if (folder) {
        folder.file(`${fileName}.${extension}`, imageData);
        successCount++;
      }
    } catch (e) {
      console.error(`Failed to process slot ${slot.id} (${slot.slot_type}):`, e);
    }
  }
  
  // Add a manifest file
  const manifest = {
    character: characterName,
    exportedAt: new Date().toISOString(),
    totalImages: successCount,
    breakdown: {
      closeups: processedSlots.filter(s => s.slot_type.startsWith('closeup_') || s.slot_type.startsWith('anchor_')).length,
      fullbody: processedSlots.filter(s => s.slot_type.startsWith('fullbody_') || s.slot_type.startsWith('turn_')).length,
      expressions: processedSlots.filter(s => s.slot_type.startsWith('expression_')).length,
      outfits: processedSlots.filter(s => s.slot_type.startsWith('outfit_')).length,
    }
  };
  
  zip.file('manifest.json', JSON.stringify(manifest, null, 2));
  
  return await zip.generateAsync({ type: 'blob' });
}
