/**
 * Hook for managing shot continuity validation
 * 
 * Validates that entry_pose of a shot matches exit_pose of the previous shot,
 * eliminating the "AI jank" of characters teleporting between shots.
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface PoseData {
  position: {
    x_m: number;
    y_m: number;
    screen_pos: 'left' | 'center' | 'right' | 'off_left' | 'off_right';
  };
  orientation: {
    facing_deg: number;
    gaze_target: string;
  };
  scale: {
    relative: number;
    in_frame_pct: number;
  };
  body_state: {
    posture: 'standing' | 'sitting' | 'crouching' | 'lying' | 'moving';
    gesture: string;
  };
}

export interface ContinuityValidation {
  isValid: boolean;
  poseMatchScore: number;
  warnings: string[];
  expectedEntryPose: Record<string, PoseData> | null;
  actualEntryPose: Record<string, PoseData> | null;
  screenDirectionLock: string;
  relativeScaleLock: number;
}

export interface ShotTransition {
  id: string;
  from_shot_id: string | null;
  to_shot_id: string;
  exit_pose: Record<string, PoseData>;
  entry_pose: Record<string, PoseData>;
  pose_match_score: number;
  screen_direction_lock: string;
  relative_scale_lock: number;
  validation_status: 'pending' | 'valid' | 'warning' | 'error' | 'override';
  override_reason?: string;
}

/**
 * Calculate pose match score between two poses
 * Returns 0-1 where 1 is perfect match
 */
export function calculatePoseMatchScore(
  expectedPose: Record<string, PoseData>,
  actualPose: Record<string, PoseData>
): { score: number; issues: string[] } {
  const issues: string[] = [];
  let totalScore = 0;
  let totalChecks = 0;

  for (const charId of Object.keys(expectedPose)) {
    const expected = expectedPose[charId];
    const actual = actualPose[charId];

    if (!actual) {
      issues.push(`Character ${charId} missing from new pose`);
      continue;
    }

    // Position check (screen_pos must match)
    if (expected.position?.screen_pos !== actual.position?.screen_pos) {
      issues.push(`${charId}: position ${expected.position?.screen_pos} → ${actual.position?.screen_pos}`);
      totalScore += 0.3;
    } else {
      totalScore += 1;
    }
    totalChecks++;

    // Orientation check (facing within 45°)
    const facingDiff = Math.abs(
      (expected.orientation?.facing_deg || 0) - (actual.orientation?.facing_deg || 0)
    );
    if (facingDiff > 45) {
      issues.push(`${charId}: facing changed ${facingDiff}°`);
      totalScore += 0.2;
    } else {
      totalScore += 1;
    }
    totalChecks++;

    // Scale check (within 20%)
    const scaleDiff = Math.abs(
      (expected.scale?.in_frame_pct || 0) - (actual.scale?.in_frame_pct || 0)
    );
    if (scaleDiff > 20) {
      issues.push(`${charId}: scale changed ${scaleDiff}%`);
      totalScore += 0.5;
    } else {
      totalScore += 1;
    }
    totalChecks++;

    // Posture check (must match exactly)
    if (expected.body_state?.posture !== actual.body_state?.posture) {
      issues.push(`${charId}: posture ${expected.body_state?.posture} → ${actual.body_state?.posture}`);
      totalScore += 0.1;
    } else {
      totalScore += 1;
    }
    totalChecks++;
  }

  return {
    score: totalChecks > 0 ? totalScore / totalChecks : 1,
    issues
  };
}

/**
 * Validate continuity between two shots
 */
