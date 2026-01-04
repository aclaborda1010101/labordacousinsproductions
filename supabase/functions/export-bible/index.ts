import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { jsPDF } from "https://esm.sh/jspdf@2.5.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ExportBibleRequest {
  projectId: string;
  format: 'json' | 'pdf';
  style?: 'basic' | 'pro';
}

interface CanonAsset {
  id: string;
  name: string;
  imageUrl: string;
  notes: string | null;
  runId: string;
  model: string | null;
  engine: string | null;
  createdAt: string;
  assetType: string;
}

interface KeyframeData {
  id: string;
  imageUrl: string | null;
  shotId: string;
  sceneNumber: number | null;
  shotNumber: number | null;
  frameType: string | null;
  runId: string | null;
  engine: string | null;
  model: string | null;
}

interface StylePackData {
  description: string | null;
  tone: string | null;
  genre: string | null;
  era: string | null;
  colorPalette: string[] | null;
  keywords: string[] | null;
  referenceUrls: string[] | null;
}

interface BibleExport {
  projectId: string;
  projectTitle: string;
  exportedAt: string;
  heroImageUrl: string | null;
  stylePack: StylePackData | null;
  canon: {
    characters: CanonAsset[];
    locations: CanonAsset[];
    style: CanonAsset[];
  };
  keyframes: KeyframeData[];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: ExportBibleRequest = await req.json();
    
