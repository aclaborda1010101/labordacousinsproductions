import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Showrunner-level system prompt
const SHOWRUNNER_SYSTEM = `Eres showrunner senior para una serie de televisión de alto nivel (HBO/Apple TV+/Netflix).
Tu misión NO es resumir, sino PROFUNDIZAR y ESTRUCTURAR DRAMA.

Piensas como un arquitecto narrativo:
- Cada episodio es un acto dramático con inicio, desarrollo y giro
- Los personajes tienen arcos claros con transformaciones medibles
- Las reglas del mundo son consistentes y tienen consecuencias
- La escala sube progresivamente: personal → grupal → societal → civilizatoria
- Cada decisión tiene peso y consecuencias irreversibles`;

// Build the upgrade prompt
function buildShowrunnerPrompt(outlineLight: any, originalText: string): string {
  return `Este es el outline preliminar de una serie:
${JSON.stringify(outlineLight, null, 2)}

Este es el material narrativo original de la serie:
${originalText}

TAREA:
Transforma el outline preliminar en un OUTLINE DE TEMPORADA PROFUNDO.

REQUISITOS OBLIGATORIOS:
1. Define un ARCO CLARO DEL PROTAGONISTA:
   - Estado inicial (quién es al empezar)
   - Punto de quiebre (qué lo transforma)
   - Estado final (en quién se convierte)

2. Define el MIDPOINT de la temporada:
   - El momento donde "no hay vuelta atrás"
   - El giro que redefine el conflicto central

3. Establece REGLAS DE MITOLOGÍA claras:
   - Para cada entidad especial/sobrenatural, define qué PUEDE y qué NO PUEDE hacer
   - Límites narrativos que dan tensión

4. ESCALA PROGRESIVA:
   - Episodios 1-3: Conflicto personal/íntimo
   - Episodios 4-6: Conflicto grupal/institucional
   - Episodios 7-8: Conflicto civilizatorio/existencial

5. Cada EPISODIO debe tener:
   - Conflicto central del episodio
   - Giro irreversible (algo que no puede deshacerse)
   - Consecuencia directa para el siguiente episodio
   - Pregunta central que el episodio responde

IMPORTANTE:
- Mantén los personajes y localizaciones del outline original
- Profundiza en sus arcos, no los cambies arbitrariamente
- Respeta el tono y género establecidos
- No seas conservador: esta es una serie de alto riesgo intelectual

Devuelve el outline mejorado usando la herramienta deliver_showrunner_outline.`;
}

