import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface AuthUser {
  id: string;
  email: string;
  email_confirmed_at?: string;
}

export const useAuthBypass = () => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user as AuthUser || null);
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setUser(session?.user as AuthUser || null);
        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const signUpBypass = async (email: string, password: string) => {
    try {
      // Attempt normal signup
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) {
        // If signup fails, try signin (user might exist)
        const { data: signinData, error: signinError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (signinError) {
          // Create a temporary session for development
          const tempUser = {
            id: 'temp-' + Date.now(),
            email,
            email_confirmed_at: new Date().toISOString(),
          };
          setUser(tempUser);
          return { user: tempUser, error: null };
        }

        return { user: signinData.user, error: null };
      }

      // If signup succeeds but email not confirmed, bypass in dev mode
      if (data.user && !data.user.email_confirmed_at && import.meta.env.VITE_DEV_MODE === 'true') {
        const bypassed = {
          ...data.user,
          email_confirmed_at: new Date().toISOString(),
        };
        setUser(bypassed as AuthUser);
        return { user: bypassed, error: null };
      }

      return { user: data.user, error: null };
    } catch (err) {
      return { user: null, error: err };
    }
  };

  const signInBypass = async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        // Bypass for development - create temp session
        if (import.meta.env.VITE_DEV_MODE === 'true') {
          const tempUser = {
            id: 'temp-' + Date.now(),
            email,
            email_confirmed_at: new Date().toISOString(),
          };
          setUser(tempUser);
          return { user: tempUser, error: null };
        }
        return { user: null, error };
      }

      return { user: data.user, error: null };
    } catch (err) {
      return { user: null, error: err };
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  return {
    user,
    loading,
    signUpBypass,
    signInBypass,
    signOut,
    isAuthenticated: !!user,
  };
};
