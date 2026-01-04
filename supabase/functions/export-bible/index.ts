import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CanonAsset {
  id: string;
  name: string;
  imageUrl: string;
  notes: string | null;
  runId: string;
  engine: string | null;
  model: string | null;
  createdAt: string;
  assetType: string;
}

interface KeyframeData {
  id: string;
  imageUrl: string | null;
  scene: number | null;
  shot: number | null;
  runId: string | null;
  createdAt: string;
}

interface AcceptedRun {
  id: string;
  type: string;
  name: string;
  date: string;
}

interface BibleExport {
  project: {
    id: string;
    name: string;
    tone: string | null;
    lensStyle: string | null;
    realismLevel: string | null;
    description: string | null;
    colorPalette: string[] | null;
  };
  canon: {
    characters: CanonAsset[];
    locations: CanonAsset[];
    style: CanonAsset[];
  };
  continuity: {
    keyframes: KeyframeData[];
  };
  recentRuns: AcceptedRun[];
  stats: {
    totalCharacters: number;
    totalLocations: number;
    totalScenes: number;
    totalShots: number;
    canonCharacters: number;
    canonLocations: number;
    canonStyle: number;
    acceptedKeyframes: number;
  };
  exportedAt: string;
  version: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    
    if (!body.projectId) {
      return new Response(JSON.stringify({
        ok: false,
        error: 'Missing required field: projectId'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    console.log(`[export-bible] Starting export for project: ${body.projectId}`);

    // Parallel fetch all data
    const [
      projectRes,
      canonAssetsRes,
      stylePackRes,
      keyframesRes,
      charactersCountRes,
      locationsCountRes,
      scenesCountRes,
      shotsCountRes,
      recentRunsRes
    ] = await Promise.all([
      // Project info
      supabase
        .from('projects')
        .select('id, title, updated_at')
        .eq('id', body.projectId)
        .single(),
      
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
        .order('created_at', { ascending: false }),
      
      // Style pack
      supabase
        .from('style_packs')
        .select('description, tone, lens_style, realism_level, color_palette')
        .eq('project_id', body.projectId)
        .maybeSingle(),
      
      // Accepted keyframes with scene/shot info
      supabase
        .from('keyframes')
        .select(`
          id,
          image_url,
          shot_id,
          run_id,
          created_at,
          shots (
            shot_number,
            scenes (
              scene_number
            )
          )
        `)
        .eq('approved', true)
        .order('created_at', { ascending: false })
        .limit(20),
      
      // Counts
      supabase
        .from('characters')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', body.projectId),
      
      supabase
        .from('locations')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', body.projectId),
      
      supabase
        .from('scenes')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', body.projectId),
      
      supabase
        .from('shots')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', body.projectId),
      
      // Recent accepted runs (for timeline)
      supabase
        .from('generation_runs')
        .select('id, run_type, created_at, output_url')
        .eq('project_id', body.projectId)
        .eq('verdict', 'accepted')
        .order('created_at', { ascending: false })
        .limit(10)
    ]);

    if (projectRes.error || !projectRes.data) {
      console.error('[export-bible] Project not found:', projectRes.error);
      return new Response(JSON.stringify({
        ok: false,
        error: 'Project not found'
      }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const project = projectRes.data;
    const stylePack = stylePackRes.data;

    // Process canon assets
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

    // Process keyframes
    const keyframes: KeyframeData[] = [];
    if (keyframesRes.data) {
      for (const kf of keyframesRes.data) {
        const shotData = kf.shots as unknown as { shot_number: number | null; scenes: { scene_number: number } | null } | null;
        
        keyframes.push({
          id: kf.id,
          imageUrl: kf.image_url,
          scene: shotData?.scenes?.scene_number || null,
          shot: shotData?.shot_number || null,
          runId: kf.run_id,
          createdAt: kf.created_at,
        });
      }
    }

    // Process recent runs for timeline
    const recentRuns: AcceptedRun[] = [];
    if (recentRunsRes.data) {
      for (const run of recentRunsRes.data) {
        recentRuns.push({
          id: run.id,
          type: run.run_type || 'generation',
          name: run.run_type || 'Run',
          date: run.created_at,
        });
      }
    }

    // Add canon assets to recent runs
    for (const char of characters.slice(0, 3)) {
      recentRuns.push({
        id: char.id,
        type: 'character',
        name: char.name,
        date: char.createdAt,
      });
    }
    for (const loc of locations.slice(0, 3)) {
      recentRuns.push({
        id: loc.id,
        type: 'location',
        name: loc.name,
        date: loc.createdAt,
      });
    }

    // Sort by date and take top 6
    recentRuns.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const topRecentRuns = recentRuns.slice(0, 6);

    const bibleExport: BibleExport = {
      project: {
        id: body.projectId,
        name: project.title,
        tone: stylePack?.tone || null,
        lensStyle: stylePack?.lens_style || null,
        realismLevel: stylePack?.realism_level || null,
        description: stylePack?.description || null,
        colorPalette: stylePack?.color_palette || null,
      },
      canon: {
        characters,
        locations,
        style: styleAssets,
      },
      continuity: {
        keyframes,
      },
      recentRuns: topRecentRuns,
      stats: {
        totalCharacters: charactersCountRes.count || 0,
        totalLocations: locationsCountRes.count || 0,
        totalScenes: scenesCountRes.count || 0,
        totalShots: shotsCountRes.count || 0,
        canonCharacters: characters.length,
        canonLocations: locations.length,
        canonStyle: styleAssets.length,
        acceptedKeyframes: keyframes.length,
      },
      exportedAt: new Date().toISOString(),
      version: '1.0',
    };

    console.log(`[export-bible] Export complete: ${characters.length} chars, ${locations.length} locs, ${keyframes.length} keyframes`);

    return new Response(JSON.stringify({
      ok: true,
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
