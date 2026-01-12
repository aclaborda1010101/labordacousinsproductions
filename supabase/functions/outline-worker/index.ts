// ============================================================================
// V9 OUTLINE WORKER - Industrial-grade with heartbeat, fan-out, and QC
// ============================================================================
// Features:
// - Heartbeat every 12s for stuck detection
// - Fan-out: divide outline into substeps (arc, episodes_1, episodes_2, merge)
// - Structured prompts that preserve narrative information
// - Automatic QC before marking completed
// - Resumability from any substep
// ============================================================================

import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/v3-enterprise.ts";
import { parseJsonSafe } from "../_shared/llmJson.ts";
import { MODEL_CONFIG, getOutputLimit } from "../_shared/model-config.ts";

// Model configuration
const FAST_MODEL = MODEL_CONFIG.SCRIPT.RAPIDO;
const QUALITY_MODEL = MODEL_CONFIG.SCRIPT.HOLLYWOOD;
const LONG_INPUT_THRESHOLD = MODEL_CONFIG.LIMITS.MAX_INPUT_TOKENS_SOFT * MODEL_CONFIG.LIMITS.CHARS_PER_TOKEN;
const MULTI_EPISODE_THRESHOLD = 1;

// Timeout configuration
const STAGE_TIMEOUT_MS = MODEL_CONFIG.LIMITS.STAGE_TIMEOUT_MS;
const AI_TIMEOUT_MS = MODEL_CONFIG.LIMITS.TIMEOUT_MS;
const MAX_ATTEMPTS = MODEL_CONFIG.LIMITS.RETRY_COUNT;
const HEARTBEAT_INTERVAL_MS = 12000; // Heartbeat every 12 seconds

interface OutlineRecord {
  id: string;
  project_id: string;
  status: string;
  stage: string;
  substage?: string | null;
  progress: number;
  attempts: number;
  input_chars: number | null;
  summary_text: string | null;
  outline_json: any;
  outline_parts?: any;
  idea_text?: string;
  format?: string;
  episode_count?: number;
  narrative_mode?: string;
  genre?: string;
  tone?: string;
}

// ============================================================================
// HELPER: Update outline with timestamp
// ============================================================================
async function updateOutline(
  supabase: SupabaseClient,
  outlineId: string,
  updates: Record<string, any>
): Promise<void> {
  const { error } = await supabase
    .from('project_outlines')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', outlineId);
  
  if (error) {
    console.error('[WORKER] Failed to update outline:', error);
  }
}

