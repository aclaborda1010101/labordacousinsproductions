import { ReactNode, useState, useEffect, useRef, useCallback } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/contexts/LanguageContext';
import { useDeveloperMode } from '@/contexts/DeveloperModeContext';
import { useBackgroundTasks } from '@/contexts/BackgroundTasksContext';
import { useBackendStatus } from '@/hooks/useBackendStatus';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LanguageSelector } from '@/components/LanguageSelector';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { TaskNotificationCenter } from '@/components/notifications/TaskNotificationCenter';
import { BackendStatusBanner } from './BackendStatusBanner';
import { MobileNav } from './MobileNav';
import { supabase } from '@/integrations/supabase/client';
import { 
  Film, 
  Home, 
  FolderKanban, 
  Users,
  LogOut,
  Play,
  ChevronRight,
  ChevronDown,
  PanelLeftClose,
  PanelLeft,
  Wrench,
  Plus,
  Folder,
  X,
  Settings,
  Loader2,
  RefreshCw,
  Zap
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface AppLayoutProps {
  children: ReactNode;
}

interface Project {
  id: string;
  title: string;
  format: string;
}

export function AppLayout({ children }: AppLayoutProps) {
  const { user, signOut } = useAuth();
  const { t } = useLanguage();
  const { isDeveloperMode } = useDeveloperMode();
  const { activeTasks, setIsOpen: setTasksOpen } = useBackgroundTasks();
  const { status: backendStatus, lastError, isChecking, retry: retryBackend } = useBackendStatus();
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [projectsExpanded, setProjectsExpanded] = useState(true);
  const [recentProjects, setRecentProjects] = useState<Project[]>([]);
  const [recentProjectsError, setRecentProjectsError] = useState(false);
  const lastKnownProjectsRef = useRef<Project[]>([]);

  // Fetch recent projects for sidebar with error handling
  const fetchRecentProjects = useCallback(async () => {
    if (!user) return;
    
    try {
      const { data, error } = await supabase
        .from('projects')
        .select('id, title, format')
        .order('updated_at', { ascending: false })
        .limit(5);
      
      if (error) throw error;
      
      if (data) {
        setRecentProjects(data);
        lastKnownProjectsRef.current = data;
        setRecentProjectsError(false);
      }
    } catch (err) {
      console.error('Error fetching recent projects:', err);
      setRecentProjectsError(true);
      // Keep showing last known projects
      if (lastKnownProjectsRef.current.length > 0) {
        setRecentProjects(lastKnownProjectsRef.current);
      }
    }
  }, [user]);

  useEffect(() => {
    fetchRecentProjects();
  }, [fetchRecentProjects]);

  const navItems = [
    { href: '/dashboard', label: t.nav.dashboard, icon: Home },
    { href: '/projects', label: t.nav.projects, icon: FolderKanban, hasChildren: true },
    { href: '/dailies', label: t.nav.dailies, icon: Play },
  ];

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  const SidebarContent = ({ isMobile = false }: { isMobile?: boolean }) => (
    <>
      {/* Logo ManIAS Lab */}
      <div className={cn(
        "h-16 flex items-center border-b border-sidebar-border",
        collapsed && !isMobile ? "px-3 justify-center" : "px-4 lg:px-5"
      )}>
        <Link to="/dashboard" className="flex items-center gap-3 group flex-1" onClick={() => isMobile && setMobileOpen(false)}>
          <img 
            src="/MANIAS.png" 
            alt="ManIAS Lab" 
            className="w-10 h-10 rounded-xl object-contain flex-shrink-0"
          />
          {(!collapsed || isMobile) && (
            <div className="flex flex-col">
              <span className="font-bold text-foreground tracking-tight text-base leading-none">ManIAS</span>
              <span className="text-[10px] text-primary font-medium tracking-widest">LAB.</span>
            </div>
          )}
        </Link>
        
        {/* Mobile close button */}
        {isMobile && (
          <button 
            onClick={() => setMobileOpen(false)}
            className="p-2 rounded-lg hover:bg-sidebar-accent transition-colors"
          >
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        )}
        
        {/* Desktop notifications */}
        {!isMobile && !collapsed && <TaskNotificationCenter />}
      </div>

      {/* Developer Mode Badge */}
      {isDeveloperMode && (!collapsed || isMobile) && (
        <div className="px-3 py-2">
          <Badge className="w-full justify-center gap-1 bg-primary/20 text-primary border-primary/30 hover:bg-primary/30 text-xs">
            <Wrench className="w-3 h-3" />
            Developer Mode
          </Badge>
        </div>
      )}
      {isDeveloperMode && collapsed && !isMobile && (
        <div className="px-2 py-2 flex justify-center">
          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center" title="Developer Mode Active">
            <Wrench className="w-4 h-4 text-primary" />
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = location.pathname === item.href || 
            (item.hasChildren && location.pathname.startsWith('/projects'));
          const Icon = item.icon;
          
          if (item.hasChildren && (!collapsed || isMobile)) {
            return (
              <div key={item.href} className="space-y-0.5">
                <button
                  onClick={() => setProjectsExpanded(!projectsExpanded)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                    isActive 
                      ? "bg-sidebar-accent text-sidebar-accent-foreground" 
                      : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
                  )}
                >
                  <Icon className="w-5 h-5 flex-shrink-0" />
                  <span className="flex-1 text-left">{item.label}</span>
                  {projectsExpanded ? (
                    <ChevronDown className="w-4 h-4 transition-transform" />
                  ) : (
                    <ChevronRight className="w-4 h-4 transition-transform" />
                  )}
                </button>
                
                {/* Submenu - Collapsible */}
                <div className={cn(
                  "overflow-hidden transition-all duration-200",
                  projectsExpanded ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
                )}>
                  <div className="ml-4 pl-4 border-l border-sidebar-border/50 space-y-0.5 py-1">
                    <Link
                      to="/projects"
                      onClick={() => isMobile && setMobileOpen(false)}
                      className={cn(
                        "flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors",
                        location.pathname === '/projects'
                          ? "bg-sidebar-accent/60 text-sidebar-accent-foreground"
                          : "text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent/30"
                      )}
                    >
                      <Folder className="w-4 h-4" />
                      Ver todos
                    </Link>
                    <Link
                      to="/projects/new"
                      onClick={() => isMobile && setMobileOpen(false)}
                      className={cn(
                        "flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors",
                        location.pathname === '/projects/new'
                          ? "bg-sidebar-accent/60 text-sidebar-accent-foreground"
                          : "text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent/30"
                      )}
                    >
                      <Plus className="w-4 h-4" />
                      Nuevo proyecto
                    </Link>
                    
                    {/* Recent Projects */}
                    {recentProjects.length > 0 && (
                      <>
                        <div className="px-3 py-2 text-xs font-medium text-muted-foreground/70 uppercase tracking-wider flex items-center justify-between">
                          <span>Recientes {recentProjectsError && '(offline)'}</span>
                          {recentProjectsError && (
                            <button 
                              onClick={(e) => { e.preventDefault(); fetchRecentProjects(); }}
                              className="p-1 hover:bg-sidebar-accent/50 rounded"
                              title="Reintentar"
                            >
                              <RefreshCw className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                        {recentProjects.map((project) => (
                          <Link
                            key={project.id}
                            to={`/projects/${project.id}`}
                            onClick={() => isMobile && setMobileOpen(false)}
                            className={cn(
                              "flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors group",
                              location.pathname === `/projects/${project.id}`
                                ? "bg-sidebar-accent/60 text-sidebar-accent-foreground"
                                : "text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent/30"
                            )}
                          >
                            <Film className="w-4 h-4 flex-shrink-0" />
                            <span className="truncate flex-1">{project.title}</span>
                          </Link>
                        ))}
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          }
          
          // Collapsed state for projects
          if (item.hasChildren && collapsed && !isMobile) {
            return (
              <Link
                key={item.href}
                to={item.href}
                className={cn(
                  "flex items-center justify-center px-2 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                  isActive 
                    ? "bg-sidebar-accent text-sidebar-accent-foreground" 
                    : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
                )}
                title={item.label}
              >
                <Icon className="w-5 h-5" />
              </Link>
            );
          }
          
          return (
            <Link
              key={item.href}
              to={item.href}
              onClick={() => isMobile && setMobileOpen(false)}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                isActive 
                  ? "bg-sidebar-accent text-sidebar-accent-foreground" 
                  : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground",
                collapsed && !isMobile && "justify-center px-2"
              )}
              title={collapsed && !isMobile ? item.label : undefined}
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              {(!collapsed || isMobile) && <span>{item.label}</span>}
              {isActive && (!collapsed || isMobile) && !item.hasChildren && <ChevronRight className="w-4 h-4 ml-auto opacity-50" />}
            </Link>
          );
        })}
      </nav>

      {/* Mobile Quick Actions */}
      {isMobile && (
        <div className="px-3 py-2 border-t border-sidebar-border">
          <Link
            to="/projects/new"
            onClick={() => setMobileOpen(false)}
            className="flex items-center gap-3 px-3 py-3 rounded-lg bg-gradient-to-r from-primary/10 to-[hsl(80,100%,40%)]/10 border border-primary/20 text-foreground"
          >
            <div className="w-9 h-9 rounded-lg bg-primary/20 flex items-center justify-center">
              <Plus className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1">
              <div className="font-medium text-sm">Nuevo Proyecto</div>
              <div className="text-xs text-muted-foreground">Crear producción</div>
            </div>
          </Link>
        </div>
      )}

      {/* Collapse toggle (desktop only) */}
      {!isMobile && (
        <div className="px-3 py-2 border-t border-sidebar-border">
          <Button
            variant="ghost"
            size="sm"
            className={cn("w-full", collapsed ? "justify-center px-2" : "justify-start")}
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? (
              <PanelLeft className="w-4 h-4" />
            ) : (
              <>
                <PanelLeftClose className="w-4 h-4 mr-2" />
                <span>Colapsar</span>
              </>
            )}
          </Button>
        </div>
      )}

      {/* Footer section - Language + Logout + User */}
      <div className={cn(
        "border-t border-sidebar-border",
        collapsed && !isMobile && "px-2"
      )}>
        {/* Language selector */}
        {(!collapsed || isMobile) && (
          <div className="px-3 py-2">
            <LanguageSelector />
          </div>
        )}
        
        {/* Separator */}
        <div className="border-t border-sidebar-border/50" />
        
        {/* Logout button - Separate and clear */}
        <div className={cn("px-3 py-2", collapsed && !isMobile && "px-2")}>
          <Button 
            variant="ghost" 
            onClick={handleSignOut} 
            title={t.nav.signOut}
            className={cn(
              "w-full justify-start gap-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10",
              collapsed && !isMobile && "justify-center px-2"
            )}
          >
            <LogOut className="w-4 h-4" />
            {(!collapsed || isMobile) && <span>Cerrar sesión</span>}
          </Button>
        </div>
        
        {/* Separator */}
        <div className="border-t border-sidebar-border/50" />
        
        {/* User profile */}
        <div className={cn(
          "p-3 flex items-center gap-3",
          collapsed && !isMobile && "flex-col px-2"
        )}>
          <div className="w-9 h-9 rounded-full bg-sidebar-accent flex items-center justify-center flex-shrink-0">
            <Users className="w-4 h-4 text-sidebar-foreground" />
          </div>
          {(!collapsed || isMobile) && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">
                {user?.email?.split('@')[0] || 'User'}
              </p>
              <p className="text-xs text-muted-foreground truncate">{t.team.roles.producer}</p>
            </div>
          )}
        </div>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-background flex flex-col lg:flex-row">
      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-14 bg-sidebar/95 backdrop-blur-lg border-b border-sidebar-border z-50 flex items-center px-4 gap-3">
        <Link to="/dashboard" className="flex items-center gap-2 flex-1">
          <img 
            src="/MANIAS.png" 
            alt="ManIAS Lab" 
            className="w-8 h-8 rounded-lg object-contain"
          />
          <div className="flex flex-col">
            <span className="font-bold text-foreground text-sm leading-none">ManIAS</span>
            <span className="text-[8px] text-primary font-medium tracking-widest">LAB.</span>
          </div>
        </Link>
        <TaskNotificationCenter />
      </div>

      {/* Mobile Sheet Menu */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-[85%] max-w-[320px] p-0 bg-sidebar border-sidebar-border">
          <div className="flex flex-col h-full">
            <SidebarContent isMobile />
          </div>
        </SheetContent>
      </Sheet>

      {/* Desktop Sidebar */}
      <aside className={cn(
        "hidden lg:flex bg-sidebar border-r border-sidebar-border flex-col transition-all duration-300 fixed left-0 top-0 bottom-0",
        collapsed ? "w-16" : "w-72"
      )}>
        <SidebarContent />
      </aside>

      {/* Main content */}
      <main className={cn(
        "flex-1 flex flex-col overflow-hidden",
        "pt-14 pb-16 lg:pt-0 lg:pb-0", // Mobile: header + bottom nav space
        collapsed ? "lg:ml-16" : "lg:ml-72"
      )}>
        {/* Backend Status Banner */}
        <BackendStatusBanner 
          status={backendStatus} 
          lastError={lastError} 
          isChecking={isChecking} 
          onRetry={retryBackend} 
        />

        {/* Active Background Tasks Banner */}
        {activeTasks.length > 0 && (
          <button
            onClick={() => setTasksOpen(true)}
            className="flex items-center justify-center gap-2 bg-primary/10 text-primary px-4 py-2 text-sm hover:bg-primary/15 transition-colors cursor-pointer border-b border-primary/20"
          >
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span className="font-medium">
              {activeTasks.length} proceso{activeTasks.length > 1 ? 's' : ''} en marcha
            </span>
            <span className="text-primary/70 hidden sm:inline">
              — Puedes navegar libremente
            </span>
          </button>
        )}

        <div className="flex-1 overflow-auto">
          {children}
        </div>
      </main>

      {/* Mobile Bottom Navigation */}
      <MobileNav onMenuClick={() => setMobileOpen(true)} />
    </div>
  );
}
