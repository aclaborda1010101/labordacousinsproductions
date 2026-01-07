/**
 * ProjectDetailPro - Unified dropdown menu layout for PRO mode
 */

import { useState } from 'react';
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
  ChevronDown,
  ChevronRight,
  Menu
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [bibliaExpanded, setBibliaExpanded] = useState(true);

  const bibleReady = project.bible_completeness_score >= 85;
  const formatLabel = project.format === 'series' ? 'Serie' : project.format === 'mini' ? 'Miniserie' : 'Película';
  const currentLabel = getViewLabel(activeView);

  const handleNavigate = (viewId: string) => {
    setActiveView(viewId);
    setMobileMenuOpen(false);
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
        {/* Mobile: Sheet menu */}
        <div className="sm:hidden">
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <Menu className="w-4 h-4" />
                <span className="max-w-[100px] truncate">
                  {currentLabel.sub ? currentLabel.sub : currentLabel.main}
                </span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[280px] p-0">
              <SheetHeader className="p-4 border-b">
                <SheetTitle className="text-left">Navegación</SheetTitle>
              </SheetHeader>
              <nav className="flex flex-col py-2">
                {MENU_STRUCTURE.map((item) => {
                  const Icon = item.icon;
                  const isLocked = item.requiresBible && !bibleReady;

                  if (item.subItems) {
                    return (
                      <Collapsible 
                        key={item.id} 
                        open={bibliaExpanded} 
                        onOpenChange={setBibliaExpanded}
                      >
                        <CollapsibleTrigger className="flex items-center gap-3 w-full px-4 py-3 text-left hover:bg-muted/50">
                          <Icon className="w-5 h-5" />
                          <span className="flex-1 font-medium">{item.label}</span>
                          <ChevronRight className={cn(
                            "w-4 h-4 transition-transform",
                            bibliaExpanded && "rotate-90"
                          )} />
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <div className="pl-4 border-l-2 border-muted ml-6 space-y-1 py-1">
                            {item.subItems.map((sub) => {
                              const SubIcon = sub.icon;
                              const isActive = activeView === sub.id;
                              return (
                                <button
                                  key={sub.id}
                                  onClick={() => handleNavigate(sub.id)}
                                  className={cn(
                                    "flex items-center gap-3 w-full px-4 py-2.5 text-left rounded-r-lg",
                                    isActive 
                                      ? "bg-primary/10 text-primary font-medium" 
                                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                                  )}
                                >
                                  <SubIcon className="w-4 h-4" />
                                  <span>{sub.label}</span>
                                </button>
                              );
                            })}
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    );
                  }

                  const isActive = activeView === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => !isLocked && handleNavigate(item.id)}
                      disabled={isLocked}
                      className={cn(
                        "flex items-center gap-3 w-full px-4 py-3 text-left",
                        isActive 
                          ? "bg-primary/10 text-primary font-medium" 
                          : isLocked
                            ? "text-muted-foreground opacity-50"
                            : "text-foreground hover:bg-muted/50"
                      )}
                    >
                      <Icon className="w-5 h-5" />
                      <span className="flex-1">{item.label}</span>
                      {isLocked && <Lock className="w-4 h-4" />}
                    </button>
                  );
                })}
                
                <div className="border-t my-2" />
                
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    setShowSettings(true);
                  }}
                  className="flex items-center gap-3 w-full px-4 py-3 text-left text-foreground hover:bg-muted/50"
                >
                  <Settings className="w-5 h-5" />
                  <span>Ajustes del proyecto</span>
                </button>
              </nav>
              
              {!bibleReady && (
                <div className="mx-4 p-3 rounded-lg bg-warning/10 border border-warning/20">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-warning mt-0.5" />
                    <div className="text-xs">
                      <p className="font-medium text-warning">Biblia incompleta</p>
                      <p className="text-muted-foreground mt-0.5">
                        Completa la biblia para desbloquear escenas.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </SheetContent>
          </Sheet>
        </div>

        {/* Desktop: Dropdown menu */}
        <div className="hidden sm:block">
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
        </div>

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
