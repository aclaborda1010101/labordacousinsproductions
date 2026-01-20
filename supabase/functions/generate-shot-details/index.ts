import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============= OPTION SETS =============
const SHOT_TYPE_OPTIONS = [
  "ExtremeWide", "Wide", "Full", "MediumWide", "Medium", "MediumClose",
  "CloseUp", "ExtremeCloseUp", "OverShoulder", "POV", "Insert", "Cutaway",
  "Establishing", "TwoShot", "GroupShot", "ReactionShot", "DetailMacro"
];

const CAMERA_MOVEMENT_OPTIONS = [
  "Static", "Handheld_Controlled", "Handheld_Raw", "Steadicam", "Gimbal",
  "Tripod_Pan_Left", "Tripod_Pan_Right", "Tripod_Tilt_Up", "Tripod_Tilt_Down",
  "Slider_Left", "Slider_Right", "Dolly_In", "Dolly_Out", "PushIn_Slow",
  "PullOut_Slow", "Tracking_Follow", "Tracking_Lead", "Arc_Orbit_Left",
  "Arc_Orbit_Right", "Crane_Up", "Crane_Down", "Jib_Arc", "Zoom_In",
  "Zoom_Out", "Snap_Zoom", "Whip_Pan", "Dolly_Zoom", "Rack_Focus", "Micro_Drift"
];

const STABILIZATION_OPTIONS = [
  "Locked_Tripod", "Tripod_FluidHead", "Gimbal_Stabilized",
  "Steadicam_Rig", "Handheld_Controlled", "Handheld_Raw"
];

const CAMERA_HEIGHT_OPTIONS = [
  "EyeLevel", "LowAngle", "HighAngle", "WaistLevel",
  "ShoulderLevel", "Overhead", "GroundLevel"
];

const FOCAL_LENGTH_OPTIONS = [18, 24, 28, 35, 40, 50, 65, 85, 100, 135];

const LENS_LOOK_OPTIONS = [
  "Spherical_Clean", "Anamorphic", "Vintage_Soft",
  "Vintage_Halation", "Macro", "TiltShift"
];

const DEPTH_OF_FIELD_OPTIONS = ["Shallow", "Medium", "Deep"];

const FOCUS_PLAN_OPTIONS = [
  "Locked_On_Subject", "Locked_On_Object", "Rack_Subject_To_Object",
  "Rack_Object_To_Subject", "Rack_Foreground_To_Background",
  "Rack_Background_To_Foreground", "Follow_Focus_Subject", "Follow_Focus_Object"
];

const FRAMING_OPTIONS = [
  "RuleOfThirds", "Centered", "Symmetrical", "NegativeSpace",
  "LeadRoom_Heavy", "LeadRoom_Subtle", "TopFrame_Heavy", "BottomFrame_Heavy"
];

const LIGHTING_STYLE_OPTIONS = [
  "Naturalistic_Daylight", "Naturalistic_Tungsten", "Soft_Key_LowContrast",
  "Hard_Key_HighContrast", "Motivated_Practicals", "WindowKey_SideLight",
  "TopLight_Dramatic", "Backlight_Rim", "Neon_Mixed", "Corporate_Clean", "Noir_Contrast"
];

const EDITING_INTENT_OPTIONS = [
  "Establish_Context", "Reveal_Information", "Build_Tension", "Release_Tension",
  "Character_Insight", "Transition_Bridge", "Punchline_Gag", "Action_Beat",
  "Emotional_Beat", "Suspense_Hold", "Insert_Detail_For_Plot"
];

const PERFORMANCE_INTENT_OPTIONS = [
  "Calm_Controlled", "Subtle_Anxiety", "Focused_Thinking", "Hidden_Anger",
  "Confident_Pitch", "Micro_Doubt", "Alert_Listening", "Internal_Conflict",
  "Friendly_Open", "Cold_Distant"
];

const AI_ARTIFACT_AVOID_LIST = [
  "text_overlay", "subtitles", "watermark", "logo", "weird_hands",
  "extra_fingers", "deformed_face", "plastic_skin", "uncanny_valley",
  "jitter", "flicker", "morphing", "identity_drift", "wardrobe_change",
  "inconsistent_lighting", "over_sharpen", "cgi_look", "frame_warp", "camera_wobble_unmotivated"
];

