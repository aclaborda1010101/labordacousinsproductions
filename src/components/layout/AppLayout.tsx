import { ReactNode, useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/contexts/LanguageContext';
import { useDeveloperMode } from '@/contexts/DeveloperModeContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LanguageSelector } from '@/components/LanguageSelector';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { TaskNotificationCenter } from '@/components/notifications/TaskNotificationCenter';
import { supabase } from '@/integrations/supabase/client';
import { 
  Film, 
  Home, 
  FolderKanban, 
  Clapperboard,
  Users,
  LogOut,
  Play,
  ChevronRight,
  ChevronDown,
  Menu,
  PanelLeftClose,
  PanelLeft,
  Wrench,
  Plus,
  Folder
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
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [projectsExpanded, setProjectsExpanded] = useState(true);
  const [recentProjects, setRecentProjects] = useState<Project[]>([]);

  // Fetch recent projects for sidebar
  useEffect(() => {
    async function fetchRecentProjects() {
      if (!user) return;
      
      const { data } = await supabase
        .from('projects')
        .select('id, title, format')
        .order('updated_at', { ascending: false })
        .limit(5);
      
      if (data) {
        setRecentProjects(data);
      }
    }
    
    fetchRecentProjects();
  }, [user]);

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
      {/* Logo + Notifications */}
      <div className={cn(
        "h-16 flex items-center border-b border-sidebar-border",
        collapsed && !isMobile ? "px-3 justify-center" : "px-6"
      )}>
        <Link to="/dashboard" className="flex items-center gap-3 group flex-1" onClick={() => isMobile && setMobileOpen(false)}>
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary to-amber-500 flex items-center justify-center shadow-glow flex-shrink-0">
            <Clapperboard className="w-5 h-5 text-primary-foreground" />
          </div>
          {(!collapsed || isMobile) && (
            <div>
              <span className="font-bold text-foreground tracking-tight">CINEFORGE</span>
              <span className="text-xs text-muted-foreground block -mt-0.5">Studio</span>
            </div>
          )}
        </Link>
        {/* Notification bell in desktop sidebar */}
        {!isMobile && <TaskNotificationCenter />}
      </div>

      {/* Developer Mode Badge */}
      {isDeveloperMode && (!collapsed || isMobile) && (
        <div className="px-3 py-2">
          <Badge className="w-full justify-center gap-1 bg-amber-500/20 text-amber-500 border-amber-500/30 hover:bg-amber-500/30">
            <Wrench className="w-3 h-3" />
            Developer Mode
          </Badge>
        </div>
      )}
      {isDeveloperMode && collapsed && !isMobile && (
        <div className="px-2 py-2 flex justify-center">
          <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center" title="Developer Mode Active">
            <Wrench className="w-4 h-4 text-amber-500" />
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
                        <div className="px-3 py-2 text-xs font-medium text-muted-foreground/70 uppercase tracking-wider">
                          Recientes
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

      {/* User section */}
      <div className={cn(
        "p-4 border-t border-sidebar-border",
        collapsed && !isMobile && "px-2"
      )}>
        {(!collapsed || isMobile) && (
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-full bg-sidebar-accent flex items-center justify-center flex-shrink-0">
              <Users className="w-4 h-4 text-sidebar-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">
                {user?.email?.split('@')[0] || 'User'}
              </p>
              <p className="text-xs text-muted-foreground truncate">{t.team.roles.producer}</p>
            </div>
          </div>
        )}
        <div className={cn(
          "flex gap-2",
          collapsed && !isMobile && "flex-col items-center"
        )}>
          {(!collapsed || isMobile) && <LanguageSelector />}
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={handleSignOut} 
            title={t.nav.signOut}
            className={collapsed && !isMobile ? "w-full" : ""}
          >
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-background flex">
      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-14 bg-sidebar border-b border-sidebar-border z-50 flex items-center px-4 gap-3">
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon">
              <Menu className="w-5 h-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 p-0 bg-sidebar border-sidebar-border">
            <div className="flex flex-col h-full">
              <SidebarContent isMobile />
            </div>
          </SheetContent>
        </Sheet>
        <div className="flex items-center gap-2 flex-1">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-amber-500 flex items-center justify-center">
            <Clapperboard className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="font-bold text-foreground text-sm">CINEFORGE</span>
        </div>
        <TaskNotificationCenter />
      </div>

      {/* Desktop Sidebar */}
      <aside className={cn(
        "hidden lg:flex bg-sidebar border-r border-sidebar-border flex-col transition-all duration-300",
        collapsed ? "w-16" : "w-72"
      )}>
        <SidebarContent />
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col overflow-hidden lg:pt-0 pt-14">
        {children}
      </main>
    </div>
  );
}