// Tool schema for structured output
const SHOWRUNNER_TOOL_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string", description: "Título de la serie" },
    logline: { type: "string", description: "Logline mejorada con gancho dramático" },
    genre: { type: "string" },
    tone: { type: "string" },
    format: { type: "string" },
    target_episodes: { type: "number" },
    
    season_arc: {
      type: "object",
      description: "Arco dramático de la temporada completa",
      properties: {
        protagonist_name: { type: "string" },
        protagonist_start: { type: "string", description: "Estado emocional/situacional al inicio" },
        protagonist_break: { type: "string", description: "El momento de quiebre que lo transforma" },
        protagonist_end: { type: "string", description: "En quién se convierte al final" },
        midpoint_episode: { type: "number", description: "Número del episodio donde ocurre el midpoint" },
        midpoint_event: { type: "string", description: "Qué sucede en el midpoint" },
        midpoint_consequence: { type: "string", description: "Por qué no hay vuelta atrás" },
        thematic_question: { type: "string", description: "La pregunta filosófica que explora la temporada" },
        thematic_answer: { type: "string", description: "Cómo responde la serie a esa pregunta" }
      },
      required: ["protagonist_name", "protagonist_start", "protagonist_break", "protagonist_end", "midpoint_event", "thematic_question"]
    },
    
    mythology_rules: {
      type: "array",
      description: "Reglas del mundo para entidades especiales",
      items: {
        type: "object",
        properties: {
          entity: { type: "string", description: "Nombre de la entidad (personaje, fuerza, tecnología)" },
          nature: { type: "string", description: "Qué es fundamentalmente" },
          can_do: { type: "array", items: { type: "string" }, description: "Lista de capacidades permitidas" },
          cannot_do: { type: "array", items: { type: "string" }, description: "Lista de limitaciones absolutas" },
          weakness: { type: "string", description: "Su vulnerabilidad narrativa" },
          dramatic_purpose: { type: "string", description: "Por qué existe en la historia" }
        },
        required: ["entity", "can_do", "cannot_do"]
      }
    },
    
    character_arcs: {
      type: "array",
      description: "Arcos de personajes principales",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          role: { type: "string" },
          arc_type: { type: "string", description: "Tipo de arco: redención, caída, transformación, revelación" },
          arc_start: { type: "string", description: "Quién es al inicio" },
          arc_catalyst: { type: "string", description: "Qué evento inicia su cambio" },
          arc_midpoint: { type: "string", description: "Su estado en el midpoint" },
          arc_end: { type: "string", description: "Quién es al final" },
          key_relationship: { type: "string", description: "Relación más importante para su arco" },
          internal_conflict: { type: "string", description: "Su lucha interna principal" }
        },
        required: ["name", "role", "arc_start", "arc_end"]
      }
    },
    
    main_characters: {
      type: "array",
      description: "Personajes principales con descripciones enriquecidas",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          role: { type: "string" },
          description: { type: "string" },
          visual_description: { type: "string" },
          personality_traits: { type: "array", items: { type: "string" } },
          motivation: { type: "string" },
          flaw: { type: "string" },
          secret: { type: "string" }
        },
        required: ["name", "role", "description"]
      }
    },
    
    main_locations: {
      type: "array",
      description: "Localizaciones principales",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          visual_description: { type: "string" },
          dramatic_function: { type: "string", description: "Qué representa narrativamente" },
          key_scenes: { type: "array", items: { type: "string" } }
        },
        required: ["name", "description"]
      }
    },
    
    episodes: {
      type: "array",
      description: "Episodios con estructura dramática profunda",
      items: {
        type: "object",
        properties: {
          episode: { type: "number" },
          title: { type: "string" },
          central_question: { type: "string", description: "Pregunta que el episodio responde" },
          central_conflict: { type: "string", description: "El conflicto principal del episodio" },
          stakes: { type: "string", description: "Qué está en juego" },
          synopsis: { type: "string", description: "Resumen narrativo de 3-4 oraciones" },
          key_events: { type: "array", items: { type: "string" } },
          turning_point: { type: "string", description: "El giro principal del episodio" },
          irreversible_change: { type: "string", description: "Qué cambia permanentemente" },
          end_state: { type: "string", description: "Estado emocional/situacional al terminar" },
          consequence_for_next: { type: "string", description: "Cómo afecta al siguiente episodio" },
          scale: { type: "string", enum: ["personal", "grupal", "institucional", "civilizatorio"] }
        },
        required: ["episode", "title", "central_conflict", "turning_point", "irreversible_change", "consequence_for_next"]
      }
    }
  },
  required: ["title", "logline", "season_arc", "character_arcs", "episodes"]
};

// Call Lovable AI with tool
async function callLovableAI(
  systemPrompt: string,
  userPrompt: string,
  model: string,
  maxTokens: number,
  toolName: string,
  toolSchema: any
): Promise<any> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) {
    throw new Error("LOVABLE_API_KEY not configured");
  }

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_completion_tokens: maxTokens,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      tools: [
        {
          type: "function",
          function: {
            name: toolName,
            description: "Deliver the showrunner-level outline with deep dramatic structure",
            parameters: toolSchema
          }
        }
      ],
      tool_choice: { type: "function", function: { name: toolName } }
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("AI API error:", response.status, errorText);
    
    if (response.status === 429) {
      throw new Error("Rate limit exceeded. Please try again in a few minutes.");
    }
    if (response.status === 402) {
      throw new Error("API credits exhausted. Please add credits to continue.");
    }
    throw new Error(`AI API error: ${response.status}`);
  }

  const data = await response.json();
  
  // Extract tool call result
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  if (toolCall?.function?.arguments) {
    try {
      return JSON.parse(toolCall.function.arguments);
    } catch (e) {
      console.error("Failed to parse tool arguments:", e);
      throw new Error("Invalid response format from AI");
    }
  }

  // Fallback: try to extract JSON from content
  const content = data.choices?.[0]?.message?.content;
  if (content) {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  }

  throw new Error("No valid response from AI");
}

