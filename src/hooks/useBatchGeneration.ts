import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface BatchSlot {
  slotId: string;
  slotType: 'turnaround' | 'expression' | 'outfit' | 'closeup' | 'base_look';
  viewAngle?: string;
  expressionName?: string;
  outfitDescription?: string;
}

interface BatchResult {
  slotId: string;
  success: boolean;
  imageUrl?: string;
  qcScore?: number;
  error?: string;
}

interface BatchSummary {
  total: number;
  successful: number;
  failed: number;
  durationMs: number;
  usedAnchor: boolean;
}

interface UseBatchGenerationOptions {
  onProgress?: (completed: number, total: number) => void;
  onSlotComplete?: (result: BatchResult) => void;
}

export function useBatchGeneration(options: UseBatchGenerationOptions = {}) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState<{ completed: number; total: number }>({ completed: 0, total: 0 });
  const [results, setResults] = useState<BatchResult[]>([]);
  const [summary, setSummary] = useState<BatchSummary | null>(null);

  const generateBatch = useCallback(async (
    characterId: string,
    slots: BatchSlot[],
    anchorId?: string,
    referenceWeight: number = 0.7
  ): Promise<BatchResult[]> => {
    if (slots.length === 0) {
      toast.error('No slots selected for generation');
      return [];
    }

    setIsGenerating(true);
    setProgress({ completed: 0, total: slots.length });
    setResults([]);
    setSummary(null);

    try {
      toast.info(`Starting batch generation of ${slots.length} slots...`);

      const { data, error } = await supabase.functions.invoke('batch-generate', {
        body: {
          characterId,
          slots,
          sharedAnchorId: anchorId,
          sharedReferenceWeight: referenceWeight,
          parallelLimit: 3
        }
      });

      if (error) {
        throw error;
      }

      if (!data.success) {
        throw new Error(data.error || 'Batch generation failed');
      }

      const batchResults: BatchResult[] = data.results;
      const batchSummary: BatchSummary = data.summary;

      setResults(batchResults);
      setSummary(batchSummary);
      setProgress({ completed: batchSummary.total, total: batchSummary.total });

      // Notify about each result
      batchResults.forEach(result => {
        options.onSlotComplete?.(result);
      });

      // Show summary toast
      if (batchSummary.failed === 0) {
        toast.success(
          `✅ All ${batchSummary.successful} slots generated successfully in ${(batchSummary.durationMs / 1000).toFixed(1)}s`
        );
      } else {
        toast.warning(
          `⚠️ ${batchSummary.successful}/${batchSummary.total} slots generated. ${batchSummary.failed} failed.`
        );
      }

      return batchResults;
    } catch (error) {
      console.error('Batch generation error:', error);
      toast.error(error instanceof Error ? error.message : 'Batch generation failed');
      return [];
    } finally {
      setIsGenerating(false);
    }
  }, [options]);

  const generateMissingSlots = useCallback(async (
    characterId: string,
    anchorId?: string
  ): Promise<BatchResult[]> => {
    try {
      // Fetch slots that need generation
      const { data: slots, error } = await supabase
        .from('character_pack_slots')
        .select('id, slot_type, view_angle, expression_name, status')
        .eq('character_id', characterId)
        .eq('required', true)
        .in('status', ['empty', 'failed']);

      if (error) throw error;

      if (!slots || slots.length === 0) {
        toast.info('No missing required slots to generate');
        return [];
      }

      const batchSlots: BatchSlot[] = slots.map(slot => ({
        slotId: slot.id,
        slotType: slot.slot_type as BatchSlot['slotType'],
        viewAngle: slot.view_angle || undefined,
        expressionName: slot.expression_name || undefined
      }));

      return generateBatch(characterId, batchSlots, anchorId);
    } catch (error) {
      console.error('Error fetching missing slots:', error);
      toast.error('Failed to fetch missing slots');
      return [];
    }
  }, [generateBatch]);

  const generateAllExpressions = useCallback(async (
    characterId: string,
    expressions: string[],
    anchorId?: string
  ): Promise<BatchResult[]> => {
    try {
      // Create slots for each expression if they don't exist
      const slotsToCreate = expressions.map((expr, idx) => ({
        character_id: characterId,
        slot_type: 'expression',
        expression_name: expr,
        slot_index: idx + 100, // Offset to avoid conflicts
        required: false,
        status: 'empty'
      }));

      // Upsert slots
      for (const slot of slotsToCreate) {
        await supabase
          .from('character_pack_slots')
          .upsert(slot, { 
            onConflict: 'character_id,slot_type,expression_name',
            ignoreDuplicates: true 
          });
      }

      // Fetch the created slots
      const { data: slots } = await supabase
        .from('character_pack_slots')
        .select('id, slot_type, expression_name')
        .eq('character_id', characterId)
        .eq('slot_type', 'expression')
        .in('expression_name', expressions)
        .eq('status', 'empty');

      if (!slots || slots.length === 0) {
        toast.info('All expression slots already generated');
        return [];
      }

      const batchSlots: BatchSlot[] = slots.map(slot => ({
        slotId: slot.id,
        slotType: 'expression',
        expressionName: slot.expression_name || undefined
      }));

      return generateBatch(characterId, batchSlots, anchorId);
    } catch (error) {
      console.error('Error generating expressions:', error);
      toast.error('Failed to generate expressions');
      return [];
    }
  }, [generateBatch]);

  return {
    generateBatch,
    generateMissingSlots,
    generateAllExpressions,
    isGenerating,
    progress,
    results,
    summary
  };
}

export default useBatchGeneration;
