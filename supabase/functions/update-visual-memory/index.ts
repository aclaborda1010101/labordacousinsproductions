// ============================================
// UPDATE-VISUAL-MEMORY Edge Function
// ============================================
// Executes AFTER storyboard/shots are approved for a scene.
// Analyzes the approved visual content and updates memory.
// Generates forbidden/recommended patterns for the next scene.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface UpdateVisualMemoryRequest {
  project_id: string;
  scene_id: string;
  scene_number: number;
  episode_number?: number;
  // Optional: override with specific data
  shots_data?: ShotData[];
  storyboard_data?: StoryboardPanel[];
}

interface ShotData {
  shot_type: string;
  lens_mm?: number;
  movement?: string;
  duration_sec?: number;
  camera_height?: string;
}

interface StoryboardPanel {
  shot_type?: string;
  suggested_lens?: string;
  camera_movement?: string;
  duration_estimate_sec?: number;
}

interface VisualMemoryUpdate {
  emotional_start: string;
  emotional_end: string;
  emotional_delta: string;
  dominant_lenses: string[];
  dominant_movements: string[];
  dominant_shot_types: string[];
  camera_height_tendency: "low" | "neutral" | "high" | "mixed";
  coverage_style: "fragmented" | "clean" | "mixed" | "documentary";
  average_shot_duration_sec: number;
  shot_count: number;
  pacing_level: "slow" | "moderate" | "fast" | "frenetic";
  forbidden_next: ForbiddenRecommended;
  recommended_next: ForbiddenRecommended;
}

interface ForbiddenRecommended {
  lenses?: string[];
  movements?: string[];
  shot_types?: string[];
  reasons?: string[];
}

// Lens mapping for analysis
const LENS_CATEGORIES = {
  wide: [14, 16, 18, 21, 24],
  normal: [28, 35, 40, 50],
  long: [85, 100, 135, 200, 300],
};

// Determine pacing from average shot duration
function determinePacing(avgDuration: number): "slow" | "moderate" | "fast" | "frenetic" {
  if (avgDuration > 8) return "slow";
  if (avgDuration > 4) return "moderate";
  if (avgDuration > 2) return "fast";
  return "frenetic";
}

// Find dominant items in array (most frequent)
function findDominant<T>(items: T[], topN: number = 3): T[] {
  const counts = new Map<T, number>();
  items.forEach(item => {
    counts.set(item, (counts.get(item) || 0) + 1);
  });
  
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([item]) => item);
}

// Determine camera height tendency
function determineCameraHeight(heights: string[]): "low" | "neutral" | "high" | "mixed" {
  const counts = { low: 0, neutral: 0, high: 0 };
  heights.forEach(h => {
    const normalized = h?.toLowerCase() || "neutral";
    if (normalized.includes("low") || normalized.includes("bajo")) counts.low++;
    else if (normalized.includes("high") || normalized.includes("alto") || normalized.includes("overhead")) counts.high++;
    else counts.neutral++;
  });
  
  const total = counts.low + counts.neutral + counts.high;
  if (total === 0) return "neutral";
  
  const max = Math.max(counts.low, counts.neutral, counts.high);
  if (max / total < 0.5) return "mixed";
  if (counts.low === max) return "low";
  if (counts.high === max) return "high";
  return "neutral";
}

// Determine coverage style
function determineCoverageStyle(shotTypes: string[], shotCount: number): "fragmented" | "clean" | "mixed" | "documentary" {
  const uniqueTypes = new Set(shotTypes).size;
  const fragmentationRatio = uniqueTypes / Math.max(1, shotCount);
  
  // Check for documentary indicators
  const hasHandheld = shotTypes.some(s => 
    s?.toLowerCase().includes("handheld") || s?.toLowerCase().includes("documental")
  );
  if (hasHandheld && fragmentationRatio > 0.6) return "documentary";
  
  if (fragmentationRatio > 0.7) return "fragmented";
  if (fragmentationRatio < 0.3) return "clean";
  return "mixed";
}