serve(async (req) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { outline_id } = await req.json();
    
    if (!outline_id) {
      return new Response(
        JSON.stringify({ error: "outline_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. Fetch current outline
    const { data: outline, error: fetchError } = await supabase
      .from("project_outlines")
      .select("*")
      .eq("id", outline_id)
      .single();

    if (fetchError || !outline) {
      console.error("Failed to fetch outline:", fetchError);
      return new Response(
        JSON.stringify({ error: "Outline not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if already showrunner quality
    if (outline.quality === "showrunner") {
      return new Response(
        JSON.stringify({ success: true, outline: outline.outline_json, message: "Already at showrunner level" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Mark as upgrading
    await supabase
      .from("project_outlines")
      .update({
        status: "upgrading",
        stage: "showrunner",
        progress: 10,
        updated_at: new Date().toISOString()
      })
      .eq("id", outline_id);

    console.log("Starting showrunner upgrade for outline:", outline_id);

    // 3. Get original text (idea or summary)
    const originalText = outline.idea || outline.summary_text || JSON.stringify(outline.outline_json);

    // 4. Update progress
    await supabase
      .from("project_outlines")
      .update({ progress: 30 })
      .eq("id", outline_id);

    // 5. Call GPT-5.2 with showrunner prompt
    let upgradedData: any;
    try {
      upgradedData = await callLovableAI(
        SHOWRUNNER_SYSTEM,
        buildShowrunnerPrompt(outline.outline_json, originalText),
        "openai/gpt-5.2",
        32000,
        "deliver_showrunner_outline",
        SHOWRUNNER_TOOL_SCHEMA
      );
    } catch (aiError) {
      console.error("AI call failed:", aiError);
      
      // Revert to previous state on error
      await supabase
        .from("project_outlines")
        .update({
          status: "completed",
          stage: "done",
          progress: 100,
          error_message: (aiError as Error).message
        })
        .eq("id", outline_id);
      
      throw aiError;
    }

    // 6. Update progress
    await supabase
      .from("project_outlines")
      .update({ progress: 80 })
      .eq("id", outline_id);

    // 7. Merge with original outline (preserve base data, enhance with showrunner insights)
    const mergedOutline = {
      // Base from original
      title: upgradedData.title || outline.outline_json?.title,
      logline: upgradedData.logline || outline.outline_json?.logline,
      genre: upgradedData.genre || outline.outline_json?.genre,
      tone: upgradedData.tone || outline.outline_json?.tone,
      format: upgradedData.format || outline.outline_json?.format,
      target_episodes: upgradedData.target_episodes || outline.outline_json?.target_episodes,
      
      // Showrunner enhancements
      season_arc: upgradedData.season_arc,
      mythology_rules: upgradedData.mythology_rules || [],
      character_arcs: upgradedData.character_arcs || [],
      
      // Merged characters (prefer upgraded, fallback to original)
      main_characters: upgradedData.main_characters?.length > 0 
        ? upgradedData.main_characters 
        : outline.outline_json?.main_characters || [],
      
      // Merged locations
      main_locations: upgradedData.main_locations?.length > 0
        ? upgradedData.main_locations
        : outline.outline_json?.main_locations || [],
      
      // Episodes: use upgraded structure, map to expected format
      episodes: (upgradedData.episodes || []).map((ep: any, idx: number) => {
        const originalEp = outline.outline_json?.episodes?.[idx] || {};
        return {
          episode: ep.episode || idx + 1,
          title: ep.title || originalEp.title,
          synopsis: ep.synopsis || originalEp.synopsis,
          central_question: ep.central_question,
          central_conflict: ep.central_conflict,
          stakes: ep.stakes,
          key_events: ep.key_events || originalEp.key_events || [],
          turning_point: ep.turning_point,
          irreversible_change: ep.irreversible_change,
          end_state: ep.end_state,
          consequence_for_next: ep.consequence_for_next,
          scale: ep.scale,
          // Preserve original data
          scenes: originalEp.scenes,
          characters_featured: originalEp.characters_featured,
          locations_featured: originalEp.locations_featured
        };
      }),
      
      // Metadata
      _showrunner_upgrade: true,
      _upgrade_timestamp: new Date().toISOString(),
      _upgrade_model: "openai/gpt-5.2",
      _original_quality: outline.quality
    };

    // 8. Save upgraded outline
    const { error: updateError } = await supabase
      .from("project_outlines")
      .update({
        status: "completed",
        stage: "done",
        progress: 100,
        quality: "showrunner",
        outline_json: mergedOutline,
        updated_at: new Date().toISOString(),
        error_message: null
      })
      .eq("id", outline_id);

    if (updateError) {
      console.error("Failed to save upgraded outline:", updateError);
      throw new Error("Failed to save upgraded outline");
    }

    console.log("Showrunner upgrade completed for outline:", outline_id);

    return new Response(
      JSON.stringify({ 
        success: true, 
        outline: mergedOutline,
        message: "Outline upgraded to showrunner level"
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Outline upgrade error:", error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Unknown error",
        success: false 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
