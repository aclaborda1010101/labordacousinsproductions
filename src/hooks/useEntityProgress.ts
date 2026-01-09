/**
 * Hook to get real-time generation progress for an entity
 * Connects EntityCard with BackgroundTasksContext
 */
import { useMemo } from 'react';
import { useBackgroundTasks } from '@/contexts/BackgroundTasksContext';

interface EntityProgressResult {
  isGenerating: boolean;
  progress: number;
  phase: string;
  taskId?: string;
}

/**
 * Maps progress percentage to human-readable phase descriptions
 */
function getPhaseFromProgress(progress: number, description?: string): string {
  if (description) return description;
  
  if (progress < 5) return 'En cola...';
  if (progress < 25) return 'Analizando referencias...';
  if (progress < 75) return 'Generando imagen...';
  if (progress < 95) return 'Guardando resultado...';
  return 'Finalizando...';
}

export function useEntityProgress(entityId: string | undefined): EntityProgressResult {
  const { activeTasks } = useBackgroundTasks();

  return useMemo(() => {
    if (!entityId) {
      return { isGenerating: false, progress: 0, phase: '' };
    }

    // Find active task for this entity
    const activeTask = activeTasks.find(
      t => t.entityId === entityId && (t.status === 'running' || t.status === 'pending')
    );

    if (!activeTask) {
      return { isGenerating: false, progress: 0, phase: '' };
    }

    return {
      isGenerating: true,
      progress: activeTask.progress,
      phase: getPhaseFromProgress(activeTask.progress, activeTask.description),
      taskId: activeTask.id,
    };
  }, [entityId, activeTasks]);
}
