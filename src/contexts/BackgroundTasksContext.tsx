import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
export type TaskType = 
  | 'script_generation' 
  | 'scene_generation' 
  | 'character_generation' 
  | 'location_generation'
  | 'keyframe_generation'
  | 'video_generation'
  | 'lora_training'
  | 'pdf_export'
  | 'batch_generation'
  | 'episode_batch'  // Multi-episode generation pipeline
  | 'script_breakdown'
  | 'script_analysis'
  | 'outfit_generation'
  | 'visual_dna'
  | 'other';

export interface BackgroundTask {
  id: string;
  type: TaskType;
  title: string;
  description?: string;
  status: TaskStatus;
  progress: number; // 0-100
  projectId?: string;
  entityId?: string; // character_id, scene_id, etc.
  entityName?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  error?: string;
  result?: any;
  metadata?: Record<string, any>;
}

interface BackgroundTasksContextType {
  tasks: BackgroundTask[];
  activeTasks: BackgroundTask[];
  completedTasks: BackgroundTask[];
  failedTasks: BackgroundTask[];
  
  // Task management
  addTask: (task: Omit<BackgroundTask, 'id' | 'createdAt' | 'updatedAt' | 'status' | 'progress'> & { id?: string }) => string;
  updateTask: (taskId: string, updates: Partial<BackgroundTask>) => void;
  completeTask: (taskId: string, result?: any) => void;
  failTask: (taskId: string, error: string) => void;
  cancelTask: (taskId: string) => void;
  removeTask: (taskId: string) => void;
  clearCompleted: () => void;
  
  // UI state
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  hasUnread: boolean;
  markAllRead: () => void;
  
  // Sync status
  isSynced: boolean;
}

const BackgroundTasksContext = createContext<BackgroundTasksContextType | undefined>(undefined);

const STORAGE_KEY = 'background_tasks';
const MAX_COMPLETED_TASKS = 50;

// Convert DB row to BackgroundTask
function dbRowToTask(row: any): BackgroundTask {
  return {
    id: row.id,
    type: row.type as TaskType,
    title: row.title,
    description: row.description,
    status: row.status as TaskStatus,
    progress: row.progress,
    projectId: row.project_id,
    entityId: row.entity_id,
    entityName: row.entity_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
    error: row.error,
    result: row.result,
    metadata: row.metadata,
  };
}

// Convert BackgroundTask to DB row format
function taskToDbRow(task: BackgroundTask, userId: string) {
  return {
    id: task.id,
    user_id: userId,
    project_id: task.projectId || null,
    type: task.type,
    title: task.title,
    description: task.description || null,
    status: task.status,
    progress: task.progress,
    entity_id: task.entityId || null,
    entity_name: task.entityName || null,
    error: task.error || null,
    result: task.result || null,
    metadata: task.metadata || null,
    created_at: task.createdAt,
    updated_at: task.updatedAt,
    completed_at: task.completedAt || null,
  };
}

