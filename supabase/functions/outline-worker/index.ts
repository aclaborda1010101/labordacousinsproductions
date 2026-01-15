// ============================================================================
// V18 OUTLINE WORKER - E4 CHUNKING for Edge Runtime Stability
// ============================================================================
// Architecture:
// - PART_A: Season arc, rules, cast, locations (gpt-5.2)
// - PART_B: Episodes 1-5 with turning points (gpt-5.2)
// - PART_C: Episodes 6-10 with turning points (gpt-5.2)
// - MERGE+QC: Unify + validate with anti-vaguedad filter
// ============================================================================
// V18 CRITICAL IMPROVEMENT - CHUNKING:
// - Act expansion now happens in CHUNKS (4-5 beats per chunk)
// - Each chunk has its own 35s timeout (not 55-65s per entire act)
// - Chunks are persisted INCREMENTALLY after each successful call
// - If runtime dies mid-act, completed chunks are NOT lost
// - Resume can continue from the exact chunk that failed
// ============================================================================
// Why: Edge Runtime has ~100-120s total limit. 
// Old approach: 55s call + retry + backoff = exceeded limit → shutdown
// New approach: 35s per chunk × N chunks, each persisted immediately
// ============================================================================

import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/v3-enterprise.ts";
import { parseJsonSafe } from "../_shared/llmJson.ts";
import { MODEL_CONFIG } from "../_shared/model-config.ts";
// V14: Robust JSON parsing with retry logic
import { 
  parseJsonRobust, 
  validateExpandActMinimal, 
  fillExpandActDefaults,
  buildRawDebug,
  type RawOutputDebug,
  type ParseStrategy
} from "../_shared/parse-json-robust.ts";
// V17: Canonical model text extractor
import { extractModelText, logExtractionDiagnostic } from "../_shared/extract-model-text.ts";
import { STRUCTURED_SUMMARIZE_V11, OUTLINE_CORE_V11 } from "../_shared/production-prompts.ts";
import { runStructuralQC as runStructuralQCV11, QCResult as QCResultV11 } from "../_shared/qc-validators.ts";
import { TURNING_POINT_SCHEMA, SETPIECE_SCHEMA, THREAD_USAGE_SCHEMA } from "../_shared/outline-schemas-v11.ts";
import { normalizeOutlineV11 } from "../_shared/normalize-outline-v11.ts";
// V12: Hollywood Architecture - FILM bifurcation
import { buildFormatProfile, detectForbiddenWords, formatProfileSummary, FormatProfile } from "../_shared/format-profile.ts";
import { detectGenericPhrases, analyzeForGenericLanguage, getAntiGenericPromptBlock, validateGenericity } from "../_shared/anti-generic.ts";
// V13: FILM Phased Architecture - Scaffold + Expand per act (gpt-5.2 only, no fallback)
import { 
  FILM_SCAFFOLD_SCHEMA, 
  EXPAND_ACT_SCHEMA,
  FILM_OUTLINE_SCHEMA, 
  normalizeFilmOutline, 
  filmOutlineToUniversalFormat, 
  FilmOutline 
} from "../_shared/outline-schemas-film.ts";
// V13: Narrative Profiles - Genre-driven method/conflict/pacing
import { resolveNarrativeProfile, buildNarrativeProfilePromptBlock, type NarrativeProfile } from "../_shared/narrative-profiles.ts";
// Model configuration
const FAST_MODEL = MODEL_CONFIG.SCRIPT.RAPIDO;       // gpt-5-mini
const QUALITY_MODEL = MODEL_CONFIG.SCRIPT.HOLLYWOOD; // gpt-5.2
const MERGE_MODEL = MODEL_CONFIG.SCRIPT.RAPIDO;      // gpt-5-mini for deterministic merge
const LONG_INPUT_THRESHOLD = MODEL_CONFIG.LIMITS.MAX_INPUT_TOKENS_SOFT * MODEL_CONFIG.LIMITS.CHARS_PER_TOKEN;

// Timeout configuration (V11.1: Per-task timeouts)
const TIMEOUTS = (MODEL_CONFIG.LIMITS as any).TIMEOUTS || {
  SUMMARIZE_MS: 70000,
  OUTLINE_ARC_MS: 65000,
  OUTLINE_EPISODES_MS: 75000,
  MERGE_MS: 45000,
  QC_MS: 30000,
};
const AI_TIMEOUT_MS = MODEL_CONFIG.LIMITS.TIMEOUT_MS;  // Default fallback
const MAX_ATTEMPTS = MODEL_CONFIG.LIMITS.RETRY_COUNT;
const HEARTBEAT_INTERVAL_MS = 12000;
const MAX_EPISODES = 10;

// ============================================================================
// V20: CHUNKING CONFIGURATION - 1 ATTEMPT PER INVOCATION
// ============================================================================
// CRITICAL FIX: Each Edge invocation executes ONLY ONE AI call.
// If it fails, we persist retry_count and exit immediately.
// The next "Continue Generation" click triggers the next attempt.
// This guarantees we never exceed Edge Runtime limits (~100-120s).
// ============================================================================
// V22: ULTRA-GRANULAR CHUNKING - Maximum 2 beats per chunk for Act II to prevent timeouts
const ACT_CHUNKS: Record<'I' | 'II' | 'III', { beatsTotal: number; chunks: [number, number][] }> = {
  I:   { beatsTotal: 8,  chunks: [[1, 4], [5, 6], [7, 8]] },                     // 3 chunks (4+2+2)
  II:  { beatsTotal: 10, chunks: [[1, 2], [3, 4], [5, 6], [7, 8], [9, 10]] },    // 5 chunks (2+2+2+2+2)
  III: { beatsTotal: 8,  chunks: [[1, 4], [5, 6], [7, 8]] }                      // 3 chunks (4+2+2)
};

// V22: Prompt modes for escalating retry strategy
type PromptMode = 'MINIMAL' | 'ULTRA_MINIMAL';

// V22: Escalating retry policy - different model/prompt/timeout per attempt
function pickModel(attempt: number): string {
  // Attempts 0-1: QUALITY_MODEL (gpt-5.2)
  // Attempt 2+: FAST_MODEL (gpt-5-mini)
  return attempt >= 2 ? FAST_MODEL : QUALITY_MODEL;
}

function pickPromptMode(attempt: number): PromptMode {
  // Attempt 0: MINIMAL
  // Attempt 1: ULTRA_MINIMAL (recorta más)
  // Attempt 2+: MINIMAL (con fast model es suficiente)
  return attempt === 1 ? 'ULTRA_MINIMAL' : 'MINIMAL';
}

function pickTimeout(attempt: number): number {
  if (attempt === 0) return 40000;  // 40s for first attempt
  if (attempt === 1) return 35000;  // 35s for ultra-minimal
  return 30000;                      // 30s for fast model
}

// V20: Timeout per CHUNK - 40s max (single attempt, no retries inside)
const CHUNK_TIMEOUT_MS = 40000;

// V20: Max retries PER CHUNK (across multiple invocations)
const MAX_CHUNK_RETRIES = 3;

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
  // V11.2: Density targets from user configuration
  density_targets?: {
    protagonists_min?: number;
    supporting_min?: number;
    extras_min?: number;
    locations_min?: number;
    hero_props_min?: number;
    setpieces_min?: number;
    subplots_min?: number;
    twists_min?: number;
    scenes_target?: number;
    scenes_per_episode?: number;
    dialogue_action_ratio?: string;
  } | null;
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
// V15: GLOBAL KEEPALIVE - Continuous heartbeat during entire function execution
// ============================================================================
// This prevents ZOMBIE_TIMEOUT during:
// - Long model calls
// - Retries
// - Parsing/validation gaps
// - Transitions between phases
// ============================================================================
type KeepaliveHandle = { 
  stop: () => void;
  updateContext: (substage: string, progress: number, detail?: string) => void;
};

function startKeepalive(opts: {
  supabase: SupabaseClient;
  outlineId: string;
  substage: string;
  progress: number;
  intervalMs?: number;
}): KeepaliveHandle {
  const { supabase, outlineId, intervalMs = 20000 } = opts;
  let currentSubstage = opts.substage;
  let currentProgress = opts.progress;
  let currentDetail = 'keepalive-start';
  let stopped = false;

  // Immediate heartbeat at start (important: proves process is alive)
  console.log(`[KEEPALIVE] Starting for ${outlineId} at ${currentSubstage} (${currentProgress}%)`);
  void supabase.from('project_outlines').update({
    heartbeat_at: new Date().toISOString(),
    substage: currentSubstage,
    progress: currentProgress
  }).eq('id', outlineId);

  const timer = setInterval(() => {
    if (stopped) return;
    console.log(`[KEEPALIVE] Tick for ${outlineId}: ${currentSubstage} (${currentProgress}%) - ${currentDetail}`);
    void supabase.from('project_outlines').update({
      heartbeat_at: new Date().toISOString(),
      substage: currentSubstage,
      progress: currentProgress
    }).eq('id', outlineId);
  }, intervalMs);

  return {
    stop: () => {
      if (stopped) return;
      stopped = true;
      clearInterval(timer);
      console.log(`[KEEPALIVE] Stopped for ${outlineId}`);
    },
    updateContext: (substage: string, progress: number, detail?: string) => {
      currentSubstage = substage;
      currentProgress = progress;
      if (detail) currentDetail = detail;
      // Immediate heartbeat on context change
      if (!stopped) {
        console.log(`[KEEPALIVE] Context update: ${substage} (${progress}%)`);
        void supabase.from('project_outlines').update({
          heartbeat_at: new Date().toISOString(),
          substage: currentSubstage,
          progress: currentProgress
        }).eq('id', outlineId);
      }
    }
  };
}

// ============================================================================
// V18: RESUME POINT DETECTION - Now CHUNK-AWARE for granular recovery
// ============================================================================
interface ResumePoint {
  resumeFrom: 'scaffold' | 'expand_act_i' | 'expand_act_ii' | 'expand_act_iii' | 'merge';
  completedParts: string[];
  skipReasons: Record<string, string>;
  chunkResume?: {
    act: 'I' | 'II' | 'III';
    nextChunk: number;
    existingBeats: any[];
  };
}

