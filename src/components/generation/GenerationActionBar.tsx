import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { 
  Loader2, 
  Check, 
  RotateCcw, 
  Star, 
  MoreHorizontal,
  Copy,
  History,
  FileText,
  AlertCircle
} from 'lucide-react';
import { toast } from 'sonner';

export type GenerationStatus = 'idle' | 'generating' | 'generated' | 'accepted' | 'error';

interface GenerationActionBarProps {
  status: GenerationStatus;
  hasOutput: boolean;
  isAccepted: boolean;
  isCanon: boolean;
  onGenerate: () => void;
  onAccept: () => void;
  onRegenerate: () => void;
  onSetCanon: () => void;
  runId?: string;
  composedPrompt?: string;
  mode?: 'normal' | 'pro';
  showCanonButton?: boolean;
  errorMessage?: string;
  className?: string;
  /** Human-friendly label for the current view/preset type */
  viewTypeLabel?: string;
  /** Optional extra action button between Accept and Regenerate */
  extraAction?: {
    label: string;
    icon?: React.ReactNode;
    onClick: () => void;
    disabled?: boolean;
  };
}

export function GenerationActionBar({
  status,
  hasOutput,
  isAccepted,
  isCanon,
  onGenerate,
  onAccept,
  onRegenerate,
  onSetCanon,
  runId,
  composedPrompt,
  mode = 'normal',
  showCanonButton = true,
  errorMessage,
  className = '',
  viewTypeLabel,
  extraAction,
}: GenerationActionBarProps) {
  const isGenerating = status === 'generating';
  const isError = status === 'error';

  const handleCopyPrompt = () => {
    if (composedPrompt) {
      navigator.clipboard.writeText(composedPrompt);
      toast.success('Prompt copiado');
    }
  };

  const handleCopyRunId = () => {
    if (runId) {
      navigator.clipboard.writeText(runId);
      toast.success('ID copiado');
    }
  };

  // User-friendly labels
  const generateLabel = hasOutput ? 'Probar otra variante' : 'Generar';
  const acceptLabel = 'Aceptar ✓';
  const canonLabel = 'Fijar como referencia ⭐';

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Status badges */}
      <div className="flex items-center gap-2 flex-wrap">
        {isGenerating && (
          <Badge variant="outline" className="gap-1 animate-pulse">
            <Loader2 className="w-3 h-3 animate-spin" />
            Generando...
          </Badge>
        )}
        {isAccepted && !isCanon && (
          <Badge className="bg-green-600 gap-1">
            <Check className="w-3 h-3" />
            Aceptado
          </Badge>
        )}
        {isCanon && (
          <Badge className="bg-amber-500 gap-1">
            <Star className="w-3 h-3" />
            Referencia oficial
          </Badge>
        )}
        {isError && (
          <Badge variant="destructive" className="gap-1">
            <AlertCircle className="w-3 h-3" />
            Error
          </Badge>
        )}
      </div>

      {/* Error message */}
      {isError && errorMessage && (
        <p className="text-xs text-destructive">{errorMessage}</p>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-2">
        {/* Primary action: Generate or Regenerate */}
        {!hasOutput ? (
          <Button
            onClick={onGenerate}
            disabled={isGenerating}
            className="flex-1"
            variant="gold"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Generando...
              </>
            ) : (
              generateLabel
            )}
          </Button>
        ) : (
          <>
            {/* Accept button */}
            <Button
              variant="outline"
              size="sm"
              onClick={onAccept}
              disabled={isAccepted || isGenerating}
              className="flex-1"
            >
              <Check className="w-4 h-4 mr-2 text-green-600" />
              {acceptLabel}
            </Button>

            {/* Extra action button (e.g., Export) */}
            {extraAction && (
              <Button
                variant="outline"
                size="sm"
                onClick={extraAction.onClick}
                disabled={extraAction.disabled || isGenerating}
                className="flex-1"
              >
                {extraAction.icon}
                {extraAction.label}
              </Button>
            )}

            {/* Regenerate button */}
            <Button
              variant="outline"
              size="sm"
              onClick={onRegenerate}
              disabled={isGenerating}
              className="flex-1"
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              {generateLabel}
            </Button>

            {/* Canon button - only when accepted */}
            {isAccepted && showCanonButton && !isCanon && (
              <Button
                variant="outline"
                size="sm"
                onClick={onSetCanon}
                className="flex-1 border-amber-500 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950"
              >
                <Star className="w-4 h-4 mr-2" />
                {mode === 'normal' ? '⭐' : canonLabel}
              </Button>
            )}
          </>
        )}

        {/* Menu for advanced actions (Pro mode) */}
        {mode === 'pro' && hasOutput && runId && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleCopyRunId}>
                <History className="w-4 h-4 mr-2" />
                Copiar ID: {runId.slice(0, 8)}...
              </DropdownMenuItem>
              {composedPrompt && (
                <DropdownMenuItem onClick={handleCopyPrompt}>
                  <Copy className="w-4 h-4 mr-2" />
                  Copiar prompt
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled>
                <FileText className="w-4 h-4 mr-2" />
                Ver historial de intentos
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Feedback messages */}
      {isAccepted && !isCanon && mode === 'normal' && (
        <p className="text-xs text-muted-foreground text-center">
          ✓ Listo. Este será el resultado oficial para este elemento.
        </p>
      )}
      {isCanon && mode === 'normal' && (
        <p className="text-xs text-muted-foreground text-center">
          ⭐ Perfecto. A partir de ahora lo usaremos como referencia.
        </p>
      )}
    </div>
  );
}
