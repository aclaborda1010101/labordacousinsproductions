import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Loader2,
  Shield,
  ShieldAlert,
  ShieldCheck,
  ArrowRight,
} from 'lucide-react';
import type { ValidationResult, ValidationError, ValidationWarning, PipelinePhase } from '@/lib/sequenceValidationEngine';

interface SequencePreflightCheckProps {
  phase: PipelinePhase;
  validationResult: ValidationResult | null;
  isValidating?: boolean;
  onValidate?: () => Promise<void>;
  onProceed?: () => void;
  onCancel?: () => void;
  nextPhaseName?: string;
  allowProOverride?: boolean;
}

const PHASE_LABELS: Record<PipelinePhase, string> = {
  storyboard: 'Storyboard',
  camera_plan: 'Camera Plan',
  tech_doc: 'Documento Técnico',
  keyframes: 'Keyframes',
};

const NEXT_PHASE: Record<PipelinePhase, string> = {
  storyboard: 'Camera Plan',
  camera_plan: 'Documento Técnico',
  tech_doc: 'Keyframes',
  keyframes: 'Render',
};

export function SequencePreflightCheck({
  phase,
  validationResult,
  isValidating = false,
  onValidate,
  onProceed,
  onCancel,
  nextPhaseName,
  allowProOverride = false,
}: SequencePreflightCheckProps) {
  const [errorsExpanded, setErrorsExpanded] = useState(true);
  const [warningsExpanded, setWarningsExpanded] = useState(true);
  const [overrideConfirmed, setOverrideConfirmed] = useState(false);

  const hasErrors = validationResult?.blocking_errors && validationResult.blocking_errors.length > 0;
  const hasWarnings = validationResult?.warnings && validationResult.warnings.length > 0;
  const canProceed = validationResult?.can_proceed || (allowProOverride && !hasErrors && overrideConfirmed);
  
  const targetPhase = nextPhaseName || NEXT_PHASE[phase];

  // Reset override when validation changes
  useEffect(() => {
    setOverrideConfirmed(false);
  }, [validationResult]);

  if (!validationResult && !isValidating) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-8 text-center">
          <Shield className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
          <p className="text-muted-foreground mb-4">
            Validación de {PHASE_LABELS[phase]} requerida antes de generar {targetPhase}
          </p>
          {onValidate && (
            <Button onClick={onValidate} disabled={isValidating}>
              <Shield className="w-4 h-4 mr-2" />
              Ejecutar validación
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  if (isValidating) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <Loader2 className="w-12 h-12 mx-auto mb-4 animate-spin text-primary" />
          <p className="text-muted-foreground">
            Validando {PHASE_LABELS[phase]}...
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={hasErrors ? 'border-destructive/50' : hasWarnings ? 'border-amber-500/50' : 'border-green-500/50'}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            {hasErrors ? (
              <ShieldAlert className="w-5 h-5 text-destructive" />
            ) : hasWarnings ? (
              <AlertTriangle className="w-5 h-5 text-amber-500" />
            ) : (
              <ShieldCheck className="w-5 h-5 text-green-500" />
            )}
            Preflight Check: {PHASE_LABELS[phase]}
          </CardTitle>
          <Badge 
            variant={hasErrors ? 'destructive' : hasWarnings ? 'outline' : 'default'}
            className={!hasErrors && !hasWarnings ? 'bg-green-500 hover:bg-green-600' : hasWarnings ? 'border-amber-500 text-amber-500' : ''}
          >
            {hasErrors 
              ? `${validationResult.blocking_errors.length} error(es)` 
              : hasWarnings 
                ? `${validationResult.warnings.length} advertencia(s)` 
                : 'Validación OK'
            }
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Errors Section */}
        {hasErrors && (
          <Collapsible open={errorsExpanded} onOpenChange={setErrorsExpanded}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="w-full justify-between text-destructive hover:text-destructive">
                <div className="flex items-center gap-2">
                  <XCircle className="w-4 h-4" />
                  <span>Errores bloqueantes ({validationResult.blocking_errors.length})</span>
                </div>
                {errorsExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <ScrollArea className="max-h-48">
                <div className="space-y-2 mt-2">
                  {validationResult.blocking_errors.map((error, idx) => (
                    <Alert key={`${error.code}-${idx}`} variant="destructive" className="py-2">
                      <XCircle className="w-4 h-4" />
                      <AlertTitle className="text-sm font-mono">{error.code}</AlertTitle>
                      <AlertDescription className="text-xs">
                        {error.message}
                        {error.affectedItems && error.affectedItems.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {error.affectedItems.slice(0, 5).map((item, i) => (
                              <Badge key={i} variant="outline" className="text-xs bg-destructive/10">
                                {item}
                              </Badge>
                            ))}
                            {error.affectedItems.length > 5 && (
                              <Badge variant="outline" className="text-xs">
                                +{error.affectedItems.length - 5} más
                              </Badge>
                            )}
                          </div>
                        )}
                      </AlertDescription>
                    </Alert>
                  ))}
                </div>
              </ScrollArea>
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Warnings Section */}
        {hasWarnings && (
          <Collapsible open={warningsExpanded} onOpenChange={setWarningsExpanded}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="w-full justify-between text-amber-500 hover:text-amber-500">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  <span>Advertencias ({validationResult.warnings.length})</span>
                </div>
                {warningsExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <ScrollArea className="max-h-48">
                <div className="space-y-2 mt-2">
                  {validationResult.warnings.map((warning, idx) => (
                    <Alert key={`${warning.code}-${idx}`} className="py-2 border-amber-500/30 bg-amber-500/5">
                      <AlertTriangle className="w-4 h-4 text-amber-500" />
                      <AlertTitle className="text-sm font-mono text-amber-600">{warning.code}</AlertTitle>
                      <AlertDescription className="text-xs text-amber-600/80">
                        {warning.message}
                        {warning.affectedItems && warning.affectedItems.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {warning.affectedItems.slice(0, 5).map((item, i) => (
                              <Badge key={i} variant="outline" className="text-xs border-amber-500/30 text-amber-600">
                                {item}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </AlertDescription>
                    </Alert>
                  ))}
                </div>
              </ScrollArea>
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Success State */}
        {!hasErrors && !hasWarnings && (
          <div className="flex items-center justify-center gap-2 py-4 bg-green-500/10 rounded-lg">
            <CheckCircle2 className="w-5 h-5 text-green-500" />
            <span className="text-green-600 font-medium">
              Todas las validaciones pasadas
            </span>
          </div>
        )}

        {/* Pro Override for Warnings */}
        {!hasErrors && hasWarnings && allowProOverride && (
          <div className="flex items-center gap-3 p-3 bg-amber-500/10 rounded-lg border border-amber-500/20">
            <input
              type="checkbox"
              id="pro-override"
              checked={overrideConfirmed}
              onChange={(e) => setOverrideConfirmed(e.target.checked)}
              className="w-4 h-4 rounded border-amber-500"
            />
            <label htmlFor="pro-override" className="text-sm text-amber-600 cursor-pointer">
              Soy consciente de las advertencias y deseo continuar (Modo Pro)
            </label>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-2 border-t">
          {onCancel && (
            <Button variant="ghost" size="sm" onClick={onCancel}>
              Cancelar
            </Button>
          )}
          
          <div className="flex items-center gap-2 ml-auto">
            {onValidate && (
              <Button variant="outline" size="sm" onClick={onValidate} disabled={isValidating}>
                Revalidar
              </Button>
            )}
            
            {onProceed && (
              <Button 
                size="sm" 
                onClick={onProceed}
                disabled={!canProceed}
                className={canProceed ? 'bg-green-600 hover:bg-green-700' : ''}
              >
                {hasErrors ? (
                  <>
                    <XCircle className="w-4 h-4 mr-2" />
                    Corregir errores primero
                  </>
                ) : (
                  <>
                    Generar {targetPhase}
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default SequencePreflightCheck;
