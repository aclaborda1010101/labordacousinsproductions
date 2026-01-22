/**
 * ScriptProgressTimeline - Informative timeline for script generation
 * 
 * Shows real-time progress of scene generation in observer mode.
 * Only displays status - no editing allowed during generation.
 */

import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  CheckCircle, 
  Loader2, 
  Clock, 
  XCircle,
  Sparkles,
  Brain,
  FileText,
  Wrench
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface TimelineEvent {
  id: string;
  type: 'outline' | 'state' | 'scene_planned' | 'scene_written' | 'scene_validated' | 'scene_repairing' | 'scene_failed';
  label: string;
  sublabel?: string;
  status: 'completed' | 'in_progress' | 'pending' | 'failed';
  sceneNumber?: number;
  score?: number;
  timestamp?: string;
}

interface ScriptProgressTimelineProps {
  projectId: string;
  className?: string;
}

export function ScriptProgressTimeline({ projectId, className }: ScriptProgressTimelineProps) {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);

  // Load and build timeline from DB
  useEffect(() => {
    async function loadTimeline() {
      if (!projectId) return;

      try {
        const [intentResult, stateResult, scenesResult, repairsResult] = await Promise.all([
          supabase
            .from('scene_intent')
            .select('id, scene_number, status, intent_summary, created_at')
            .eq('project_id', projectId)
            .order('scene_number', { ascending: true }),
          supabase
            .from('narrative_state')
            .select('id, current_phase, created_at')
            .eq('project_id', projectId)
            .order('created_at', { ascending: false })
            .limit(1),
          supabase
            .from('scenes')
            .select('id, scene_number, meta, created_at')
            .eq('project_id', projectId)
            .order('scene_number', { ascending: true }),
          supabase
            .from('scene_repairs')
            .select('id, scene_id, status, created_at')
            .eq('project_id', projectId),
        ]);

        const intents = (intentResult.data as any[]) || [];
        const narrativeState = (stateResult.data as any[])?.[0];
        const scenes = (scenesResult.data as any[]) || [];
        const repairs = (repairsResult.data as any[]) || [];

        const timeline: TimelineEvent[] = [];

        // 1. Narrative state initialized
        if (narrativeState) {
          timeline.push({
            id: 'state-init',
            type: 'state',
            label: 'Estado narrativo inicializado',
            status: 'completed',
            timestamp: narrativeState.created_at,
          });
        }

        // 2. Build events from intents and scenes
        for (const intent of intents) {
          const scene = scenes.find(s => s.scene_number === intent.scene_number);
          const sceneRepairs = repairs.filter(r => r.scene_id === scene?.id);
          const hasActiveRepair = sceneRepairs.some(r => ['pending', 'repairing'].includes(r.status));

          // Scene planned
          if (['planned', 'writing', 'written', 'validated', 'needs_repair', 'repairing'].includes(intent.status)) {
            timeline.push({
              id: `plan-${intent.scene_number}`,
              type: 'scene_planned',
              label: `Escena ${intent.scene_number} planificada`,
              sublabel: intent.intent_summary,
              status: 'completed',
              sceneNumber: intent.scene_number,
            });
          } else if (intent.status === 'planning') {
            timeline.push({
              id: `plan-${intent.scene_number}`,
              type: 'scene_planned',
              label: `Escena ${intent.scene_number} planificándose...`,
              status: 'in_progress',
              sceneNumber: intent.scene_number,
            });
          }

          // Scene written
          if (scene && ['written', 'validated'].includes(intent.status)) {
            const validationScore = scene.meta?.validation_score;
            timeline.push({
              id: `write-${intent.scene_number}`,
              type: 'scene_written',
              label: `Escena ${intent.scene_number} escrita`,
              sublabel: validationScore ? `Puntuación: ${validationScore}/100` : undefined,
              status: 'completed',
              sceneNumber: intent.scene_number,
              score: validationScore,
            });
          } else if (intent.status === 'writing') {
            timeline.push({
              id: `write-${intent.scene_number}`,
              type: 'scene_written',
              label: `Escena ${intent.scene_number} escribiéndose...`,
              status: 'in_progress',
              sceneNumber: intent.scene_number,
            });
          }

          // Scene validated
          if (intent.status === 'validated') {
            timeline.push({
              id: `validate-${intent.scene_number}`,
              type: 'scene_validated',
              label: `Escena ${intent.scene_number} validada ✓`,
              status: 'completed',
              sceneNumber: intent.scene_number,
            });
          }

          // Scene repairing
          if (hasActiveRepair || intent.status === 'repairing') {
            timeline.push({
              id: `repair-${intent.scene_number}`,
              type: 'scene_repairing',
              label: `Escena ${intent.scene_number} mejorándose...`,
              status: 'in_progress',
              sceneNumber: intent.scene_number,
            });
          }

          // Scene failed
          if (intent.status === 'failed' || intent.status === 'rejected') {
            timeline.push({
              id: `fail-${intent.scene_number}`,
              type: 'scene_failed',
              label: `Escena ${intent.scene_number} falló`,
              status: 'failed',
              sceneNumber: intent.scene_number,
            });
          }

          // Pending scenes
          if (intent.status === 'pending') {
            timeline.push({
              id: `pending-${intent.scene_number}`,
              type: 'scene_planned',
              label: `Escena ${intent.scene_number}`,
              sublabel: 'Pendiente',
              status: 'pending',
              sceneNumber: intent.scene_number,
            });
          }
        }

        setEvents(timeline);
      } catch (error) {
        console.error('[ScriptProgressTimeline] Error loading timeline:', error);
      } finally {
        setLoading(false);
      }
    }

    loadTimeline();

    // Set up Realtime subscription
    const channel = supabase
      .channel(`timeline-${projectId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'scene_intent', filter: `project_id=eq.${projectId}` },
        () => loadTimeline()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'scenes', filter: `project_id=eq.${projectId}` },
        () => loadTimeline()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'scene_repairs', filter: `project_id=eq.${projectId}` },
        () => loadTimeline()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [projectId]);

  const getIcon = (event: TimelineEvent) => {
    switch (event.status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'in_progress':
        return <Loader2 className="h-4 w-4 text-primary animate-spin" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-destructive" />;
      default:
        return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getTypeIcon = (type: TimelineEvent['type']) => {
    switch (type) {
      case 'state':
        return <Brain className="h-3 w-3" />;
      case 'scene_planned':
        return <Sparkles className="h-3 w-3" />;
      case 'scene_written':
        return <FileText className="h-3 w-3" />;
      case 'scene_repairing':
        return <Wrench className="h-3 w-3" />;
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <Card className={className}>
        <CardContent className="p-4 flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (events.length === 0) {
    return null;
  }

  const completedCount = events.filter(e => e.status === 'completed').length;
  const totalCount = events.length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <Card className={cn("border-primary/20", className)}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Brain className="h-4 w-4 text-primary" />
            Progreso de Generación
          </CardTitle>
          <Badge variant="outline" className="text-xs">
            {completedCount}/{totalCount}
          </Badge>
        </div>
        <Progress value={progressPercent} className="h-1.5 mt-2" />
      </CardHeader>
      <CardContent className="pt-2">
        <ScrollArea className="h-48">
          <div className="space-y-2">
            {events.map((event) => (
              <div
                key={event.id}
                className={cn(
                  "flex items-start gap-3 p-2 rounded text-sm transition-colors",
                  event.status === 'in_progress' && "bg-primary/5 border border-primary/20",
                  event.status === 'pending' && "opacity-50"
                )}
              >
                <div className="mt-0.5">{getIcon(event)}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {getTypeIcon(event.type)}
                    <span className={cn(
                      "font-medium",
                      event.status === 'completed' && "text-green-600 dark:text-green-400",
                      event.status === 'in_progress' && "text-primary",
                      event.status === 'failed' && "text-destructive"
                    )}>
                      {event.label}
                    </span>
                    {event.score && (
                      <Badge 
                        variant={event.score >= 80 ? 'default' : event.score >= 60 ? 'secondary' : 'destructive'} 
                        className="text-xs"
                      >
                        {event.score}
                      </Badge>
                    )}
                  </div>
                  {event.sublabel && (
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {event.sublabel}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

export default ScriptProgressTimeline;
