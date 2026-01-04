import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface UserPresence {
  id: string;
  name: string;
  color: string;
  section: string;
  cursor?: { x: number; y: number };
  online_at: string;
}

interface RealtimeCollaborationProps {
  projectId: string;
  currentSection: string;
}

const COLORS = [
  '#f87171', '#fb923c', '#fbbf24', '#a3e635', 
  '#34d399', '#22d3ee', '#60a5fa', '#a78bfa', 
  '#f472b6', '#fb7185'
];

function getColorForUser(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return COLORS[Math.abs(hash) % COLORS.length];
}

export default function RealtimeCollaboration({ projectId, currentSection }: RealtimeCollaborationProps) {
  const { user } = useAuth();
  const [users, setUsers] = useState<UserPresence[]>([]);
  const [cursorPositions, setCursorPositions] = useState<Record<string, { x: number; y: number }>>({});

  useEffect(() => {
    if (!user) return;

    const channel = supabase.channel(`project-${projectId}`);

    // Track presence
    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const presenceUsers: UserPresence[] = [];
        
        Object.keys(state).forEach(key => {
          const presences = state[key] as any[];
          presences.forEach(presence => {
            if (presence.id !== user.id) {
              presenceUsers.push(presence);
            }
          });
        });
        
        setUsers(presenceUsers);
      })
      .on('presence', { event: 'join' }, ({ key, newPresences }) => {
        console.log('User joined:', newPresences);
      })
      .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
        console.log('User left:', leftPresences);
        // Remove cursor for users who left
        const leftIds = leftPresences.map((p: any) => p.id);
        setCursorPositions(prev => {
          const next = { ...prev };
          leftIds.forEach((id: string) => delete next[id]);
          return next;
        });
      })
      .on('broadcast', { event: 'cursor' }, ({ payload }) => {
        if (payload.userId !== user.id) {
          setCursorPositions(prev => ({
            ...prev,
            [payload.userId]: { x: payload.x, y: payload.y }
          }));
        }
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            id: user.id,
            name: user.email?.split('@')[0] || 'User',
            color: getColorForUser(user.id),
            section: currentSection,
            online_at: new Date().toISOString(),
          });
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, projectId]);

  // Update section when it changes
  useEffect(() => {
    if (!user) return;

    const channel = supabase.channel(`project-${projectId}`);
    channel.track({
      id: user.id,
      name: user.email?.split('@')[0] || 'User',
      color: getColorForUser(user.id),
      section: currentSection,
      online_at: new Date().toISOString(),
    });
  }, [currentSection, user, projectId]);

  // Broadcast cursor position
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!user) return;

    const channel = supabase.channel(`project-${projectId}`);
    channel.send({
      type: 'broadcast',
      event: 'cursor',
      payload: {
        userId: user.id,
        x: e.clientX,
        y: e.clientY,
      }
    });
  }, [user, projectId]);

  useEffect(() => {
    // Throttle mouse move events
    let lastSent = 0;
    const throttledHandler = (e: MouseEvent) => {
      const now = Date.now();
      if (now - lastSent > 50) { // 20fps
        lastSent = now;
        handleMouseMove(e);
      }
    };

    window.addEventListener('mousemove', throttledHandler);
    return () => window.removeEventListener('mousemove', throttledHandler);
  }, [handleMouseMove]);

  return (
    <>
      {/* Active users indicator */}
      <div className="fixed bottom-20 sm:bottom-4 right-20 z-40 hidden">
        <TooltipProvider>
          <div className="flex items-center gap-1 p-2 rounded-full bg-card border border-border shadow-lg">
            {users.length === 0 ? (
              <span className="text-xs text-muted-foreground px-2"></span>
            ) : (
              <>
                {users.slice(0, 5).map((u) => (
                  <Tooltip key={u.id}>
                    <TooltipTrigger>
                      <div 
                        className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
                        style={{ backgroundColor: u.color }}
                      >
                        {u.name.charAt(0).toUpperCase()}
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <div className="text-sm">
                        <p className="font-medium">{u.name}</p>
                        <p className="text-xs text-muted-foreground">
                          Viewing: {u.section}
                        </p>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                ))}
                {users.length > 5 && (
                  <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground">
                    +{users.length - 5}
                  </div>
                )}
              </>
            )}
          </div>
        </TooltipProvider>
      </div>

      {/* Live cursors */}
      {Object.entries(cursorPositions).map(([userId, pos]) => {
        const u = users.find(u => u.id === userId);
        if (!u) return null;

        return (
          <div
            key={userId}
            className="fixed pointer-events-none z-[9999] transition-all duration-75"
            style={{ 
              left: pos.x, 
              top: pos.y,
              transform: 'translate(-2px, -2px)'
            }}
          >
            {/* Cursor arrow */}
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.5))' }}
            >
              <path
                d="M5.65376 12.4567L7.30376 17.6067C7.42376 17.9667 7.88376 18.0867 8.17376 17.8267L10.6538 15.6367L14.1538 19.0267C14.4538 19.3167 14.9138 19.3167 15.2138 19.0267L17.4538 16.8367C17.7538 16.5467 17.7538 16.0867 17.4538 15.7967L13.9538 12.4067L16.4338 10.1467C16.7238 9.88673 16.6238 9.42673 16.2538 9.29673L5.98376 5.96673C5.57376 5.82673 5.17376 6.19673 5.30376 6.60673L5.65376 12.4567Z"
                fill={u.color}
                stroke="white"
                strokeWidth="1.5"
              />
            </svg>
            {/* Name tag */}
            <div 
              className="mt-0.5 ml-4 px-2 py-0.5 rounded text-xs font-medium text-white whitespace-nowrap"
              style={{ backgroundColor: u.color }}
            >
              {u.name}
            </div>
          </div>
        );
      })}

      {/* Section indicators */}
      {users.length > 0 && (
        <div className="fixed top-20 right-4 z-40 space-y-2">
          {Array.from(new Set(users.map(u => u.section))).map(section => {
            const sectionUsers = users.filter(u => u.section === section);
            return (
              <div 
                key={section}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-card/80 backdrop-blur border border-border"
              >
                <div className="flex -space-x-1">
                  {sectionUsers.slice(0, 3).map(u => (
                    <div
                      key={u.id}
                      className="w-5 h-5 rounded-full border-2 border-card text-[10px] font-bold text-white flex items-center justify-center"
                      style={{ backgroundColor: u.color }}
                    >
                      {u.name.charAt(0).toUpperCase()}
                    </div>
                  ))}
                </div>
                <span className="text-xs text-muted-foreground">{section}</span>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
