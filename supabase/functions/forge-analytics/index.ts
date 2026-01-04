import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ProjectStats {
  characters: number;
  locations: number;
  scenes: number;
  shots: number;
  scripts: number;
}

interface CostEstimate {
  low: number;
  expected: number;
  high: number;
  currency: string;
}

interface TimeEstimate {
  daysToComplete: number;
  hoursPerDay: number;
  totalHours: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { projectId } = await req.json();
    
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    if (!projectId) {
      throw new Error('Project ID is required');
    }

    console.log(`[Forge Analytics] Analyzing project: ${projectId}`);

    // Fetch project data
    const [
      { data: project },
      { data: characters },
      { data: locations },
      { data: scenes },
      { data: shots },
      { data: scripts },
      { data: generationLogs },
      { data: costAssumptions },
    ] = await Promise.all([
      supabase.from('projects').select('*').eq('id', projectId).single(),
      supabase.from('characters').select('id, pack_completeness_score, approved_for_production').eq('project_id', projectId),
      supabase.from('locations').select('id, pack_completeness_score, approved_for_production').eq('project_id', projectId),
      supabase.from('scenes').select('id, status').eq('project_id', projectId),
      supabase.from('shots').select('id, status, shot_tier').eq('project_id', projectId),
      supabase.from('scripts').select('id, status').eq('project_id', projectId),
      supabase.from('generation_logs').select('cost_usd, success, engine, created_at').eq('project_id', projectId),
      supabase.from('cost_assumptions').select('*').eq('project_id', projectId).single(),
    ]);

    // Calculate stats
    const stats: ProjectStats = {
      characters: characters?.length || 0,
      locations: locations?.length || 0,
      scenes: scenes?.length || 0,
      shots: shots?.length || 0,
      scripts: scripts?.length || 0,
    };

    // Calculate completion percentages
    const characterCompletion = characters?.length 
      ? Math.round((characters.filter(c => c.approved_for_production).length / characters.length) * 100)
      : 0;
    
    const locationCompletion = locations?.length
      ? Math.round((locations.filter(l => l.approved_for_production).length / locations.length) * 100)
      : 0;

    const sceneCompletion = scenes?.length
      ? Math.round((scenes.filter(s => s.status === 'complete').length / scenes.length) * 100)
      : 0;

    const shotCompletion = shots?.length
      ? Math.round((shots.filter(s => s.status === 'approved').length / shots.length) * 100)
      : 0;

    // Calculate costs
    const spentSoFar = generationLogs?.reduce((sum, log) => sum + (log.cost_usd || 0), 0) || 0;
    
    // Estimate remaining costs based on shot tiers
    const assumptions = costAssumptions || {
      price_per_sec: 0.05,
      retry_hero_expected: 3,
      retry_cine_expected: 2,
      retry_ultra_expected: 1.5,
    };

    const pendingShots = shots?.filter(s => s.status !== 'approved') || [];
    const estimatedShotsRemaining = pendingShots.reduce((sum, shot) => {
      const tier = shot.shot_tier || 'cine';
      const retryFactor = tier === 'hero' ? assumptions.retry_hero_expected 
        : tier === 'ultra' ? assumptions.retry_ultra_expected 
        : assumptions.retry_cine_expected;
      return sum + (5 * assumptions.price_per_sec * retryFactor); // 5 seconds average per shot
    }, 0);

    const costEstimate: CostEstimate = {
      low: spentSoFar + (estimatedShotsRemaining * 0.7),
      expected: spentSoFar + estimatedShotsRemaining,
      high: spentSoFar + (estimatedShotsRemaining * 1.5),
      currency: 'USD',
    };

    // Calculate time estimates
    const hoursPerShot = 0.5; // Average time to review and approve a shot
    const pendingShotsCount = pendingShots.length;
    const pendingCharacters = characters?.filter(c => !c.approved_for_production).length || 0;
    const pendingLocations = locations?.filter(l => !l.approved_for_production).length || 0;

