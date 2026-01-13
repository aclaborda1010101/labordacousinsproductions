// ============================================================================
// V10.1 OUTLINE WORKER - Industrial Pipeline with 4 Substeps + Blindaje
// ============================================================================
// Architecture:
// - PART_A: Season arc, rules, cast, locations (gpt-5.2)
// - PART_B: Episodes 1-5 with turning points (gpt-5.2)
// - PART_C: Episodes 6-10 with turning points (gpt-5.2)
// - MERGE+QC: Unify + validate with anti-vaguedad filter
// ============================================================================
// V10.1 Improvements:
// - heartbeat_at without touching updated_at (let trigger handle it)
// - Idempotent locks with input hash for resumability
// - Structural QC (deterministic) + Semantic QC (AI-based) split
// - outline_parts as {} not []
// ============================================================================

import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/v3-enterprise.ts";
import { parseJsonSafe } from "../_shared/llmJson.ts";
import { MODEL_CONFIG } from "../_shared/model-config.ts";
import { STRUCTURED_SUMMARIZE_V11, OUTLINE_CORE_V11 } from "../_shared/production-prompts.ts";
import { runStructuralQC as runStructuralQCV11, QCResult as QCResultV11 } from "../_shared/qc-validators.ts";
import { TURNING_POINT_SCHEMA, SETPIECE_SCHEMA, THREAD_USAGE_SCHEMA } from "../_shared/outline-schemas-v11.ts";
import { normalizeOutlineV11 } from "../_shared/normalize-outline-v11.ts";
// Model configuration
const FAST_MODEL = MODEL_CONFIG.SCRIPT.RAPIDO;       // gpt-5-mini
const QUALITY_MODEL = MODEL_CONFIG.SCRIPT.HOLLYWOOD; // gpt-5.2
const MERGE_MODEL = MODEL_CONFIG.SCRIPT.RAPIDO;      // gpt-5-mini for deterministic merge
const LONG_INPUT_THRESHOLD = MODEL_CONFIG.LIMITS.MAX_INPUT_TOKENS_SOFT * MODEL_CONFIG.LIMITS.CHARS_PER_TOKEN;

// Timeout configuration
const AI_TIMEOUT_MS = MODEL_CONFIG.LIMITS.TIMEOUT_MS;
const MAX_ATTEMPTS = MODEL_CONFIG.LIMITS.RETRY_COUNT;
const HEARTBEAT_INTERVAL_MS = 12000;
const MAX_EPISODES = 10;

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

// Substep lock structure for idempotent resumability
interface SubstepLock {
  status: 'pending' | 'done' | 'failed';
  hash: string;
  data?: any;
  completed_at?: string;
}

// ============================================================================
// HELPER: Hash input for idempotent substep execution
// ============================================================================
async function hashInput(text: string, config: any, substepName: string): Promise<string> {
  const input = `${text.slice(0, 2000)}|${JSON.stringify(config)}|${substepName}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
}

// ============================================================================
// HELPER: Update outline WITHOUT touching updated_at (let trigger handle it)
// ============================================================================
async function updateOutline(
  supabase: SupabaseClient,
  outlineId: string,
  updates: Record<string, any>
): Promise<void> {
  const { error } = await supabase
    .from('project_outlines')
    .update(updates)  // Don't add updated_at - let DB trigger handle it
    .eq('id', outlineId);
  
  if (error) {
    console.error('[WORKER] Failed to update outline:', error);
  }
}

// ============================================================================
// HELPER: Heartbeat - update ONLY heartbeat_at to signal activity
// ============================================================================
async function heartbeat(
  supabase: SupabaseClient,
  outlineId: string,
  substage?: string
): Promise<void> {
  const updates: Record<string, any> = {
    heartbeat_at: new Date().toISOString()
    // NO updated_at - let the trigger handle real updates
  };
  if (substage) {
    updates.substage = substage;
  }
  await supabase.from('project_outlines').update(updates).eq('id', outlineId);
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
// AI CALL: Without tool (for summarize)
// ============================================================================
async function callLovableAIWithHeartbeat(
  supabase: SupabaseClient,
  outlineId: string,
  systemPrompt: string,
  userPrompt: string,
  model: string,
  maxTokens: number,
  substage: string
): Promise<{ content: string }> {
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
        ]
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    clearInterval(heartbeatInterval);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`AI Gateway error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content ?? '';
    return { content };
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
// SCHEMAS FOR EACH SUBSTEP
// ============================================================================

// PART_A: Season structure (arc, cast, locations, rules)
const PART_A_TOOL_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    logline: { type: 'string' },
    season_arc: {
      type: 'object',
      properties: {
        start_state: { type: 'string' },
        midpoint_reversal: { type: 'string' },
        end_state: { type: 'string' },
        theme: { type: 'string' },
        stakes: { type: 'string' },
        // 5-hitos enrichment fields
        inciting_incident: { type: 'string', description: 'Triggering event in ep1' },
        first_turn: { type: 'string', description: 'Point of no return (end ep1-2)' },
        all_is_lost: { type: 'string', description: 'Maximum crisis (~75% of season)' },
        final_choice: { type: 'string', description: 'Irreversible protagonist decision' }
      },
      required: ['start_state', 'midpoint_reversal', 'end_state']
    },
    world_rules: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          rule: { type: 'string' },
          dramatic_effect: { type: 'string' }
        }
      }
    },
    cast: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          role: { type: 'string' },
          want: { type: 'string' },
          need: { type: 'string' },
          flaw: { type: 'string' },
          function: { type: 'string' }
        },
        required: ['name', 'role', 'want', 'need', 'flaw']
      }
    },
    locations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          function: { type: 'string' },
          visual_identity: { type: 'string' }
        }
      }
    },
    // Operational enrichment fields
    factions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          objective: { type: 'string' },
          resources: { type: 'array', items: { type: 'string' } },
          method: { type: 'string' },
          red_line: { type: 'string' },
          leader: { type: 'string' }
        },
        required: ['name', 'objective', 'method']
      }
    },
    entity_rules: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          entity: { type: 'string' },
          can_do: { type: 'array', items: { type: 'string' } },
          cannot_do: { type: 'array', items: { type: 'string' } },
          cost: { type: 'string' },
          dramatic_purpose: { type: 'string' }
        },
        required: ['entity', 'can_do', 'cannot_do', 'cost']
      }
    }
  },
  required: ['title', 'logline', 'season_arc', 'cast', 'locations']
};

