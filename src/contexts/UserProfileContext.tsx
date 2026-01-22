/**
 * UserProfileContext - Simplified version
 * Previously used user_experience_profiles and user_telemetry_signals tables which have been removed.
 * User profiles are now stored in the profiles table.
 */

import React, { createContext, useContext, useState, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import {
  UserProfile,
  ProfileUXBehavior,
  PROFILE_UX_BEHAVIOR,
  USER_PROFILE_CONFIG,
  TelemetrySignal,
  getMicrocopy,
  MicrocopyContext,
} from '@/lib/userProfileTypes';

// Re-export types
export type { UserProfile } from '@/lib/userProfileTypes';

interface UserProfileContextType {
  // Current profile state
  declaredProfile: UserProfile;
  inferredProfile: UserProfile;
  effectiveProfile: UserProfile;
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

  // Telemetry (no-op now)
  trackSignal: (signal: TelemetrySignal, projectId?: string) => Promise<void>;
}

const UserProfileContext = createContext<UserProfileContextType | null>(null);

export function UserProfileProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  
  // Default to ASSISTED profile (simplified - no DB dependency)
  const [declaredProfile] = useState<UserProfile>('ASSISTED');
  const [inferredProfile] = useState<UserProfile>('ASSISTED');
  const [confidence] = useState(1);
  const [isLoading] = useState(false);
  const [needsOnboarding] = useState(false);

  const effectiveProfile = declaredProfile;
  const behavior = PROFILE_UX_BEHAVIOR[effectiveProfile];

  // Simplified no-op implementations
  const setDeclaredProfile = useCallback(async (profile: UserProfile) => {
    console.log('[UserProfileContext] Profile update disabled - tables removed');
  }, []);

  const completeOnboarding = useCallback(async (answers: Record<string, string>) => {
    console.log('[UserProfileContext] Onboarding disabled - tables removed');
  }, []);

  const trackSignal = useCallback(async (signal: TelemetrySignal, projectId?: string) => {
    // No-op - telemetry tables removed
  }, []);

  const getMicrocopyForProfile = useCallback((
    type: 'progress' | 'warning' | 'success' | 'guidance' | 'transition',
    context?: MicrocopyContext
  ) => {
    return getMicrocopy(effectiveProfile, type, context);
  }, [effectiveProfile]);

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

export function useUserProfileOptional() {
  return useContext(UserProfileContext);
}
