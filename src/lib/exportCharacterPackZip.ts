/**
 * Export Character Pack to ZIP - SIMPLIFIED
 * character_outfits table removed. Uses pack slots only.
 */

import JSZip from 'jszip';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export async function exportCharacterPackZip(
  characterId: string,
  characterName: string
): Promise<void> {
  try {
    toast.info('Preparando pack de personaje...');
    
    const zip = new JSZip();
    
    // Fetch all character pack slots with images
    const { data: slots, error: slotsError } = await supabase
      .from('character_pack_slots')
      .select('slot_type, slot_index, image_url, expression_name, view_angle')
      .eq('character_id', characterId)
      .not('image_url', 'is', null);
      
    if (slotsError) throw new Error('Error fetching character pack slots');
    
    // Create folders matching the slot system
    const closeupFolder = zip.folder('01_Closeups');
    const fullbodyFolder = zip.folder('02_Fullbody');
    const expressionsFolder = zip.folder('03_Expressions');
    const viewsFolder = zip.folder('04_Views');
    
    const downloadImage = async (url: string): Promise<ArrayBuffer> => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Failed to download: ${url}`);
      return response.arrayBuffer();
    };
    
    let addedFiles = 0;
    
    for (const slot of slots || []) {
      if (!slot.image_url) continue;
      
      try {
        const imageData = await downloadImage(slot.image_url);
        const ext = slot.image_url.includes('.png') ? 'png' : 'jpg';
        
        let folder: JSZip | null = null;
        let fileName = '';
        
        switch (slot.slot_type) {
          case 'closeup':
            folder = closeupFolder;
            fileName = `closeup_${slot.view_angle || slot.slot_index}.${ext}`;
            break;
          case 'fullbody':
            folder = fullbodyFolder;
            fileName = `fullbody_${slot.view_angle || slot.slot_index}.${ext}`;
            break;
          case 'expression':
            folder = expressionsFolder;
            fileName = `${slot.expression_name || `expr_${slot.slot_index}`}.${ext}`;
            break;
          default:
            folder = viewsFolder;
            fileName = `${slot.slot_type}_${slot.slot_index}.${ext}`;
        }
        
        if (folder) {
          folder.file(fileName, imageData);
          addedFiles++;
        }
      } catch (err) {
        console.warn(`Failed to add slot image:`, err);
      }
    }
    
    if (addedFiles === 0) {
      toast.warning('No hay imágenes para exportar');
      return;
    }
    
    // Generate and download ZIP
    const blob = await zip.generateAsync({ type: 'blob' });
    const safeName = characterName.replace(/[^a-zA-Z0-9]/g, '_');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safeName}_pack.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast.success(`Pack exportado: ${addedFiles} imágenes`);
  } catch (error) {
    console.error('Error exporting character pack:', error);
    toast.error('Error al exportar el pack');
    throw error;
  }
}
