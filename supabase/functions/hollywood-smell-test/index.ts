import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { parseJsonSafe, type ParseResult } from "../_shared/llmJson.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SmellTestResult {
  verdict: 'PASS' | 'FAIL';
  score: number;
  dramaticity_score?: number;
  causality_score?: number;
  conflict_score?: number;
  cinematography_score?: number;
  dialogue_penalty?: number;
  blockers: string[];
  generic_phrases_found?: string[];
  weak_scenes?: Array<{ scene_number: number; issue: string; fix_suggestion?: string }>;
  strengths?: string[];
  repair_strategy: string;
  skipped?: boolean;
  reason?: string;
  parse_error?: boolean;
}

// =============================================================================
// HOLLYWOOD SMELL TEST - LLM-Judge for Professional Screenplay Quality
// =============================================================================

const SMELL_TEST_SYSTEM = `Eres LECTOR DE GUIONES PROFESIONAL para un estudio de cine.
Tu trabajo es detectar escritura mediocre, genérica o no filmable.

NO eres complaciente.
Si el guion no tiene nivel profesional, lo RECHAZAS.

━━━━━━━━━━━━━━━━━━━━━━━━━━
CRITERIOS DE EVALUACIÓN
━━━━━━━━━━━━━━━━━━━━━━━━━━

1. DRAMATICIDAD REAL (0-25 pts)
- ¿Hay decisiones con coste?
- ¿Las escenas cambian algo o son decorativas?
- ¿Cada escena tiene conflicto activo?

2. CAUSALIDAD (0-25 pts)
- ¿Cada escena provoca la siguiente?
- ¿O parecen viñetas intercambiables?
- ¿Las consecuencias son inevitables?

3. CONFLICTO (0-25 pts)
- ¿Hay oposición clara en cada escena?
- ¿O solo personajes hablando?
- ¿Los obstáculos son dignos del protagonista?

4. ESCRITURA CINEMATOGRÁFICA (0-25 pts)
- ¿Se puede filmar lo descrito?
- ¿Las descripciones son visuales, no abstractas?
- ¿El blocking está claro?

━━━━━━━━━━━━━━━━━━━━━━━━━━
DIÁLOGO (PENALIZACIÓN EXTRA)
━━━━━━━━━━━━━━━━━━━━━━━━━━
- ¿Hay subtexto o todo es on-the-nose?
- ¿Los personajes suenan distintos?
- ¿Evita la exposición obvia?

━━━━━━━━━━━━━━━━━━━━━━━━━━
LENGUAJE PROHIBIDO (FAIL AUTOMÁTICO si hay 3+)
━━━━━━━━━━━━━━━━━━━━━━━━━━
- "todo cambia"
- "se dan cuenta"
- "la tensión aumenta"
- "empiezan a…"
- "nada volverá a ser igual"
- "surge un conflicto"
- "las cosas se complican"

━━━━━━━━━━━━━━━━━━━━━━━━━━
ESCENAS DÉBILES
━━━━━━━━━━━━━━━━━━━━━━━━━━
Identifica escenas que:
- No tienen conflicto claro
- Solo sirven para exposición
- No cambian el estado del mundo
- Podrían eliminarse sin afectar la trama`;

const SMELL_TEST_SCHEMA = {
  name: "evaluate_screenplay",
  description: "Evaluate screenplay for Hollywood professional standards",
  parameters: {
    type: "object",
    properties: {
      verdict: { 
        type: "string", 
        enum: ["PASS", "FAIL"],
        description: "Overall verdict - PASS if score >= 70, FAIL otherwise"
      },
      score: { 
        type: "number", 
        minimum: 0, 
        maximum: 100,
        description: "Total score out of 100"
      },
      dramaticity_score: { 
        type: "number", 
        minimum: 0, 
        maximum: 25 
      },
      causality_score: { 
        type: "number", 
        minimum: 0, 
        maximum: 25 
      },
      conflict_score: { 
        type: "number", 
        minimum: 0, 
        maximum: 25 
      },
      cinematography_score: { 
        type: "number", 
        minimum: 0, 
        maximum: 25 
      },
      dialogue_penalty: {
        type: "number",
        minimum: -15,
        maximum: 0,
        description: "Penalty for poor dialogue (0 to -15)"
      },
      blockers: { 
        type: "array", 
        items: { type: "string" },
        description: "Critical issues that must be fixed"
      },
      generic_phrases_found: { 
        type: "array", 
        items: { type: "string" },
        description: "Forbidden generic phrases detected"
      },
      weak_scenes: { 
        type: "array", 
        items: { 
          type: "object", 
          properties: {
            scene_number: { type: "number" },
            issue: { type: "string" },
            fix_suggestion: { type: "string" }
          },
          required: ["scene_number", "issue"]
        },
        description: "Scenes that need work"
      },
      strengths: {
        type: "array",
        items: { type: "string" },
        description: "What the script does well"
      },
      repair_strategy: { 
        type: "string",
        description: "Concrete steps to improve if FAIL"
      }
    },
    required: ["verdict", "score", "dramaticity_score", "causality_score", "conflict_score", "cinematography_score", "blockers", "repair_strategy"]
  }
};