// PART_B/C: Episodes with turning points, setpieces and thread_usage (V11)
const EPISODES_TOOL_SCHEMA = {
  type: 'object',
  properties: {
    episodes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          episode: { type: 'number' },
          title: { type: 'string' },
          central_question: { type: 'string' },
          central_conflict: { type: 'string' },
          turning_points: {
            type: 'array',
            items: TURNING_POINT_SCHEMA,
            minItems: 4
          },
          cliffhanger: { type: 'string' },
          setpiece: SETPIECE_SCHEMA,
          thread_usage: THREAD_USAGE_SCHEMA
        },
        required: ['episode', 'title', 'central_conflict', 'turning_points', 'cliffhanger', 'setpiece', 'thread_usage']
      }
    }
  },
  required: ['episodes']
};

// ============================================================================
// SYSTEM PROMPTS
// ============================================================================

const PART_A_SYSTEM = `Eres showrunner técnico. Produces estructura accionable, no un pitch vago.
No inventes elementos fuera del material. Prohibidas frases genéricas.

REGLAS ABSOLUTAS:
- midpoint_reversal OBLIGATORIO y debe ser un EVENTO CONCRETO con agente.
- world_rules mínimo 2 reglas del mundo con efecto dramático.
- cast mínimo 4 personajes, cada uno con WANT (lo que busca), NEED (lo que realmente necesita), FLAW (defecto dramático).
- locations mínimo 3 con función dramática.
- Devuelve SOLO JSON válido.`;

const EPISODES_SYSTEM = `Eres showrunner. Cada episodio requiere conflicto central, 4 turning points concretos y cliffhanger.

REGLAS ABSOLUTAS:
- PROHIBIDO frases genéricas como "aparecen amenazas", "surge un conflicto", "algo cambia".
- Cada turning point tiene: evento (QUÉ pasa), agente (QUIÉN lo hace), consecuencia (QUÉ provoca).
- turning_points deben ser HECHOS OBSERVABLES, no sensaciones.
- cliffhanger debe ser específico y generar tensión.
- NO introducir personajes fuera del cast salvo que lo declares explícitamente.
- Devuelve SOLO JSON válido.`;

// ============================================================================
// PROMPT BUILDERS
// ============================================================================

