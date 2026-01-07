/**
 * ProjectDetailPro - Unified dropdown menu layout for PRO mode
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { 
  Book, 
  FileText,
  Clapperboard,
  Settings,
  Users,
  MapPin,
  Palette,
  Play,
  Box,
  Lock,
  AlertCircle,
  Wand2,
  ChevronDown
} from 'lucide-react';
import PropsComponent from '@/components/project/Props';
import BibleOverview from '@/components/project/BibleOverview';
import VisualBibleSetup from '@/components/project/VisualBibleSetup';
import { ProjectSettings } from '@/components/project/ProjectSettings';
import Characters from '@/components/project/Characters';
import Locations from '@/components/project/Locations';
import Scenes from '@/components/project/Scenes';
import ScriptImport from '@/components/project/ScriptImport';
import RenderQueue from '@/components/project/RenderQueue';
import RealtimeCollaboration from '@/components/project/RealtimeCollaboration';
import { CreativeModeSelector } from '@/components/project/CreativeModeSelector';
import { ProductionDirectorPanel, ProductionDirectorTrigger } from '@/components/project/ProductionDirectorPanel';
import { CinematicProductionEngine } from '@/components/cpe';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';

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

// Menu structure with submenus
const MENU_STRUCTURE = [
  { 
    id: 'script', 
    label: 'Guion', 
    icon: FileText, 
    requiresBible: false 
  },
  { 
    id: 'bible', 
    label: 'Biblia', 
    icon: Book, 
    requiresBible: false,
    subItems: [
      { id: 'overview', label: 'Resumen', icon: Book },
      { id: 'style', label: 'Estilo Visual', icon: Palette },
      { id: 'characters', label: 'Personajes', icon: Users },
      { id: 'locations', label: 'Localizaciones', icon: MapPin },
      { id: 'props', label: 'Props', icon: Box },
    ]
  },
  { 
    id: 'scenes', 
    label: 'Escenas', 
    icon: Clapperboard, 
    requiresBible: true 
  },
  { 
    id: 'renders', 
    label: 'Dailies', 
    icon: Play, 
    requiresBible: true 
  },
  { 
    id: 'engine', 
    label: 'Engine', 
    icon: Wand2, 
    requiresBible: false 
  },
];

// Get label for current view
function getViewLabel(viewId: string): { main: string; sub?: string } {
  for (const item of MENU_STRUCTURE) {
    if (item.subItems) {
      for (const sub of item.subItems) {
        if (sub.id === viewId) {
          return { main: item.label, sub: sub.label };
        }
      }
    } else if (item.id === viewId) {
      return { main: item.label };
    }
  }
  return { main: 'Proyecto' };
}

export default function ProjectDetailPro({ project, setProject }: ProjectDetailProProps) {
  const [activeView, setActiveView] = useState('script');
  const [showSettings, setShowSettings] = useState(false);
  const [showDirector, setShowDirector] = useState(false);

  const bibleReady = project.bible_completeness_score >= 85;
  const formatLabel = project.format === 'series' ? 'Serie' : project.format === 'mini' ? 'Miniserie' : 'Película';
  const currentLabel = getViewLabel(activeView);

  const handleNavigate = (viewId: string) => {
    setActiveView(viewId);
  };

  // Render content based on active view
  const renderContent = () => {
    switch (activeView) {
      case 'script':
        return <ScriptImport projectId={project.id} />;
      case 'overview':
        return <BibleOverview project={project} setProject={setProject} />;
      case 'style':
        return <VisualBibleSetup projectId={project.id} />;
      case 'characters':
        return <Characters projectId={project.id} />;
      case 'locations':
        return <Locations projectId={project.id} />;
      case 'props':
        return <PropsComponent projectId={project.id} />;
      case 'scenes':
        return <Scenes projectId={project.id} bibleReady={bibleReady} />;
      case 'renders':
        return <RenderQueue projectId={project.id} />;
      case 'engine':
        return <CinematicProductionEngine projectId={project.id} />;
      default:
        return <BibleOverview project={project} setProject={setProject} />;
    }
  };

  return (
    <>
      <PageHeader title={project.title} description={`${formatLabel} • ${project.episodes_count} episodios`}>
        {/* Single dropdown menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="gap-2">
              <span className="font-medium">
                {currentLabel.sub ? `${currentLabel.main} › ${currentLabel.sub}` : currentLabel.main}
              </span>
              <ChevronDown className="w-4 h-4 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56 bg-popover">
            {MENU_STRUCTURE.map((item) => {
              const Icon = item.icon;
              const isLocked = item.requiresBible && !bibleReady;

              if (item.subItems) {
                // Item with submenu
                return (
                  <DropdownMenuSub key={item.id}>
                    <DropdownMenuSubTrigger className="gap-2">
                      <Icon className="w-4 h-4" />
                      <span>{item.label}</span>
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="bg-popover">
                      {item.subItems.map((sub) => {
                        const SubIcon = sub.icon;
                        const isActive = activeView === sub.id;
                        return (
                          <DropdownMenuItem
                            key={sub.id}
                            onClick={() => handleNavigate(sub.id)}
                            className={cn("gap-2", isActive && "bg-accent")}
                          >
                            <SubIcon className="w-4 h-4" />
                            <span>{sub.label}</span>
                          </DropdownMenuItem>
                        );
                      })}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                );
              }

              // Regular item
              const isActive = activeView === item.id;
              return (
                <DropdownMenuItem
                  key={item.id}
                  onClick={() => !isLocked && handleNavigate(item.id)}
                  disabled={isLocked}
                  className={cn("gap-2", isActive && "bg-accent")}
                >
                  <Icon className="w-4 h-4" />
                  <span className="flex-1">{item.label}</span>
                  {isLocked && <Lock className="w-3.5 h-3.5 opacity-50" />}
                </DropdownMenuItem>
              );
            })}
            
            <DropdownMenuSeparator />
            
            <DropdownMenuItem onClick={() => setShowSettings(true)} className="gap-2">
              <Settings className="w-4 h-4" />
              <span>Ajustes del proyecto</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <CreativeModeSelector compact showDescription={false} />
        
        <Badge variant={bibleReady ? 'pass' : 'pending'}>
          Biblia: {project.bible_completeness_score}%
        </Badge>
        
        {!bibleReady && (
          <div className="hidden lg:flex items-center gap-1.5 text-xs text-warning">
            <AlertCircle className="w-3.5 h-3.5" />
            <span>Completa la biblia para desbloquear escenas</span>
          </div>
        )}
      </PageHeader>

      <ProjectSettings
        project={project}
        open={showSettings}
        onOpenChange={setShowSettings}
        onUpdate={(updated) => setProject({ ...project, ...updated })}
      />

      {/* Content area - full width */}
      <div className="flex-1 overflow-auto">
        {renderContent()}
      </div>

      <RealtimeCollaboration projectId={project.id} currentSection={currentLabel.main} />

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
