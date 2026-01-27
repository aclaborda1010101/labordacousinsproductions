/**
 * ScriptWorkspaceView - Adaptive Script Interface by Creative Mode & Format
 * 
 * FILM (any mode): FilmScriptGenerator - simplified 3-step flow
 * SERIES ASSISTED: Guided ScriptWorkspace with idea/analyze flow
 * SERIES PRO: Full ScriptImport with pipeline and advanced options
 * 
 * Now includes ScriptProgressTimeline for active generation visibility.
 */

import { useState, useEffect } from 'react';
import { useDeveloperMode } from '@/contexts/DeveloperModeContext';
import { useCreativeModeOptional } from '@/contexts/CreativeModeContext';
import { useActiveGeneration } from '@/hooks/useActiveGeneration';
import { supabase } from '@/integrations/supabase/client';
import ScriptWorkspace from './ScriptWorkspace';
import ScriptImport from './ScriptImport';
import ScriptProgressTimeline from './ScriptProgressTimeline';
import FilmScriptGenerator from './FilmScriptGenerator';

interface ScriptWorkspaceViewProps {
  projectId: string;
}

export default function ScriptWorkspaceView({ projectId }: ScriptWorkspaceViewProps) {
  const { isDeveloperMode } = useDeveloperMode();
  const creativeModeContext = useCreativeModeOptional();
  const effectiveMode = creativeModeContext?.effectiveMode ?? 'ASSISTED';
  
  // Project format state
  const [projectFormat, setProjectFormat] = useState<'film' | 'series' | 'short' | null>(null);
  const [projectName, setProjectName] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  
  // Load project format
  useEffect(() => {
    const loadProjectFormat = async () => {
      try {
        const { data: project } = await supabase
          .from('projects')
          .select('format, title')
          .eq('id', projectId)
          .single();
        
        if (project) {
          setProjectFormat(project.format || 'series');
          setProjectName(project.title || '');
        }
      } catch (err) {
        console.error('Error loading project format:', err);
        setProjectFormat('series'); // Default to series
      } finally {
        setIsLoading(false);
      }
    };
    
    loadProjectFormat();
  }, [projectId]);
  
  // V78: Disable external ScriptProgressTimeline - the PreScriptWizard 
  // now handles its own progress UI for step 5 (narrative generation).
  // Showing both causes confusion with mismatched progress indicators.
  const showTimeline = false;

  // Loading state
  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground">Cargando...</div>;
  }

  // FILM in ASSISTED mode: Use simplified FilmScriptGenerator
  if ((projectFormat === 'film' || projectFormat === 'short') && effectiveMode === 'ASSISTED') {
    return (
      <div className="p-4">
        <FilmScriptGenerator 
          projectId={projectId} 
          projectName={projectName}
        />
      </div>
    );
  }
  
  // FILM in PRO mode: Use ScriptWorkspace (has more options)
  if ((projectFormat === 'film' || projectFormat === 'short') && (isDeveloperMode || effectiveMode === 'PRO')) {
    return (
      <div className="space-y-4">
        {showTimeline && (
          <ScriptProgressTimeline projectId={projectId} className="mx-4" />
        )}
        <ScriptWorkspace projectId={projectId} />
      </div>
    );
  }

  // SERIES - Developer Mode or PRO: Show full ScriptImport with pipeline
  if (isDeveloperMode || effectiveMode === 'PRO') {
    return (
      <div className="space-y-4">
        {showTimeline && (
          <ScriptProgressTimeline projectId={projectId} className="mx-4" />
        )}
        <ScriptImport projectId={projectId} />
      </div>
    );
  }

  // SERIES - ASSISTED mode: Show guided ScriptWorkspace with timeline if active
  return (
    <div className="space-y-4">
      {showTimeline && (
        <ScriptProgressTimeline projectId={projectId} className="mx-4" />
      )}
      <ScriptWorkspace projectId={projectId} />
    </div>
  );
}
