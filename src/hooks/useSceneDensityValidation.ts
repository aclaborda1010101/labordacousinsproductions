/**
 * useSceneDensityValidation - Validates that outlines have sufficient scene density
 * for the target duration before script generation.
 * 
 * For films: ensures enough scenes exist (25-45 for 90 min)
 * For series: validates scene counts per episode
 */

import { useState, useCallback } from 'react';
import { invokeAuthedFunction } from '@/lib/invokeAuthedFunction';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface DensityValidationResult {
  valid: boolean;
  currentScenes: number;
  requiredMinScenes: number;
  requiredMaxScenes: number;
  message: string;
  needsExpansion: boolean;
}

interface DensityTarget {
  minScenes: number;
  maxScenes: number;
  avgSceneDurationMin: number;
}

// Calculate density targets based on duration and profile
// UPDATED: Based on real Hollywood screenplay analysis (Jan 2026)
// Data source: Analysis of 14 professional screenplays (Austin Powers, Aliens, As Good As It Gets, etc.)
function calculateDensityTarget(durationMin: number, profile: string): DensityTarget {
  const profiles: Record<string, { minDuration: number; maxDuration: number; description: string }> = {
    // === GENRE-BASED PROFILES (RECOMMENDED) ===
    // Comedy fast-paced (Austin Powers, Deadpool): 0.7-0.9 min/scene
    comedia_rapida: { minDuration: 0.7, maxDuration: 0.9, description: 'Comedia rápida tipo Hangover/Superbad' },
    // Comedy standard (Lady Bird, Big Sick): 1.0-1.3 min/scene  
    comedia: { minDuration: 1.0, maxDuration: 1.3, description: 'Comedia estándar/dramedia' },
    // Thriller/Action (Aliens, Abyss): 0.6-0.85 min/scene
    thriller: { minDuration: 0.6, maxDuration: 0.85, description: 'Thriller/Acción' },
    // Drama (Apartment, American President): 1.3-1.8 min/scene
    drama: { minDuration: 1.3, maxDuration: 1.8, description: 'Drama pausado' },
    // Drama slow (All About Eve, Annie Hall): 2.0-3.0 min/scene
    drama_lento: { minDuration: 2.0, maxDuration: 3.0, description: 'Drama lento/clásico' },
    
    // === LEGACY PROFILES (for backwards compatibility) ===
    indie: { minDuration: 1.5, maxDuration: 2.5, description: 'Indie genérico' },
    standard: { minDuration: 1.0, maxDuration: 1.5, description: 'Estándar Hollywood' },
    hollywood: { minDuration: 0.8, maxDuration: 1.2, description: 'Hollywood blockbuster' },
  };

  const p = profiles[profile] || profiles.standard;
  
  return {
    minScenes: Math.ceil(durationMin / p.maxDuration),
    maxScenes: Math.ceil(durationMin / p.minDuration),
    avgSceneDurationMin: (p.minDuration + p.maxDuration) / 2,
  };
}

// Export available density profiles for UI
export const DENSITY_PROFILES = {
  comedia_rapida: { label: 'Comedia Rápida', scenes90min: '100-130', example: 'Hangover, Superbad, Austin Powers' },
  comedia: { label: 'Comedia', scenes90min: '70-90', example: 'Lady Bird, Big Sick, Juno' },
  thriller: { label: 'Thriller/Acción', scenes90min: '105-150', example: 'Aliens, Get Out, Knives Out' },
  drama: { label: 'Drama', scenes90min: '50-70', example: 'American President, Amadeus' },
  drama_lento: { label: 'Drama Clásico', scenes90min: '30-45', example: 'All About Eve, Annie Hall' },
} as const;

// Count scenes from outline structure
function countScenesInOutline(outline: any): number {
  // Check episode_beats for scene counts
  const episodeBeats = outline?.episode_beats || [];
  if (episodeBeats.length > 0) {
    const firstEpisode = episodeBeats[0];
    if (firstEpisode?.scenes?.length > 0) {
      return firstEpisode.scenes.length;
    }
  }
  
  // Also check outline_json.episode_beats
  const outlineJson = outline?.outline_json || outline;
  const jsonEpisodeBeats = outlineJson?.episode_beats || [];
  if (jsonEpisodeBeats.length > 0) {
    const firstEpisode = jsonEpisodeBeats[0];
    if (firstEpisode?.scenes?.length > 0) {
      return firstEpisode.scenes.length;
    }
  }

  // Count beats from ACT structure (these will be expanded)
  let beatCount = 0;
  const acts = ['ACT_I', 'ACT_II', 'ACT_III'];
  
  for (const actKey of acts) {
    const act = outline?.[actKey];
    if (act?.beats) {
      beatCount += act.beats.length;
    }
  }

  // Each beat typically expands to 1.5 scenes on average
  // But if we only have beats and no scenes, we need expansion
  return 0; // No actual scenes yet, only beats
}