export function validateContinuity(
  previousFinalPose: Record<string, PoseData> | null,
  currentInitialPose: Record<string, PoseData> | null,
  previousScreenDirection?: string
): ContinuityValidation {
  // No previous shot = always valid
  if (!previousFinalPose) {
    return {
      isValid: true,
      poseMatchScore: 1,
      warnings: [],
      expectedEntryPose: null,
      actualEntryPose: currentInitialPose,
      screenDirectionLock: 'preserve',
      relativeScaleLock: 1
    };
  }

  // No current pose = needs generation
  if (!currentInitialPose || Object.keys(currentInitialPose).length === 0) {
    return {
      isValid: false,
      poseMatchScore: 0,
      warnings: ['Current shot missing initial pose data'],
      expectedEntryPose: previousFinalPose,
      actualEntryPose: null,
      screenDirectionLock: previousScreenDirection || 'preserve',
      relativeScaleLock: 1
    };
  }

  const { score, issues } = calculatePoseMatchScore(previousFinalPose, currentInitialPose);

  return {
    isValid: score >= 0.7,
    poseMatchScore: score,
    warnings: issues,
    expectedEntryPose: previousFinalPose,
    actualEntryPose: currentInitialPose,
    screenDirectionLock: previousScreenDirection || 'preserve',
    relativeScaleLock: 1
  };
}

interface UseShotContinuityOptions {
  shotId: string;
  sceneId: string;
  projectId: string;
  enabled?: boolean;
}

