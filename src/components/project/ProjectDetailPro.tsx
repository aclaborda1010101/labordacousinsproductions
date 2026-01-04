/**
 * ProjectDetailPro - Classic tab-based layout for PRO mode
 * Full horizontal tabs without sidebar, all sections accessible at once
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { 
  Book, 
  FileText,
  Clapperboard,
  Settings,
  Users,
  MapPin,
  Palette,
  Layers,
  Play,
  Box
} from 'lucide-react';
import PropsComponent from '@/components/project/Props';
import BibleOverview from '@/components/project/BibleOverview';
import StylePack from '@/components/project/StylePack';
import { ProjectSettings } from '@/components/project/ProjectSettings';
import { NotificationCenter } from '@/components/notifications/NotificationCenter';
import Characters from '@/components/project/Characters';
import Locations from '@/components/project/Locations';
import Scenes from '@/components/project/Scenes';
import ScriptImport from '@/components/project/ScriptImport';
import RenderQueue from '@/components/project/RenderQueue';
import RealtimeCollaboration from '@/components/project/RealtimeCollaboration';
import { CreativeModeSelector } from '@/components/project/CreativeModeSelector';
import { ProductionDirectorPanel, ProductionDirectorTrigger } from '@/components/project/ProductionDirectorPanel';

interface Project {
  id: string;
  title: string;
  format: 'series' | 'mini' | 'film';
  episodes_count: number;
  target_duration_min: number;
  bible_completeness_score: number;
  created_at: string;
  owner_id: string;
}

interface ProjectDetailProProps {
  project: Project;
  setProject: (project: Project) => void;
}

export default function ProjectDetailPro({ project, setProject }: ProjectDetailProProps) {
  const [activeTab, setActiveTab] = useState('script');
  const [showSettings, setShowSettings] = useState(false);
  const [showDirector, setShowDirector] = useState(false);

  const bibleReady = project.bible_completeness_score >= 85;
  const formatLabel = project.format === 'series' ? 'Serie' : project.format === 'mini' ? 'Miniserie' : 'Película';

  return (
    <>
      <PageHeader title={project.title} description={`${formatLabel} • ${project.episodes_count} episodios`}>
        <CreativeModeSelector compact showDescription={false} />
        <Badge variant={bibleReady ? 'pass' : 'pending'}>
          Biblia: {project.bible_completeness_score}%
        </Badge>
        <Button variant="outline" size="icon" onClick={() => setShowSettings(true)}>
          <Settings className="w-4 h-4" />
        </Button>
      </PageHeader>

      <ProjectSettings
        project={project}
        open={showSettings}
        onOpenChange={setShowSettings}
        onUpdate={(updated) => setProject({ ...project, ...updated })}
      />

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Classic horizontal tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
          <div className="border-b border-border bg-muted/30 px-4 shrink-0">
            <TabsList className="h-12 bg-transparent gap-1 flex-wrap">
              <TabsTrigger 
                value="script" 
                className="data-[state=active]:bg-background data-[state=active]:shadow-sm gap-2"
              >
                <FileText className="w-4 h-4" />
                Guion
              </TabsTrigger>
              <TabsTrigger 
                value="bible" 
                className="data-[state=active]:bg-background data-[state=active]:shadow-sm gap-2"
              >
                <Book className="w-4 h-4" />
                Resumen
              </TabsTrigger>
              <TabsTrigger 
                value="style" 
                className="data-[state=active]:bg-background data-[state=active]:shadow-sm gap-2"
              >
                <Palette className="w-4 h-4" />
                Estilo
              </TabsTrigger>
              <TabsTrigger 
                value="characters" 
                className="data-[state=active]:bg-background data-[state=active]:shadow-sm gap-2"
              >
                <Users className="w-4 h-4" />
                Personajes
              </TabsTrigger>
              <TabsTrigger 
                value="locations" 
                className="data-[state=active]:bg-background data-[state=active]:shadow-sm gap-2"
              >
                <MapPin className="w-4 h-4" />
                Localizaciones
              </TabsTrigger>
              <TabsTrigger 
                value="props" 
                className="data-[state=active]:bg-background data-[state=active]:shadow-sm gap-2"
              >
                <Box className="w-4 h-4" />
                Props
              </TabsTrigger>
              <TabsTrigger 
                value="scenes" 
                className="data-[state=active]:bg-background data-[state=active]:shadow-sm gap-2"
                disabled={!bibleReady}
              >
                <Clapperboard className="w-4 h-4" />
                Escenas
              </TabsTrigger>
              <TabsTrigger 
                value="renders" 
                className="data-[state=active]:bg-background data-[state=active]:shadow-sm gap-2"
                disabled={!bibleReady}
              >
                <Play className="w-4 h-4" />
                Dailies
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 overflow-auto">
            <TabsContent value="script" className="h-full m-0">
              <ScriptImport projectId={project.id} />
            </TabsContent>
            <TabsContent value="bible" className="h-full m-0">
              <BibleOverview project={project} setProject={setProject} />
            </TabsContent>
            <TabsContent value="style" className="h-full m-0">
              <StylePack projectId={project.id} />
            </TabsContent>
            <TabsContent value="characters" className="h-full m-0">
              <Characters projectId={project.id} />
            </TabsContent>
            <TabsContent value="locations" className="h-full m-0">
              <Locations projectId={project.id} />
            </TabsContent>
            <TabsContent value="props" className="h-full m-0">
              <PropsComponent projectId={project.id} />
            </TabsContent>
            <TabsContent value="scenes" className="h-full m-0">
              <Scenes projectId={project.id} bibleReady={bibleReady} />
            </TabsContent>
            <TabsContent value="renders" className="h-full m-0">
              <RenderQueue projectId={project.id} />
            </TabsContent>
          </div>
        </Tabs>
      </div>

      <RealtimeCollaboration projectId={project.id} currentSection={activeTab} />

      {/* Production Director AI - Forge */}
      {showDirector ? (
        <ProductionDirectorPanel 
          projectId={project.id} 
          isOpen={showDirector} 
          onClose={() => setShowDirector(false)}
          onRefresh={async () => {
            const { data } = await supabase
              .from('projects')
              .select('*')
              .eq('id', project.id)
              .single();
            if (data) setProject(data);
          }}
        />
      ) : (
        <ProductionDirectorTrigger onClick={() => setShowDirector(true)} />
      )}
    </>
  );
}
