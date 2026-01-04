/**
 * ScriptWorkspaceView - Wrapper that shows different script interfaces based on user mode
 * Normal users see ScriptWorkspace, Developer mode adds a "Configuración" tab with ScriptImport
 */

import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useDeveloperMode } from '@/contexts/DeveloperModeContext';
import { FileText, Settings2 } from 'lucide-react';
import ScriptWorkspace from './ScriptWorkspace';
import ScriptImport from './ScriptImport';

interface ScriptWorkspaceViewProps {
  projectId: string;
}

export default function ScriptWorkspaceView({ projectId }: ScriptWorkspaceViewProps) {
  const { isDeveloperMode } = useDeveloperMode();
  const [activeTab, setActiveTab] = useState('workspace');

  // Normal users only see ScriptWorkspace
  if (!isDeveloperMode) {
    return <ScriptWorkspace projectId={projectId} />;
  }

  // Developer mode: show tabs with Workspace and Configuration
  return (
    <div className="h-full flex flex-col">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
        <div className="border-b border-border bg-muted/30 px-4">
          <TabsList className="h-12 bg-transparent gap-1">
            <TabsTrigger 
              value="workspace" 
              className="data-[state=active]:bg-background data-[state=active]:shadow-sm gap-2"
            >
              <FileText className="w-4 h-4" />
              Guion
            </TabsTrigger>
            <TabsTrigger 
              value="config" 
              className="data-[state=active]:bg-background data-[state=active]:shadow-sm gap-2"
            >
              <Settings2 className="w-4 h-4" />
              Configuración Avanzada
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="workspace" className="flex-1 mt-0 overflow-auto">
          <ScriptWorkspace projectId={projectId} />
        </TabsContent>

        <TabsContent value="config" className="flex-1 mt-0 overflow-auto">
          <ScriptImport projectId={projectId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