// Generate forbidden patterns for next scene
function generateForbiddenNext(
  dominantLenses: string[],
  dominantMovements: string[],
  dominantShotTypes: string[],
  previousForbidden?: ForbiddenRecommended
): ForbiddenRecommended {
  const forbidden: ForbiddenRecommended = {
    lenses: [],
    movements: [],
    shot_types: [],
    reasons: [],
  };
  
  // Rule: Don't use the same dominant lens again
  if (dominantLenses.length > 0) {
    forbidden.lenses = [dominantLenses[0]];
    forbidden.reasons?.push(`Lens ${dominantLenses[0]} dominated this scene`);
  }
  
  // Rule: Don't repeat the same dominant movement
  if (dominantMovements.length > 0 && dominantMovements[0] !== "static") {
    forbidden.movements = [dominantMovements[0]];
    forbidden.reasons?.push(`Movement "${dominantMovements[0]}" was overused`);
  }
  
  // Rule: If previous scene also forbade something, it's even more important
  if (previousForbidden?.lenses?.length) {
    // If same lens was forbidden twice, escalate
    const repeated = previousForbidden.lenses.filter(l => dominantLenses.includes(l));
    if (repeated.length > 0) {
      forbidden.reasons?.push(`Lens pattern "${repeated[0]}" repeated across scenes - break it`);
    }
  }
  
  return forbidden;
}

