/**
 * JOB MANAGER - Idempotency system for generation jobs
 * 
 * Provides:
 * - Cache lookup by hash_input (skip work if already done)
 * - Job status tracking
 * - Retry policy with model fallback
 */

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { MODEL_CONFIG, getRetryModel, getRetryChunkSize } from "./model-config.ts";

// =============================================================================
// TYPES
// =============================================================================

export interface JobRecord {
  id: string;
  job_id: string;
  chunk_id: string | null;
  job_type: string;
  hash_input: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  result_json: any;
  attempts: number;
  error_detail: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface RetryContext {
  attempt: number;
  model: string;
  chunkSize: number;
  shouldRetry: boolean;
  retryReason?: string;
}

// =============================================================================
// HASH GENERATION
// =============================================================================

async function hashInput(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

// =============================================================================
// JOB OPERATIONS
// =============================================================================

/**
 * Get or create a job. If hash_input already exists and completed, returns cached result.
 */
export async function getOrCreateJob(
  supabase: SupabaseClient,
  params: {
    jobId: string;
    chunkId?: string;
    jobType: string;
    inputData: string;
  }
): Promise<{ job: JobRecord; cached: boolean }> {
  const hashInputValue = await hashInput(params.inputData);
  
  // Check for existing completed job
  const { data: existing, error: lookupError } = await supabase
    .from('generation_jobs')
    .select('*')
    .eq('hash_input', hashInputValue)
    .eq('status', 'completed')
    .single();
  
  if (existing && !lookupError) {
    console.log(`[JOB-MANAGER] Cache hit for hash: ${hashInputValue.slice(0, 8)}...`);
    return { job: existing as JobRecord, cached: true };
  }
  
  // Check for existing pending/processing job
  const { data: pending } = await supabase
    .from('generation_jobs')
    .select('*')
    .eq('job_id', params.jobId)
    .eq('chunk_id', params.chunkId || null)
    .single();
  
  if (pending) {
    return { job: pending as JobRecord, cached: false };
  }
  
  // Create new job
  const newJob: Partial<JobRecord> = {
    job_id: params.jobId,
    chunk_id: params.chunkId || null,
    job_type: params.jobType,
    hash_input: hashInputValue,
    status: 'pending',
    attempts: 0,
    result_json: null,
    error_detail: null,
  };
  
  const { data: created, error: createError } = await supabase
    .from('generation_jobs')
    .insert(newJob)
    .select()
    .single();
  
  if (createError) {
    console.error('[JOB-MANAGER] Failed to create job:', createError);
    throw new Error(`Failed to create job: ${createError.message}`);
  }
  
  console.log(`[JOB-MANAGER] Created new job: ${params.jobId}/${params.chunkId || 'main'}`);
  return { job: created as JobRecord, cached: false };
}

/**
 * Update job status
 */
export async function updateJobStatus(
  supabase: SupabaseClient,
  jobId: string,
  chunkId: string | null,
  status: JobRecord['status'],
  result?: any,
  errorDetail?: string
): Promise<void> {
  const updates: Record<string, any> = {
    status,
  };
  
  if (result !== undefined) {
    updates.result_json = result;
  }
  
  if (errorDetail !== undefined) {
    updates.error_detail = errorDetail;
  }
  
  if (status === 'completed' || status === 'failed') {
    updates.completed_at = new Date().toISOString();
  }
  
  const { error } = await supabase
    .from('generation_jobs')
    .update(updates)
    .eq('job_id', jobId)
    .eq('chunk_id', chunkId);
  
  if (error) {
    console.error('[JOB-MANAGER] Failed to update job:', error);
  }
}

/**
 * Increment attempt counter
 */
export async function incrementAttempts(
  supabase: SupabaseClient,
  jobId: string,
  chunkId: string | null
): Promise<number> {
  const { data, error } = await supabase
    .from('generation_jobs')
    .select('attempts')
    .eq('job_id', jobId)
    .eq('chunk_id', chunkId)
    .single();
  
  const newAttempts = (data?.attempts || 0) + 1;
  
  await supabase
    .from('generation_jobs')
    .update({ attempts: newAttempts, status: 'processing' })
    .eq('job_id', jobId)
    .eq('chunk_id', chunkId);
  
  return newAttempts;
}

/**
 * Get all jobs for a main job_id
 */
export async function getJobChunks(
  supabase: SupabaseClient,
  jobId: string
): Promise<JobRecord[]> {
  const { data, error } = await supabase
    .from('generation_jobs')
    .select('*')
    .eq('job_id', jobId)
    .order('chunk_id');
  
  if (error) {
    console.error('[JOB-MANAGER] Failed to get job chunks:', error);
    return [];
  }
  
  return data as JobRecord[];
}

// =============================================================================
// RETRY POLICY
// =============================================================================

/**
 * Retry policy implementation:
 * - Retry 1: Same prompt + "return JSON only"
 * - Retry 2: Reduce chunk to 50%
 * - Retry 3: Fallback model
 */
export function getRetryContext(
  currentAttempt: number,
  currentModel: string,
  currentChunkSize: number,
  error?: Error
): RetryContext {
  const maxRetries = MODEL_CONFIG.LIMITS.RETRY_COUNT;
  
  if (currentAttempt >= maxRetries) {
    return {
      attempt: currentAttempt,
      model: currentModel,
      chunkSize: currentChunkSize,
      shouldRetry: false,
      retryReason: 'Max retries exceeded',
    };
  }
  
  // Determine retry strategy based on attempt number
  let newModel = currentModel;
  let newChunkSize = currentChunkSize;
  let retryReason = '';
  
  if (currentAttempt === 1) {
    // Retry 1: Same model, add JSON enforcement
    retryReason = 'Adding JSON-only enforcement';
  } else if (currentAttempt === 2) {
    // Retry 2: Reduce chunk size
    newChunkSize = getRetryChunkSize(currentChunkSize, currentAttempt);
    retryReason = `Reducing chunk size to ${newChunkSize}`;
  } else if (currentAttempt === 3) {
    // Retry 3: Fallback model
    newModel = getRetryModel(currentModel, currentAttempt);
    retryReason = `Falling back to model: ${newModel}`;
  }
  
  return {
    attempt: currentAttempt + 1,
    model: newModel,
    chunkSize: newChunkSize,
    shouldRetry: true,
    retryReason,
  };
}

/**
 * Wrap a generation function with retry logic
 */
export async function withRetry<T>(
  supabase: SupabaseClient,
  jobId: string,
  chunkId: string | null,
  initialModel: string,
  initialChunkSize: number,
  generateFn: (model: string, chunkSize: number, addJsonEnforcement: boolean) => Promise<T>
): Promise<T> {
  let currentModel = initialModel;
  let currentChunkSize = initialChunkSize;
  let lastError: Error | undefined;
  
  for (let attempt = 1; attempt <= MODEL_CONFIG.LIMITS.RETRY_COUNT; attempt++) {
    try {
      // Update job status
      await updateJobStatus(supabase, jobId, chunkId, 'processing');
      await incrementAttempts(supabase, jobId, chunkId);
      
      // Add JSON enforcement on retry 1
      const addJsonEnforcement = attempt > 1;
      
      console.log(`[JOB-MANAGER] Attempt ${attempt}: model=${currentModel}, chunkSize=${currentChunkSize}`);
      
      const result = await generateFn(currentModel, currentChunkSize, addJsonEnforcement);
      
      // Success!
      await updateJobStatus(supabase, jobId, chunkId, 'completed', result);
      return result;
      
    } catch (error) {
      lastError = error as Error;
      console.error(`[JOB-MANAGER] Attempt ${attempt} failed:`, error);
      
      const retryCtx = getRetryContext(attempt, currentModel, currentChunkSize, lastError);
      
      if (!retryCtx.shouldRetry) {
        await updateJobStatus(supabase, jobId, chunkId, 'failed', null, lastError.message);
        throw lastError;
      }
      
      console.log(`[JOB-MANAGER] ${retryCtx.retryReason}`);
      currentModel = retryCtx.model;
      currentChunkSize = retryCtx.chunkSize;
    }
  }
  
  // Should not reach here, but just in case
  await updateJobStatus(supabase, jobId, chunkId, 'failed', null, lastError?.message || 'Unknown error');
  throw lastError || new Error('Generation failed after all retries');
}

// =============================================================================
// CHUNKING HELPERS
// =============================================================================

/**
 * Split text into chunks by page count or character limit
 */
export function chunkText(
  text: string,
  maxChars: number = MODEL_CONFIG.LIMITS.CHUNK_SIZE_CHARS
): { chunkId: string; text: string; startChar: number; endChar: number }[] {
  const chunks: { chunkId: string; text: string; startChar: number; endChar: number }[] = [];
  
  // Try to split by scene headings first
  const sluglineRegex = /^(?:\d+\s*[.\):\-–—]?\s*)?(INT\.?|EXT\.?|INT\/EXT\.?|I\/E\.?)\s*.+$/gim;
  const lines = text.split('\n');
  
  let currentChunk = '';
  let currentStartChar = 0;
  let charOffset = 0;
  let chunkIndex = 0;
  
  for (const line of lines) {
    const isSlugline = sluglineRegex.test(line);
    sluglineRegex.lastIndex = 0; // Reset regex
    
    // If adding this line would exceed limit, and we have content, create chunk
    if (currentChunk.length + line.length + 1 > maxChars && currentChunk.length > 0) {
      chunkIndex++;
      chunks.push({
        chunkId: `C${String(chunkIndex).padStart(3, '0')}`,
        text: currentChunk.trim(),
        startChar: currentStartChar,
        endChar: charOffset - 1,
      });
      currentChunk = '';
      currentStartChar = charOffset;
    }
    
    // Prefer to start new chunks at scene headings
    if (isSlugline && currentChunk.length > maxChars * 0.5) {
      chunkIndex++;
      chunks.push({
        chunkId: `C${String(chunkIndex).padStart(3, '0')}`,
        text: currentChunk.trim(),
        startChar: currentStartChar,
        endChar: charOffset - 1,
      });
      currentChunk = '';
      currentStartChar = charOffset;
    }
    
    currentChunk += line + '\n';
    charOffset += line.length + 1;
  }
  
  // Don't forget the last chunk
  if (currentChunk.trim().length > 0) {
    chunkIndex++;
    chunks.push({
      chunkId: `C${String(chunkIndex).padStart(3, '0')}`,
      text: currentChunk.trim(),
      startChar: currentStartChar,
      endChar: charOffset,
    });
  }
  
  console.log(`[JOB-MANAGER] Split text into ${chunks.length} chunks`);
  return chunks;
}

/**
 * Check if text needs chunking
 */
export function needsChunking(text: string): boolean {
  return text.length > MODEL_CONFIG.LIMITS.CHUNK_SIZE_CHARS;
}

// =============================================================================
// SUPABASE CLIENT HELPER
// =============================================================================

export function getSupabaseAdmin(): SupabaseClient {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase environment variables');
  }
  
  return createClient(supabaseUrl, supabaseKey);
}
