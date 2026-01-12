import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/v3-enterprise.ts";
import { parseJsonSafe } from "../_shared/llmJson.ts";

// ═══════════════════════════════════════════════════════════════════════════════
// V3 OUTLINE WORKER - Step-based async processor with resumability
// ═══════════════════════════════════════════════════════════════════════════════
// Stages: summarize → outline → merge
// Each stage < 90s, saves progress to DB between steps
// Can be resumed from any stage if interrupted
// ═══════════════════════════════════════════════════════════════════════════════

// Model configuration
const FAST_MODEL = 'google/gemini-2.5-flash';
const QUALITY_MODEL = 'openai/gpt-5';
const LONG_INPUT_THRESHOLD = 12000;
const MULTI_EPISODE_THRESHOLD = 1;

// Timeout configuration per stage (must complete within gateway limits)
const STAGE_TIMEOUT_MS = 85000; // 85 seconds per stage (gateway cuts at ~100s)
const MAX_ATTEMPTS = 3;

interface OutlineRecord {
  id: string;
  project_id: string;
  status: string;
  stage: string;
  progress: number;
  attempts: number;
  input_chars: number | null;
  summary_text: string | null;
  outline_json: any;
  idea_text?: string;
  format?: string;
  episode_count?: number;
  narrative_mode?: string;
  genre?: string;
  tone?: string;
}

// Update outline record helper
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

// Call Lovable AI with timeout
async function callLovableAI(
  systemPrompt: string,
  userPrompt: string,
  model: string,
  maxTokens: number,
  timeoutMs: number
): Promise<{ content: string; toolArgs?: string }> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY not configured');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

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
    if (err.name === 'AbortError') {
      throw new Error('AI_TIMEOUT: Stage timeout exceeded');
    }
    throw err;
  }
}

// Call Lovable AI with tool schema
async function callLovableAIWithTool(
  systemPrompt: string,
  userPrompt: string,
  model: string,
  maxTokens: number,
  toolName: string,
  toolSchema: any,
  timeoutMs: number
): Promise<{ toolArgs: string | null; content: string }> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY not configured');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

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
    if (err.name === 'AbortError') {
      throw new Error('AI_TIMEOUT: Stage timeout exceeded');
    }
    throw err;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// STAGE A: SUMMARIZE (for long inputs only)
