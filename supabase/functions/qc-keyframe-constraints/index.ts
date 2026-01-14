import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface QCRequest {
  keyframe_id: string;
  shot_id?: string;
}

interface ConstraintViolation {
  lock: string;
  status: 'ok' | 'violated' | 'uncertain';
  notes: string;
}

interface ConstraintQCResult {
  constraint_score: number;
  violations: ConstraintViolation[];
  needs_regen: boolean;
  qc_status: 'passed' | 'constraint_fail' | 'pending';
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    const { keyframe_id, shot_id }: QCRequest = await req.json();

    if (!keyframe_id) {
      return new Response(
        JSON.stringify({ error: "Missing keyframe_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch keyframe
    const { data: keyframe, error: kfError } = await supabase
      .from("keyframes")
      .select("*, shot_id")
      .eq("id", keyframe_id)
      .single();

    if (kfError || !keyframe) {
      return new Response(
        JSON.stringify({ error: "Keyframe not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch shot with constraints
    const { data: shot, error: shotError } = await supabase
      .from("shots")
      .select("constraints, lighting, camera, blocking")
      .eq("id", keyframe.shot_id)
      .single();

    if (shotError || !shot) {
      return new Response(
        JSON.stringify({ error: "Shot not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const constraints = shot.constraints || {};
    const mustKeep = constraints.must_keep || [];
    const mustNot = constraints.must_not || [];

    // If no constraints, auto-pass
    if (mustKeep.length === 0 && mustNot.length === 0) {
      const result: ConstraintQCResult = {
        constraint_score: 1.0,
        violations: [],
        needs_regen: false,
        qc_status: 'passed'
      };

      await supabase
        .from("keyframes")
        .update({ 
          constraint_qc: result,
          qc_status: 'passed'
        })
        .eq("id", keyframe_id);

      return new Response(
        JSON.stringify({ success: true, result }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use Vision AI to validate constraints
    const imageUrl = keyframe.image_url;
    
    // Build validation prompt
    const constraintChecks = [
      ...mustKeep.map((lock: string) => `MUST MAINTAIN: ${lock.replace(/_/g, ' ')}`),
      ...mustNot.map((lock: string) => `MUST NOT HAVE: ${lock.replace(/_/g, ' ')}`)
    ].join('\n');

    const validationPrompt = `You are a visual QC inspector for a film production pipeline.

Analyze this keyframe image and validate if the following continuity constraints are respected:

${constraintChecks}

Also check for these technical aspects from the shot spec:
- Lighting look: ${shot.lighting?.look || 'not specified'}
- Camera type: ${shot.camera?.type || 'not specified'}

For each constraint, respond with:
- "OK" if the constraint is respected
- "VIOLATED" if the constraint is clearly broken
- "UNCERTAIN" if you cannot determine with confidence

Respond in this exact JSON format:
{
  "violations": [
    { "lock": "constraint_name", "status": "ok|violated|uncertain", "notes": "brief explanation" }
  ],
  "overall_score": 0.0-1.0,
  "needs_regeneration": true|false,
  "summary": "brief summary"
}`;

    console.log(`[qc-keyframe-constraints] Validating keyframe ${keyframe_id} with ${mustKeep.length + mustNot.length} constraints`);

    const visionResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        max_completion_tokens: 1000,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: validationPrompt
              },
              {
                type: "image_url",
                image_url: { url: imageUrl }
              }
            ]
          }
        ]
      }),
    });

    if (!visionResponse.ok) {
      const errorText = await visionResponse.text();
      console.error(`[qc-keyframe-constraints] Vision API error:`, errorText);
      
      // Mark as pending for manual review
      await supabase
        .from("keyframes")
        .update({ qc_status: 'pending' })
        .eq("id", keyframe_id);

      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "Vision API failed",
          qc_status: 'pending'
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const visionData = await visionResponse.json();
    const content = visionData.choices?.[0]?.message?.content || '';
    
    // Parse JSON from response
    let qcResult: any;
    try {
      // Extract JSON from markdown code blocks if present
      const jsonMatch = content.match(/```json?\s*([\s\S]*?)\s*```/) || 
                        content.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : content;
      qcResult = JSON.parse(jsonStr);
    } catch (parseErr) {
      console.error(`[qc-keyframe-constraints] Failed to parse QC response:`, content);
      qcResult = {
        violations: [],
        overall_score: 0.5,
        needs_regeneration: false,
        summary: "Could not parse QC response - manual review needed"
      };
    }

    // Determine QC status based on violations
    const hasViolations = qcResult.violations?.some((v: any) => v.status === 'violated');
    const qcStatus = hasViolations ? 'constraint_fail' : 'passed';

    const result: ConstraintQCResult = {
      constraint_score: qcResult.overall_score || (hasViolations ? 0.5 : 0.9),
      violations: qcResult.violations || [],
      needs_regen: qcResult.needs_regeneration || hasViolations,
      qc_status: qcStatus
    };

    // Update keyframe with QC results
    await supabase
      .from("keyframes")
      .update({ 
        constraint_qc: result,
        qc_status: qcStatus
      })
      .eq("id", keyframe_id);

    console.log(`[qc-keyframe-constraints] QC complete for keyframe ${keyframe_id}: ${qcStatus}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        result,
        summary: qcResult.summary
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[qc-keyframe-constraints] Error:", error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Unknown error",
        success: false 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
