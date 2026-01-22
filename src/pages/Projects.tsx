import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { Plus, Search, Film, ArrowRight, Calendar, MoreHorizontal, Settings, Trash2, Loader2, RefreshCw, WifiOff } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { getCachedData, setCachedData, getCacheTimestamp, formatCacheTime } from '@/lib/supabaseRetry';

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
  const [error, setError] = useState<string | null>(null);
  const [usingCache, setUsingCache] = useState(false);
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
      // Update cache
      setCachedData('projects_list', projects.filter(p => p.id !== projectId));
    }
    setDeleting(false);
    setDeleteDialog(null);
  };

  const fetchProjects = useCallback(async () => {
    if (!user) return;
    
    setLoading(true);
    setError(null);
    setUsingCache(false);
    
    try {
      const { data, error: fetchError } = await supabase
        .from('projects')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (fetchError) {
        throw fetchError;
      }
      
      if (data) {
        setProjects(data);
        setCachedData('projects_list', data);
      }
    } catch (err) {
      console.error('Projects fetch error:', err);
      
      // Try to use cached data
      const cachedProjects = getCachedData<Project[]>('projects_list');
      
      if (cachedProjects) {
        setProjects(cachedProjects);
        setUsingCache(true);
      } else {
        setError('No se pudo conectar con el servidor');
      }
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

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
        <Button variant="lime" size="sm" asChild className="hidden sm:inline-flex">
          <Link to="/projects/new">
            <Plus className="w-4 h-4" />
            Nuevo Proyecto
          </Link>
        </Button>
      </PageHeader>

      <div className="flex-1 overflow-auto">
        <div className="max-w-5xl mx-auto p-4 lg:p-6 space-y-4 lg:space-y-6">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar proyectos..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 h-10 lg:h-11"
            />
          </div>

          {/* Cache indicator */}
          {usingCache && (
            <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-500/10 px-3 py-2 rounded-lg">
              <WifiOff className="w-3.5 h-3.5" />
              <span>Mostrando datos en caché — Última actualización: {formatCacheTime(getCacheTimestamp('projects_list'))}</span>
              <Button variant="ghost" size="sm" onClick={fetchProjects} className="h-6 px-2 ml-auto">
                <RefreshCw className="w-3 h-3 mr-1" />
                Reintentar
              </Button>
            </div>
          )}

          {/* Projects grid */}
          {loading ? (
            <div className="grid gap-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="panel h-20 lg:h-28 shimmer" />
              ))}
            </div>
          ) : error && !usingCache ? (
            <div className="panel p-8 lg:p-12 text-center border-destructive/30">
              <WifiOff className="w-10 lg:w-12 h-10 lg:h-12 text-destructive mx-auto mb-3 lg:mb-4" />
              <h3 className="text-base lg:text-lg font-semibold text-foreground mb-2">
                Error de conexión
              </h3>
              <p className="text-sm text-muted-foreground mb-4 lg:mb-6">
                {error}. Verifica tu conexión a internet e intenta nuevamente.
              </p>
              <Button variant="outline" size="sm" onClick={fetchProjects}>
                <RefreshCw className="w-4 h-4 mr-2" />
                Reintentar
              </Button>
            </div>
          ) : filteredProjects.length === 0 ? (
            <div className="panel p-8 lg:p-12 text-center">
              <Film className="w-10 lg:w-12 h-10 lg:h-12 text-muted-foreground mx-auto mb-3 lg:mb-4" />
              <h3 className="text-base lg:text-lg font-semibold text-foreground mb-2">
                {search ? 'No se encontraron proyectos' : 'No hay proyectos aún'}
              </h3>
              <p className="text-sm text-muted-foreground mb-4 lg:mb-6">
                {search ? 'Intenta con otro término de búsqueda' : 'Crea tu primera producción para comenzar'}
              </p>
              {!search && (
                <Button variant="lime" size="sm" asChild>
                  <Link to="/projects/new">
                    <Plus className="w-4 h-4" />
                    Nuevo Proyecto
                  </Link>
                </Button>
              )}
            </div>
          ) : (
            <div className="grid gap-3">
              {filteredProjects.map((project) => (
                <div key={project.id} className="panel p-4 lg:p-6 hover:bg-card/80 transition-colors group relative active:scale-[0.99]">
                  <Link to={`/projects/${project.id}`} className="absolute inset-0 z-0" />
                  <div className="flex items-center gap-3 lg:gap-4 relative z-10 pointer-events-none">
                    <div className="w-11 lg:w-14 h-11 lg:h-14 rounded-xl bg-gradient-to-br from-primary/20 to-amber-500/20 flex items-center justify-center shrink-0">
                      <Film className="w-5 lg:w-7 h-5 lg:h-7 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 lg:gap-3 mb-0.5 lg:mb-1 flex-wrap">
                        <h3 className="text-sm lg:text-lg font-semibold text-foreground truncate">
                          {project.title}
                        </h3>
                        <Badge variant="outline" className="capitalize text-[10px] lg:text-xs">
                          {getFormatLabel(project.format)}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 lg:gap-4 text-xs lg:text-sm text-muted-foreground">
                        <span>{project.episodes_count} ep{project.episodes_count !== 1 ? 's' : ''}</span>
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 lg:w-3.5 h-3 lg:h-3.5" />
                          {new Date(project.created_at).toLocaleDateString('es-ES', { 
                            month: 'short', 
                            day: 'numeric' 
                          })}
                        </span>
                      </div>
                    </div>
                    <div className="shrink-0 flex items-center gap-2 lg:gap-3">
                      {/* Desktop: Full progress bar */}
                      <div className="text-right hidden lg:block">
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
                      
                      {/* Mobile: Compact percentage */}
                      <div className="lg:hidden text-right">
                        <div className="text-xs font-medium text-foreground">{project.bible_completeness_score}%</div>
                        <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden mt-1">
                          <div 
                            className="h-full bg-primary rounded-full"
                            style={{ width: `${project.bible_completeness_score}%` }}
                          />
                        </div>
                      </div>
                      
                      {project.bible_completeness_score >= 85 ? (
                        <Badge variant="pass" className="hidden lg:inline-flex">Listo</Badge>
                      ) : (
                        <Badge variant="pending" className="hidden lg:inline-flex">En Progreso</Badge>
                      )}
                      
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="pointer-events-auto h-8 w-8 lg:h-10 lg:w-10">
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
                      
                      <ArrowRight className="w-4 lg:w-5 h-4 lg:h-5 text-muted-foreground group-hover:text-foreground transition-colors hidden sm:block" />
                    </div>
                  </div>
                </div>
              ))}

              {/* Delete confirmation dialog */}
              <AlertDialog open={!!deleteDialog} onOpenChange={() => setDeleteDialog(null)}>
                <AlertDialogContent className="max-w-[90vw] lg:max-w-lg">
                  <AlertDialogHeader>
                    <AlertDialogTitle>¿Eliminar proyecto?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Esta acción no se puede deshacer. Se eliminarán todos los datos asociados al proyecto.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter className="flex-col sm:flex-row gap-2">
                    <AlertDialogCancel className="w-full sm:w-auto">Cancelar</AlertDialogCancel>
                    <AlertDialogAction 
                      onClick={() => deleteDialog && handleDeleteProject(deleteDialog)}
                      className="bg-destructive hover:bg-destructive/90 w-full sm:w-auto"
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
