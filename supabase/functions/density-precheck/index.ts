/**
 * DENSITY PRECHECK EDGE FUNCTION
 * 
 * Validates that an outline meets narrative density requirements
 * BEFORE script generation can proceed.
 * 
 * Returns PASS/FAIL with required_fixes[] if density is insufficient.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { 
  validateDensity, 
  getDensityProfile,
  type DensityProfile,
  type DensityCheckResult 
} from "../_shared/density-validator.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PrecheckRequest {
  projectId: string;
  densityOverrides?: Partial<DensityProfile>;
  formatProfile?: string; // 'serie_drama', 'pelicula_90min', etc.
}

interface PrecheckResponse {
  ok_to_generate: boolean;
  check_result: DensityCheckResult;
  human_summary: string;
  recommendations: string[];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { projectId, densityOverrides, formatProfile }: PrecheckRequest = await req.json();

    if (!projectId) {
      return new Response(
        JSON.stringify({ error: 'projectId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[density-precheck] Starting for project:', projectId);

    // Fetch the project outline
    const { data: outlineData, error: outlineError } = await supabase
      .from('project_outlines')
      .select('outline_json')
      .eq('project_id', projectId)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (outlineError || !outlineData?.outline_json) {
      console.error('[density-precheck] Outline fetch error:', outlineError);
      return new Response(
        JSON.stringify({ 
          error: 'NO_OUTLINE_FOUND',
          message: 'No se encontró un outline completado para este proyecto',
          ok_to_generate: false
        }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Also fetch project format to auto-select density profile
    const { data: projectData } = await supabase
      .from('projects')
      .select('format, episodes_count, narrative_framework')
      .eq('id', projectId)
      .single();

    // Determine density profile
    let profileName = formatProfile || 'serie_drama';
    
    if (projectData?.format) {
      const format = projectData.format.toLowerCase();
      if (format.includes('film') || format.includes('pelicula')) {
        profileName = 'pelicula_90min';
      } else if (format.includes('short') || format.includes('corto')) {
        profileName = 'corto';
      } else if (format.includes('pilot')) {
        profileName = 'piloto';
      } else if (projectData.narrative_framework?.mode?.includes('adictiva')) {
        profileName = 'serie_adictiva';
      }
    }

    const profile = getDensityProfile(profileName, densityOverrides);
    
    console.log('[density-precheck] Using profile:', profileName, profile);

    // Run validation
    const outline = outlineData.outline_json as Record<string, unknown>;
    const checkResult = validateDensity(outline, profile);

    console.log('[density-precheck] Result:', {
      status: checkResult.status,
      score: checkResult.score,
      fixesCount: checkResult.required_fixes.length
    });

    // Build recommendations
    const recommendations: string[] = [];
    
    if (checkResult.status === 'FAIL') {
      recommendations.push('💡 Puedes expandir el outline manualmente o usar "Auto-Reparar Outline"');
      
      if (checkResult.required_fixes.some(f => f.type === 'ADD_CHARACTER')) {
        recommendations.push('👤 Considera añadir personajes con funciones narrativas claras (aliado, mentor, obstáculo)');
      }
      
      if (checkResult.required_fixes.some(f => f.type === 'ADD_LOCATION')) {
        recommendations.push('🏠 Más localizaciones permiten más variedad visual y escenas de transición');
      }
      
      if (checkResult.required_fixes.some(f => f.type === 'ADD_THREAD')) {
        recommendations.push('🧵 Las subtramas permiten escenas de "respiro" y cruces dramáticos');
      }
      
      if (checkResult.required_fixes.some(f => f.type === 'ADD_ANTAGONIST')) {
        recommendations.push('😈 Un antagonista claro da motor al conflicto central');
      }
    } else {
      recommendations.push('✅ El outline está listo para generar un guion denso y rico');
      
      if (checkResult.score >= 90) {
        recommendations.push('🌟 Densidad excelente - el guion debería ser muy completo');
      }
    }

    const response: PrecheckResponse = {
      ok_to_generate: checkResult.status === 'PASS',
      check_result: checkResult,
      human_summary: checkResult.human_summary,
      recommendations
    };

    // Log the check (fire and forget)
    try {
      await supabase.from('editorial_events').insert({
        project_id: projectId,
        event_type: 'density_precheck',
        asset_type: 'outline',
        payload: {
          status: checkResult.status,
          score: checkResult.score,
          fixes_count: checkResult.required_fixes.length,
          profile_used: profileName,
          timestamp: new Date().toISOString()
        }
      });
    } catch { /* ignore */ }

    return new Response(
      JSON.stringify(response),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[density-precheck] Error:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Internal error',
        ok_to_generate: false 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