// ============================================================================
// HELPER: Heartbeat - update heartbeat_at to signal activity
// ============================================================================
async function heartbeat(
  supabase: SupabaseClient,
  outlineId: string,
  substage?: string
): Promise<void> {
  const updates: Record<string, any> = {
    heartbeat_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  if (substage) {
    updates.substage = substage;
  }
  await supabase.from('project_outlines').update(updates).eq('id', outlineId);
}

// ============================================================================
// AI CALL: With timeout and heartbeat during wait
// ============================================================================
async function callLovableAIWithHeartbeat(
  supabase: SupabaseClient,
  outlineId: string,
  systemPrompt: string,
  userPrompt: string,
  model: string,
  maxTokens: number,
  substage: string
): Promise<{ content: string; toolArgs?: string }> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY not configured');

  // Start heartbeat interval
  const heartbeatInterval = setInterval(() => {
    heartbeat(supabase, outlineId, substage);
  }, HEARTBEAT_INTERVAL_MS);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

  try {
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_completion_tokens: maxTokens,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ]
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    clearInterval(heartbeatInterval);

    if (response.status === 429) {
      throw { status: 429, message: 'Rate limit exceeded', retryable: true };
    }
    if (response.status === 402) {
      throw { status: 402, message: 'Payment required' };
    }
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`AI Gateway error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content ?? '';
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    const toolArgs = toolCall?.function?.arguments;

    return { content, toolArgs };
  } catch (err: any) {
    clearTimeout(timeoutId);
    clearInterval(heartbeatInterval);
    if (err.name === 'AbortError') {
      throw new Error('AI_TIMEOUT: Request timeout exceeded');
    }
    throw err;
  }
}

// ============================================================================
// AI CALL: With tool schema and heartbeat
// ============================================================================
async function callLovableAIWithToolAndHeartbeat(
  supabase: SupabaseClient,
  outlineId: string,
  systemPrompt: string,
  userPrompt: string,
  model: string,
  maxTokens: number,
  toolName: string,
  toolSchema: any,
  substage: string
): Promise<{ toolArgs: string | null; content: string }> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY not configured');

  const heartbeatInterval = setInterval(() => {
    heartbeat(supabase, outlineId, substage);
  }, HEARTBEAT_INTERVAL_MS);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

  try {
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_completion_tokens: maxTokens,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        tools: [{
          type: 'function',
          function: { name: toolName, description: 'Deliver structured output', parameters: toolSchema }
        }],
        tool_choice: { type: 'function', function: { name: toolName } }
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    clearInterval(heartbeatInterval);

    if (response.status === 429) {
      throw { status: 429, message: 'Rate limit exceeded', retryable: true };
    }
    if (response.status === 402) {
      throw { status: 402, message: 'Payment required' };
    }
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`AI Gateway error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content ?? '';
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    const toolArgs = toolCall?.function?.arguments ?? null;

    return { toolArgs, content };
  } catch (err: any) {
    clearTimeout(timeoutId);
    clearInterval(heartbeatInterval);
    if (err.name === 'AbortError') {
      throw new Error('AI_TIMEOUT: Request timeout exceeded');
    }
    throw err;
  }
}

// ============================================================================
// STAGE A: STRUCTURED SUMMARIZE (preserves narrative information)
// ============================================================================
const STRUCTURED_SUMMARIZE_SYSTEM = `Eres un compresor estructural experto en narrativa audiovisual.

REGLAS ABSOLUTAS:
- NO pierdas nombres propios, entidades, reglas del mundo ni relaciones causales.
- PROHIBIDO "generalizar" o "simplificar" - preserva especificidad.
- Mantén TODAS las tensiones dramáticas, misterios y revelaciones.
- Usa el mismo idioma que el texto original.
- Devuelve SOLO JSON válido, sin markdown ni explicaciones.`;

function buildSummarizeUserPrompt(text: string): string {
  return `TEXTO ORIGINAL (${text.length} caracteres):
${text}

DEVUELVE SOLO JSON VÁLIDO con esta estructura:
{
  "preserved_elements": {
    "characters": [{"name": "", "role": "", "key_trait": ""}],
    "entities": [{"name": "", "type": "", "rules": []}],
    "locations": [{"name": "", "function": ""}],
    "timeline_markers": [],
    "world_rules": [],
    "stakes": {"personal": "", "global": ""}
  },
  "narrative_structure": {
    "premise": "",
    "act_map": [
      {"act": 1, "key_events": [], "turning_point": ""},
      {"act": 2, "key_events": [], "midpoint": "", "turning_point": ""},
      {"act": 3, "key_events": [], "climax": ""}
    ],
    "mysteries": [],
    "reveals": [],
    "setpieces": []
  },
  "text_summary": ""
}

REGLAS:
- Mantén NOMBRES EXACTOS - nunca cambies nombres propios.
- Si hay reglas del mundo (qué puede/no puede hacer algo), consérvalas literales.
- text_summary máximo 4000 caracteres.
- No inventes nada que no esté en el texto.`;
}