interface GenerateShotDetailsRequest {
  project: {
    title?: string;
    genre?: string;
    tone?: string;
    visual_style_bible?: string;
    continuity_bible?: string;
    quality_mode_default?: 'CINE' | 'ULTRA';
    fps?: number;
    aspect_ratio?: string;
    language?: string;
  };
  scene: {
    slugline: string;
    scene_summary?: string;
    scene_objective?: string;
    scene_mood?: string;
    previous_shot_context?: string;
    next_shot_context?: string;
    // NEW: Raw script context for better extraction
    scene_raw_text?: string;
    dialogues?: { character: string; line: string }[];
  };
  shot: {
    shot_index: number;
    engine?: 'VEO' | 'KLING';
    effective_mode?: 'CINE' | 'ULTRA';
    duration_sec?: number;
    current_fields?: {
      shot_type?: string;
      camera_movement?: string;
      lens_angle_free?: string;
      blocking_action?: string;
      dialogue?: string;
    };
  };
  location?: {
    name?: string;
    description?: string;
    time_of_day?: string;
  };
  characters: {
    name: string;
    role?: string;
    physical_description?: string;
    wardrobe?: string;
    personality?: string;
    current_emotion?: string;
    reference_images_available?: boolean;
  }[];
  auto_populate?: boolean;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY not configured');

    const request: GenerateShotDetailsRequest = await req.json();
    
    console.log(`Generating shot details for shot ${request.shot.shot_index}`);

    // Build the comprehensive prompt
    const systemPrompt = `You are SHOT_ASSISTANT, a senior-level virtual film crew:
Director + DOP (cinematographer) + 1st AD + Script Supervisor + Sound Designer + Editor.

You output production-ready shot plans that can be executed by AI video engines (VEO/KLING).
You NEVER output vague text. You output precise, technical, professional instructions.

PRIMARY GOAL:
Given project + scene + shot context, fill ALL shot fields with cinema-grade detail, eliminate ambiguity,
and produce a generation-ready prompt and QC checklist.

CRITICAL RULES:
1) NO EMPTY FIELDS - provide reasonable defaults with assumptions
2) Blocking/action MUST include timing segments (sec 0-1, sec 1-2, etc.)
3) Always include: intention, composition, lighting, continuity, sound layers, editing intent
4) "Must not look AI" means: continuity lock, human rhythm, layered audio

OPTION SETS TO USE:
- SHOT_TYPE: ${SHOT_TYPE_OPTIONS.join(', ')}
- CAMERA_MOVEMENT: ${CAMERA_MOVEMENT_OPTIONS.join(', ')}
- STABILIZATION: ${STABILIZATION_OPTIONS.join(', ')}
- CAMERA_HEIGHT: ${CAMERA_HEIGHT_OPTIONS.join(', ')}
- FOCAL_LENGTH_MM: ${FOCAL_LENGTH_OPTIONS.join(', ')}
- LENS_LOOK: ${LENS_LOOK_OPTIONS.join(', ')}
- DEPTH_OF_FIELD: ${DEPTH_OF_FIELD_OPTIONS.join(', ')}
- FOCUS_PLAN: ${FOCUS_PLAN_OPTIONS.join(', ')}
- FRAMING: ${FRAMING_OPTIONS.join(', ')}
- LIGHTING_STYLE: ${LIGHTING_STYLE_OPTIONS.join(', ')}
- EDITING_INTENT: ${EDITING_INTENT_OPTIONS.join(', ')}
- PERFORMANCE_INTENT: ${PERFORMANCE_INTENT_OPTIONS.join(', ')}

AI_ARTIFACT_AVOID (always include in negative_prompt):
${AI_ARTIFACT_AVOID_LIST.join(', ')}

Return ONLY valid JSON with this exact structure:`;

