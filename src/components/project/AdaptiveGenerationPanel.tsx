/**
 * AdaptiveGenerationPanel - Wraps generation panels with user level visibility gating
 * Shows different UI complexity based on user level (explorer/creator/pro)
 */

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  UserLevel,
  UserLevelVisibility,
  StyleDecision,
  USER_LEVEL_CONFIG,
} from '@/lib/editorialKnowledgeBase';
import { AutopilotDecision } from '@/lib/autopilot';
import { Recommendation } from '@/lib/recommendations';
import {
  Sparkles,
  ChevronDown,
  ChevronUp,
  Lightbulb,
  AlertTriangle,
  Bot,
  Settings2,
  Wand2,
} from 'lucide-react';

interface AdaptiveGenerationPanelProps {
  userLevel: UserLevel;
  visibility: UserLevelVisibility;
  styleDecision: StyleDecision | null;
  autopilotDecision?: AutopilotDecision | null;
  recommendation?: Recommendation | null;
  styleName: string;
  formatName: string;
  isGenerating: boolean;
  onGenerate: () => void;
  onOpenAdvanced?: () => void;
  children?: React.ReactNode;
}

export function AdaptiveGenerationPanel({
  userLevel,
  visibility,
  styleDecision,
  autopilotDecision,
  recommendation,
  styleName,
  formatName,
  isGenerating,
  onGenerate,
  onOpenAdvanced,
  children,
}: AdaptiveGenerationPanelProps) {
  const [showAdvanced, setShowAdvanced] = React.useState(false);
  const levelConfig = USER_LEVEL_CONFIG[userLevel];

  // Normal mode: minimal UI, system decides automatically
  if (userLevel === 'normal') {
    return (
      <Card className="border-primary/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Wand2 className="h-5 w-5 text-primary" />
            Generar
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Style context badge */}
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="gap-1">
              <Sparkles className="h-3 w-3" />
              {styleName}
            </Badge>
            <Badge variant="secondary">{formatName}</Badge>
          </div>

          {/* Simple generate button */}
          <Button
            onClick={onGenerate}
            disabled={isGenerating}
            className="w-full"
            size="lg"
          >
            {isGenerating ? (
              <>
                <Bot className="h-4 w-4 mr-2 animate-spin" />
                Generando...
              </>
            ) : (
              <>
                <Wand2 className="h-4 w-4 mr-2" />
                Generar con estilo {styleName}
              </>
            )}
          </Button>

          {/* Autopilot indicator */}
          <p className="text-xs text-muted-foreground text-center">
            🤖 El sistema elige automáticamente la mejor configuración
          </p>
        </CardContent>
      </Card>
    );
  }

  // Pro mode: full control
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-primary" />
            Generación Avanzada
          </CardTitle>
          <Badge variant="secondary" className="gap-1">
            {levelConfig.icon} {levelConfig.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Style context */}
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className="gap-1">
            <Sparkles className="h-3 w-3" />
            {styleName}
          </Badge>
          <Badge variant="secondary">{formatName}</Badge>
          {autopilotDecision?.shouldAutopilot && (
            <Badge variant="default" className="gap-1 bg-green-600">
              <Bot className="h-3 w-3" />
              Autopilot
            </Badge>
          )}
        </div>

        {/* Recommendations with metrics */}
        {recommendation && visibility.showRecommendations && (
          <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Lightbulb className="h-4 w-4 text-primary" />
                Recomendado
              </div>
              {visibility.showTechnicalMetrics && (
                <span className="text-xs text-muted-foreground">
                  Score: {recommendation.score.toFixed(2)}
                </span>
              )}
            </div>
            <div className="text-xs space-y-1">
              <p>
                Engine: <strong>{recommendation.recommendedEngine}</strong> | 
                Preset: <strong>{recommendation.recommendedPreset}</strong>
              </p>
              <p className="text-muted-foreground">{recommendation.reason}</p>
            </div>
          </div>
        )}

        {/* Warnings */}
        {styleDecision?.warnings && styleDecision.warnings.length > 0 && visibility.showAdvancedWarnings && (
          <Alert variant="destructive" className="py-2">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="text-xs">
              {styleDecision.warnings.join(' | ')}
            </AlertDescription>
          </Alert>
        )}

        {/* Active rules */}
        {visibility.showRuleDetails && styleDecision?.activeRules && styleDecision.activeRules.length > 0 && (
          <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="w-full justify-between">
                <span className="text-xs">
                  {styleDecision.activeRules.length} reglas activas
                </span>
                {showAdvanced ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2 space-y-1">
              {styleDecision.activeRules.map((rule) => (
                <div
                  key={rule.id}
                  className="text-xs p-2 rounded bg-muted/50 flex items-start gap-2"
                >
                  <Badge
                    variant={rule.impact === 'high' ? 'destructive' : 'secondary'}
                    className="text-[10px] shrink-0"
                  >
                    {rule.impact}
                  </Badge>
                  <div>
                    <p className="font-medium">{rule.name}</p>
                    <p className="text-muted-foreground">{rule.description}</p>
                  </div>
                </div>
              ))}
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Suggestions */}
        {styleDecision?.suggestions && styleDecision.suggestions.length > 0 && (
          <div className="space-y-1">
            {styleDecision.suggestions.map((suggestion, i) => (
              <p key={i} className="text-xs text-muted-foreground flex items-start gap-1">
                <Lightbulb className="h-3 w-3 mt-0.5 text-amber-500 shrink-0" />
                {suggestion}
              </p>
            ))}
          </div>
        )}

        {/* Full controls (children) */}
        {children}

        {/* Generate button */}
        <div className="flex gap-2">
          <Button
            onClick={onGenerate}
            disabled={isGenerating}
            className="flex-1"
          >
            {isGenerating ? (
              <>
                <Bot className="h-4 w-4 mr-2 animate-spin" />
                Generando...
              </>
            ) : (
              <>
                <Wand2 className="h-4 w-4 mr-2" />
                Generar
              </>
            )}
          </Button>
          {onOpenAdvanced && visibility.showOverrides && (
            <Button variant="outline" onClick={onOpenAdvanced}>
              <Settings2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