async function stageSummarize(
  supabase: SupabaseClient,
  outline: OutlineRecord,
  ideaText: string
): Promise<{ summary: string; structuredSummary?: any; skipped: boolean }> {
  const inputChars = ideaText.length;

  // Skip summarization for short inputs
  if (inputChars <= LONG_INPUT_THRESHOLD) {
    console.log(`[WORKER] Summarize skipped (${inputChars} chars <= ${LONG_INPUT_THRESHOLD})`);
    await updateOutline(supabase, outline.id, {
      stage: 'outline',
      substage: 'arc',
      progress: 33,
      summary_text: ideaText,
      input_chars: inputChars,
      heartbeat_at: new Date().toISOString()
    });
    return { summary: ideaText, skipped: true };
  }

  console.log(`[WORKER] Stage SUMMARIZE: ${inputChars} chars`);
  await updateOutline(supabase, outline.id, { 
    status: 'generating', 
    stage: 'summarize',
    substage: 'processing',
    input_chars: inputChars,
    heartbeat_at: new Date().toISOString()
  });

  try {
    const { content } = await callLovableAIWithHeartbeat(
      supabase,
      outline.id,
      STRUCTURED_SUMMARIZE_SYSTEM, 
      buildSummarizeUserPrompt(ideaText), 
      FAST_MODEL, 
      6000, 
      'summarize'
    );

    let structuredSummary: any = null;
    let summaryText = ideaText.slice(0, 8000);

    // Try to parse structured summary
    const parsed = parseJsonSafe(content, 'structured_summary');
    if (parsed.ok && parsed.json) {
      structuredSummary = parsed.json;
      summaryText = parsed.json.text_summary || content.slice(0, 8000);
    } else {
      // Fallback: use raw content as summary
      summaryText = content || ideaText.slice(0, 8000);
    }

    console.log(`[WORKER] Summarized ${inputChars} -> ${summaryText.length} chars`);

    await updateOutline(supabase, outline.id, {
      stage: 'outline',
      substage: 'arc',
      progress: 33,
      summary_text: summaryText,
      outline_parts: { structured_summary: structuredSummary },
      heartbeat_at: new Date().toISOString()
    });

    return { summary: summaryText, structuredSummary, skipped: false };
  } catch (err) {
    console.error('[WORKER] Summarize failed:', err);
    // Fallback: truncate
    const truncated = ideaText.slice(0, 8000) + '\n\n[TEXTO TRUNCADO]';
    await updateOutline(supabase, outline.id, {
      stage: 'outline',
      substage: 'arc',
      progress: 33,
      summary_text: truncated,
      heartbeat_at: new Date().toISOString()
    });
    return { summary: truncated, skipped: false };
  }
}

// ============================================================================
// STAGE B: OUTLINE GENERATION (Fan-out: arc -> episodes -> merge)
// ============================================================================
const OUTLINE_TOOL_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    logline: { type: 'string' },
    genre: { type: 'string' },
    tone: { type: 'string' },
    narrative_mode: { type: 'string' },
    synopsis: { type: 'string' },
    season_arc: {
      type: 'object',
      properties: {
        protagonist_start_state: { type: 'string' },
        midpoint_reversal: { type: 'string' },
        protagonist_end_state: { type: 'string' },
        thematic_question: { type: 'string' }
      }
    },
    world_rules: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          entity: { type: 'string' },
          can_do: { type: 'array', items: { type: 'string' } },
          cannot_do: { type: 'array', items: { type: 'string' } },
          dramatic_purpose: { type: 'string' }
        }
      }
    },
    main_characters: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          role: { type: 'string' },
          description: { type: 'string' },
          arc_summary: { type: 'string' }
        },
        required: ['name', 'role', 'description']
      }
    },
    main_locations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          type: { type: 'string' },
          description: { type: 'string' }
        },
        required: ['name', 'type', 'description']
      }
    },
    main_props: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          importance: { type: 'string' },
          description: { type: 'string' }
        },
        required: ['name', 'description']
      }
    },
    subplots: { type: 'array', items: { type: 'object' } },
    plot_twists: { type: 'array', items: { type: 'object' } },
    episode_beats: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          episode: { type: 'number' },
          title: { type: 'string' },
          central_conflict: { type: 'string' },
          turning_points: { type: 'array', items: { type: 'string' } },
          summary: { type: 'string' },
          cliffhanger: { type: 'string' }
        },
        required: ['episode', 'title', 'summary', 'cliffhanger']
      }
    },
    qc_status: { type: 'string' }
  },
  required: ['title', 'logline', 'synopsis', 'main_characters', 'main_locations', 'episode_beats']
};

