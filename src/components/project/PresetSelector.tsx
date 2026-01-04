/**
 * PresetSelector - Reorderable preset selector with recommendation badges
 */

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CheckCircle2, AlertTriangle, FlaskConical } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PresetWithMetrics } from '@/lib/recommendations';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface PresetOption<T extends string> {
  type: T;
  label: string;
  icon: React.ReactNode;
}

interface PresetSelectorProps<T extends string> {
  presets: PresetOption<T>[];
  selectedPreset: T;
  onSelect: (preset: T) => void;
  orderedPresets?: PresetWithMetrics[];
  disabled?: boolean;
}

export function PresetSelector<T extends string>({
  presets,
  selectedPreset,
  onSelect,
  orderedPresets,
  disabled
}: PresetSelectorProps<T>) {
  // If we have ordered presets, use that order; otherwise use original
  const sortedPresets = orderedPresets 
    ? orderedPresets.map(op => {
        const preset = presets.find(p => p.type === op.presetId);
        return preset ? { preset, metrics: op } : null;
      }).filter(Boolean) as { preset: PresetOption<T>; metrics: PresetWithMetrics }[]
    : presets.map(preset => ({ 
        preset, 
        metrics: null as PresetWithMetrics | null 
      }));

  return (
    <TooltipProvider>
      <div className="flex flex-wrap gap-2">
        {sortedPresets.map(({ preset, metrics }) => {
          const isSelected = selectedPreset === preset.type;
          const isRecommended = metrics?.isRecommended ?? false;
          const hasLowData = metrics?.hasLowData ?? false;
          const hasHighFriction = metrics?.hasHighFriction ?? false;

          return (
            <Tooltip key={preset.type}>
              <TooltipTrigger asChild>
                <Button
                  variant={isSelected ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => onSelect(preset.type)}
                  disabled={disabled}
                  className={cn(
                    'gap-2 relative',
                    isRecommended && !isSelected && 'border-green-500/50 bg-green-500/5',
                    hasHighFriction && !isSelected && 'border-yellow-500/50'
                  )}
                >
                  {preset.icon}
                  <span>{preset.label}</span>
                  
                  {/* Badges */}
                  <div className="flex items-center gap-1 ml-1">
                    {isRecommended && (
                      <CheckCircle2 className="w-3 h-3 text-green-500" />
                    )}
                    {hasLowData && !isRecommended && (
                      <FlaskConical className="w-3 h-3 text-muted-foreground" />
                    )}
                    {hasHighFriction && (
                      <AlertTriangle className="w-3 h-3 text-yellow-500" />
                    )}
                  </div>
                </Button>
              </TooltipTrigger>
              
              <TooltipContent side="bottom" className="max-w-xs">
                <div className="space-y-1 text-xs">
                  {isRecommended && (
                    <div className="flex items-center gap-1 text-green-600 font-medium">
                      <CheckCircle2 className="w-3 h-3" />
                      Recomendado
                    </div>
                  )}
                  {hasLowData && (
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <FlaskConical className="w-3 h-3" />
                      Pocos datos ({metrics?.metrics?.totalRuns || 0} runs)
                    </div>
                  )}
                  {hasHighFriction && (
                    <div className="flex items-center gap-1 text-yellow-600">
                      <AlertTriangle className="w-3 h-3" />
                      Fricción alta ({metrics?.metrics?.avgRegenerationsChain.toFixed(1)} regens)
                    </div>
                  )}
                  {metrics?.metrics && !hasLowData && (
                    <div className="text-muted-foreground">
                      Aceptación: {(metrics.metrics.acceptRate * 100).toFixed(0)}% | 
                      {metrics.metrics.totalRuns} runs
                    </div>
                  )}
                </div>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
