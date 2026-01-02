import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ValidateContinuityRequest {
  projectId: string;
  shotId: string;
  proposedData?: {
    characters_used: Array<{
      id: string;
      outfit_id?: string;
      proposed_changes?: any;
    }>;
    locations_used: Array<{
      id: string;
      proposed_changes?: any;
    }>;
    props_used: Array<{
      id: string;
      proposed_changes?: any;
    }>;
  };
}

interface ContinuityViolation {
  entity_type: string;
  entity_id: string;
  entity_name: string;
  locked_field: string;
  expected_value: any;
  attempted_value: any;
  violation_type: 'never_change' | 'must_avoid' | 'allowed_variants_exceeded';
  severity: 'blocker' | 'warning' | 'info';
  fix_action: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const request: ValidateContinuityRequest = await req.json();
    const { projectId, shotId, proposedData } = request;

    console.log(`Validating continuity for shot ${shotId}`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const violations: ContinuityViolation[] = [];
    let canRender = true;

    // Get shot details
    const { data: shot, error: shotError } = await supabase
      .from('shots')
      .select('*, scenes!inner(*)')
      .eq('id', shotId)
      .single();

    if (shotError || !shot) {
      throw new Error('Shot not found');
    }

    // Get entities used in shot
    let charactersUsed: any[] = [];
    let locationsUsed: any[] = [];
    let propsUsed: any[] = [];

    if (proposedData) {
      charactersUsed = proposedData.characters_used || [];
      locationsUsed = proposedData.locations_used || [];
      propsUsed = proposedData.props_used || [];
    } else {
      const fieldsJson = shot.fields_json || {};
      charactersUsed = fieldsJson.characters_used || [];
      locationsUsed = fieldsJson.locations_used || [];
      propsUsed = fieldsJson.props_used || [];
    }

    console.log(`Checking ${charactersUsed.length} characters, ${locationsUsed.length} locations, ${propsUsed.length} props`);

    // ============================================
    // VALIDATE CHARACTERS
    // ============================================
    for (const charUsed of charactersUsed) {
      const { data: character } = await supabase
        .from('characters')
        .select('*, character_outfits(*)')
        .eq('id', charUsed.id)
        .single();

      if (!character) continue;

      // Get continuity lock
      const { data: lock } = await supabase
        .from('continuity_locks')
        .select('*')
        .eq('entity_type', 'character')
        .eq('entity_id', character.id)
        .maybeSingle();

      if (!lock) continue;

      const neverChange = lock.never_change || {};
      const mustAvoid = lock.must_avoid || {};

      // Check profile_json fields against never_change
      if (character.profile_json && neverChange && typeof neverChange === 'object') {
        for (const [field, expectedValue] of Object.entries(neverChange)) {
          if (charUsed.proposed_changes && charUsed.proposed_changes[field]) {
            const attemptedValue = charUsed.proposed_changes[field];
            
            if (JSON.stringify(attemptedValue) !== JSON.stringify(expectedValue)) {
              violations.push({
                entity_type: 'character',
                entity_id: character.id,
                entity_name: character.name,
                locked_field: field,
                expected_value: expectedValue,
                attempted_value: attemptedValue,
                violation_type: 'never_change',
                severity: 'blocker',
                fix_action: `Revert ${field} to locked value: ${JSON.stringify(expectedValue)}`
              });
              canRender = false;
            }
          }
        }
      }

      // Check outfit usage
      if (charUsed.outfit_id) {
        const outfit = character.character_outfits?.find((o: any) => o.id === charUsed.outfit_id);
        
        if (!outfit) {
          violations.push({
            entity_type: 'character',
            entity_id: character.id,
            entity_name: character.name,
            locked_field: 'outfit',
            expected_value: 'valid outfit',
            attempted_value: charUsed.outfit_id,
            violation_type: 'never_change',
            severity: 'blocker',
            fix_action: 'Select a valid outfit from character outfits'
          });
          canRender = false;
        }
      }

      // Check must_avoid
      if (charUsed.proposed_changes && mustAvoid && typeof mustAvoid === 'object') {
        for (const [field, avoidValues] of Object.entries(mustAvoid)) {
          if (charUsed.proposed_changes[field]) {
            const attemptedValue = charUsed.proposed_changes[field];
            const avoidList = Array.isArray(avoidValues) ? avoidValues : [avoidValues];
            
            if (avoidList.some(av => JSON.stringify(av) === JSON.stringify(attemptedValue))) {
              violations.push({
                entity_type: 'character',
                entity_id: character.id,
                entity_name: character.name,
                locked_field: field,
                expected_value: `not in ${JSON.stringify(avoidList)}`,
                attempted_value: attemptedValue,
                violation_type: 'must_avoid',
                severity: 'warning',
                fix_action: `Change ${field} to avoid forbidden values`
              });
            }
          }
        }
      }
    }

    // ============================================
    // VALIDATE LOCATIONS
    // ============================================
    for (const locUsed of locationsUsed) {
      const { data: location } = await supabase
        .from('locations')
        .select('*')
        .eq('id', locUsed.id)
        .single();

      if (!location) continue;

      const { data: lock } = await supabase
        .from('continuity_locks')
        .select('*')
        .eq('entity_type', 'location')
        .eq('entity_id', location.id)
        .maybeSingle();

      if (!lock) continue;

      const neverChange = lock.never_change || {};

      if (location.profile_json && neverChange && typeof neverChange === 'object') {
        for (const [field, expectedValue] of Object.entries(neverChange)) {
          if (locUsed.proposed_changes && locUsed.proposed_changes[field]) {
            const attemptedValue = locUsed.proposed_changes[field];
            
            if (JSON.stringify(attemptedValue) !== JSON.stringify(expectedValue)) {
              violations.push({
                entity_type: 'location',
                entity_id: location.id,
                entity_name: location.name,
                locked_field: field,
                expected_value: expectedValue,
                attempted_value: attemptedValue,
                violation_type: 'never_change',
                severity: 'blocker',
                fix_action: `Revert ${field} to locked value`
              });
              canRender = false;
            }
          }
        }
      }
    }

    // ============================================
    // VALIDATE PROPS
    // ============================================
    for (const propUsed of propsUsed) {
      const { data: prop } = await supabase
        .from('props')
        .select('*')
        .eq('id', propUsed.id)
        .single();

      if (!prop) continue;

      const { data: lock } = await supabase
        .from('continuity_locks')
        .select('*')
        .eq('entity_type', 'prop')
        .eq('entity_id', prop.id)
        .maybeSingle();

      if (!lock) continue;

      const neverChange = lock.never_change || {};

      if (prop.profile_json && neverChange && typeof neverChange === 'object') {
        for (const [field, expectedValue] of Object.entries(neverChange)) {
          if (propUsed.proposed_changes && propUsed.proposed_changes[field]) {
            const attemptedValue = propUsed.proposed_changes[field];
            
            if (JSON.stringify(attemptedValue) !== JSON.stringify(expectedValue)) {
              violations.push({
                entity_type: 'prop',
                entity_id: prop.id,
                entity_name: prop.name,
                locked_field: field,
                expected_value: expectedValue,
                attempted_value: attemptedValue,
                violation_type: 'never_change',
                severity: 'blocker',
                fix_action: `Revert ${field} to locked value`
              });
              canRender = false;
            }
          }
        }
      }
    }

    // Save violations to DB if any blockers
    if (violations.length > 0) {
      const violationsToInsert = violations
        .filter(v => v.severity === 'blocker')
        .map(v => ({
          project_id: projectId,
          shot_id: shotId,
          entity_type: v.entity_type,
          entity_id: v.entity_id,
          entity_name: v.entity_name,
          locked_field: v.locked_field,
          expected_value: JSON.stringify(v.expected_value),
          attempted_value: JSON.stringify(v.attempted_value),
          violation_type: v.violation_type,
          severity: v.severity,
          status: 'pending'
        }));

      if (violationsToInsert.length > 0) {
        const { error: insertError } = await supabase
          .from('continuity_violations')
          .insert(violationsToInsert);
        
        if (insertError) {
          console.error('Error saving violations:', insertError);
        }
      }
    }

    console.log(`Continuity validation complete: ${violations.length} violations, canRender: ${canRender}`);

    return new Response(JSON.stringify({
      success: true,
      canRender,
      violations,
      blockers: violations.filter(v => v.severity === 'blocker'),
      warnings: violations.filter(v => v.severity === 'warning'),
      info: violations.filter(v => v.severity === 'info')
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Continuity validation error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
