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
  Film, 
  Users, 
  MapPin, 
  Palette,
  FileText,
  Clapperboard,
  Play,
  Settings,
  ChevronRight,
  AlertCircle,
  Lock,
  DollarSign
} from 'lucide-react';
import { cn } from '@/lib/utils';
import BibleOverview from '@/components/project/BibleOverview';
import StylePack from '@/components/project/StylePack';
import Characters from '@/components/project/Characters';
import Locations from '@/components/project/Locations';
import Scenes from '@/components/project/Scenes';
import CostEngine from '@/components/project/CostEngine';

interface Project {
  id: string;
  title: string;
  format: string;
  episodes_count: number;
  target_duration_min: number;
  bible_completeness_score: number;
  created_at: string;
}

const PROJECT_TABS = [
  { id: 'bible', path: '', label: 'Bible', icon: Book, requiresBible: false },
  { id: 'style', path: '/style', label: 'Style Pack', icon: Palette, requiresBible: false },
  { id: 'characters', path: '/characters', label: 'Characters', icon: Users, requiresBible: false },
  { id: 'locations', path: '/locations', label: 'Locations', icon: MapPin, requiresBible: false },
  { id: 'scenes', path: '/scenes', label: 'Scenes', icon: Clapperboard, requiresBible: true },
  { id: 'cost', path: '/cost', label: 'Cost Engine', icon: DollarSign, requiresBible: false },
];

export default function ProjectDetail() {
  const { projectId } = useParams();
  const location = useLocation();
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

  const currentPath = location.pathname.replace(`/projects/${projectId}`, '') || '';
  const bibleReady = project.bible_completeness_score >= 85;

  return (
    <AppLayout>
      <PageHeader title={project.title} description={`${project.format} • ${project.episodes_count} episodes`}>
        <Badge variant={bibleReady ? 'pass' : 'pending'}>
          Bible: {project.bible_completeness_score}%
        </Badge>
        <Button variant="outline" size="icon">
          <Settings className="w-4 h-4" />
        </Button>
      </PageHeader>

      <div className="flex-1 flex overflow-hidden">
        {/* Project sidebar navigation */}
        <nav className="w-56 bg-sidebar border-r border-sidebar-border shrink-0 overflow-y-auto">
          <div className="p-3 space-y-1">
            {PROJECT_TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = currentPath === tab.path || 
                (tab.path === '' && currentPath === '/bible');
              const isLocked = tab.requiresBible && !bibleReady;
              
              return (
                <Link
                  key={tab.id}
                  to={isLocked ? '#' : `/projects/${projectId}${tab.path}`}
                  onClick={(e) => isLocked && e.preventDefault()}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                    isActive 
                      ? "bg-sidebar-accent text-sidebar-accent-foreground" 
                      : isLocked
                        ? "text-muted-foreground cursor-not-allowed opacity-50"
                        : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
                  )}
                >
                  <Icon className="w-4 h-4" />
                  <span className="flex-1">{tab.label}</span>
                  {isLocked ? (
                    <Lock className="w-3.5 h-3.5" />
                  ) : isActive ? (
                    <ChevronRight className="w-4 h-4 opacity-50" />
                  ) : null}
                </Link>
              );
            })}
          </div>

          {/* Bible gate warning */}
          {!bibleReady && (
            <div className="m-3 p-3 rounded-lg bg-warning/10 border border-warning/20">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-warning mt-0.5 shrink-0" />
                <div className="text-xs">
                  <p className="font-medium text-warning">Bible Incomplete</p>
                  <p className="text-muted-foreground mt-0.5">
                    Complete your production bible to unlock scenes.
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
            <Route path="/characters" element={<Characters projectId={project.id} />} />
            <Route path="/locations" element={<Locations projectId={project.id} />} />
            <Route path="/scenes" element={<Scenes projectId={project.id} bibleReady={bibleReady} />} />
            <Route path="/cost" element={<CostEngine projectId={project.id} />} />
            <Route path="*" element={
              <div className="flex-1 flex items-center justify-center p-8">
                <div className="text-center">
                  <Lock className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-foreground mb-2">
                    Complete your Bible first
                  </h3>
                  <p className="text-muted-foreground max-w-md">
                    Build your production canon with style, characters, and locations 
                    before proceeding to script and rendering.
                  </p>
                </div>
              </div>
            } />
          </Routes>
        </div>
      </div>
    </AppLayout>
  );
}
