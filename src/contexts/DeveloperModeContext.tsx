import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface DeveloperModeContextType {
  isDeveloperMode: boolean;
  isLoading: boolean;
  enableDeveloperMode: (code: string) => Promise<boolean>;
  disableDeveloperMode: () => Promise<void>;
}

const DeveloperModeContext = createContext<DeveloperModeContextType | undefined>(undefined);

export function DeveloperModeProvider({ children }: { children: ReactNode }) {
  const { user, session } = useAuth();
  const [isDeveloperMode, setIsDeveloperMode] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Fetch developer mode status from profile
  const fetchDeveloperModeStatus = useCallback(async () => {
    if (!user) {
      setIsDeveloperMode(false);
      setIsLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('developer_mode_enabled')
        .eq('user_id', user.id)
        .single();

      if (error) {
        console.error('Error fetching developer mode status:', error);
        setIsDeveloperMode(false);
      } else {
        setIsDeveloperMode(data?.developer_mode_enabled ?? false);
      }
    } catch (err) {
      console.error('Unexpected error fetching developer mode:', err);
      setIsDeveloperMode(false);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  // Fetch status when user changes
  useEffect(() => {
    fetchDeveloperModeStatus();
  }, [fetchDeveloperModeStatus]);

  // Enable developer mode via edge function
  const enableDeveloperMode = useCallback(async (code: string): Promise<boolean> => {
    if (!session) {
      toast.error('Debes iniciar sesión para activar Developer Mode');
      return false;
    }

    try {
      const { data, error } = await supabase.functions.invoke('unlock-developer-mode', {
        body: { code }
      });

      if (error) {
        console.error('Edge function error:', error);
        toast.error('Error al activar Developer Mode');
        return false;
      }

      if (data?.ok) {
        setIsDeveloperMode(true);
        toast.success('Developer Mode activado');
        return true;
      } else if (data?.error === 'invalid_code') {
        toast.error('Código incorrecto');
        return false;
      } else {
        toast.error('Error al activar Developer Mode');
        return false;
      }
    } catch (err) {
      console.error('Unexpected error enabling developer mode:', err);
      toast.error('Error al activar Developer Mode');
      return false;
    }
  }, [session]);

  // Disable developer mode via edge function
  const disableDeveloperMode = useCallback(async (): Promise<void> => {
    if (!session) {
      toast.error('Debes iniciar sesión');
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke('disable-developer-mode', {});

      if (error) {
        console.error('Edge function error:', error);
        toast.error('Error al desactivar Developer Mode');
        return;
      }

      if (data?.ok) {
        setIsDeveloperMode(false);
        toast.info('Developer Mode desactivado');
      } else {
        toast.error('Error al desactivar Developer Mode');
      }
    } catch (err) {
      console.error('Unexpected error disabling developer mode:', err);
      toast.error('Error al desactivar Developer Mode');
    }
  }, [session]);

  return (
    <DeveloperModeContext.Provider value={{ isDeveloperMode, isLoading, enableDeveloperMode, disableDeveloperMode }}>
      {children}
    </DeveloperModeContext.Provider>
  );
}

export function useDeveloperMode() {
  const context = useContext(DeveloperModeContext);
  if (context === undefined) {
    throw new Error('useDeveloperMode must be used within a DeveloperModeProvider');
  }
  return context;
}
