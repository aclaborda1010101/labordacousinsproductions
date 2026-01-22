/**
 * Hook for managing shot continuity validation
 * SIMPLIFIED: shot_transitions table removed.
 * Validates continuity using keyframe data only.
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

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

    if (expected.position?.screen_pos !== actual.position?.screen_pos) {
      issues.push(`${charId}: position changed`);
      totalScore += 0.3;
    } else {
      totalScore += 1;
    }
    totalChecks++;

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
  }

  return {
    score: totalChecks > 0 ? totalScore / totalChecks : 1,
    issues,
  };
}

export function validateContinuity(
  previousFinalPose: Record<string, PoseData> | null,
  currentInitialPose: Record<string, PoseData> | null,
  previousScreenDirection?: string
): ContinuityValidation {
  if (!previousFinalPose) {
    return {
      isValid: true,
      poseMatchScore: 1,
      warnings: [],
      expectedEntryPose: null,
      actualEntryPose: currentInitialPose,
      screenDirectionLock: 'preserve',
      relativeScaleLock: 1,
    };
  }

  if (!currentInitialPose || Object.keys(currentInitialPose).length === 0) {
    return {
      isValid: false,
      poseMatchScore: 0,
      warnings: ['Current shot missing initial pose data'],
      expectedEntryPose: previousFinalPose,
      actualEntryPose: null,
      screenDirectionLock: previousScreenDirection || 'preserve',
      relativeScaleLock: 1,
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
    relativeScaleLock: 1,
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
  enabled = true,
}: UseShotContinuityOptions) {
  const [loading, setLoading] = useState(true);
  const [transition, setTransition] = useState<ShotTransition | null>(null);
  const [validation, setValidation] = useState<ContinuityValidation | null>(null);
  const [previousShot, setPreviousShot] = useState<{ id: string; shot_no: number } | null>(null);

  const fetchContinuityData = useCallback(async () => {
    if (!enabled || !shotId || !sceneId) return;

    setLoading(true);
    try {
      const { data: shots, error: shotsError } = await supabase
        .from('shots')
        .select('id, shot_no')
        .eq('scene_id', sceneId)
        .order('shot_no', { ascending: true });

      if (shotsError) throw shotsError;

      const currentIndex = shots?.findIndex((s) => s.id === shotId) ?? -1;
      const prevShot = currentIndex > 0 ? shots?.[currentIndex - 1] : null;
      setPreviousShot(prevShot);

      if (!prevShot) {
        setValidation({
          isValid: true,
          poseMatchScore: 1,
          warnings: [],
          expectedEntryPose: null,
          actualEntryPose: null,
          screenDirectionLock: 'preserve',
          relativeScaleLock: 1,
        });
        setLoading(false);
        return;
      }

      // Fetch keyframes for validation (shot_transitions table removed)
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
          .maybeSingle(),
      ]);

      const prevPose = prevKeyframes.data?.pose_data as unknown as Record<string, PoseData> | null;
      const currPose = currKeyframes.data?.pose_data as unknown as Record<string, PoseData> | null;

      const val = validateContinuity(prevPose, currPose);
      setValidation(val);
    } catch (error) {
      console.error('Error fetching continuity data:', error);
    } finally {
      setLoading(false);
    }
  }, [enabled, shotId, sceneId]);

  useEffect(() => {
    fetchContinuityData();
  }, [fetchContinuityData]);

  // No-op save - table removed
  const saveTransition = useCallback(
    async (
      _exitPose: Record<string, PoseData>,
      _entryPose: Record<string, PoseData>,
      _overrideReason?: string
    ) => {
      console.log('[useShotContinuity] shot_transitions table removed');
      return null;
    },
    []
  );

  const overrideContinuity = useCallback(async (_reason: string) => {
    console.log('[useShotContinuity] shot_transitions table removed');
    return null;
  }, []);

  return {
    loading,
    validation,
    transition,
    previousShot,
    hasContinuityIssue: validation ? !validation.isValid : false,
    poseMatchScore: validation?.poseMatchScore ?? 1,
    saveTransition,
    overrideContinuity,
    refresh: fetchContinuityData,
  };
}