function getFilmResumePoint(parts: any): ResumePoint {
  const completed: string[] = [];
  const skipReasons: Record<string, string> = {};
  
  // Check scaffold
  if (parts?.film_scaffold?.status === 'done' && parts.film_scaffold.data) {
    completed.push('film_scaffold');
    skipReasons['film_scaffold'] = 'Already completed with valid data';
  } else {
    return { resumeFrom: 'scaffold', completedParts: completed, skipReasons };
  }
  
  // V18: Check ACT I with CHUNK awareness
  const actIPart = parts?.expand_act_i;
  if (actIPart?.status === 'done' && actIPart.data?.beats?.length >= 6) {
    completed.push('expand_act_i');
    skipReasons['expand_act_i'] = `Completed with ${actIPart.data.beats.length} beats`;
  } else if (actIPart?.chunks_done?.length > 0 && actIPart.chunks_done.length < ACT_CHUNKS.I.chunks.length) {
    // Partial chunk progress - can resume from next chunk
    const nextChunk = actIPart.chunks_done.length + 1;
    skipReasons['expand_act_i'] = `Partial: ${actIPart.chunks_done.length}/${ACT_CHUNKS.I.chunks.length} chunks done`;
    return { 
      resumeFrom: 'expand_act_i', 
      completedParts: completed, 
      skipReasons,
      chunkResume: {
        act: 'I',
        nextChunk,
        existingBeats: actIPart.beats || []
      }
    };
  } else {
    return { resumeFrom: 'expand_act_i', completedParts: completed, skipReasons };
  }
  
  // V18: Check ACT II with CHUNK awareness
  const actIIPart = parts?.expand_act_ii;
  if (actIIPart?.status === 'done' && actIIPart.data?.beats?.length >= 6) {
    completed.push('expand_act_ii');
    skipReasons['expand_act_ii'] = `Completed with ${actIIPart.data.beats.length} beats`;
  } else if (actIIPart?.chunks_done?.length > 0 && actIIPart.chunks_done.length < ACT_CHUNKS.II.chunks.length) {
    const nextChunk = actIIPart.chunks_done.length + 1;
    skipReasons['expand_act_ii'] = `Partial: ${actIIPart.chunks_done.length}/${ACT_CHUNKS.II.chunks.length} chunks done`;
    return { 
      resumeFrom: 'expand_act_ii', 
      completedParts: completed, 
      skipReasons,
      chunkResume: {
        act: 'II',
        nextChunk,
        existingBeats: actIIPart.beats || []
      }
    };
  } else {
    return { resumeFrom: 'expand_act_ii', completedParts: completed, skipReasons };
  }
  
  // V18: Check ACT III with CHUNK awareness
  const actIIIPart = parts?.expand_act_iii;
  if (actIIIPart?.status === 'done' && actIIIPart.data?.beats?.length >= 6) {
    completed.push('expand_act_iii');
    skipReasons['expand_act_iii'] = `Completed with ${actIIIPart.data.beats.length} beats`;
  } else if (actIIIPart?.chunks_done?.length > 0 && actIIIPart.chunks_done.length < ACT_CHUNKS.III.chunks.length) {
    const nextChunk = actIIIPart.chunks_done.length + 1;
    skipReasons['expand_act_iii'] = `Partial: ${actIIIPart.chunks_done.length}/${ACT_CHUNKS.III.chunks.length} chunks done`;
    return { 
      resumeFrom: 'expand_act_iii', 
      completedParts: completed, 
      skipReasons,
      chunkResume: {
        act: 'III',
        nextChunk,
        existingBeats: actIIIPart.beats || []
      }
    };
  } else {
    return { resumeFrom: 'expand_act_iii', completedParts: completed, skipReasons };
  }
  
  // All phases done, just need merge
  return { resumeFrom: 'merge', completedParts: completed, skipReasons };
}

// ============================================================================
// V16: RETRY WITH BACKOFF FOR TRANSIENT GATEWAY ERRORS (502, 503)
// ============================================================================
// Retry policy: 3 attempts with exponential backoff (2s, 6s, 14s) + jitter
// Keeps heartbeat active during sleep to prevent watchdog from marking as zombie
// ============================================================================
async function sleepWithHeartbeat(
  ms: number,
  supabase: SupabaseClient,
  outlineId: string,
  substage: string
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < ms) {
    const remaining = ms - (Date.now() - start);
    const sleepTime = Math.min(HEARTBEAT_INTERVAL_MS, remaining);
    await new Promise(r => setTimeout(r, sleepTime));
    // Update heartbeat during sleep
    if (remaining > 0) {
      await supabase.from('project_outlines').update({
        heartbeat_at: new Date().toISOString(),
        substage: `${substage}_retry_wait`,
      }).eq('id', outlineId);
    }
  }
}

function isRetryableGatewayError(error: any): boolean {
  const errorMsg = error?.message || String(error);
  // V17: Include EMPTY_MODEL_OUTPUT as retryable (transient gateway/parsing issue)
  return /502|503|Bad Gateway|Cloudflare|ECONNRESET|ETIMEDOUT|Gateway|Timeout|EMPTY_MODEL_OUTPUT/i.test(errorMsg);
}

async function callWithRetry502<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts?: number;
    supabase?: SupabaseClient;
    outlineId?: string;
    substage?: string;
    label?: string;
  } = {}
): Promise<T> {
  const { maxAttempts = 3, supabase, outlineId, substage = 'unknown', label = 'call' } = options;
  const baseDelays = [2000, 6000, 14000]; // Exponential backoff
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      const isRetryable = isRetryableGatewayError(error);
      
      if (!isRetryable || attempt === maxAttempts) {
        console.error(`[callWithRetry502] ${label} attempt ${attempt}/${maxAttempts} FINAL FAILURE:`, error?.message);
        throw error; // Not retryable or max attempts reached
      }
      
      // Calculate delay with jitter
      const baseDelay = baseDelays[attempt - 1] || 14000;
      const jitter = Math.floor(Math.random() * 2000);
      const delay = baseDelay + jitter;
      
      console.log(`[callWithRetry502] ${label} attempt ${attempt} failed with retryable error, waiting ${delay}ms...`, error?.message?.slice(0, 100));
      
      // Sleep with heartbeat if supabase context available
      if (supabase && outlineId) {
        await sleepWithHeartbeat(delay, supabase, outlineId, substage);
      } else {
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  
  throw new Error(`[callWithRetry502] ${label} - Should not reach here`);
}

// ============================================================================
// AI CALL: With tool schema and heartbeat (V11.1: configurable timeout)
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
  substage: string,
  timeoutMs: number = AI_TIMEOUT_MS  // V11.1: Configurable timeout
): Promise<{ toolArgs: string | null; content: string; extractionStrategy?: string }> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY not configured');

  const heartbeatInterval = setInterval(() => {
    heartbeat(supabase, outlineId, substage);
  }, HEARTBEAT_INTERVAL_MS);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);  // V11.1: Use configurable timeout

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
    
    // V17: Use canonical extractor to handle all response formats
    const extraction = extractModelText(data);
    logExtractionDiagnostic(extraction, { phase: substage, model, attempt: 1 });
    
    // Log raw response preview if extraction failed
    if (!extraction.text) {
      console.warn(`[AI] EMPTY_RESPONSE for ${substage}: Raw preview:`, JSON.stringify(data).slice(0, 500));
    }
    
    // For backward compatibility, also extract legacy fields
    const content = extraction.text || data.choices?.[0]?.message?.content || '';
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    const toolArgs = toolCall?.function?.arguments ?? null;

    return { toolArgs, content, extractionStrategy: extraction.strategy };
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
// AI CALL: Without tool (for summarize) - V11.1: configurable timeout
// ============================================================================
async function callLovableAIWithHeartbeat(
  supabase: SupabaseClient,
  outlineId: string,
  systemPrompt: string,
  userPrompt: string,
  model: string,
  maxTokens: number,
  substage: string,
  timeoutMs: number = AI_TIMEOUT_MS  // V11.1: Configurable timeout
): Promise<{ content: string }> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY not configured');

  const heartbeatInterval = setInterval(() => {
    heartbeat(supabase, outlineId, substage);
  }, HEARTBEAT_INTERVAL_MS);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);  // V11.1: Use configurable timeout

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

// V11.2: Build density block from user targets
function buildDensityBlock(targets: OutlineRecord['density_targets']): string {
  if (!targets) return '';
  return `
━━━━━━━━━━━━━━━━━━━━━━━━━━
DENSIDAD NARRATIVA (OBLIGATORIO - QC RECHAZARÁ SI NO SE CUMPLE)
━━━━━━━━━━━━━━━━━━━━━━━━━━
- Protagonistas: MÍNIMO ${targets.protagonists_min || 3}
- Secundarios: MÍNIMO ${targets.supporting_min || 10}
- Extras con diálogo: MÍNIMO ${targets.extras_min || 15}
- Localizaciones: MÍNIMO ${targets.locations_min || 8}
- Props clave: MÍNIMO ${targets.hero_props_min || 5}
- Setpieces visuales: MÍNIMO ${targets.setpieces_min || 4}
- Subtramas: MÍNIMO ${targets.subplots_min || 3}
- Giros por episodio: MÍNIMO ${targets.twists_min || 2}
${targets.scenes_target ? `- Escenas totales: OBJETIVO ${targets.scenes_target}` : ''}
━━━━━━━━━━━━━━━━━━━━━━━━━━`;
}

// V13: Build PART_A system prompt with mandatory genre/tone enforcement + NARRATIVE PROFILE
function buildPartASystem(genre: string, tone: string, densityTargets?: OutlineRecord['density_targets']): string {
  const genreUpper = (genre || 'Drama').toUpperCase();
  const isComedy = genre?.toLowerCase().includes('comed');
  
  // V13: Resolve narrative profile based on genre and tone
  const narrativeProfile = resolveNarrativeProfile(genre || 'Drama', tone);
  const profileBlock = buildNarrativeProfilePromptBlock(narrativeProfile);
  
  return `Eres showrunner técnico-profesional. Produces estructura accionable, filmable y con causalidad.
Primero escribes como profesional. Después cumples QC. Nunca al revés.
No inventes elementos fuera del material. Prohibidas frases genéricas.

━━━━━━━━━━━━━━━━━━━━━━━━━━
GÉNERO OBLIGATORIO: ${genreUpper}
TONO OBLIGATORIO: ${tone || 'Cinematográfico'}
━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ PROHIBIDO cambiar el género o tono bajo ninguna circunstancia.

${profileBlock}

${isComedy ? `
INSTRUCCIONES ESPECÍFICAS PARA COMEDIA:
- Situaciones absurdas pero coherentes con el mundo
- Diálogos con timing cómico (setup → punchline)
- Consecuencias irónicas de las decisiones
- Personajes con quirks exagerados pero creíbles
- Conflictos que escalen de forma ridícula
- Cliffhangers que sean sorprendentes pero divertidos
` : ''}
${buildDensityBlock(densityTargets)}

REGLAS ABSOLUTAS:
- midpoint_reversal OBLIGATORIO y debe ser un EVENTO CONCRETO con agente.
- world_rules mínimo 2 reglas del mundo con efecto dramático.
- cast mínimo 4 personajes, cada uno con WANT (lo que busca), NEED (lo que realmente necesita), FLAW (defecto dramático).
- locations mínimo ${densityTargets?.locations_min || 8} con función dramática.
- ⚠️ SI DEVUELVES MENOS DE ${densityTargets?.locations_min || 8} LOCALIZACIONES, SE RECHAZARÁ LA RESPUESTA.
- Devuelve SOLO JSON válido.`;
}

