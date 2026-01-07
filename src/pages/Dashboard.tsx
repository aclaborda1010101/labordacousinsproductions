import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/contexts/LanguageContext';
import { useUserProfileOptional } from '@/contexts/UserProfileContext';
import { ProfileOnboardingModal } from '@/components/onboarding/ProfileOnboardingModal';
import { 
  Plus, 
  Film, 
  Clock, 
  CheckCircle2, 
  AlertCircle,
  TrendingUp,
  Clapperboard,
  Sparkles,
  ArrowRight,
  Users,
  Layers,
  Zap,
  Target,
  BarChart3,
  Calendar,
  Play,
  FolderKanban,
  ChevronRight
} from 'lucide-react';

interface Project {
  id: string;
  title: string;
  format: string;
  episodes_count: number;
  bible_completeness_score: number;
  created_at: string;
  updated_at: string;
}

interface DashboardStats {
  totalProjects: number;
  totalCharacters: number;
  totalLocations: number;
  pendingRenders: number;
  completedShots: number;
  qcIssues: number;
}

export default function Dashboard() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const profileContext = useUserProfileOptional();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats>({
    totalProjects: 0,
    totalCharacters: 0,
    totalLocations: 0,
    pendingRenders: 0,
    completedShots: 0,
    qcIssues: 0,
  });

  const needsOnboarding = profileContext?.needsOnboarding ?? false;
  const completeOnboarding = profileContext?.completeOnboarding;
  const setDeclaredProfile = profileContext?.setDeclaredProfile;

  useEffect(() => {
    async function fetchDashboardData() {
      if (!user) return;
      
      // Fetch projects
      const { data: projectsData } = await supabase
        .from('projects')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(6);
      
      if (projectsData) {
        setProjects(projectsData);
      }

      // Fetch stats
      const [charactersRes, locationsRes, shotsRes] = await Promise.all([
        supabase.from('characters').select('id', { count: 'exact', head: true }),
        supabase.from('locations').select('id', { count: 'exact', head: true }),
        supabase.from('shots').select('id', { count: 'exact', head: true }),
      ]);

      setStats({
        totalProjects: projectsData?.length || 0,
        totalCharacters: charactersRes.count || 0,
        totalLocations: locationsRes.count || 0,
        pendingRenders: 0,
        completedShots: shotsRes.count || 0,
        qcIssues: 0,
      });
      
      setLoading(false);
    }
    
    fetchDashboardData();
  }, [user]);

  const statCards = [
    { 
      label: t.dashboard.activeProjects, 
      value: stats.totalProjects, 
      icon: Film,
      color: 'from-primary/20 to-amber-500/20',
      iconColor: 'text-primary',
      trend: '+2 este mes'
    },
    { 
      label: 'Personajes', 
      value: stats.totalCharacters, 
      icon: Users,
      color: 'from-blue-500/20 to-cyan-500/20',
      iconColor: 'text-blue-400',
      trend: 'Total creados'
    },
    { 
      label: 'Locaciones', 
      value: stats.totalLocations, 
      icon: Layers,
      color: 'from-emerald-500/20 to-teal-500/20',
      iconColor: 'text-emerald-400',
      trend: 'Total creadas'
    },
    { 
      label: 'Shots Listos', 
      value: stats.completedShots, 
      icon: CheckCircle2,
      color: 'from-qc-pass/20 to-green-500/20',
      iconColor: 'text-qc-pass',
      trend: 'Aprobados'
    },
  ];

  const getFormatBadge = (format: string) => {
    const formats: Record<string, { label: string; variant: 'default' | 'outline' | 'secondary' }> = {
      short: { label: 'Corto', variant: 'secondary' },
      feature: { label: 'Largometraje', variant: 'default' },
      series: { label: 'Serie', variant: 'outline' },
      pilot: { label: 'Piloto', variant: 'secondary' },
    };
    return formats[format] || { label: format, variant: 'outline' as const };
  };

  const getTimeAgo = (date: string) => {
    const now = new Date();
    const updated = new Date(date);
    const diffMs = now.getTime() - updated.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) return `Hace ${diffMins}m`;
    if (diffHours < 24) return `Hace ${diffHours}h`;
    return `Hace ${diffDays}d`;
  };

  return (
    <AppLayout>
      {/* Onboarding modal for new users */}
      {needsOnboarding && completeOnboarding && (
        <ProfileOnboardingModal
          open={needsOnboarding}
          onComplete={completeOnboarding}
          onSkip={() => setDeclaredProfile?.('CREATOR')}
          showSkip={true}
        />
      )}

      <PageHeader title={t.dashboard.title} description={t.dashboard.subtitle}>
        <Button variant="gold" size="sm" asChild className="hidden sm:inline-flex">
          <Link to="/projects/new">
            <Plus className="w-4 h-4" />
            {t.projects.newProject}
          </Link>
        </Button>
      </PageHeader>

      <div className="flex-1 overflow-auto">
        <div className="max-w-7xl mx-auto p-4 lg:p-6 space-y-4 lg:space-y-6">
          
          {/* Stats Grid - Responsive */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
            {statCards.map((stat) => {
              const Icon = stat.icon;
              return (
                <div 
                  key={stat.label} 
                  className="relative overflow-hidden rounded-xl bg-card border border-border/50 p-3 lg:p-5 group hover:border-primary/30 transition-all duration-300"
                >
                  {/* Background gradient */}
                  <div className={`absolute inset-0 bg-gradient-to-br ${stat.color} opacity-50`} />
                  
                  <div className="relative">
                    <div className="flex items-center justify-between mb-2 lg:mb-3">
                      <div className={`w-8 lg:w-10 h-8 lg:h-10 rounded-lg bg-gradient-to-br ${stat.color} flex items-center justify-center`}>
                        <Icon className={`w-4 lg:w-5 h-4 lg:h-5 ${stat.iconColor}`} />
                      </div>
                      <TrendingUp className="w-3 lg:w-4 h-3 lg:h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity hidden lg:block" />
                    </div>
                    <div className="text-2xl lg:text-3xl font-bold text-foreground mb-0.5 lg:mb-1">{stat.value}</div>
                    <div className="text-xs lg:text-sm text-muted-foreground truncate">{stat.label}</div>
                    <div className="text-[10px] lg:text-xs text-muted-foreground/70 mt-0.5 lg:mt-1 hidden sm:block">{stat.trend}</div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Main Content - Stack on mobile, grid on desktop */}
          <div className="grid lg:grid-cols-3 gap-4 lg:gap-6">
            
            {/* Projects Section */}
            <div className="lg:col-span-2 space-y-3 lg:space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 lg:gap-3">
                  <div className="w-7 lg:w-8 h-7 lg:h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <FolderKanban className="w-3.5 lg:w-4 h-3.5 lg:h-4 text-primary" />
                  </div>
                  <h2 className="text-base lg:text-lg font-semibold text-foreground">{t.dashboard.recentProjects}</h2>
                </div>
                <Button variant="ghost" size="sm" asChild className="text-muted-foreground hover:text-foreground text-xs lg:text-sm">
                  <Link to="/projects">
                    {t.dashboard.viewAll}
                    <ArrowRight className="w-3.5 lg:w-4 h-3.5 lg:h-4 ml-1" />
                  </Link>
                </Button>
              </div>

              {loading ? (
                <div className="grid gap-2 lg:gap-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-16 lg:h-20 rounded-xl bg-card/50 shimmer" />
                  ))}
                </div>
              ) : projects.length === 0 ? (
                <div className="rounded-xl bg-card border border-border/50 p-6 lg:p-10 text-center">
                  <div className="w-12 lg:w-16 h-12 lg:h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-amber-500/20 flex items-center justify-center mx-auto mb-3 lg:mb-4">
                    <Sparkles className="w-6 lg:w-8 h-6 lg:h-8 text-primary" />
                  </div>
                  <h3 className="text-base lg:text-lg font-semibold text-foreground mb-2">
                    {t.dashboard.createFirst}
                  </h3>
                  <p className="text-muted-foreground mb-4 lg:mb-6 max-w-md mx-auto text-xs lg:text-sm">
                    {t.dashboard.createFirstDesc}
                  </p>
                  <Button variant="gold" size="sm" asChild>
                    <Link to="/projects/new">
                      <Plus className="w-4 h-4" />
                      {t.projects.newProject}
                    </Link>
                  </Button>
                </div>
              ) : (
                <div className="grid gap-2 lg:gap-3">
                  {projects.map((project) => {
                    const formatInfo = getFormatBadge(project.format);
                    return (
                      <Link
                        key={project.id}
                        to={`/projects/${project.id}`}
                        className="group rounded-xl bg-card border border-border/50 p-3 lg:p-4 hover:border-primary/30 hover:bg-card/80 transition-all duration-300 active:scale-[0.98]"
                      >
                        <div className="flex items-center gap-3 lg:gap-4">
                          <div className="w-10 lg:w-12 h-10 lg:h-12 rounded-xl bg-gradient-to-br from-primary/20 to-amber-500/20 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                            <Film className="w-5 lg:w-6 h-5 lg:h-6 text-primary" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5 lg:mb-1">
                              <h3 className="font-semibold text-sm lg:text-base text-foreground truncate group-hover:text-primary transition-colors">
                                {project.title}
                              </h3>
                              <Badge variant={formatInfo.variant} className="capitalize shrink-0 text-[10px] lg:text-xs">
                                {formatInfo.label}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-3 lg:gap-4 text-xs lg:text-sm text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Layers className="w-3 lg:w-3.5 h-3 lg:h-3.5" />
                                {project.episodes_count} eps
                              </span>
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 lg:w-3.5 h-3 lg:h-3.5" />
                                {getTimeAgo(project.updated_at)}
                              </span>
                            </div>
                          </div>
                          <div className="shrink-0 flex items-center gap-2 lg:gap-3">
                            <div className="text-right hidden sm:block">
                              <div className="text-xs lg:text-sm font-medium text-foreground">{project.bible_completeness_score}%</div>
                              <Progress value={project.bible_completeness_score} className="w-16 lg:w-20 h-1 lg:h-1.5 mt-1" />
                            </div>
                            {/* Mobile: Show only percentage */}
                            <div className="sm:hidden text-xs font-medium text-muted-foreground">
                              {project.bible_completeness_score}%
                            </div>
                            <ArrowRight className="w-4 lg:w-5 h-4 lg:h-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Right Column - Quick Actions (hidden on mobile, actions are in bottom nav) */}
            <div className="hidden lg:block space-y-6">
              
              {/* Quick Actions */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-primary" />
                  <h3 className="font-semibold text-foreground">{t.dashboard.quickActions}</h3>
                </div>
                
                <div className="space-y-2">
                  <Link
                    to="/projects/new"
                    className="flex items-center gap-3 p-3 rounded-lg bg-card border border-border/50 hover:border-primary/30 hover:bg-card/80 transition-all group"
                  >
                    <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                      <Plus className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1">
                      <div className="font-medium text-sm text-foreground">Nuevo Proyecto</div>
                      <div className="text-xs text-muted-foreground">Crear desde cero o plantilla</div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                  </Link>

                  <button className="w-full flex items-center gap-3 p-3 rounded-lg bg-card border border-border/50 hover:border-primary/30 hover:bg-card/80 transition-all group">
                    <div className="w-9 h-9 rounded-lg bg-blue-500/10 flex items-center justify-center group-hover:bg-blue-500/20 transition-colors">
                      <Film className="w-4 h-4 text-blue-400" />
                    </div>
                    <div className="flex-1 text-left">
                      <div className="font-medium text-sm text-foreground">{t.dashboard.importScript}</div>
                      <div className="text-xs text-muted-foreground">PDF, Fountain, FDX</div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                  </button>

                  <Link
                    to="/dailies"
                    className="flex items-center gap-3 p-3 rounded-lg bg-card border border-border/50 hover:border-primary/30 hover:bg-card/80 transition-all group"
                  >
                    <div className="w-9 h-9 rounded-lg bg-qc-pass/10 flex items-center justify-center group-hover:bg-qc-pass/20 transition-colors">
                      <Play className="w-4 h-4 text-qc-pass" />
                    </div>
                    <div className="flex-1">
                      <div className="font-medium text-sm text-foreground">{t.dashboard.reviewDailies}</div>
                      <div className="text-xs text-muted-foreground">Revisar renders pendientes</div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                  </Link>

                  <button className="w-full flex items-center gap-3 p-3 rounded-lg bg-card border border-border/50 hover:border-primary/30 hover:bg-card/80 transition-all group">
                    <div className="w-9 h-9 rounded-lg bg-amber-500/10 flex items-center justify-center group-hover:bg-amber-500/20 transition-colors">
                      <Sparkles className="w-4 h-4 text-amber-400" />
                    </div>
                    <div className="flex-1 text-left">
                      <div className="font-medium text-sm text-foreground">{t.dashboard.sosAssistant}</div>
                      <div className="text-xs text-muted-foreground">Ayuda con IA</div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                  </button>
                </div>
              </div>

              {/* Production Tips */}
              <div className="rounded-xl bg-gradient-to-br from-primary/5 to-amber-500/5 border border-primary/20 p-4">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Target className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <h4 className="font-medium text-foreground text-sm mb-1">Consejo del día</h4>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Define primero tus personajes principales con Visual DNA antes de generar escenas. 
                      Esto garantiza consistencia visual en todo tu proyecto.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Mobile Tip Card - Shown only on small screens */}
          <div className="lg:hidden rounded-xl bg-gradient-to-br from-primary/5 to-amber-500/5 border border-primary/20 p-3">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Target className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="font-medium text-foreground text-sm mb-0.5">Consejo</h4>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Define tus personajes con Visual DNA antes de generar escenas.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
