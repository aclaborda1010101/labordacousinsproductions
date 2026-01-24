/**
 * Apply Showrunner Surgery - Applies approved surgery changes to script
 * 
 * Takes a generation_block ID and updates the script's parsed_json
 * with the rewritten version from the surgery.
 * 
 * Also creates a version history entry before applying changes.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ApplyRequest {
  blockId: string;
  action: "apply" | "reject";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ ok: false, error: "Missing authorization" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ ok: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body: ApplyRequest = await req.json();
    const { blockId, action } = body;

    if (!blockId || !action) {
      return new Response(
        JSON.stringify({ ok: false, error: "blockId and action required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch the surgery block
    const { data: block, error: blockError } = await supabase
      .from("generation_blocks")
      .select("*")
      .eq("id", blockId)
      .eq("block_type", "showrunner_surgery")
      .single();

    if (blockError || !block) {
      return new Response(
        JSON.stringify({ ok: false, error: "Surgery block not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (block.status !== "pending_approval") {
      return new Response(
        JSON.stringify({ ok: false, error: `Invalid block status: ${block.status}. Expected 'pending_approval'` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const scriptId = block.input_context?.scriptId || block.script_id;
    if (!scriptId) {
      return new Response(
        JSON.stringify({ ok: false, error: "No script_id in surgery block" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Handle reject action
    if (action === "reject") {
      await supabase
        .from("generation_blocks")
        .update({ status: "rejected" })
        .eq("id", blockId);

      return new Response(
        JSON.stringify({ ok: true, scriptUpdated: false, action: "rejected" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Handle apply action
    // 1. Fetch the current script
    const { data: script, error: scriptError } = await supabase
      .from("scripts")
      .select("id, parsed_json, raw_text, version, project_id")
      .eq("id", scriptId)
      .single();

    if (scriptError || !script) {
      return new Response(
        JSON.stringify({ ok: false, error: "Script not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Create a version history entry (backup current version)
    const currentVersion = script.version || 1;
    const { data: versionEntry, error: versionError } = await supabase
      .from("script_versions")
      .insert({
        script_id: scriptId,
        version_number: currentVersion,
        parsed_json: script.parsed_json,
        raw_text: script.raw_text,
        created_by: user.id,
        change_reason: "Pre-showrunner-surgery backup"
      })
      .select("id")
      .single();

    // Note: If script_versions table doesn't exist, we continue without versioning
    const previousVersionId = versionEntry?.id || null;
    if (versionError) {
      console.warn("Could not create version entry (table may not exist):", versionError.message);
    }

    // 3. Get rewritten script from surgery block
    const rewrittenScript = block.output_data?.rewritten_script;
    if (!rewrittenScript) {
      return new Response(
        JSON.stringify({ ok: false, error: "No rewritten_script in surgery output" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Update the script with new parsed_json
    const { error: updateError } = await supabase
      .from("scripts")
      .update({
        parsed_json: rewrittenScript,
        version: currentVersion + 1,
        updated_at: new Date().toISOString()
      })
      .eq("id", scriptId);

    if (updateError) {
      return new Response(
        JSON.stringify({ ok: false, error: `Failed to update script: ${updateError.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 5. Update block status to applied
    await supabase
      .from("generation_blocks")
      .update({ status: "applied" })
      .eq("id", blockId);

    // 6. Log decision
    await supabase
      .from("decisions_log")
      .insert({
        project_id: script.project_id || block.project_id,
        entity_type: "script",
        entity_id: scriptId,
        action: "showrunner_surgery_applied",
        user_id: user.id,
        data: {
          blockId,
          previousVersionId,
          scenesModified: block.output_data?.stats?.scenesModified || 0,
          surgeryLevel: block.input_context?.surgeryLevel || "standard"
        }
      });

    return new Response(
      JSON.stringify({
        ok: true,
        scriptUpdated: true,
        action: "applied",
        previousVersionId,
        newVersion: currentVersion + 1
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("apply-showrunner-surgery error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ ok: false, error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