function buildPartAPrompt(summary: string, episodesCount: number, genre: string, tone: string): string {
  return `SERIES_CONFIG:
{ "season_episodes": ${episodesCount}, "episode_minutes": 60, "max_episodes": ${MAX_EPISODES}, "tone": "${tone || 'cinematográfico realista'}", "genre": "${genre || 'Drama'}" }

INPUT_SUMMARY:
${summary}

TAREA: Devuelve SOLO la estructura de la temporada (NO los episodios aún):
- title: título de la serie
- logline: máximo 2 frases
- season_arc con midpoint_reversal OBLIGATORIO y concreto (un EVENTO, no una sensación)
- world_rules: mínimo 2 reglas del mundo con dramatic_effect
- cast: mínimo 4 personajes con WANT/NEED/FLAW/function
- locations: mínimo 3 con function dramática y visual_identity

EJEMPLOS DE MIDPOINT INCORRECTO:
❌ "Todo cambia cuando descubren la verdad"
❌ "Las cosas se complican"

EJEMPLOS DE MIDPOINT CORRECTO:
✅ "Elena descubre que su padre vendió a Aelion a la corporación hace 20 años, lo que la obliga a elegir entre lealtad familiar y justicia"
✅ "Marcus mata accidentalmente a su mentor al intentar proteger el secreto, lo que lo convierte en fugitivo"`;
}

function buildPartBPrompt(summary: string, partA: any, startEp: number, endEp: number): string {
  return `SERIES_CONFIG:
{ "episode_range": "${startEp}-${endEp}", "total_episodes": ${endEp} }

SEASON_SCAFFOLD:
${JSON.stringify(partA, null, 2)}

INPUT_SUMMARY:
${summary}

TAREA: Genera episodios ${startEp} a ${endEp}. Cada episodio DEBE tener:
- episode: número
- title: título del episodio
- central_question: pregunta que el episodio responde
- central_conflict: quién vs quién/qué (ESPECÍFICO)
- turning_points: EXACTAMENTE 4, cada uno con {tp, event, agent, consequence}
- cliffhanger: gancho final CONCRETO

EJEMPLOS DE TURNING POINT INCORRECTO:
❌ {"tp":1, "event":"Surge un problema", "agent":"algo", "consequence":"las cosas cambian"}

EJEMPLOS DE TURNING POINT CORRECTO:
✅ {"tp":1, "event":"Elena encuentra el diario cifrado de su padre", "agent":"Elena", "consequence":"Descubre que el proyecto Aelion fue saboteado intencionalmente"}
✅ {"tp":2, "event":"Marcus dispara a Kowalski en defensa propia", "agent":"Marcus", "consequence":"Se convierte en sospechoso principal y pierde acceso al laboratorio"}`;
}

function buildPartCPrompt(summary: string, partA: any, partB: any, startEp: number, endEp: number): string {
  return `SERIES_CONFIG:
{ "episode_range": "${startEp}-${endEp}", "total_episodes": ${endEp} }

SEASON_SCAFFOLD:
${JSON.stringify(partA, null, 2)}

EPISODES_PREVIOS (${partB.episodes?.length || 0} episodios):
${JSON.stringify(partB.episodes || [], null, 2)}

INPUT_SUMMARY:
${summary}

TAREA: Genera episodios ${startEp} a ${endEp} continuando la escalada narrativa.

REGLAS DE ESCALADA:
- La escala debe subir: personal → institucional → civilizatorio/existencial
- Cada episodio debe preparar el siguiente
- El penúltimo episodio es el punto más bajo del protagonista
- El último episodio es la resolución (puede ser abierta pero debe cerrar arco principal)

Cada episodio DEBE tener:
- episode, title, central_question, central_conflict
- turning_points: EXACTAMENTE 4 con {tp, event, agent, consequence}
- cliffhanger: el del último episodio puede ser resolución o setup de siguiente temporada`;
}

// ============================================================================
// STAGE: SUMMARIZE (unchanged, for long inputs)
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
      progress: 30,
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

    const parsed = parseJsonSafe(content, 'structured_summary');
    if (parsed.ok && parsed.json) {
      structuredSummary = parsed.json;
      summaryText = parsed.json.text_summary || content.slice(0, 8000);
    } else {
      summaryText = content || ideaText.slice(0, 8000);
    }

    console.log(`[WORKER] Summarized ${inputChars} -> ${summaryText.length} chars`);

    await updateOutline(supabase, outline.id, {
      stage: 'outline',
      substage: 'arc',
      progress: 30,
      summary_text: summaryText,
      outline_parts: { structured_summary: structuredSummary },
      heartbeat_at: new Date().toISOString()
    });

    return { summary: summaryText, structuredSummary, skipped: false };
  } catch (err) {
    console.error('[WORKER] Summarize failed:', err);
    const truncated = ideaText.slice(0, 8000) + '\n\n[TEXTO TRUNCADO]';
    await updateOutline(supabase, outline.id, {
      stage: 'outline',
      substage: 'arc',
      progress: 30,
      summary_text: truncated,
      heartbeat_at: new Date().toISOString()
    });
    return { summary: truncated, skipped: false };
  }
}

