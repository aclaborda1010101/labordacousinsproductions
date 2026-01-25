import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface QCRequest {
  outline: any;
  targets: {
    protagonists_min: number;
    supporting_min: number;
    extras_min: number;
    locations_min: number;
    hero_props_min: number;
    setpieces_min: number;
    subplots_min: number;
    twists_min: number;
    scenes_per_episode?: number;
    scenes_target?: number;
    dialogue_action_ratio: string;
  };
}

interface QCIssue {
  code: string;
  severity: 'blocker' | 'critical' | 'warning' | 'info';
  message: string;
  current: number;
  required: number;
  fix: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { outline, targets }: QCRequest = await req.json();

    if (!outline || !targets) {
      return new Response(
        JSON.stringify({ error: 'Se requiere outline y targets' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const issues: QCIssue[] = [];
    const counts = outline.counts || {};

    // Check protagonists
    if ((counts.protagonists || 0) < targets.protagonists_min) {
      issues.push({
        code: 'PROTAGONISTS_MISSING',
        severity: 'blocker',
        message: `Faltan protagonistas: ${counts.protagonists || 0}/${targets.protagonists_min}`,
        current: counts.protagonists || 0,
        required: targets.protagonists_min,
        fix: `Añadir ${targets.protagonists_min - (counts.protagonists || 0)} protagonista(s) con arco completo`
      });
    }

    // Check antagonist presence
    const chars = outline.main_characters || outline.cast || [];
    const antagonistCount = chars.filter((c: any) => {
      const role = (c.role || '').toLowerCase();
      return role.includes('antag') || role.includes('villain') || role === 'antagonist';
    }).length;
    
    if (antagonistCount < 1) {
      issues.push({
        code: 'ANTAGONIST_MISSING',
        severity: 'critical',
        message: `Falta antagonista explícito: ${antagonistCount}/1`,
        current: antagonistCount,
        required: 1,
        fix: 'Añadir al menos 1 personaje con role="antagonist" para establecer el conflicto central'
      });
    }

    // Check sequences presence
    const sequences = outline.sequences || [];
    if (sequences.length < 4) {
      issues.push({
        code: 'SEQUENCES_MISSING',
        severity: 'warning',
        message: `Faltan secuencias dramáticas: ${sequences.length}/4`,
        current: sequences.length,
        required: 4,
        fix: `Añadir ${4 - sequences.length} secuencia(s) para agrupar beats en unidades dramáticas`
      });
    }

    // Check supporting
    if ((counts.supporting || 0) < targets.supporting_min) {
      issues.push({
        code: 'SUPPORTING_MISSING',
        severity: 'critical',
        message: `Faltan secundarios: ${counts.supporting || 0}/${targets.supporting_min}`,
        current: counts.supporting || 0,
        required: targets.supporting_min,
        fix: `Añadir ${targets.supporting_min - (counts.supporting || 0)} personaje(s) secundario(s)`
      });
    }

    // Check extras with lines
    if ((counts.extras_with_lines || 0) < targets.extras_min) {
      issues.push({
        code: 'EXTRAS_MISSING',
        severity: 'warning',
        message: `Faltan extras con frase: ${counts.extras_with_lines || 0}/${targets.extras_min}`,
        current: counts.extras_with_lines || 0,
        required: targets.extras_min,
        fix: `Añadir ${targets.extras_min - (counts.extras_with_lines || 0)} extra(s) con diálogo`
      });
    }

    // Check locations
    if ((counts.locations || 0) < targets.locations_min) {
      issues.push({
        code: 'LOCATIONS_MISSING',
        severity: 'critical',
        message: `Faltan localizaciones: ${counts.locations || 0}/${targets.locations_min}`,
        current: counts.locations || 0,
        required: targets.locations_min,
        fix: `Añadir ${targets.locations_min - (counts.locations || 0)} localización(es)`
      });
    }

    // Check hero props
    if ((counts.hero_props || 0) < targets.hero_props_min) {
      issues.push({
        code: 'PROPS_MISSING',
        severity: 'warning',
        message: `Faltan props clave: ${counts.hero_props || 0}/${targets.hero_props_min}`,
        current: counts.hero_props || 0,
        required: targets.hero_props_min,
        fix: `Añadir ${targets.hero_props_min - (counts.hero_props || 0)} prop(s) clave`
      });
    }

    // Check setpieces
    if ((counts.setpieces || 0) < targets.setpieces_min) {
      issues.push({
        code: 'SETPIECES_MISSING',
        severity: 'critical',
        message: `Faltan setpieces: ${counts.setpieces || 0}/${targets.setpieces_min}`,
        current: counts.setpieces || 0,
        required: targets.setpieces_min,
        fix: `Añadir ${targets.setpieces_min - (counts.setpieces || 0)} setpiece(s) espectacular(es)`
      });
    }

    // Check subplots
    if ((counts.subplots || 0) < targets.subplots_min) {
      issues.push({
        code: 'SUBPLOTS_MISSING',
        severity: 'warning',
        message: `Faltan subtramas: ${counts.subplots || 0}/${targets.subplots_min}`,
        current: counts.subplots || 0,
        required: targets.subplots_min,
        fix: `Añadir ${targets.subplots_min - (counts.subplots || 0)} subtrama(s)`
      });
    }

    // Check twists
    if ((counts.twists || 0) < targets.twists_min) {
      issues.push({
        code: 'TWISTS_MISSING',
        severity: 'critical',
        message: `Faltan giros: ${counts.twists || 0}/${targets.twists_min}`,
        current: counts.twists || 0,
        required: targets.twists_min,
        fix: `Añadir ${targets.twists_min - (counts.twists || 0)} giro(s) narrativo(s)`
      });
    }

    // Check scenes
    const targetScenes = targets.scenes_target || (targets.scenes_per_episode ? targets.scenes_per_episode * (outline.episode_outlines?.length || 1) : 40);
    if ((counts.total_scenes || 0) < targetScenes * 0.8) {
      issues.push({
        code: 'SCENES_MISSING',
        severity: 'blocker',
        message: `Escenas insuficientes: ${counts.total_scenes || 0}/${targetScenes}`,
        current: counts.total_scenes || 0,
        required: targetScenes,
        fix: `Desarrollar más escenas para alcanzar el target de ${targetScenes}`
      });
    }

    // Check beat_sheet completeness
    const requiredBeats = ['Opening Image', 'Catalyst', 'Midpoint', 'All Is Lost', 'Finale'];
    const beatNames = (outline.beat_sheet || []).map((b: any) => b.beat);
    const missingBeats = requiredBeats.filter(b => !beatNames.some((bn: string) => bn.includes(b)));
    if (missingBeats.length > 0) {
      issues.push({
        code: 'BEATS_INCOMPLETE',
        severity: 'critical',
        message: `Beats faltantes: ${missingBeats.join(', ')}`,
        current: requiredBeats.length - missingBeats.length,
        required: requiredBeats.length,
        fix: `Añadir beats: ${missingBeats.join(', ')}`
      });
    }

    const passes = issues.filter(i => i.severity === 'blocker' || i.severity === 'critical').length === 0;
    
    // Generate rewrite instructions if fails
    let rewriteInstructions = '';
    if (!passes) {
      const blockers = issues.filter(i => i.severity === 'blocker' || i.severity === 'critical');
      rewriteInstructions = `CORRECCIONES OBLIGATORIAS:\n${blockers.map((b, i) => `${i + 1}. ${b.fix}`).join('\n')}`;
    }

    console.log('QC completed:', passes ? 'PASS' : 'FAIL', 'Issues:', issues.length);

    return new Response(
      JSON.stringify({
        passes,
        issues,
        rewrite_instructions: rewriteInstructions,
        summary: {
          blockers: issues.filter(i => i.severity === 'blocker').length,
          critical: issues.filter(i => i.severity === 'critical').length,
          warnings: issues.filter(i => i.severity === 'warning').length,
          info: issues.filter(i => i.severity === 'info').length
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in script-qc-outline:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