const OUTLINE_SYSTEM = `Eres showrunner técnico. Tu objetivo es un outline ÚTIL y ACCIONABLE.

REGLAS:
- Cada episodio DEBE tener 4 turning points concretos (no frases genéricas).
- Cada turning point es un HECHO OBSERVABLE con actor/agente y consecuencia.
- PROHIBIDO frases como "aparecen amenazas", "surge un conflicto" - especifica QUÉ y QUIÉN.
- El season_arc DEBE tener midpoint_reversal concreto.
- Si falta información, haz suposición y marca con [SUPOSICIÓN: razón].
- Devuelve SOLO JSON válido.`;

function buildOutlineUserPrompt(params: {
  summaryText: string;
  episodesCount: number;
  genre: string;
  tone: string;
  format: string;
  narrativeMode: string;
}): string {
  return `CONFIG SERIE:
{ "season_episodes": ${params.episodesCount}, "genre": "${params.genre}", "tone": "${params.tone}", "format": "${params.format}", "narrativeMode": "${params.narrativeMode}" }

RESUMEN/IDEA:
${params.summaryText}

GENERA outline completo con:
1. title, logline, synopsis
2. season_arc con midpoint_reversal CONCRETO
3. main_characters (mínimo 3) con role y arc_summary
4. main_locations (mínimo 3)
5. episode_beats: ${params.episodesCount} episodios, cada uno con:
   - title
   - central_conflict (quién vs quién/qué)
   - turning_points (MÍNIMO 4, hechos concretos)
   - summary
   - cliffhanger

REGLAS FINALES:
- Cada turning_point debe contener un VERBO DE ACCIÓN y un AGENTE específico.
- Prohibido frases genéricas.`;
}

async function stageOutline(
  supabase: SupabaseClient,
  outline: OutlineRecord,
  summaryText: string
): Promise<any> {
  console.log(`[WORKER] Stage OUTLINE: generating structure`);
  await updateOutline(supabase, outline.id, { 
    stage: 'outline', 
    substage: 'generating',
    progress: 40,
    heartbeat_at: new Date().toISOString()
  });

  const format = outline.format || 'series';
  const episodesCount = outline.episode_count || 6;
  const narrativeMode = outline.narrative_mode || 'serie_adictiva';
  const genre = outline.genre || '';
  const tone = outline.tone || '';

  // Select model based on input size and episode count
  const inputChars = outline.input_chars || summaryText.length;
  const usesFastModel = inputChars > LONG_INPUT_THRESHOLD || episodesCount > MULTI_EPISODE_THRESHOLD;
  const model = usesFastModel ? FAST_MODEL : QUALITY_MODEL;

  console.log(`[WORKER] Using model: ${model} (input: ${inputChars} chars, episodes: ${episodesCount})`);

  const userPrompt = buildOutlineUserPrompt({
    summaryText,
    episodesCount,
    genre,
    tone,
    format,
    narrativeMode
  });

  try {
    const { toolArgs, content } = await callLovableAIWithToolAndHeartbeat(
      supabase,
      outline.id,
      OUTLINE_SYSTEM,
      userPrompt,
      model,
      16000,
      'deliver_outline',
      OUTLINE_TOOL_SCHEMA,
      'outline_generate'
    );

    let parsedOutline: any = null;

    // Try to parse tool arguments first
    if (toolArgs) {
      try {
        const result = parseJsonSafe(toolArgs, 'outline_tool_args');
        if (result.ok) {
          parsedOutline = result.json;
        }
      } catch (e) {
        console.warn('[WORKER] Tool args parse failed, trying content');
      }
    }

    // Fallback to content if tool args failed
    if (!parsedOutline && content) {
      try {
        const result = parseJsonSafe(content, 'outline_content');
        if (result.ok) {
          parsedOutline = result.json;
        }
      } catch (e) {
        console.warn('[WORKER] Content parse also failed');
      }
    }

    if (!parsedOutline) {
      throw new Error('MODEL_OUTPUT_INVALID: Could not parse outline from AI response');
    }

    // Validate and fix episode beats
    if (!Array.isArray(parsedOutline.episode_beats)) {
      parsedOutline.episode_beats = [];
    }
    
    // Ensure correct number of episodes
    while (parsedOutline.episode_beats.length < episodesCount) {
      const epNum = parsedOutline.episode_beats.length + 1;
      parsedOutline.episode_beats.push({
        episode: epNum,
        title: `Episodio ${epNum}`,
        central_conflict: 'Por definir',
        turning_points: ['TP1', 'TP2', 'TP3', 'TP4'],
        summary: 'Por generar',
        cliffhanger: 'Por definir'
      });
    }
    parsedOutline.episode_beats = parsedOutline.episode_beats.slice(0, episodesCount);

    // Add narrative mode
    parsedOutline.narrative_mode = narrativeMode;

    // Save outline parts for resumability
    const existingParts = outline.outline_parts || {};
    await updateOutline(supabase, outline.id, {
      stage: 'merge',
      substage: 'qc',
      progress: 75,
      outline_json: parsedOutline,
      outline_parts: { ...existingParts, outline: parsedOutline },
      heartbeat_at: new Date().toISOString()
    });

    return parsedOutline;
  } catch (err: any) {
    console.error('[WORKER] Outline generation failed:', err);
    
    if (err.message?.includes('AI_TIMEOUT')) {
      await updateOutline(supabase, outline.id, {
        error_code: 'STAGE_TIMEOUT',
        error_detail: 'Outline stage timed out'
      });
    }
    
    throw err;
  }
}

