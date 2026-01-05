import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { 
  CreativeMode, 
  ModeCapabilities, 
  modeCapabilities, 
  getCapabilities 
} from '@/lib/modeCapabilities';
import { useDeveloperMode } from './DeveloperModeContext';

// Re-export CreativeMode type
export type { CreativeMode } from '@/lib/modeCapabilities';

interface CreativeModeContextType {
  projectMode: CreativeMode;
  setProjectMode: (mode: CreativeMode) => Promise<void>;
  sceneOverride: CreativeMode | null;
  setSceneOverride: (sceneId: string, mode: CreativeMode | null) => Promise<void>;
  effectiveMode: CreativeMode;
  currentSceneId: string | null;
  setCurrentSceneId: (sceneId: string | null) => void;
  isLoading: boolean;
  
  // Field visibility helpers
  canEditField: (field: string, requiredMode: CreativeMode) => boolean;
  isFieldVisible: (field: string, requiredMode: CreativeMode) => boolean;
  
  // Mode descriptions
  getModeDescription: (mode: CreativeMode) => string;
  getModeTooltip: (mode: CreativeMode) => string;
  
  // Mode capabilities (new)
  capabilities: ModeCapabilities;
  isUIVisible: (key: keyof ModeCapabilities['ui']) => boolean;
  canEdit: (key: keyof ModeCapabilities['edit']) => boolean;
  getBehavior: (key: keyof ModeCapabilities['behavior']) => boolean;
  
  // Developer mode override
  isDeveloperModeActive: boolean;
}

const MODE_HIERARCHY: Record<CreativeMode, number> = {
  ASSISTED: 0,
  PRO: 1,
};

const MODE_DESCRIPTIONS: Record<CreativeMode, string> = {
  ASSISTED: 'Modo Asistido activo: técnica y continuidad protegidas.',
  PRO: 'Modo Pro activo: control total. Los warnings no bloquean. Tú mandas.',
};

const MODE_TOOLTIPS: Record<CreativeMode, string> = {
  ASSISTED: 'La IA decide técnica y cobertura para máxima coherencia. Tú decides intención y tono.',
  PRO: 'Control total tipo rodaje real. La IA no corrige tus decisiones: solo advierte.',
};

const CreativeModeContext = createContext<CreativeModeContextType | null>(null);

export function CreativeModeProvider({ 
  children, 
  projectId 
}: { 
  children: React.ReactNode;
  projectId: string;
}) {
  const { isDeveloperMode } = useDeveloperMode();
  const [projectMode, setProjectModeState] = useState<CreativeMode>('ASSISTED');
  const [sceneOverrides, setSceneOverrides] = useState<Record<string, CreativeMode | null>>({});
  const [currentSceneId, setCurrentSceneId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load project mode
  useEffect(() => {
    const loadProjectMode = async () => {
      if (!projectId) return;
      
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from('projects')
          .select('creative_mode')
          .eq('id', projectId)
          .single();
        
        if (error) throw error;
        if (data?.creative_mode) {
          setProjectModeState(data.creative_mode as CreativeMode);
        }
      } catch (err) {
        console.error('Error loading creative mode:', err);
      } finally {
        setIsLoading(false);
      }
    };
    
    loadProjectMode();
  }, [projectId]);

  // Load scene overrides when scene changes
  useEffect(() => {
    const loadSceneOverride = async () => {
      if (!currentSceneId) return;
      
      // Check if already loaded
      if (sceneOverrides[currentSceneId] !== undefined) return;
      
      try {
        const { data, error } = await supabase
          .from('scenes')
          .select('override_mode')
          .eq('id', currentSceneId)
          .single();
        
        if (error) throw error;
        
        setSceneOverrides(prev => ({
          ...prev,
          [currentSceneId]: data?.override_mode as CreativeMode | null
        }));
      } catch (err) {
        console.error('Error loading scene override:', err);
      }
    };
    
    loadSceneOverride();
  }, [currentSceneId]);

  const setProjectMode = useCallback(async (mode: CreativeMode) => {
    if (!projectId) return;
    
    try {
      const { error } = await supabase
        .from('projects')
        .update({ creative_mode: mode })
        .eq('id', projectId);
      
      if (error) throw error;
      setProjectModeState(mode);
    } catch (err) {
      console.error('Error updating creative mode:', err);
      throw err;
    }
  }, [projectId]);

  const setSceneOverride = useCallback(async (sceneId: string, mode: CreativeMode | null) => {
    try {
      const { error } = await supabase
        .from('scenes')
        .update({ override_mode: mode })
        .eq('id', sceneId);
      
      if (error) throw error;
      
      setSceneOverrides(prev => ({
        ...prev,
        [sceneId]: mode
      }));
    } catch (err) {
      console.error('Error updating scene override:', err);
      throw err;
    }
  }, []);

  // Calculate effective mode - Developer Mode overrides to PRO
  const sceneOverride = currentSceneId ? sceneOverrides[currentSceneId] : null;
  const baseEffectiveMode = sceneOverride ?? projectMode;
  const effectiveMode: CreativeMode = isDeveloperMode ? 'PRO' : baseEffectiveMode;
  
  // Get capabilities for current mode (always PRO if developer mode is active)
  const capabilities = getCapabilities(effectiveMode);

  // Helper to check if a field should be editable based on mode
  const canEditField = useCallback((field: string, requiredMode: CreativeMode): boolean => {
    return MODE_HIERARCHY[effectiveMode] >= MODE_HIERARCHY[requiredMode];
  }, [effectiveMode]);

  // Helper to check if a field should be visible based on mode
  const isFieldVisible = useCallback((field: string, requiredMode: CreativeMode): boolean => {
    // In ASSISTED mode, PRO-only fields are completely hidden
    if (requiredMode === 'PRO') {
      return effectiveMode === 'PRO';
    }
    return MODE_HIERARCHY[effectiveMode] >= MODE_HIERARCHY[requiredMode];
  }, [effectiveMode]);
  
  // New capability-based helpers
  const isUIVisible = useCallback((key: keyof ModeCapabilities['ui']): boolean => {
    return capabilities.ui[key];
  }, [capabilities]);
  
  const canEdit = useCallback((key: keyof ModeCapabilities['edit']): boolean => {
    return capabilities.edit[key];
  }, [capabilities]);
  
  const getBehavior = useCallback((key: keyof ModeCapabilities['behavior']): boolean => {
    return capabilities.behavior[key];
  }, [capabilities]);

  const getModeDescription = useCallback((mode: CreativeMode): string => {
    return MODE_DESCRIPTIONS[mode];
  }, []);

  const getModeTooltip = useCallback((mode: CreativeMode): string => {
    return MODE_TOOLTIPS[mode];
  }, []);

  return (
    <CreativeModeContext.Provider
      value={{
        projectMode,
        setProjectMode,
        sceneOverride,
        setSceneOverride,
        effectiveMode,
        currentSceneId,
        setCurrentSceneId,
        isLoading,
        canEditField,
        isFieldVisible,
        getModeDescription,
        getModeTooltip,
        capabilities,
        isUIVisible,
        canEdit,
        getBehavior,
        isDeveloperModeActive: isDeveloperMode,
      }}
    >
      {children}
    </CreativeModeContext.Provider>
  );
}

export function useCreativeMode() {
  const context = useContext(CreativeModeContext);
  if (!context) {
    throw new Error('useCreativeMode must be used within a CreativeModeProvider');
  }
  return context;
}

// Optional hook that returns null if not in provider (for components that may be outside)
export function useCreativeModeOptional() {
  return useContext(CreativeModeContext);
}
