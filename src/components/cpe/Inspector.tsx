/**
 * Inspector - Right sidebar showing detailed properties
 * of the currently selected canon element or feed block
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Info,
  User,
  MapPin,
  Box,
  Sparkles,
  Clock,
  Film,
  Camera,
  Lightbulb,
  Gauge,
  Ratio,
  Move,
  Palette,
  FileText,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CanonElement } from './CanonVault';
import type { FeedBlock } from './ProductionFeed';

interface InspectorProps {
  selectedElement: CanonElement | null;
  selectedBlock: FeedBlock | null;
}

const priorityColors = {
  P0: 'text-red-400 border-red-500/50 bg-red-500/10',
  P1: 'text-orange-400 border-orange-500/50 bg-orange-500/10',
  P2: 'text-blue-400 border-blue-500/50 bg-blue-500/10',
  P3: 'text-zinc-400 border-zinc-500/50 bg-zinc-500/10',
};

const typeIcons = {
  character: User,
  location: MapPin,
  prop: Box,
  style: Sparkles,
  continuity: Clock,
};

function CanonInspector({ element }: { element: CanonElement }) {
  const TypeIcon = typeIcons[element.type] || Box;
  const specs = element.specs || {};

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <TypeIcon className="h-5 w-5 text-muted-foreground" />
          <h3 className="text-lg font-semibold">{element.name}</h3>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={cn('text-xs', priorityColors[element.priority])}>
            {element.priority}
          </Badge>
          <Badge variant="secondary" className="text-xs capitalize">
            {element.type}
          </Badge>
        </div>
      </div>

      <Separator className="bg-zinc-700/50" />

      {/* Description */}
      {element.description && (
        <div className="space-y-1">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Description
          </h4>
          <p className="text-sm">{element.description}</p>
        </div>
      )}

      {/* Specs */}
      {Object.keys(specs).length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Specifications
          </h4>
          <div className="space-y-2">
            {Object.entries(specs).map(([key, value]) => (
              <div key={key} className="bg-zinc-800/50 rounded p-2">
                <span className="text-[10px] text-muted-foreground uppercase block mb-1">
                  {key.replace(/_/g, ' ')}
                </span>
                <span className="text-sm font-medium">
                  {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Canon Rules */}
      <div className="space-y-2">
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Canon Enforcement
        </h4>
        <Card className="bg-zinc-800/30 border-zinc-700/50">
          <CardContent className="py-3 px-3">
            {element.priority === 'P0' && (
              <p className="text-xs text-red-400">
                🔒 This element is LOCKED. Any modification requires explicit override and will trigger a Critical Alert.
              </p>
            )}
            {element.priority === 'P1' && (
              <p className="text-xs text-orange-400">
                ⚠️ Continuity element. Changes will be tracked and may trigger regeneration of dependent scenes.
              </p>
            )}
            {element.priority === 'P2' && (
              <p className="text-xs text-blue-400">
                🎨 Visual preference. Can be overridden per-scene with explicit commands.
              </p>
            )}
            {element.priority === 'P3' && (
              <p className="text-xs text-zinc-400">
                ✨ Preference element. Lowest priority, easily overridden.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function SceneInspector({ block }: { block: FeedBlock }) {
  const data = block.data as {
    slugline?: string;
    specs?: Record<string, string>;
    narrative?: string;
    script?: string;
  };

  const specs = data.specs || {};

  const specIcons: Record<string, typeof Camera> = {
    lens: Camera,
    light: Lightbulb,
    fps: Gauge,
    aspect: Ratio,
    camera_movement: Move,
    color_grade: Palette,
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Film className="h-5 w-5 text-emerald-400" />
          <h3 className="text-sm font-mono font-semibold text-emerald-400">
            {data.slugline || 'UNTITLED SCENE'}
          </h3>
        </div>
        <Badge variant="outline" className="text-xs border-emerald-500/50 text-emerald-400">
          Scene Block
        </Badge>
      </div>

      <Separator className="bg-zinc-700/50" />

      {/* Technical Specs */}
      <div className="space-y-2">
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Technical Specifications
        </h4>
        <div className="space-y-2">
          {Object.entries(specs).map(([key, value]) => {
            const Icon = specIcons[key] || Info;
            return (
              <div key={key} className="bg-zinc-800/50 rounded p-3 flex items-start gap-3">
                <Icon className="h-4 w-4 text-muted-foreground mt-0.5" />
                <div>
                  <span className="text-[10px] text-muted-foreground uppercase block">
                    {key.replace(/_/g, ' ')}
                  </span>
                  <span className="text-sm font-medium">{value}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Narrative */}
      {data.narrative && (
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Narrative
          </h4>
          <p className="text-sm text-muted-foreground">{data.narrative}</p>
        </div>
      )}

      {/* Script */}
      {data.script && (
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <FileText className="h-3 w-3" />
            Script
          </h4>
          <Card className="bg-zinc-800/30 border-zinc-700/50">
            <CardContent className="py-3 px-3">
              <pre className="text-xs font-mono whitespace-pre-wrap">{data.script}</pre>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

export function Inspector({ selectedElement, selectedBlock }: InspectorProps) {
  const hasSelection = selectedElement || selectedBlock;

  return (
    <div className="h-full flex flex-col bg-background/50 border-l border-border">
      <div className="p-4 border-b border-border">
        <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
          <Info className="h-4 w-4" />
          Inspector
        </h2>
        <p className="text-xs text-muted-foreground mt-1">
          {hasSelection ? 'Viewing details' : 'Select an element'}
        </p>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4">
          {!hasSelection && (
            <div className="text-center py-12">
              <Info className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
              <p className="text-sm text-muted-foreground">
                No selection
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Click on a canon element or scene block to inspect
              </p>
            </div>
          )}

          {selectedElement && <CanonInspector element={selectedElement} />}
          
          {selectedBlock && selectedBlock.block_type === 'scene' && (
            <SceneInspector block={selectedBlock} />
          )}

          {selectedBlock && selectedBlock.block_type === 'alert' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Info className="h-5 w-5 text-muted-foreground" />
                <h3 className="text-lg font-semibold">Alert Details</h3>
              </div>
              <Separator className="bg-zinc-700/50" />
              <Card className="bg-zinc-800/30 border-zinc-700/50">
                <CardContent className="py-3 px-3">
                  <pre className="text-xs whitespace-pre-wrap">
                    {JSON.stringify(selectedBlock.data, null, 2)}
                  </pre>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
