// =============================================================================
// V3.0 ENTERPRISE UTILITIES
// Production-grade security, concurrency, rate limiting, and response contracts
// =============================================================================

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

// =============================================================================
// CORS HEADERS (Standard)
// =============================================================================
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// =============================================================================
// V3 RESPONSE CONTRACTS
// =============================================================================

export interface V3SuccessResponse<T = unknown> {
  success: true;
  data: T;
  _meta?: {
    schemaVersion: string;
    runId?: string;
    durationMs?: number;
  };
}

export interface V3ErrorResponse {
  success: false;
  code: V3ErrorCode;
  message: string;
  retryAfter?: number;
}

export type V3ErrorCode = 
  | 'AUTH_MISSING'
  | 'AUTH_INVALID'
  | 'PROJECT_NOT_FOUND'
  | 'PROJECT_ACCESS_DENIED'
  | 'PROJECT_BUSY'
  | 'RATE_LIMIT_EXCEEDED'
  | 'FILE_TOO_LARGE'
  | 'FILE_INVALID'
  | 'MODEL_OUTPUT_INVALID'
  | 'VALIDATION_ERROR'
  | 'INTERNAL_ERROR'
  | 'TIMEOUT';

export function v3Success<T>(data: T, meta?: Partial<V3SuccessResponse['_meta']>): Response {
  const response: V3SuccessResponse<T> = {
    success: true,
    data,
    _meta: {
      schemaVersion: '3.0',
      ...meta,
    },
  };
  return new Response(JSON.stringify(response), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

export function v3Error(code: V3ErrorCode, message: string, status = 400, retryAfter?: number): Response {
  const response: V3ErrorResponse = {
    success: false,
    code,
    message,
    ...(retryAfter !== undefined && { retryAfter }),
  };
  
  const headers: Record<string, string> = { ...corsHeaders, 'Content-Type': 'application/json' };
  if (retryAfter) {
    headers['Retry-After'] = String(retryAfter);
  }
  
  return new Response(JSON.stringify(response), { status, headers });
}

// =============================================================================
// V3 AUTH CONTEXT
// =============================================================================

export interface V3AuthContext {
  userId: string;
  supabase: SupabaseClient;
  isServiceRole: boolean;
  isBypass: boolean;
}

/**
 * V3 Enterprise Authentication
 * - ALWAYS requires Authorization header
 * - Creates user-scoped Supabase client
 * - Validates user explicitly
 */
export async function v3RequireAuth(req: Request): Promise<V3AuthContext | Response> {
  const authHeader = req.headers.get('Authorization');
  
  // Check for bypass mode (development only)
  const bypassAuth = Deno.env.get('BYPASS_AUTH') === 'true';
  if (bypassAuth) {
    console.log('[V3-AUTH] Auth bypass enabled (development mode)');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    return {
      userId: 'bypass',
      supabase: createClient(supabaseUrl, supabaseKey),
      isServiceRole: true,
      isBypass: true,
    };
  }
  
  if (!authHeader) {
    return v3Error('AUTH_MISSING', 'Authorization header required', 401);
  }
  
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  
  // Create user-scoped client
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: { Authorization: authHeader },
    },
  });
  
  // Validate user
  const { data: { user }, error } = await supabase.auth.getUser();
  
  if (error || !user) {
    console.error('[V3-AUTH] Token validation failed:', error?.message);
    return v3Error('AUTH_INVALID', 'Invalid or expired token', 401);
  }
  
  console.log('[V3-AUTH] User authenticated:', user.id);
  
  return {
    userId: user.id,
    supabase,
    isServiceRole: false,
    isBypass: false,
  };
}

/**
 * V3 Enterprise Project Access Check
 */
export async function v3RequireProjectAccess(
  auth: V3AuthContext,
  projectId: string
): Promise<true | Response> {
  // Skip for bypass/service role
  if (auth.isBypass || auth.isServiceRole) {
    console.log('[V3-AUTH] Skipping project access check for:', auth.userId);
    return true;
  }
  
  // Check project ownership
  const { data: project, error } = await auth.supabase
    .from('projects')
    .select('id, owner_id')
    .eq('id', projectId)
    .single();
  
  if (error || !project) {
    console.error('[V3-AUTH] Project not found:', projectId);
    return v3Error('PROJECT_NOT_FOUND', 'Project not found', 404);
  }
  
  if (project.owner_id === auth.userId) {
    console.log('[V3-AUTH] Project owner access granted:', projectId);
    return true;
  }
  
  // Check team membership
  const { data: membership } = await auth.supabase
    .from('project_members')
    .select('id')
    .eq('project_id', projectId)
    .eq('user_id', auth.userId)
    .single();
  
  if (!membership) {
    console.error('[V3-AUTH] Access denied to project:', projectId, 'for user:', auth.userId);
    return v3Error('PROJECT_ACCESS_DENIED', 'Access denied to this project', 403);
  }
  
  console.log('[V3-AUTH] Team member access granted:', projectId);
  return true;
}

