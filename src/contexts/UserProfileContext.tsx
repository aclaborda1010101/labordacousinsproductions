import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import {
  UserProfile,
  ProfileUXBehavior,
  PROFILE_UX_BEHAVIOR,
  USER_PROFILE_CONFIG,
  TelemetrySignal,
  TelemetrySignalType,
  getMicrocopy,
  MicrocopyContext,
} from '@/lib/userProfileTypes';

// Re-export types
export type { UserProfile } from '@/lib/userProfileTypes';

interface UserProfileContextType {
  // Current profile state
  declaredProfile: UserProfile;
  inferredProfile: UserProfile;
  effectiveProfile: UserProfile; // Uses inferred if confidence is high enough
  confidence: number;
  isLoading: boolean;
  needsOnboarding: boolean;

  // Profile management
  setDeclaredProfile: (profile: UserProfile) => Promise<void>;
  completeOnboarding: (answers: Record<string, string>) => Promise<void>;

  // UX behavior helpers
  behavior: ProfileUXBehavior;
  getMicrocopy: (type: 'progress' | 'warning' | 'success' | 'guidance' | 'transition', context?: MicrocopyContext) => string;
  getProfileConfig: (profile?: UserProfile) => typeof USER_PROFILE_CONFIG[UserProfile];

  // Telemetry (invisible tracking)
  trackSignal: (signal: TelemetrySignal, projectId?: string) => Promise<void>;
}

const UserProfileContext = createContext<UserProfileContextType | null>(null);

// Confidence threshold above which we trust the inferred profile
const INFERENCE_CONFIDENCE_THRESHOLD = 0.6;

export function UserProfileProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [declaredProfile, setDeclaredProfileState] = useState<UserProfile>('EXPLORER');
  const [inferredProfile, setInferredProfileState] = useState<UserProfile>('EXPLORER');
  const [confidence, setConfidence] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [profileId, setProfileId] = useState<string | null>(null);

  // Calculate effective profile
  const effectiveProfile = confidence >= INFERENCE_CONFIDENCE_THRESHOLD 
    ? inferredProfile 
    : declaredProfile;

  // Get behavior for current profile
  const behavior = PROFILE_UX_BEHAVIOR[effectiveProfile];

  // Load user profile on auth change
  useEffect(() => {
    const loadProfile = async () => {
      if (!user?.id) {
        setIsLoading(false);
        setNeedsOnboarding(true);
        return;
      }

      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from('user_experience_profiles')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle();

        if (error && error.code !== 'PGRST116') {
          throw error;
        }

        if (data) {
          setProfileId(data.id);
          setDeclaredProfileState(data.declared_profile as UserProfile);
          setInferredProfileState(data.inferred_profile as UserProfile);
          setConfidence(Number(data.inference_confidence) || 0);
          
          // Check if onboarding was completed (has answers)
          const answers = data.onboarding_answers as Record<string, string> | null;
          setNeedsOnboarding(!answers || Object.keys(answers).length === 0);
        } else {
          // No profile exists, needs onboarding
          setNeedsOnboarding(true);
        }
      } catch (err) {
        console.error('Error loading user profile:', err);
        setNeedsOnboarding(true);
      } finally {
        setIsLoading(false);
      }
    };

    loadProfile();
  }, [user?.id]);

  // Set declared profile
  const setDeclaredProfile = useCallback(async (profile: UserProfile) => {
    if (!user?.id) return;

    try {
      if (profileId) {
        // Update existing
        await supabase
          .from('user_experience_profiles')
          .update({ 
            declared_profile: profile,
            updated_at: new Date().toISOString()
          })
          .eq('id', profileId);
      } else {
        // Insert new
        const { data } = await supabase
          .from('user_experience_profiles')
          .insert({ 
            user_id: user.id,
            declared_profile: profile,
            inferred_profile: profile,
          })
          .select('id')
          .single();
        
        if (data) setProfileId(data.id);
      }

      setDeclaredProfileState(profile);
    } catch (err) {
      console.error('Error updating declared profile:', err);
      throw err;
    }
  }, [user?.id, profileId]);

  // Complete onboarding with questionnaire answers
  const completeOnboarding = useCallback(async (answers: Record<string, string>) => {
    if (!user?.id) return;

    // Calculate profile from answers
    const { calculateProfileFromAnswers } = await import('@/lib/userProfileTypes');
    const { profile: detectedProfile, confidence: detectedConfidence } = calculateProfileFromAnswers(answers);

    try {
      if (profileId) {
        await supabase
          .from('user_experience_profiles')
          .update({
            declared_profile: detectedProfile,
            inferred_profile: detectedProfile,
            inference_confidence: detectedConfidence,
            onboarding_answers: answers,
            updated_at: new Date().toISOString(),
          })
          .eq('id', profileId);
      } else {
        const { data } = await supabase
          .from('user_experience_profiles')
          .insert({
            user_id: user.id,
            declared_profile: detectedProfile,
            inferred_profile: detectedProfile,
            inference_confidence: detectedConfidence,
            onboarding_answers: answers,
          })
          .select('id')
          .single();
        
        if (data) setProfileId(data.id);
      }

      setDeclaredProfileState(detectedProfile);
      setInferredProfileState(detectedProfile);
      setConfidence(detectedConfidence);
      setNeedsOnboarding(false);
    } catch (err) {
      console.error('Error completing onboarding:', err);
      throw err;
    }
  }, [user?.id, profileId]);

  // Track telemetry signal (invisible)
  const trackSignal = useCallback(async (signal: TelemetrySignal, projectId?: string) => {
    if (!user?.id) return;

    try {
      await supabase
        .from('user_telemetry_signals')
        .insert([{
          user_id: user.id,
          project_id: projectId || null,
          signal_type: signal.type,
          context: (signal.context || {}) as unknown as Record<string, never>,
          weight: signal.weight || 5,
        }]);

      // Update last activity
      if (profileId) {
        await supabase
          .from('user_experience_profiles')
          .update({ last_activity_at: new Date().toISOString() })
          .eq('id', profileId);
      }
    } catch (err) {
      // Silently fail - telemetry should not block user actions
      console.debug('Telemetry signal not recorded:', err);
    }
  }, [user?.id, profileId]);

  // Get microcopy for current profile
  const getMicrocopyForProfile = useCallback((
    type: 'progress' | 'warning' | 'success' | 'guidance' | 'transition',
    context?: MicrocopyContext
  ) => {
    return getMicrocopy(effectiveProfile, type, context);
  }, [effectiveProfile]);

  // Get profile config
  const getProfileConfig = useCallback((profile?: UserProfile) => {
    return USER_PROFILE_CONFIG[profile || effectiveProfile];
  }, [effectiveProfile]);

  return (
    <UserProfileContext.Provider
      value={{
        declaredProfile,
        inferredProfile,
        effectiveProfile,
        confidence,
        isLoading,
        needsOnboarding,
        setDeclaredProfile,
        completeOnboarding,
        behavior,
        getMicrocopy: getMicrocopyForProfile,
        getProfileConfig,
        trackSignal,
      }}
    >
      {children}
    </UserProfileContext.Provider>
  );
}

export function useUserProfile() {
  const context = useContext(UserProfileContext);
  if (!context) {
    throw new Error('useUserProfile must be used within a UserProfileProvider');
  }
  return context;
}

// Optional hook for components that may be outside provider
export function useUserProfileOptional() {
  return useContext(UserProfileContext);
}