// V13: Episodes system prompt now receives narrative profile dynamically
function buildEpisodesSystem(narrativeProfile: NarrativeProfile): string {
  return `Eres showrunner profesional. Cada episodio requiere conflicto central, 4 turning points concretos y cliffhanger.

${buildNarrativeProfilePromptBlock(narrativeProfile)}

REGLAS ABSOLUTAS:
- PROHIBIDO frases genéricas como "aparecen amenazas", "surge un conflicto", "algo cambia".
- Cada turning point tiene: evento (QUÉ pasa), agente (QUIÉN lo hace), consecuencia (QUÉ provoca).
- turning_points deben ser HECHOS OBSERVABLES, no sensaciones.
- cliffhanger debe ser específico y generar tensión.
- NO introducir personajes fuera del cast salvo que lo declares explícitamente.
- Devuelve SOLO JSON válido.`;
}

// ============================================================================
// PROMPT BUILDERS
// ============================================================================

function buildPartAPrompt(summary: string, episodesCount: number, genre: string, tone: string, locationsMin: number = 8): string {
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
- locations: MÍNIMO ${locationsMin} con function dramática y visual_identity (⚠️ OBLIGATORIO)

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

// V11.1: Helper for fallback model execution on AI_TIMEOUT
async function executeWithFallback<T>(
  primaryFn: (model: string, timeoutMs: number) => Promise<T>,
  primaryModel: string,
  fallbackModel: string,
  primaryTimeout: number,
  fallbackTimeout: number,
  label: string
): Promise<T> {
  try {
    return await primaryFn(primaryModel, primaryTimeout);
  } catch (err: any) {
    if (err.message?.includes('AI_TIMEOUT')) {
      console.log(`[WORKER] ${label}: Timeout with ${primaryModel}, retrying with ${fallbackModel}`);
      return await primaryFn(fallbackModel, fallbackTimeout);
    }
    throw err;
  }
}

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

// ============================================================================
// V13: FILM OUTLINE - Phased Architecture (gpt-5.2 only, no fallback)
// ============================================================================
// PHASE 1: FILM_SCAFFOLD (estructura ligera, rápida: 15-25s)
// PHASE 2: EXPAND_ACT_I, EXPAND_ACT_II, EXPAND_ACT_III (30-55s cada uno)
// PHASE 3: MERGE + Validación (local, sin AI)
// ============================================================================

// V14: Strict JSON prompt suffix for retry attempts
const STRICT_JSON_SUFFIX = `

═══════════════════════════════════════════════════════════════════
⚠️ CRITICAL JSON REQUIREMENTS - MUST FOLLOW EXACTLY:
═══════════════════════════════════════════════════════════════════
- Respond ONLY with valid JSON
- NO markdown code blocks (no \`\`\`json or \`\`\`)
- NO text before or after the JSON object
- Start your response with { and end with }
- NO trailing commas (,} or ,] are INVALID JSON)
- All string values must use standard double quotes "
- Escape internal quotes properly: \\"
═══════════════════════════════════════════════════════════════════`;

// V14: Minimal expand prompt for fallback
const MINIMAL_EXPAND_SYSTEM = `Eres guionista profesional de CINE.
Tu tarea es generar beats básicos para un acto de película.

RESPONDE ÚNICAMENTE CON JSON VÁLIDO.
- Sin markdown
- Sin explicaciones
- Empieza con { y termina con }
- Sin comas finales antes de } o ]`;

function buildMinimalExpandPrompt(act: string, scaffold: any): string {
  const beatsCount = act === 'II' ? '8' : '5';
  return `PELÍCULA: "${scaffold.title}"
LOGLINE: ${scaffold.logline}

ARQUITECTURA:
- Acto I: ${scaffold.acts_summary?.act_i_goal || 'Setup'}
- Acto II: ${scaffold.acts_summary?.act_ii_goal || 'Confrontación'}
- Acto III: ${scaffold.acts_summary?.act_iii_goal || 'Resolución'}

TAREA: Genera ${beatsCount} beats mínimos para el ACTO ${act}.

JSON OBLIGATORIO:
{
  "act": "${act}",
  "dramatic_goal": "objetivo del acto",
  "beats": [
    {"beat_number": 1, "event": "qué ocurre", "agent": "quién actúa", "consequence": "resultado"},
    ...
  ],
  "key_moments": {}
}`;
}

// Timeout específico para FILM (V17: Reducido para evitar runtime shutdown)
// Edge Runtime tiene ~120s de límite total, con retries necesitamos tiempos más cortos
const FILM_TIMEOUTS = {
  SCAFFOLD_MS: 50000,      // 50s para scaffold (was 65s)
  EXPAND_ACT_MS: 55000,    // 55s por acto (was 75s) - permite 2 intentos + backoff
  EXPAND_ACT_II_MS: 55000, // 55s para Act II (was 85s) - igual que otros actos
};

function buildFilmScaffoldSystem(genre: string, tone: string, duration: number): string {
  return `Eres showrunner senior de CINE (Hollywood-level).

FORMATO ABSOLUTO: PELÍCULA (FILM).
PROHIBIDO BAJO CUALQUIER CIRCUNSTANCIA:
- episodios, temporadas, season arcs
- cliffhangers episódicos
- estructura serial

Tu trabajo NO es escribir escenas ni diálogos.
Tu trabajo es diseñar una ARQUITECTURA CINEMATOGRÁFICA ejecutable.

━━━━━━━━━━━━━━━━━━━━━━━━━━
GÉNERO OBLIGATORIO: ${genre.toUpperCase()}
TONO OBLIGATORIO: ${tone}
DURACIÓN: ${duration} minutos
━━━━━━━━━━━━━━━━━━━━━━━━━━

REGLAS:
- 3 actos clásicos (I, II, III)
- Cada beat es un HECHO OBSERVABLE con: evento + agente + consecuencia
- Nada genérico ("todo cambia", "surge un conflicto")
- Decisiones causales, no estados de ánimo

ESTRUCTURA 3 ACTOS:
- ACTO I (~25%): Mundo ordinario → Inciting Incident → Decisión protagonista
- ACTO II (~50%): Complicaciones → MIDPOINT REVERSAL CONCRETO → All-is-lost
- ACTO III (~25%): Clímax con coste real → Resolución

PERSONAJES: Cada uno con WANT/NEED/FLAW/DECISION_KEY
- WANT: Lo que busca conscientemente
- NEED: Lo que realmente necesita (inconsciente)
- FLAW: Defecto que complica sus decisiones
- DECISION_KEY: Decisión clave que tomará

SALIDA:
- JSON válido y compacto
- Este scaffold será BLOQUEADO y usado para expansión posterior

Devuelve SOLO JSON válido según el schema.`.trim();
}

function buildFilmScaffoldUser(summary: string, duration: number): string {
  return `FORMAT: FILM (${duration}min) - ESTRUCTURA DE 3 ACTOS

INPUT CREATIVO:
${summary}

TAREA: Devuelve SOLO la estructura arquitectónica (NO beats detallados aún):
- title, logline (max 200 chars), thematic_premise
- cast: mínimo 4 personajes con WANT/NEED/FLAW/DECISION_KEY
- locations: mínimo 5 con función dramática
- setpieces: mínimo 3 momentos visuales memorables
- world_rules: mínimo 2 reglas del mundo
- acts_summary: resumen de arquitectura de 3 actos (SIN beats, solo dirección)

⚠️ NO detalles beats ni escenas. Solo arquitectura.
⚠️ PROHIBIDO episodios/temporadas.`.trim();
}

function buildExpandActSystem(act: 'I' | 'II' | 'III', genre: string, tone: string): string {
  const actGoals: Record<string, string> = {
    'I': `OBLIGACIONES ACTO I:
- opening_image: Primera imagen que establece mundo y tono
- world_setup: Mundo ordinario del protagonista
- inciting_incident: EVENTO CONCRETO que rompe la normalidad (con agente + consecuencia)
- protagonist_decision: Decisión ACTIVA del protagonista (no accidental)
- stakes_established: Qué está en juego si falla
- act_break: Evento que cierra el acto y lanza al protagonista al conflicto`,
    'II': `OBLIGACIONES ACTO II:
- first_half_complications: Obstáculos antes del midpoint
- midpoint_reversal: EVENTO VISIBLE e IRREVERSIBLE que cambia todo (con agente + consecuencia + nuevo objetivo)
- second_half_escalation: Escalada post-midpoint
- all_is_lost_moment: El momento más oscuro (qué pierde el protagonista)
- dark_night_of_soul: Reflexión antes de la decisión final`,
    'III': `OBLIGACIONES ACTO III:
- catalyst_to_action: Qué impulsa al protagonista tras la noche oscura
- climax_setup: Preparación para confrontación final
- climax_decision: Elección final (con coste real + confrontación antagonista)
- resolution: Nuevo equilibrio del mundo
- final_image: Contrasta con opening_image
- theme_statement: Cómo la resolución ilustra la premisa temática`
  };
  
  return `Eres guionista profesional de CINE.

FORMATO ABSOLUTO: PELÍCULA (FILM).
Estás expandiendo SOLO el ACTO ${act}.

━━━━━━━━━━━━━━━━━━━━━━━━━━
GÉNERO: ${genre.toUpperCase()}
TONO: ${tone}
━━━━━━━━━━━━━━━━━━━━━━━━━━

PROHIBIDO:
- episodios, temporadas, cliffhangers
- introducir personajes o localizaciones no presentes en el scaffold
- lenguaje genérico ("la tensión aumenta", "se complica", "algo cambia")

REGLAS:
- Todo debe ser FILMABLE
- Nada genérico
- Cada beat debe CAMBIAR el ESTADO del protagonista

CADA BEAT DEBE INCLUIR situation_detail:
- physical_context (espacio, luz, disposición)
- action (qué ocurre en pantalla)
- goal (objetivo inmediato)
- obstacle (impedimento tangible)
- state_change (qué cambia al final)

${actGoals[act]}

Devuelve SOLO JSON válido según el schema.`.trim();
}

function buildExpandActUser(
  scaffold: any, 
  act: 'I' | 'II' | 'III', 
  previousActI?: any,
  previousActII?: any
): string {
  const beatsCount = act === 'II' ? '8-12' : '6-8';
  
  let previousContext = '';
  if (act === 'II' && previousActI) {
    previousContext = `
ACTO I COMPLETADO:
- Dramatic goal: ${previousActI.dramatic_goal}
- Act break: ${previousActI.key_moments?.act_break || 'N/A'}
- Beats: ${previousActI.beats?.length || 0}
`;
  } else if (act === 'III' && previousActI && previousActII) {
    previousContext = `
ACTO I COMPLETADO:
- Act break: ${previousActI.key_moments?.act_break || 'N/A'}

ACTO II COMPLETADO:
- Midpoint: ${previousActII.key_moments?.midpoint_reversal?.event || 'N/A'}
- All-is-lost: ${previousActII.key_moments?.all_is_lost_moment?.event || 'N/A'}
`;
  }

  return `PELÍCULA: "${scaffold.title}"
LOGLINE: ${scaffold.logline}
THEMATIC PREMISE: ${scaffold.thematic_premise}

CAST:
${scaffold.cast?.map((c: any) => `- ${c.name} (${c.role}): WANT=${c.want}, NEED=${c.need}, FLAW=${c.flaw}`).join('\n') || 'N/A'}

ARQUITECTURA DE ACTOS:
- Acto I: ${scaffold.acts_summary?.act_i_goal || 'N/A'}
- Acto II: ${scaffold.acts_summary?.act_ii_goal || 'N/A'}
- Acto III: ${scaffold.acts_summary?.act_iii_goal || 'N/A'}
${previousContext}

TAREA: Expande SOLO el ACTO ${act} con ${beatsCount} beats detallados.
Cada beat debe tener situation_detail completo (physical_context, action, goal, obstacle, state_change).
Incluye key_moments obligatorios del acto.

⚠️ SOLO ACTO ${act}. No toques otros actos.`.trim();
}

// ============================================================================
// V14: EXPAND ACT WITH ROBUST RETRY LOGIC
// ============================================================================
// Attempts:
// 1. Normal prompt with gpt-5.2
// 2. Strict JSON prompt if parsing fails
// 3. Fallback to minimal expand with gpt-5-mini
// ============================================================================
async function fallbackMinimalExpand(
  supabase: SupabaseClient,
  outlineId: string,
  scaffold: any,
  act: 'I' | 'II' | 'III',
  genre: string,
  tone: string
): Promise<any> {
  console.log(`[WORKER] EXPAND ACT ${act}: fallback to MINIMAL_EXPAND (gpt-5-mini)`);
  
  const substage = `expand_act_${act.toLowerCase()}_fallback`;
  
  try {
    // V16: Wrap fallback with 502 retry as well
    const { content, toolArgs, extractionStrategy } = await callWithRetry502(
      () => callLovableAIWithToolAndHeartbeat(
        supabase, outlineId,
        MINIMAL_EXPAND_SYSTEM,
        buildMinimalExpandPrompt(act, scaffold),
        FAST_MODEL,  // gpt-5-mini for fast fallback
        2500,
        'expand_film_act_minimal',
        EXPAND_ACT_SCHEMA.parameters,
        substage,
        45000  // 45s timeout for fallback
      ),
      { maxAttempts: 3, supabase, outlineId, substage, label: `MINIMAL_EXPAND_${act}` }
    );
    
    const raw = toolArgs || content || '';
    
    // V17: Empty response handling in fallback
    if (!raw || !raw.trim()) {
      console.error(`[WORKER] MINIMAL_EXPAND ACT ${act}: EMPTY_MODEL_OUTPUT (strategy: ${extractionStrategy})`);
      throw new Error(`MINIMAL_EXPAND_${act}_EMPTY_MODEL_OUTPUT: No content returned`);
    }
    
    const parseResult = parseJsonRobust(raw, `minimal_expand_${act}`);
    
    if (!parseResult.ok || !parseResult.json) {
      throw new Error(`MINIMAL_EXPAND_${act} also failed to parse: ${parseResult.error}`);
    }
    
    console.log(`[WORKER] MINIMAL_EXPAND ACT ${act}: ${parseResult.json.beats?.length || 0} beats (degraded)`);
    
    // Fill defaults for incomplete result
    return fillExpandActDefaults(parseResult.json, act);
    
  } catch (err: any) {
    console.error(`[WORKER] MINIMAL_EXPAND ACT ${act} failed:`, err.message);
    throw new Error(`EXPAND_ACT_${act}_ALL_ATTEMPTS_FAILED: ${err.message}`);
  }
}

async function expandActWithRetry(
  supabase: SupabaseClient,
  outlineId: string,
  scaffold: any,
  act: 'I' | 'II' | 'III',
  parts: any,
  genre: string,
  tone: string,
  previousActI?: any,
  previousActII?: any
): Promise<any> {
  const substage = `expand_act_${act.toLowerCase()}` as const;
  const MAX_RETRIES = 2;
  const timeout = act === 'II' ? FILM_TIMEOUTS.EXPAND_ACT_II_MS : FILM_TIMEOUTS.EXPAND_ACT_MS;
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const isStrictRetry = attempt > 1;
    const systemPrompt = buildExpandActSystem(act, genre, tone) + (isStrictRetry ? STRICT_JSON_SUFFIX : '');
    
    console.log(`[WORKER] EXPAND ACT ${act}: attempt ${attempt}${isStrictRetry ? ' (strict JSON mode)' : ''}`);
    
    try {
      // V16: Wrap model call with 502 retry logic
      const { toolArgs, content, extractionStrategy } = await callWithRetry502(
        () => callLovableAIWithToolAndHeartbeat(
          supabase, outlineId,
          systemPrompt,
          buildExpandActUser(scaffold, act, previousActI, previousActII),
          QUALITY_MODEL,
          act === 'II' ? 4000 : 3000,
          'expand_film_act',
          EXPAND_ACT_SCHEMA.parameters,
          substage,
          timeout
        ),
        { maxAttempts: 3, supabase, outlineId, substage, label: `EXPAND_ACT_${act}` }
      );
      
      const raw = toolArgs || content || '';
      
      // V17: Empty response is retryable, not a parse failure
      if (!raw || !raw.trim()) {
        console.warn(`[WORKER] EXPAND ACT ${act} attempt ${attempt}: EMPTY_MODEL_OUTPUT (strategy: ${extractionStrategy})`);
        parts[substage] = {
          ...parts[substage],
          last_error: 'EMPTY_MODEL_OUTPUT',
          extraction_strategy: extractionStrategy || 'none',
          attempt_count: attempt,
          timestamp: new Date().toISOString()
        };
        await updateOutline(supabase, outlineId, { outline_parts: parts });
        
        if (attempt < MAX_RETRIES) {
          console.log(`[WORKER] EXPAND ACT ${act}: empty response, retrying with strict JSON prompt...`);
          continue;
        }
        
        // Empty after retries → fallback
        console.log(`[WORKER] EXPAND ACT ${act}: empty after ${attempt} attempts, trying MINIMAL_EXPAND fallback...`);
        return await fallbackMinimalExpand(supabase, outlineId, scaffold, act, genre, tone);
      }
      
      // V14: Persist raw ALWAYS for debugging
      const rawDebug: RawOutputDebug = buildRawDebug(content, toolArgs, 'direct', attempt);
      parts[substage] = {
        ...parts[substage],
        ...rawDebug,
        extraction_strategy: extractionStrategy || 'direct'
      };
      await updateOutline(supabase, outlineId, { outline_parts: parts });
      
      // V14: Use robust parsing
      const parseResult = parseJsonRobust(raw, substage);
      
      if (!parseResult.ok || !parseResult.json) {
        console.warn(`[WORKER] EXPAND ACT ${act} parse failed (attempt ${attempt}): ${parseResult.error}`);
        parts[substage].parse_strategy = parseResult.strategy;
        parts[substage].last_error = parseResult.error;
        parts[substage].warnings = parseResult.warnings;
        await updateOutline(supabase, outlineId, { outline_parts: parts });
        
        if (attempt < MAX_RETRIES) {
          console.log(`[WORKER] EXPAND ACT ${act}: retrying with strict JSON prompt...`);
          continue;
        }
        
        // Both attempts failed → try fallback
        console.log(`[WORKER] EXPAND ACT ${act}: parse failed, trying MINIMAL_EXPAND fallback...`);
        return await fallbackMinimalExpand(supabase, outlineId, scaffold, act, genre, tone);
      }
      
      // V14: Minimal validation
      const validation = validateExpandActMinimal(parseResult.json, act);
      if (!validation.valid) {
        console.warn(`[WORKER] EXPAND ACT ${act} validation issues (attempt ${attempt}): ${validation.issues.join(', ')}`);
        parts[substage].validation_issues = validation.issues;
        
        if (attempt < MAX_RETRIES) {
          console.log(`[WORKER] EXPAND ACT ${act}: validation failed, retrying with strict prompt...`);
          continue;
        }
        
        // If has at least 2 beats, fill defaults and proceed (degraded)
        if (parseResult.json?.beats?.length >= 2) {
          console.log(`[WORKER] EXPAND ACT ${act}: filling defaults for partial result (${parseResult.json.beats.length} beats)`);
          parts[substage].parse_strategy = parseResult.strategy;
          parts[substage].quality = 'degraded';
          await updateOutline(supabase, outlineId, { outline_parts: parts });
          return fillExpandActDefaults(parseResult.json, act);
        }
        
        // Too few beats → fallback
        console.log(`[WORKER] EXPAND ACT ${act}: insufficient beats, trying MINIMAL_EXPAND fallback...`);
        return await fallbackMinimalExpand(supabase, outlineId, scaffold, act, genre, tone);
      }
      
      // Success: fill defaults for optional fields
      parts[substage].parse_strategy = parseResult.strategy;
      parts[substage].quality = 'ok';
      await updateOutline(supabase, outlineId, { outline_parts: parts });
      
      console.log(`[WORKER] EXPAND ACT ${act} done: ${parseResult.json.beats?.length || 0} beats (strategy: ${parseResult.strategy})`);
      return fillExpandActDefaults(parseResult.json, act);
      
    } catch (err: any) {
      console.error(`[WORKER] EXPAND ACT ${act} attempt ${attempt} error:`, err.message);
      
      // Persist error for debugging
      parts[substage] = {
        ...parts[substage],
        last_error: err.message,
        attempt_count: attempt,
        timestamp: new Date().toISOString()
      };
      await updateOutline(supabase, outlineId, { outline_parts: parts });
      
      // If timeout or rate limit on first attempt, try with fallback model
      const isTimeout = err.message?.includes('AI_TIMEOUT') || err.message?.includes('AbortError');
      const isRateLimit = err.status === 429;
      
      if ((isTimeout || isRateLimit) && attempt < MAX_RETRIES) {
        console.log(`[WORKER] EXPAND ACT ${act}: ${isTimeout ? 'timeout' : 'rate limit'}, will retry...`);
        continue;
      }
      
      // All retries exhausted → try minimal fallback
      if (attempt >= MAX_RETRIES) {
        console.log(`[WORKER] EXPAND ACT ${act}: all retries failed, trying MINIMAL_EXPAND fallback...`);
        return await fallbackMinimalExpand(supabase, outlineId, scaffold, act, genre, tone);
      }
      
      throw err;
    }
  }
  
  // Should not reach here, but safety fallback
  return await fallbackMinimalExpand(supabase, outlineId, scaffold, act, genre, tone);
}

