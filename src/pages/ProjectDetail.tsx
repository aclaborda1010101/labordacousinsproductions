import { useEffect, useState } from 'react';
import { useParams, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { BatchProgressBadge } from '@/components/project/BatchProgressBadge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { 
  Book, 
  FileText,
  Clapperboard,
  Settings,
  ChevronRight,
  AlertCircle,
  Lock,
  Play,
  Wand2,
  Users,
  MapPin,
  Palette,
  Box,
  ChevronDown,
  Menu,
  X
} from 'lucide-react';
import PropsComponent from '@/components/project/Props';
import { cn } from '@/lib/utils';
import BibleOverview from '@/components/project/BibleOverview';
import VisualBibleSetup from '@/components/project/VisualBibleSetup';
import { ProjectSettings } from '@/components/project/ProjectSettings';
import CharactersView from '@/components/project/CharactersView';
import LocationsView from '@/components/project/LocationsView';
import Scenes from '@/components/project/Scenes';
import ScriptWorkspaceView from '@/components/project/ScriptWorkspaceView';
import { CinematicProductionEngine } from '@/components/cpe';
import RenderQueue from '@/components/project/RenderQueue';
import RealtimeCollaboration from '@/components/project/RealtimeCollaboration';
import { CreativeModeProvider, useCreativeModeOptional } from '@/contexts/CreativeModeContext';
import { CreativeModeSelector } from '@/components/project/CreativeModeSelector';
import { ProductionDirectorPanel, ProductionDirectorTrigger } from '@/components/project/ProductionDirectorPanel';
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

// Menu structure with submenus
const MENU_STRUCTURE = [
  { 
    id: 'script', 
    path: '/script', 
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
      { path: '', label: 'Resumen', icon: Book },
      { path: '/style', label: 'Estilo Visual', icon: Palette },
      { path: '/characters', label: 'Personajes', icon: Users },
      { path: '/locations', label: 'Localizaciones', icon: MapPin },
      { path: '/props', label: 'Props', icon: Box },
    ]
  },
  { 
    id: 'scenes', 
    path: '/scenes', 
    label: 'Secuencias', 
    icon: Clapperboard, 
    requiresBible: true 
  },
  { 
    id: 'renders', 
    path: '/renders', 
    label: 'Dailies', 
    icon: Play, 
    requiresBible: true 
  },
  { 
    id: 'engine', 
    path: '/engine', 
    label: 'Engine', 
    icon: Wand2, 
    requiresBible: false 
  },
];

// Get current section label
function getCurrentSectionLabel(currentPath: string): { main: string; sub?: string } {
  for (const item of MENU_STRUCTURE) {
    if (item.subItems) {
      for (const sub of item.subItems) {
        if (currentPath === sub.path || (sub.path === '' && (currentPath === '' || currentPath === '/bible'))) {
          return { main: item.label, sub: sub.label };
        }
      }
    } else if (item.path === currentPath) {
      return { main: item.label };
    }
  }
  return { main: 'Proyecto' };
}

