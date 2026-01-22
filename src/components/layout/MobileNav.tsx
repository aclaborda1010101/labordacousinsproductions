import { Link, useLocation } from 'react-router-dom';
import { Home, FolderKanban, Play, Plus, Menu } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MobileNavProps {
  onMenuClick: () => void;
}

export function MobileNav({ onMenuClick }: MobileNavProps) {
  const location = useLocation();

  const navItems = [
    { href: '/dashboard', label: 'Inicio', icon: Home },
    { href: '/projects', label: 'Proyectos', icon: FolderKanban },
    { href: '/projects/new', label: 'Nuevo', icon: Plus, isAction: true },
    { href: '/dailies', label: 'Dailies', icon: Play },
  ];

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-sidebar/95 backdrop-blur-lg border-t border-sidebar-border z-50 safe-area-bottom">
      <div className="flex items-center justify-around h-16 px-2">
        {navItems.map((item) => {
          const isActive = location.pathname === item.href || 
            (item.href === '/projects' && location.pathname.startsWith('/projects/') && location.pathname !== '/projects/new');
          const Icon = item.icon;
          
          if (item.isAction) {
            return (
              <Link
                key={item.href}
                to={item.href}
                className="flex flex-col items-center justify-center gap-0.5 -mt-4"
              >
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary to-[hsl(80,100%,40%)] flex items-center justify-center shadow-lg shadow-primary/30">
                  <Icon className="w-5 h-5 text-primary-foreground" />
                </div>
                <span className="text-[10px] text-muted-foreground mt-1">{item.label}</span>
              </Link>
            );
          }
          
          return (
            <Link
              key={item.href}
              to={item.href}
              className={cn(
                "flex flex-col items-center justify-center gap-1 py-2 px-3 rounded-lg transition-colors min-w-[60px]",
                isActive 
                  ? "text-primary" 
                  : "text-muted-foreground active:text-foreground"
              )}
            >
              <Icon className={cn("w-5 h-5", isActive && "stroke-[2.5px]")} />
              <span className={cn("text-[10px]", isActive && "font-medium")}>{item.label}</span>
            </Link>
          );
        })}
        
        {/* Menu button */}
        <button
          onClick={onMenuClick}
          className="flex flex-col items-center justify-center gap-1 py-2 px-3 rounded-lg text-muted-foreground active:text-foreground min-w-[60px]"
        >
          <Menu className="w-5 h-5" />
          <span className="text-[10px]">Menú</span>
        </button>
      </div>
    </nav>
  );
}
