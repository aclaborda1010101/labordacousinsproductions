/**
 * CanonVault - Left sidebar showing canon elements grouped by priority
 * P0 (Identity) - Red badges
 * P1 (Continuity) - Orange badges  
 * P2 (Visuals) - Blue badges
 * P3 (Preferences) - Gray badges
 */

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import {
  ChevronDown,
  ChevronRight,
  Shield,
  Link,
  Palette,
  Star,
  User,
  MapPin,
  Box,
  Sparkles,
  Clock,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface CanonElement {
  id: string;
  name: string;
  type: 'character' | 'location' | 'prop' | 'style' | 'continuity';
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  specs: Record<string, unknown>;
  description?: string;
}

interface CanonVaultProps {
  elements: CanonElement[];
  selectedElementId: string | null;
  onSelectElement: (element: CanonElement) => void;
}

const priorityConfig = {
  P0: {
    label: 'Identity (Critical)',
    icon: Shield,
    badgeClass: 'bg-red-500/20 text-red-400 border-red-500/50',
    headerClass: 'text-red-400',
  },
  P1: {
    label: 'Continuity',
    icon: Link,
    badgeClass: 'bg-orange-500/20 text-orange-400 border-orange-500/50',
    headerClass: 'text-orange-400',
  },
  P2: {
    label: 'Visuals',
    icon: Palette,
    badgeClass: 'bg-blue-500/20 text-blue-400 border-blue-500/50',
    headerClass: 'text-blue-400',
  },
  P3: {
    label: 'Preferences',
    icon: Star,
    badgeClass: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/50',
    headerClass: 'text-zinc-400',
  },
};

const typeIcons = {
  character: User,
  location: MapPin,
  prop: Box,
  style: Sparkles,
  continuity: Clock,
};

export function CanonVault({ elements, selectedElementId, onSelectElement }: CanonVaultProps) {
  const [expandedPriorities, setExpandedPriorities] = useState<Set<string>>(
    new Set(['P0', 'P1', 'P2'])
  );

  const togglePriority = (priority: string) => {
    const newExpanded = new Set(expandedPriorities);
    if (newExpanded.has(priority)) {
      newExpanded.delete(priority);
    } else {
      newExpanded.add(priority);
    }
    setExpandedPriorities(newExpanded);
  };

  const groupedElements = elements.reduce((acc, el) => {
    if (!acc[el.priority]) acc[el.priority] = [];
    acc[el.priority].push(el);
    return acc;
  }, {} as Record<string, CanonElement[]>);

  return (
    <div className="h-full flex flex-col bg-background/50 border-r border-border">
      <div className="p-4 border-b border-border">
        <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
          <Shield className="h-4 w-4" />
          Canon Vault
        </h2>
        <p className="text-xs text-muted-foreground mt-1">
          {elements.length} elements locked
        </p>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {(['P0', 'P1', 'P2', 'P3'] as const).map((priority) => {
            const config = priorityConfig[priority];
            const Icon = config.icon;
            const priorityElements = groupedElements[priority] || [];

            return (
              <Collapsible
                key={priority}
                open={expandedPriorities.has(priority)}
                onOpenChange={() => togglePriority(priority)}
              >
                <CollapsibleTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn(
                      'w-full justify-between px-3 py-2 h-auto',
                      config.headerClass
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4" />
                      <span className="text-xs font-semibold">
                        {priority} - {config.label}
                      </span>
                      <Badge variant="outline" className={cn('text-[10px] px-1.5', config.badgeClass)}>
                        {priorityElements.length}
                      </Badge>
                    </div>
                    {expandedPriorities.has(priority) ? (
                      <ChevronDown className="h-3 w-3" />
                    ) : (
                      <ChevronRight className="h-3 w-3" />
                    )}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="pl-4 pr-2 py-1 space-y-1">
                    {priorityElements.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-2 px-2">
                        No elements
                      </p>
                    ) : (
                      priorityElements.map((element) => {
                        const TypeIcon = typeIcons[element.type] || Box;
                        return (
                          <button
                            key={element.id}
                            onClick={() => onSelectElement(element)}
                            className={cn(
                              'w-full text-left p-2 rounded-md transition-colors',
                              'hover:bg-accent/50',
                              'border border-transparent',
                              selectedElementId === element.id && 'bg-accent border-primary/50'
                            )}
                          >
                            <div className="flex items-center gap-2">
                              <TypeIcon className="h-3 w-3 text-muted-foreground" />
                              <span className="text-xs font-medium truncate">
                                {element.name}
                              </span>
                            </div>
                            {element.description && (
                              <p className="text-[10px] text-muted-foreground mt-1 truncate pl-5">
                                {element.description}
                              </p>
                            )}
                          </button>
                        );
                      })
                    )}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
