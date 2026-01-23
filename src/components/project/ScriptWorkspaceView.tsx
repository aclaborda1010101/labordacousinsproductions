/**
 * ScriptWorkspaceView - Adaptive Script Interface by Creative Mode
 * ASSISTED: Guided ScriptWorkspace with idea/analyze flow
 * PRO: Full ScriptImport with pipeline and advanced options
 * 
 * Now includes ScriptProgressTimeline for active generation visibility.
 */

import { useDeveloperMode } from '@/contexts/DeveloperModeContext';
import { useCreativeModeOptional } from '@/contexts/CreativeModeContext';
import { useActiveGeneration } from '@/hooks/useActiveGeneration';
import ScriptWorkspace from './ScriptWorkspace';
import ScriptImport from './ScriptImport';
import ScriptProgressTimeline from './ScriptProgressTimeline';

interface ScriptWorkspaceViewProps {
  projectId: string;
}

export default function ScriptWorkspaceView({ projectId }: ScriptWorkspaceViewProps) {
  const { isDeveloperMode } = useDeveloperMode();
  const creativeModeContext = useCreativeModeOptional();
  const effectiveMode = creativeModeContext?.effectiveMode ?? 'ASSISTED';
  
  // V78: Disable external ScriptProgressTimeline - the PreScriptWizard 
  // now handles its own progress UI for step 5 (narrative generation).
  // Showing both causes confusion with mismatched progress indicators.
  const showTimeline = false;

  // Developer Mode or PRO: Show full ScriptImport with pipeline
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

  // ASSISTED mode: Show guided ScriptWorkspace with timeline if active
  return (
    <div className="space-y-4">
      {showTimeline && (
        <ScriptProgressTimeline projectId={projectId} className="mx-4" />
      )}
      <ScriptWorkspace projectId={projectId} />
    </div>
  );
}
