import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { Check, Clock, Lock, Loader2 } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface ScenePipelineStepperProps {
  sceneId: string;
  projectId: string;
}

interface PipelineStatus {
  screenplay: 'done';
  storyboard: { status: 'pending' | 'partial' | 'done'; approved: number; total: number };
  technical: { status: 'locked' | 'draft' | 'approved' | null };
  keyframes: { status: 'pending' | 'partial' | 'done'; count: number; total: number };
  render: { status: 'pending' | 'partial' | 'done'; count: number; total: number };
}

export function ScenePipelineStepper({ sceneId, projectId }: ScenePipelineStepperProps) {
  const [status, setStatus] = useState<PipelineStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPipelineStatus();
  }, [sceneId]);

  const fetchPipelineStatus = async () => {
    setLoading(true);
    try {
      // Fetch storyboard panels
      const { data: panels } = await supabase
        .from('storyboard_panels')
        .select('id, approved')
        .eq('scene_id', sceneId);
      
      const totalPanels = panels?.length || 0;
      const approvedPanels = panels?.filter(p => p.approved).length || 0;

      // Fetch technical doc status
      const { data: techDoc } = await supabase
        .from('scene_technical_docs')
        .select('status')
        .eq('scene_id', sceneId)
        .maybeSingle();

      // Fetch shots count
      const { data: shots } = await supabase
        .from('shots')
        .select('id')
        .eq('scene_id', sceneId);

      const shotsCount = shots?.length || 0;
      
      // For keyframes and renders, we'll estimate based on what we have
      // These tables have complex types - use simpler status derivation
      const kfCount = 0; // Simplified - would need RPC or different approach
      const completedRenders = 0; // Simplified

      setStatus({
        screenplay: 'done',
        storyboard: {
          status: totalPanels === 0 ? 'pending' : approvedPanels >= 1 ? 'done' : 'partial',
          approved: approvedPanels,
          total: totalPanels,
        },
        technical: {
          status: techDoc?.status as 'draft' | 'approved' | 'locked' | null,
        },
        keyframes: {
          status: kfCount === 0 ? 'pending' : kfCount >= shotsCount ? 'done' : 'partial',
          count: kfCount,
          total: shotsCount,
        },
        render: {
          status: completedRenders === 0 ? 'pending' : completedRenders >= shotsCount ? 'done' : 'partial',
          count: completedRenders,
          total: shotsCount,
        },
      });
    } catch (error) {
      console.error('Error fetching pipeline status:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground text-sm">
        <Loader2 className="w-4 h-4 animate-spin" />
        Cargando estado del pipeline...
      </div>
    );
  }

  if (!status) return null;

  const steps = [
    {
      id: 'screenplay',
      label: 'Guion',
      emoji: '📖',
      status: 'done' as const,
      detail: 'Listo',
    },
    {
      id: 'storyboard',
      label: 'Storyboard',
      emoji: '🎨',
      status: status.storyboard.status,
      detail: status.storyboard.total === 0 
        ? 'Sin paneles' 
        : `${status.storyboard.approved}/${status.storyboard.total} aprobados`,
    },
    {
      id: 'technical',
      label: 'Técnico',
      emoji: '📋',
      status: status.storyboard.status !== 'done' 
        ? 'locked' 
        : status.technical.status === 'approved' || status.technical.status === 'locked' 
          ? 'done' 
          : status.technical.status === 'draft' 
            ? 'partial' 
            : 'pending',
      detail: status.storyboard.status !== 'done' 
        ? 'Requiere Storyboard' 
        : status.technical.status || 'Sin crear',
    },
    {
      id: 'keyframes',
      label: 'Keyframes',
      emoji: '🖼️',
      status: (status.technical.status !== 'approved' && status.technical.status !== 'locked')
        ? 'locked'
        : status.keyframes.status,
      detail: (status.technical.status !== 'approved' && status.technical.status !== 'locked')
        ? 'Requiere Doc. Técnico'
        : status.keyframes.total === 0
          ? 'Sin shots'
          : `${status.keyframes.count}/${status.keyframes.total}`,
    },
    {
      id: 'render',
      label: 'Render',
      emoji: '🎬',
      status: status.keyframes.status !== 'done' ? 'locked' : status.render.status,
      detail: status.keyframes.status !== 'done'
        ? 'Requiere Keyframes'
        : `${status.render.count}/${status.render.total}`,
    },
  ];

  return (
    <div className="flex items-center gap-1 py-2 px-3 bg-muted/30 rounded-lg overflow-x-auto">
      {steps.map((step, index) => (
        <div key={step.id} className="flex items-center">
          <Tooltip>
            <TooltipTrigger asChild>
              <div className={cn(
                "flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium transition-colors",
                step.status === 'done' && "bg-green-500/10 text-green-600 dark:text-green-400",
                step.status === 'partial' && "bg-amber-500/10 text-amber-600 dark:text-amber-400",
                step.status === 'pending' && "bg-muted text-muted-foreground",
                step.status === 'locked' && "bg-muted/50 text-muted-foreground/50",
              )}>
                <span>{step.emoji}</span>
                <span className="hidden sm:inline">{step.label}</span>
                {step.status === 'done' && <Check className="w-3 h-3" />}
                {step.status === 'partial' && <Clock className="w-3 h-3" />}
                {step.status === 'locked' && <Lock className="w-3 h-3" />}
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p className="font-medium">{step.label}</p>
              <p className="text-xs text-muted-foreground">{step.detail}</p>
            </TooltipContent>
          </Tooltip>
          
          {index < steps.length - 1 && (
            <div className={cn(
              "w-4 h-0.5 mx-1",
              step.status === 'done' ? "bg-green-500/50" : "bg-border"
            )} />
          )}
        </div>
      ))}
    </div>
  );
}
