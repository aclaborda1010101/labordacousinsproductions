/**
 * Generate Series Bible - Creates a comprehensive series bible from existing script
 * 
 * Generates:
 * - Logline and premise
 * - Artifact rules (confirmed + undefined with SAFE/BOLD options)
 * - Character arcs (desire, wound, mask, red line, evolution)
 * - Antagonism forces
 * - 8-episode season structure
 * - Repeatable episode template
 * - Tone guidelines (promises and red lines)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { aiFetch } from "../_shared/ai-fetch.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const AI_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

const SERIES_BIBLE_SYSTEM = `Actúa como showrunner + guionista jefe desarrollando una serie.
El tono es realismo sucio + fantástico contenido + subtexto social.
NO debes convertirlo en fantasy explicativo.

## REGLAS OBLIGATORIAS

1. NO INVENTAR REGLAS NUEVAS
   Solo explicitar y formalizar lo implícito en el guion:
   - La ventana permite "edición" puntual
   - Hay coste/peaje
   - Hay erosión/lagunas (memoria/tiempo)
   - El mundo "cobra" y se reequilibra
   
   Si algo no está claro, marcarlo como UNDEFINED y proponer 2 opciones:
   - SAFE: opción conservadora
   - BOLD: opción arriesgada

2. MOTOR DE LA SERIE: "QUIÉN PAGA"
   Cada episodio: una intervención y una consecuencia
   La consecuencia se acerca progresivamente:
   terceros -> protagonistas -> su identidad

3. ARCOS DE PERSONAJES (para cada protagonista)
   - Deseo: lo que quiere conscientemente
   - Herida: el trauma que lo define
   - Máscara: cómo se presenta al mundo
   - Línea roja: lo que nunca haría (hasta que lo hace)
   - Evolución por temporada: arco completo

4. ANTAGONISMO
   Define antagonismo SIN villano de capa:
   - El sistema social (prejuicio, control del relato, poder)
   - La "ventana" como mecanismo que exige peaje
   - Vectores humanos de mercantilización/control

5. ESTRUCTURA DE TEMPORADA (8 episodios default)
   - Logline de temporada
   - Tema de temporada
   - Escalada de stakes por episodio
   - Cliffhanger final
   - 1-2 episodios "bottle" (barato, intenso)

6. PLANTILLA DE EPISODIO (repeatable)
   - Teaser: hook de intervención
   - Acto 1: tentación
   - Acto 2: intervención
   - Acto 3: coste inmediato
   - Tag: precio emocional / pérdida / nuevo hilo

## FORMATO JSON
{
  "logline": "string (una línea que vende la serie)",
  "premise": "string (el concepto expandido en 2-3 oraciones)",
  "artifact_rules": {
    "confirmed": [
      { "rule": "string", "source": "string (escena/momento que lo implica)" }
    ],
    "undefined": [
      { "aspect": "string (lo que no está claro)", "safe_option": "string", "bold_option": "string" }
    ]
  },
  "characters": [
    {
      "name": "string",
      "role": "protagonist" | "recurring" | "antagonist",
      "desire": "string",
      "wound": "string",
      "mask": "string",
      "red_line": "string",
      "season_arc": "string (evolución completa de la temporada)"
    }
  ],
  "antagonism": {
    "primary_forces": ["string (fuerzas antagonistas principales)"],
    "systemic_threats": ["string (amenazas del sistema)"],
    "internal_conflicts": ["string (conflictos internos de los protagonistas)"]
  },
  "season_structure": {
    "episode_count": 8,
    "season_logline": "string",
    "season_theme": "string",
    "episodes": [
      {
        "number": 1,
        "title_suggestion": "string",
        "synopsis": "string (3-4 líneas)",
        "stake_level": "low" | "medium" | "high" | "explosive",
        "is_bottle": boolean
      }
    ],
    "season_cliffhanger": "string"
  },
  "episode_template": {
    "teaser": "string (descripción del formato del teaser)",
    "act_1_tentacion": "string",
    "act_2_intervencion": "string",
    "act_3_coste": "string",
    "tag": "string"
  },
  "tone_guidelines": {
    "promises": ["string (lo que la serie siempre entrega)"],
    "red_lines": ["string (lo que la serie nunca hace)"]
  }
}`;

interface BibleRequest {
  projectId: string;
  scriptId?: string;
  episodeCount?: number;
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

    const body: BibleRequest = await req.json();
    const { projectId, scriptId, episodeCount = 8 } = body;

    if (!projectId) {
      return new Response(
        JSON.stringify({ ok: false, error: "projectId required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Gather project data
    const [scriptResult, charactersResult, locationsResult, projectResult] = await Promise.all([
      scriptId 
        ? supabase.from("scripts").select("id, raw_text, parsed_json").eq("id", scriptId).single()
        : supabase.from("scripts").select("id, raw_text, parsed_json").eq("project_id", projectId).order("created_at", { ascending: false }).limit(1).single(),
      supabase.from("characters").select("name, role, bio, arc, profile_json").eq("project_id", projectId),
      supabase.from("locations").select("name, description").eq("project_id", projectId),
      supabase.from("projects").select("title, format, target_duration_min").eq("id", projectId).single()
    ]);

    const script = scriptResult.data;
    const characters = charactersResult.data || [];
    const locations = locationsResult.data || [];
    const project = projectResult.data;

    if (!script) {
      return new Response(
        JSON.stringify({ ok: false, error: "No script found for this project" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build context
    const scriptContent = script.raw_text || JSON.stringify(script.parsed_json, null, 2);
    const charactersSummary = characters.map(c => 
      `- ${c.name} (${c.role || 'sin rol'}): ${c.bio || 'Sin bio'}. Arco: ${c.arc || 'No definido'}`
    ).join("\n");
    const locationsSummary = locations.map(l => `- ${l.name}: ${l.description || 'Sin descripción'}`).join("\n");

    const userPrompt = `## PROYECTO: ${project?.title || 'Sin título'}
Formato: ${project?.format || 'serie'} | Duración objetivo: ${project?.target_duration_min || 45} min
Episodios por temporada: ${episodeCount}

## PERSONAJES EXISTENTES:
${charactersSummary || 'No hay personajes definidos aún.'}

## LOCALIZACIONES:
${locationsSummary || 'No hay localizaciones definidas aún.'}

## GUION/PILOTO:
${scriptContent.slice(0, 30000)}

---

Analiza el material anterior y genera una Biblia de Serie completa siguiendo el formato JSON especificado.
- Extrae las reglas del artefacto solo de lo que está implícito (no inventes).
- Define arcos para todos los personajes principales.
- Estructura una temporada de ${episodeCount} episodios con escalada de stakes.
- El motor de la serie es: "quién paga por cada intervención".`;

    // Use Lovable AI Gateway
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ ok: false, error: "LOVABLE_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Call AI
    const startTime = Date.now();
    const aiResponse = await aiFetch({
      url: AI_GATEWAY_URL,
      apiKey: LOVABLE_API_KEY,
      payload: {
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: SERIES_BIBLE_SYSTEM },
          { role: "user", content: userPrompt }
        ],
        max_tokens: 12000,
        temperature: 0.7
      },
      label: "generate-series-bible",
      supabase,
      projectId,
      userId: user.id
    });

    const durationMs = Date.now() - startTime;

    // Extract content
    const choices = (aiResponse as any).choices;
    if (!choices || !choices[0]?.message?.content) {
      return new Response(
        JSON.stringify({ ok: false, error: "No response from AI" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let bibleData;
    try {
      // Try to extract JSON from response
      const content = choices[0].message.content;
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        bibleData = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("No JSON found in response");
      }
    } catch (parseError) {
      console.error("Parse error:", parseError);
      return new Response(
        JSON.stringify({ ok: false, error: "Failed to parse AI response", raw: choices[0].message.content.slice(0, 1000) }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Save to series_bibles table
    const { data: savedBible, error: saveError } = await supabase
      .from("series_bibles")
      .insert({
        project_id: projectId,
        logline: bibleData.logline,
        premise: bibleData.premise,
        artifact_rules: bibleData.artifact_rules || {},
        character_arcs: bibleData.characters || [],
        antagonism: bibleData.antagonism || {},
        season_structure: bibleData.season_structure || {},
        episode_template: bibleData.episode_template || {},
        tone_guidelines: bibleData.tone_guidelines || {},
        source_script_id: script.id,
        generation_model: "google/gemini-2.5-pro",
        status: "draft",
        created_by: user.id
      })
      .select()
      .single();

    if (saveError) {
      console.error("Save error:", saveError);
      // Still return the generated data even if save fails
    }

    // Log to generation_blocks
    await supabase.from("generation_blocks").insert({
      project_id: projectId,
      block_type: "series_bible",
      status: "completed",
      input_context: {
        scriptId: script.id,
        episodeCount,
        charactersCount: characters.length,
        locationsCount: locations.length
      },
      output_data: bibleData,
      model_used: "google/gemini-2.5-pro",
      tokens_used: (aiResponse as any).usage?.total_tokens || 0
    });

    return new Response(
      JSON.stringify({
        ok: true,
        bibleId: savedBible?.id,
        bible: bibleData,
        stats: {
          durationMs,
          charactersAnalyzed: characters.length,
          episodesPlanned: bibleData.season_structure?.episodes?.length || 0,
          rulesExtracted: (bibleData.artifact_rules?.confirmed?.length || 0) + (bibleData.artifact_rules?.undefined?.length || 0)
        }
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("generate-series-bible error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ ok: false, error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
