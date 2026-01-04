import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { toast } from 'sonner';

const DEVELOPER_CODE = '230521';
const STORAGE_KEY = 'dev_mode_enabled';

interface DeveloperModeContextType {
  isDeveloperMode: boolean;
  enableDeveloperMode: (code: string) => boolean;
  disableDeveloperMode: () => void;
}

const DeveloperModeContext = createContext<DeveloperModeContextType | undefined>(undefined);

export function DeveloperModeProvider({ children }: { children: ReactNode }) {
  const [isDeveloperMode, setIsDeveloperMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, isDeveloperMode ? 'true' : 'false');
    } catch {
      // Silently fail if localStorage is unavailable
    }
  }, [isDeveloperMode]);

  const enableDeveloperMode = useCallback((code: string): boolean => {
    if (code === DEVELOPER_CODE) {
      setIsDeveloperMode(true);
      toast.success('Developer Mode activado');
      return true;
    } else {
      toast.error('Código incorrecto');
      return false;
    }
  }, []);

  const disableDeveloperMode = useCallback(() => {
    setIsDeveloperMode(false);
    toast.info('Developer Mode desactivado');
  }, []);

  return (
    <DeveloperModeContext.Provider value={{ isDeveloperMode, enableDeveloperMode, disableDeveloperMode }}>
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
