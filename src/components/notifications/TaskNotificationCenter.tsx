import React from 'react';
import { Bell, X, Check, AlertCircle, Loader2, Clock, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useBackgroundTasks, BackgroundTask, TaskType, TaskStatus } from '@/contexts/BackgroundTasksContext';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

const taskTypeLabels: Record<TaskType, string> = {
  script_generation: 'Generación de Guion',
  scene_generation: 'Generación de Escenas',
  character_generation: 'Generación de Personaje',
  location_generation: 'Generación de Locación',
  keyframe_generation: 'Generación de Keyframe',
  video_generation: 'Generación de Video',
  lora_training: 'Entrenamiento LoRA',
  pdf_export: 'Exportación PDF',
  batch_generation: 'Generación por Lotes',
  script_breakdown: 'Análisis de Guion',
  outfit_generation: 'Generación de Outfit',
  visual_dna: 'Visual DNA',
  other: 'Proceso',
};

const taskTypeIcons: Record<TaskType, string> = {
  script_generation: '📝',
  scene_generation: '🎬',
  character_generation: '👤',
  location_generation: '🏠',
  keyframe_generation: '🖼️',
  video_generation: '🎥',
  lora_training: '🧠',
  pdf_export: '📄',
  batch_generation: '⚡',
  script_breakdown: '🔍',
  outfit_generation: '👔',
  visual_dna: '🧬',
  other: '⚙️',
};

function TaskStatusIcon({ status }: { status: TaskStatus }) {
  switch (status) {
    case 'running':
      return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
    case 'pending':
      return <Clock className="h-4 w-4 text-muted-foreground" />;
    case 'completed':
      return <Check className="h-4 w-4 text-green-500" />;
    case 'failed':
      return <AlertCircle className="h-4 w-4 text-destructive" />;
    case 'cancelled':
      return <X className="h-4 w-4 text-muted-foreground" />;
    default:
      return null;
  }
}

function TaskItem({ task, onRemove, onCancel }: { task: BackgroundTask; onRemove: () => void; onCancel: () => void }) {
  const [expanded, setExpanded] = React.useState(false);
  const isActive = task.status === 'running' || task.status === 'pending';

  return (
    <div 
      className={cn(
        "p-3 border-b last:border-b-0 transition-colors",
        isActive && "bg-primary/5",
        task.status === 'failed' && "bg-destructive/5"
      )}
    >
      <div className="flex items-start gap-3">
        <span className="text-lg">{taskTypeIcons[task.type]}</span>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <TaskStatusIcon status={task.status} />
            <span className="font-medium text-sm truncate">{task.title}</span>
          </div>
          
          {task.entityName && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {task.entityName}
            </p>
          )}
          
          {isActive && (
            <div className="mt-2">
              <Progress value={task.progress} className="h-1.5" />
              <div className="flex items-center justify-between mt-1">
                <p className="text-xs text-muted-foreground">
                  {task.progress}% completado
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 px-2 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={(e) => {
                    e.stopPropagation();
                    onCancel();
                  }}
                >
                  <X className="h-3 w-3 mr-1" />
                  Cancelar
                </Button>
              </div>
            </div>
          )}
          
          {task.status === 'failed' && task.error && (
            <p className="text-xs text-destructive mt-1 truncate">
              {task.error}
            </p>
          )}
          
          {task.status === 'cancelled' && (
            <p className="text-xs text-muted-foreground mt-1">
              Cancelado
            </p>
          )}
          
          {task.status === 'completed' && (
            <p className="text-xs text-green-600 mt-1">
              Completado {formatDistanceToNow(new Date(task.completedAt || task.updatedAt), { 
                addSuffix: true, 
                locale: es 
              })}
            </p>
          )}
          
          {task.description && expanded && (
            <p className="text-xs text-muted-foreground mt-2 whitespace-pre-wrap">
              {task.description}
            </p>
          )}
        </div>
        
        <div className="flex items-center gap-1">
          {task.description && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={(e) => {
                e.stopPropagation();
                setExpanded(!expanded);
              }}
            >
              {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </Button>
          )}
          
          {!isActive && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-destructive"
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export function TaskNotificationCenter() {
  const [localOpen, setLocalOpen] = React.useState(false);
  const { 
    tasks, 
    activeTasks, 
    completedTasks, 
    failedTasks,
    hasUnread, 
    markAllRead,
    removeTask,
    cancelTask,
    clearCompleted 
  } = useBackgroundTasks();

  const handleOpenChange = (open: boolean) => {
    setLocalOpen(open);
    if (open) {
      markAllRead();
    }
  };

  const sortedTasks = [...tasks].sort((a, b) => {
    // Active tasks first
    const aActive = a.status === 'running' || a.status === 'pending';
    const bActive = b.status === 'running' || b.status === 'pending';
    if (aActive && !bActive) return -1;
    if (!aActive && bActive) return 1;
    // Then by update time
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });

  return (
    <Popover open={localOpen} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {activeTasks.length > 0 && (
            <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center animate-pulse">
              {activeTasks.length}
            </span>
          )}
          {hasUnread && activeTasks.length === 0 && (
            <span className="absolute top-0 right-0 h-2 w-2 rounded-full bg-destructive" />
          )}
        </Button>
      </PopoverTrigger>
      
      <PopoverContent className="w-96 p-0" align="end">
        <div className="flex items-center justify-between p-3 border-b bg-muted/30">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold">Procesos</h3>
            {activeTasks.length > 0 && (
              <Badge variant="default" className="text-xs">
                {activeTasks.length} activos
              </Badge>
            )}
          </div>
          
          {(completedTasks.length > 0 || failedTasks.length > 0) && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={(e) => {
                e.stopPropagation();
                clearCompleted();
              }}
            >
              <Trash2 className="h-3 w-3 mr-1" />
              Limpiar
            </Button>
          )}
        </div>
        
        <ScrollArea className="max-h-[400px]">
          {sortedTasks.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <Bell className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No hay procesos activos</p>
              <p className="text-xs mt-1">Las generaciones aparecerán aquí</p>
            </div>
          ) : (
            <div>
              {sortedTasks.map(task => (
                <TaskItem 
                  key={task.id} 
                  task={task} 
                  onRemove={() => removeTask(task.id)}
                  onCancel={() => cancelTask(task.id)}
                />
              ))}
            </div>
          )}
        </ScrollArea>
        
        {activeTasks.length > 0 && (
          <div className="p-2 border-t bg-muted/30">
            <p className="text-xs text-center text-muted-foreground">
              Los procesos continúan aunque navegues a otras pantallas
            </p>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
