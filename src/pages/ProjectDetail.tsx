import { useEffect, useState } from 'react';
import { useParams, Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
  PanelLeftClose,
  PanelLeft,
  Menu
} from 'lucide-react';
import PropsComponent from '@/components/project/Props';
import { cn } from '@/lib/utils';
import BibleOverview from '@/components/project/BibleOverview';
import StylePack from '@/components/project/StylePack';
import { ProjectSettings } from '@/components/project/ProjectSettings';
import { NotificationCenter } from '@/components/notifications/NotificationCenter';
import CharactersView from '@/components/project/CharactersView';
import LocationsView from '@/components/project/LocationsView';
import Scenes from '@/components/project/Scenes';
import ScriptWorkspaceView from '@/components/project/ScriptWorkspaceView';
import RenderQueue from '@/components/project/RenderQueue';
import RealtimeCollaboration from '@/components/project/RealtimeCollaboration';
import { CreativeModeProvider, useCreativeModeOptional } from '@/contexts/CreativeModeContext';
import { CreativeModeSelector } from '@/components/project/CreativeModeSelector';
import ProjectDetailPro from '@/components/project/ProjectDetailPro';
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

// Simplified tabs: Guion, Biblia (unified), Escenas, Dailies/Export, Ajustes
const PROJECT_TABS = [
  { id: 'script', path: '/script', label: 'Guion', icon: FileText, requiresBible: false },
  { id: 'bible', path: '', label: 'Biblia', icon: Book, requiresBible: false, description: 'Personajes, Localizaciones, Estilo' },
  { id: 'scenes', path: '/scenes', label: 'Escenas', icon: Clapperboard, requiresBible: true },
  { id: 'renders', path: '/renders', label: 'Dailies', icon: Play, requiresBible: true },
];

