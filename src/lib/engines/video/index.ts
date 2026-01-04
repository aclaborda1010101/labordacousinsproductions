/**
 * ENGINE CORE - Unified Video Engine Layer
 * Normalizes all video generation through a single interface
 */

import { supabase } from '@/integrations/supabase/client';

export type VideoEngine = 'veo' | 'runway' | 'kling';

export interface VideoEnginePayload {
  projectId: string;
  type: 'shot' | 'clip';
  phase: 'exploration' | 'production';
  engine: VideoEngine;
  engineSelectedBy: 'auto' | 'user' | 'recommendation';
  engineReason?: string;
  prompt: string;
  context?: string;
  params?: Record<string, unknown>;
  parentRunId?: string;
  presetId?: string;
  userOverride?: boolean;
  durationSec?: number;
}

export interface VideoEngineResult {
  ok: boolean;
  runId?: string;
  outputUrl?: string;
  outputType?: 'video';
  engine?: string;
  model?: string;
  generationTimeMs?: number;
  warnings?: unknown[];
  suggestions?: unknown[];
  error?: string;
  status?: 'pending' | 'processing' | 'completed' | 'failed';
}

/**
 * Unified Video Engine - Routes to appropriate edge function
 * Note: Runway is placeholder, Veo and Kling are active
 */
export async function runVideoEngine(payload: VideoEnginePayload): Promise<VideoEngineResult> {
  try {
    // Route based on engine
    let functionName: string;
    
    switch (payload.engine) {
      case 'veo':
        functionName = 'veo_start';
        break;
      case 'kling':
        functionName = 'kling_start';
        break;
      case 'runway':
        // Runway is placeholder - return pending status
        return {
          ok: true,
          engine: 'runway',
          status: 'pending',
          error: 'Runway integration pending'
        };
      default:
        return {
          ok: false,
          error: `Unknown video engine: ${payload.engine}`
        };
    }

    const { data, error } = await supabase.functions.invoke(functionName, {
      body: {
        projectId: payload.projectId,
        prompt: payload.prompt,
        context: payload.context,
        params: payload.params,
        durationSec: payload.durationSec || 5
      }
    });

    if (error) {
      console.error(`[runVideoEngine] ${functionName} error:`, error);
      return {
        ok: false,
        error: error.message || `Failed to invoke ${functionName}`
      };
    }

    return {
      ok: true,
      runId: data?.runId || data?.id,
      outputUrl: data?.outputUrl,
      outputType: 'video',
      engine: payload.engine,
      status: data?.status || 'processing'
    };
  } catch (err) {
    console.error('[runVideoEngine] exception:', err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Unknown error'
    };
  }
}

/**
 * Get available video engines
 */
export function getAvailableVideoEngines(): { id: VideoEngine; label: string; description: string; status: 'active' | 'pending' }[] {
  return [
    {
      id: 'veo',
      label: 'Google Veo 3.1',
      description: 'Alta calidad cinematográfica',
      status: 'active'
    },
    {
      id: 'kling',
      label: 'Kling',
      description: 'Movimiento natural y expresivo',
      status: 'active'
    },
    {
      id: 'runway',
      label: 'Runway Gen-3',
      description: 'Próximamente disponible',
      status: 'pending'
    }
  ];
}

/**
 * Poll video generation status
 */
export async function pollVideoStatus(
  engine: VideoEngine,
  runId: string
): Promise<VideoEngineResult> {
  try {
    const functionName = engine === 'veo' ? 'veo_poll' : 'kling_poll';
    
    const { data, error } = await supabase.functions.invoke(functionName, {
      body: { runId }
    });

    if (error) {
      return {
        ok: false,
        error: error.message
      };
    }

    return {
      ok: true,
      runId,
      outputUrl: data?.outputUrl,
      outputType: 'video',
      engine,
      status: data?.status || 'processing'
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Unknown error'
    };
  }
}