export function useShotContinuity({
  shotId,
  sceneId,
  projectId,
  enabled = true
}: UseShotContinuityOptions) {
  const [loading, setLoading] = useState(true);
  const [transition, setTransition] = useState<ShotTransition | null>(null);
  const [validation, setValidation] = useState<ContinuityValidation | null>(null);
  const [previousShot, setPreviousShot] = useState<{ id: string; shot_no: number } | null>(null);

  // Fetch transition data and previous shot
  const fetchContinuityData = useCallback(async () => {
    if (!enabled || !shotId || !sceneId) return;

    setLoading(true);
    try {
      // Get current shot and previous shot in the scene
      const { data: shots, error: shotsError } = await supabase
        .from('shots')
        .select('id, shot_no')
        .eq('scene_id', sceneId)
        .order('shot_no', { ascending: true });

      if (shotsError) throw shotsError;

      const currentIndex = shots?.findIndex(s => s.id === shotId) ?? -1;
      const prevShot = currentIndex > 0 ? shots?.[currentIndex - 1] : null;
      setPreviousShot(prevShot);

      // If there's no previous shot, no continuity needed
      if (!prevShot) {
        setValidation({
          isValid: true,
          poseMatchScore: 1,
          warnings: [],
          expectedEntryPose: null,
          actualEntryPose: null,
          screenDirectionLock: 'preserve',
          relativeScaleLock: 1
        });
        setLoading(false);
        return;
      }

      // Check if transition exists
      const { data: transitionData } = await supabase
        .from('shot_transitions')
        .select('*')
        .eq('from_shot_id', prevShot.id)
        .eq('to_shot_id', shotId)
        .maybeSingle();

      if (transitionData) {
        setTransition(transitionData as unknown as ShotTransition);
        
        // Validate based on stored data
        const val = validateContinuity(
          transitionData.exit_pose as unknown as Record<string, PoseData>,
          transitionData.entry_pose as unknown as Record<string, PoseData>,
          transitionData.screen_direction_lock || undefined
        );
        setValidation(val);
      } else {
        // Need to fetch keyframes and calculate
        const [prevKeyframes, currKeyframes] = await Promise.all([
          supabase
            .from('keyframes')
            .select('pose_data, frame_type')
            .eq('shot_id', prevShot.id)
            .eq('frame_type', 'final')
            .maybeSingle(),
          supabase
            .from('keyframes')
            .select('pose_data, frame_type')
            .eq('shot_id', shotId)
            .eq('frame_type', 'initial')
            .maybeSingle()
        ]);

        const prevPose = prevKeyframes.data?.pose_data as unknown as Record<string, PoseData> | null;
        const currPose = currKeyframes.data?.pose_data as unknown as Record<string, PoseData> | null;

        const val = validateContinuity(prevPose, currPose);
        setValidation(val);
      }
    } catch (error) {
      console.error('Error fetching continuity data:', error);
    } finally {
      setLoading(false);
    }
  }, [enabled, shotId, sceneId]);

  useEffect(() => {
    fetchContinuityData();
  }, [fetchContinuityData]);

  // Save transition to database
  const saveTransition = useCallback(async (
    exitPose: Record<string, PoseData>,
    entryPose: Record<string, PoseData>,
    overrideReason?: string
  ) => {
    if (!previousShot) return;

    try {
      const { score, issues } = calculatePoseMatchScore(exitPose, entryPose);
      const status = overrideReason ? 'override' : 
                     score >= 0.9 ? 'valid' :
                     score >= 0.7 ? 'warning' : 'error';

      const transitionRecord = {
        project_id: projectId,
        from_shot_id: previousShot.id,
        to_shot_id: shotId,
        exit_pose: exitPose as unknown as Record<string, unknown>,
        entry_pose: entryPose as unknown as Record<string, unknown>,
        pose_match_score: score,
        screen_direction_lock: 'preserve',
        relative_scale_lock: 1,
        validation_status: status,
        override_reason: overrideReason || null,
        validated_at: new Date().toISOString()
      };

      // First try to find existing
      const { data: existing } = await supabase
        .from('shot_transitions')
        .select('id')
        .eq('from_shot_id', previousShot.id)
        .eq('to_shot_id', shotId)
        .maybeSingle();

      let data;
      let error;

      if (existing) {
        // Update existing
        const result = await supabase
          .from('shot_transitions')
          .update({
            exit_pose: JSON.parse(JSON.stringify(exitPose)),
            entry_pose: JSON.parse(JSON.stringify(entryPose)),
            pose_match_score: score,
            screen_direction_lock: 'preserve',
            relative_scale_lock: 1,
            validation_status: status,
            override_reason: overrideReason || null,
            validated_at: new Date().toISOString()
          })
          .eq('id', existing.id)
          .select()
          .single();
        data = result.data;
        error = result.error;
      } else {
        // Insert new
        const result = await supabase
          .from('shot_transitions')
          .insert([{
            project_id: projectId,
            from_shot_id: previousShot.id,
            to_shot_id: shotId,
            exit_pose: JSON.parse(JSON.stringify(exitPose)),
            entry_pose: JSON.parse(JSON.stringify(entryPose)),
            pose_match_score: score,
            screen_direction_lock: 'preserve',
            relative_scale_lock: 1,
            validation_status: status,
            override_reason: overrideReason || null,
            validated_at: new Date().toISOString()
          }])
          .select()
          .single();
        data = result.data;
        error = result.error;
      }

      if (error) throw error;

      setTransition(data as unknown as ShotTransition);
      await fetchContinuityData();
      
      if (status === 'valid') {
        toast.success('Continuidad validada ✓');
      } else if (status === 'warning') {
        toast.warning(`Continuidad con advertencias: ${issues.join(', ')}`);
      } else if (status === 'override') {
        toast.info('Discontinuidad intencionada registrada');
      }

      return data;
    } catch (error) {
      console.error('Error saving transition:', error);
      toast.error('Error al guardar transición');
      throw error;
    }
  }, [previousShot, shotId, projectId, fetchContinuityData]);

  // Override continuity (director intentional break)
  const overrideContinuity = useCallback(async (reason: string) => {
    if (!validation?.expectedEntryPose) {
      toast.error('No hay pose anterior para sobreescribir');
      return;
    }

    return saveTransition(
      validation.expectedEntryPose,
      validation.actualEntryPose || {},
      reason
    );
  }, [validation, saveTransition]);

  return {
    loading,
    validation,
    transition,
    previousShot,
    hasContinuityIssue: validation ? !validation.isValid : false,
    poseMatchScore: validation?.poseMatchScore ?? 1,
    saveTransition,
    overrideContinuity,
    refresh: fetchContinuityData
  };
}
