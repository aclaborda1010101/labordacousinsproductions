/**
 * Pantalla: Resultado de Generación con Veredicto Editorial
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
  ChevronUp
} from 'lucide-react';
import { useState } from 'react';
import type { GenerationRun, ValidationResult } from '@/lib/editorialMVPTypes';
import { getVerdictIcon, getVerdictColor } from '@/lib/editorialPipeline';

interface GenerationResultProps {
  run: GenerationRun;
  validation: ValidationResult;
  onAccept: () => void;
  onRegenerate: () => void;
  onEdit: () => void;
  onDismiss: () => void;
}

export function GenerationResult({
  run,
  validation,
  onAccept,
  onRegenerate,
  onEdit,
  onDismiss
}: GenerationResultProps) {
  const [showDetails, setShowDetails] = useState(false);

  const verdictIcon = getVerdictIcon(run.verdict);
  const verdictColor = getVerdictColor(run.verdict);

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
                {run.verdict === 'approved' && 'La generación cumple con los criterios editoriales.'}
                {run.verdict === 'warn' && 'Hay advertencias que podrías considerar revisar.'}
                {run.verdict === 'regenerate' && 'Se detectaron problemas que requieren atención.'}
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
          <VerdictBanner verdict={run.verdict} />

          {/* Advertencias (máx 3) */}
          {run.warnings.length > 0 && (
            <div className="space-y-2">
              <h4 className="font-medium flex items-center gap-2 text-amber-600">
                <AlertTriangle className="h-4 w-4" />
                Advertencias ({run.warnings.length})
              </h4>
              {run.warnings.map((warning, i) => (
                <Alert key={i} variant="default" className="border-amber-200 bg-amber-50 dark:bg-amber-950/20">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  <AlertDescription className="text-sm">
                    {warning.message}
                  </AlertDescription>
                </Alert>
              ))}
            </div>
          )}

          {/* Sugerencias (máx 2) */}
          {run.suggestions.length > 0 && (
            <div className="space-y-2">
              <h4 className="font-medium flex items-center gap-2 text-blue-600">
                <Lightbulb className="h-4 w-4" />
                Sugerencias ({run.suggestions.length})
              </h4>
              {run.suggestions.map((suggestion, i) => (
                <Alert key={i} className="border-blue-200 bg-blue-50 dark:bg-blue-950/20">
                  <Lightbulb className="h-4 w-4 text-blue-600" />
                  <AlertDescription className="text-sm">
                    {suggestion.message}
                  </AlertDescription>
                </Alert>
              ))}
            </div>
          )}

          {/* Bloqueadores */}
          {validation.blockers.length > 0 && (
            <div className="space-y-2">
              <h4 className="font-medium flex items-center gap-2 text-red-600">
                <Shield className="h-4 w-4" />
                Requiere corrección
              </h4>
              {validation.blockers.map((blocker, i) => (
                <Alert key={i} variant="destructive">
                  <Shield className="h-4 w-4" />
                  <AlertTitle>Bloqueo editorial</AlertTitle>
                  <AlertDescription className="text-sm">
                    {blocker.message}
                  </AlertDescription>
                </Alert>
              ))}
            </div>
          )}

          <Separator />

          {/* Acciones */}
          <div className="flex gap-2 flex-wrap">
            {run.verdict !== 'regenerate' && (
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
          </div>

          {/* Detalles técnicos (colapsable) */}
          <div className="pt-2">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setShowDetails(!showDetails)}
              className="w-full justify-between text-muted-foreground"
            >
              <span>Detalles técnicos</span>
              {showDetails ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
            
            {showDetails && (
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
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Banner de veredicto
function VerdictBanner({ verdict }: { verdict: GenerationRun['verdict'] }) {
  if (verdict === 'approved') {
    return (
      <div className="flex items-center gap-3 p-3 bg-green-50 dark:bg-green-950/20 rounded-lg border border-green-200 dark:border-green-800">
        <Check className="h-5 w-5 text-green-600" />
        <div>
          <p className="font-medium text-green-800 dark:text-green-200">
            Generación aprobada
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
            Generación con advertencias
          </p>
          <p className="text-sm text-amber-600 dark:text-amber-400">
            Puedes aceptarla, pero considera revisar las sugerencias.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 p-3 bg-red-50 dark:bg-red-950/20 rounded-lg border border-red-200 dark:border-red-800">
      <RefreshCw className="h-5 w-5 text-red-600" />
      <div>
        <p className="font-medium text-red-800 dark:text-red-200">
          Requiere regeneración
        </p>
        <p className="text-sm text-red-600 dark:text-red-400">
          Se detectaron problemas que deben corregirse antes de continuar.
        </p>
      </div>
    </div>
  );
}