// ============================================================================
// V18: CHUNK-BASED ACT EXPANSION - The Core of E4 Fix
// ============================================================================
// This is the REPLACEMENT for expandActWithRetry when chunking is enabled.
// Instead of requesting all beats at once (which times out), we:
// 1. Request beats 1-4, persist immediately
// 2. Request beats 5-8, merge with existing, persist immediately
// 3. If runtime dies between chunks, saved chunks are NOT lost
// ============================================================================

// V18: Calculate progress for a specific chunk within an act
function calculateChunkProgress(act: 'I' | 'II' | 'III', chunkIndex: number, totalChunks: number): number {
  // Act I: 30-45%, Act II: 50-70%, Act III: 75-90%
  const ranges: Record<'I' | 'II' | 'III', { start: number; end: number }> = {
    I:   { start: 30, end: 45 },
    II:  { start: 50, end: 70 },
    III: { start: 75, end: 90 }
  };
  const range = ranges[act];
  const chunkSize = (range.end - range.start) / totalChunks;
  return Math.round(range.start + (chunkIndex * chunkSize));
}

// V22: Build MINIMAL or ULTRA_MINIMAL chunk-specific prompt
function buildChunkPrompt(
  scaffold: any,
  act: 'I' | 'II' | 'III',
  fromBeat: number,
  toBeat: number,
  previousActI?: any,
  previousActII?: any,
  mode: PromptMode = 'MINIMAL'
): string {
  
  // ═══════════════════════════════════════════════════════════════════════════
  // ULTRA_MINIMAL mode: ~800-1000 chars (for retry attempts with heavy context)
  // ═══════════════════════════════════════════════════════════════════════════
  if (mode === 'ULTRA_MINIMAL') {
    // Very condensed Act I recap for Act II
    let actRecap = '';
    if (act === 'II') {
      actRecap = `ACT I RECAP:
- Protagonists committed to becoming "Kings" by circumstance
- Antagonist announced zero tolerance
- Each protagonist made identity choice`;
    } else if (act === 'III') {
      actRecap = `ACT II RECAP:
- Conflict escalated to crisis point
- Stakes raised to maximum
- Point of no return reached`;
    }
    
    const actGoal = scaffold.acts_summary?.[`act_${act.toLowerCase()}_goal`] || '';
    
    return `FILM: "${scaffold.title}"
LOGLINE: ${scaffold.logline || ''}

${actRecap}

ACT ${act} GOAL: ${actGoal}

GENERATE BEATS ${fromBeat}-${toBeat} ONLY.

Each beat: beat_number, scene_title, event, agent, consequence, situation_detail.

RESPOND JSON ONLY:
{ "beats": [...] }`.trim();
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // MINIMAL mode: ~1500-2000 chars (standard first attempt)
  // ═══════════════════════════════════════════════════════════════════════════
  
  // Extract only 3-4 protagonists with minimal fields
  const protagonists = (scaffold.cast || []).slice(0, 4).map((c: any) => 
    `- ${c.name}: WANT=${c.want || '?'}; FLAW=${c.flaw || '?'}`
  ).join('\n');
  
  // Build continuity anchors from previous acts (max 4 bullets)
  const continuityAnchors: string[] = [];
  if (previousActI?.beats?.length) {
    const lastBeats = previousActI.beats.slice(-3);
    lastBeats.forEach((b: any) => {
      if (b.event && b.agent) {
        continuityAnchors.push(`- ${b.agent}: ${b.event}${b.consequence ? ` → ${b.consequence}` : ''}`);
      }
    });
  }
  if (previousActII?.beats?.length && act === 'III') {
    const lastBeats = previousActII.beats.slice(-2);
    lastBeats.forEach((b: any) => {
      if (b.event && b.agent) {
        continuityAnchors.push(`- ${b.agent}: ${b.event}`);
      }
    });
  }
  
  const actGoal = scaffold.acts_summary?.[`act_${act.toLowerCase()}_goal`] || 'Sin definir';
  
  return `FILM: "${scaffold.title}"
LOGLINE: ${scaffold.logline || ''}
TONE: ${scaffold.tone || 'cinematográfico'}

PROTAGONISTS:
${protagonists}

ACT ${act} GOAL: ${actGoal}

${continuityAnchors.length > 0 ? `CONTINUITY (must remain true):\n${continuityAnchors.slice(0, 4).join('\n')}` : ''}

━━━━━━━━━━━━━━━━━━━━━━━━━━
GENERATE ONLY BEATS ${fromBeat}-${toBeat} OF ACT ${act}.
No other beats. No repeats.
━━━━━━━━━━━━━━━━━━━━━━━━━━

Each beat MUST include:
- beat_number (${fromBeat} to ${toBeat})
- scene_title
- event (physical action)
- agent (who acts)
- consequence (what changes)
- situation_detail: { physical_context, action, goal, obstacle, state_change }

RESPOND ONLY WITH VALID JSON:
{
  "beats": [...]
}`.trim();
}

// ============================================================================
// V20: CALL CHUNK ONCE - Single attempt per invocation
// ============================================================================
// CRITICAL: This function makes EXACTLY ONE AI call and returns.
// NO retries, NO sleeps, NO loops inside. If it fails, we return error info
// and let the caller decide what to do (persist & exit, or handle inline).
// ============================================================================
interface ChunkResult {
  success: boolean;
  beats: any[];
  error?: string;
  modelUsed?: string;
}

async function callChunkOnce(
  supabase: SupabaseClient,
  outlineId: string,
  scaffold: any,
  act: 'I' | 'II' | 'III',
  fromBeat: number,
  toBeat: number,
  genre: string,
  tone: string,
  previousActI: any,
  previousActII: any,
  chunkSubstage: string,
  retryCount: number  // 0, 1, or 2 - determines which model/prompt/timeout to use
): Promise<ChunkResult> {
  // V22: Escalating retry policy using centralized functions
  const modelToUse = pickModel(retryCount);
  const promptMode = pickPromptMode(retryCount);
  const timeoutToUse = pickTimeout(retryCount);
  const modelLabel = retryCount >= 2 ? 'FALLBACK' : (retryCount === 1 ? 'ULTRA_MINIMAL' : 'QUALITY');
  
  console.log(`[CHUNK-V22] Act ${act} beats ${fromBeat}-${toBeat}: attempt ${retryCount + 1}/${MAX_CHUNK_RETRIES} (${modelLabel}: ${modelToUse}, mode: ${promptMode}, timeout: ${timeoutToUse}ms)`);
  
  try {
    // Build system prompt - add strict JSON suffix on retry attempts
    const systemPrompt = buildExpandActSystem(act, genre, tone) + (retryCount > 0 ? STRICT_JSON_SUFFIX : '');
    const userPrompt = buildChunkPrompt(scaffold, act, fromBeat, toBeat, previousActI, previousActII, promptMode);
    
    // V20: SINGLE CALL - No wrapper, no retries inside
    const { toolArgs, content, extractionStrategy } = await callLovableAIWithToolAndHeartbeat(
      supabase, outlineId,
      systemPrompt,
      userPrompt,
      modelToUse,
      2000,  // Smaller max_tokens for chunk
      'expand_film_chunk',
      EXPAND_ACT_SCHEMA.parameters,
      chunkSubstage,
      timeoutToUse  // V21: Use dynamic timeout based on model
    );
    
    const raw = toolArgs || content || '';
    
    // Empty response check
    if (!raw || !raw.trim()) {
      console.warn(`[CHUNK-V20] Act ${act} beats ${fromBeat}-${toBeat}: EMPTY response (model: ${modelToUse})`);
      return { 
        success: false, 
        beats: [], 
        error: 'EMPTY_MODEL_OUTPUT',
        modelUsed: modelToUse
      };
    }
    
    // Parse response
    const parseResult = parseJsonRobust(raw, chunkSubstage);
    if (!parseResult.ok || !parseResult.json) {
      console.warn(`[CHUNK-V20] Parse failed (model: ${modelToUse}): ${parseResult.error}`);
      return { 
        success: false, 
        beats: [], 
        error: `PARSE_FAILED: ${parseResult.error}`,
        modelUsed: modelToUse
      };
    }
    
    // Extract beats
    const chunkBeats = parseResult.json.beats || [];
    if (chunkBeats.length === 0) {
      console.warn(`[CHUNK-V20] No beats returned (model: ${modelToUse})`);
      return { 
        success: false, 
        beats: [], 
        error: 'ZERO_BEATS_RETURNED',
        modelUsed: modelToUse
      };
    }
    
    // Ensure beat_number is set
    const normalizedBeats = chunkBeats.map((b: any, i: number) => ({
      ...b,
      beat_number: b.beat_number || (fromBeat + i)
    }));
    
    console.log(`[CHUNK-V20] Act ${act} beats ${fromBeat}-${toBeat}: SUCCESS - ${normalizedBeats.length} beats (model: ${modelToUse})`);
    
    return { 
      success: true, 
      beats: normalizedBeats,
      modelUsed: modelToUse
    };
    
  } catch (err: any) {
    const errorMsg = err.message || String(err);
    console.error(`[CHUNK-V20] Act ${act} beats ${fromBeat}-${toBeat} ERROR (model: ${modelToUse}):`, errorMsg);
    
    return { 
      success: false, 
      beats: [], 
      error: errorMsg,
      modelUsed: modelToUse
    };
  }
}

// ============================================================================
// V20: THE MAIN CHUNKED EXPANSION FUNCTION - 1 ATTEMPT PER INVOCATION
// ============================================================================
// CRITICAL ARCHITECTURE:
// - Finds the first incomplete chunk
// - Makes ONE AI call for that chunk
// - If SUCCESS: persists, moves to next chunk (within same invocation if time permits)
// - If FAIL: persists retry_count, exits IMMEDIATELY
// - Next "Continue Generation" click resumes from the failed chunk
// ============================================================================
async function expandActInChunks(
  supabase: SupabaseClient,
  outlineId: string,
  scaffold: any,
  act: 'I' | 'II' | 'III',
  parts: any,
  genre: string,
  tone: string,
  previousActI?: any,
  previousActII?: any
): Promise<any> {
  const config = ACT_CHUNKS[act];
  const substage = `expand_act_${act.toLowerCase()}`;
  
  // V20: Recover existing chunk progress INCLUDING retry_count
  const existingPart = parts[substage] || {};
  const chunksDone = new Set<number>(existingPart.chunks_done ?? []);
  let beats: any[] = existingPart.beats ?? [];
  let currentChunk = existingPart.current_chunk || 1;
  let retryCount = existingPart.retry_count || 0;
  
  console.log(`[CHUNK-V20] === EXPANDING ACT ${act} in ${config.chunks.length} CHUNKS ===`);
  console.log(`[CHUNK-V20] Progress: ${chunksDone.size}/${config.chunks.length} chunks, ${beats.length} beats, current=${currentChunk}, retries=${retryCount}`);
  
  for (let i = 0; i < config.chunks.length; i++) {
    const chunkIndex = i + 1;
    
    // Skip already completed chunks
    if (chunksDone.has(chunkIndex)) {
      console.log(`[CHUNK-V20] Act ${act} chunk ${chunkIndex}/${config.chunks.length}: ALREADY DONE, skipping`);
      continue;
    }
    
    // V20: Check if this chunk has exhausted retries
    if (chunkIndex === currentChunk && retryCount >= MAX_CHUNK_RETRIES) {
      console.error(`[CHUNK-V20] Act ${act} chunk ${chunkIndex}: MAX_RETRIES_EXHAUSTED (${retryCount}/${MAX_CHUNK_RETRIES})`);
      parts[substage] = {
        ...parts[substage],
        status: 'failed',
        current_chunk: chunkIndex,
        retry_count: retryCount,
        error_code: 'MAX_CHUNK_RETRIES_EXHAUSTED',
        last_error: existingPart.last_error || 'Unknown',
        beats
      };
      await updateOutline(supabase, outlineId, { 
        outline_parts: parts,
        status: 'failed',
        error_code: 'CHUNK_MAX_RETRIES',
        error_detail: `Act ${act} chunk ${chunkIndex} failed after ${MAX_CHUNK_RETRIES} attempts`
      });
      throw new Error(`CHUNK_MAX_RETRIES: Act ${act} chunk ${chunkIndex} failed after ${MAX_CHUNK_RETRIES} attempts`);
    }
    
    const [fromBeat, toBeat] = config.chunks[i];
    const chunkSubstage = `${substage}_chunk_${chunkIndex}`;
    
    console.log(`[CHUNK-V20] Act ${act} chunk ${chunkIndex}/${config.chunks.length}: beats ${fromBeat}-${toBeat} (attempt ${retryCount + 1}/${MAX_CHUNK_RETRIES})`);
    
    // Update substage and progress for this chunk
    const chunkProgress = calculateChunkProgress(act, chunkIndex, config.chunks.length);
    await updateOutline(supabase, outlineId, {
      substage: chunkSubstage,
      progress: chunkProgress,
      heartbeat_at: new Date().toISOString()
    });
    
    // V20: SINGLE ATTEMPT - call once and check result
    const result = await callChunkOnce(
      supabase, outlineId, scaffold, act, fromBeat, toBeat,
      genre, tone, previousActI, previousActII, chunkSubstage, retryCount
    );
    
    if (result.success) {
      // SUCCESS: Merge beats, mark chunk done, reset retry_count
      const beatsMap = new Map(beats.map((b: any) => [b.beat_number, b]));
      for (const b of result.beats) {
        beatsMap.set(b.beat_number, b);
      }
      beats = Array.from(beatsMap.values()).sort((a, b) => a.beat_number - b.beat_number);
      
      chunksDone.add(chunkIndex);
      
      // V20: Reset retry_count for next chunk, update current_chunk
      currentChunk = chunkIndex + 1;
      retryCount = 0;
      
      parts[substage] = {
        ...parts[substage],
        status: chunksDone.size === config.chunks.length ? 'done' : 'partial',
        chunks_done: Array.from(chunksDone),
        chunks_total: config.chunks.length,
        current_chunk: currentChunk,
        retry_count: 0,
        last_error: null,
        beats,
        last_chunk_at: new Date().toISOString(),
        last_model_used: result.modelUsed
      };
      await updateOutline(supabase, outlineId, { 
        outline_parts: parts,
        heartbeat_at: new Date().toISOString()
      });
      
      console.log(`[CHUNK-V23] Act ${act} chunk ${chunkIndex} PERSISTED: ${beats.length} total beats so far`);
      
      // V23: EXIT AFTER EACH SUCCESSFUL CHUNK to prevent runtime death
      // If more chunks remain, set stalled with CHUNK_READY_NEXT code
      if (chunkIndex < config.chunks.length) {
        await updateOutline(supabase, outlineId, {
          status: 'stalled',
          error_code: 'CHUNK_READY_NEXT',
          error_detail: `Act ${act} chunk ${chunkIndex} done. Ready for chunk ${chunkIndex + 1}.`
        });
        console.log(`[CHUNK-V23] Exiting after successful chunk ${chunkIndex}. User/system should trigger next chunk.`);
        // Throw a special error that the caller can catch and handle gracefully
        throw new Error(`CHUNK_CONTINUE_NEEDED: Act ${act} chunk ${chunkIndex} complete, ${config.chunks.length - chunkIndex} remaining`);
      }
      
      // If this was the last chunk, continue to finalization (don't throw)
      
    } else {
      // FAIL: Increment retry_count, persist, EXIT IMMEDIATELY
      retryCount++;
      
      // V21: Use 'stalled' instead of keeping 'generating' - enables UI "Continue" button
      const isMaxRetries = retryCount >= MAX_CHUNK_RETRIES;
      
      parts[substage] = {
        ...parts[substage],
        status: 'partial',
        chunks_done: Array.from(chunksDone),
        chunks_total: config.chunks.length,
        current_chunk: chunkIndex,
        retry_count: retryCount,
        last_error: result.error,
        beats,
        last_attempt_at: new Date().toISOString(),
        last_model_used: result.modelUsed
      };
      
      // V21: Set outline status to 'stalled' so UI can show "Continue" button (not 'failed' until max retries)
      await updateOutline(supabase, outlineId, { 
        outline_parts: parts,
        status: isMaxRetries ? 'failed' : 'stalled',
        substage: chunkSubstage,
        error_code: isMaxRetries ? 'CHUNK_MAX_RETRIES' : 'CHUNK_ATTEMPT_FAILED',
        error_detail: `Act ${act} chunk ${chunkIndex} - ${result.error}`,
        heartbeat_at: new Date().toISOString()
      });
      
      console.log(`[CHUNK-V21] Act ${act} chunk ${chunkIndex} ${isMaxRetries ? 'FAILED' : 'STALLED'} (attempt ${retryCount}/${MAX_CHUNK_RETRIES}): ${result.error}`);
      console.log(`[CHUNK-V21] State persisted. User must click "Continue Generation" for next attempt.`);
      
      // V21: EXIT IMMEDIATELY - Do NOT continue in this invocation
      throw new Error(`CHUNK_${isMaxRetries ? 'MAX_RETRIES' : 'ATTEMPT_FAILED'}: Act ${act} chunk ${chunkIndex} - ${result.error}`);
    }
  }
  
  // All chunks done - finalize
  const dramaticGoal = scaffold.acts_summary?.[`act_${act.toLowerCase()}_goal`] || '';
  
  // Fill in key_moments based on beats
  const keyMoments = extractKeyMomentsFromBeats(beats, act);
  
  parts[substage] = {
    ...parts[substage],
    status: 'done',
    retry_count: 0,
    current_chunk: null,
    data: {
      beats,
      dramatic_goal: dramaticGoal,
      key_moments: keyMoments
    }
  };
  await updateOutline(supabase, outlineId, { outline_parts: parts });
  
  console.log(`[CHUNK-V20] Act ${act} COMPLETE: ${beats.length} beats across ${config.chunks.length} chunks`);
  
  return {
    beats,
    dramatic_goal: dramaticGoal,
    key_moments: keyMoments
  };
}

// V18: Extract key moments from generated beats (heuristic)
function extractKeyMomentsFromBeats(beats: any[], act: 'I' | 'II' | 'III'): any {
  const keyMoments: any = {};
  
  if (act === 'I') {
    keyMoments.opening_image = beats[0]?.event || 'N/A';
    keyMoments.inciting_incident = {
      event: beats.find(b => b.beat_number === 2)?.event || '',
      agent: beats.find(b => b.beat_number === 2)?.agent || '',
      consequence: beats.find(b => b.beat_number === 2)?.consequence || ''
    };
    keyMoments.act_break = beats[beats.length - 1]?.event || '';
  } else if (act === 'II') {
    const midpointBeat = beats.find(b => b.beat_number === 5 || b.beat_number === 6);
    keyMoments.midpoint_reversal = {
      event: midpointBeat?.event || '',
      agent: midpointBeat?.agent || '',
      consequence: midpointBeat?.consequence || '',
      protagonist_new_goal: ''
    };
    const allIsLostBeat = beats.find(b => b.beat_number === 9 || b.beat_number === 10);
    keyMoments.all_is_lost_moment = {
      event: allIsLostBeat?.event || '',
      what_dies: ''
    };
  } else if (act === 'III') {
    const climaxBeat = beats.find(b => b.beat_number === 6 || b.beat_number === 7);
    keyMoments.climax_decision = {
      decision: climaxBeat?.event || '',
      cost: climaxBeat?.consequence || ''
    };
    keyMoments.resolution = beats[beats.length - 1]?.event || '';
    keyMoments.final_image = beats[beats.length - 1]?.scene_title || '';
  }
  
  return keyMoments;
}

// Función para hacer merge de las partes expandidas
function mergeFilmParts(
  scaffold: any,
  actI: any,
  actII: any,
  actIII: any
): FilmOutline {
  // Extraer key_moments de cada acto expandido
  const actIKeyMoments = actI.key_moments || {};
  const actIIKeyMoments = actII.key_moments || {};
  const actIIIKeyMoments = actIII.key_moments || {};

  return {
    title: scaffold.title,
    logline: scaffold.logline,
    thematic_premise: scaffold.thematic_premise,
    genre: scaffold.genre,
    tone: scaffold.tone,
    ACT_I: {
      dramatic_goal: actI.dramatic_goal || scaffold.acts_summary?.act_i_goal,
      opening_image: actIKeyMoments.opening_image,
      world_setup: actIKeyMoments.world_setup,
      inciting_incident: actIKeyMoments.inciting_incident || {
        event: scaffold.acts_summary?.inciting_incident_summary || '',
        agent: 'N/A',
        consequence: 'N/A'
      },
      protagonist_decision: actIKeyMoments.protagonist_decision || '',
      stakes_established: actIKeyMoments.stakes_established,
      act_break: actIKeyMoments.act_break || scaffold.acts_summary?.act_i_break || '',
      // V13: Añadir beats expandidos
      beats: actI.beats
    },
    ACT_II: {
      dramatic_goal: actII.dramatic_goal || scaffold.acts_summary?.act_ii_goal,
      first_half_complications: actIIKeyMoments.first_half_complications,
      midpoint_reversal: actIIKeyMoments.midpoint_reversal || {
        event: scaffold.acts_summary?.midpoint_summary || '',
        agent: 'N/A',
        consequence: 'N/A',
        protagonist_new_goal: ''
      },
      second_half_escalation: actIIKeyMoments.second_half_escalation,
      all_is_lost_moment: actIIKeyMoments.all_is_lost_moment || {
        event: scaffold.acts_summary?.all_is_lost_summary || '',
        what_dies: ''
      },
      dark_night_of_soul: actIIKeyMoments.dark_night_of_soul,
      // V13: Añadir beats expandidos
      beats: actII.beats
    },
    ACT_III: {
      dramatic_goal: actIII.dramatic_goal || scaffold.acts_summary?.act_iii_goal,
      catalyst_to_action: actIIIKeyMoments.catalyst_to_action,
      climax_setup: actIIIKeyMoments.climax_setup,
      climax_decision: actIIIKeyMoments.climax_decision || {
        decision: scaffold.acts_summary?.climax_summary || '',
        cost: ''
      },
      resolution: actIIIKeyMoments.resolution || '',
      final_image: actIIIKeyMoments.final_image,
      theme_statement: actIIIKeyMoments.theme_statement,
      // V13: Añadir beats expandidos
      beats: actIII.beats
    },
    cast: scaffold.cast || [],
    locations: scaffold.locations || [],
    setpieces: scaffold.setpieces || [],
    world_rules: scaffold.world_rules || []
  };
}

async function stageFilmOutline(
  supabase: SupabaseClient,
  outline: OutlineRecord,
  summaryText: string,
  formatProfile: FormatProfile
): Promise<any> {
  const genre = outline.genre || 'Drama';
  const tone = outline.tone || 'Cinematográfico';
  const duration = formatProfile.duration_minutes || 110;
  
  console.log(`[WORKER] FILM V2: Phased generation for ${duration}min ${genre} (gpt-5.2 only)`);
  
  // Recover existing parts for resumability
  let parts: any = (outline.outline_parts && typeof outline.outline_parts === 'object' && !Array.isArray(outline.outline_parts)) 
    ? outline.outline_parts 
    : {};
  
  const config = { genre, tone, duration };
  
  // V15: GLOBAL KEEPALIVE - Prevents ZOMBIE_TIMEOUT during entire function execution
  const globalKeepalive = startKeepalive({
    supabase,
    outlineId: outline.id,
    substage: 'film_outline_init',
    progress: outline.progress || 10,
    intervalMs: 20000  // 20 seconds between heartbeats
  });
  
  // V15: RESUME POINT DETECTION - Skip completed parts
  const { resumeFrom, completedParts, skipReasons } = getFilmResumePoint(parts);
  if (completedParts.length > 0) {
    console.log(`[WORKER] FILM V2 RESUME: Resuming from ${resumeFrom}`);
    console.log(`[WORKER] FILM V2 RESUME: Completed parts: [${completedParts.join(', ')}]`);
    for (const [part, reason] of Object.entries(skipReasons)) {
      console.log(`[WORKER] FILM V2 RESUME: Skipping ${part}: ${reason}`);
    }
  }
  
  try {
  
  // ════════════════════════════════════════════════════════════════════════
  // PHASE 1: FILM SCAFFOLD (estructura ligera, rápida)
  // ════════════════════════════════════════════════════════════════════════
  let scaffold: any;
  
  if (resumeFrom === 'scaffold' || !parts.film_scaffold?.data) {
    globalKeepalive.updateContext('film_scaffold', 15, 'generating scaffold');
    
    const scaffoldHash = await hashInput(summaryText, config, 'film_scaffold');
    const scaffoldResult = await executeSubstepIfNeeded(
      supabase, { ...outline, outline_parts: parts }, 'film_scaffold', scaffoldHash,
      async () => {
        console.log(`[WORKER] FILM SCAFFOLD: generating base architecture`);
        await updateOutline(supabase, outline.id, { 
          stage: 'outline', substage: 'film_scaffold', progress: 15,
          heartbeat_at: new Date().toISOString()
        });
        
        // V16: Wrap scaffold with 502 retry
        const { toolArgs, content } = await callWithRetry502(
          () => callLovableAIWithToolAndHeartbeat(
            supabase, outline.id,
            buildFilmScaffoldSystem(genre, tone, duration),
            buildFilmScaffoldUser(summaryText, duration),
            QUALITY_MODEL, 3000, 'generate_film_scaffold', 
            FILM_SCAFFOLD_SCHEMA.parameters, 'film_scaffold',
            FILM_TIMEOUTS.SCAFFOLD_MS
          ),
          { maxAttempts: 3, supabase, outlineId: outline.id, substage: 'film_scaffold', label: 'FILM_SCAFFOLD' }
        );
        
        const parseResult = parseJsonSafe(toolArgs || content, 'film_scaffold');
        if (!parseResult.json) throw new Error('FILM_SCAFFOLD failed to parse');
        
        console.log(`[WORKER] FILM SCAFFOLD done: "${parseResult.json.title}"`);
        return parseResult.json;
      }
    );
    parts.film_scaffold = { status: 'done', hash: scaffoldHash, data: scaffoldResult.data };
    await updateOutline(supabase, outline.id, { outline_parts: parts });
    scaffold = scaffoldResult.data;
  } else {
    console.log(`[WORKER] FILM V2 RESUME: Reusing existing scaffold`);
    scaffold = parts.film_scaffold.data;
  }
  
  // ════════════════════════════════════════════════════════════════════════
  // PHASE 2A: EXPAND ACT I (V18: CHUNKED EXPANSION for runtime stability)
  // ════════════════════════════════════════════════════════════════════════
  if (resumeFrom === 'scaffold' || resumeFrom === 'expand_act_i' || !parts.expand_act_i?.data?.beats?.length) {
    globalKeepalive.updateContext('expand_act_i', 30, 'expanding act I (chunked)');
    
    console.log(`[WORKER] === ACT I: Using V18 CHUNKED EXPANSION ===`);
    
    await updateOutline(supabase, outline.id, { 
      substage: 'expand_act_i', progress: 30,
      heartbeat_at: new Date().toISOString()
    });
    
    // V18: Use expandActInChunks instead of expandActWithRetry
    const actIResult = await expandActInChunks(
      supabase, outline.id, scaffold, 'I', parts, genre, tone
    );
    
    // The function already updates parts internally, but ensure final state
    if (!parts.expand_act_i?.data?.beats?.length) {
      parts.expand_act_i = { 
        ...parts.expand_act_i,
        status: 'done', 
        data: actIResult 
      };
      await updateOutline(supabase, outline.id, { outline_parts: parts });
    }
  } else {
    console.log(`[WORKER] FILM V2 RESUME: Reusing existing ACT I (${parts.expand_act_i.data.beats?.length} beats)`);
  }
  
  // ════════════════════════════════════════════════════════════════════════
  // PHASE 2B: EXPAND ACT II (V18: CHUNKED EXPANSION for runtime stability)
  // ════════════════════════════════════════════════════════════════════════
  if (resumeFrom === 'scaffold' || resumeFrom === 'expand_act_i' || resumeFrom === 'expand_act_ii' || !parts.expand_act_ii?.data?.beats?.length) {
    globalKeepalive.updateContext('expand_act_ii', 50, 'expanding act II (chunked)');
    
    console.log(`[WORKER] === ACT II: Using V18 CHUNKED EXPANSION ===`);
    
    await updateOutline(supabase, outline.id, { 
      substage: 'expand_act_ii', progress: 50,
      heartbeat_at: new Date().toISOString()
    });
    
    // V18: Use expandActInChunks with Act I context
    const actIIResult = await expandActInChunks(
      supabase, outline.id, scaffold, 'II', parts, genre, tone,
      parts.expand_act_i?.data  // Pass Act I for context
    );
    
    if (!parts.expand_act_ii?.data?.beats?.length) {
      parts.expand_act_ii = { 
        ...parts.expand_act_ii,
        status: 'done', 
        data: actIIResult 
      };
      await updateOutline(supabase, outline.id, { outline_parts: parts });
    }
  } else {
    console.log(`[WORKER] FILM V2 RESUME: Reusing existing ACT II (${parts.expand_act_ii.data.beats?.length} beats)`);
  }
  
  // ════════════════════════════════════════════════════════════════════════
  // PHASE 2C: EXPAND ACT III (V18: CHUNKED EXPANSION for runtime stability)
  // ════════════════════════════════════════════════════════════════════════
  if (resumeFrom === 'scaffold' || resumeFrom === 'expand_act_i' || resumeFrom === 'expand_act_ii' || resumeFrom === 'expand_act_iii' || !parts.expand_act_iii?.data?.beats?.length) {
    globalKeepalive.updateContext('expand_act_iii', 75, 'expanding act III (chunked)');
    
    console.log(`[WORKER] === ACT III: Using V18 CHUNKED EXPANSION ===`);
    
    await updateOutline(supabase, outline.id, { 
      substage: 'expand_act_iii', progress: 75,
      heartbeat_at: new Date().toISOString()
    });
    
    // V18: Use expandActInChunks with Act I + II context
    const actIIIResult = await expandActInChunks(
      supabase, outline.id, scaffold, 'III', parts, genre, tone,
      parts.expand_act_i?.data,   // Pass Act I for context
      parts.expand_act_ii?.data   // Pass Act II for context
    );
    
    if (!parts.expand_act_iii?.data?.beats?.length) {
      parts.expand_act_iii = { 
        ...parts.expand_act_iii,
        status: 'done', 
        data: actIIIResult 
      };
      await updateOutline(supabase, outline.id, { outline_parts: parts });
    }
  } else {
    console.log(`[WORKER] FILM V2 RESUME: Reusing existing ACT III (${parts.expand_act_iii.data.beats?.length} beats)`);
  }
  
  // ════════════════════════════════════════════════════════════════════════
  // PHASE 3: MERGE + VALIDATION (local, sin AI)
  // ════════════════════════════════════════════════════════════════════════
  globalKeepalive.updateContext('merge', 85, 'merging acts');
  console.log(`[WORKER] FILM MERGE: Unifying 3 acts`);
  await updateOutline(supabase, outline.id, { 
    substage: 'merge', progress: 85,
    heartbeat_at: new Date().toISOString()
  });
  
  const filmOutline = mergeFilmParts(
    scaffold,
    parts.expand_act_i.data,
    parts.expand_act_ii.data,
    parts.expand_act_iii.data
  );
  
  // Validación anti-genéricas
  const violations = detectForbiddenWords(filmOutline, formatProfile.forbidden_words);
  if (violations.length > 0) {
    console.warn(`[WORKER] FILM: Forbidden words detected: ${violations.join(', ')}`);
  }
  
  // Convertir a formato universal (compatible con pipeline existente)
  const universalOutline = filmOutlineToUniversalFormat(filmOutline);
  
  // Guardar outline final
  await updateOutline(supabase, outline.id, { 
    outline_json: universalOutline, 
    progress: 100,
    heartbeat_at: new Date().toISOString()
  });
  
  const totalBeats = (parts.expand_act_i.data?.beats?.length || 0) + 
                     (parts.expand_act_ii.data?.beats?.length || 0) + 
                     (parts.expand_act_iii.data?.beats?.length || 0);
  
  console.log(`[WORKER] FILM V2 COMPLETE: "${filmOutline.title}" - ${totalBeats} beats across 3 acts`);
  return universalOutline;
  
  } finally {
    // V15: Always stop the global keepalive when function ends (success or error)
    globalKeepalive.stop();
  }
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
  const densityTargets = outline.density_targets;  // V11.2: Get density targets
  const config = { episodesCount, genre, tone, midpoint, densityTargets };

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
      
const locationsMin = densityTargets?.locations_min || 8;
      console.log(`[WORKER] Density targets - Locations min: ${locationsMin}`);
      const partAPrompt = buildPartAPrompt(summaryText, episodesCount, genre, tone, locationsMin);
      const partASystem = buildPartASystem(genre, tone, densityTargets);  // V11.2: Use dynamic system prompt
      
      // V11.1: Use executeWithFallback for PART_A with specific timeout
      const result = await executeWithFallback(
        async (model, timeout) => {
          const { toolArgs, content } = await callLovableAIWithToolAndHeartbeat(
            supabase, outline.id,
            partASystem, partAPrompt,  // V11.2: Use dynamic system prompt instead of static
            model, 4000,
            'deliver_part_a', PART_A_TOOL_SCHEMA, 'arc',
            timeout
          );
          return { toolArgs, content };
        },
        QUALITY_MODEL,
        FAST_MODEL,
        TIMEOUTS.OUTLINE_ARC_MS,
        TIMEOUTS.OUTLINE_ARC_MS + 10000,  // Extra time for fallback
        'PART_A'
      );
      
      const parseResult = parseJsonSafe(result.toolArgs || result.content, 'part_a');
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
      // V13: Resolve narrative profile for episode generation
      const narrativeProfile = resolveNarrativeProfile(genre, tone);
      
      // V11.1: Use executeWithFallback for PART_B with specific timeout
      const result = await executeWithFallback(
        async (model, timeout) => {
          const { toolArgs, content } = await callLovableAIWithToolAndHeartbeat(
            supabase, outline.id,
            buildEpisodesSystem(narrativeProfile), partBPrompt,
            model, 6000,
            'deliver_episodes', EPISODES_TOOL_SCHEMA, 'episodes_1',
            timeout
          );
          return { toolArgs, content };
        },
        QUALITY_MODEL,
        FAST_MODEL,
        TIMEOUTS.OUTLINE_EPISODES_MS,
        TIMEOUTS.OUTLINE_EPISODES_MS + 10000,  // Extra time for fallback
        'PART_B'
      );
      
      const parseResult = parseJsonSafe(result.toolArgs || result.content, 'part_b');
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
        // V13: Resolve narrative profile for episode generation
        const narrativeProfile = resolveNarrativeProfile(genre, tone);
        
        // V11.1: Use executeWithFallback for PART_C with specific timeout
        const result = await executeWithFallback(
          async (model, timeout) => {
            const { toolArgs, content } = await callLovableAIWithToolAndHeartbeat(
              supabase, outline.id,
              buildEpisodesSystem(narrativeProfile), partCPrompt,
              model, 6000,
              'deliver_episodes', EPISODES_TOOL_SCHEMA, 'episodes_2',
              timeout
            );
            return { toolArgs, content };
          },
          QUALITY_MODEL,
          FAST_MODEL,
          TIMEOUTS.OUTLINE_EPISODES_MS,
          TIMEOUTS.OUTLINE_EPISODES_MS + 10000,  // Extra time for fallback
          'PART_C'
        );
        
        const parseResult = parseJsonSafe(result.toolArgs || result.content, 'part_c');
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
  
  // V11.3: Pass user's original genre/tone to enforce them in final output
  console.log(`[WORKER] Merging with USER values - Genre: ${genre}, Tone: ${tone}`);
  const merged = mergeOutlineParts(partsData, episodesCount, genre, tone);
  
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
function mergeOutlineParts(
  parts: any, 
  expectedEpisodes: number,
  userGenre?: string,  // V11.3: User's original genre (priority over AI-generated)
  userTone?: string    // V11.3: User's original tone (priority over AI-generated)
): any {
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
    // V11.3: FORCE user's genre/tone - never trust what the model generated
    genre: userGenre || partA.genre || 'Drama',
    tone: userTone || partA.tone || 'Cinematográfico',
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
      query = query.eq('project_id', projectId).in('status', ['queued', 'generating', 'draft', 'timeout', 'stalled']).order('updated_at', { ascending: false }).limit(1);
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

    // V24: FIX FOR CHUNKED MODE - Disable global attempts gating for FILM format
    // In chunked mode, each "Continue" invocation increments attempts, but that's NOT a retry.
    // Retry logic is handled per-chunk via outline_parts.<act>.retry_count
    const isFilmFormat = outline.format === 'film' || outline.format === 'FILM';
    const isChunkedMode = isFilmFormat; // FILM uses chunked expansion
    const CHUNKED_MAX_INVOCATIONS = 50; // Allow many invocations for chunked mode (3 acts * 3-5 chunks each + retries)
    const effectiveMaxAttempts = isChunkedMode ? CHUNKED_MAX_INVOCATIONS : MAX_ATTEMPTS;
    
    // Check attempts (only block on truly excessive invocations for chunked mode)
    if (outline.attempts >= effectiveMaxAttempts) {
      await updateOutline(supabase, outline.id, {
        status: 'failed',
        error_code: 'MAX_ATTEMPTS_EXCEEDED',
        error_detail: `Exceeded ${effectiveMaxAttempts} ${isChunkedMode ? 'invocations (chunked)' : 'attempts'}`
      });
      return new Response(
        JSON.stringify({ success: false, code: 'MAX_ATTEMPTS_EXCEEDED' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Increment invocations and set initial heartbeat
    // V24: For chunked mode, this is "invocation count", not "retry count"
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

    // V12: FILM/SERIES BIFURCATION
    const formatProfile = buildFormatProfile({
      format: outline.format,
      target_duration_min: 110, // Default for film
      episodes_count: outline.episode_count
    });
    console.log(`[WORKER] ${formatProfileSummary(formatProfile)}`);

    // Stage B: Outline Generation (bifurcated by format)
    if (currentStage === 'none' || currentStage === 'summarize' || currentStage === 'outline') {
      if (formatProfile.type === 'FILM') {
        // FILM ROUTE: Single-pass 3-act structure (Hollywood prompts)
        console.log(`[WORKER] === FILM MODE: Single-pass 3-act structure ===`);
        outlineJson = await stageFilmOutline(
          supabase, 
          { ...outline, summary_text: summaryText }, 
          summaryText!,
          formatProfile
        );
      } else {
        // SERIES/MINI ROUTE: Fan-out with episodes
        console.log(`[WORKER] === SERIES MODE: Fan-out episodes ===`);
        outlineJson = await stageOutlineFanOut(supabase, { ...outline, summary_text: summaryText }, summaryText!);
      }
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

    // CRITICAL: Always update outline with error status if we have an ID
    // This ensures the UI can detect failure and offer retry options
    if (outlineId) {
      try {
        const supabase = createClient(
          Deno.env.get('SUPABASE_URL')!,
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        );
        
        // V23: Classify error type for better debugging and resume capability
        const isTimeout = err.message?.includes('AI_TIMEOUT') || err.message?.includes('AbortError');
        const isRateLimit = err.status === 429 || err.message?.includes('429');
        const isPayment = err.status === 402 || err.message?.includes('402');
        const isExpandActFail = err.message?.includes('EXPAND_ACT') || err.message?.includes('ALL_ATTEMPTS_FAILED');
        const isParseFail = err.message?.includes('failed to parse') || err.message?.includes('parse failed');
        // V23: Chunk continue is NOT an error - it's a controlled exit after successful chunk
        const isChunkContinue = err.message?.includes('CHUNK_CONTINUE_NEEDED');
        // V20: Chunk failure is RESUMABLE - NOT a terminal failure
        const isChunkAttemptFailed = err.message?.includes('CHUNK_ATTEMPT_FAILED');
        const isChunkMaxRetries = err.message?.includes('CHUNK_MAX_RETRIES');
        
        // V23: CHUNK_CONTINUE_NEEDED is a SUCCESS case - don't update status (already set)
        if (isChunkContinue) {
          console.log(`[WORKER] V23: Chunk complete, controlled exit. No error status update needed.`);
          // Return early - the status was already set to 'stalled' + 'CHUNK_READY_NEXT'
          // which is the correct state for the UI to show "Continue" button
        } else {
          let errorCode = 'WORKER_ERROR';
          let status = 'failed';
          
          if (isChunkAttemptFailed) {
            // V20: Chunk failed but has retries left - mark as STALLED so user can resume
            errorCode = 'CHUNK_ATTEMPT_FAILED';
            status = 'stalled';  // STALLED allows "Continue Generation" button
            console.log(`[WORKER] V23: Chunk attempt failed, marking as STALLED for resume`);
          } else if (isChunkMaxRetries) {
            // V20: Chunk exhausted all retries - terminal failure
            errorCode = 'CHUNK_MAX_RETRIES';
            status = 'failed';
          } else if (isTimeout) {
            errorCode = 'STAGE_TIMEOUT';
            status = 'stalled';  // V20: Timeout is also resumable
          } else if (isRateLimit) {
            errorCode = 'RATE_LIMIT';
            status = 'stalled';  // V20: Rate limit is resumable
          } else if (isPayment) {
            errorCode = 'PAYMENT_REQUIRED';
            status = 'failed';
          } else if (isExpandActFail) {
            errorCode = 'EXPAND_ACT_FAILED';
            status = 'failed';
          } else if (isParseFail) {
            errorCode = 'JSON_PARSE_FAILED';
            status = 'stalled';  // V20: Parse fail might succeed on retry with strict JSON
          }
          
          // V14: Extract which substage failed from error message
          let failedSubstage = null;
          const substageMatch = err.message?.match(/expand_act_(i{1,3})/i);
          if (substageMatch) {
            failedSubstage = `expand_act_${substageMatch[1].toLowerCase()}`;
          }
          
          await updateOutline(supabase, outlineId, {
            status,
            error_code: errorCode,
            error_detail: (err.message || 'Unknown error').substring(0, 500),
            // V14: Preserve substage for resume capability
            ...(failedSubstage && { substage: failedSubstage }),
            heartbeat_at: new Date().toISOString()
          });
          
          console.log(`[WORKER] Updated outline ${outlineId} with status=${status}, error_code=${errorCode}`);
        }
      } catch (updateErr) {
        // Last resort: log the error but don't throw - we're already in error handling
        console.error('[WORKER] Failed to update outline status after error:', updateErr);
      }
    }

    // V23: CHUNK_CONTINUE_NEEDED is a success case - return success response
    const isChunkContinue = err.message?.includes('CHUNK_CONTINUE_NEEDED');
    if (isChunkContinue) {
      return new Response(
        JSON.stringify({
          success: true,
          code: 'CHUNK_COMPLETE',
          message: 'Chunk completed. Continue generation for remaining chunks.',
          needs_continue: true
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
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
