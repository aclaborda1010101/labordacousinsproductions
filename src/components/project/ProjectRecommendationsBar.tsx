/**
 * ProjectRecommendationsBar - Shows engine + preset recommendations
 */

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  CheckCircle2, 
  Zap, 
  Sparkles, 
  ChevronDown,
  Info,
  TrendingUp
} from 'lucide-react';
import { Recommendation, ENGINES, formatEngineName } from '@/lib/recommendations';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { useState } from 'react';

interface ProjectRecommendationsBarProps {
  recommendation: Recommendation | null;
  loading?: boolean;
  onApply: () => void;
  onShowAlternatives?: () => void;
  showEngineSelector?: boolean;
}

export function ProjectRecommendationsBar({ 
  recommendation, 
  loading,
  onApply,
  onShowAlternatives,
  showEngineSelector = true
}: ProjectRecommendationsBarProps) {
  const [showDetails, setShowDetails] = useState(false);

  if (loading) {
    return (
      <Card className="border-dashed border-muted animate-pulse mb-4">
        <CardContent className="py-3 px-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Sparkles className="w-4 h-4" />
            <span>Analizando historial del proyecto...</span>
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

  const confidenceIcons = {
    low: <Info className="w-3 h-3" />,
    medium: <TrendingUp className="w-3 h-3" />,
    high: <CheckCircle2 className="w-3 h-3" />
  };

  return (
    <Card className={`${bgColors[recommendation.confidence]} mb-4`}>
      <CardContent className="py-3 px-4">
        <div className="flex flex-col gap-3">
          {/* Header row */}
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              {engineIcon}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-sm">Recomendado para este proyecto</span>
                {showEngineSelector && (
                  <Badge variant="outline" className="text-xs font-mono">
                    {engineLabel}
                  </Badge>
                )}
                <Badge variant="outline" className="text-xs">
                  {recommendation.recommendedPreset}
                </Badge>
                <Badge 
                  variant="outline" 
                  className="text-xs bg-green-500/10 text-green-600 border-green-500/30 gap-1"
                >
                  {confidenceIcons[recommendation.confidence]}
                  <span>
                    {recommendation.confidence === 'high' ? 'Alta confianza' : 
                     recommendation.confidence === 'medium' ? 'Confianza media' : 'Datos limitados'}
                  </span>
                </Badge>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button 
                size="sm" 
                onClick={onApply}
                className="gap-1"
              >
                <CheckCircle2 className="w-3 h-3" />
                Aplicar recomendado
              </Button>
              {onShowAlternatives && (
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={onShowAlternatives}
                >
                  Ver alternativas
                </Button>
              )}
            </div>
          </div>

          {/* Reason text */}
          <p className="text-xs text-muted-foreground">
            {recommendation.reason}
          </p>

          {/* Expandable details */}
          <Collapsible open={showDetails} onOpenChange={setShowDetails}>
            <CollapsibleTrigger asChild>
              <Button 
                variant="ghost" 
                size="sm" 
                className="w-full justify-between text-xs text-muted-foreground hover:text-foreground p-0 h-6"
              >
                <span>¿Por qué esta recomendación?</span>
                <ChevronDown className={`w-3 h-3 transition-transform ${showDetails ? 'rotate-180' : ''}`} />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2">
              <div className="bg-muted/50 rounded-md p-3 text-xs space-y-2">
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <div className="text-muted-foreground">Tasa de aceptación</div>
                    <div className="font-medium text-lg">{(recommendation.acceptRate * 100).toFixed(0)}%</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Regeneraciones medias</div>
                    <div className="font-medium text-lg">{recommendation.avgRegenerations.toFixed(1)}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Basado en</div>
                    <div className="font-medium text-lg">{recommendation.basedOnRuns} runs</div>
                  </div>
                </div>
                <p className="text-muted-foreground mt-2">
                  El sistema analiza el historial de generaciones de este proyecto para 
                  recomendar la combinación engine+preset con mejor rendimiento.
                  {recommendation.confidence === 'low' && (
                    <span className="block mt-1 text-yellow-600">
                      ⚠️ Hay pocos datos aún. La recomendación mejorará con más uso.
                    </span>
                  )}
                </p>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      </CardContent>
    </Card>
  );
}