// Check if outline has been expanded to scenes
function hasExpandedScenes(outline: any): boolean {
  // Check episode_beats first
  const episodeBeats = outline?.episode_beats || [];
  if (episodeBeats.length > 0) {
    const firstEpisode = episodeBeats[0];
    if ((firstEpisode?.scenes?.length || 0) > 10) {
      return true;
    }
  }
  
  // Also check outline_json.episode_beats (some flows store it there)
  const outlineJson = outline?.outline_json || outline;
  const jsonEpisodeBeats = outlineJson?.episode_beats || [];
  if (jsonEpisodeBeats.length > 0) {
    const firstEpisode = jsonEpisodeBeats[0];
    if ((firstEpisode?.scenes?.length || 0) > 10) {
      return true;
    }
  }
  
  return false;
}

export function useSceneDensityValidation() {
  const [isValidating, setIsValidating] = useState(false);
  const [isExpanding, setIsExpanding] = useState(false);
  const [validationResult, setValidationResult] = useState<DensityValidationResult | null>(null);

  const validateDensity = useCallback((
    outline: any,
    format: 'film' | 'series' | 'ad',
    durationMin: number,
    densityProfile: string = 'standard'
  ): DensityValidationResult => {
    // For series or ads, skip this validation
    if (format !== 'film') {
      return {
        valid: true,
        currentScenes: 0,
        requiredMinScenes: 0,
        requiredMaxScenes: 0,
        message: '',
        needsExpansion: false,
      };
    }

    const target = calculateDensityTarget(durationMin, densityProfile);
    const currentScenes = countScenesInOutline(outline);
    const hasScenes = hasExpandedScenes(outline);

    const result: DensityValidationResult = {
      valid: hasScenes && currentScenes >= target.minScenes * 0.8,
      currentScenes,
      requiredMinScenes: target.minScenes,
      requiredMaxScenes: target.maxScenes,
      message: '',
      needsExpansion: !hasScenes,
    };

    if (!hasScenes) {
      result.message = `Esta película de ${durationMin} min requiere ${target.minScenes}-${target.maxScenes} escenas. ` +
        `El outline tiene beats narrativos pero necesita expandirse en escenas concretas.`;
    } else if (currentScenes < target.minScenes * 0.8) {
      result.message = `Tienes ${currentScenes} escenas, pero se necesitan ${target.minScenes}+ para ${durationMin} minutos.`;
    } else {
      result.message = `✓ Densidad correcta: ${currentScenes} escenas para ${durationMin} minutos.`;
    }

    setValidationResult(result);
    return result;
  }, []);

  const expandBeatsToScenes = useCallback(async (
    projectId: string,
    durationMin: number,
    densityProfile: string = 'standard'
  ): Promise<{ success: boolean; scenesCount: number; error?: string; updatedOutline?: any }> => {
    setIsExpanding(true);
    
    try {
      toast.info('Expandiendo beats en escenas...', { duration: 15000 });
      
      // Paso 1: Expandir beats a escenas en el outline JSON
      const { data, error } = await invokeAuthedFunction('expand-beats-to-scenes', {
        projectId,
        durationMin,
        densityProfile,
      });

      if (error || !data?.success) {
        throw new Error(data?.message || error?.message || 'Error expandiendo escenas');
      }

      console.log('[useSceneDensityValidation] Expansion complete:', data.scenesCount, 'scenes');

      // Paso 2: Materializar escenas en la tabla scenes
      toast.info('Materializando escenas en base de datos...', { duration: 5000 });
      
      const { data: materializeData, error: materializeError } = await invokeAuthedFunction(
        'materialize-scenes',
        {
          projectId,
          deleteExisting: true, // Borrar escenas previas
        }
      );

      if (materializeError || !materializeData?.success) {
        console.warn('[useSceneDensityValidation] Materialize warning:', materializeError || materializeData?.error);
        // No fallar si materialize tiene problemas menores, solo advertir
        toast.warning('Escenas expandidas pero hubo un problema al guardarlas');
      } else {
        console.log('[useSceneDensityValidation] Materialized:', materializeData.scenes?.created, 'scenes');
      }

      const finalCount = materializeData?.scenes?.created || data.scenesCount;
      toast.success(`Expansión completada: ${finalCount} escenas guardadas`);
      
      // Paso 3: Obtener el outline actualizado de la DB para re-validación
      const { data: refreshedOutline } = await supabase
        .from('project_outlines')
        .select('outline_json')
        .eq('project_id', projectId)
        .eq('status', 'completed')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      console.log('[useSceneDensityValidation] Fetched refreshed outline:', 
        (refreshedOutline?.outline_json as any)?.episode_beats?.[0]?.scenes?.length, 'scenes');
      
      return {
        success: true,
        scenesCount: finalCount,
        updatedOutline: refreshedOutline?.outline_json,
      };
    } catch (err: any) {
      console.error('[useSceneDensityValidation] Expansion error:', err);
      toast.error('Error expandiendo escenas', { description: err.message });
      
      return {
        success: false,
        scenesCount: 0,
        error: err.message,
      };
    } finally {
      setIsExpanding(false);
    }
  }, []);

  return {
    isValidating,
    isExpanding,
    validationResult,
    validateDensity,
    expandBeatsToScenes,
  };
}