    if (!body.projectId || !body.format) {
      return new Response(JSON.stringify({
        ok: false,
        error: 'Missing required fields: projectId, format'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const style = body.style || 'basic';
    console.log(`[export-bible] Starting export: projectId=${body.projectId}, format=${body.format}, style=${style}`);

    // Fetch project info (only existing columns)
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, title, format')
      .eq('id', body.projectId)
      .single();

    if (projectError || !project) {
      console.error('[export-bible] Project not found:', projectError);
      return new Response(JSON.stringify({
        ok: false,
        error: 'Project not found'
      }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Fetch canon assets with generation_runs join
    const { data: canonAssets, error: canonError } = await supabase
      .from('canon_assets')
      .select(`
        id,
        asset_type,
        name,
        image_url,
        notes,
        run_id,
        created_at,
        generation_runs (
          engine,
          model
        )
      `)
      .eq('project_id', body.projectId)
      .eq('is_active', true)
      .order('asset_type')
      .order('name');

    if (canonError) {
      console.error('[export-bible] Error fetching canon assets:', canonError);
    }

    // Fetch style pack (using correct column names)
    const { data: stylePack } = await supabase
      .from('style_packs')
      .select('description, tone, lens_style, realism_level, color_palette, reference_urls')
      .eq('project_id', body.projectId)
      .maybeSingle();

    // Fetch accepted keyframes for continuity section
    const { data: keyframes } = await supabase
      .from('keyframes')
      .select(`
        id,
        image_url,
        shot_id,
        frame_type,
        run_id,
        shots (
          shot_number,
          scenes (
            scene_number
          )
        ),
        generation_runs (
          engine,
          model
        )
      `)
      .eq('approved', true)
      .order('created_at', { ascending: false })
      .limit(20);

    // Filter keyframes by project (through shots -> scenes -> episodes)
    const projectKeyframes: KeyframeData[] = [];
    if (keyframes) {
      for (const kf of keyframes) {
        // Handle nested relations safely
        const shotData = kf.shots as unknown as { shot_number: number | null; scenes: { scene_number: number } | null } | null;
        const runData = kf.generation_runs as unknown as { engine: string | null; model: string | null } | null;
        
        projectKeyframes.push({
          id: kf.id,
          imageUrl: kf.image_url,
          shotId: kf.shot_id,
          sceneNumber: shotData?.scenes?.scene_number || null,
          shotNumber: shotData?.shot_number || null,
          frameType: kf.frame_type,
          runId: kf.run_id,
          engine: runData?.engine || null,
          model: runData?.model || null,
        });
      }
    }

    // Group canon assets by type
    const characters: CanonAsset[] = [];
    const locations: CanonAsset[] = [];
    const styleAssets: CanonAsset[] = [];

    for (const asset of (canonAssets || [])) {
      const runData = asset.generation_runs as unknown;
      const run = runData && typeof runData === 'object' && !Array.isArray(runData) 
        ? runData as { engine: string | null; model: string | null }
        : null;
      
      const canonAsset: CanonAsset = {
        id: asset.id,
        name: asset.name,
        imageUrl: asset.image_url,
        notes: asset.notes,
        runId: asset.run_id,
        model: run?.model || null,
        engine: run?.engine || null,
        createdAt: asset.created_at,
        assetType: asset.asset_type,
      };

      switch (asset.asset_type) {
        case 'character':
          characters.push(canonAsset);
          break;
        case 'location':
          locations.push(canonAsset);
          break;
        case 'style':
          styleAssets.push(canonAsset);
          break;
      }
    }

    // Determine hero image (latest accepted keyframe or first canon image)
    let heroImageUrl: string | null = null;
    if (projectKeyframes.length > 0 && projectKeyframes[0].imageUrl) {
      heroImageUrl = projectKeyframes[0].imageUrl;
    } else if (characters.length > 0) {
      heroImageUrl = characters[0].imageUrl;
    } else if (locations.length > 0) {
      heroImageUrl = locations[0].imageUrl;
    }

    const stylePackData: StylePackData | null = stylePack ? {
      description: stylePack.description,
      tone: stylePack.tone,
      genre: stylePack.lens_style,
      era: stylePack.realism_level,
      colorPalette: stylePack.color_palette,
      keywords: null,
      referenceUrls: stylePack.reference_urls,
    } : null;

    const bibleExport: BibleExport = {
      projectId: body.projectId,
      projectTitle: project.title,
      exportedAt: new Date().toISOString(),
      heroImageUrl,
      stylePack: stylePackData,
      canon: {
        characters,
        locations,
        style: styleAssets,
      },
      keyframes: projectKeyframes,
    };

    console.log(`[export-bible] Found ${characters.length} characters, ${locations.length} locations, ${styleAssets.length} style assets, ${projectKeyframes.length} keyframes`);

    // JSON export
    if (body.format === 'json') {
      return new Response(JSON.stringify({
        ok: true,
        data: bibleExport
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // PDF export
    if (body.format === 'pdf') {
      if (style === 'pro') {
        // Generate PRO PDF with embedded images
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pdfBytes = await generateProPDF(bibleExport);
        
        // Upload to storage
        const fileName = `bibles/${body.projectId}/bible-pro-${Date.now()}.pdf`;
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('exports')
          .upload(fileName, pdfBytes, {
            contentType: 'application/pdf',
            upsert: true
          });

        if (uploadError) {
          console.error('[export-bible] Storage upload error:', uploadError);
          // Return PDF directly as base64
          const base64Pdf = btoa(String.fromCharCode(...new Uint8Array(pdfBytes)));
          return new Response(JSON.stringify({
            ok: true,
            format: 'pdf',
            style: 'pro',
            data: bibleExport,
            pdfBase64: base64Pdf
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const { data: urlData } = supabase.storage
          .from('exports')
          .getPublicUrl(uploadData.path);

        return new Response(JSON.stringify({
          ok: true,
          format: 'pdf',
          style: 'pro',
          url: urlData.publicUrl,
          fileName: `bible-pro-${Date.now()}.pdf`
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } else {
        // Basic PDF - return data for client-side generation
        return new Response(JSON.stringify({
          ok: true,
          format: 'pdf',
          style: 'basic',
          data: bibleExport
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    return new Response(JSON.stringify({
      ok: false,
      error: 'Invalid format. Use "json" or "pdf"'
    }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('[export-bible] Exception:', err);
    return new Response(JSON.stringify({
      ok: false,
      error: err instanceof Error ? err.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

// Fetch image and convert to base64 data URL
async function fetchImageAsBase64(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    
    const arrayBuffer = await response.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    let binary = '';
    for (let i = 0; i < uint8Array.length; i++) {
      binary += String.fromCharCode(uint8Array[i]);
    }
    const base64 = btoa(binary);
    
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    return `data:${contentType};base64,${base64}`;
  } catch (err) {
    console.error('[fetchImageAsBase64] Error:', err);
    return null;
  }
}

async function generateProPDF(bible: BibleExport): Promise<ArrayBuffer> {
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 15;
  const contentWidth = pageWidth - 2 * margin;
  let yPos = margin;

  // Colors
  const goldColor = [245, 158, 11] as [number, number, number];
  const darkBg = [15, 15, 15] as [number, number, number];
  const textLight = [229, 229, 229] as [number, number, number];
  const textMuted = [120, 120, 120] as [number, number, number];

  // Helper: New page
  const newPage = () => {
    pdf.addPage();
    yPos = margin;
  };

  // Helper: Check page break
  const checkBreak = (needed: number) => {
    if (yPos + needed > pageHeight - margin) {
      newPage();
      return true;
    }
    return false;
  };

  // Helper: Draw section title
  const sectionTitle = (title: string) => {
    checkBreak(20);
    pdf.setFillColor(...goldColor);
    pdf.rect(margin, yPos, 3, 10, 'F');
    pdf.setTextColor(...textLight);
    pdf.setFontSize(18);
    pdf.setFont('helvetica', 'bold');
    pdf.text(title, margin + 8, yPos + 8);
    yPos += 18;
  };

  // ========== COVER PAGE ==========
  pdf.setFillColor(...darkBg);
  pdf.rect(0, 0, pageWidth, pageHeight, 'F');

  // Hero image if available
  if (bible.heroImageUrl) {
    const heroBase64 = await fetchImageAsBase64(bible.heroImageUrl);
    if (heroBase64) {
      try {
        // Add hero image covering top half
        pdf.addImage(heroBase64, 'JPEG', 0, 0, pageWidth, pageHeight * 0.5);
        // Gradient overlay
        pdf.setFillColor(15, 15, 15);
        pdf.setGState(new pdf.GState({ opacity: 0.7 }));
        pdf.rect(0, pageHeight * 0.35, pageWidth, pageHeight * 0.15, 'F');
        pdf.setGState(new pdf.GState({ opacity: 1 }));
      } catch (e) {
        console.log('[generateProPDF] Hero image embed failed:', e);
      }
    }
  }

  // Title
  pdf.setTextColor(...goldColor);
  pdf.setFontSize(36);
  pdf.setFont('helvetica', 'bold');
  const titleLines = pdf.splitTextToSize(bible.projectTitle.toUpperCase(), contentWidth);
  pdf.text(titleLines, pageWidth / 2, pageHeight * 0.55, { align: 'center' });

  pdf.setTextColor(...textLight);
  pdf.setFontSize(16);
  pdf.setFont('helvetica', 'normal');
  pdf.text('BIBLIA DE PRODUCCIÓN', pageWidth / 2, pageHeight * 0.55 + 25, { align: 'center' });

  pdf.setTextColor(...textMuted);
  pdf.setFontSize(11);
  const exportDate = new Date(bible.exportedAt).toLocaleDateString('es-ES', {
    year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
  });
  pdf.text(`Generado: ${exportDate}`, pageWidth / 2, pageHeight * 0.55 + 35, { align: 'center' });

  // Stats at bottom
  pdf.setFontSize(10);
  pdf.setTextColor(...textMuted);
  const stats = [
    `${bible.canon.characters.length} Personajes`,
    `${bible.canon.locations.length} Localizaciones`,
    `${bible.keyframes.length} Keyframes`
  ].join('  •  ');
  pdf.text(stats, pageWidth / 2, pageHeight - 20, { align: 'center' });

  // ========== QUICK SNAPSHOT ==========
  if (bible.stylePack) {
    newPage();
    pdf.setFillColor(...darkBg);
    pdf.rect(0, 0, pageWidth, pageHeight, 'F');
    yPos = margin;

    sectionTitle('VISIÓN RÁPIDA');

    const sp = bible.stylePack;
    const infoItems = [
      { label: 'Tono', value: sp.tone },
      { label: 'Género', value: sp.genre },
      { label: 'Época', value: sp.era },
    ].filter(item => item.value);

    pdf.setFontSize(11);
    for (const item of infoItems) {
      checkBreak(12);
      pdf.setTextColor(...textMuted);
      pdf.setFont('helvetica', 'normal');
      pdf.text(`${item.label}:`, margin, yPos);
      pdf.setTextColor(...textLight);
      pdf.setFont('helvetica', 'bold');
      pdf.text(item.value || '', margin + 25, yPos);
      yPos += 8;
    }

    if (sp.description) {
      yPos += 5;
      checkBreak(30);
      pdf.setTextColor(...textMuted);
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'italic');
      const descLines = pdf.splitTextToSize(sp.description, contentWidth);
      pdf.text(descLines, margin, yPos);
      yPos += descLines.length * 5 + 10;
    }

    if (sp.keywords && sp.keywords.length > 0) {
      checkBreak(20);
      pdf.setTextColor(...goldColor);
      pdf.setFontSize(12);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Keywords:', margin, yPos);
      yPos += 8;
      pdf.setTextColor(...textLight);
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'normal');
      pdf.text(sp.keywords.join('  •  '), margin, yPos);
      yPos += 12;
    }

    if (sp.colorPalette && sp.colorPalette.length > 0) {
      checkBreak(25);
      pdf.setTextColor(...goldColor);
      pdf.setFontSize(12);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Paleta de Color:', margin, yPos);
      yPos += 10;
      
      // Draw color swatches
      const swatchSize = 15;
      let xPos = margin;
      for (const color of sp.colorPalette.slice(0, 8)) {
        try {
          // Parse hex color
          const hex = color.replace('#', '');
          const r = parseInt(hex.substring(0, 2), 16);
          const g = parseInt(hex.substring(2, 4), 16);
          const b = parseInt(hex.substring(4, 6), 16);
          pdf.setFillColor(r, g, b);
          pdf.roundedRect(xPos, yPos, swatchSize, swatchSize, 2, 2, 'F');
          xPos += swatchSize + 5;
        } catch {
          // Skip invalid colors
        }
      }
      yPos += swatchSize + 15;
    }
  }

  // ========== CHARACTERS SECTION ==========
  if (bible.canon.characters.length > 0) {
    newPage();
    pdf.setFillColor(...darkBg);
    pdf.rect(0, 0, pageWidth, pageHeight, 'F');
    yPos = margin;

    sectionTitle('PERSONAJES CANON');

    const cardHeight = 110;
    const cardWidth = (contentWidth - 10) / 2;
    let col = 0;

    for (const char of bible.canon.characters) {
      if (col === 0) {
        checkBreak(cardHeight + 10);
      }

      const xOffset = margin + col * (cardWidth + 10);

      // Card background
      pdf.setFillColor(25, 25, 25);
      pdf.roundedRect(xOffset, yPos, cardWidth, cardHeight, 3, 3, 'F');

      // Character image
      const imgBase64 = await fetchImageAsBase64(char.imageUrl);
      if (imgBase64) {
        try {
          pdf.addImage(imgBase64, 'JPEG', xOffset + 5, yPos + 5, cardWidth - 10, 60);
        } catch (e) {
          console.log('[generateProPDF] Character image failed:', e);
        }
      }

      // Character name
      pdf.setTextColor(...textLight);
      pdf.setFontSize(12);
      pdf.setFont('helvetica', 'bold');
      pdf.text(char.name, xOffset + 5, yPos + 75);

      // Notes
      if (char.notes) {
        pdf.setTextColor(...textMuted);
        pdf.setFontSize(8);
        pdf.setFont('helvetica', 'normal');
        const noteLines = pdf.splitTextToSize(char.notes, cardWidth - 10);
        pdf.text(noteLines.slice(0, 2), xOffset + 5, yPos + 83);
      }

      // Engine/Model
      pdf.setTextColor(80, 80, 80);
      pdf.setFontSize(7);
      pdf.text(`${char.engine || 'N/A'} • ${char.model || 'N/A'}`, xOffset + 5, yPos + cardHeight - 5);

      col++;
      if (col >= 2) {
        col = 0;
        yPos += cardHeight + 8;
      }
    }
    if (col !== 0) yPos += cardHeight + 8;
  }

  // ========== LOCATIONS SECTION ==========
  if (bible.canon.locations.length > 0) {
    newPage();
    pdf.setFillColor(...darkBg);
    pdf.rect(0, 0, pageWidth, pageHeight, 'F');
    yPos = margin;

    sectionTitle('LOCALIZACIONES CANON');

    // Scouting layout: first location large, rest smaller
    for (let i = 0; i < bible.canon.locations.length; i++) {
      const loc = bible.canon.locations[i];
      
      if (i === 0) {
        // Large card for first location
        checkBreak(100);
        pdf.setFillColor(25, 25, 25);
        pdf.roundedRect(margin, yPos, contentWidth, 90, 3, 3, 'F');

        const imgBase64 = await fetchImageAsBase64(loc.imageUrl);
        if (imgBase64) {
          try {
            pdf.addImage(imgBase64, 'JPEG', margin + 5, yPos + 5, contentWidth - 10, 55);
          } catch (e) {
            console.log('[generateProPDF] Location image failed:', e);
          }
        }

        pdf.setTextColor(...textLight);
        pdf.setFontSize(14);
        pdf.setFont('helvetica', 'bold');
        pdf.text(loc.name, margin + 5, yPos + 70);

        if (loc.notes) {
          pdf.setTextColor(...textMuted);
          pdf.setFontSize(9);
          pdf.setFont('helvetica', 'normal');
          const noteLines = pdf.splitTextToSize(loc.notes, contentWidth - 10);
          pdf.text(noteLines.slice(0, 2), margin + 5, yPos + 78);
        }

        yPos += 98;
      } else {
        // Smaller cards (2 per row)
        const smallCardWidth = (contentWidth - 10) / 2;
        const smallCardHeight = 70;
        const col = (i - 1) % 2;
        
        if (col === 0) checkBreak(smallCardHeight + 10);
        
        const xOffset = margin + col * (smallCardWidth + 10);

        pdf.setFillColor(25, 25, 25);
        pdf.roundedRect(xOffset, yPos, smallCardWidth, smallCardHeight, 3, 3, 'F');

        const imgBase64 = await fetchImageAsBase64(loc.imageUrl);
        if (imgBase64) {
          try {
            pdf.addImage(imgBase64, 'JPEG', xOffset + 5, yPos + 5, smallCardWidth - 10, 40);
          } catch (e) {
            console.log('[generateProPDF] Small location image failed:', e);
          }
        }

        pdf.setTextColor(...textLight);
        pdf.setFontSize(10);
        pdf.setFont('helvetica', 'bold');
        pdf.text(loc.name, xOffset + 5, yPos + 52);

        pdf.setTextColor(80, 80, 80);
        pdf.setFontSize(7);
        pdf.text(`${loc.engine || 'N/A'}`, xOffset + 5, yPos + smallCardHeight - 5);

        if (col === 1) yPos += smallCardHeight + 8;
      }
    }
  }

  // ========== CONTINUITY SECTION (Keyframes) ==========
  if (bible.keyframes.length > 0) {
    newPage();
    pdf.setFillColor(...darkBg);
    pdf.rect(0, 0, pageWidth, pageHeight, 'F');
    yPos = margin;

    sectionTitle('CONTINUIDAD VISUAL');

    const gridCols = 3;
    const cellWidth = (contentWidth - (gridCols - 1) * 5) / gridCols;
    const cellHeight = 50;
    let col = 0;

    for (const kf of bible.keyframes.slice(0, 12)) {
      if (col === 0) checkBreak(cellHeight + 15);

      const xOffset = margin + col * (cellWidth + 5);

      // Keyframe cell
      pdf.setFillColor(25, 25, 25);
      pdf.roundedRect(xOffset, yPos, cellWidth, cellHeight, 2, 2, 'F');

      if (kf.imageUrl) {
        const imgBase64 = await fetchImageAsBase64(kf.imageUrl);
        if (imgBase64) {
          try {
            pdf.addImage(imgBase64, 'JPEG', xOffset + 2, yPos + 2, cellWidth - 4, cellHeight - 12);
          } catch (e) {
            console.log('[generateProPDF] Keyframe image failed:', e);
          }
        }
      }

      // Label
      pdf.setTextColor(...textMuted);
      pdf.setFontSize(7);
      const label = `E${kf.sceneNumber || '?'} S${kf.shotNumber || '?'} ${kf.frameType || ''}`;
      pdf.text(label, xOffset + 2, yPos + cellHeight - 3);

      col++;
      if (col >= gridCols) {
        col = 0;
        yPos += cellHeight + 5;
      }
    }
  }

  // ========== TECHNICAL APPENDIX ==========
  newPage();
  pdf.setFillColor(...darkBg);
  pdf.rect(0, 0, pageWidth, pageHeight, 'F');
  yPos = margin;

  sectionTitle('APÉNDICE TÉCNICO');

  // Table header
  pdf.setFillColor(30, 30, 30);
  pdf.rect(margin, yPos, contentWidth, 8, 'F');
  pdf.setTextColor(...goldColor);
  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Tipo', margin + 2, yPos + 5);
  pdf.text('Nombre', margin + 25, yPos + 5);
  pdf.text('Motor', margin + 80, yPos + 5);
  pdf.text('Modelo', margin + 110, yPos + 5);
  pdf.text('Run ID', margin + 145, yPos + 5);
  yPos += 10;

  // Table rows - All canon assets
  const allAssets = [...bible.canon.characters, ...bible.canon.locations, ...bible.canon.style];
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7);

  for (const asset of allAssets) {
    checkBreak(7);
    
    pdf.setFillColor(yPos % 2 === 0 ? 20 : 25, yPos % 2 === 0 ? 20 : 25, yPos % 2 === 0 ? 20 : 25);
    pdf.rect(margin, yPos - 3, contentWidth, 7, 'F');
    
    pdf.setTextColor(...textMuted);
    pdf.text(asset.assetType.substring(0, 8), margin + 2, yPos + 2);
    
    pdf.setTextColor(...textLight);
    const truncName = asset.name.length > 20 ? asset.name.substring(0, 18) + '...' : asset.name;
    pdf.text(truncName, margin + 25, yPos + 2);
    
    pdf.setTextColor(...textMuted);
    pdf.text(asset.engine || 'N/A', margin + 80, yPos + 2);
    pdf.text((asset.model || 'N/A').substring(0, 15), margin + 110, yPos + 2);
    pdf.text(asset.runId.substring(0, 8) + '...', margin + 145, yPos + 2);
    
    yPos += 7;
  }

  // Footer
  yPos = pageHeight - 15;
  pdf.setTextColor(60, 60, 60);
  pdf.setFontSize(8);
  pdf.text(`CINEFORGE Studio • Biblia PRO • ${bible.projectTitle}`, pageWidth / 2, yPos, { align: 'center' });

  // Return as ArrayBuffer
  return pdf.output('arraybuffer');
}
