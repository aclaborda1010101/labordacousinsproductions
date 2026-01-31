/**
 * ScriptWorkspaceView V2 - Enhanced with Workflow Guide
 * ASSISTED: Guided workflow with step-by-step progression
 * PRO: Full control with all advanced options visible
 * 
 * NEW: Integrates WorkflowGuide for better UX in ASSISTED mode
 */

import { useDeveloperMode } from '@/contexts/DeveloperModeContext';
import { useCreativeModeOptional } from '@/contexts/CreativeModeContext';
import { useActiveGeneration } from '@/hooks/useActiveGeneration';
import { useLocation, useNavigate } from 'react-router-dom';
import ScriptWorkspace from './ScriptWorkspace';
import ScriptImport from './ScriptImport';
import ScriptProgressTimeline from './ScriptProgressTimeline';
import { WorkflowGuide } from './WorkflowGuide';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Lightbulb, Settings, Zap, BookOpen } from 'lucide-react';

interface ScriptWorkspaceViewProps {
  projectId: string;
}

export default function ScriptWorkspaceView({ projectId }: ScriptWorkspaceViewProps) {
  const { isDeveloperMode } = useDeveloperMode();
  const creativeModeContext = useCreativeModeOptional();
  const effectiveMode = creativeModeContext?.effectiveMode ?? 'ASSISTED';
  const location = useLocation();
  const navigate = useNavigate();
  
  const currentPath = location.pathname;
  const activeGeneration = useActiveGeneration(projectId);

  const handleNavigate = (route: string) => {
    const projectPath = `/projects/${projectId}`;
    navigate(`${projectPath}${route}`);
  };

  // V78: Disable external ScriptProgressTimeline in favor of integrated progress
  const showTimeline = false;

  // Developer Mode or PRO: Show full ScriptImport with pipeline
  if (isDeveloperMode || effectiveMode === 'PRO') {
    return (
      <div className="space-y-4">
        {/* PRO mode header */}
        <div className="flex items-center justify-between p-4 bg-gradient-to-r from-purple-50 to-blue-50 border rounded-lg">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center">
              <Zap className="w-4 h-4 text-purple-600" />
            </div>
            <div>
              <h3 className="font-semibold text-purple-900">Modo Profesional Activo</h3>
              <p className="text-sm text-purple-700">
                Control completo sobre todos los parámetros técnicos y de generación
              </p>
            </div>
          </div>
          <Badge variant="outline" className="border-purple-200 text-purple-700">
            PRO
          </Badge>
        </div>

        {showTimeline && (
          <ScriptProgressTimeline projectId={projectId} className="mx-4" />
        )}
        
        <ScriptImport projectId={projectId} />
      </div>
    );
  }

  // ASSISTED mode: Show guided workflow with WorkflowGuide
  return (
    <div className="space-y-4">
      {/* ASSISTED mode header */}
      <div className="flex items-center justify-between p-4 bg-gradient-to-r from-green-50 to-emerald-50 border rounded-lg">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
            <Lightbulb className="w-4 h-4 text-green-600" />
          </div>
          <div>
            <h3 className="font-semibold text-green-900">Modo Asistido Activo</h3>
            <p className="text-sm text-green-700">
              La IA te guía paso a paso para mejores resultados
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-green-200 text-green-700">
            ASISTIDO
          </Badge>
          {creativeModeContext?.setProjectMode && (
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => creativeModeContext.setProjectMode('PRO')}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              <Settings className="w-3 h-3 mr-1" />
              Cambiar a PRO
            </Button>
          )}
        </div>
      </div>

      {/* Workflow Guide - only in ASSISTED mode */}
      <WorkflowGuide 
        projectId={projectId} 
        currentRoute={currentPath}
        onNavigate={handleNavigate}
      />

      {/* Active Generation Alert */}
      {activeGeneration && activeGeneration.phase !== 'completed' && (
        <Alert className="border-primary/20 bg-primary/5">
          <BookOpen className="w-4 h-4" />
          <AlertDescription>
            <div className="flex items-center justify-between">
              <div>
                <strong>Generación en progreso:</strong> {activeGeneration.phaseLabel}
                <br />
                <span className="text-sm text-muted-foreground">
                  {activeGeneration.completedScenes}/{activeGeneration.totalScenes} escenas completadas
                </span>
              </div>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => navigate(`/projects/${projectId}/script`)}
              >
                Ver progreso
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {showTimeline && (
        <ScriptProgressTimeline projectId={projectId} className="mx-4" />
      )}
      
      {/* Main Script Workspace */}
      <ScriptWorkspace projectId={projectId} />
    </div>
  );
}

// Export both versions for backward compatibility
export { ScriptWorkspaceView as ScriptWorkspaceViewV1 };