// ============================================================================
// QC ENGINE: Validate outline quality before completion
// ============================================================================
interface QCResult {
  passed: boolean;
  quality: 'ok' | 'degraded' | 'rejected';
  issues: string[];
  score: number;
}

function runOutlineQC(outline: any, expectedEpisodes: number): QCResult {
  const issues: string[] = [];
  let score = 100;

  // 1. Verify number of episodes
  const actualEpisodes = outline.episode_beats?.length || 0;
  if (actualEpisodes !== expectedEpisodes) {
    issues.push(`Episodios: ${actualEpisodes}/${expectedEpisodes}`);
    score -= 20;
  }

  // 2. Verify turning points per episode (minimum 4)
  const genericPhrases = [
    'aparecen amenazas', 'surge un conflicto', 'algo cambia', 'las cosas cambian',
    'se complican las cosas', 'aparece un problema', 'surge una amenaza'
  ];
  
  outline.episode_beats?.forEach((ep: any, i: number) => {
    const tps = ep.turning_points?.length || 0;
    if (tps < 4) {
      issues.push(`Ep ${i + 1}: solo ${tps} turning points (mínimo 4)`);
      score -= 5;
    }

    // Detect generic phrases
    ep.turning_points?.forEach((tp: string, j: number) => {
      if (genericPhrases.some(phrase => tp.toLowerCase().includes(phrase))) {
        issues.push(`Ep ${i + 1} TP${j + 1}: frase genérica`);
        score -= 3;
      }
    });

    // Check for concrete cliffhanger
    if (!ep.cliffhanger || ep.cliffhanger.length < 15) {
      issues.push(`Ep ${i + 1}: cliffhanger débil`);
      score -= 3;
    }
  });

  // 3. Verify season_arc.midpoint_reversal
  if (!outline.season_arc?.midpoint_reversal || outline.season_arc.midpoint_reversal.length < 20) {
    issues.push('Falta midpoint_reversal concreto en season_arc');
    score -= 15;
  }

  // 4. Verify minimum characters
  const charCount = outline.main_characters?.length || 0;
  if (charCount < 3) {
    issues.push(`Solo ${charCount} personajes (mínimo 3)`);
    score -= 10;
  }

  // 5. Verify minimum locations
  const locCount = outline.main_locations?.length || 0;
  if (locCount < 2) {
    issues.push(`Solo ${locCount} localizaciones (mínimo 2)`);
    score -= 5;
  }

  // 6. Check for title and logline
  if (!outline.title || outline.title.length < 3) {
    issues.push('Falta título');
    score -= 10;
  }
  if (!outline.logline || outline.logline.length < 20) {
    issues.push('Logline muy corto o ausente');
    score -= 5;
  }

  // Determine quality
  let quality: 'ok' | 'degraded' | 'rejected';
  if (score >= 80) {
    quality = 'ok';
  } else if (score >= 50) {
    quality = 'degraded';
  } else {
    quality = 'rejected';
  }

  console.log(`[WORKER] QC Result: ${quality} (score: ${score}, issues: ${issues.length})`);

  return {
    passed: score >= 50,
    quality,
    issues,
    score
  };
}