// ============================================================================
// STAGE: OUTLINE FAN-OUT (4 substeps) with Idempotent Locks
// ============================================================================

async function executeSubstepIfNeeded(
  supabase: SupabaseClient,
  outline: OutlineRecord,
  substepName: string,
  inputHash: string,
  generator: () => Promise<any>
): Promise<{ data: any; skipped: boolean }> {
  const parts = outline.outline_parts || {};
  const existing = parts[substepName] as SubstepLock | undefined;
  
  // If already done with same hash, skip regeneration
  if (existing?.status === 'done' && existing?.hash === inputHash && existing?.data) {
    console.log(`[WORKER] ${substepName}: skipped (hash match: ${inputHash})`);
    return { data: existing.data, skipped: true };
  }
  
  // Generate new data
  const data = await generator();
  
  // Save with lock
  parts[substepName] = {
    status: 'done',
    hash: inputHash,
    data,
    completed_at: new Date().toISOString()
  } as SubstepLock;
  
  await updateOutline(supabase, outline.id, { outline_parts: parts });
  return { data, skipped: false };
}

async function stageOutlineFanOut(
  supabase: SupabaseClient,
  outline: OutlineRecord,
  summaryText: string
): Promise<any> {
  const episodesCount = Math.min(outline.episode_count || 6, MAX_EPISODES);
  const midpoint = Math.ceil(episodesCount / 2);
  
  // Recover existing parts for resumability (ensure it's an object, not array)
  let parts: any = (outline.outline_parts && typeof outline.outline_parts === 'object' && !Array.isArray(outline.outline_parts)) 
    ? outline.outline_parts 
    : {};
  
  const genre = outline.genre || 'Drama';
  const tone = outline.tone || 'Cinematográfico';
  const config = { episodesCount, genre, tone, midpoint };

  console.log(`[WORKER] Stage OUTLINE FAN-OUT: ${episodesCount} episodes, midpoint at ${midpoint}`);

  // ========================================
  // PART_A: Season arc + rules + cast + locations
  // ========================================
  const partAHash = await hashInput(summaryText, config, 'part_a');
  const partAResult = await executeSubstepIfNeeded(
    supabase, { ...outline, outline_parts: parts }, 'part_a', partAHash,
    async () => {
      console.log(`[WORKER] PART_A: generating arc/cast/locations`);
      await updateOutline(supabase, outline.id, { 
        stage: 'outline', 
        substage: 'arc', 
        progress: 35,
        heartbeat_at: new Date().toISOString()
      });
      
      const partAPrompt = buildPartAPrompt(summaryText, episodesCount, genre, tone);
      const { toolArgs, content } = await callLovableAIWithToolAndHeartbeat(
        supabase, outline.id,
        PART_A_SYSTEM, partAPrompt,
        QUALITY_MODEL, 4000,
        'deliver_part_a', PART_A_TOOL_SCHEMA, 'arc'
      );
      
      const parseResult = parseJsonSafe(toolArgs || content, 'part_a');
      if (!parseResult.json) throw new Error('PART_A failed to parse');
      
      console.log(`[WORKER] PART_A generated: ${parseResult.json.title || 'Sin título'}`);
      return parseResult.json;
    }
  );
  parts.part_a = { status: 'done', hash: partAHash, data: partAResult.data };
  
  // Update progress
  await updateOutline(supabase, outline.id, { 
    outline_parts: parts,
    progress: 50,
    heartbeat_at: new Date().toISOString()
  });
  
  // ========================================
  // PART_B: Episodes 1 - midpoint
  // ========================================
  const partBHash = await hashInput(summaryText + JSON.stringify(partAResult.data), config, 'part_b');
  const partBResult = await executeSubstepIfNeeded(
    supabase, { ...outline, outline_parts: parts }, 'part_b', partBHash,
    async () => {
      console.log(`[WORKER] PART_B: generating episodes 1-${midpoint}`);
      await updateOutline(supabase, outline.id, { 
        substage: 'episodes_1', 
        progress: 55,
        heartbeat_at: new Date().toISOString()
      });
      
      const partBPrompt = buildPartBPrompt(summaryText, partAResult.data, 1, midpoint);
      const { toolArgs, content } = await callLovableAIWithToolAndHeartbeat(
        supabase, outline.id,
        EPISODES_SYSTEM, partBPrompt,
        QUALITY_MODEL, 6000,
        'deliver_episodes', EPISODES_TOOL_SCHEMA, 'episodes_1'
      );
      
      const parseResult = parseJsonSafe(toolArgs || content, 'part_b');
      if (!parseResult.json?.episodes) throw new Error('PART_B failed to parse');
      
      console.log(`[WORKER] PART_B generated: ${parseResult.json.episodes.length} episodes`);
      return parseResult.json;
    }
  );
  parts.part_b = { status: 'done', hash: partBHash, data: partBResult.data };
  
  await updateOutline(supabase, outline.id, { 
    outline_parts: parts,
    progress: 68,
    heartbeat_at: new Date().toISOString()
  });
  
  // ========================================
  // PART_C: Episodes midpoint+1 - end (only if needed)
  // ========================================
  if (episodesCount > midpoint) {
    const partCHash = await hashInput(summaryText + JSON.stringify(partAResult.data) + JSON.stringify(partBResult.data), config, 'part_c');
    const partCResult = await executeSubstepIfNeeded(
      supabase, { ...outline, outline_parts: parts }, 'part_c', partCHash,
      async () => {
        console.log(`[WORKER] PART_C: generating episodes ${midpoint + 1}-${episodesCount}`);
        await updateOutline(supabase, outline.id, { 
          substage: 'episodes_2', 
          progress: 72,
          heartbeat_at: new Date().toISOString()
        });
        
        const partCPrompt = buildPartCPrompt(summaryText, partAResult.data, partBResult.data, midpoint + 1, episodesCount);
        const { toolArgs, content } = await callLovableAIWithToolAndHeartbeat(
          supabase, outline.id,
          EPISODES_SYSTEM, partCPrompt,
          QUALITY_MODEL, 6000,
          'deliver_episodes', EPISODES_TOOL_SCHEMA, 'episodes_2'
        );
        
        const parseResult = parseJsonSafe(toolArgs || content, 'part_c');
        console.log(`[WORKER] PART_C generated: ${parseResult.json?.episodes?.length || 0} episodes`);
        return parseResult.json;
      }
    );
    parts.part_c = { status: 'done', hash: partCHash, data: partCResult.data };
    
    await updateOutline(supabase, outline.id, { 
      outline_parts: parts,
      progress: 82,
      heartbeat_at: new Date().toISOString()
    });
  }
  
  // ========================================
  // MERGE: Unify all parts locally
  // ========================================
  console.log(`[WORKER] MERGE: unifying parts`);
  await updateOutline(supabase, outline.id, { 
    stage: 'merge',
    substage: 'merging', 
    progress: 85,
    heartbeat_at: new Date().toISOString()
  });
  
  // Extract data from lock structure
  const partsData = {
    part_a: parts.part_a?.data || parts.part_a,
    part_b: parts.part_b?.data || parts.part_b,
    part_c: parts.part_c?.data || parts.part_c
  };
  
  const merged = mergeOutlineParts(partsData, episodesCount);
  
  // Save unified outline
  await updateOutline(supabase, outline.id, { 
    outline_json: merged,
    outline_parts: parts,
    progress: 88,
    heartbeat_at: new Date().toISOString()
  });
  
  return merged;
}