// =============================================================================
// V3 ATOMIC PROJECT LOCKING
// =============================================================================

export interface LockResult {
  acquired: boolean;
  retryAfter?: number;
}

/**
 * V3 Enterprise Project Lock
 * Uses database-level atomic locking to prevent concurrent operations
 */
export async function v3AcquireProjectLock(
  supabase: SupabaseClient,
  projectId: string,
  userId: string,
  reason: string,
  durationSeconds = 600
): Promise<LockResult> {
  // Use service role for lock operations
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const adminClient = createClient(supabaseUrl, serviceKey);
  
  try {
    const { data, error } = await adminClient.rpc('acquire_project_lock', {
      p_project_id: projectId,
      p_user_id: userId,
      p_reason: reason,
      p_duration_seconds: durationSeconds,
    });
    
    if (error) {
      console.error('[V3-LOCK] Failed to acquire lock:', error);
      return { acquired: false, retryAfter: 30 };
    }
    
    const acquired = data === true;
    console.log('[V3-LOCK]', acquired ? 'Lock acquired' : 'Lock busy', { projectId, reason });
    
    return { 
      acquired, 
      retryAfter: acquired ? undefined : 30 
    };
  } catch (err) {
    console.error('[V3-LOCK] Exception acquiring lock:', err);
    return { acquired: false, retryAfter: 30 };
  }
}

/**
 * V3 Enterprise Project Lock Release
 */
export async function v3ReleaseProjectLock(
  projectId: string,
  userId: string
): Promise<void> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const adminClient = createClient(supabaseUrl, serviceKey);
  
  try {
    await adminClient.rpc('release_project_lock', {
      p_project_id: projectId,
      p_user_id: userId,
    });
    console.log('[V3-LOCK] Lock released:', projectId);
  } catch (err) {
    console.error('[V3-LOCK] Exception releasing lock:', err);
  }
}

// =============================================================================
// V3 RATE LIMITING
// =============================================================================

export interface RateLimitResult {
  allowed: boolean;
  retryAfter?: number;
}

/**
 * V3 Enterprise Rate Limit Check
 * Limits expensive operations per project per minute
 */
export async function v3CheckRateLimit(
  projectId: string,
  userId: string,
  functionName: string,
  maxPerMinute = 3
): Promise<RateLimitResult> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const adminClient = createClient(supabaseUrl, serviceKey);
  
  try {
    const { data, error } = await adminClient.rpc('check_rate_limit', {
      p_project_id: projectId,
      p_user_id: userId,
      p_function_name: functionName,
      p_max_per_minute: maxPerMinute,
    });
    
    if (error) {
      console.error('[V3-RATE] Rate limit check failed:', error);
      // On error, allow (fail-open for availability)
      return { allowed: true };
    }
    
    const allowed = data === true;
    console.log('[V3-RATE]', allowed ? 'Allowed' : 'Rate limited', { projectId, functionName });
    
    return { 
      allowed, 
      retryAfter: allowed ? undefined : 60 
    };
  } catch (err) {
    console.error('[V3-RATE] Exception checking rate limit:', err);
    return { allowed: true }; // Fail-open
  }
}

// =============================================================================
// V3 RUN LOGGING (Observability)
// =============================================================================

export interface RunLogEntry {
  userId: string;
  projectId?: string;
  functionName: string;
  provider?: string;
  model?: string;
  tokensEstimated?: number;
  metadata?: Record<string, unknown>;
}

/**
 * V3 Enterprise Run Log - Start
 */
export async function v3LogRunStart(entry: RunLogEntry): Promise<string | null> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const adminClient = createClient(supabaseUrl, serviceKey);
  
  try {
    const { data, error } = await adminClient
      .from('generation_run_logs')
      .insert({
        user_id: entry.userId,
        project_id: entry.projectId,
        function_name: entry.functionName,
        provider: entry.provider,
        model: entry.model,
        tokens_estimated: entry.tokensEstimated,
        metadata: entry.metadata || {},
        status: 'running',
      })
      .select('id')
      .single();
    
    if (error) {
      console.error('[V3-LOG] Failed to start run log:', error);
      return null;
    }
    
    return data.id;
  } catch (err) {
    console.error('[V3-LOG] Exception starting run log:', err);
    return null;
  }
}