// Generate recommended patterns for next scene
function generateRecommendedNext(
  currentDominantLenses: string[],
  currentDominantMovements: string[],
  emotionalDelta: string
): ForbiddenRecommended {
  const recommended: ForbiddenRecommended = {
    lenses: [],
    movements: [],
    shot_types: [],
    reasons: [],
  };
  
  // Recommend contrast from current dominant lens
  const currentLens = currentDominantLenses[0];
  if (currentLens) {
    const lensNum = parseInt(currentLens);
    if (!isNaN(lensNum)) {
      if (lensNum > 50) {
        recommended.lenses = ["24mm", "28mm", "35mm"];
        recommended.reasons?.push("Contrast from long lens with wider angle");
      } else if (lensNum < 35) {
        recommended.lenses = ["50mm", "85mm"];
        recommended.reasons?.push("Contrast from wide lens with tighter framing");
      }
    }
  }
  
  // Movement recommendations based on what was used
  if (currentDominantMovements.includes("static")) {
    recommended.movements = ["dolly", "tracking"];
    recommended.reasons?.push("Add movement after static scene");
  } else if (currentDominantMovements.some(m => 
    m?.includes("tracking") || m?.includes("dolly")
  )) {
    recommended.movements = ["static", "subtle"];
    recommended.reasons?.push("Calm down after active camera work");
  }
  
  return recommended;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const body: UpdateVisualMemoryRequest = await req.json();
    const { 
      project_id, 
      scene_id, 
      scene_number, 
      episode_number = 1,
      shots_data,
      storyboard_data,
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

    // Fetch scene data
    const { data: scene } = await supabase
      .from("scenes")
      .select("id, scene_number, episode_number, mood, summary")
      .eq("id", scene_id)
      .single();

    // Fetch shots if not provided
    let shotsToAnalyze: ShotData[] = shots_data || [];
    if (!shots_data || shots_data.length === 0) {
      const { data: shots } = await supabase
        .from("shots")
        .select("shot_type, lens, movement, duration_sec, camera_height")
        .eq("scene_id", scene_id);
      
      if (shots) {
        shotsToAnalyze = shots.map(s => ({
          shot_type: s.shot_type || "MS",
          lens_mm: parseInt(s.lens) || 35,
          movement: s.movement || "static",
          duration_sec: s.duration_sec || 4,
          camera_height: s.camera_height || "neutral",
        }));
      }
    }

    // Fetch storyboard panels if not provided and no shots
    if (shotsToAnalyze.length === 0) {
      const { data: storyboard } = await supabase
        .from("storyboard_panels")
        .select("shot_type, suggested_lens, camera_movement, duration_estimate_sec")
        .eq("scene_id", scene_id);
      
      if (storyboard) {
        shotsToAnalyze = storyboard.map(p => ({
          shot_type: p.shot_type || "MS",
          lens_mm: parseInt(p.suggested_lens) || 35,
          movement: p.camera_movement || "static",
          duration_sec: p.duration_estimate_sec || 4,
        }));
      }
    }

    // If still no data, create minimal memory
    if (shotsToAnalyze.length === 0) {
      const minimalMemory: VisualMemoryUpdate = {
        emotional_start: scene?.mood || "neutral",
        emotional_end: scene?.mood || "neutral",
        emotional_delta: "minimal",
        dominant_lenses: ["35mm"],
        dominant_movements: ["static"],
        dominant_shot_types: ["MS"],
        camera_height_tendency: "neutral",
        coverage_style: "clean",
        average_shot_duration_sec: 4,
        shot_count: 0,
        pacing_level: "moderate",
        forbidden_next: {},
        recommended_next: {},
      };

      const { data: savedMemory, error } = await supabase
        .from("visual_context_memory")
        .upsert({
          project_id,
          scene_id,
          episode_number,
          scene_number,
          ...minimalMemory,
          status: "computed",
          computed_at: new Date().toISOString(),
        }, {
          onConflict: "scene_id",
        })
        .select()
        .single();

      return new Response(
        JSON.stringify({
          success: true,
          memory: savedMemory,
          source: "minimal",
          shots_analyzed: 0,
          duration_ms: Date.now() - startTime,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Analyze shots
    const allLenses = shotsToAnalyze
      .map(s => s.lens_mm ? `${s.lens_mm}mm` : "35mm");
    const allMovements = shotsToAnalyze
      .map(s => s.movement || "static");
    const allShotTypes = shotsToAnalyze
      .map(s => s.shot_type || "MS");
    const allHeights = shotsToAnalyze
      .map(s => s.camera_height || "neutral");
    const allDurations = shotsToAnalyze
      .map(s => s.duration_sec || 4);

    // Calculate metrics
    const dominantLenses = findDominant(allLenses);
    const dominantMovements = findDominant(allMovements);
    const dominantShotTypes = findDominant(allShotTypes);
    const cameraHeightTendency = determineCameraHeight(allHeights);
    const coverageStyle = determineCoverageStyle(allShotTypes, shotsToAnalyze.length);
    const avgDuration = allDurations.reduce((a, b) => a + b, 0) / allDurations.length;
    const pacingLevel = determinePacing(avgDuration);

    // Fetch previous scene's forbidden patterns
    const { data: previousMemory } = await supabase
      .from("visual_context_memory")
      .select("forbidden_next")
      .eq("project_id", project_id)
      .eq("episode_number", episode_number)
      .eq("scene_number", scene_number - 1)
      .single();

    // Fetch showrunner decision for emotional context
    const { data: showrunnerDecision } = await supabase
      .from("showrunner_decisions")
      .select("where_we_came_from, what_must_change, visual_energy")
      .eq("scene_id", scene_id)
      .single();

    // Build emotional context
    const emotionalStart = showrunnerDecision?.where_we_came_from || scene?.mood || "neutral";
    const emotionalEnd = scene?.mood || "neutral";
    const emotionalDelta = showrunnerDecision?.what_must_change || 
      (emotionalStart === emotionalEnd ? "stable" : "transitional");

    // Generate constraints for next scene
    const forbiddenNext = generateForbiddenNext(
      dominantLenses,
      dominantMovements,
      dominantShotTypes,
      previousMemory?.forbidden_next as ForbiddenRecommended
    );
    const recommendedNext = generateRecommendedNext(
      dominantLenses,
      dominantMovements,
      emotionalDelta
    );

    // Build memory update
    const memoryUpdate: VisualMemoryUpdate = {
      emotional_start: emotionalStart,
      emotional_end: emotionalEnd,
      emotional_delta: emotionalDelta,
      dominant_lenses: dominantLenses,
      dominant_movements: dominantMovements,
      dominant_shot_types: dominantShotTypes,
      camera_height_tendency: cameraHeightTendency,
      coverage_style: coverageStyle,
      average_shot_duration_sec: Math.round(avgDuration * 100) / 100,
      shot_count: shotsToAnalyze.length,
      pacing_level: pacingLevel,
      forbidden_next: forbiddenNext,
      recommended_next: recommendedNext,
    };

    // Upsert visual memory
    const { data: savedMemory, error: upsertError } = await supabase
      .from("visual_context_memory")
      .upsert({
        project_id,
        scene_id,
        episode_number,
        scene_number,
        ...memoryUpdate,
        status: "computed",
        computed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, {
        onConflict: "scene_id",
      })
      .select()
      .single();

    if (upsertError) {
      console.error("Error saving visual memory:", upsertError);
      throw upsertError;
    }

    const durationMs = Date.now() - startTime;

    return new Response(
      JSON.stringify({
        success: true,
        memory: savedMemory,
        source: "computed",
        shots_analyzed: shotsToAnalyze.length,
        analysis: {
          dominant_lenses: dominantLenses,
          dominant_movements: dominantMovements,
          dominant_shot_types: dominantShotTypes,
          pacing_level: pacingLevel,
          coverage_style: coverageStyle,
        },
        constraints_for_next: {
          forbidden: forbiddenNext,
          recommended: recommendedNext,
        },
        duration_ms: durationMs,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("Update-visual-memory error:", error);
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