// Inner component that uses creative mode context
function ProjectDetailContent({ project, setProject }: { project: Project; setProject: (p: Project) => void }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { projectId } = useParams();
  const [showSettings, setShowSettings] = useState(false);
  const [showDirector, setShowDirector] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [bibliaExpanded, setBibliaExpanded] = useState(true);

  const currentPath = location.pathname.replace(`/projects/${projectId}`, '') || '';
  const bibleReady = project.bible_completeness_score >= 85;
  const currentSection = getCurrentSectionLabel(currentPath);
  const formatLabel = project.format === 'series' ? 'Serie' : project.format === 'mini' ? 'Miniserie' : 'Película';

  const handleNavigate = (path: string) => {
    navigate(`/projects/${projectId}${path}`);
    setMobileMenuOpen(false);
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
                  {currentSection.sub ? currentSection.sub : currentSection.main}
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
                    // Collapsible section for Biblia
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
                              const isActive = currentPath === sub.path || 
                                (sub.path === '' && (currentPath === '' || currentPath === '/bible'));
                              return (
                                <button
                                  key={sub.path}
                                  onClick={() => handleNavigate(sub.path)}
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

                  // Regular item
                  const isActive = currentPath === item.path;
                  return (
                    <button
                      key={item.id}
                      onClick={() => !isLocked && handleNavigate(item.path!)}
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
                  {currentSection.sub ? `${currentSection.main} › ${currentSection.sub}` : currentSection.main}
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
                          const isActive = currentPath === sub.path || 
                            (sub.path === '' && (currentPath === '' || currentPath === '/bible'));
                          return (
                            <DropdownMenuItem
                              key={sub.path}
                              onClick={() => handleNavigate(sub.path)}
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

                const isActive = currentPath === item.path;
                return (
                  <DropdownMenuItem
                    key={item.id}
                    onClick={() => !isLocked && handleNavigate(item.path!)}
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
        
        {/* Batch Progress Badge - visible when generating episodes */}
        <BatchProgressBadge projectId={project.id} />
        
        <Badge variant={bibleReady ? 'pass' : 'pending'} className="hidden sm:inline-flex">
          Biblia: {project.bible_completeness_score}%
        </Badge>
        
        {!bibleReady && (
          <div className="hidden lg:flex items-center gap-1.5 text-xs text-warning">
            <AlertCircle className="w-3.5 h-3.5" />
            <span>Completa la biblia para desbloquear escenas</span>
          </div>
        )}
      </PageHeader>

      {/* Project Settings Dialog */}
      <ProjectSettings
        project={project}
        open={showSettings}
        onOpenChange={setShowSettings}
        onUpdate={(updated) => setProject({ ...project, ...updated })}
      />

      {/* Content area - full width now */}
      <div className="flex-1 overflow-auto">
        <Routes>
          <Route path="/" element={<BibleOverview project={project} setProject={setProject} />} />
          <Route path="/bible" element={<BibleOverview project={project} setProject={setProject} />} />
          <Route path="/style" element={<VisualBibleSetup projectId={project.id} />} />
          <Route path="/characters" element={<CharactersView projectId={project.id} />} />
          <Route path="/locations" element={<LocationsView projectId={project.id} />} />
          <Route path="/props" element={<PropsComponent projectId={project.id} />} />
          <Route path="/script" element={<ScriptWorkspaceView projectId={project.id} />} />
          <Route path="/scenes" element={<Scenes projectId={project.id} bibleReady={bibleReady} />} />
          <Route path="/renders" element={<RenderQueue projectId={project.id} />} />
          <Route path="/engine" element={<CinematicProductionEngine projectId={project.id} />} />
          <Route path="*" element={
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="text-center">
                <Lock className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-foreground mb-2">
                  Completa tu Biblia primero
                </h3>
                <p className="text-muted-foreground max-w-md">
                  Construye el canon con estilo, personajes y localizaciones 
                  antes de proceder con las escenas.
                </p>
              </div>
            </div>
          } />
        </Routes>
      </div>

      {/* Realtime collaboration overlay */}
      <RealtimeCollaboration projectId={project.id} currentSection={currentSection.main} />

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

export default function ProjectDetail() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchProject() {
      if (!projectId || !user) return;
      
      // Reset state when projectId changes to show loading and avoid stale data
      setLoading(true);
      setProject(null);
      
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('id', projectId)
        .maybeSingle();
      
      if (error) {
        console.error('Error fetching project:', error);
        navigate('/projects');
        return;
      }
      
      if (!data) {
        navigate('/projects');
        return;
      }
      
      setProject(data);
      setLoading(false);
    }
    
    fetchProject();
  }, [projectId, user, navigate]);

  if (loading || !project) {
    return (
      <AppLayout>
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </AppLayout>
    );
  }

  return (
    <CreativeModeProvider projectId={project.id}>
      <AppLayout>
        <ProjectDetailContent project={project} setProject={setProject} />
      </AppLayout>
    </CreativeModeProvider>
  );
}
