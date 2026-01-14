import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface PanelStatus {
  panel_no: number;
  status: 'pending' | 'generating' | 'success' | 'error';
  error?: string;
}

interface StoryboardProgress {
  panelStatuses: PanelStatus[];
  currentPhase: 'planning' | 'generating_images' | 'saving';
  progress: number;
  currentPanel: number | null;
  elapsedSeconds: number;
  estimatedRemainingMs: number;
  totalPanels: number;
}

const AVERAGE_PLANNING_TIME_MS = 15000; // ~15s for GPT-5.2 planning
const AVERAGE_IMAGE_TIME_MS = 28000; // ~28s per panel image

export function useStoryboardProgress(
  sceneId: string, 
  isGenerating: boolean,
  expectedPanelCount: number = 8
): StoryboardProgress {
  const [panelStatuses, setPanelStatuses] = useState<PanelStatus[]>([]);
  const [currentPhase, setCurrentPhase] = useState<'planning' | 'generating_images' | 'saving'>('planning');
  const [progress, setProgress] = useState(0);
  const [currentPanel, setCurrentPanel] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [totalPanels, setTotalPanels] = useState(expectedPanelCount);
  
  const startTimeRef = useRef<number | null>(null);
  const completedTimesRef = useRef<number[]>([]);

  // Track elapsed time
  useEffect(() => {
    if (!isGenerating) {
      startTimeRef.current = null;
      setElapsedSeconds(0);
      return;
    }

    if (!startTimeRef.current) {
      startTimeRef.current = Date.now();
    }

    const timer = setInterval(() => {
      if (startTimeRef.current) {
        setElapsedSeconds(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [isGenerating]);

  // Poll for panel statuses
  useEffect(() => {
    if (!isGenerating || !sceneId) {
      setPanelStatuses([]);
      setCurrentPhase('planning');
      setProgress(0);
      setCurrentPanel(null);
      return;
    }

    const pollStatuses = async () => {
      try {
        const { data, error } = await supabase
          .from('storyboard_panels')
          .select('panel_no, image_status, image_error')
          .eq('scene_id', sceneId)
          .order('panel_no');

        if (error) {
          console.error('Error polling storyboard panels:', error);
          return;
        }

        if (!data || data.length === 0) {
          // Still in planning phase
          setCurrentPhase('planning');
          setProgress(5); // Show some progress during planning
          return;
        }

        // We have panels - update total count
        setTotalPanels(data.length);

        // Map to status objects
        const statuses: PanelStatus[] = data.map(panel => {
          let status: PanelStatus['status'] = 'pending';
          
          if (panel.image_status === 'success') {
            status = 'success';
          } else if (panel.image_status === 'generating') {
            status = 'generating';
          } else if (panel.image_status === 'error') {
            status = 'error';
          }

          return {
            panel_no: panel.panel_no,
            status,
            error: panel.image_error || undefined,
          };
        });

        setPanelStatuses(statuses);

        // Determine current phase and panel
        const completedCount = statuses.filter(s => s.status === 'success').length;
        const generatingPanel = statuses.find(s => s.status === 'generating');
        const allComplete = statuses.every(s => s.status === 'success' || s.status === 'error');

        if (allComplete) {
          setCurrentPhase('saving');
          setProgress(95);
          setCurrentPanel(null);
        } else if (generatingPanel) {
          setCurrentPhase('generating_images');
          setCurrentPanel(generatingPanel.panel_no);
          
          // Calculate progress: 10% for planning + 85% for images
          const imageProgress = (completedCount / data.length) * 85;
          setProgress(Math.round(10 + imageProgress));

          // Track completion times for ETA
          if (completedCount > completedTimesRef.current.length) {
            completedTimesRef.current.push(Date.now());
          }
        } else if (completedCount === 0) {
          // Panels exist but none generating yet - still planning or about to start
          setCurrentPhase('generating_images');
          setProgress(10);
          setCurrentPanel(1);
        }

      } catch (err) {
        console.error('Error in storyboard progress poll:', err);
      }
    };

    // Initial poll
    pollStatuses();

    // Poll every 2 seconds
    const interval = setInterval(pollStatuses, 2000);

    return () => clearInterval(interval);
  }, [sceneId, isGenerating]);

  // Calculate estimated remaining time
  const estimatedRemainingMs = useCallback(() => {
    const completedCount = panelStatuses.filter(s => s.status === 'success').length;
    const remainingPanels = totalPanels - completedCount;

    if (currentPhase === 'planning') {
      // Estimate: planning time + all images
      return AVERAGE_PLANNING_TIME_MS + (totalPanels * AVERAGE_IMAGE_TIME_MS);
    }

    if (currentPhase === 'saving') {
      return 5000; // ~5s to save
    }

    // Calculate average time per panel from actual data
    if (completedTimesRef.current.length >= 2) {
      const times = completedTimesRef.current;
      const avgTime = (times[times.length - 1] - times[0]) / (times.length - 1);
      return remainingPanels * avgTime;
    }

    // Fallback to average estimate
    return remainingPanels * AVERAGE_IMAGE_TIME_MS;
  }, [panelStatuses, totalPanels, currentPhase]);

  return {
    panelStatuses,
    currentPhase,
    progress,
    currentPanel,
    elapsedSeconds,
    estimatedRemainingMs: estimatedRemainingMs(),
    totalPanels,
  };
}