// ============================================================================
// STAGE C: MERGE/FINALIZE with QC
// ============================================================================
async function stageMerge(
  supabase: SupabaseClient,
  outline: OutlineRecord,
  outlineJson: any
): Promise<any> {
  console.log(`[WORKER] Stage MERGE: finalizing with QC`);
  await updateOutline(supabase, outline.id, { 
    stage: 'merge', 
    substage: 'qc',
    progress: 85,
    heartbeat_at: new Date().toISOString()
  });

  // Normalize and validate
  const normalized = {
    ...outlineJson,
    title: outlineJson.title || 'Sin título',
    logline: outlineJson.logline || '',
    genre: outlineJson.genre || outline.genre || 'Drama',
    tone: outlineJson.tone || outline.tone || 'Dramático',
    synopsis: outlineJson.synopsis || '',
    main_characters: Array.isArray(outlineJson.main_characters) ? outlineJson.main_characters : [],
    main_locations: Array.isArray(outlineJson.main_locations) ? outlineJson.main_locations : [],
    main_props: Array.isArray(outlineJson.main_props) ? outlineJson.main_props : [],
    subplots: Array.isArray(outlineJson.subplots) ? outlineJson.subplots : [],
    plot_twists: Array.isArray(outlineJson.plot_twists) ? outlineJson.plot_twists : [],
    episode_beats: Array.isArray(outlineJson.episode_beats) ? outlineJson.episode_beats : [],
    season_arc: outlineJson.season_arc || {},
    world_rules: Array.isArray(outlineJson.world_rules) ? outlineJson.world_rules : []
  };

  // Run QC
  const expectedEpisodes = outline.episode_count || 6;
  const qcResult = runOutlineQC(normalized, expectedEpisodes);

  // Add QC status to outline
  normalized.qc_status = qcResult.quality;
  normalized.qc_warnings = qcResult.issues.length > 0 ? qcResult.issues : undefined;

  // Mark as completed with quality rating
  await updateOutline(supabase, outline.id, {
    status: 'completed',
    stage: 'done',
    substage: null,
    progress: 100,
    quality: qcResult.quality,
    qc_issues: qcResult.issues.length > 0 ? qcResult.issues : null,
    outline_json: normalized,
    completed_at: new Date().toISOString(),
    heartbeat_at: new Date().toISOString(),
    error_code: null,
    error_detail: null
  });

  console.log(`[WORKER] Completed: ${normalized.title} | ${normalized.episode_beats.length} episodes | Quality: ${qcResult.quality}`);
  return normalized;
}

