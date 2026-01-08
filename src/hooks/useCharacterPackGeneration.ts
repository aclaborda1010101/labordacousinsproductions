/**
 * useCharacterPackGeneration - Shared hook for PRO and ASSISTED modes
 * Handles generation with Background Tasks for persistent progress
 */

import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useBackgroundTasks } from '@/contexts/BackgroundTasksContext';
import { toast } from 'sonner';

export interface SlotDefinition {
  id: string;
  type: string;
  label: string;
  viewAngle?: string;
  expression?: string;
}

interface UseCharacterPackGenerationOptions {
  characterId: string;
  characterName: string;
  characterBio?: string | null;
  projectId?: string;
  onSlotComplete?: (slotType: string) => void;
  onAllComplete?: () => void;
}

export function useCharacterPackGeneration({
  characterId,
  characterName,
  characterBio,
  projectId,
  onSlotComplete,
  onAllComplete,
}: UseCharacterPackGenerationOptions) {
  const { addTask, updateTask, completeTask, failTask } = useBackgroundTasks();

  /**
   * Generate multiple slots with background task tracking
   */
  const generateSlots = useCallback(async (
    slots: SlotDefinition[],
    taskTitle: string,
    taskDescription?: string
  ): Promise<{ success: boolean; completedCount: number; errors: string[] }> => {
    if (slots.length === 0) {
      return { success: true, completedCount: 0, errors: [] };
    }

    // Create background task for tracking
    const taskId = addTask({
      title: taskTitle,
      description: taskDescription || `Generando ${slots.length} imágenes`,
      type: 'character_generation',
      projectId: projectId || undefined,
      entityId: characterId,
    });

    let completedCount = 0;
    const errors: string[] = [];

    try {
      for (let i = 0; i < slots.length; i++) {
        const slot = slots[i];
        const progress = Math.round(((i + 1) / slots.length) * 100);

        // Update task progress
        updateTask(taskId, {
          progress,
          description: `Generando ${slot.label} (${i + 1}/${slots.length})...`,
        });

        try {
          const response = await supabase.functions.invoke('generate-character', {
            body: {
              slotId: slot.id,
              characterId,
              characterName,
              characterBio: characterBio || '',
              slotType: slot.type,
              viewAngle: slot.viewAngle || 'front',
              expressionName: slot.expression || null,
              projectId,
            },
          });

          if (response.error) {
            console.error(`Error generating ${slot.type}:`, response.error);
            const errorDetail = response.error.message || 'Error de generación';
            const isContentBlocked = errorDetail.includes('CONTENT_BLOCKED') || errorDetail.includes('safety filter');
            
            if (isContentBlocked) {
              // Content blocked by AI safety - skip gracefully
              errors.push(`${slot.label}: Bloqueado por filtro de seguridad`);
              toast.warning(`${slot.label} omitido`, {
                description: 'El filtro de seguridad bloqueó esta expresión. Prueba con otra pose.',
                duration: 4000,
              });
            } else {
              errors.push(`${slot.label}: ${errorDetail}`);
              toast.error(`Error en ${slot.label}`, {
                description: errorDetail.length > 100 ? errorDetail.substring(0, 100) + '...' : errorDetail,
                duration: 5000,
              });
            }
          } else if (response.data?.error) {
            // Handle error returned in response body
            const errorDetail = response.data.error;
            console.error(`Error in response for ${slot.type}:`, errorDetail);
            const isContentBlocked = errorDetail.includes('CONTENT_BLOCKED') || errorDetail.includes('safety filter');
            
            if (isContentBlocked) {
              errors.push(`${slot.label}: Bloqueado por filtro de seguridad`);
              toast.warning(`${slot.label} omitido`, {
                description: 'El filtro de seguridad bloqueó esta expresión. Prueba con otra pose.',
                duration: 4000,
              });
            } else {
              errors.push(`${slot.label}: ${errorDetail}`);
              toast.error(`Error en ${slot.label}`, {
                description: errorDetail.length > 100 ? errorDetail.substring(0, 100) + '...' : errorDetail,
                duration: 5000,
              });
            }
          } else {
            completedCount++;
            onSlotComplete?.(slot.type);
          }
        } catch (err) {
          console.error(`Failed to generate ${slot.type}:`, err);
          const errorMsg = err instanceof Error ? err.message : 'Error desconocido';
          errors.push(`${slot.label}: ${errorMsg}`);
          toast.error(`Error en ${slot.label}`, {
            description: errorMsg.length > 100 ? errorMsg.substring(0, 100) + '...' : errorMsg,
            duration: 5000,
          });
        }
      }

      // Complete or fail based on results
      if (errors.length === 0) {
        completeTask(taskId, { completedCount });
        onAllComplete?.();
        return { success: true, completedCount, errors };
      } else if (completedCount > 0) {
        // Partial success
        completeTask(taskId, { completedCount, errors });
        return { success: true, completedCount, errors };
      } else {
        failTask(taskId, 'No se pudo generar ninguna imagen');
        return { success: false, completedCount: 0, errors };
      }
    } catch (err) {
      console.error('Generation batch error:', err);
      failTask(taskId, err instanceof Error ? err.message : 'Error desconocido');
      return { success: false, completedCount, errors: [err instanceof Error ? err.message : 'Error'] };
    }
  }, [characterId, characterName, characterBio, projectId, addTask, updateTask, completeTask, failTask, onSlotComplete, onAllComplete]);

  /**
   * Generate a single slot (without background task, for individual regeneration)
   */
  const generateSingleSlot = useCallback(async (
    slotId: string,
    slotType: string,
    options?: { viewAngle?: string; expression?: string }
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const response = await supabase.functions.invoke('generate-character', {
        body: {
          slotId,
          characterId,
          characterName,
          characterBio: characterBio || '',
          slotType,
          viewAngle: options?.viewAngle || 'front',
          expressionName: options?.expression || null,
          projectId,
        },
      });

      if (response.error) {
        return { success: false, error: response.error.message };
      }

      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Error desconocido' };
    }
  }, [characterId, characterName, characterBio, projectId]);

  return {
    generateSlots,
    generateSingleSlot,
  };
}
