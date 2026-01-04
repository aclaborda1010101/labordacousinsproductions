/**
 * Motor Recommendation Badge - Shows recommended engine/preset
 */

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { CheckCircle2, TrendingUp, Info, Zap, Sparkles } from 'lucide-react';
import { MotorRecommendation, ENGINES } from '@/lib/motorSelector';
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
              Engine: {formatEngineName(recommendation.recommendedEngine)} | 
              Preset: {recommendation.recommendedPreset}
            </p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

interface MotorRecommendationCardProps {
  recommendation: MotorRecommendation | null;
  loading?: boolean;
}

export function MotorRecommendationCard({ 
  recommendation, 
  loading 
}: MotorRecommendationCardProps) {
  if (loading) {
    return (
      <Card className="border-dashed border-muted animate-pulse">
        <CardContent className="py-3 px-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Sparkles className="w-4 h-4" />
            <span>Analizando historial...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!recommendation) {
    return null;
  }

  const isNanoBanana = recommendation.recommendedEngine === ENGINES.NANO_BANANA || 
                       recommendation.recommendedEngine.includes('nano');
  const engineIcon = isNanoBanana ? <Zap className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />;
  const engineLabel = formatEngineName(recommendation.recommendedEngine);

  const bgColors = {
    low: 'bg-muted/50 border-muted',
    medium: 'bg-blue-500/5 border-blue-500/20',
    high: 'bg-green-500/5 border-green-500/20'
  };

  return (
    <Card className={`${bgColors[recommendation.confidence]}`}>
      <CardContent className="py-3 px-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              {engineIcon}
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{engineLabel}</span>
                  <Badge variant="outline" className="text-xs">
                    {recommendation.recommendedPreset}
                  </Badge>
                  <Badge 
                    variant="outline" 
                    className="text-xs bg-green-500/10 text-green-600 border-green-500/30"
                  >
                    ✅ Recomendado
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {recommendation.reason}
                </p>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
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

function formatEngineName(engine: string): string {
  if (engine === ENGINES.NANO_BANANA || engine.includes('nano')) {
    return 'Nano Banana';
  }
  if (engine === ENGINES.FLUX || engine.includes('flux')) {
    return 'FLUX Pro';
  }
  return engine;
}
