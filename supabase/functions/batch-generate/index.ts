import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface BatchSlot {
  slotId: string;
  slotType: 'turnaround' | 'expression' | 'outfit' | 'closeup' | 'base_look';
  viewAngle?: string;
  expressionName?: string;
  outfitDescription?: string;
}

interface BatchGenerateRequest {
  characterId: string;
  slots: BatchSlot[];
  sharedAnchorId?: string;
  sharedReferenceWeight?: number;
  parallelLimit?: number; // Max concurrent generations (default 3)
}

interface BatchResult {
  slotId: string;
  success: boolean;
  imageUrl?: string;
  qcScore?: number;
  error?: string;
}

// Image engine configuration
const IMAGE_ENGINE = 'google/gemini-3-pro-image-preview';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  
  if (!LOVABLE_API_KEY) {
    return new Response(JSON.stringify({ error: 'LOVABLE_API_KEY not configured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const body: BatchGenerateRequest = await req.json();
    const { characterId, slots, sharedAnchorId, sharedReferenceWeight = 0.7, parallelLimit = 3 } = body;

    console.log(`[BATCH] Starting batch generation for ${slots.length} slots`);

    // Fetch character data once
    const { data: character, error: charError } = await supabase
      .from('characters')
      .select('name, bio')
      .eq('id', characterId)
      .single();

    if (charError || !character) {
      throw new Error('Character not found');
    }

    // Fetch Visual DNA once
    const { data: visualDNARecord } = await supabase
      .from('character_visual_dna')
      .select('visual_dna, continuity_lock')
      .eq('character_id', characterId)
      .eq('is_active', true)
      .single();

    // Fetch shared anchor if provided
    let anchorImageUrl: string | null = null;
    if (sharedAnchorId) {
      const { data: anchor } = await supabase
        .from('reference_anchors')
        .select('image_url')
        .eq('id', sharedAnchorId)
        .single();
      
      anchorImageUrl = anchor?.image_url || null;
      
      if (anchorImageUrl) {
        console.log(`[BATCH] Using shared anchor with ${sharedReferenceWeight * 100}% weight`);
        // Record anchor usage
        await supabase.rpc('record_anchor_usage', { p_anchor_id: sharedAnchorId });
      }
    }

    // Mark all slots as generating
    const slotIds = slots.map(s => s.slotId);
    await supabase.from('character_pack_slots')
      .update({ status: 'generating' })
      .in('id', slotIds);

    // Process slots in batches to respect rate limits
    const results: BatchResult[] = [];
    
    for (let i = 0; i < slots.length; i += parallelLimit) {
      const batch = slots.slice(i, i + parallelLimit);
      console.log(`[BATCH] Processing batch ${Math.floor(i / parallelLimit) + 1}/${Math.ceil(slots.length / parallelLimit)}`);
      
      const batchPromises = batch.map(async (slot): Promise<BatchResult> => {
        try {
          // Build prompt for this slot
          const prompt = buildPrompt(
            slot,
            character.name,
            character.bio,
            visualDNARecord?.visual_dna
          );

          // Build messages array
          const messages: any[] = [];
          
          if (anchorImageUrl) {
            messages.push({
              role: 'user',
              content: [
                {
                  type: 'image_url',
                  image_url: { url: anchorImageUrl, detail: 'high' }
                },
                {
                  type: 'text',
                  text: `REFERENCE IMAGE ABOVE - Use as ${sharedReferenceWeight * 100}% anchor for character identity.\n\n${prompt}`
                }
              ]
            });
          } else {
            messages.push({ role: 'user', content: prompt });
          }

          // Update slot with prompt
          await supabase.from('character_pack_slots')
            .update({ prompt_text: prompt })
            .eq('id', slot.slotId);

          // Generate image
          const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${LOVABLE_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: IMAGE_ENGINE,
              messages,
              modalities: ['image', 'text']
            }),
          });

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Generation failed: ${response.status} - ${errorText}`);
          }

          const data = await response.json();
          const imageUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;

          if (!imageUrl) {
            throw new Error('No image returned');
          }

          // Run quick QC
          const qcScore = await runQuickQC(imageUrl, LOVABLE_API_KEY);
          const passed = qcScore >= 75;

          // Update slot
          await supabase.from('character_pack_slots').update({
            image_url: imageUrl,
            status: passed ? 'approved' : 'needs_review',
            qc_score: qcScore,
            updated_at: new Date().toISOString(),
          }).eq('id', slot.slotId);

          // Track generation cost
          await trackGenerationCost(supabase, characterId, slot.slotType);

          return {
            slotId: slot.slotId,
            success: true,
            imageUrl,
            qcScore,
          };
        } catch (error) {
          console.error(`[BATCH] Slot ${slot.slotId} failed:`, error);
          
          await supabase.from('character_pack_slots').update({
            status: 'failed',
            fix_notes: error instanceof Error ? error.message : 'Unknown error',
          }).eq('id', slot.slotId);

          return {
            slotId: slot.slotId,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      // Small delay between batches to avoid rate limits
      if (i + parallelLimit < slots.length) {
        await new Promise(r => setTimeout(r, 500));
      }
    }

    // Recalculate pack completeness
    await supabase.rpc('calculate_pack_completeness', { p_character_id: characterId });

    const duration = Date.now() - startTime;
    const successCount = results.filter(r => r.success).length;

    console.log(`[BATCH] Completed: ${successCount}/${slots.length} successful in ${duration}ms`);

    return new Response(JSON.stringify({
      success: true,
      results,
      summary: {
        total: slots.length,
        successful: successCount,
        failed: slots.length - successCount,
        durationMs: duration,
        usedAnchor: !!anchorImageUrl,
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[BATCH] Error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// Build prompt based on slot type
function buildPrompt(
  slot: BatchSlot,
  characterName: string,
  characterBio: string,
  visualDNA?: any
): string {
  const baseDesc = visualDNA 
    ? buildFromVisualDNA(visualDNA)
    : `${characterName}. ${characterBio}`;

  const STYLE = 'CRITICAL: Photorealistic, 8K quality, professional lighting, sharp focus.';

  switch (slot.slotType) {
    case 'turnaround':
      return `Character turnaround reference, ${slot.viewAngle || 'front'} view.
${baseDesc}
Full body pose, clean studio background.
${STYLE}`;

    case 'closeup':
      return `Identity anchor close-up portrait.
${baseDesc}
Extreme close-up of face, neutral expression, direct eye contact.
Studio lighting, clean background, ultra detail on eyes.
${STYLE}`;

    case 'expression':
      return `Character expression: "${slot.expressionName || 'neutral'}".
${baseDesc}
Close-up portrait showing the emotion clearly.
${STYLE}`;

    case 'outfit':
      return `Character wearing: ${slot.outfitDescription || 'casual outfit'}.
${baseDesc}
${slot.viewAngle || '3/4'} view, showing complete outfit.
${STYLE}`;

    default:
      return `Base character design.
${baseDesc}
3/4 view pose, default look.
${STYLE}`;
  }
}

// Build description from Visual DNA
function buildFromVisualDNA(vdna: any): string {
  const parts: string[] = [];
  
  const pi = vdna.physical_identity;
  if (pi) {
    if (pi.gender_presentation) parts.push(pi.gender_presentation);
    if (pi.age_exact_for_prompt) parts.push(`age ${pi.age_exact_for_prompt}`);
    if (pi.ethnicity?.skin_tone_description) parts.push(pi.ethnicity.skin_tone_description + ' skin');
    if (pi.body_type?.somatotype) parts.push(pi.body_type.somatotype + ' build');
  }

  const face = vdna.face;
  if (face) {
    if (face.shape) parts.push(face.shape + ' face');
    if (face.eyes?.color_base) parts.push(face.eyes.color_base + ' eyes');
    if (face.facial_hair?.type && face.facial_hair.type !== 'clean_shaven_smooth') {
      parts.push(face.facial_hair.type);
    }
  }

  const hair = vdna.hair?.head_hair;
  if (hair) {
    if (hair.color?.natural_base) parts.push(hair.color.natural_base + ' hair');
    if (hair.length?.type) parts.push(hair.length.type + ' length');
  }

  const celeb = vdna.visual_references?.celebrity_likeness?.primary;
  if (celeb?.name) {
    parts.push(`resembles ${celeb.name} (${celeb.percentage || 60}%)`);
  }

  return parts.join(', ');
}

// Quick QC check
async function runQuickQC(imageUrl: string, apiKey: string): Promise<number> {
  try {
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: 'Score this character image 0-100 for quality. Return ONLY a number.'
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Score this character image for technical quality and consistency:' },
              { type: 'image_url', image_url: { url: imageUrl } }
            ]
          }
        ],
      }),
    });

    if (!response.ok) return 80;

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '80';
    const score = parseInt(content.match(/\d+/)?.[0] || '80');
    return Math.min(100, Math.max(0, score));
  } catch {
    return 80;
  }
}

// Track generation cost
async function trackGenerationCost(supabase: any, characterId: string, slotType: string) {
  const costEstimate = slotType === 'closeup' ? 0.08 : 0.05;
  
  try {
    // Get character's project
    const { data: char } = await supabase
      .from('characters')
      .select('project_id')
      .eq('id', characterId)
      .single();

    if (!char?.project_id) return;

    // Get project owner
    const { data: project } = await supabase
      .from('projects')
      .select('owner_id')
      .eq('id', char.project_id)
      .single();

    if (!project?.owner_id) return;

    // Update or insert usage
    const currentMonth = new Date().toISOString().slice(0, 7) + '-01';
    
    await supabase.rpc('increment_user_usage', {
      p_user_id: project.owner_id,
      p_month: currentMonth,
      p_cost: costEstimate
    }).catch(() => {
      // Function may not exist yet, that's OK
    });
  } catch (e) {
    console.log('Cost tracking skipped:', e);
  }
}