/**
 * V3 Enterprise Run Log - Complete
 */
export async function v3LogRunComplete(
  runId: string,
  status: 'success' | 'failed' | 'timeout' | 'rate_limited',
  tokensActual?: number,
  costEstimate?: number,
  errorCode?: string,
  errorMessage?: string
): Promise<void> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const adminClient = createClient(supabaseUrl, serviceKey);
  
  try {
    await adminClient
      .from('generation_run_logs')
      .update({
        status,
        tokens_actual: tokensActual,
        cost_estimate_usd: costEstimate,
        error_code: errorCode,
        error_message: errorMessage,
        finished_at: new Date().toISOString(),
      })
      .eq('id', runId);
  } catch (err) {
    console.error('[V3-LOG] Exception completing run log:', err);
  }
}

// =============================================================================
// V3 FILE VALIDATION
// =============================================================================

export interface FileValidationResult {
  valid: boolean;
  errorCode?: V3ErrorCode;
  errorMessage?: string;
}

/**
 * V3 Enterprise File Size Validation
 */
export function v3ValidateFileSize(
  sizeBytes: number,
  maxSizeMB = 20
): FileValidationResult {
  const maxBytes = maxSizeMB * 1024 * 1024;
  
  if (sizeBytes > maxBytes) {
    return {
      valid: false,
      errorCode: 'FILE_TOO_LARGE',
      errorMessage: `File exceeds maximum size of ${maxSizeMB}MB`,
    };
  }
  
  return { valid: true };
}

// =============================================================================
// V3 TIMEOUT WRAPPER
// =============================================================================

/**
 * V3 Enterprise Timeout Wrapper
 * Wraps async operations with a timeout
 */
export async function v3WithTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  operationName: string
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const result = await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        controller.signal.addEventListener('abort', () => {
          reject(new Error(`Timeout: ${operationName} exceeded ${timeoutMs}ms`));
        });
      }),
    ]);
    clearTimeout(timeoutId);
    return result;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

// =============================================================================
// V3 ENTERPRISE BOOTSTRAP PATTERN
// =============================================================================

export interface V3BootstrapResult {
  auth: V3AuthContext;
  projectId?: string;
  runId?: string;
  cleanup: () => Promise<void>;
}

/**
 * V3 Enterprise Bootstrap
 * Standard pattern for all expensive Edge Functions:
 * 1. Authenticate
 * 2. Validate project access
 * 3. Acquire lock
 * 4. Check rate limit
 * 5. Log run start
 */
export async function v3Bootstrap(
  req: Request,
  projectId: string | undefined,
  functionName: string,
  options: {
    requireLock?: boolean;
    rateLimit?: number;
    lockDuration?: number;
  } = {}
): Promise<V3BootstrapResult | Response> {
  const { requireLock = true, rateLimit = 3, lockDuration = 600 } = options;
  
  // 1. Authenticate
  const authResult = await v3RequireAuth(req);
  if (authResult instanceof Response) {
    return authResult;
  }
  const auth = authResult;
  
  // 2. Validate project access (if projectId provided)
  if (projectId) {
    const accessResult = await v3RequireProjectAccess(auth, projectId);
    if (accessResult instanceof Response) {
      return accessResult;
    }
    
    // 3. Acquire lock (if required)
    if (requireLock) {
      const lockResult = await v3AcquireProjectLock(
        auth.supabase,
        projectId,
        auth.userId,
        functionName,
        lockDuration
      );
      
      if (!lockResult.acquired) {
        return v3Error('PROJECT_BUSY', 'Another operation is in progress for this project', 409, lockResult.retryAfter);
      }
    }
    
    // 4. Check rate limit
    const rateLimitResult = await v3CheckRateLimit(projectId, auth.userId, functionName, rateLimit);
    if (!rateLimitResult.allowed) {
      // Release lock if we acquired it
      if (requireLock) {
        await v3ReleaseProjectLock(projectId, auth.userId);
      }
      return v3Error('RATE_LIMIT_EXCEEDED', 'Too many requests, please try again later', 429, rateLimitResult.retryAfter);
    }
  }
  
  // 5. Log run start
  const runId = await v3LogRunStart({
    userId: auth.userId,
    projectId,
    functionName,
  });
  
  // Cleanup function for finally {} blocks
  const cleanup = async () => {
    if (projectId && requireLock) {
      await v3ReleaseProjectLock(projectId, auth.userId);
    }
  };
  
  return {
    auth,
    projectId,
    runId: runId || undefined,
    cleanup,
  };
}
