/**
 * PRODUCER NOTES - V1.0
 * 
 * Automated studio executive feedback system.
 * Generates professional-grade notes as if from a senior executive producer.
 * 
 * This is NOT creative feedback - it's risk assessment and structural diagnosis.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ============================================================================
// PRODUCER NOTES SYSTEM PROMPT
// ============================================================================

const PRODUCER_NOTES_SYSTEM = `Eres productor ejecutivo senior en un estudio de cine.

Tu tarea NO es reescribir el guion.
Tu tarea es evaluar si el guion FUNCIONA a nivel profesional.

Analiza el guion como lo haría un estudio antes de aprobarlo para greenlight.

PROHIBIDO:
- Escribir escenas
- Proponer diálogos concretos
- Cambiar personajes
- Dar feedback creativo subjetivo

DEBES:
- Detectar riesgos narrativos objetivos
- Señalar debilidades estructurales medibles
- Identificar oportunidades de claridad o impacto
- Formular preguntas que el guionista debe responder
- Evaluar viabilidad comercial y ejecutabilidad

Tu tono es profesional, directo y constructivo. Como un memo interno de estudio.

CRITERIOS DE EVALUACIÓN:
1. Claridad del conflicto central
2. Arco del protagonista (WANT vs NEED)
3. Escalada de stakes
4. Inevitabilidad del final
5. Ejecución de setpieces
6. Ritmo por actos
7. Causalidad de eventos`;

// ============================================================================
// OUTPUT SCHEMA
// ============================================================================

const PRODUCER_NOTES_SCHEMA = {
  name: "generate_producer_notes",
  description: "Generate executive producer notes for a screenplay",
  parameters: {
    type: "object",
    required: ["diagnosis", "risks", "character_notes", "conflict_and_stakes", "pacing_and_escalation", "ending_evaluation", "key_questions", "executive_summary"],
    properties: {
      diagnosis: {
        type: "object",
        required: ["overall_verdict", "confidence", "summary"],
        properties: {
          overall_verdict: {
            type: "string",
            enum: ["GREENLIGHT", "DEVELOPMENT", "PASS"],
            description: "GREENLIGHT=ready for production, DEVELOPMENT=needs work but viable, PASS=fundamental issues"
          },
          confidence: {
            type: "number",
            description: "Confidence in verdict 0-100"
          },
          summary: {
            type: "string",
            description: "1-2 sentence executive summary"
          }
        }
      },
      risks: {
        type: "array",
        items: {
          type: "object",
          required: ["category", "severity", "description"],
          properties: {
            category: {
              type: "string",
              enum: ["narrative", "character", "market", "execution"]
            },
            severity: {
              type: "string",
              enum: ["low", "medium", "high", "critical"]
            },
            description: {
              type: "string"
            },
            mitigation_hint: {
              type: "string",
              description: "Brief hint, not a solution"
            }
          }
        }
      },
      character_notes: {
        type: "array",
        items: {
          type: "object",
          required: ["name", "arc_clarity"],
          properties: {
            name: { type: "string" },
            arc_clarity: { type: "boolean" },
            motivation_issue: { type: "string" },
            stakes_issue: { type: "string" }
          }
        }
      },
      conflict_and_stakes: {
        type: "object",
        required: ["central_conflict_clear", "stakes_escalate"],
        properties: {
          central_conflict_clear: { type: "boolean" },
          stakes_escalate: { type: "boolean" },
          notes: { type: "string" }
        }
      },
      pacing_and_escalation: {
        type: "object",
        required: ["act_1_too_long", "midpoint_effective", "third_act_rush"],
        properties: {
          act_1_too_long: { type: "boolean" },
          midpoint_effective: { type: "boolean" },
          third_act_rush: { type: "boolean" },
          notes: { type: "string" }
        }
      },
      ending_evaluation: {
        type: "object",
        required: ["inevitable", "arbitrary", "satisfying"],
        properties: {
          inevitable: { type: "boolean" },
          arbitrary: { type: "boolean" },
          satisfying: { type: "boolean" },
          notes: { type: "string" }
        }
      },
      key_questions: {
        type: "array",
        items: { type: "string" },
        description: "3-7 questions the writer must answer"
      },
      executive_summary: {
        type: "string",
        description: "2-3 sentence memo-style summary for the greenlight committee"
      }
    }
  }
};

// ============================================================================
// MAIN HANDLER
// ============================================================================

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    
    if (!lovableApiKey) {
      return new Response(
        JSON.stringify({ error: "LOVABLE_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Validate auth
    const authHeader = req.headers.get("Authorization");
    if (authHeader) {
      const { data: { user }, error: authError } = await supabase.auth.getUser(
        authHeader.replace("Bearer ", "")
      );
      if (authError || !user) {
        return new Response(
          JSON.stringify({ error: "Unauthorized" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const {
      script_text,
      project_id,
      format = "FILM",
      genre = "Drama",
      target_audience = "General"
    } = await req.json();

    if (!script_text) {
      return new Response(
        JSON.stringify({ error: "Missing required field: script_text" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build user prompt
    const userPrompt = `GUION LITERARIO A EVALUAR:
${script_text.substring(0, 50000)}

CONTEXTO:
- Formato: ${format}
- Género: ${genre}
- Público objetivo: ${target_audience}

TAREA:
Genera NOTAS DE PRODUCTOR estructuradas según el schema.

RECUERDA:
- No propongas soluciones concretas
- No reescribas nada
- No halagues
- No seas ambiguo
- Sé directo como un memo interno de estudio`;

    console.log(`[producer-notes] Generating notes for ${format} - ${genre}`);

    // Call LLM with structured output using Lovable AI Gateway
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: PRODUCER_NOTES_SYSTEM },
          { role: "user", content: userPrompt }
        ],
        tools: [{
          type: "function",
          function: PRODUCER_NOTES_SCHEMA
        }],
        tool_choice: { type: "function", function: { name: "generate_producer_notes" } }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[producer-notes] AI error:", errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded, please try again later" }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Payment required, please add credits" }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      return new Response(
        JSON.stringify({ error: "AI generation failed", details: errorText }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const result = await response.json();
    
    // Extract tool call result
    let notes: any;
    const toolCalls = result.choices?.[0]?.message?.tool_calls;
    if (toolCalls && toolCalls.length > 0) {
      const functionCall = toolCalls[0].function;
      if (functionCall?.arguments) {
        try {
          notes = JSON.parse(functionCall.arguments);
        } catch (e) {
          console.error("[producer-notes] Failed to parse function arguments:", e);
          return new Response(
            JSON.stringify({ error: "Failed to parse producer notes" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
    }

    if (!notes) {
      // Fallback to content parsing
      const content = result.choices?.[0]?.message?.content;
      if (content) {
        try {
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            notes = JSON.parse(jsonMatch[0]);
          }
        } catch (e) {
          console.error("[producer-notes] Failed to parse content as JSON:", e);
        }
      }
    }

    if (!notes) {
      return new Response(
        JSON.stringify({ error: "No producer notes generated" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Add metadata
    notes.generated_at = new Date().toISOString();
    notes.format = format;
    notes.genre = genre;

    console.log(`[producer-notes] Generated: ${notes.diagnosis?.overall_verdict}`);

    return new Response(
      JSON.stringify({ success: true, notes }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[producer-notes] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});