/**
 * Motor Recommendation Badge - Shows recommended engine/preset
 */

import { Badge } from '@/components/ui/badge';
import { CheckCircle2, TrendingUp, Info } from 'lucide-react';
import { MotorRecommendation } from '@/lib/motorSelector';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface MotorRecommendationBadgeProps {
  recommendation: MotorRecommendation | null;
  loading?: boolean;
}

export function MotorRecommendationBadge({ 
  recommendation, 
  loading 
}: MotorRecommendationBadgeProps) {
  if (loading) {
    return (
      <Badge variant="outline" className="text-muted-foreground animate-pulse">
        Analizando...
      </Badge>
    );
  }

  if (!recommendation) {
    return null;
  }

  const confidenceColors = {
    low: 'bg-muted text-muted-foreground border-muted',
    medium: 'bg-blue-500/10 text-blue-600 border-blue-500/30',
    high: 'bg-green-500/10 text-green-600 border-green-500/30'
  };

  const confidenceIcons = {
    low: <Info className="w-3 h-3" />,
    medium: <TrendingUp className="w-3 h-3" />,
    high: <CheckCircle2 className="w-3 h-3" />
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge 
            variant="outline" 
            className={`gap-1 ${confidenceColors[recommendation.confidence]}`}
          >
            {confidenceIcons[recommendation.confidence]}
            <span>Recomendado</span>
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          <div className="space-y-1 text-sm">
            <p className="font-medium">{recommendation.reason}</p>
            <p className="text-xs text-muted-foreground">
              Engine: {recommendation.recommendedEngine} | 
              Preset: {recommendation.recommendedPreset}
            </p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

interface PresetRecommendationIndicatorProps {
  presetId: string;
  recommendedPresetId: string | undefined;
  confidence?: 'low' | 'medium' | 'high';
}

export function PresetRecommendationIndicator({
  presetId,
  recommendedPresetId,
  confidence = 'medium'
}: PresetRecommendationIndicatorProps) {
  if (presetId !== recommendedPresetId || confidence === 'low') {
    return null;
  }

  return (
    <span className="ml-1 text-green-500">
      <CheckCircle2 className="w-3 h-3 inline" />
    </span>
  );
}
