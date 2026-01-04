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
  ArrowRight,
  FileWarning,
  FlaskConical,
  Zap,
  AlertCircle,
  Link2,
  RotateCw
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
 * Confidence badge component (v1.1)
 */
function ConfidenceBadge({ decision }: { decision: DecisionPack }) {
  const { confidenceLabel, confidence } = decision;
  const confidencePercent = Math.round(confidence * 100);
  
  switch (confidenceLabel) {
    case 'high':
      return (
        <Badge variant="outline" className="text-xs bg-green-500/10 border-green-500/30 text-green-600">
          <CheckCircle className="w-3 h-3 mr-1" />
          Alta {confidencePercent}%
        </Badge>
      );
    case 'few_data':
      return (
        <Badge variant="outline" className="text-xs bg-muted">
          <FlaskConical className="w-3 h-3 mr-1" />
          Pocos datos
        </Badge>
      );
    case 'friction':
      return (
        <Badge variant="outline" className="text-xs bg-orange-500/10 border-orange-500/30 text-orange-600">
          <AlertCircle className="w-3 h-3 mr-1" />
          Fricción alta
        </Badge>
      );
    case 'medium':
      return (
        <Badge variant="outline" className="text-xs">
          <Zap className="w-3 h-3 mr-1" />
          {confidencePercent}%
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className="text-xs">
          {confidencePercent}%
        </Badge>
      );
  }
}