// Inner component that uses creative mode context
function ProjectDetailContent({ project, setProject }: { project: Project; setProject: (p: Project) => void }) {
  const location = useLocation();
  const { projectId } = useParams();
  const [showSettings, setShowSettings] = useState(false);
  const [showDirector, setShowDirector] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  
  // Get creative mode from context
  const creativeModeContext = useCreativeModeOptional();
  const effectiveMode = creativeModeContext?.effectiveMode ?? 'ASSISTED';

  const currentPath = location.pathname.replace(`/projects/${projectId}`, '') || '';
  const bibleReady = project.bible_completeness_score >= 85;
  const currentSection = PROJECT_TABS.find(t => t.path === currentPath)?.label || 'Biblia';
  const formatLabel = project.format === 'series' ? 'Serie' : project.format === 'mini' ? 'Miniserie' : 'Película';

  // Sub-routes for Bible section
  const isBibleSection = currentPath === '' || currentPath === '/bible' || 
    currentPath === '/style' || currentPath === '/characters' || 
    currentPath === '/locations' || currentPath === '/props';

  // PRO mode: Use classic tab-based layout
  if (effectiveMode === 'PRO') {
    return <ProjectDetailPro project={project} setProject={setProject} />;
  }

  // ASSISTED/DIRECTOR mode: Use sidebar layout
  return (
    <>
      <PageHeader title={project.title} description={`${formatLabel} • ${project.episodes_count} episodios`}>
        {/* Mobile sidebar toggle */}
        <Button 
          variant="ghost" 
          size="icon" 
          className="sm:hidden"
          onClick={() => setMobileSidebarOpen(!mobileSidebarOpen)}
        >
          <Menu className="w-4 h-4" />
        </Button>
        <CreativeModeSelector compact showDescription={false} />
        <Badge variant={bibleReady ? 'pass' : 'pending'} className="hidden sm:inline-flex">
          Biblia: {project.bible_completeness_score}%
        </Badge>
        <Button variant="outline" size="icon" onClick={() => setShowSettings(true)}>
          <Settings className="w-4 h-4" />
        </Button>
      </PageHeader>

      {/* Project Settings Dialog */}
      <ProjectSettings
        project={project}
        open={showSettings}
        onOpenChange={setShowSettings}
        onUpdate={(updated) => setProject({ ...project, ...updated })}
      />

      <div className="flex-1 flex overflow-hidden relative">
        {/* Mobile sidebar overlay */}
        {mobileSidebarOpen && (
          <div 
            className="fixed inset-0 bg-black/50 z-40 sm:hidden"
            onClick={() => setMobileSidebarOpen(false)}
          />
        )}

        {/* Sidebar navigation - collapsible */}
        <nav className={cn(
          "bg-sidebar border-r border-sidebar-border shrink-0 overflow-y-auto transition-all duration-300 flex flex-col",
          // Mobile: slide-in drawer
          "fixed sm:relative inset-y-0 left-0 z-50 sm:z-auto",
          mobileSidebarOpen ? "translate-x-0" : "-translate-x-full sm:translate-x-0",
          // Desktop: collapsible width
          sidebarCollapsed ? "sm:w-12" : "w-48"
        )}>
          {/* Collapse toggle - desktop only */}
          <div className="hidden sm:flex p-2 border-b border-sidebar-border justify-end">
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-7 w-7"
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            >
              {sidebarCollapsed ? <PanelLeft className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
            </Button>
          </div>

          {/* Mobile header */}
          <div className="sm:hidden flex items-center justify-between p-3 border-b border-sidebar-border">
            <span className="font-semibold text-sm">Navegación</span>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setMobileSidebarOpen(false)}>
              <PanelLeftClose className="w-4 h-4" />
            </Button>
          </div>

          <div className="p-2 sm:p-3 space-y-1 flex-1">
            {PROJECT_TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = tab.id === 'bible' 
                ? isBibleSection 
                : currentPath === tab.path;
              const isLocked = tab.requiresBible && !bibleReady;
              
              return (
                <Link
                  key={tab.id}
                  to={isLocked ? '#' : `/projects/${projectId}${tab.path}`}
                  onClick={(e) => {
                    if (isLocked) {
                      e.preventDefault();
                    } else {
                      setMobileSidebarOpen(false);
                    }
                  }}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                    sidebarCollapsed && "sm:justify-center sm:px-2",
                    isActive 
                      ? "bg-sidebar-accent text-sidebar-accent-foreground" 
                      : isLocked
                        ? "text-muted-foreground cursor-not-allowed opacity-50"
                        : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
                  )}
                  title={sidebarCollapsed ? tab.label : undefined}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  {!sidebarCollapsed && <span className="flex-1">{tab.label}</span>}
                  {!sidebarCollapsed && (isLocked ? (
                    <Lock className="w-3.5 h-3.5" />
                  ) : isActive ? (
                    <ChevronRight className="w-4 h-4 opacity-50" />
                  ) : null)}
                </Link>
              );
            })}
          </div>

          {/* Bible sub-navigation - only show when in Bible section and not collapsed */}
          {isBibleSection && !sidebarCollapsed && (
            <div className="px-2 sm:px-3 pb-3">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground px-3 py-2">
                Biblia
              </div>
              <div className="space-y-0.5">
                {[
                  { path: '', label: 'Resumen' },
                  { path: '/style', label: 'Estilo Visual' },
                  { path: '/characters', label: 'Personajes' },
                  { path: '/locations', label: 'Localizaciones' },
                  { path: '/props', label: 'Props' },
                ].map((sub) => (
                  <Link
                    key={sub.path}
                    to={`/projects/${projectId}${sub.path}`}
                    onClick={() => setMobileSidebarOpen(false)}
                    className={cn(
                      "block px-3 py-1.5 rounded text-xs transition-colors",
                      currentPath === sub.path || (sub.path === '' && (currentPath === '' || currentPath === '/bible'))
                        ? "bg-primary/10 text-primary font-medium"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    )}
                  >
                    {sub.label}
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Bible gate warning - hide when collapsed */}
          {!bibleReady && !sidebarCollapsed && (
            <div className="m-2 sm:m-3 p-3 rounded-lg bg-warning/10 border border-warning/20">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-warning mt-0.5 shrink-0" />
                <div className="text-xs">
                  <p className="font-medium text-warning">Biblia incompleta</p>
                  <p className="text-muted-foreground mt-0.5">
                    Completa la biblia para desbloquear escenas.
                  </p>
                </div>
              </div>
            </div>
          )}
        </nav>

        {/* Content area */}
        <div className="flex-1 overflow-auto">
          <Routes>
            <Route path="/" element={<BibleOverview project={project} setProject={setProject} />} />
            <Route path="/bible" element={<BibleOverview project={project} setProject={setProject} />} />
            <Route path="/style" element={<StylePack projectId={project.id} />} />
            <Route path="/characters" element={<CharactersView projectId={project.id} />} />
            <Route path="/locations" element={<LocationsView projectId={project.id} />} />
            <Route path="/props" element={<PropsComponent projectId={project.id} />} />
            <Route path="/script" element={<ScriptWorkspaceView projectId={project.id} />} />
            <Route path="/scenes" element={<Scenes projectId={project.id} bibleReady={bibleReady} />} />
            <Route path="/renders" element={<RenderQueue projectId={project.id} />} />
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
      </div>

      {/* Realtime collaboration overlay */}
      <RealtimeCollaboration projectId={project.id} currentSection={currentSection} />

      {/* Production Director AI - Forge */}
      {showDirector ? (
        <ProductionDirectorPanel 
          projectId={project.id} 
          isOpen={showDirector} 
          onClose={() => setShowDirector(false)}
          onRefresh={async () => {
            // Refetch project data
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
