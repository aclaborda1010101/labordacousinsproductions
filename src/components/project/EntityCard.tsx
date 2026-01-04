/**
 * EntityCard - Unified card component for Characters and Locations
 * Shows: Image, Name, Status, One primary action per state
 * Collapsed: minimal info + single CTA
 * Expanded: editable content + collapsible advanced options
 */

import { ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import {
  ChevronDown,
  ChevronUp,
  Wand2,
  Check,
  Star,
  Edit3,
  Loader2,
  RotateCcw,
  Settings2,
} from 'lucide-react';

export type EntityStatus = 'not_generated' | 'generated' | 'accepted' | 'canon';

interface EntityCardProps {
  id: string;
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  placeholderIcon: ReactNode;
  status: EntityStatus;
  isExpanded: boolean;
  isGenerating?: boolean;
  isPro?: boolean;
  onToggleExpand: () => void;
  onPrimaryAction: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  /** Content shown when expanded */
  expandedContent?: ReactNode;
  /** Advanced options content (Pro mode only) */
  advancedContent?: ReactNode;
  /** Additional badges to show */
  badges?: ReactNode;
  className?: string;
}

export function EntityCard({
  id,
  name,
  description,
  imageUrl,
  placeholderIcon,
  status,
  isExpanded,
  isGenerating = false,
  isPro = false,
  onToggleExpand,
  onPrimaryAction,
  onEdit,
  onDelete,
  expandedContent,
  advancedContent,
  badges,
  className = '',
}: EntityCardProps) {
  // Get status configuration
  const statusConfig = {
    not_generated: {
      badge: null,
      actionLabel: 'Generar',
      actionIcon: <Wand2 className="w-4 h-4 mr-2" />,
      actionVariant: 'gold' as const,
    },
    generated: {
      badge: <Badge variant="outline" className="gap-1"><Check className="w-3 h-3" />Generado</Badge>,
      actionLabel: 'Aceptar',
      actionIcon: <Check className="w-4 h-4 mr-2" />,
      actionVariant: 'default' as const,
    },
    accepted: {
      badge: <Badge className="bg-green-600 gap-1"><Check className="w-3 h-3" />Aceptado</Badge>,
      actionLabel: 'Marcar como canon ⭐',
      actionIcon: <Star className="w-4 h-4 mr-2" />,
      actionVariant: 'outline' as const,
    },
    canon: {
      badge: <Badge className="bg-amber-500 gap-1"><Star className="w-3 h-3" />Canon</Badge>,
      actionLabel: 'Mejorar',
      actionIcon: <RotateCcw className="w-4 h-4 mr-2" />,
      actionVariant: 'outline' as const,
    },
  };

  const config = statusConfig[status];

  return (
    <Card className={`overflow-hidden transition-all ${isExpanded ? 'ring-2 ring-primary/20' : ''} ${className}`}>
      <Collapsible open={isExpanded} onOpenChange={onToggleExpand}>
        <CardContent className="p-0">
          {/* Collapsed header - always visible */}
          <CollapsibleTrigger asChild>
            <div className="p-4 flex items-center gap-4 cursor-pointer hover:bg-muted/50 transition-colors">
              {/* Image/Placeholder */}
              <div className="w-14 h-14 rounded-lg bg-primary/10 flex items-center justify-center overflow-hidden shrink-0">
                {imageUrl ? (
                  <img src={imageUrl} alt={name} className="w-full h-full object-cover" />
                ) : (
                  <div className="text-primary">{placeholderIcon}</div>
                )}
              </div>

              {/* Name and description */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <h3 className="font-semibold text-foreground truncate">{name}</h3>
                  {config.badge}
                  {badges}
                </div>
                {description && (
                  <p className="text-sm text-muted-foreground line-clamp-1">{description}</p>
                )}
              </div>

              {/* Primary action button - single CTA per state */}
              <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                <Button
                  variant={config.actionVariant}
                  size="sm"
                  onClick={onPrimaryAction}
                  disabled={isGenerating}
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Generando...
                    </>
                  ) : (
                    <>
                      {config.actionIcon}
                      {config.actionLabel}
                    </>
                  )}
                </Button>
                
                {/* Expand indicator */}
                <div className="text-muted-foreground">
                  {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </div>
              </div>
            </div>
          </CollapsibleTrigger>

          {/* Expanded content */}
          <CollapsibleContent>
            <div className="px-4 pb-4 border-t bg-muted/30">
              {/* Main expanded content */}
              {expandedContent && (
                <div className="pt-4">
                  {expandedContent}
                </div>
              )}

              {/* Advanced options - Pro mode only */}
              {isPro && advancedContent && (
                <Accordion type="single" collapsible className="mt-4">
                  <AccordionItem value="advanced" className="border rounded-lg">
                    <AccordionTrigger className="px-4 py-2 text-xs text-muted-foreground hover:no-underline">
                      <div className="flex items-center gap-2">
                        <Settings2 className="h-3 w-3" />
                        Opciones avanzadas
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="px-4 pb-4">
                      {advancedContent}
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              )}
            </div>
          </CollapsibleContent>
        </CardContent>
      </Collapsible>
    </Card>
  );
}

/**
 * Helper function to determine entity status from run IDs
 */
export function getEntityStatus(
  currentRunId?: string | null,
  acceptedRunId?: string | null,
  canonAssetId?: string | null
): EntityStatus {
  if (canonAssetId) return 'canon';
  if (acceptedRunId) return 'accepted';
  if (currentRunId) return 'generated';
  return 'not_generated';
}
