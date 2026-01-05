import { useCallback } from 'react';
import { useBackgroundTasks, TaskType, BackgroundTask } from '@/contexts/BackgroundTasksContext';
import { supabase } from '@/integrations/supabase/client';
import { useProjectLockRetry } from './useProjectLockRetry';

interface GenerationTaskOptions {
  type: TaskType;
  title: string;
  description?: string;
  projectId?: string;
  entityId?: string;
  entityName?: string;
  metadata?: Record<string, any>;
  enableLockRetry?: boolean; // Enable automatic retry for PROJECT_BUSY errors
  maxLockRetries?: number;
}

interface GenerationResult<T> {
  taskId: string;
  data: T;
}

/**
 * Hook for running generation tasks in the background with automatic progress tracking
 * 
 * Usage:
 * const { runGeneration, runPollingGeneration } = useGenerationTask();
 * 
 * // For simple one-shot generations:
 * const result = await runGeneration(
 *   { type: 'character_generation', title: 'Generando personaje...', entityName: 'John' },
 *   async (updateProgress) => {
 *     updateProgress(10);
 *     const { data } = await supabase.functions.invoke('generate-character', { body: {...} });
 *     updateProgress(90);
 *     return data;
 *   }
 * );
 * 
 * // For polling-based generations (video, LoRA, etc.):
 * const result = await runPollingGeneration(
 *   { type: 'video_generation', title: 'Generando video...' },
 *   'veo_start',
 *   { prompt: '...' },
 *   'veo_poll',
 *   (pollResult) => pollResult.status === 'completed',
 *   5000 // poll interval
 * );
 */
export function useGenerationTask() {
  const { addTask, updateTask, completeTask, failTask } = useBackgroundTasks();
  const { executeWithRetry, isWaitingForRetry, retryInfo, cancelRetry } = useProjectLockRetry();

  // Run a simple generation task
  const runGeneration = useCallback(async <T,>(
    options: GenerationTaskOptions,
    executor: (updateProgress: (progress: number) => void) => Promise<T>
  ): Promise<GenerationResult<T>> => {
    const taskId = addTask({
      type: options.type,
      title: options.title,
      description: options.description,
      projectId: options.projectId,
      entityId: options.entityId,
      entityName: options.entityName,
      metadata: options.metadata,
    });

    try {
      const data = await executor((progress) => {
        updateTask(taskId, { progress: Math.min(99, Math.max(0, progress)) });
      });

      completeTask(taskId, data);
      return { taskId, data };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
      failTask(taskId, errorMessage);
      throw error;
    }
  }, [addTask, updateTask, completeTask, failTask]);

  // Run a polling-based generation (for async video/LoRA jobs)
  const runPollingGeneration = useCallback(async <TStart, TPoll>(
    options: GenerationTaskOptions,
    startFunction: string,
    startBody: Record<string, any>,
    pollFunction: string,
    isComplete: (pollResult: TPoll) => boolean,
    pollInterval: number = 5000,
    maxPolls: number = 120, // 10 minutes at 5s intervals
    getProgress?: (pollResult: TPoll, pollCount: number) => number
  ): Promise<GenerationResult<TPoll>> => {
    const taskId = addTask({
      type: options.type,
      title: options.title,
      description: options.description,
      projectId: options.projectId,
      entityId: options.entityId,
      entityName: options.entityName,
      metadata: { ...options.metadata, isPolling: true },
    });

    try {
      // Start the job
      updateTask(taskId, { progress: 5, description: 'Iniciando generación...' });
      
      const { data: startData, error: startError } = await supabase.functions.invoke(startFunction, {
        body: startBody,
      });

      if (startError) throw startError;
      if (!startData) throw new Error('No se recibió respuesta del servidor');

      // Get the task/job ID from the start response
      const jobId = startData.taskId || startData.jobId || startData.operationName || startData.id;
      if (!jobId) {
        // If no polling ID, assume it's a synchronous result
        completeTask(taskId, startData);
        return { taskId, data: startData as TPoll };
      }

      updateTask(taskId, { 
        progress: 10, 
        description: 'Procesando...', 
        metadata: { ...options.metadata, jobId } 
      });

      // Poll for completion
      let pollCount = 0;
      while (pollCount < maxPolls) {
        await new Promise(resolve => setTimeout(resolve, pollInterval));
        pollCount++;

        const { data: pollData, error: pollError } = await supabase.functions.invoke(pollFunction, {
          body: { taskId: jobId, jobId, operationName: jobId },
        });

        if (pollError) throw pollError;

        // Calculate progress
        const progress = getProgress 
          ? getProgress(pollData, pollCount) 
          : Math.min(10 + (pollCount / maxPolls) * 85, 95);
        
        updateTask(taskId, { progress });

        if (isComplete(pollData)) {
          completeTask(taskId, pollData);
          return { taskId, data: pollData };
        }

        // Check for failure states
        if (pollData?.status === 'failed' || pollData?.status === 'error' || pollData?.error) {
          throw new Error(pollData.error || pollData.message || 'La generación falló');
        }
      }

      throw new Error('Tiempo de espera agotado');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
      failTask(taskId, errorMessage);
      throw error;
    }
  }, [addTask, updateTask, completeTask, failTask]);

  // Quick helper for Edge Function calls with automatic background tracking
  // Supports automatic retry for PROJECT_BUSY (409) errors when enableLockRetry is true
  const invokeWithTracking = useCallback(async <T,>(
    functionName: string,
    body: Record<string, any>,
    options: GenerationTaskOptions
  ): Promise<GenerationResult<T>> => {
    return runGeneration(options, async (updateProgress) => {
      updateProgress(20);
      
      // If lock retry is enabled, wrap the call
      if (options.enableLockRetry) {
        const result = await executeWithRetry<T>(
          () => supabase.functions.invoke(functionName, { body }),
          { 
            maxRetries: options.maxLockRetries ?? 3,
            onRetryScheduled: (secs, attempt) => {
              updateProgress(15); // Reset progress while waiting
            }
          }
        );
        updateProgress(90);
        
        if (result.error) throw result.error;
        if (!result.data) throw new Error('No data returned');
        return result.data;
      }
      
      // Standard path without lock retry
      const { data, error } = await supabase.functions.invoke(functionName, { body });
      updateProgress(90);
      
      if (error) throw error;
      return data as T;
    });
  }, [runGeneration, executeWithRetry]);

  return {
    runGeneration,
    runPollingGeneration,
    invokeWithTracking,
    // Lock retry state (for UI feedback)
    isWaitingForLockRetry: isWaitingForRetry,
    lockRetryInfo: retryInfo,
    cancelLockRetry: cancelRetry,
  };
}

// Export type helpers
export type { GenerationTaskOptions, GenerationResult };