// ============================================================================
// MERGE FUNCTION: Combine all parts into final outline (V11 - preserve TP objects)
// ============================================================================
function mergeOutlineParts(parts: any, expectedEpisodes: number): any {
  const partA = parts.part_a || {};
  const episodesB = parts.part_b?.episodes || [];
  const episodesC = parts.part_c?.episodes || [];
  
  // Combine episodes
  const allEpisodes = [...episodesB, ...episodesC];
  
  // Normalize episodes to V11 format (PRESERVE TP OBJECTS)
  const normalizedEpisodes = allEpisodes.map((ep: any, i: number) => {
    // V11: Keep turning_points as objects, don't convert to strings
    const tps = Array.isArray(ep.turning_points) 
      ? ep.turning_points.map((tp: any, j: number) => {
          if (typeof tp === 'object' && tp !== null) {
            return {
              tp: tp.tp || j + 1,
              agent: tp.agent || 'Agente',
              event: tp.event || 'Evento',
              consequence: tp.consequence || 'Consecuencia'
            };
          }
          // Convert legacy string TPs to objects
          return {
            tp: j + 1,
            agent: 'Por definir',
            event: typeof tp === 'string' ? tp : 'Evento',
            consequence: 'Por definir'
          };
        })
      : [
          { tp: 1, agent: 'Por definir', event: 'TP1', consequence: 'Por definir' },
          { tp: 2, agent: 'Por definir', event: 'TP2', consequence: 'Por definir' },
          { tp: 3, agent: 'Por definir', event: 'TP3', consequence: 'Por definir' },
          { tp: 4, agent: 'Por definir', event: 'TP4', consequence: 'Por definir' }
        ];
    
    // V11: Include setpiece and thread_usage
    const setpiece = ep.setpiece || {
      name: 'Por definir',
      participants: [],
      stakes: 'Por definir'
    };
    
    const thread_usage = ep.thread_usage || {
      A: '',
      crossover_event: 'Por definir'
    };
    
    return {
      episode: ep.episode || i + 1,
      title: ep.title || `Episodio ${i + 1}`,
      central_conflict: ep.central_conflict || ep.central_question || 'Por definir',
      turning_points: tps,
      setpiece,
      thread_usage,
      summary: ep.summary || '',
      cliffhanger: ep.cliffhanger || 'Por definir'
    };
  });
  
  // Ensure correct number of episodes
  while (normalizedEpisodes.length < expectedEpisodes) {
    const epNum = normalizedEpisodes.length + 1;
    normalizedEpisodes.push({
      episode: epNum,
      title: `Episodio ${epNum}`,
      central_conflict: 'Por definir',
      turning_points: [
        { tp: 1, agent: 'Por definir', event: 'TP1', consequence: 'Por definir' },
        { tp: 2, agent: 'Por definir', event: 'TP2', consequence: 'Por definir' },
        { tp: 3, agent: 'Por definir', event: 'TP3', consequence: 'Por definir' },
        { tp: 4, agent: 'Por definir', event: 'TP4', consequence: 'Por definir' }
      ],
      setpiece: { name: 'Por definir', participants: [], stakes: 'Por definir' },
      thread_usage: { A: '', crossover_event: 'Por definir' },
      summary: 'Por generar',
      cliffhanger: 'Por definir'
    });
  }
  
  // Convert cast to standard format
  const mainCharacters = (partA.cast || []).map((c: any) => ({
    name: c.name || 'Sin nombre',
    role: c.role || 'support',
    description: `Quiere: ${c.want || '?'} | Necesita: ${c.need || '?'} | Defecto: ${c.flaw || '?'}`,
    arc_summary: c.function || ''
  }));
  
  // Convert locations
  const mainLocations = (partA.locations || []).map((loc: any) => ({
    name: loc.name || 'Sin nombre',
    type: loc.visual_identity || 'interior',
    description: loc.function || ''
  }));
  
  // Build complete outline with V11 fields
  return {
    title: partA.title || 'Sin título',
    logline: partA.logline || '',
    genre: partA.genre || 'Drama',
    tone: partA.tone || 'Cinematográfico',
    synopsis: partA.synopsis || partA.logline || '',
    season_arc: partA.season_arc || {},
    world_rules: Array.isArray(partA.world_rules) ? partA.world_rules : [],
    factions: Array.isArray(partA.factions) ? partA.factions : [],
    entity_rules: Array.isArray(partA.entity_rules) ? partA.entity_rules : [],
    threads: [],
    main_characters: mainCharacters,
    main_locations: mainLocations,
    main_props: [],
    subplots: [],
    plot_twists: [],
    episode_beats: normalizedEpisodes.slice(0, expectedEpisodes)
  };
}