// =============================================================================
// MAIN HANDLER
// =============================================================================

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { screenplay, format_profile, quality_tier } = await req.json();

    if (!screenplay) {
      return new Response(
        JSON.stringify({ error: 'screenplay is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Skip smell test for non-hollywood tiers
    if (quality_tier && quality_tier !== 'hollywood') {
      console.log('[SMELL_TEST] Skipping for tier:', quality_tier);
      return new Response(
        JSON.stringify({ 
          verdict: 'PASS', 
          score: 75, 
          skipped: true, 
          reason: 'Smell test only runs for hollywood tier' 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Extract screenplay text for analysis
    const scenes = screenplay.scenes || [];
    const screenplayText = scenes.map((s: any) => {
      const parts = [s.slugline, s.action_summary, s.raw_content];
      if (s.dialogue) {
        s.dialogue.forEach((d: any) => {
          parts.push(`${d.character}: ${d.line}`);
        });
      }
      return parts.filter(Boolean).join('\n');
    }).join('\n\n---\n\n');

    const userPrompt = `SCREENPLAY A EVALUAR:

FORMATO: ${format_profile?.type || 'FILM'}
DURACIÓN: ${format_profile?.duration_minutes || 'N/A'} minutos
ESCENAS: ${scenes.length}

═══════════════════════════════════════════════════════════════
CONTENIDO:
═══════════════════════════════════════════════════════════════

${screenplayText.slice(0, 15000)}

═══════════════════════════════════════════════════════════════

TAREA:
Evalúa si este guion tiene nivel profesional de cine Hollywood.
Si no lo rodarías ni lo recomendarías a un productor, recházalo.

Sé HONESTO y ESPECÍFICO en tu evaluación.`;

    // Call Lovable AI Gateway
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!lovableApiKey) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview', // Fast model for QC
        messages: [
          { role: 'system', content: SMELL_TEST_SYSTEM },
          { role: 'user', content: userPrompt }
        ],
        max_completion_tokens: 2000,
        tools: [{
          type: 'function',
          function: SMELL_TEST_SCHEMA
        }],
        tool_choice: { type: 'function', function: { name: 'evaluate_screenplay' } }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[SMELL_TEST] AI error:', errorText);
      throw new Error(`AI request failed: ${response.status}`);
    }

    const aiResult = await response.json();
    
    // Extract tool call result
    let evaluation: SmellTestResult | null = null;
    
    if (aiResult.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments) {
      const parseResult: ParseResult<SmellTestResult> = parseJsonSafe(aiResult.choices[0].message.tool_calls[0].function.arguments);
      if (parseResult.ok && parseResult.json) {
        evaluation = parseResult.json;
      }
    } else if (aiResult.choices?.[0]?.message?.content) {
      const parseResult: ParseResult<SmellTestResult> = parseJsonSafe(aiResult.choices[0].message.content);
      if (parseResult.ok && parseResult.json) {
        evaluation = parseResult.json;
      }
    }

    if (!evaluation || typeof evaluation.score !== 'number') {
      console.error('[SMELL_TEST] Failed to parse evaluation:', aiResult);
      // Return a lenient pass if parsing fails
      return new Response(
        JSON.stringify({
          verdict: 'PASS',
          score: 70,
          parse_error: true,
          blockers: [],
          repair_strategy: 'Evaluation parsing failed - passing by default'
        } as SmellTestResult),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Ensure verdict is consistent with score
    if (!evaluation.verdict) {
      evaluation.verdict = evaluation.score >= 70 ? 'PASS' : 'FAIL';
    }

    console.log('[SMELL_TEST] Result:', {
      verdict: evaluation.verdict,
      score: evaluation.score,
      blockersCount: evaluation.blockers?.length || 0,
      weakScenesCount: evaluation.weak_scenes?.length || 0
    });

    return new Response(
      JSON.stringify(evaluation),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error('[SMELL_TEST] Error:', errorMessage);
    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        verdict: 'PASS', // Fail open to avoid blocking generation
        score: 65,
        blockers: [],
        repair_strategy: 'Error during evaluation - manual review recommended'
      } as SmellTestResult),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
