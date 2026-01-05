/**
 * CinematicProductionEngine - Main container component
 * 3-column layout: CanonVault | ProductionFeed | Inspector
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { CanonVault, CanonElement } from './CanonVault';
import { ProductionFeed, FeedBlock } from './ProductionFeed';
import { Inspector } from './Inspector';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';

interface CinematicProductionEngineProps {
  projectId: string;
}

export function CinematicProductionEngine({ projectId }: CinematicProductionEngineProps) {
  const [canonElements, setCanonElements] = useState<CanonElement[]>([]);
  const [feedBlocks, setFeedBlocks] = useState<FeedBlock[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedElement, setSelectedElement] = useState<CanonElement | null>(null);
  const [selectedBlock, setSelectedBlock] = useState<FeedBlock | null>(null);

  // Load initial data
  useEffect(() => {
    const loadData = async () => {
      // Load canon elements
      const { data: elements, error: elementsError } = await supabase
        .from('cpe_canon_elements')
        .select('*')
        .eq('project_id', projectId)
        .order('priority', { ascending: true });

      if (elementsError) {
        console.error('Error loading canon elements:', elementsError);
      } else {
        setCanonElements(elements as CanonElement[]);
      }

      // Load feed blocks
      const { data: blocks, error: blocksError } = await supabase
        .from('cpe_feed_blocks')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: true });

      if (blocksError) {
        console.error('Error loading feed blocks:', blocksError);
      } else {
        setFeedBlocks(blocks as FeedBlock[]);
      }
    };

    loadData();
  }, [projectId]);

  // Subscribe to realtime updates
  useEffect(() => {
    const canonChannel = supabase
      .channel('cpe-canon-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'cpe_canon_elements',
          filter: `project_id=eq.${projectId}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setCanonElements((prev) => [...prev, payload.new as CanonElement]);
          } else if (payload.eventType === 'UPDATE') {
            setCanonElements((prev) =>
              prev.map((el) => (el.id === payload.new.id ? (payload.new as CanonElement) : el))
            );
          } else if (payload.eventType === 'DELETE') {
            setCanonElements((prev) => prev.filter((el) => el.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    const feedChannel = supabase
      .channel('cpe-feed-changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'cpe_feed_blocks',
          filter: `project_id=eq.${projectId}`,
        },
        (payload) => {
          setFeedBlocks((prev) => [...prev, payload.new as FeedBlock]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canonChannel);
      supabase.removeChannel(feedChannel);
    };
  }, [projectId]);

  // Send command to production engine
  const handleSendCommand = useCallback(async (command: string) => {
    setIsLoading(true);
    setSelectedElement(null);
    setSelectedBlock(null);

    try {
      const { data, error } = await supabase.functions.invoke('production-engine', {
        body: {
          projectId,
          command,
          canonElements,
        },
      });

      if (error) {
        throw error;
      }

      if (data?.response?.status === 'error') {
        toast.error('Canon violation detected', {
          description: data.response.ui_blocks?.find((b: Record<string, unknown>) => b.type === 'violation_alert')?.message,
        });
      } else if (data?.response?.status === 'warning') {
        toast.warning('Continuity warning', {
          description: 'Some elements may need review',
        });
      } else {
        toast.success('Command processed');
      }

      // Refresh data after processing
      const { data: newElements } = await supabase
        .from('cpe_canon_elements')
        .select('*')
        .eq('project_id', projectId)
        .order('priority', { ascending: true });

      if (newElements) {
        setCanonElements(newElements as CanonElement[]);
      }

      const { data: newBlocks } = await supabase
        .from('cpe_feed_blocks')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: true });

      if (newBlocks) {
        setFeedBlocks(newBlocks as FeedBlock[]);
      }
    } catch (err) {
      console.error('Error sending command:', err);
      toast.error('Failed to process command');
    } finally {
      setIsLoading(false);
    }
  }, [projectId, canonElements]);

  const handleSelectElement = (element: CanonElement) => {
    setSelectedElement(element);
    setSelectedBlock(null);
  };

  const handleSelectBlock = (block: FeedBlock) => {
    setSelectedBlock(block);
    setSelectedElement(null);
  };

  return (
    <div className="h-[calc(100vh-4rem)] bg-background">
      <ResizablePanelGroup direction="horizontal" className="h-full">
        {/* Left Sidebar - Canon Vault */}
        <ResizablePanel defaultSize={20} minSize={15} maxSize={30}>
          <CanonVault
            elements={canonElements}
            selectedElementId={selectedElement?.id || null}
            onSelectElement={handleSelectElement}
          />
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Center Column - Production Feed */}
        <ResizablePanel defaultSize={50} minSize={35}>
          <ProductionFeed
            blocks={feedBlocks}
            isLoading={isLoading}
            onSendCommand={handleSendCommand}
            onSelectBlock={handleSelectBlock}
            selectedBlockId={selectedBlock?.id || null}
          />
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Right Sidebar - Inspector */}
        <ResizablePanel defaultSize={30} minSize={20} maxSize={40}>
          <Inspector
            selectedElement={selectedElement}
            selectedBlock={selectedBlock}
          />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
