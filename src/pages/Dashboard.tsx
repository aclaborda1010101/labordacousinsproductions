import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { 
  Plus, 
  Film, 
  Clock, 
  CheckCircle2, 
  AlertCircle,
  TrendingUp,
  Clapperboard,
  Sparkles,
  ArrowRight
} from 'lucide-react';

interface Project {
  id: string;
  title: string;
  format: string;
  episodes_count: number;
  bible_completeness_score: number;
  created_at: string;
}

export default function Dashboard() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchProjects() {
      if (!user) return;
      
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);
      
      if (!error && data) {
        setProjects(data);
      }
      setLoading(false);
    }
    
    fetchProjects();
  }, [user]);

  const stats = [
    { 
      label: 'Active Projects', 
      value: projects.length, 
      icon: Film,
      color: 'text-primary' 
    },
    { 
      label: 'Scenes Rendered', 
      value: 0, 
      icon: Clapperboard,
      color: 'text-qc-pass' 
    },
    { 
      label: 'Pending QC', 
      value: 0, 
      icon: Clock,
      color: 'text-qc-pending' 
    },
    { 
      label: 'QC Issues', 
      value: 0, 
      icon: AlertCircle,
      color: 'text-qc-fail' 
    },
  ];

  return (
    <AppLayout>
      <PageHeader title="Dashboard" description="Welcome to your production studio">
        <Button variant="gold" asChild>
          <Link to="/projects/new">
            <Plus className="w-4 h-4" />
            New Project
          </Link>
        </Button>
      </PageHeader>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-7xl mx-auto space-y-8 stagger-children">
          {/* Stats grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {stats.map((stat) => {
              const Icon = stat.icon;
              return (
                <div key={stat.label} className="panel p-5">
                  <div className="flex items-center justify-between mb-3">
                    <Icon className={`w-5 h-5 ${stat.color}`} />
                    <TrendingUp className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div className="text-2xl font-bold text-foreground">{stat.value}</div>
                  <div className="text-sm text-muted-foreground">{stat.label}</div>
                </div>
              );
            })}
          </div>

          {/* Recent projects */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-foreground">Recent Projects</h2>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/projects">
                  View all
                  <ArrowRight className="w-4 h-4 ml-1" />
                </Link>
              </Button>
            </div>

            {loading ? (
              <div className="grid gap-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="panel h-24 shimmer" />
                ))}
              </div>
            ) : projects.length === 0 ? (
              <div className="panel p-12 text-center">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-amber-500/20 flex items-center justify-center mx-auto mb-4">
                  <Sparkles className="w-8 h-8 text-primary" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">
                  Create your first production
                </h3>
                <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                  Start building a cinema-quality project with AI-powered tools, 
                  quality gates, and professional workflows.
                </p>
                <Button variant="gold" asChild>
                  <Link to="/projects/new">
                    <Plus className="w-4 h-4" />
                    New Project
                  </Link>
                </Button>
              </div>
            ) : (
              <div className="grid gap-4">
                {projects.map((project) => (
                  <Link
                    key={project.id}
                    to={`/projects/${project.id}`}
                    className="panel p-5 hover:bg-card/80 transition-colors group"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-amber-500/20 flex items-center justify-center shrink-0">
                        <Film className="w-6 h-6 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-foreground truncate">
                            {project.title}
                          </h3>
                          <Badge variant="outline" className="capitalize">
                            {project.format}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <span>{project.episodes_count} episodes</span>
                          <span>•</span>
                          <span>Bible: {project.bible_completeness_score}%</span>
                        </div>
                      </div>
                      <div className="shrink-0">
                        {project.bible_completeness_score >= 85 ? (
                          <Badge variant="pass">Ready</Badge>
                        ) : (
                          <Badge variant="pending">In Progress</Badge>
                        )}
                      </div>
                      <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-foreground transition-colors" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Quick actions */}
          <div>
            <h2 className="text-lg font-semibold text-foreground mb-4">Quick Actions</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <button className="panel p-5 text-left hover:bg-card/80 transition-colors group">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-3 group-hover:bg-primary/20 transition-colors">
                  <Film className="w-5 h-5 text-primary" />
                </div>
                <h3 className="font-medium text-foreground mb-1">Import Script</h3>
                <p className="text-sm text-muted-foreground">
                  Upload a screenplay or paste text
                </p>
              </button>

              <button className="panel p-5 text-left hover:bg-card/80 transition-colors group">
                <div className="w-10 h-10 rounded-lg bg-qc-pass/10 flex items-center justify-center mb-3 group-hover:bg-qc-pass/20 transition-colors">
                  <CheckCircle2 className="w-5 h-5 text-qc-pass" />
                </div>
                <h3 className="font-medium text-foreground mb-1">Review Dailies</h3>
                <p className="text-sm text-muted-foreground">
                  Check today's renders and QC reports
                </p>
              </button>

              <button className="panel p-5 text-left hover:bg-card/80 transition-colors group">
                <div className="w-10 h-10 rounded-lg bg-info/10 flex items-center justify-center mb-3 group-hover:bg-info/20 transition-colors">
                  <Sparkles className="w-5 h-5 text-info" />
                </div>
                <h3 className="font-medium text-foreground mb-1">SOS Assistant</h3>
                <p className="text-sm text-muted-foreground">
                  Get AI recommendations for your project
                </p>
              </button>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
