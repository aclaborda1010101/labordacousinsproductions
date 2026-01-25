/**
 * Hook to check if there are pending showrunner surgery blocks
 * for a given project and script
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface PendingSurgeryInfo {
  hasPending: boolean;
  blockId: string | null;
  count: number;
  latestCreatedAt: string | null;
}

export function useHasPendingSurgery(projectId: string | null, scriptId: string | null) {
  const [info, setInfo] = useState<PendingSurgeryInfo>({
    hasPending: false,
    blockId: null,
    count: 0,
    latestCreatedAt: null
  });
  const [loading, setLoading] = useState(false);

  const checkPending = useCallback(async () => {
    if (!projectId || !scriptId) {
      setInfo({ hasPending: false, blockId: null, count: 0, latestCreatedAt: null });
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('generation_blocks')
        .select('id, created_at')
        .eq('project_id', projectId)
        .eq('script_id', scriptId)
        .eq('block_type', 'showrunner_surgery')
        .eq('status', 'pending_approval')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error checking pending surgery:', error);
        return;
      }

      if (data && data.length > 0) {
        setInfo({
          hasPending: true,
          blockId: data[0].id,
          count: data.length,
          latestCreatedAt: data[0].created_at
        });
      } else {
        setInfo({ hasPending: false, blockId: null, count: 0, latestCreatedAt: null });
      }
    } catch (err) {
      console.error('Error in useHasPendingSurgery:', err);
    } finally {
      setLoading(false);
    }
  }, [projectId, scriptId]);

  useEffect(() => {
    checkPending();
  }, [checkPending]);

  return { ...info, loading, refetch: checkPending };
}
