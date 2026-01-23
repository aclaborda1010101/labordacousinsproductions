// ============================================
// SHOWRUNNER-DECIDE Edge Function
// ============================================
// Makes editorial decisions BEFORE storyboard generation.
// Answers: Where we came from, what must change, what cannot repeat.
// This is the "invisible director" that ensures narrative coherence.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ShowrunnerDecideRequest {
  project_id: string;
  scene_id: string;
  scene_number: number;
  episode_number?: number;
  mode?: "auto" | "manual" | "hybrid";
  force_regenerate?: boolean;
}

interface ShowrunnerDecision {
  where_we_came_from: string;
  what_must_change: string;
  what_cannot_repeat: string[];
  visual_strategy: string;
  visual_energy: "low" | "medium" | "high" | "explosive";
  camera_language_allowed: {
    shot_types: string[];
    movements: string[];
    lens_range: { min: number; max: number };
  };
  pacing_guidance: string;
  confidence: number;
  reasoning: string;
}

// Build the showrunner system prompt
const SHOWRUNNER_SYSTEM_PROMPT = `You are the Showrunner IA - the invisible director that ensures cinematic coherence.
Your role is to make editorial decisions BEFORE any visual generation happens.

You think in SEQUENCES, not isolated shots. Every decision must consider:
1. Where we emotionally came from (previous scene)
2. What must change in this scene (narrative delta)
3. What visual resources cannot repeat (to avoid monotony)

You output structured JSON decisions that will constrain storyboard generation.

CRITICAL RULES:
- Never recommend the same dominant lens 3 scenes in a row
- Never recommend the same camera movement 2 scenes in a row
- If previous scene was intimate (CU, long lens), this scene needs space
- If previous scene was expansive (WS, wide lens), this scene can compress
- Emotional transitions require visual transitions

VISUAL ENERGY LEVELS:
- "low": Contemplative, static, long takes, minimal movement
- "medium": Standard coverage, balanced, subtle movement
- "high": Dynamic, multiple angles, active camera
- "explosive": Frenetic, rapid cuts, aggressive movement

ALWAYS respond with valid JSON matching the ShowrunnerDecision schema.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const body: ShowrunnerDecideRequest = await req.json();
    const { 
      project_id, 
      scene_id, 
      scene_number, 
      episode_number = 1,
      mode = "auto",
      force_regenerate = false 
    } = body;

    if (!project_id || !scene_id) {
      return new Response(
        JSON.stringify({ error: "project_id and scene_id are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Check if decision already exists
    if (!force_regenerate) {
      const { data: existing } = await supabase
        .from("showrunner_decisions")
        .select("*")
        .eq("scene_id", scene_id)
        .single();

      if (existing && existing.validated) {
        return new Response(
          JSON.stringify({
            success: true,
            decision: existing,
            source: "cached",
            duration_ms: Date.now() - startTime,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Fetch current scene data
    const { data: currentScene, error: sceneError } = await supabase
      .from("scenes")
      .select(`
        id, scene_number, episode_number, summary, mood, 
        location_id, characters_in_scene, action_description,
        locations(name, interior_exterior, time_of_day)
      `)
      .eq("id", scene_id)
      .single();

    if (sceneError || !currentScene) {
      return new Response(
        JSON.stringify({ error: "Scene not found", details: sceneError }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch previous scene's visual memory (N-1)
    const { data: previousMemory } = await supabase
      .from("visual_context_memory")
      .select("*")
      .eq("project_id", project_id)
      .eq("episode_number", episode_number)
      .eq("scene_number", scene_number - 1)
      .single();

    // Fetch previous scene's intent
    const { data: previousIntent } = await supabase
      .from("scene_intent")
      .select("*")
      .eq("project_id", project_id)
      .eq("episode_number", episode_number)
      .eq("scene_number", scene_number - 1)
      .single();

    // Fetch scene N-2 memory for pattern detection
    const { data: olderMemory } = await supabase
      .from("visual_context_memory")
      .select("*")
      .eq("project_id", project_id)
      .eq("episode_number", episode_number)
      .eq("scene_number", scene_number - 2)
      .single();

    // Fetch current scene's intent if exists
    const { data: currentIntent } = await supabase
      .from("scene_intent")
      .select("*")
      .eq("scene_id", scene_id)
      .single();

    // Build context for AI decision
    const contextForAI = {
      current_scene: {
        scene_number,
        episode_number,
        summary: currentScene.summary,
        mood: currentScene.mood,
        location: currentScene.locations,
        characters: currentScene.characters_in_scene,
        action: currentScene.action_description,
        intent: currentIntent ? {
          emotional_turn: currentIntent.emotional_turn,
          intent_summary: currentIntent.intent_summary,
          information_revealed: currentIntent.information_revealed,
        } : null,
      },
      previous_scene: previousMemory ? {
        emotional_end: previousMemory.emotional_end,
        dominant_lenses: previousMemory.dominant_lenses,
        dominant_movements: previousMemory.dominant_movements,
        dominant_shot_types: previousMemory.dominant_shot_types,
        pacing_level: previousMemory.pacing_level,
        coverage_style: previousMemory.coverage_style,
        forbidden_next: previousMemory.forbidden_next,
      } : null,
      older_scene: olderMemory ? {
        dominant_lenses: olderMemory.dominant_lenses,
        dominant_movements: olderMemory.dominant_movements,
      } : null,
      previous_intent: previousIntent ? {
        emotional_turn: previousIntent.emotional_turn,
        intent_summary: previousIntent.intent_summary,
      } : null,
    };

    // Build user prompt
    const userPrompt = `Analyze this scene and make editorial decisions:

CURRENT SCENE (Scene ${scene_number}, Episode ${episode_number}):
${JSON.stringify(contextForAI.current_scene, null, 2)}

PREVIOUS SCENE VISUAL MEMORY (N-1):
${contextForAI.previous_scene ? JSON.stringify(contextForAI.previous_scene, null, 2) : "No previous scene (this is the first scene)"}

SCENE N-2 PATTERNS:
${contextForAI.older_scene ? JSON.stringify(contextForAI.older_scene, null, 2) : "No N-2 scene available"}

Based on narrative continuity and visual coherence principles:
1. What emotional state are we coming from?
2. What must change in this scene to advance the story?
3. What visual resources should we AVOID repeating?
4. What visual strategy will best serve the narrative?

Respond with a JSON object matching this schema:
{
  "where_we_came_from": "string - emotional state from previous scene",
  "what_must_change": "string - what this scene needs to shift",
  "what_cannot_repeat": ["array of visual resources to avoid"],
  "visual_strategy": "string - overall visual approach",
  "visual_energy": "low|medium|high|explosive",
  "camera_language_allowed": {
    "shot_types": ["allowed shot types"],
    "movements": ["allowed movements"],
    "lens_range": { "min": number, "max": number }
  },
  "pacing_guidance": "string - rhythm recommendations",
  "confidence": 0.0-1.0,
  "reasoning": "string - brief explanation of decisions"
}`;

    // Call AI Gateway
    const aiGatewayUrl = Deno.env.get("AI_GATEWAY_URL") || "https://ai.gateway.lovable.dev/v1/chat/completions";
    const aiGatewayKey = Deno.env.get("AI_GATEWAY_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    const aiResponse = await fetch(aiGatewayUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${aiGatewayKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SHOWRUNNER_SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 1500,
        response_format: { type: "json_object" },
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("AI Gateway error:", errorText);
      throw new Error(`AI Gateway error: ${aiResponse.status}`);
    }

    const aiResult = await aiResponse.json();
    const responseText = aiResult.choices?.[0]?.message?.content || "";

    // Parse AI response
    let decision: ShowrunnerDecision;
    try {
      decision = JSON.parse(responseText);
    } catch (parseError) {
      // Try to extract JSON from response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        decision = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("Failed to parse AI response as JSON");
      }
    }

    // Validate and normalize decision
    const normalizedDecision = {
      where_we_came_from: decision.where_we_came_from || "Unknown starting state",
      what_must_change: decision.what_must_change || "Scene must advance narrative",
      what_cannot_repeat: Array.isArray(decision.what_cannot_repeat) 
        ? decision.what_cannot_repeat 
        : [],
      visual_strategy: decision.visual_strategy || "Standard coverage",
      visual_energy: ["low", "medium", "high", "explosive"].includes(decision.visual_energy) 
        ? decision.visual_energy 
        : "medium",
      camera_language_allowed: decision.camera_language_allowed || {
        shot_types: ["WS", "MS", "CU"],
        movements: ["static", "pan", "dolly"],
        lens_range: { min: 24, max: 85 },
      },
      pacing_guidance: decision.pacing_guidance || "Standard pacing",
      confidence: typeof decision.confidence === "number" 
        ? Math.min(1, Math.max(0, decision.confidence)) 
        : 0.7,
      reasoning: decision.reasoning || "Auto-generated decision",
    };

    // Upsert showrunner decision
    const { data: savedDecision, error: upsertError } = await supabase
      .from("showrunner_decisions")
      .upsert({
        project_id,
        scene_id,
        where_we_came_from: normalizedDecision.where_we_came_from,
        what_must_change: normalizedDecision.what_must_change,
        what_cannot_repeat: normalizedDecision.what_cannot_repeat.join(", "),
        visual_strategy: normalizedDecision.visual_strategy,
        visual_energy: normalizedDecision.visual_energy,
        camera_language_allowed: normalizedDecision.camera_language_allowed,
        lens_range_allowed: [
          `${normalizedDecision.camera_language_allowed.lens_range.min}mm`,
          `${normalizedDecision.camera_language_allowed.lens_range.max}mm`,
        ],
        movement_allowed: normalizedDecision.camera_language_allowed.movements,
        shot_types_allowed: normalizedDecision.camera_language_allowed.shot_types,
        pacing_guidance: normalizedDecision.pacing_guidance,
        confidence_score: normalizedDecision.confidence,
        reasoning: normalizedDecision.reasoning,
        mode,
        model_used: "google/gemini-2.5-flash",
        validated: false,
        updated_at: new Date().toISOString(),
      }, { 
        onConflict: "scene_id",
        ignoreDuplicates: false,
      })
      .select()
      .single();

    if (upsertError) {
      console.error("Error saving decision:", upsertError);
      throw upsertError;
    }

    // Update scene_intent with showrunner link if exists
    if (currentIntent) {
      await supabase
        .from("scene_intent")
        .update({
          visual_energy: normalizedDecision.visual_energy,
          allowed_camera_language: normalizedDecision.camera_language_allowed,
          forbidden_repetitions: normalizedDecision.what_cannot_repeat,
          showrunner_decision_id: savedDecision.id,
          showrunner_notes: normalizedDecision.reasoning,
        })
        .eq("id", currentIntent.id);
    }

    const durationMs = Date.now() - startTime;

    return new Response(
      JSON.stringify({
        success: true,
        decision: {
          id: savedDecision.id,
          ...normalizedDecision,
        },
        source: "generated",
        context_used: {
          had_previous_scene: !!previousMemory,
          had_older_scene: !!olderMemory,
          had_current_intent: !!currentIntent,
        },
        model_used: "google/gemini-2.5-flash",
        duration_ms: durationMs,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("Showrunner-decide error:", error);
    const errorMessage = error instanceof Error ? error.message : "Internal server error";
    return new Response(
      JSON.stringify({ 
        success: false,
        error: errorMessage,
        duration_ms: Date.now() - startTime,
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