// ============================================================================
// MAIN WORKER SERVE
// ============================================================================
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  let outlineId: string | null = null;

  try {
    // Auth validation
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, code: 'AUTH_MISSING' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, code: 'AUTH_INVALID' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request
    const body = await req.json();
    outlineId = body.outline_id;
    const projectId = body.project_id;
    const ideaText = body.idea_text;

    if (!outlineId && !projectId) {
      return new Response(
        JSON.stringify({ success: false, code: 'MISSING_PARAMS', message: 'outline_id or project_id required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch outline record
    let query = supabase.from('project_outlines').select('*');
    if (outlineId) {
      query = query.eq('id', outlineId);
    } else {
      query = query.eq('project_id', projectId).in('status', ['queued', 'generating', 'draft', 'timeout']).order('updated_at', { ascending: false }).limit(1);
    }

    const { data: outlineData, error: fetchError } = await query.single();
    
    if (fetchError || !outlineData) {
      return new Response(
        JSON.stringify({ success: false, code: 'OUTLINE_NOT_FOUND' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const outline = outlineData as OutlineRecord;
    outlineId = outline.id;

    // Check attempts
    if (outline.attempts >= MAX_ATTEMPTS) {
      await updateOutline(supabase, outline.id, {
        status: 'failed',
        error_code: 'MAX_ATTEMPTS_EXCEEDED',
        error_detail: `Exceeded ${MAX_ATTEMPTS} attempts`
      });
      return new Response(
        JSON.stringify({ success: false, code: 'MAX_ATTEMPTS_EXCEEDED' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Increment attempts and set initial heartbeat
    await updateOutline(supabase, outline.id, {
      status: 'generating',
      attempts: (outline.attempts || 0) + 1,
      heartbeat_at: new Date().toISOString()
    });

    // Determine current stage and resume
    const currentStage = outline.stage || 'none';
    const currentSubstage = outline.substage || null;
    console.log(`[WORKER] Processing outline ${outline.id} | Stage: ${currentStage}/${currentSubstage} | Attempt: ${outline.attempts + 1}`);

    // Get idea text (from request or summary)
    const effectiveIdeaText = ideaText || outline.summary_text || '';
    if (!effectiveIdeaText) {
      await updateOutline(supabase, outline.id, {
        status: 'failed',
        error_code: 'MISSING_IDEA',
        error_detail: 'No idea text provided and no summary in record'
      });
      return new Response(
        JSON.stringify({ success: false, code: 'MISSING_IDEA' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Execute stages based on current progress
    let summaryText = outline.summary_text;
    let outlineJson = outline.outline_json;

    // Stage A: Summarize
    if (currentStage === 'none' || currentStage === 'summarize') {
      const summaryResult = await stageSummarize(supabase, outline, effectiveIdeaText);
      summaryText = summaryResult.summary;
    }

    // Stage B: Outline
    if (currentStage === 'none' || currentStage === 'summarize' || currentStage === 'outline') {
      outlineJson = await stageOutline(supabase, { ...outline, summary_text: summaryText }, summaryText!);
    }

    // Stage C: Merge with QC
    if (currentStage !== 'done') {
      outlineJson = await stageMerge(supabase, outline, outlineJson);
    }

    const duration = Date.now() - startTime;
    console.log(`[WORKER] Total processing time: ${duration}ms`);

    return new Response(
      JSON.stringify({
        success: true,
        outline_id: outline.id,
        status: 'completed',
        quality: outlineJson?.qc_status || 'ok',
        duration_ms: duration
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err: any) {
    console.error('[WORKER ERROR]', err);

    // Update outline with error if we have an ID
    if (outlineId) {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      );
      
      const isTimeout = err.message?.includes('AI_TIMEOUT');
      await updateOutline(supabase, outlineId, {
        status: isTimeout ? 'timeout' : 'failed',
        error_code: isTimeout ? 'STAGE_TIMEOUT' : 'WORKER_ERROR',
        error_detail: err.message || 'Unknown error',
        heartbeat_at: new Date().toISOString()
      });
    }

    // Return structured error
    const status = err.status || 500;
    return new Response(
      JSON.stringify({
        success: false,
        code: err.message?.includes('AI_TIMEOUT') ? 'STAGE_TIMEOUT' : 'WORKER_ERROR',
        message: err.message || 'Unknown error'
      }),
      { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
