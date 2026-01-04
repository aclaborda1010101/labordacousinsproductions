import { supabase } from '@/integrations/supabase/client';

export interface GenerateRunPayload {
  projectId: string;
  type: 'character' | 'location' | 'keyframe';
  phase: 'exploration' | 'production';
  engine: string;
  engineSelectedBy: 'auto' | 'user';
  engineReason?: string;
  prompt: string;
  context?: string;
  params?: Record<string, unknown>;
  parentRunId?: string; // For regeneration chains
  presetId?: string; // For editorial assistant tracking
}

export interface GenerateRunResult {
  ok: boolean;
  runId?: string;
  outputUrl?: string;
  outputType?: 'image' | 'text';
  engine?: string;
  model?: string;
  generationTimeMs?: number;
  warnings?: unknown[];
  suggestions?: unknown[];
  error?: string;
}

/**
 * Unified generation gateway - routes to appropriate edge function
 * and logs telemetry to generation_runs table
 */
export async function generateRun(payload: GenerateRunPayload): Promise<GenerateRunResult> {
  try {
    const { data, error } = await supabase.functions.invoke('generate-run', {
      body: payload
    });

    if (error) {
      console.error('[generateRun] invoke error:', error);
      return {
        ok: false,
        error: error.message || 'Failed to invoke generate-run'
      };
    }

    return data as GenerateRunResult;
  } catch (err) {
    console.error('[generateRun] exception:', err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Unknown error'
    };
  }
}

/**
 * Update run status (accept/reject)
 */
export async function updateRunStatus(
  runId: string, 
  status: 'accepted' | 'rejected'
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('generation_runs')
      .update({ status })
      .eq('id', runId);

    if (error) {
      console.error('[updateRunStatus] error:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[updateRunStatus] exception:', err);
    return false;
  }
}

/**
 * Mark run as canon
 */
export async function setRunCanon(
  runId: string, 
  isCanon: boolean
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('generation_runs')
      .update({ is_canon: isCanon })
      .eq('id', runId);

    if (error) {
      console.error('[setRunCanon] error:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[setRunCanon] exception:', err);
    return false;
  }
}
