import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PreRenderQCRequest {
  projectId: string;
  shotId: string;
  skipValidation?: boolean;
  overrideReason?: string;
}

interface QCBlocker {
  type: 'missing_ref' | 'no_timestamps' | 'no_audio' | 'continuity_violation' | 'incomplete_keyframes' | 'missing_entity_data';
  severity: 'blocker' | 'warning';
  message: string;
  entity_id?: string;
  entity_type?: string;
  entity_name?: string;
  fix_action: string;
  auto_fixable: boolean;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const request: PreRenderQCRequest = await req.json();
    const { projectId, shotId, skipValidation, overrideReason } = request;

    console.log(`Pre-render QC gate for shot ${shotId}`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Emergency override
    if (skipValidation && overrideReason) {
      console.log('Validation override requested:', overrideReason);
      
      await supabase
        .from('pre_render_validations')
        .upsert({
          shot_id: shotId,
          can_render: true,
          checks: {
            required_refs_present: true,
            audio_layers_valid: true,
            timestamps_present: true,
            continuity_locks_valid: true,
            keyframes_complete: true
          },
          blockers: [],
          warnings: [],
          override_validation: true,
          override_reason: overrideReason,
          override_by: 'user',
          override_at: new Date().toISOString()
        }, {
          onConflict: 'shot_id'
        });

      return new Response(JSON.stringify({
        success: true,
        canRender: true,
        overridden: true,
        message: 'Validation overridden by user'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const blockers: QCBlocker[] = [];
    const warnings: QCBlocker[] = [];
    const checks = {
      required_refs_present: false,
      audio_layers_valid: false,
      timestamps_present: false,
      continuity_locks_valid: false,
      keyframes_complete: false
    };

    // ============================================
    // 1. GET SHOT DATA
    // ============================================
    const { data: shot, error: shotError } = await supabase
      .from('shots')
      .select('*, keyframes(*)')
      .eq('id', shotId)
      .single();

    if (shotError || !shot) {
      throw new Error('Shot not found');
    }

    // Get audio layer separately
    let audioLayer = null;
    if (shot.audio_layer_id) {
      const { data } = await supabase
        .from('audio_layers')
        .select('*')
        .eq('id', shot.audio_layer_id)
        .single();
      audioLayer = data;
    }

    const fieldsJson = shot.fields_json || {};

    // ============================================
    // 2. CHECK REQUIRED REFERENCE SLOTS
    // ============================================
    const charactersUsed = fieldsJson.characters_used || [];
    const locationsUsed = fieldsJson.locations_used || [];
    const propsUsed = fieldsJson.props_used || [];

    let allRefsPresent = true;

    // Check characters
    for (const charUsed of charactersUsed) {
      const { data: character } = await supabase
        .from('characters')
        .select('id, name, pack_completeness_score')
        .eq('id', charUsed.id)
        .single();

      if (!character) {
        blockers.push({
          type: 'missing_entity_data',
          severity: 'blocker',
          message: `Character ${charUsed.id} not found`,
          entity_id: charUsed.id,
          entity_type: 'character',
          fix_action: 'Remove character from shot or create character',
          auto_fixable: false
        });
        allRefsPresent = false;
        continue;
      }

      const completeness = character.pack_completeness_score || 0;
      if (completeness < 50) {
        blockers.push({
          type: 'missing_ref',
          severity: 'blocker',
          message: `Character "${character.name}" pack is only ${completeness}% complete. Required: 50%+`,
          entity_id: character.id,
          entity_type: 'character',
          entity_name: character.name,
          fix_action: 'Complete character pack: upload or generate required reference slots',
          auto_fixable: false
        });
        allRefsPresent = false;
      }
    }

    // Check locations
    for (const locUsed of locationsUsed) {
      const { data: location } = await supabase
        .from('locations')
        .select('id, name')
        .eq('id', locUsed.id)
        .single();

      if (!location) {
        blockers.push({
          type: 'missing_entity_data',
          severity: 'blocker',
          message: `Location ${locUsed.id} not found`,
          entity_id: locUsed.id,
          entity_type: 'location',
          fix_action: 'Remove location from shot or create location',
          auto_fixable: false
        });
        allRefsPresent = false;
        continue;
      }

      const { data: locationSlots } = await supabase
        .from('location_pack_slots')
        .select('id, required, status')
        .eq('location_id', location.id);

      const requiredSlots = locationSlots?.filter(s => s.required) || [];
      const approvedSlots = requiredSlots.filter(s => s.status === 'approved');

      if (requiredSlots.length > 0 && approvedSlots.length < requiredSlots.length) {
        blockers.push({
          type: 'missing_ref',
          severity: 'blocker',
          message: `Location "${location.name}" has ${requiredSlots.length - approvedSlots.length} required slots not approved`,
          entity_id: location.id,
          entity_type: 'location',
          entity_name: location.name,
          fix_action: 'Complete location pack: upload or generate required reference images',
          auto_fixable: false
        });
        allRefsPresent = false;
      }
    }

    // Check props
    for (const propUsed of propsUsed) {
      const { data: prop } = await supabase
        .from('props')
        .select('id, name')
        .eq('id', propUsed.id)
        .single();

      if (!prop) {
        blockers.push({
          type: 'missing_entity_data',
          severity: 'blocker',
          message: `Prop ${propUsed.id} not found`,
          entity_id: propUsed.id,
          entity_type: 'prop',
          fix_action: 'Remove prop from shot or create prop',
          auto_fixable: false
        });
        allRefsPresent = false;
      }
    }

    checks.required_refs_present = allRefsPresent;

    // ============================================
    // 3. CHECK AUDIO LAYERS
    // ============================================
    if (!shot.audio_layer_id || !audioLayer) {
      blockers.push({
        type: 'no_audio',
        severity: 'blocker',
        message: 'Shot has no audio layers defined',
        fix_action: 'Generate audio design for this shot (room tone + 2+ ambience + 2+ foley)',
        auto_fixable: true
      });
      checks.audio_layers_valid = false;
    } else {
      const ambienceCount = Array.isArray(audioLayer.ambience_layers) ? audioLayer.ambience_layers.length : 0;
      const foleyCount = Array.isArray(audioLayer.foley_layers) ? audioLayer.foley_layers.length : 0;

      if (ambienceCount < 2) {
        blockers.push({
          type: 'no_audio',
          severity: 'blocker',
          message: `Audio has only ${ambienceCount} ambience layer(s). Required: 2+`,
          fix_action: 'Add more ambience layers to audio design',
          auto_fixable: true
        });
        checks.audio_layers_valid = false;
      }

      if (foleyCount < 2) {
        blockers.push({
          type: 'no_audio',
          severity: 'blocker',
          message: `Audio has only ${foleyCount} foley layer(s). Required: 2+`,
          fix_action: 'Add more foley layers to audio design',
          auto_fixable: true
        });
        checks.audio_layers_valid = false;
      }

      if (!audioLayer.room_tone || Object.keys(audioLayer.room_tone).length === 0) {
        blockers.push({
          type: 'no_audio',
          severity: 'blocker',
          message: 'Audio has no room tone defined',
          fix_action: 'Define room tone for this shot',
          auto_fixable: true
        });
        checks.audio_layers_valid = false;
      }

      if (ambienceCount >= 2 && foleyCount >= 2 && audioLayer.room_tone) {
        checks.audio_layers_valid = true;
      }
    }

    // ============================================
    // 4. CHECK BLOCKING TIMESTAMPS
    // ============================================
    const blockingTimestamps = shot.blocking_timestamps || [];
    
    if (!Array.isArray(blockingTimestamps) || blockingTimestamps.length === 0) {
      blockers.push({
        type: 'no_timestamps',
        severity: 'blocker',
        message: 'Shot has no blocking timestamps defined',
        fix_action: 'Define action timestamps: [{ time: "0.0s", action: "..." }]',
        auto_fixable: false
      });
      checks.timestamps_present = false;
    } else {
      checks.timestamps_present = true;
    }

    // ============================================
    // 5. CHECK CONTINUITY LOCKS
    // ============================================
    try {
      const continuityResponse = await fetch(`${supabaseUrl}/functions/v1/validate-continuity-locks`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectId,
          shotId
        })
      });

      if (continuityResponse.ok) {
        const continuityResult = await continuityResponse.json();
        
        if (!continuityResult.canRender) {
          for (const violation of continuityResult.blockers || []) {
            blockers.push({
              type: 'continuity_violation',
              severity: 'blocker',
              message: `Continuity violation: ${violation.entity_name} - ${violation.locked_field}`,
              entity_id: violation.entity_id,
              entity_type: violation.entity_type,
              entity_name: violation.entity_name,
              fix_action: violation.fix_action,
              auto_fixable: false
            });
          }
          checks.continuity_locks_valid = false;
        } else {
          checks.continuity_locks_valid = true;
        }

        for (const warning of continuityResult.warnings || []) {
          warnings.push({
            type: 'continuity_violation',
            severity: 'warning',
            message: `Continuity warning: ${warning.entity_name} - ${warning.locked_field}`,
            entity_id: warning.entity_id,
            entity_type: warning.entity_type,
            entity_name: warning.entity_name,
            fix_action: warning.fix_action,
            auto_fixable: false
          });
        }
      } else {
        console.warn('Continuity check failed, assuming OK');
        checks.continuity_locks_valid = true;
      }
    } catch (e) {
      console.error('Continuity check error:', e);
      checks.continuity_locks_valid = true;
    }

    // ============================================
    // 6. CHECK KEYFRAMES
    // ============================================
    const keyframes = shot.keyframes || [];
    
    if (keyframes.length === 0) {
      warnings.push({
        type: 'incomplete_keyframes',
        severity: 'warning',
        message: 'Shot has no keyframes defined. Recommended: at least start and end keyframes',
        fix_action: 'Add keyframes to shot for better control',
        auto_fixable: false
      });
      checks.keyframes_complete = false;
    } else {
      const hasStart = keyframes.some((kf: any) => kf.frame_type === 'start' || kf.timestamp_sec === 0);
      const hasEnd = keyframes.some((kf: any) => kf.frame_type === 'end');

      if (!hasStart || !hasEnd) {
        warnings.push({
          type: 'incomplete_keyframes',
          severity: 'warning',
          message: `Shot missing ${!hasStart ? 'start' : ''} ${!hasEnd ? 'end' : ''} keyframe(s)`,
          fix_action: 'Add missing keyframes',
          auto_fixable: false
        });
        checks.keyframes_complete = false;
      } else {
        checks.keyframes_complete = true;
      }
    }

    // ============================================
    // 7. DETERMINE IF CAN RENDER
    // ============================================
    const canRender = blockers.length === 0;

    // Save validation result
    const { error: upsertError } = await supabase
      .from('pre_render_validations')
      .upsert({
        shot_id: shotId,
        can_render: canRender,
        checks,
        blockers: blockers.map(b => ({
          type: b.type,
          severity: b.severity,
          message: b.message,
          entity_id: b.entity_id,
          entity_type: b.entity_type,
          entity_name: b.entity_name,
          fix_action: b.fix_action,
          auto_fixable: b.auto_fixable
        })),
        warnings: warnings.map(w => ({
          type: w.type,
          severity: w.severity,
          message: w.message,
          entity_id: w.entity_id,
          entity_type: w.entity_type,
          entity_name: w.entity_name,
          fix_action: w.fix_action
        })),
        validated_at: new Date().toISOString()
      }, {
        onConflict: 'shot_id'
      });

    if (upsertError) {
      console.error('Error saving validation:', upsertError);
    }

    // Update shot validation status
    await supabase
      .from('shots')
      .update({
        validation_status: canRender ? 'passed' : 'failed'
      })
      .eq('id', shotId);

    console.log(`QC Gate: ${canRender ? 'PASSED' : 'FAILED'} (${blockers.length} blockers, ${warnings.length} warnings)`);

    return new Response(JSON.stringify({
      success: true,
      canRender,
      checks,
      blockers,
      warnings,
      summary: {
        total_blockers: blockers.length,
        total_warnings: warnings.length,
        auto_fixable_blockers: blockers.filter(b => b.auto_fixable).length
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Pre-render QC error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
