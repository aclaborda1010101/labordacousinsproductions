import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Bell, Check, X, Users, FileText, Clapperboard, CheckSquare, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface Notification {
  id: string;
  type: 'character_added' | 'scene_updated' | 'render_completed' | 'approval_needed' | 'comment_added' | 'decision_made';
  title: string;
  message: string;
  projectId: string;
  entityId?: string;
  entityType?: string;
  userId: string;
  userName: string;
  read: boolean;
  createdAt: string;
}

interface NotificationCenterProps {
  projectId: string;
}

const NOTIFICATION_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  character_added: Users,
  scene_updated: Clapperboard,
  render_completed: Eye,
  approval_needed: CheckSquare,
  comment_added: FileText,
  decision_made: Check,
};

export function NotificationCenter({ projectId }: NotificationCenterProps) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  
  const unreadCount = notifications.filter(n => !n.read).length;

  useEffect(() => {
    if (!user) return;

    // Subscribe to realtime changes on decisions_log
    const channel = supabase
      .channel(`notifications-${projectId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'decisions_log',
          filter: `project_id=eq.${projectId}`,
        },
        async (payload) => {
          const decision = payload.new as any;
          
          // Don't notify for own actions
          if (decision.user_id === user.id) return;
          
          // Fetch user name
          const { data: profile } = await supabase
            .from('profiles')
            .select('display_name')
            .eq('user_id', decision.user_id)
            .single();
          
          const userName = profile?.display_name || 'Un miembro del equipo';
          
          const notification: Notification = {
            id: decision.id,
            type: mapActionToType(decision.action),
            title: getNotificationTitle(decision.action, decision.entity_type),
            message: `${userName} ${getActionVerb(decision.action)} ${decision.entity_type}`,
            projectId: decision.project_id,
            entityId: decision.entity_id,
            entityType: decision.entity_type,
            userId: decision.user_id,
            userName,
            read: false,
            createdAt: decision.created_at,
          };
          
          setNotifications(prev => [notification, ...prev]);
          
          // Show toast notification
          toast(notification.title, {
            description: notification.message,
            duration: 5000,
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'comments',
          filter: `project_id=eq.${projectId}`,
        },
        async (payload) => {
          const comment = payload.new as any;
          
          if (comment.author_id === user.id) return;
          
          const { data: profile } = await supabase
            .from('profiles')
            .select('display_name')
            .eq('user_id', comment.author_id)
            .single();
          
          const userName = profile?.display_name || 'Un miembro del equipo';
          
          const notification: Notification = {
            id: comment.id,
            type: 'comment_added',
            title: 'Nuevo comentario',
            message: `${userName} comentó en ${comment.entity_type}`,
            projectId: comment.project_id,
            entityId: comment.entity_id,
            entityType: comment.entity_type,
            userId: comment.author_id,
            userName,
            read: false,
            createdAt: comment.created_at,
          };
          
          setNotifications(prev => [notification, ...prev]);
          
          toast(notification.title, {
            description: notification.message,
            duration: 5000,
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, projectId]);

  const mapActionToType = (action: string): Notification['type'] => {
    if (action.includes('create') || action.includes('add')) return 'character_added';
    if (action.includes('update') || action.includes('edit')) return 'scene_updated';
    if (action.includes('render') || action.includes('complete')) return 'render_completed';
    if (action.includes('approve') || action.includes('reject')) return 'approval_needed';
    if (action.includes('decide') || action.includes('select')) return 'decision_made';
    return 'scene_updated';
  };

  const getNotificationTitle = (action: string, entityType: string): string => {
    if (action.includes('create')) return `Nuevo ${entityType} creado`;
    if (action.includes('update')) return `${entityType} actualizado`;
    if (action.includes('delete')) return `${entityType} eliminado`;
    if (action.includes('approve')) return `${entityType} aprobado`;
    if (action.includes('reject')) return `${entityType} rechazado`;
    return `Cambio en ${entityType}`;
  };

  const getActionVerb = (action: string): string => {
    if (action.includes('create')) return 'creó';
    if (action.includes('update')) return 'actualizó';
    if (action.includes('delete')) return 'eliminó';
    if (action.includes('approve')) return 'aprobó';
    if (action.includes('reject')) return 'rechazó';
    return 'modificó';
  };

  const markAsRead = (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  const markAllAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const clearAll = () => {
    setNotifications([]);
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Ahora';
    if (diffMins < 60) return `Hace ${diffMins}m`;
    if (diffMins < 1440) return `Hace ${Math.floor(diffMins / 60)}h`;
    return date.toLocaleDateString('es-ES');
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <Badge 
              className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center text-xs"
              variant="destructive"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </Badge>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-96">
        <SheetHeader>
          <div className="flex items-center justify-between">
            <SheetTitle className="flex items-center gap-2">
              <Bell className="w-5 h-5" />
              Notificaciones
            </SheetTitle>
            {notifications.length > 0 && (
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" onClick={markAllAsRead}>
                  <Check className="w-4 h-4 mr-1" />
                  Marcar leídas
                </Button>
                <Button variant="ghost" size="sm" onClick={clearAll}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            )}
          </div>
        </SheetHeader>
        
        <ScrollArea className="h-[calc(100vh-100px)] mt-4">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Bell className="w-12 h-12 mb-4 opacity-50" />
              <p className="text-sm">Sin notificaciones</p>
              <p className="text-xs">Los cambios del equipo aparecerán aquí</p>
            </div>
          ) : (
            <div className="space-y-2">
              {notifications.map((notification) => {
                const Icon = NOTIFICATION_ICONS[notification.type] || Bell;
                return (
                  <button
                    key={notification.id}
                    onClick={() => markAsRead(notification.id)}
                    className={cn(
                      "w-full text-left p-3 rounded-lg transition-colors",
                      notification.read 
                        ? "bg-muted/30 hover:bg-muted/50" 
                        : "bg-primary/5 hover:bg-primary/10 border-l-2 border-primary"
                    )}
                  >
                    <div className="flex gap-3">
                      <div className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
                        notification.read ? "bg-muted" : "bg-primary/10"
                      )}>
                        <Icon className={cn("w-4 h-4", notification.read ? "text-muted-foreground" : "text-primary")} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className={cn(
                            "text-sm font-medium truncate",
                            notification.read ? "text-muted-foreground" : "text-foreground"
                          )}>
                            {notification.title}
                          </p>
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            {formatTime(notification.createdAt)}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                          {notification.message}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