    const totalHoursRemaining = (pendingShotsCount * hoursPerShot) + 
      (pendingCharacters * 2) + // 2 hours per character
      (pendingLocations * 1.5); // 1.5 hours per location

    const timeEstimate: TimeEstimate = {
      daysToComplete: Math.ceil(totalHoursRemaining / 4), // 4 productive hours per day
      hoursPerDay: 4,
      totalHours: Math.round(totalHoursRemaining),
    };

    // Quality predictions
    const avgCharacterScore = characters?.length 
      ? characters.reduce((sum, c) => sum + (c.pack_completeness_score || 0), 0) / characters.length
      : 0;
    
    const avgLocationScore = locations?.length
      ? locations.reduce((sum, l) => sum + (l.pack_completeness_score || 0), 0) / locations.length
      : 0;

    const successRate = generationLogs?.length 
      ? (generationLogs.filter(l => l.success).length / generationLogs.length) * 100
      : 100;

    // Generate recommendations
    const recommendations: string[] = [];
    
    if (characterCompletion < 50 && stats.characters > 0) {
      recommendations.push('⚠️ Menos del 50% de personajes aprobados. Prioriza completar el Character Pack antes de shots.');
    }
    if (locationCompletion < 50 && stats.locations > 0) {
      recommendations.push('⚠️ Menos del 50% de locaciones aprobadas. Los shots serán inconsistentes.');
    }
    if (stats.characters === 0 && stats.shots > 0) {
      recommendations.push('🚨 No hay personajes definidos pero hay shots. Crea personajes primero.');
    }
    if (avgCharacterScore < 60 && stats.characters > 0) {
      recommendations.push('📊 Los personajes tienen bajo puntaje de completitud. Añade más poses y expresiones.');
    }
    if (successRate < 70) {
      recommendations.push('⚡ Tasa de éxito baja en generaciones. Revisa los prompts y referencias.');
    }
    if (stats.scripts === 0 && stats.scenes > 0) {
      recommendations.push('📝 No hay guiones. Genera un outline para guiar la producción.');
    }

    // Proactive suggestions
    const suggestions: string[] = [];
    
    if (stats.characters === 0) {
      suggestions.push('Empezar creando el personaje principal');
    } else if (characterCompletion < 100) {
      suggestions.push('Completar el Character Pack de personajes existentes');
    }
    
    if (stats.locations === 0 && stats.characters > 0) {
      suggestions.push('Crear la primera locación para establecer el mundo');
    }
    
    if (stats.scripts === 0 && stats.characters > 0 && stats.locations > 0) {
      suggestions.push('Generar un outline del guión');
    }

    if (sceneCompletion < 100 && stats.scripts > 0) {
      suggestions.push('Desglosar el guión en escenas');
    }

    console.log(`[Forge Analytics] Analysis complete for project ${projectId}`);

    return new Response(JSON.stringify({
      projectId,
      projectName: project?.name || 'Unknown',
      stats,
      completion: {
        overall: Math.round((characterCompletion + locationCompletion + sceneCompletion + shotCompletion) / 4),
        characters: characterCompletion,
        locations: locationCompletion,
        scenes: sceneCompletion,
        shots: shotCompletion,
      },
      costs: {
        spent: Math.round(spentSoFar * 100) / 100,
        estimate: {
          low: Math.round(costEstimate.low * 100) / 100,
          expected: Math.round(costEstimate.expected * 100) / 100,
          high: Math.round(costEstimate.high * 100) / 100,
        },
        currency: 'USD',
      },
      time: timeEstimate,
      quality: {
        characterScore: Math.round(avgCharacterScore),
        locationScore: Math.round(avgLocationScore),
        generationSuccessRate: Math.round(successRate),
      },
      recommendations,
      suggestions,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Forge Analytics] Error:', error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
