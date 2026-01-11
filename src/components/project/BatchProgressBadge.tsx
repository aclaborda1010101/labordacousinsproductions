import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Loader2, ChevronRight } from 'lucide-react';
import { useBackgroundTasks } from '@/contexts/BackgroundTasksContext';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface PipelineState {
  pipelineRunning: boolean;
  currentEpisode?: number;
  totalEpisodes?: number;
  progress?: number;
  startedAt?: number;
  projectId?: string;
  qualityTier?: string;
  completedBatches?: number;
  totalBatches?: number;
}

interface BatchProgressBadgeProps {
  projectId: string;
}

export function BatchProgressBadge({ projectId }: BatchProgressBadgeProps) {
  const [pipelineState, setPipelineState] = useState<PipelineState | null>(null);
  const { activeTasks } = useBackgroundTasks();
  const location = useLocation();
  
  const PIPELINE_STORAGE_KEY = `script_pipeline_${projectId}`;
  const targetPath = `/projects/${projectId}/script`;

  // Poll localStorage for pipeline state
  useEffect(() => {
    const checkPipelineState = () => {
      try {
        const stored = localStorage.getItem(PIPELINE_STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored) as PipelineState;
          
          // Verify it's still valid (< 2 hours old)
          // Accept legacy states without projectId field
          if (
            parsed.pipelineRunning &&
            parsed.startedAt &&
            Date.now() - parsed.startedAt < 2 * 60 * 60 * 1000 &&
            (!parsed.projectId || parsed.projectId === projectId)
          ) {
            setPipelineState({ ...parsed, projectId });
            return;
          }
        }
        setPipelineState(null);
      } catch {
        setPipelineState(null);
      }
    };

    // Check immediately
    checkPipelineState();

    // Poll every 2 seconds while component is mounted
    const interval = setInterval(checkPipelineState, 2000);

    return () => clearInterval(interval);
  }, [projectId, PIPELINE_STORAGE_KEY]);

  // Also check for script_generation tasks in BackgroundTasks
  const scriptTask = activeTasks.find(
    t => t.type === 'script_generation' && t.projectId === projectId
  );

  // Show badge if either localStorage pipeline OR backgroundTask is active
  const isActive = pipelineState?.pipelineRunning || scriptTask;

  if (!isActive) {
    return null;
  }

  // Prioritize localStorage state (more detailed) over backgroundTask
  const currentEp = pipelineState?.currentEpisode ?? 1;
  const totalEps = pipelineState?.totalEpisodes ?? (scriptTask?.metadata as any)?.totalEpisodes ?? 1;
  const progress = pipelineState?.progress ?? scriptTask?.progress ?? 0;
  const tier = pipelineState?.qualityTier ?? (scriptTask?.metadata as any)?.qualityTier ?? 'profesional';

  const tierLabel = tier === 'hollywood' ? '🎬' : tier === 'profesional' ? '🎯' : '⚡';
  
  // Check if already on the target route
  const isOnScriptRoute = location.pathname.includes(targetPath) || location.pathname.endsWith('/script');
  
  const handleClick = (e: React.MouseEvent) => {
    if (isOnScriptRoute) {
      e.preventDefault();
      // Dispatch event for ScriptImport to scroll to progress
      window.dispatchEvent(new CustomEvent('focusPipelineProgress'));
    }
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link to={targetPath} onClick={handleClick} className="flex-shrink-0">
          <Badge 
            variant="default" 
            className={cn(
              "gap-1.5 cursor-pointer transition-all hover:scale-105",
              "bg-blue-600 hover:bg-blue-700 text-white border-blue-500",
              "animate-pulse"
            )}
          >
            <Loader2 className="h-3 w-3 animate-spin" />
            <span className="hidden sm:inline">Generando</span>
            <span className="font-semibold">
              Ep {currentEp}/{totalEps}
            </span>
            <span className="text-blue-200">
              {progress}%
            </span>
            <span className="hidden lg:inline">{tierLabel}</span>
            <ChevronRight className="h-3 w-3 opacity-70" />
          </Badge>
        </Link>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs">
        <div className="text-sm">
          <p className="font-medium">Generación de episodios en curso</p>
          <p className="text-muted-foreground text-xs mt-1">
            Episodio {currentEp} de {totalEps} • {progress}% completado
          </p>
          {pipelineState?.completedBatches !== undefined && pipelineState?.totalBatches && (
            <p className="text-muted-foreground text-xs">
              Batch {pipelineState.completedBatches + 1}/{pipelineState.totalBatches}
            </p>
          )}
          <p className="text-xs text-blue-400 mt-1">
            Click para ver progreso completo
          </p>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

export default BatchProgressBadge;
