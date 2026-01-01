import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { Plus, Search, Film, ArrowRight, Calendar, MoreHorizontal, Settings, Trash2, Loader2 } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

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
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [deleteDialog, setDeleteDialog] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleDeleteProject = async (projectId: string) => {
    setDeleting(true);
    const { error } = await supabase.from('projects').delete().eq('id', projectId);
    if (error) {
      toast.error('Error al eliminar proyecto');
    } else {
      toast.success('Proyecto eliminado');
      setProjects(projects.filter(p => p.id !== projectId));
    }
    setDeleting(false);
    setDeleteDialog(null);
  };

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

  const getFormatLabel = (format: string) => {
    switch (format) {
      case 'series': return 'Serie';
      case 'mini': return 'Miniserie';
      case 'film': return 'Película';
      default: return format;
    }
  };

  return (
    <AppLayout>
      <PageHeader title="Proyectos" description="Gestiona tus producciones">
        <Button variant="gold" asChild>
          <Link to="/projects/new">
            <Plus className="w-4 h-4" />
            Nuevo Proyecto
          </Link>
        </Button>
      </PageHeader>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-5xl mx-auto space-y-6">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar proyectos..."
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
                {search ? 'No se encontraron proyectos' : 'No hay proyectos aún'}
              </h3>
              <p className="text-muted-foreground mb-6">
                {search ? 'Intenta con otro término de búsqueda' : 'Crea tu primera producción para comenzar'}
              </p>
              {!search && (
                <Button variant="gold" asChild>
                  <Link to="/projects/new">
                    <Plus className="w-4 h-4" />
                    Nuevo Proyecto
                  </Link>
                </Button>
              )}
            </div>
          ) : (
            <div className="grid gap-4">
          {filteredProjects.map((project) => (
                <div key={project.id} className="panel p-6 hover:bg-card/80 transition-colors group relative">
                  <Link to={`/projects/${project.id}`} className="absolute inset-0 z-0" />
                  <div className="flex items-center gap-4 relative z-10 pointer-events-none">
                    <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-primary/20 to-amber-500/20 flex items-center justify-center shrink-0">
                      <Film className="w-7 h-7 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-1">
                        <h3 className="text-lg font-semibold text-foreground truncate">
                          {project.title}
                        </h3>
                        <Badge variant="outline" className="capitalize">
                          {getFormatLabel(project.format)}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span>{project.episodes_count} episodio{project.episodes_count > 1 ? 's' : ''}</span>
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5" />
                          {new Date(project.created_at).toLocaleDateString('es-ES')}
                        </span>
                      </div>
                    </div>
                    <div className="shrink-0 flex items-center gap-3">
                      <div className="text-right hidden sm:block">
                        <div className="text-sm text-muted-foreground mb-1">Biblia</div>
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
                        <Badge variant="pass" className="hidden sm:inline-flex">Listo</Badge>
                      ) : (
                        <Badge variant="pending" className="hidden sm:inline-flex">En Progreso</Badge>
                      )}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="pointer-events-auto">
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => navigate(`/projects/${project.id}`)}>
                            <Settings className="w-4 h-4 mr-2" />
                            Abrir proyecto
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem 
                            className="text-destructive focus:text-destructive"
                            onClick={() => setDeleteDialog(project.id)}
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Eliminar
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-foreground transition-colors hidden sm:block" />
                    </div>
                  </div>
                </div>
              ))}

              {/* Delete confirmation dialog */}
              <AlertDialog open={!!deleteDialog} onOpenChange={() => setDeleteDialog(null)}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>¿Eliminar proyecto?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Esta acción no se puede deshacer. Se eliminarán todos los datos asociados al proyecto.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction 
                      onClick={() => deleteDialog && handleDeleteProject(deleteDialog)}
                      className="bg-destructive hover:bg-destructive/90"
                    >
                      {deleting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                      Eliminar
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