// ═══════════════════════════════════════════════════════════════════════════════
async function stageSummarize(
  supabase: SupabaseClient,
  outline: OutlineRecord,
  ideaText: string
): Promise<{ summary: string; skipped: boolean }> {
  const inputChars = ideaText.length;

  // Skip summarization for short inputs
  if (inputChars <= LONG_INPUT_THRESHOLD) {
    console.log(`[WORKER] Summarize skipped (${inputChars} chars <= ${LONG_INPUT_THRESHOLD})`);
    await updateOutline(supabase, outline.id, {
      stage: 'outline',
      progress: 33,
      summary_text: ideaText,
      input_chars: inputChars
    });
    return { summary: ideaText, skipped: true };
  }

  console.log(`[WORKER] Stage SUMMARIZE: ${inputChars} chars`);
  await updateOutline(supabase, outline.id, { 
    status: 'generating', 
    stage: 'summarize',
    input_chars: inputChars 
  });

  const systemPrompt = `Eres un asistente experto en resumir guiones y novelas para producción audiovisual.

INSTRUCCIONES:
1. Resume el texto manteniendo TODOS los elementos narrativos clave:
   - Nombres de TODOS los personajes mencionados
   - TODAS las localizaciones específicas
   - Arcos argumentales principales
   - Eventos clave y giros dramáticos
   - Relaciones entre personajes
   - Tono y género
2. Mantén el resumen en máximo 8,000 caracteres
3. NO omitas personajes ni localizaciones - son críticos para la producción
4. Usa el mismo idioma que el texto original`;

  const userPrompt = `Resume el siguiente texto para generación de outline audiovisual:\n\n${ideaText}`;

  try {
    const { content } = await callLovableAI(
      systemPrompt, 
      userPrompt, 
      FAST_MODEL, 
      4000, 
      STAGE_TIMEOUT_MS
    );

    const summary = content || ideaText.slice(0, 8000);
    console.log(`[WORKER] Summarized ${inputChars} -> ${summary.length} chars`);

    await updateOutline(supabase, outline.id, {
      stage: 'outline',
      progress: 33,
      summary_text: summary
    });

    return { summary, skipped: false };
  } catch (err) {
    console.error('[WORKER] Summarize failed:', err);
    // Fallback: truncate
    const truncated = ideaText.slice(0, 8000) + '\n\n[TEXTO TRUNCADO]';
    await updateOutline(supabase, outline.id, {
      stage: 'outline',
      progress: 33,
      summary_text: truncated
    });
    return { summary: truncated, skipped: false };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// STAGE B: OUTLINE GENERATION
// ═══════════════════════════════════════════════════════════════════════════════
const OUTLINE_TOOL_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    logline: { type: 'string' },
    genre: { type: 'string' },
    tone: { type: 'string' },
    narrative_mode: { type: 'string' },
    synopsis: { type: 'string' },
    main_characters: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          role: { type: 'string' },
          description: { type: 'string' }
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

async function stageOutline(
  supabase: SupabaseClient,
  outline: OutlineRecord,
  summaryText: string
): Promise<any> {
  console.log(`[WORKER] Stage OUTLINE: generating structure`);
  await updateOutline(supabase, outline.id, { stage: 'outline', progress: 40 });

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

  const systemPrompt = `Eres MASTER_SHOWRUNNER_ENGINE, un showrunner profesional de nivel estudio.
Tu función es diseñar series y películas ADICTIVAS con identidad CLARA.

REGLAS:
- Cada episodio DEBE terminar con cliffhanger REAL
- Cada episodio DEBE cambiar el estado del mundo
- NO narrativa genérica
- Convierte ideas en ACCIONES y CONSECUENCIAS

Responde ÚNICAMENTE usando la herramienta deliver_outline.`;

  const userPrompt = `GENERA OUTLINE PARA:

IDEA: ${summaryText}

CONFIGURACIÓN:
- Formato: ${format}
- Episodios: ${episodesCount}
- Género: ${genre || 'auto-detectar'}
- Tono: ${tone || 'auto-detectar'}
- Modo narrativo: ${narrativeMode}

REQUISITOS:
- episode_beats debe tener EXACTAMENTE ${episodesCount} elementos
- Cada episodio numerado 1..${episodesCount}
- Cliffhanger POTENTE en cada episodio`;

  try {
    const { toolArgs, content } = await callLovableAIWithTool(
      systemPrompt,
      userPrompt,
      model,
      16000,
      'deliver_outline',
      OUTLINE_TOOL_SCHEMA,
      STAGE_TIMEOUT_MS
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
        summary: 'Por generar',
        cliffhanger: 'Por definir'
      });
    }
    parsedOutline.episode_beats = parsedOutline.episode_beats.slice(0, episodesCount);

    // Add narrative mode
    parsedOutline.narrative_mode = narrativeMode;

    await updateOutline(supabase, outline.id, {
      stage: 'merge',
      progress: 66,
      outline_json: parsedOutline
    });

    return parsedOutline;
  } catch (err: any) {
    console.error('[WORKER] Outline generation failed:', err);
    
    // If it's a timeout, save partial progress
    if (err.message?.includes('AI_TIMEOUT')) {
      await updateOutline(supabase, outline.id, {
        error_code: 'STAGE_TIMEOUT',
        error_detail: 'Outline stage timed out'
      });
    }
    
    throw err;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// STAGE C: MERGE/FINALIZE
// ═══════════════════════════════════════════════════════════════════════════════
async function stageMerge(
  supabase: SupabaseClient,
  outline: OutlineRecord,
  outlineJson: any
): Promise<any> {
  console.log(`[WORKER] Stage MERGE: finalizing`);
  await updateOutline(supabase, outline.id, { stage: 'merge', progress: 80 });

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
    qc_status: outlineJson.qc_status || 'pass'
  };

  // QC checks
  const qcIssues: string[] = [];
  normalized.episode_beats.forEach((ep: any, i: number) => {
    if (!ep.cliffhanger || ep.cliffhanger.length < 10) {
      qcIssues.push(`Episodio ${i + 1}: falta cliffhanger efectivo`);
    }
  });

  if (qcIssues.length > 0) {
    normalized.qc_warnings = qcIssues;
  }

  // Mark as completed
  await updateOutline(supabase, outline.id, {
    status: 'draft',
    stage: 'done',
    progress: 100,
    outline_json: normalized,
    qc_issues: qcIssues.length > 0 ? qcIssues : null,
    error_code: null,
    error_detail: null
  });

  console.log(`[WORKER] Completed: ${normalized.title} | ${normalized.episode_beats.length} episodes`);
  return normalized;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN WORKER SERVE
// ═══════════════════════════════════════════════════════════════════════════════
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
      query = query.eq('project_id', projectId).in('status', ['queued', 'generating', 'timeout']).order('updated_at', { ascending: false }).limit(1);
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

    // Increment attempts
    await updateOutline(supabase, outline.id, {
      status: 'generating',
      attempts: (outline.attempts || 0) + 1
    });

    // Determine current stage and resume
    const currentStage = outline.stage || 'none';
    console.log(`[WORKER] Processing outline ${outline.id} | Stage: ${currentStage} | Attempt: ${outline.attempts + 1}`);

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

    // Stage C: Merge
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
        error_detail: err.message || 'Unknown error'
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
