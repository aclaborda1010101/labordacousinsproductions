/**
 * Showrunner Surgery - Dramatic improvement of Episode 1 (V2 - Async with Persistence)
 * 
 * Applies 5 non-negotiable rules to strengthen dramaturgy:
 * 1. Preserve tone and voice
 * 2. Early direct consequence (Scene 2)
 * 3. Morally dirty decision (before midpoint)
 * 4. Action over warning
 * 5. Point of no return ending
 * 
 * V2 Changes:
 * - Creates a generation_block with status 'processing' immediately
 * - Returns blockId for frontend polling
 * - Updates block to 'pending_approval' when AI completes
 * - Supports recovery of pending results
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { aiFetch } from "../_shared/ai-fetch.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const AI_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

const SHOWRUNNER_SURGERY_SYSTEM = `Actúa como showrunner y guionista senior de series.
Tu misión NO es reescribir desde cero ni cambiar el estilo, sino FORTALECER LA DRAMATURGIA.

## REGLAS NO NEGOCIABLES

1. NO CAMBIAR TONO NI VOZ
   - Mantener estilo de diálogos, subtexto y atmósfera
   - No simplificar ni hacer texto más explicativo
   - No eliminar metáfora ni ambigüedad moral

2. CONSECUENCIA DIRECTA TEMPRANA (Escena 2)
   - Primera intervención con la ventana: consecuencia que afecte a protagonista
   - NO puede recaer solo en tercero secundario
   - Debe generar punto de no retorno (pérdida personal, señalamiento, daño irreversible)

3. DECISIÓN MORALMENTE SUCIA (antes de mitad del episodio)
   - Un protagonista decide conscientemente algo sabiendo el coste
   - NO vale accidente ni malentendido
   - La decisión define el ADN de la serie: "quién paga"

4. REDUCIR ADVERTENCIA, AUMENTAR ACCIÓN
   - Sustituir reflexión previa por acción con consecuencias
   - La ventana debe "romper" escenas, no solo ser observada
   - Si una escena solo habla del riesgo pero no lo ejecuta: apretarla

5. FINAL CON PUNTO DE NO RETORNO
   Una de estas promesas (elegir UNA):
   - La ventana ya no se puede cerrar
   - Alguien externo sabe que existe
   - El precio empieza a cobrarse en ellos
   - Uno cruza línea que no puede descruzar

## LÍMITES
- NO añadir personajes nuevos importantes
- NO introducir reglas nuevas del artefacto
- NO convertir el episodio en exposición
- NO cerrar arcos que deben vivir en la serie

## FORMATO DE RESPUESTA JSON
{
  "scene_changes": [
    {
      "scene_number": 1,
      "change_summary": "string (1-2 líneas)",
      "change_type": "consequence" | "dirty_decision" | "action_over_reflection" | "no_return_point" | "tone_preserved",
      "original_excerpt": "string (opcional, fragmento clave del original)",
      "revised_excerpt": "string (opcional, fragmento clave revisado)"
    }
  ],
  "rewritten_script": {
    "episodes": [
      {
        "episode_number": 1,
        "title": "string",
        "scenes": [
          {
            "scene_number": 1,
            "slugline": "string (INT/EXT. LOCATION - DAY/NIGHT)",
            "description": "string",
            "dialogue": [
              { "character": "string", "line": "string", "parenthetical": "string (opcional)" }
            ]
          }
        ]
      }
    ]
  },
  "dramaturgy_checklist": {
    "early_consequence_present": boolean,
    "early_consequence_description": "string",
    "dirty_decision_present": boolean,
    "dirty_decision_description": "string",
    "action_over_reflection": boolean,
    "pilot_ending_promise": "string (cuál de las 4 promesas)"
  }
}`;

interface SurgeryRequest {
  projectId: string;
  scriptId: string;
  episodeNumber?: number;
  surgeryLevel: "light" | "standard" | "aggressive";
  preserveDialogueStyle?: boolean;
  // V2: Check for pending result
  checkPending?: boolean;
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

    const body: SurgeryRequest = await req.json();
    const { projectId, scriptId, episodeNumber = 1, surgeryLevel = "standard", checkPending = false } = body;

    if (!projectId || !scriptId) {
      return new Response(
        JSON.stringify({ ok: false, error: "projectId and scriptId required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // V2: Check for existing pending result first
    if (checkPending) {
      const { data: pendingBlock } = await supabase
        .from("generation_blocks")
        .select("*")
        .eq("project_id", projectId)
        .eq("script_id", scriptId)
        .eq("block_type", "showrunner_surgery")
        .in("status", ["processing", "pending_approval"])
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (pendingBlock) {
        return new Response(
          JSON.stringify({
            ok: true,
            blockId: pendingBlock.id,
            status: pendingBlock.status,
            ...(pendingBlock.status === "pending_approval" && pendingBlock.output_data ? {
              sceneChanges: pendingBlock.output_data.scene_changes || [],
              rewrittenScript: pendingBlock.output_data.rewritten_script || {},
              dramaturgChecklist: pendingBlock.output_data.dramaturgy_checklist || {},
              stats: pendingBlock.output_data.stats || {}
            } : {})
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Fetch the script
    const { data: script, error: scriptError } = await supabase
      .from("scripts")
      .select("id, raw_text, parsed_json, script_type, status")
      .eq("id", scriptId)
      .single();

    if (scriptError || !script) {
      return new Response(
        JSON.stringify({ ok: false, error: "Script not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get script content
    const scriptContent = script.raw_text || JSON.stringify(script.parsed_json, null, 2);
    
    if (!scriptContent || scriptContent.length < 100) {
      return new Response(
        JSON.stringify({ ok: false, error: "Script has insufficient content" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // V2: Create a processing block BEFORE calling AI
    const { data: newBlock, error: blockError } = await supabase
      .from("generation_blocks")
      .insert({
        project_id: projectId,
        script_id: scriptId,
        block_type: "showrunner_surgery",
        block_index: 0,
        status: "processing",
        started_at: new Date().toISOString(),
        input_context: {
          scriptId,
          episodeNumber,
          surgeryLevel,
          originalLength: scriptContent.length
        },
        model_used: "openai/gpt-5.2"
      })
      .select("id")
      .single();

    if (blockError || !newBlock) {
      console.error("Failed to create block:", blockError);
      return new Response(
        JSON.stringify({ ok: false, error: "Failed to create processing block" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const blockId = newBlock.id;

    // Build surgery level instructions
    const levelInstructions = {
      light: "Aplica cambios mínimos. Solo ajusta lo estrictamente necesario para cumplir las 5 reglas. Preserva al máximo el texto original.",
      standard: "Aplica cambios moderados. Reescribe las escenas necesarias para cumplir las 5 reglas, manteniendo la esencia.",
      aggressive: "Aplica cambios profundos. Reconstruye las escenas que lo necesiten para maximizar el impacto dramático, siempre dentro de las reglas."
    };

    const userPrompt = `## NIVEL DE CIRUGÍA: ${surgeryLevel.toUpperCase()}
${levelInstructions[surgeryLevel]}

## EPISODIO A MEJORAR: ${episodeNumber}

## GUION ORIGINAL:
${scriptContent}

Analiza el guion y aplica las 5 reglas no negociables. Devuelve el JSON con los cambios por escena y el guion reescrito completo.`;

    // Use Lovable AI Gateway
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      // Update block to failed
      await supabase
        .from("generation_blocks")
        .update({ status: "failed", error_message: "LOVABLE_API_KEY not configured" })
        .eq("id", blockId);

      return new Response(
        JSON.stringify({ ok: false, error: "LOVABLE_API_KEY not configured", blockId }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Call AI
    const startTime = Date.now();
    let surgeryResult;
    
    try {
      const aiResponse = await aiFetch({
        url: AI_GATEWAY_URL,
        apiKey: LOVABLE_API_KEY,
        payload: {
          model: "openai/gpt-5.2",
          messages: [
            { role: "system", content: SHOWRUNNER_SURGERY_SYSTEM },
            { role: "user", content: userPrompt }
          ],
          max_tokens: 16000,
          temperature: 0.7,
          response_format: { type: "json_object" }
        },
        label: "showrunner-surgery",
        supabase,
        projectId,
        userId: user.id
      });

      const durationMs = Date.now() - startTime;

      // Extract content
      const choices = (aiResponse as any).choices;
      if (!choices || !choices[0]?.message?.content) {
        await supabase
          .from("generation_blocks")
          .update({ 
            status: "failed", 
            error_message: "No response from AI",
            completed_at: new Date().toISOString(),
            latency_ms: durationMs
          })
          .eq("id", blockId);

        return new Response(
          JSON.stringify({ ok: false, error: "No response from AI", blockId }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      try {
        surgeryResult = JSON.parse(choices[0].message.content);
      } catch (parseError) {
        await supabase
          .from("generation_blocks")
          .update({ 
            status: "failed", 
            error_message: "Failed to parse AI response",
            completed_at: new Date().toISOString(),
            latency_ms: durationMs
          })
          .eq("id", blockId);

        return new Response(
          JSON.stringify({ ok: false, error: "Failed to parse AI response", blockId }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Calculate stats
      const stats = {
        scenesModified: surgeryResult.scene_changes?.length || 0,
        dialoguesAdjusted: surgeryResult.rewritten_script?.episodes?.[0]?.scenes?.reduce(
          (acc: number, s: any) => acc + (s.dialogue?.length || 0), 0
        ) || 0,
        consequencesAdded: surgeryResult.scene_changes?.filter(
          (c: any) => c.change_type === "consequence"
        ).length || 0,
        durationMs
      };

      // V2: Update block to pending_approval with full result
      await supabase
        .from("generation_blocks")
        .update({
          status: "pending_approval",
          completed_at: new Date().toISOString(),
          latency_ms: durationMs,
          output_data: {
            scene_changes: surgeryResult.scene_changes || [],
            rewritten_script: surgeryResult.rewritten_script || {},
            dramaturgy_checklist: surgeryResult.dramaturgy_checklist || {},
            stats
          },
          output_tokens_est: (aiResponse as any).usage?.total_tokens || 0
        })
        .eq("id", blockId);

      return new Response(
        JSON.stringify({
          ok: true,
          blockId,
          status: "pending_approval",
          sceneChanges: surgeryResult.scene_changes || [],
          rewrittenScript: surgeryResult.rewritten_script || {},
          dramaturgChecklist: surgeryResult.dramaturgy_checklist || {},
          stats
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );

    } catch (aiError) {
      const durationMs = Date.now() - startTime;
      const errorMessage = aiError instanceof Error ? aiError.message : String(aiError);
      
      await supabase
        .from("generation_blocks")
        .update({ 
          status: "failed", 
          error_message: errorMessage,
          completed_at: new Date().toISOString(),
          latency_ms: durationMs
        })
        .eq("id", blockId);

      throw aiError;
    }

  } catch (error) {
    console.error("showrunner-surgery error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ ok: false, error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
