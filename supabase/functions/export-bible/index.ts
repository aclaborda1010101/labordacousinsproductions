import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
  lensStyle: string | null;
  realismLevel: string | null;
  colorPalette: string[] | null;
  referenceUrls: string[] | null;
}

interface ProjectStats {
  totalCharacters: number;
  totalLocations: number;
  totalScenes: number;
  totalShots: number;
  totalKeyframes: number;
  canonCharacters: number;
  canonLocations: number;
  canonStyle: number;
  lastUpdated: string;
}

interface BibleExport {
  projectId: string;
  projectTitle: string;
  exportedAt: string;
  version: string;
  heroImageUrl: string | null;
  stylePack: StylePackData | null;
  stats: ProjectStats;
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

    // Fetch project info
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, title, format, updated_at')
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

    // Fetch all stats in parallel
    const [
      canonAssetsRes,
      stylePackRes,
      keyframesRes,
      charactersCountRes,
      locationsCountRes,
      scenesCountRes,
      shotsCountRes
    ] = await Promise.all([
      // Canon assets with generation_runs join
      supabase
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
        .order('name'),
      
      // Style pack
      supabase
        .from('style_packs')
        .select('description, tone, lens_style, realism_level, color_palette, reference_urls')
        .eq('project_id', body.projectId)
        .maybeSingle(),
      
      // Accepted keyframes for continuity
      supabase
        .from('keyframes')
        .select(`
          id,
          image_url,
          shot_id,
          frame_type,
          run_id,
          created_at,
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
        .limit(20),
      
      // Total characters count
      supabase
        .from('characters')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', body.projectId),
      
      // Total locations count
      supabase
        .from('locations')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', body.projectId),
      
      // Total scenes count
      supabase
        .from('scenes')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', body.projectId),
      
      // Total shots count
      supabase
        .from('shots')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', body.projectId)
    ]);

    if (canonAssetsRes.error) {
      console.error('[export-bible] Error fetching canon assets:', canonAssetsRes.error);
    }

    // Process keyframes
    const projectKeyframes: KeyframeData[] = [];
    if (keyframesRes.data) {
      for (const kf of keyframesRes.data) {
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

    for (const asset of (canonAssetsRes.data || [])) {
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

    // Determine hero image priority: keyframe > character > location > style
    let heroImageUrl: string | null = null;
    if (projectKeyframes.length > 0 && projectKeyframes[0].imageUrl) {
      heroImageUrl = projectKeyframes[0].imageUrl;
    } else if (characters.length > 0) {
      heroImageUrl = characters[0].imageUrl;
    } else if (locations.length > 0) {
      heroImageUrl = locations[0].imageUrl;
    } else if (styleAssets.length > 0) {
      heroImageUrl = styleAssets[0].imageUrl;
    }

    const stylePack = stylePackRes.data;
    const stylePackData: StylePackData | null = stylePack ? {
      description: stylePack.description,
      tone: stylePack.tone,
      lensStyle: stylePack.lens_style,
      realismLevel: stylePack.realism_level,
      colorPalette: stylePack.color_palette,
      referenceUrls: stylePack.reference_urls,
    } : null;

    // Build stats
    const stats: ProjectStats = {
      totalCharacters: charactersCountRes.count || 0,
      totalLocations: locationsCountRes.count || 0,
      totalScenes: scenesCountRes.count || 0,
      totalShots: shotsCountRes.count || 0,
      totalKeyframes: projectKeyframes.length,
      canonCharacters: characters.length,
      canonLocations: locations.length,
      canonStyle: styleAssets.length,
      lastUpdated: project.updated_at || new Date().toISOString(),
    };

    const bibleExport: BibleExport = {
      projectId: body.projectId,
      projectTitle: project.title,
      exportedAt: new Date().toISOString(),
      version: '1.0',
      heroImageUrl,
      stylePack: stylePackData,
      stats,
      canon: {
        characters,
        locations,
        style: styleAssets,
      },
      keyframes: projectKeyframes,
    };

    console.log(`[export-bible] Stats: ${stats.totalCharacters} chars, ${stats.totalLocations} locs, ${stats.canonCharacters} canon chars, ${stats.canonLocations} canon locs`);

    // Return JSON data (PDF generation happens client-side)
    return new Response(JSON.stringify({
      ok: true,
      format: body.format,
      style: style,
      data: bibleExport
    }), {
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
