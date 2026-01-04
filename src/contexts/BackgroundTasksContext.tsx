import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

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
  | 'script_breakdown'
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
}

const BackgroundTasksContext = createContext<BackgroundTasksContextType | undefined>(undefined);

const STORAGE_KEY = 'background_tasks';
const MAX_COMPLETED_TASKS = 50;

export function BackgroundTasksProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<BackgroundTask[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [lastReadAt, setLastReadAt] = useState<string>(new Date().toISOString());

  // Load tasks from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as BackgroundTask[];
        // Filter out very old completed tasks (older than 24h)
        const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const filtered = parsed.filter(t => 
          t.status === 'running' || t.status === 'pending' || t.updatedAt > cutoff
        );
        setTasks(filtered);
      }
      
      const lastRead = localStorage.getItem('background_tasks_last_read');
      if (lastRead) {
        setLastReadAt(lastRead);
      }
    } catch (e) {
      console.error('Failed to load background tasks:', e);
    }
  }, []);

  // Save tasks to localStorage whenever they change
  useEffect(() => {
    try {
      // Keep only recent completed tasks
      const toStore = tasks.slice(-MAX_COMPLETED_TASKS);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
    } catch (e) {
      console.error('Failed to save background tasks:', e);
    }
  }, [tasks]);

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

    setTasks(prev => [...prev, newTask]);
    return taskId;
  }, []);

  const updateTask = useCallback((taskId: string, updates: Partial<BackgroundTask>) => {
    setTasks(prev => prev.map(task => 
      task.id === taskId 
        ? { ...task, ...updates, updatedAt: new Date().toISOString() }
        : task
    ));
  }, []);

  const completeTask = useCallback((taskId: string, result?: any) => {
    const now = new Date().toISOString();
    setTasks(prev => prev.map(task => 
      task.id === taskId 
        ? { ...task, status: 'completed' as TaskStatus, progress: 100, result, completedAt: now, updatedAt: now }
        : task
    ));
  }, []);

  const failTask = useCallback((taskId: string, error: string) => {
    setTasks(prev => prev.map(task => 
      task.id === taskId 
        ? { ...task, status: 'failed' as TaskStatus, error, updatedAt: new Date().toISOString() }
        : task
    ));
  }, []);

  const cancelTask = useCallback((taskId: string) => {
    setTasks(prev => prev.map(task => 
      task.id === taskId 
        ? { ...task, status: 'cancelled' as TaskStatus, updatedAt: new Date().toISOString() }
        : task
    ));
  }, []);

  const removeTask = useCallback((taskId: string) => {
    setTasks(prev => prev.filter(task => task.id !== taskId));
  }, []);

  const clearCompleted = useCallback(() => {
    setTasks(prev => prev.filter(task => task.status === 'running' || task.status === 'pending'));
  }, []);

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