    const outputSchema = `{
  "fills": {
    "viewer_notice": "one line: what must the viewer notice/feel in this shot",
    "intention": "what the viewer should feel/learn by end of shot",
    "editing_intent": "one of EDITING_INTENT_OPTIONS",
    "shot_type": "one of SHOT_TYPE_OPTIONS",
    "duration_sec": number,
    "camera_movement": "one of CAMERA_MOVEMENT_OPTIONS",
    "camera_details": {
      "stabilization": "one of STABILIZATION_OPTIONS",
      "camera_height": "one of CAMERA_HEIGHT_OPTIONS",
      "camera_angle": "Frontal|ThreeQuarter_Left|ThreeQuarter_Right|Profile_Left|Profile_Right|OverShoulder_Left|OverShoulder_Right",
      "movement_speed": "slow|medium|fast",
      "movement_notes": "precise technical notes"
    },
    "lens": {
      "focal_mm": number,
      "lens_look": "one of LENS_LOOK_OPTIONS",
      "depth_of_field": "one of DEPTH_OF_FIELD_OPTIONS",
      "focus_plan": "one of FOCUS_PLAN_OPTIONS",
      "lens_notes_free": "short technical notes"
    },
    "composition": {
      "framing": "one of FRAMING_OPTIONS",
      "subject_position": "LeftThird|Center|RightThird",
      "headroom": "Tight|Normal|Loose",
      "foreground_elements": ["array of 0-3 items"],
      "background_read": "what is readable in background",
      "axis_notes": "180-degree rule management"
    },
    "lighting": {
      "lighting_style": "one of LIGHTING_STYLE_OPTIONS",
      "color_temp_preset": "Daylight_5600K|Neutral_5200K|Tungsten_3200K|Mixed_5600K_3200K|Cool_4800K|Warm_4000K",
      "key_light": "source + direction + softness",
      "fill_light": "ratio approx, how achieved",
      "rim_back_light": "yes/no + why + placement",
      "practicals": ["0-4 practicals"],
      "shadow_notes": "how shadows fall naturally"
    },
    "performance": {
      "performance_intent": "one of PERFORMANCE_INTENT_OPTIONS",
      "micro_gestures": ["3-6 specific micro actions"]
    },
    "blocking_action": "DETAILED action with timing: sec 0-1..., sec 1-2...; include hands, eyes, props, posture, micro-pauses",
    "dialogue": "string or empty",
    "sound_design": {
      "room_tone": "one sentence",
      "ambience": ["2-5 items: HVAC_Hum, Office_Murmur_Distant, City_Traffic_Far, etc"],
      "foley": ["2-6 items: Keyboard_Typing, Chair_Creak_Subtle, Fabric_Rustle, etc"],
      "mix_notes": "foreground vs background dynamics"
    },
    "continuity": {
      "wardrobe_lock": "exact wardrobe details",
      "props_lock": ["must keep props"],
      "screen_direction": "LeftToRight|RightToLeft|Static",
      "eye_line": "exact eyeline target(s)",
      "match_cut_notes": "how this cuts from prev and into next"
    },
    "keyframes": {
      "use_keyframes": true,
      "start_frame_desc": "ultra-specific composition, pose, expression",
      "end_frame_desc": "what changes, final gaze/gesture",
      "refs_needed": ["identity_closeup", "outfit", etc]
    },
    "prompt_video": {
      "engine": "VEO|KLING",
      "quality_mode": "CINE|ULTRA",
      "text": "ENGINE-READY prompt for video generation",
      "negative_prompt": ["array of things to avoid"],
      "params": {
        "duration_sec": number,
        "fps": 24,
        "aspect_ratio": "16:9"
      }
    },
    "ai_risk": {
      "primary_risk": "hands|face|lighting|morphing|continuity",
      "mitigation": "specific action to reduce risk"
    },
    "prev_next_context": {
      "prev_shot_summary": "what happened in previous shot",
      "next_shot_hint": "what comes next",
      "cut_motivation": "why we cut here"
    }
  },
  "missing_info": [
    { "field": "...", "why_needed": "...", "options": ["A","B","C"], "requires_user_choice": true }
  ],
  "assumptions": ["list of assumptions made"],
  "qc_checklist": {
    "passes": true,
    "issues": [],
    "auto_fixes": []
  }
}`;

    // Build enhanced input with script context
    const hasScriptContext = request.scene.scene_raw_text || (request.scene.dialogues && request.scene.dialogues.length > 0);
    
    const inputData = `INPUT DATA:
{
  "project": ${JSON.stringify(request.project || {})},
  "scene": ${JSON.stringify({
    ...request.scene,
    // Include script context for better extraction
    scene_raw_text: request.scene.scene_raw_text || '',
    dialogues: request.scene.dialogues || []
  })},
  "shot": ${JSON.stringify(request.shot)},
  "location": ${JSON.stringify(request.location || {})},
  "characters": ${JSON.stringify(request.characters)}
}

${hasScriptContext ? `
SCRIPT CONTEXT AVAILABLE:
- Use "scene_raw_text" to extract the ACTION lines for blocking_action
- Use "dialogues" array to find the dialogue for shot ${request.shot.shot_index}
- Derive camera_movement suggestions from character movement described in ACTION lines
- Extract emotional beats and intentions from dialogue subtext
` : ''}

Generate the complete shot details following the schema above. Return ONLY the JSON, no markdown or extra text.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-5-mini", // Optimized: GPT-5-mini for precise micro-shot decomposition
        messages: [
          { role: "system", content: systemPrompt + "\n\n" + outputSchema },
          { role: "user", content: inputData }
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI error:', response.status, errorText);
      
      if (response.status === 429) {
        throw new Error('Rate limit exceeded');
      }
      if (response.status === 402) {
        throw new Error('Payment required');
      }
      throw new Error(`AI request failed: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    
    console.log('AI response length:', content.length);

