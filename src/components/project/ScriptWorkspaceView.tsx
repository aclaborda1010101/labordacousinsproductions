/**
 * ScriptWorkspaceView - Adaptive Script Interface by Creative Mode
 * ASSISTED: Guided ScriptWorkspace with idea/analyze flow
 * DIRECTOR/PRO: Full ScriptImport with pipeline and advanced options
 */

import { useDeveloperMode } from '@/contexts/DeveloperModeContext';
import { useCreativeModeOptional } from '@/contexts/CreativeModeContext';
import ScriptWorkspace from './ScriptWorkspace';
import ScriptImport from './ScriptImport';

interface ScriptWorkspaceViewProps {
  projectId: string;
}

export default function ScriptWorkspaceView({ projectId }: ScriptWorkspaceViewProps) {
  const { isDeveloperMode } = useDeveloperMode();
  const creativeModeContext = useCreativeModeOptional();
  const effectiveMode = creativeModeContext?.effectiveMode ?? 'ASSISTED';

  // Developer Mode or DIRECTOR/PRO: Show full ScriptImport with pipeline
  if (isDeveloperMode || effectiveMode === 'DIRECTOR' || effectiveMode === 'PRO') {
    return <ScriptImport projectId={projectId} />;
  }

  // ASSISTED mode: Show guided ScriptWorkspace
  return <ScriptWorkspace projectId={projectId} />;
}
