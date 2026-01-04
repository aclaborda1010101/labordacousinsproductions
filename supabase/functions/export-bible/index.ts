import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ExportBibleRequest {
  projectId: string;
  format: 'json' | 'pdf';
}

interface CanonAsset {
  name: string;
  imageUrl: string;
  notes: string | null;
  runId: string;
  model: string | null;
  engine: string | null;
}

interface BibleExport {
  projectId: string;
  projectTitle: string;
  exportedAt: string;
  canon: {
    characters: CanonAsset[];
    locations: CanonAsset[];
    style: CanonAsset[];
  };
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

    console.log(`[export-bible] Starting export: projectId=${body.projectId}, format=${body.format}`);

    // Fetch project info
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, title')
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
      return new Response(JSON.stringify({
        ok: false,
        error: 'Failed to fetch canon assets'
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Group assets by type
    const characters: CanonAsset[] = [];
    const locations: CanonAsset[] = [];
    const style: CanonAsset[] = [];

    for (const asset of (canonAssets || [])) {
      // generation_runs is returned as a single object from the join
      const runData = asset.generation_runs as unknown;
      const run = runData && typeof runData === 'object' && !Array.isArray(runData) 
        ? runData as { engine: string | null; model: string | null }
        : null;
      const canonAsset: CanonAsset = {
        name: asset.name,
        imageUrl: asset.image_url,
        notes: asset.notes,
        runId: asset.run_id,
        model: run?.model || null,
        engine: run?.engine || null,
      };

      switch (asset.asset_type) {
        case 'character':
          characters.push(canonAsset);
          break;
        case 'location':
          locations.push(canonAsset);
          break;
        case 'style':
          style.push(canonAsset);
          break;
      }
    }

    const bibleExport: BibleExport = {
      projectId: body.projectId,
      projectTitle: project.title,
      exportedAt: new Date().toISOString(),
      canon: {
        characters,
        locations,
        style,
      },
    };

    console.log(`[export-bible] Found ${characters.length} characters, ${locations.length} locations, ${style.length} style assets`);

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
      // Generate HTML for PDF (will be converted client-side)
      const htmlContent = generateBibleHTML(bibleExport);
      
      // Store the PDF data for download
      const fileName = `bibles/${body.projectId}/bible-${Date.now()}.html`;
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('exports')
        .upload(fileName, htmlContent, {
          contentType: 'text/html',
          upsert: true
        });

      if (uploadError) {
        console.error('[export-bible] Storage upload error:', uploadError);
        // Return the data directly for client-side PDF generation
        return new Response(JSON.stringify({
          ok: true,
          format: 'pdf',
          data: bibleExport,
          html: htmlContent
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
        data: bibleExport,
        html: htmlContent,
        url: urlData.publicUrl
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
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

function generateBibleHTML(bible: BibleExport): string {
  const renderAssetCards = (assets: CanonAsset[], title: string) => {
    if (assets.length === 0) {
      return `
        <div class="section">
          <h2>${title}</h2>
          <p class="empty">No hay assets canon definidos</p>
        </div>
      `;
    }

    return `
      <div class="section">
        <h2>${title}</h2>
        <div class="cards">
          ${assets.map(asset => `
            <div class="card">
              <img src="${asset.imageUrl}" alt="${asset.name}" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><rect fill=%22%23333%22 width=%22100%22 height=%22100%22/><text fill=%22%23666%22 x=%2250%22 y=%2255%22 text-anchor=%22middle%22>Sin imagen</text></svg>'"/>
              <div class="card-content">
                <h3>${asset.name}</h3>
                ${asset.notes ? `<p class="notes">${asset.notes}</p>` : ''}
                <p class="meta">Motor: ${asset.engine || 'N/A'} | Modelo: ${asset.model || 'N/A'}</p>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  };

  return `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Biblia de Producción - ${bible.projectTitle}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Inter', system-ui, sans-serif; background: #0a0a0a; color: #e5e5e5; padding: 40px; }
        .container { max-width: 1200px; margin: 0 auto; }
        .cover { text-align: center; padding: 80px 20px; margin-bottom: 60px; border-bottom: 1px solid #333; }
        .cover h1 { font-size: 3rem; font-weight: 700; margin-bottom: 16px; background: linear-gradient(135deg, #f59e0b, #d97706); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
        .cover .subtitle { font-size: 1.5rem; color: #999; margin-bottom: 24px; }
        .cover .date { font-size: 0.875rem; color: #666; }
        .section { margin-bottom: 60px; }
        .section h2 { font-size: 1.75rem; font-weight: 600; margin-bottom: 24px; padding-bottom: 12px; border-bottom: 2px solid #f59e0b; display: inline-block; }
        .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 24px; }
        .card { background: #1a1a1a; border-radius: 12px; overflow: hidden; border: 1px solid #333; }
        .card img { width: 100%; height: 200px; object-fit: cover; }
        .card-content { padding: 16px; }
        .card h3 { font-size: 1.25rem; font-weight: 600; margin-bottom: 8px; }
        .card .notes { font-size: 0.875rem; color: #999; margin-bottom: 12px; line-height: 1.5; }
        .card .meta { font-size: 0.75rem; color: #666; }
        .empty { color: #666; font-style: italic; padding: 40px; text-align: center; background: #1a1a1a; border-radius: 12px; }
        @media print {
          body { background: white; color: black; }
          .card { break-inside: avoid; }
          .section { break-before: page; }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="cover">
          <h1>${bible.projectTitle}</h1>
          <p class="subtitle">Biblia de Producción</p>
          <p class="date">Exportado: ${new Date(bible.exportedAt).toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
        </div>
        
        ${renderAssetCards(bible.canon.characters, 'Personajes Canon')}
        ${renderAssetCards(bible.canon.locations, 'Localizaciones Canon')}
        ${renderAssetCards(bible.canon.style, 'Estilo Canon')}
      </div>
    </body>
    </html>
  `;
}
