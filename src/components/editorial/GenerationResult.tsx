/**
 * Pantalla: Resultado de Generación con Veredicto Editorial v0.2
 * - Soporte para 4 veredictos (approved|warn|regenerate|reject_explain)
 * - Reglas omitidas visibles
 * - Prompt patches
 * - Lógica de Canon
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { 
  Check, 
  AlertTriangle, 
  RefreshCw, 
  ThumbsUp, 
  Pencil, 
  X,
  Lightbulb,
  Shield,
  ChevronDown,
  ChevronUp,
  Star,
  Ban,
  Info
} from 'lucide-react';
import { useState } from 'react';
import type { GenerationRun, ValidationResult as LegacyValidationResult } from '@/lib/editorialMVPTypes';
import type { Verdict, ValidationResult } from '@/lib/editorialTypes';
import { getVerdictIcon, getVerdictColor } from '@/lib/editorialValidator';

interface GenerationResultProps {
  run: GenerationRun;
  validation: LegacyValidationResult | ValidationResult;
  phase: 'exploracion' | 'produccion';
  onAccept: () => void;
  onRegenerate: () => void;
  onEdit: () => void;
  onDismiss: () => void;
  onToggleCanon?: (isCanon: boolean) => void;
}

export function GenerationResult({
  run,
  validation,
  phase,
  onAccept,
  onRegenerate,
  onEdit,
  onDismiss,
  onToggleCanon
}: GenerationResultProps) {
  const [showDetails, setShowDetails] = useState(false);
  const [showSkipped, setShowSkipped] = useState(false);

  // Normalizar veredicto
  const verdict = run.verdict as Verdict;
  const verdictIcon = getVerdictIcon(verdict);
  const verdictColor = getVerdictColor(verdict);

  // Determinar si puede ser Canon
  const warnings = 'warnings' in validation ? validation.warnings : run.warnings;
  const hasHighSeverityWarning = warnings?.some((w: { severity?: string }) => 
    w.severity === 'critical' || w.severity === 'high'
  );
  
  const canMarkAsCanon = 
    run.engine === 'flux' &&
    phase === 'produccion' &&
    (verdict === 'approved' || verdict === 'warn') &&
    !hasHighSeverityWarning;

  const canonDisabledReason = !canMarkAsCanon
    ? 'Canon solo disponible en Producción con FLUX y sin warnings de alta severidad'
    : '';

  // Extraer rulesSkipped si existe
  const rulesSkipped = 'rulesSkipped' in validation ? validation.rulesSkipped : [];
  const promptPatches = 'promptPatches' in validation ? validation.promptPatches : null;
  const suggestions = 'suggestions' in validation ? validation.suggestions : run.suggestions;

  return (
    <div className="space-y-4">
      {/* Resultado principal */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                Resultado
                <span className={`text-2xl ${verdictColor}`}>{verdictIcon}</span>
              </CardTitle>
              <CardDescription>
                {verdict === 'approved' && 'La generación cumple con los criterios editoriales.'}
                {verdict === 'warn' && 'Hay advertencias que podrías considerar revisar.'}
                {verdict === 'regenerate' && 'Se recomienda regenerar para mejorar el resultado.'}
                {verdict === 'reject_explain' && 'No se puede aprobar. Se explica el conflicto.'}
              </CardDescription>
            </div>
            <Button variant="ghost" size="icon" onClick={onDismiss}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Imagen o placeholder */}
          {run.outputUrl ? (
            <div className="relative aspect-video bg-muted rounded-lg overflow-hidden">
              <img 
                src={run.outputUrl} 
                alt="Resultado generado"
                className="w-full h-full object-cover"
              />
            </div>
          ) : (
            <div className="aspect-video bg-muted rounded-lg flex items-center justify-center">
              <p className="text-muted-foreground">
                Conecta un motor de generación para ver resultados
              </p>
            </div>
          )}

          {/* Veredicto visual */}
          <VerdictBanner verdict={verdict} />

          {/* Advertencias */}
          {warnings && warnings.length > 0 && (
            <div className="space-y-2">
              <h4 className="font-medium flex items-center gap-2 text-amber-600">
                <AlertTriangle className="h-4 w-4" />
                Advertencias ({warnings.length})
              </h4>
              {warnings.map((warning: { ruleCode?: string; ruleId?: string; message: string; severity?: string; details?: string; type?: string }, i: number) => (
                <Alert key={i} variant="default" className="border-amber-200 bg-amber-50 dark:bg-amber-950/20">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  <div className="flex items-start justify-between w-full">
                    <AlertDescription className="text-sm flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <RuleTag id={warning.ruleCode || warning.ruleId || ''} kind={warning.type === 'absolute' ? 'A' : 'B'} />
                        {warning.severity && (
                          <Badge variant="outline" className="text-xs">
                            {warning.severity}
                          </Badge>
                        )}
                      </div>
                      {warning.message}
                      {warning.details && (
                        <p className="text-xs text-muted-foreground mt-1">{warning.details}</p>
                      )}
                    </AlertDescription>
                  </div>
                </Alert>
              ))}
            </div>
          )}

          {/* Prompt Patches */}
          {promptPatches && (promptPatches.addNegative?.length || promptPatches.notes?.length) && (
            <div className="p-3 border rounded-lg bg-slate-50 dark:bg-slate-950/50 text-sm space-y-2">
              <div className="font-medium flex items-center gap-2">
                <Info className="h-4 w-4" />
                Ajustes aplicados al prompt
              </div>
              {promptPatches.addNegative && promptPatches.addNegative.length > 0 && (
                <div>
                  <span className="text-muted-foreground">Negatives: </span>
                  <span className="font-mono text-xs">{promptPatches.addNegative.join(' | ')}</span>
                </div>
              )}
              {promptPatches.notes && promptPatches.notes.length > 0 && (
                <div>
                  <span className="text-muted-foreground">Notas: </span>
                  {promptPatches.notes.map((note, i) => (
                    <span key={i} className="text-xs">{note}</span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Sugerencias */}
          {suggestions && suggestions.length > 0 && (
            <div className="space-y-2">
              <h4 className="font-medium flex items-center gap-2 text-blue-600">
                <Lightbulb className="h-4 w-4" />
                Sugerencias ({suggestions.length})
              </h4>
              {suggestions.map((suggestion: { ruleCode?: string; ruleId?: string; message: string; category?: string }, i: number) => (
                <Alert key={i} className="border-blue-200 bg-blue-50 dark:bg-blue-950/20">
                  <Lightbulb className="h-4 w-4 text-blue-600" />
                  <AlertDescription className="text-sm flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <RuleTag id={suggestion.ruleCode || suggestion.ruleId || ''} kind="D" />
                      <span>{suggestion.message}</span>
                    </div>
                    {suggestion.category && (
                      <Badge variant="secondary" className="text-xs ml-2">
                        {suggestion.category}
                      </Badge>
                    )}
                  </AlertDescription>
                </Alert>
              ))}
            </div>
          )}

          {/* Reglas omitidas (colapsable) */}
          {rulesSkipped && rulesSkipped.length > 0 && (
            <Collapsible open={showSkipped} onOpenChange={setShowSkipped}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="w-full justify-between text-muted-foreground">
                  <span className="flex items-center gap-2">
                    <Ban className="h-4 w-4" />
                    Reglas omitidas (MVP): {rulesSkipped.length}
                  </span>
                  {showSkipped ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="mt-2 p-3 bg-muted/50 rounded-lg space-y-1 text-xs">
                  {rulesSkipped.map((sk: { ruleId: string; reason: string; details?: string }, i: number) => (
                    <div key={i} className="flex items-center gap-2">
                      <Badge variant="outline" className="font-mono">{sk.ruleId}</Badge>
                      <span className="text-muted-foreground">{sk.reason}</span>
                      {sk.details && <span className="text-muted-foreground">({sk.details})</span>}
                    </div>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}

          <Separator />

          {/* Acciones */}
          <div className="flex gap-2 flex-wrap">
            {(verdict === 'approved' || verdict === 'warn') && (
              <Button onClick={onAccept} className="flex-1 sm:flex-none">
                <ThumbsUp className="h-4 w-4 mr-2" />
                Aceptar
              </Button>
            )}
            <Button variant="outline" onClick={onRegenerate} className="flex-1 sm:flex-none">
              <RefreshCw className="h-4 w-4 mr-2" />
              Regenerar
            </Button>
            <Button variant="outline" onClick={onEdit} className="flex-1 sm:flex-none">
              <Pencil className="h-4 w-4 mr-2" />
              Editar prompt
            </Button>
            
            {/* Botón Canon */}
            {onToggleCanon && (
              <Button
                variant="outline"
                className={`flex-1 sm:flex-none ${!canMarkAsCanon ? 'opacity-50 cursor-not-allowed' : ''}`}
                onClick={() => canMarkAsCanon && onToggleCanon(true)}
                disabled={!canMarkAsCanon}
                title={canonDisabledReason}
              >
                <Star className={`h-4 w-4 mr-2 ${canMarkAsCanon ? 'text-amber-500' : ''}`} />
                Marcar Canon
              </Button>
            )}
          </div>

          {/* Detalles técnicos (colapsable) */}
          <Collapsible open={showDetails} onOpenChange={setShowDetails}>
            <CollapsibleTrigger asChild>
              <Button 
                variant="ghost" 
                size="sm" 
                className="w-full justify-between text-muted-foreground"
              >
                <span>Detalles técnicos</span>
                {showDetails ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-3 p-3 bg-muted/50 rounded-lg space-y-3 text-sm">
                <div>
                  <p className="font-medium mb-1">Prompt compuesto:</p>
                  <p className="text-muted-foreground font-mono text-xs break-all">
                    {run.composedPrompt}
                  </p>
                </div>
                
                {run.negativePrompt && (
                  <div>
                    <p className="font-medium mb-1">Prompt negativo:</p>
                    <p className="text-muted-foreground font-mono text-xs break-all">
                      {run.negativePrompt}
                    </p>
                  </div>
                )}

                <div>
                  <p className="font-medium mb-1">Reglas activadas:</p>
                  <div className="flex flex-wrap gap-1">
                    {run.triggeredRules.map((code, i) => (
                      <Badge key={i} variant="secondary" className="text-xs font-mono">
                        {code}
                      </Badge>
                    ))}
                    {run.triggeredRules.length === 0 && (
                      <span className="text-muted-foreground">Ninguna</span>
                    )}
                  </div>
                </div>

                <div className="flex gap-4">
                  <div>
                    <span className="text-muted-foreground">Motor:</span>{' '}
                    <span className="font-medium">{run.engine}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Generado:</span>{' '}
                    <span className="font-medium">
                      {new Date(run.createdAt).toLocaleTimeString()}
                    </span>
                  </div>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </CardContent>
      </Card>
    </div>
  );
}

// Rule Tag
function RuleTag({ id, kind }: { id: string; kind: 'A' | 'B' | 'D' }) {
  const color =
    kind === 'A' ? 'bg-red-50 border-red-200 text-red-700 dark:bg-red-950/30' :
    kind === 'B' ? 'bg-yellow-50 border-yellow-200 text-yellow-700 dark:bg-yellow-950/30' :
    'bg-slate-50 border-slate-200 text-slate-700 dark:bg-slate-950/30';
  
  if (!id) return null;
  return <span className={`text-xs px-2 py-0.5 border rounded font-mono ${color}`}>{id}</span>;
}

// Banner de veredicto
function VerdictBanner({ verdict }: { verdict: Verdict }) {
  if (verdict === 'approved') {
    return (
      <div className="flex items-center gap-3 p-3 bg-green-50 dark:bg-green-950/20 rounded-lg border border-green-200 dark:border-green-800">
        <Check className="h-5 w-5 text-green-600" />
        <div>
          <p className="font-medium text-green-800 dark:text-green-200">
            ✓ Generación aprobada
          </p>
          <p className="text-sm text-green-600 dark:text-green-400">
            Cumple con los criterios editoriales del proyecto.
          </p>
        </div>
      </div>
    );
  }

  if (verdict === 'warn') {
    return (
      <div className="flex items-center gap-3 p-3 bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-amber-200 dark:border-amber-800">
        <AlertTriangle className="h-5 w-5 text-amber-600" />
        <div>
          <p className="font-medium text-amber-800 dark:text-amber-200">
            ⚠ Generación con advertencias
          </p>
          <p className="text-sm text-amber-600 dark:text-amber-400">
            Puedes aceptarla, pero considera revisar las sugerencias.
          </p>
        </div>
      </div>
    );
  }

  if (verdict === 'regenerate') {
    return (
      <div className="flex items-center gap-3 p-3 bg-orange-50 dark:bg-orange-950/20 rounded-lg border border-orange-200 dark:border-orange-800">
        <RefreshCw className="h-5 w-5 text-orange-600" />
        <div>
          <p className="font-medium text-orange-800 dark:text-orange-200">
            ↻ Se recomienda regenerar
          </p>
          <p className="text-sm text-orange-600 dark:text-orange-400">
            El resultado puede mejorar significativamente con una nueva generación.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 p-3 bg-red-50 dark:bg-red-950/20 rounded-lg border border-red-200 dark:border-red-800">
      <Shield className="h-5 w-5 text-red-600" />
      <div>
        <p className="font-medium text-red-800 dark:text-red-200">
          ✗ No se puede aprobar
        </p>
        <p className="text-sm text-red-600 dark:text-red-400">
          Se detectaron conflictos editoriales que deben resolverse.
        </p>
      </div>
    </div>
  );
}