// ============================================================================
// QC ENGINE: Structural (deterministic) + Semantic (AI-based) split
// ============================================================================

interface StructuralQCResult {
  passed: boolean;
  blockers: string[];
  warnings: string[];
}

interface SemanticQCResult {
  quality: 'ok' | 'degraded';
  issues: Array<{ location: string; problem: string }>;
  score: number;
}

interface QCResult {
  passed: boolean;
  quality: 'ok' | 'degraded' | 'rejected';
  issues: string[];
  score: number;
}

// Generic phrases to detect (anti-vaguedad)
const GENERIC_PHRASES = [
  'aparecen amenazas', 'surge un conflicto', 'algo cambia',
  'las cosas cambian', 'se complican las cosas', 'aparece un problema',
  'surge una amenaza', 'fuerzas ocultas', 'intereses externos',
  'descubre algo importante', 'enfrenta consecuencias', 'todo cambia',
  'las cosas se ponen difíciles', 'surge un desafío', 'aparece alguien',
  'pasan cosas', 'sucede algo', 'hay problemas', 'surgen dificultades',
  'se revela información', 'descubre la verdad', 'algo sucede'
];

// ============================================================================
// STRUCTURAL QC: Deterministic checks (no AI, fast, free)
// ============================================================================
function runStructuralQC(outline: any, expectedEpisodes: number): StructuralQCResult {
  const blockers: string[] = [];
  const warnings: string[] = [];
  
  // 1. Episodes == N (blocker if missing)
  const actualEpisodes = outline.episode_beats?.length || 0;
  if (actualEpisodes !== expectedEpisodes) {
    blockers.push(`Episodios: ${actualEpisodes}/${expectedEpisodes}`);
  }
  
  // 2. Each episode has 4+ TPs (blocker if <4)
  outline.episode_beats?.forEach((ep: any, i: number) => {
    const tps = ep.turning_points?.length || 0;
    if (tps < 4) {
      blockers.push(`Ep ${i + 1}: solo ${tps} TPs (mínimo 4)`);
    }
  });
  
  // 3. midpoint_reversal exists and has >20 chars (blocker)
  const midpoint = outline.season_arc?.midpoint_reversal || '';
  if (!midpoint || midpoint.length < 20) {
    blockers.push('Falta midpoint_reversal concreto');
  }
  
  // 4. Title exists (blocker)
  if (!outline.title || outline.title.length < 3) {
    blockers.push('Falta título');
  }
  
  // 5. Cast >= 3 (blocker if <3, warning if <4)
  const charCount = outline.main_characters?.length || 0;
  if (charCount < 3) {
    blockers.push(`Solo ${charCount} personajes (mínimo 3)`);
  } else if (charCount < 4) {
    warnings.push(`Solo ${charCount} personajes (recomendado 4)`);
  }
  
  // 6. Locations >= 2 (warning)
  const locCount = outline.main_locations?.length || 0;
  if (locCount < 2) {
    warnings.push(`Solo ${locCount} localizaciones (mínimo 2)`);
  }
  
  // 7. Logline exists (warning if short)
  if (!outline.logline || outline.logline.length < 20) {
    warnings.push('Logline muy corto');
  }
  
  console.log(`[WORKER] Structural QC: ${blockers.length} blockers, ${warnings.length} warnings`);
  
  return {
    passed: blockers.length === 0,
    blockers,
    warnings
  };
}