    // Parse JSON from response
    let result;
    try {
      // Try to extract JSON from response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      // Provide comprehensive defaults
      result = {
        fills: {
          viewer_notice: "Scene establishes character presence",
          intention: "Orient the viewer to the scene context",
          editing_intent: "Establish_Context",
          shot_type: "Medium",
          duration_sec: request.shot.duration_sec || 4,
          camera_movement: "Static",
          camera_details: {
            stabilization: "Locked_Tripod",
            camera_height: "EyeLevel",
            camera_angle: "Frontal",
            movement_speed: "slow",
            movement_notes: "Locked off, stable frame"
          },
          lens: {
            focal_mm: 35,
            lens_look: "Spherical_Clean",
            depth_of_field: "Medium",
            focus_plan: "Locked_On_Subject",
            lens_notes_free: "Standard commercial look"
          },
          composition: {
            framing: "RuleOfThirds",
            subject_position: "Center",
            headroom: "Normal",
            foreground_elements: [],
            background_read: "Blurred environment",
            axis_notes: "Maintain 180-degree rule"
          },
          lighting: {
            lighting_style: "Naturalistic_Daylight",
            color_temp_preset: "Daylight_5600K",
            key_light: "Window light, soft, 45 degrees",
            fill_light: "Bounce from environment, 1:2 ratio",
            rim_back_light: "Subtle separation light",
            practicals: [],
            shadow_notes: "Soft shadows, natural fall-off"
          },
          performance: {
            performance_intent: "Calm_Controlled",
            micro_gestures: ["subtle breathing", "occasional blink", "micro weight shift"]
          },
          blocking_action: `sec 0-1: ${request.characters[0]?.name || 'Subject'} enters frame, settles; sec 1-2: eye contact established; sec 2-3: subtle gesture, scene continues`,
          dialogue: request.shot.current_fields?.dialogue || "",
          sound_design: {
            room_tone: "Low ambient hum of the space",
            ambience: ["HVAC_Hum", "City_Traffic_Far"],
            foley: ["Fabric_Rustle", "Breath_Subtle"],
            mix_notes: "Dialogue foreground, ambience bed"
          },
          continuity: {
            wardrobe_lock: request.characters[0]?.wardrobe || "As established",
            props_lock: [],
            screen_direction: "Static",
            eye_line: "Camera or scene partner",
            match_cut_notes: "Clean cut from previous"
          },
          keyframes: {
            use_keyframes: true,
            start_frame_desc: "Character positioned, calm expression",
            end_frame_desc: "Slight change in expression or posture",
            refs_needed: ["identity_closeup", "outfit"]
          },
          prompt_video: {
            engine: request.shot.engine || "VEO",
            quality_mode: request.shot.effective_mode || "CINE",
            text: `${request.scene.slugline}. ${request.characters.map(c => c.name).join(' and ')} in ${request.location?.name || 'scene'}. ${request.shot.current_fields?.shot_type || 'Medium'} shot, static camera, natural lighting.`,
            negative_prompt: AI_ARTIFACT_AVOID_LIST,
            params: {
              duration_sec: request.shot.duration_sec || 4,
              fps: 24,
              aspect_ratio: "16:9"
            }
          },
          ai_risk: {
            primary_risk: "hands",
            mitigation: "Keep hands relaxed, avoid complex gestures"
          },
          prev_next_context: {
            prev_shot_summary: request.scene.previous_shot_context || "Previous shot established scene",
            next_shot_hint: request.scene.next_shot_context || "Scene continues",
            cut_motivation: "Natural progression"
          }
        },
        missing_info: [],
        assumptions: ["Used default values for undefined fields"],
        qc_checklist: {
          passes: true,
          issues: [],
          auto_fixes: []
        }
      };
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in generate-shot-details:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const status = errorMessage.includes('Rate limit') ? 429 : 
                   errorMessage.includes('Payment required') ? 402 : 500;
    
    return new Response(JSON.stringify({
      error: errorMessage
    }), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