/**
 * DecisionPanel v1.1 - Shows recommendations from the Decision Engine
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
    if (decision?.decisionId) {
      setLogged(false);
    }
  }, [decision?.decisionId]);

  if (!decision || loading) {
    return null;
  }

  const isAssisted = creativeMode === 'ASSISTED';
  const hasRisks = decision.riskFlags.invention || decision.riskFlags.cost || decision.riskFlags.canon || decision.riskFlags.consistency;

  // ASSISTED mode: Simple inline CTA
  if (isAssisted) {
    return (
      <div className={cn(
        "flex items-center gap-2 p-2 rounded-lg bg-primary/5 border border-primary/20",
        decision.chainLimitReached && "border-orange-500/30 bg-orange-500/5",
        className
      )}>
        {decision.autopilotEligible && !decision.chainLimitReached && (
          <Badge variant="secondary" className="bg-primary/10 text-primary text-xs">
            <Sparkles className="w-3 h-3 mr-1" />
            Autopilot
          </Badge>
        )}
        {decision.chainLimitReached && (
          <Badge variant="outline" className="bg-orange-500/10 text-orange-600 text-xs border-orange-500/30">
            <AlertTriangle className="w-3 h-3 mr-1" />
            Límite
          </Badge>
        )}
        <span className="text-sm text-muted-foreground flex-1">{decision.message}</span>
        {decision.nextSteps.length > 0 && !decision.chainLimitReached && (
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
            hasRisks && "border-warning/30 bg-warning/5",
            decision.chainLimitReached && "border-orange-500/40 bg-orange-500/5"
          )}
        >
          <div className="flex items-center gap-2">
            <Lightbulb className={cn(
              "w-4 h-4",
              decision.autopilotEligible ? "text-primary" : "text-muted-foreground"
            )} />
            <span className="text-sm font-medium">Recomendado</span>
            {decision.autopilotEligible && !decision.chainLimitReached && (
              <Badge variant="outline" className="text-xs bg-primary/10 border-primary/30">
                🤖 Autopilot
              </Badge>
            )}
            <ConfidenceBadge decision={decision} />
          </div>
          <div className="flex items-center gap-2">
            {decision.chainLimitReached && (
              <Badge variant="outline" className="text-xs border-orange-500/50 text-orange-600">
                <RotateCw className="w-3 h-3 mr-1" />
                Límite x{decision.chainLength}
              </Badge>
            )}
            {hasRisks && (
              <div className="flex gap-1">
                {decision.riskFlags.invention && (
                  <FileWarning className="w-3.5 h-3.5 text-destructive" />
                )}
                {decision.riskFlags.cost && (
                  <DollarSign className="w-3.5 h-3.5 text-warning" />
                )}
                {decision.riskFlags.canon && (
                  <Shield className="w-3.5 h-3.5 text-warning" />
                )}
                {decision.riskFlags.consistency && (
                  <Link2 className="w-3.5 h-3.5 text-orange-500" />
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
        {/* Chain limit warning */}
        {decision.chainLimitReached && (
          <div className="flex items-center gap-2 p-2 bg-orange-500/10 border border-orange-500/30 rounded text-sm text-orange-700">
            <AlertTriangle className="w-4 h-4" />
            <span>Límite de intentos alcanzado ({decision.chainLength}). Considera cambiar estrategia.</span>
          </div>
        )}

        {/* Main recommendation */}
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">{decision.message}</p>
          <p className="text-xs text-muted-foreground">{decision.reason}</p>
        </div>

        {/* Risk flags */}
        {hasRisks && (
          <div className="flex flex-wrap gap-2">
            {decision.riskFlags.invention && (
              <Badge variant="outline" className="text-xs border-destructive/50 text-destructive">
                <FileWarning className="w-3 h-3 mr-1" />
                Riesgo invención
              </Badge>
            )}
            {decision.riskFlags.cost && (
              <Badge variant="outline" className="text-xs border-warning/50 text-warning">
                <DollarSign className="w-3 h-3 mr-1" />
                Coste alto
              </Badge>
            )}
            {decision.riskFlags.canon && (
              <Badge variant="outline" className="text-xs border-warning/50 text-warning">
                <Shield className="w-3 h-3 mr-1" />
                Deriva canon
              </Badge>
            )}
            {decision.riskFlags.consistency && (
              <Badge variant="outline" className="text-xs border-orange-500/50 text-orange-600">
                <Link2 className="w-3 h-3 mr-1" />
                Consistencia
              </Badge>
            )}
          </div>
        )}

        {/* Engine/Preset recommendations */}
        {(decision.recommendedEngine || decision.recommendedPresetId || decision.switchPresetTo || decision.estimatedCost) && (
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
            {decision.fallbackEngine && (
              <Badge variant="outline" className="text-xs border-blue-500/50 text-blue-600">
                Fallback: {formatEngineName(decision.fallbackEngine)}
              </Badge>
            )}
            {decision.estimatedCost !== undefined && creativeMode === 'PRO' && (
              <Badge variant={decision.riskFlags.cost ? "destructive" : "outline"} className="text-xs">
                <DollarSign className="w-3 h-3 mr-1" />
                ${decision.estimatedCost.toFixed(3)}
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
            variant={decision.recommendedAction === 'reinforce_canon_and_regenerate' ? 'default' : 'default'}
          >
            <Sparkles className="w-4 h-4 mr-2" />
            {decision.recommendedAction === 'reinforce_canon_and_regenerate' 
              ? 'Reforzar Canon y Regenerar'
              : 'Aplicar recomendación'}
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
  if (!decision) return null;

  // Show chain limit badge if reached
  if (decision.chainLimitReached) {
    return (
      <Badge 
        variant="outline" 
        className="text-xs bg-orange-500/10 border-orange-500/30 text-orange-600 cursor-pointer"
        onClick={onClick}
      >
        <AlertTriangle className="w-3 h-3 mr-1" />
        Límite x{decision.chainLength}
      </Badge>
    );
  }

  // Show confidence badge
  if (decision.autopilotEligible) {
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

  return <ConfidenceBadge decision={decision} />;
}

// Helper to format engine names
function formatEngineName(engine: string): string {
  if (engine.includes('nano')) return 'Nano Banana';
  if (engine.includes('flux')) return 'FLUX Pro';
  return engine;
}

export default DecisionPanel;
