import { useState, useEffect } from 'react';
import { 
  Lightbulb, 
  ChevronDown, 
  ChevronUp, 
  AlertTriangle, 
  Shield, 
  DollarSign,
  Sparkles,
  CheckCircle,
  ArrowRight
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import type { DecisionPack, ActionIntent } from '@/lib/decisionEngine';
import type { CreativeMode } from '@/lib/modeCapabilities';

interface DecisionPanelProps {
  decision: DecisionPack | null;
  creativeMode: CreativeMode;
  loading?: boolean;
  onApply?: () => void;
  onLogShown?: () => void;
  className?: string;
}

/**
 * DecisionPanel - Shows recommendations from the Decision Engine
 * 
 * In ASSISTED mode: Shows only a simple CTA based on recommendedAction
 * In DIRECTOR/PRO modes: Shows collapsible panel with details and "Aplicar" button
 */
export function DecisionPanel({
  decision,
  creativeMode,
  loading = false,
  onApply,
  onLogShown,
  className
}: DecisionPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [logged, setLogged] = useState(false);

  // Log decision shown event once
  useEffect(() => {
    if (decision && onLogShown && !logged) {
      onLogShown();
      setLogged(true);
    }
  }, [decision, onLogShown, logged]);

  // Reset logged state when decision changes
  useEffect(() => {
    setLogged(false);
  }, [decision?.recommendedAction, decision?.recommendedPresetId]);

  if (!decision || loading) {
    return null;
  }

  const isAssisted = creativeMode === 'ASSISTED';
  const hasRisks = decision.riskFlags.cost || decision.riskFlags.canon || decision.riskFlags.consistency;
  const confidencePercent = Math.round(decision.confidence * 100);

  // ASSISTED mode: Simple inline CTA
  if (isAssisted) {
    return (
      <div className={cn(
        "flex items-center gap-2 p-2 rounded-lg bg-primary/5 border border-primary/20",
        className
      )}>
        {decision.autopilotEligible && (
          <Badge variant="secondary" className="bg-primary/10 text-primary text-xs">
            <Sparkles className="w-3 h-3 mr-1" />
            Autopilot
          </Badge>
        )}
        <span className="text-sm text-muted-foreground">{decision.message}</span>
        {decision.nextSteps.length > 0 && (
          <span className="text-xs text-muted-foreground">
            → {decision.nextSteps[0]}
          </span>
        )}
      </div>
    );
  }

  // DIRECTOR/PRO mode: Collapsible detailed panel
  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className={className}>
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "w-full justify-between px-3 py-2 h-auto",
            "bg-muted/50 hover:bg-muted/80 border border-border/50",
            hasRisks && "border-warning/30 bg-warning/5"
          )}
        >
          <div className="flex items-center gap-2">
            <Lightbulb className={cn(
              "w-4 h-4",
              decision.autopilotEligible ? "text-primary" : "text-muted-foreground"
            )} />
            <span className="text-sm font-medium">Recomendado</span>
            {decision.autopilotEligible && (
              <Badge variant="outline" className="text-xs bg-primary/10 border-primary/30">
                🤖 Autopilot {confidencePercent}%
              </Badge>
            )}
            {!decision.autopilotEligible && confidencePercent > 0 && (
              <Badge variant="outline" className="text-xs">
                {confidencePercent}% conf.
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            {hasRisks && (
              <div className="flex gap-1">
                {decision.riskFlags.cost && (
                  <DollarSign className="w-3.5 h-3.5 text-warning" />
                )}
                {decision.riskFlags.canon && (
                  <Shield className="w-3.5 h-3.5 text-warning" />
                )}
                {decision.riskFlags.consistency && (
                  <AlertTriangle className="w-3.5 h-3.5 text-warning" />
                )}
              </div>
            )}
            {isOpen ? (
              <ChevronUp className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            )}
          </div>
        </Button>
      </CollapsibleTrigger>

      <CollapsibleContent className="mt-2 space-y-3 p-3 bg-muted/30 rounded-lg border border-border/50">
        {/* Main recommendation */}
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">{decision.message}</p>
          <p className="text-xs text-muted-foreground">{decision.reason}</p>
        </div>

        {/* Risk flags */}
        {hasRisks && (
          <div className="flex flex-wrap gap-2">
            {decision.riskFlags.cost && (
              <Badge variant="outline" className="text-xs border-warning/50 text-warning">
                <DollarSign className="w-3 h-3 mr-1" />
                Coste alto
              </Badge>
            )}
            {decision.riskFlags.canon && (
              <Badge variant="outline" className="text-xs border-warning/50 text-warning">
                <Shield className="w-3 h-3 mr-1" />
                Riesgo canon
              </Badge>
            )}
            {decision.riskFlags.consistency && (
              <Badge variant="outline" className="text-xs border-warning/50 text-warning">
                <AlertTriangle className="w-3 h-3 mr-1" />
                Consistencia
              </Badge>
            )}
          </div>
        )}

        {/* Engine/Preset recommendations */}
        {(decision.recommendedEngine || decision.recommendedPresetId || decision.switchPresetTo) && (
          <div className="flex flex-wrap gap-2">
            {decision.recommendedEngine && (
              <Badge variant="secondary" className="text-xs">
                Motor: {formatEngineName(decision.recommendedEngine)}
              </Badge>
            )}
            {decision.switchPresetTo && (
              <Badge variant="secondary" className="text-xs bg-primary/10">
                Cambiar a: {decision.switchPresetTo}
              </Badge>
            )}
            {!decision.switchPresetTo && decision.recommendedPresetId && (
              <Badge variant="secondary" className="text-xs">
                Preset: {decision.recommendedPresetId}
              </Badge>
            )}
          </div>
        )}

        {/* Next steps */}
        {decision.nextSteps.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Siguientes pasos:</p>
            <ul className="space-y-1">
              {decision.nextSteps.map((step, idx) => (
                <li key={idx} className="flex items-start gap-2 text-xs text-muted-foreground">
                  <ArrowRight className="w-3 h-3 mt-0.5 shrink-0" />
                  <span>{step}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Special flags */}
        <div className="flex flex-wrap gap-2">
          {decision.reinforceCanon && (
            <Badge variant="outline" className="text-xs border-primary/50 text-primary">
              <Shield className="w-3 h-3 mr-1" />
              Canon reforzado
            </Badge>
          )}
          {decision.suggestCanon && (
            <Badge variant="outline" className="text-xs border-primary/50 text-primary">
              <CheckCircle className="w-3 h-3 mr-1" />
              Marcar canon sugerido
            </Badge>
          )}
          {decision.autoRetryEligible && (
            <Badge variant="outline" className="text-xs">
              Auto-retry disponible
            </Badge>
          )}
        </div>

        {/* Apply button */}
        {onApply && (
          <Button
            size="sm"
            onClick={onApply}
            className="w-full"
          >
            <Sparkles className="w-4 h-4 mr-2" />
            Aplicar recomendación
          </Button>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

/**
 * Compact version for inline use
 */
export function DecisionBadge({
  decision,
  onClick
}: {
  decision: DecisionPack | null;
  onClick?: () => void;
}) {
  if (!decision || !decision.autopilotEligible) return null;

  return (
    <Badge 
      variant="outline" 
      className="text-xs bg-primary/10 border-primary/30 cursor-pointer hover:bg-primary/20"
      onClick={onClick}
    >
      <Sparkles className="w-3 h-3 mr-1" />
      Autopilot {Math.round(decision.confidence * 100)}%
    </Badge>
  );
}

// Helper to format engine names
function formatEngineName(engine: string): string {
  if (engine.includes('nano')) return 'Nano Banana';
  if (engine.includes('flux')) return 'FLUX Pro';
  return engine;
}

export default DecisionPanel;