// ============================================================================
// SEMANTIC QC: AI-based anti-vaguedad (only if structural passes)
// ============================================================================
async function runSemanticQC(
  supabase: SupabaseClient,
  outlineId: string,
  outline: any
): Promise<SemanticQCResult> {
  // Quick local check first for obvious generic phrases
  let localScore = 100;
  const localIssues: Array<{ location: string; problem: string }> = [];
  
  // Check turning points for generic phrases
  outline.episode_beats?.forEach((ep: any, i: number) => {
    const tpTexts = ep.turning_points || [];
    tpTexts.forEach((tp: string, j: number) => {
      const tpLower = (typeof tp === 'string' ? tp : JSON.stringify(tp)).toLowerCase();
      const foundGeneric = GENERIC_PHRASES.find(phrase => tpLower.includes(phrase));
      if (foundGeneric) {
        localIssues.push({ location: `Ep ${i + 1} TP${j + 1}`, problem: `vaguedad: "${foundGeneric}"` });
        localScore -= 3;
      }
    });
    
    // Check cliffhanger
    if (ep.cliffhanger) {
      const cliffLower = ep.cliffhanger.toLowerCase();
      const foundGeneric = GENERIC_PHRASES.find(phrase => cliffLower.includes(phrase));
      if (foundGeneric) {
        localIssues.push({ location: `Ep ${i + 1} cliffhanger`, problem: `genérico: "${foundGeneric}"` });
        localScore -= 2;
      }
    }
    if (!ep.cliffhanger || ep.cliffhanger.length < 15) {
      localIssues.push({ location: `Ep ${i + 1}`, problem: 'cliffhanger débil' });
      localScore -= 2;
    }
  });
  
  // Check midpoint_reversal for generic phrases
  const midpoint = outline.season_arc?.midpoint_reversal || '';
  if (GENERIC_PHRASES.some(phrase => midpoint.toLowerCase().includes(phrase))) {
    localIssues.push({ location: 'midpoint_reversal', problem: 'es genérico' });
    localScore -= 10;
  }
  
  // If local check finds many issues, skip AI call (already degraded)
  if (localScore < 70 || localIssues.length > 5) {
    console.log(`[WORKER] Semantic QC (local): degraded (score: ${localScore}, issues: ${localIssues.length})`);
    return {
      quality: localScore >= 60 ? 'degraded' : 'degraded',
      issues: localIssues,
      score: Math.max(localScore, 50)
    };
  }
  
  // For borderline cases, could use AI for deeper analysis
  // But for V10.1 we keep it simple with local checks only
  const quality: 'ok' | 'degraded' = localScore >= 80 ? 'ok' : 'degraded';
  console.log(`[WORKER] Semantic QC (local): ${quality} (score: ${localScore}, issues: ${localIssues.length})`);
  
  return { quality, issues: localIssues, score: localScore };
}