export function BackgroundTasksProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<BackgroundTask[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [lastReadAt, setLastReadAt] = useState<string>(new Date().toISOString());
  const [isSynced, setIsSynced] = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const initialLoadDone = useRef(false);

  // Load tasks from Supabase on mount (for authenticated users)
  useEffect(() => {
    if (!user) {
      // Fall back to localStorage for non-authenticated users
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored) as BackgroundTask[];
          const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
          const filtered = parsed.filter(t => 
            t.status === 'running' || t.status === 'pending' || t.updatedAt > cutoff
          );
          setTasks(filtered);
        }
      } catch (e) {
        console.error('Failed to load background tasks from localStorage:', e);
      }
      return;
    }

    // Load from Supabase
    const loadTasks = async () => {
      const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
      
      const { data, error } = await supabase
        .from('background_tasks')
        .select('*')
        .eq('user_id', user.id)
        .or(`status.in.(running,pending),updated_at.gt.${cutoff}`)
        .order('created_at', { ascending: false })
        .limit(MAX_COMPLETED_TASKS);

      if (error) {
        console.error('Failed to load tasks from Supabase:', error);
        return;
      }

      if (data) {
        // Auto-cleanup zombie tasks (running/pending for > 10 minutes)
        const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
        const zombieTasks = data.filter(t => 
          (t.status === 'running' || t.status === 'pending') && 
          t.updated_at < tenMinutesAgo
        );
        
        if (zombieTasks.length > 0) {
          const zombieIds = zombieTasks.map(t => t.id);
          console.log(`Cleaning ${zombieTasks.length} zombie task(s):`, zombieIds);
          
          await supabase
            .from('background_tasks')
            .update({ 
              status: 'failed', 
              error: 'Proceso interrumpido (timeout)',
              updated_at: new Date().toISOString()
            })
            .in('id', zombieIds);
          
          // Update local data
          data.forEach(t => {
            if (zombieIds.includes(t.id)) {
              t.status = 'failed';
              t.error = 'Proceso interrumpido (timeout)';
            }
          });
        }
        
        setTasks(data.map(dbRowToTask));
        setIsSynced(true);
        initialLoadDone.current = true;
      }
    };

    loadTasks();

    // Subscribe to realtime updates
    const channel = supabase
      .channel('background_tasks_realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'background_tasks',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newTask = dbRowToTask(payload.new);
            setTasks(prev => {
              // Avoid duplicates (local add + realtime)
              if (prev.some(t => t.id === newTask.id)) return prev;
              return [...prev, newTask];
            });
          } else if (payload.eventType === 'UPDATE') {
            const updatedTask = dbRowToTask(payload.new);
            setTasks(prev => prev.map(t => t.id === updatedTask.id ? updatedTask : t));
          } else if (payload.eventType === 'DELETE') {
            const deletedId = (payload.old as any).id;
            setTasks(prev => prev.filter(t => t.id !== deletedId));
          }
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [user]);

  // Load lastReadAt from localStorage
  useEffect(() => {
    const lastRead = localStorage.getItem('background_tasks_last_read');
    if (lastRead) {
      setLastReadAt(lastRead);
    }
  }, []);

  // Save tasks to localStorage for non-authenticated users
  useEffect(() => {
    if (user) return; // Skip if authenticated (using Supabase)
    
    try {
      const toStore = tasks.slice(-MAX_COMPLETED_TASKS);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
    } catch (e) {
      console.error('Failed to save background tasks:', e);
    }
  }, [tasks, user]);

  const activeTasks = tasks.filter(t => t.status === 'running' || t.status === 'pending');
  const completedTasks = tasks.filter(t => t.status === 'completed');
  const failedTasks = tasks.filter(t => t.status === 'failed');
  
  const hasUnread = tasks.some(t => t.updatedAt > lastReadAt && t.status !== 'running' && t.status !== 'pending');

  const addTask = useCallback((taskData: Omit<BackgroundTask, 'id' | 'createdAt' | 'updatedAt' | 'status' | 'progress'> & { id?: string }) => {
    const now = new Date().toISOString();
    const taskId = taskData.id || `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const newTask: BackgroundTask = {
      ...taskData,
      id: taskId,
      status: 'running',
      progress: 0,
      createdAt: now,
      updatedAt: now,
    };

    // Update local state immediately
    setTasks(prev => [...prev, newTask]);

    // Persist to Supabase if authenticated
    if (user) {
      supabase
        .from('background_tasks')
        .insert(taskToDbRow(newTask, user.id))
        .then(({ error }) => {
          if (error) console.error('Failed to persist task to Supabase:', error);
        });
    }

    return taskId;
  }, [user]);

  const updateTask = useCallback((taskId: string, updates: Partial<BackgroundTask>) => {
    const now = new Date().toISOString();
    
    setTasks(prev => prev.map(task => 
      task.id === taskId 
        ? { ...task, ...updates, updatedAt: now }
        : task
    ));

    // Persist to Supabase if authenticated
    if (user) {
      const dbUpdates: Record<string, any> = { updated_at: now };
      if (updates.status !== undefined) dbUpdates.status = updates.status;
      if (updates.progress !== undefined) dbUpdates.progress = updates.progress;
      if (updates.error !== undefined) dbUpdates.error = updates.error;
      if (updates.result !== undefined) dbUpdates.result = updates.result;
      if (updates.completedAt !== undefined) dbUpdates.completed_at = updates.completedAt;
      if (updates.description !== undefined) dbUpdates.description = updates.description;
      if (updates.metadata !== undefined) dbUpdates.metadata = updates.metadata;

      supabase
        .from('background_tasks')
        .update(dbUpdates)
        .eq('id', taskId)
        .then(({ error }) => {
          if (error) console.error('Failed to update task in Supabase:', error);
        });
    }
  }, [user]);

  const completeTask = useCallback((taskId: string, result?: any) => {
    const now = new Date().toISOString();
    setTasks(prev => prev.map(task => 
      task.id === taskId 
        ? { ...task, status: 'completed' as TaskStatus, progress: 100, result, completedAt: now, updatedAt: now }
        : task
    ));

    if (user) {
      supabase
        .from('background_tasks')
        .update({
          status: 'completed',
          progress: 100,
          result: result || null,
          completed_at: now,
          updated_at: now,
        })
        .eq('id', taskId)
        .then(({ error }) => {
          if (error) console.error('Failed to complete task in Supabase:', error);
        });
    }
  }, [user]);

  const failTask = useCallback((taskId: string, error: string) => {
    const now = new Date().toISOString();
    setTasks(prev => prev.map(task => 
      task.id === taskId 
        ? { ...task, status: 'failed' as TaskStatus, error, updatedAt: now }
        : task
    ));

    if (user) {
      supabase
        .from('background_tasks')
        .update({
          status: 'failed',
          error,
          updated_at: now,
        })
        .eq('id', taskId)
        .then(({ error: dbError }) => {
          if (dbError) console.error('Failed to fail task in Supabase:', dbError);
        });
    }
  }, [user]);

  const cancelTask = useCallback((taskId: string) => {
    const now = new Date().toISOString();
    setTasks(prev => prev.map(task => 
      task.id === taskId 
        ? { ...task, status: 'cancelled' as TaskStatus, updatedAt: now }
        : task
    ));

    if (user) {
      supabase
        .from('background_tasks')
        .update({
          status: 'cancelled',
          updated_at: now,
        })
        .eq('id', taskId)
        .then(({ error }) => {
          if (error) console.error('Failed to cancel task in Supabase:', error);
        });
    }
  }, [user]);

  const removeTask = useCallback((taskId: string) => {
    setTasks(prev => prev.filter(task => task.id !== taskId));

    if (user) {
      supabase
        .from('background_tasks')
        .delete()
        .eq('id', taskId)
        .then(({ error }) => {
          if (error) console.error('Failed to remove task from Supabase:', error);
        });
    }
  }, [user]);

  const clearCompleted = useCallback(() => {
    const completedIds = tasks
      .filter(task => task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled')
      .map(t => t.id);
    
    setTasks(prev => prev.filter(task => task.status === 'running' || task.status === 'pending'));

    if (user && completedIds.length > 0) {
      supabase
        .from('background_tasks')
        .delete()
        .in('id', completedIds)
        .then(({ error }) => {
          if (error) console.error('Failed to clear completed tasks in Supabase:', error);
        });
    }
  }, [tasks, user]);

  const markAllRead = useCallback(() => {
    const now = new Date().toISOString();
    setLastReadAt(now);
    localStorage.setItem('background_tasks_last_read', now);
  }, []);

  return (
    <BackgroundTasksContext.Provider value={{
      tasks,
      activeTasks,
      completedTasks,
      failedTasks,
      addTask,
      updateTask,
      completeTask,
      failTask,
      cancelTask,
      removeTask,
      clearCompleted,
      isOpen,
      setIsOpen,
      hasUnread,
      markAllRead,
      isSynced,
    }}>
      {children}
    </BackgroundTasksContext.Provider>
  );
}

export function useBackgroundTasks() {
  const context = useContext(BackgroundTasksContext);
  if (!context) {
    throw new Error('useBackgroundTasks must be used within a BackgroundTasksProvider');
  }
  return context;
}

// Hook for running a task in the background
export function useBackgroundTask() {
  const { addTask, updateTask, completeTask, failTask } = useBackgroundTasks();

  const runTask = useCallback(async <T,>(
    taskInfo: {
      type: TaskType;
      title: string;
      description?: string;
      projectId?: string;
      entityId?: string;
      entityName?: string;
      metadata?: Record<string, any>;
    },
    executor: (updateProgress: (progress: number) => void) => Promise<T>
  ): Promise<{ taskId: string; result: T }> => {
    const taskId = addTask(taskInfo);

    try {
      const result = await executor((progress) => {
        updateTask(taskId, { progress: Math.min(99, progress) });
      });
      
      completeTask(taskId, result);
      return { taskId, result };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
      failTask(taskId, errorMessage);
      throw error;
    }
  }, [addTask, updateTask, completeTask, failTask]);

  return { runTask };
}