import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Plus, Search, Film, ArrowRight, Calendar } from 'lucide-react';

interface Project {
  id: string;
  title: string;
  format: string;
  episodes_count: number;
  bible_completeness_score: number;
  created_at: string;
}

export default function Projects() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    async function fetchProjects() {
      if (!user) return;
      
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (!error && data) {
        setProjects(data);
      }
      setLoading(false);
    }
    
    fetchProjects();
  }, [user]);

  const filteredProjects = projects.filter(p => 
    p.title.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <AppLayout>
      <PageHeader title="Projects" description="Manage your productions">
        <Button variant="gold" asChild>
          <Link to="/projects/new">
            <Plus className="w-4 h-4" />
            New Project
          </Link>
        </Button>
      </PageHeader>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-5xl mx-auto space-y-6">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search projects..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Projects grid */}
          {loading ? (
            <div className="grid gap-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="panel h-28 shimmer" />
              ))}
            </div>
          ) : filteredProjects.length === 0 ? (
            <div className="panel p-12 text-center">
              <Film className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-2">
                {search ? 'No projects found' : 'No projects yet'}
              </h3>
              <p className="text-muted-foreground mb-6">
                {search ? 'Try a different search term' : 'Create your first production to get started'}
              </p>
              {!search && (
                <Button variant="gold" asChild>
                  <Link to="/projects/new">
                    <Plus className="w-4 h-4" />
                    New Project
                  </Link>
                </Button>
              )}
            </div>
          ) : (
            <div className="grid gap-4">
              {filteredProjects.map((project) => (
                <Link
                  key={project.id}
                  to={`/projects/${project.id}`}
                  className="panel p-6 hover:bg-card/80 transition-colors group"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-primary/20 to-amber-500/20 flex items-center justify-center shrink-0">
                      <Film className="w-7 h-7 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-1">
                        <h3 className="text-lg font-semibold text-foreground truncate">
                          {project.title}
                        </h3>
                        <Badge variant="outline" className="capitalize">
                          {project.format}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span>{project.episodes_count} episode{project.episodes_count > 1 ? 's' : ''}</span>
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5" />
                          {new Date(project.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    <div className="shrink-0 flex items-center gap-3">
                      <div className="text-right">
                        <div className="text-sm text-muted-foreground mb-1">Bible</div>
                        <div className="flex items-center gap-2">
                          <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-primary rounded-full transition-all"
                              style={{ width: `${project.bible_completeness_score}%` }}
                            />
                          </div>
                          <span className="text-sm font-medium text-foreground">
                            {project.bible_completeness_score}%
                          </span>
                        </div>
                      </div>
                      {project.bible_completeness_score >= 85 ? (
                        <Badge variant="pass">Ready</Badge>
                      ) : (
                        <Badge variant="pending">In Progress</Badge>
                      )}
                      <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-foreground transition-colors" />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