// ============================================================================
// COMBINED QC: Structural first, then Semantic if passes
// ============================================================================
async function runCombinedQC(
  supabase: SupabaseClient,
  outlineId: string,
  outline: any,
  expectedEpisodes: number
): Promise<QCResult> {
  // 1. Structural QC (free, deterministic)
  const structuralQC = runStructuralQC(outline, expectedEpisodes);
  
  if (!structuralQC.passed) {
    // Failed structure → rejected, no need for semantic check
    console.log(`[WORKER] QC: rejected (structural failures: ${structuralQC.blockers.length})`);
    return {
      passed: false,
      quality: 'rejected',
      issues: [...structuralQC.blockers, ...structuralQC.warnings],
      score: 30
    };
  }
  
  // 2. Semantic QC (only if structural passed)
  const semanticQC = await runSemanticQC(supabase, outlineId, outline);
  
  // 3. Combine results
  const allIssues = [
    ...structuralQC.warnings,
    ...semanticQC.issues.map(i => `${i.location}: ${i.problem}`)
  ];
  
  const finalQuality = semanticQC.quality;
  const finalScore = semanticQC.score - (structuralQC.warnings.length * 2);
  
  console.log(`[WORKER] QC: ${finalQuality} (score: ${finalScore}, issues: ${allIssues.length})`);
  
  return {
    passed: true,
    quality: finalQuality,
    issues: allIssues,
    score: Math.max(finalScore, 50)
  };
}

// ============================================================================
// STAGE: MERGE/FINALIZE with Combined QC
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
    progress: 90,
    heartbeat_at: new Date().toISOString()
  });

  // Normalize final output (basic fields)
  const basicNormalized = {
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
    world_rules: Array.isArray(outlineJson.world_rules) ? outlineJson.world_rules : [],
    narrative_mode: outline.narrative_mode || 'serie_adictiva'
  };

  // CRITICAL: Normalize turning_points from strings to objects BEFORE QC
  const normalized = normalizeOutlineV11(basicNormalized);
  console.log(`[WORKER] Normalized turning_points for ${normalized.episode_beats?.length || 0} episodes`);

  // Run V11 QC (replaces old combined QC)
  const expectedEpisodes = outline.episode_count || 6;
  const qcResult = runStructuralQCV11(normalized, expectedEpisodes);

  // Add QC status to outline
  normalized.qc_status = qcResult.quality;
  normalized.qc_warnings = qcResult.blockers.length > 0 || qcResult.warnings.length > 0 
    ? [...qcResult.blockers.map((b: string) => `BLOCKER:${b}`), ...qcResult.warnings.map((w: string) => `WARN:${w}`)] 
    : undefined;
  normalized.qc_score = qcResult.score;

  // Determine final status based on V11 QC
  const finalStatus = qcResult.passed ? 'completed' : 'failed';
  
  // Mark as completed with quality rating
  await updateOutline(supabase, outline.id, {
    status: finalStatus,
    stage: 'done',
    substage: null,
    progress: 100,
    quality: qcResult.quality,
    qc_issues: [...qcResult.blockers, ...qcResult.warnings].length > 0 
      ? [...qcResult.blockers, ...qcResult.warnings] 
      : null,
    outline_json: normalized,
    completed_at: new Date().toISOString(),
    heartbeat_at: new Date().toISOString(),
    error_code: qcResult.passed ? null : 'QC_BLOCKED',
    error_detail: qcResult.passed ? null : `${qcResult.blockers.length} blockers, score ${qcResult.score}`
  });

  console.log(`[WORKER] ${finalStatus}: ${normalized.title} | ${normalized.episode_beats.length} episodes | Quality: ${qcResult.quality} (score: ${qcResult.score})`);
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

    // Stage A: Summarize (if needed)
    if (currentStage === 'none' || currentStage === 'summarize') {
      const summaryResult = await stageSummarize(supabase, outline, effectiveIdeaText);
      summaryText = summaryResult.summary;
    }

    // Stage B: Outline Fan-Out (PART_A, PART_B, PART_C, MERGE)
    if (currentStage === 'none' || currentStage === 'summarize' || currentStage === 'outline') {
      outlineJson = await stageOutlineFanOut(supabase, { ...outline, summary_text: summaryText }, summaryText!);
    }

    // Stage C: Final QC
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
        score: outlineJson?.qc_score || 100,
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
