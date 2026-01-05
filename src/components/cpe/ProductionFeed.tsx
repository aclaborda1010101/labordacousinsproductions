/**
 * ProductionFeed - Center column with scrollable feed and command input
 * Displays blocks: AnalysisBlock, SceneBlock, AlertBlock
 */

import { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
  Send,
  Loader2,
  ChevronDown,
  ChevronRight,
  Brain,
  Film,
  AlertTriangle,
  AlertCircle,
  Terminal,
  Camera,
  Lightbulb,
  Gauge,
  Ratio,
  Move,
  Palette,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface FeedBlock {
  id: string;
  block_type: 'analysis' | 'scene' | 'alert' | 'command';
  data: Record<string, unknown>;
  status: 'success' | 'warning' | 'error';
  created_at: string;
}

interface ProductionFeedProps {
  blocks: FeedBlock[];
  isLoading: boolean;
  onSendCommand: (command: string) => void;
  onSelectBlock: (block: FeedBlock) => void;
  selectedBlockId: string | null;
}

function AnalysisBlock({ block, isExpanded, onToggle }: { 
  block: FeedBlock; 
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const content = (block.data as { content?: string })?.content || '';
  
  return (
    <Collapsible open={isExpanded} onOpenChange={onToggle}>
      <CollapsibleTrigger asChild>
        <Card className="cursor-pointer hover:bg-accent/30 transition-colors border-zinc-700/50">
          <CardHeader className="py-2 px-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Brain className="h-4 w-4 text-purple-400" />
                <span className="text-xs font-medium text-purple-400">Engine Analysis</span>
              </div>
              {isExpanded ? (
                <ChevronDown className="h-3 w-3 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-3 w-3 text-muted-foreground" />
              )}
            </div>
          </CardHeader>
          <CollapsibleContent>
            <CardContent className="pt-0 pb-3 px-3">
              <p className="text-xs text-muted-foreground whitespace-pre-wrap">
                {content}
              </p>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </CollapsibleTrigger>
    </Collapsible>
  );
}

function SceneBlock({ block, isSelected, onSelect }: { 
  block: FeedBlock; 
  isSelected: boolean;
  onSelect: () => void;
}) {
  const data = block.data as {
    slugline?: string;
    specs?: {
      lens?: string;
      light?: string;
      fps?: string;
      aspect?: string;
      camera_movement?: string;
      color_grade?: string;
    };
    narrative?: string;
  };

  const specs = data.specs || {};

  return (
    <Card 
      className={cn(
        "cursor-pointer transition-all border-zinc-700/50",
        "hover:border-primary/50",
        isSelected && "border-primary ring-1 ring-primary/30"
      )}
      onClick={onSelect}
    >
      <CardHeader className="py-3 px-4 bg-gradient-to-r from-zinc-800/50 to-transparent">
        <div className="flex items-center gap-2">
          <Film className="h-4 w-4 text-emerald-400" />
          <span className="text-sm font-mono font-semibold text-emerald-400">
            {data.slugline || 'UNTITLED SCENE'}
          </span>
        </div>
      </CardHeader>
      <CardContent className="pt-3 pb-4 px-4 space-y-3">
        {/* Technical Specs Grid */}
        <div className="grid grid-cols-3 gap-2">
          {specs.lens && (
            <div className="bg-zinc-800/50 rounded p-2">
              <div className="flex items-center gap-1 mb-1">
                <Camera className="h-3 w-3 text-blue-400" />
                <span className="text-[10px] text-muted-foreground uppercase">Lens</span>
              </div>
              <p className="text-xs font-medium">{specs.lens}</p>
            </div>
          )}
          {specs.light && (
            <div className="bg-zinc-800/50 rounded p-2">
              <div className="flex items-center gap-1 mb-1">
                <Lightbulb className="h-3 w-3 text-yellow-400" />
                <span className="text-[10px] text-muted-foreground uppercase">Light</span>
              </div>
              <p className="text-xs font-medium">{specs.light}</p>
            </div>
          )}
          {specs.fps && (
            <div className="bg-zinc-800/50 rounded p-2">
              <div className="flex items-center gap-1 mb-1">
                <Gauge className="h-3 w-3 text-green-400" />
                <span className="text-[10px] text-muted-foreground uppercase">FPS</span>
              </div>
              <p className="text-xs font-medium">{specs.fps}</p>
            </div>
          )}
          {specs.aspect && (
            <div className="bg-zinc-800/50 rounded p-2">
              <div className="flex items-center gap-1 mb-1">
                <Ratio className="h-3 w-3 text-purple-400" />
                <span className="text-[10px] text-muted-foreground uppercase">Aspect</span>
              </div>
              <p className="text-xs font-medium">{specs.aspect}</p>
            </div>
          )}
          {specs.camera_movement && (
            <div className="bg-zinc-800/50 rounded p-2">
              <div className="flex items-center gap-1 mb-1">
                <Move className="h-3 w-3 text-cyan-400" />
                <span className="text-[10px] text-muted-foreground uppercase">Movement</span>
              </div>
              <p className="text-xs font-medium">{specs.camera_movement}</p>
            </div>
          )}
          {specs.color_grade && (
            <div className="bg-zinc-800/50 rounded p-2">
              <div className="flex items-center gap-1 mb-1">
                <Palette className="h-3 w-3 text-pink-400" />
                <span className="text-[10px] text-muted-foreground uppercase">Grade</span>
              </div>
              <p className="text-xs font-medium">{specs.color_grade}</p>
            </div>
          )}
        </div>

        {/* Narrative */}
        {data.narrative && (
          <p className="text-xs text-muted-foreground border-t border-zinc-700/50 pt-2">
            {data.narrative}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function AlertBlock({ block }: { block: FeedBlock }) {
  const data = block.data as {
    level?: 'P0' | 'P1' | 'P2';
    message?: string;
    element?: string;
  };

  const isP0 = data.level === 'P0';
  const Icon = isP0 ? AlertCircle : AlertTriangle;

  return (
    <Card className={cn(
      "border-2",
      isP0 ? "border-red-500/50 bg-red-950/20" : "border-orange-500/50 bg-orange-950/20"
    )}>
      <CardContent className="py-3 px-4">
        <div className="flex items-start gap-3">
          <Icon className={cn("h-5 w-5 mt-0.5", isP0 ? "text-red-400" : "text-orange-400")} />
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="outline" className={cn(
                "text-[10px]",
                isP0 ? "border-red-500/50 text-red-400" : "border-orange-500/50 text-orange-400"
              )}>
                {data.level} VIOLATION
              </Badge>
              {data.element && (
                <span className="text-xs text-muted-foreground">
                  → {data.element}
                </span>
              )}
            </div>
            <p className={cn("text-sm", isP0 ? "text-red-300" : "text-orange-300")}>
              {data.message || 'Canon violation detected'}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CommandBlock({ block }: { block: FeedBlock }) {
  const command = (block.data as { command?: string })?.command || '';
  
  return (
    <div className="flex items-start gap-2 py-2 px-3 bg-zinc-800/30 rounded-lg">
      <Terminal className="h-4 w-4 text-muted-foreground mt-0.5" />
      <p className="text-sm font-mono text-foreground">{command}</p>
    </div>
  );
}

export function ProductionFeed({ 
  blocks, 
  isLoading, 
  onSendCommand, 
  onSelectBlock,
  selectedBlockId 
}: ProductionFeedProps) {
  const [command, setCommand] = useState('');
  const [expandedAnalysis, setExpandedAnalysis] = useState<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom when new blocks arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [blocks]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!command.trim() || isLoading) return;
    onSendCommand(command.trim());
    setCommand('');
  };

  const toggleAnalysis = (id: string) => {
    const newExpanded = new Set(expandedAnalysis);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedAnalysis(newExpanded);
  };

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <Film className="h-4 w-4" />
            Production Feed
          </h2>
          <p className="text-xs text-muted-foreground">
            {blocks.length} blocks generated
          </p>
        </div>
        <Badge variant="outline" className="text-[10px] border-emerald-500/50 text-emerald-400">
          SUPERPRODUCTION_REALISM
        </Badge>
      </div>

      {/* Feed Area */}
      <ScrollArea className="flex-1" ref={scrollRef}>
        <div className="p-4 space-y-3">
          {blocks.length === 0 && !isLoading && (
            <div className="text-center py-12">
              <Film className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
              <p className="text-sm text-muted-foreground">
                No production blocks yet
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Enter a command below to start generating
              </p>
            </div>
          )}

          {blocks.map((block) => {
            switch (block.block_type) {
              case 'analysis':
                return (
                  <AnalysisBlock
                    key={block.id}
                    block={block}
                    isExpanded={expandedAnalysis.has(block.id)}
                    onToggle={() => toggleAnalysis(block.id)}
                  />
                );
              case 'scene':
                return (
                  <SceneBlock
                    key={block.id}
                    block={block}
                    isSelected={selectedBlockId === block.id}
                    onSelect={() => onSelectBlock(block)}
                  />
                );
              case 'alert':
                return <AlertBlock key={block.id} block={block} />;
              case 'command':
                return <CommandBlock key={block.id} block={block} />;
              default:
                return null;
            }
          })}

          {isLoading && (
            <div className="flex items-center gap-2 py-4 px-3 bg-zinc-800/30 rounded-lg animate-pulse">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span className="text-sm text-muted-foreground">
                Engine processing...
              </span>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Command Input */}
      <div className="p-4 border-t border-border bg-zinc-900/50">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input
            ref={inputRef}
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            placeholder="Enter production command (e.g., 'Create scene 1 in the rain')"
            className="flex-1 bg-background/50 border-zinc-700 focus:border-primary"
            disabled={isLoading}
          />
          <Button type="submit" size="icon" disabled={isLoading || !command.trim()}>
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </form>
        <p className="text-[10px] text-muted-foreground mt-2">
          Commands: "Create scene...", "Add character...", "Define location...", "Check continuity"
        </p>
      </div>
    </div>
  );
}
