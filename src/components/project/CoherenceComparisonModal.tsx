/**
 * CoherenceComparisonModal
 * A/B comparison modal for "Mejorar coherencia" feature
 * Shows previous vs new image side by side with QC scores
 */

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle2, AlertTriangle, ArrowLeft, ArrowRight, RefreshCw, Wand2 } from 'lucide-react';

interface ComparisonImage {
  url: string;
  qcScore: number | null;
  qcIssues: string[] | null;
}

interface CoherenceComparisonModalProps {
  open: boolean;
  onClose: () => void;
  slotLabel: string;
  previousImage: ComparisonImage;
  newImage: ComparisonImage | null;
  isGenerating: boolean;
  onKeepPrevious: () => void;
  onAcceptNew: () => void;
  onRegenerateAgain: () => void;
}

export function CoherenceComparisonModal({
  open,
  onClose,
  slotLabel,
  previousImage,
  newImage,
  isGenerating,
  onKeepPrevious,
  onAcceptNew,
  onRegenerateAgain,
}: CoherenceComparisonModalProps) {
  const getScoreBadge = (score: number | null) => {
    if (score === null) return null;
    return (
      <Badge variant={score >= 70 ? 'pass' : 'pending'} className="text-sm">
        {score >= 70 ? <CheckCircle2 className="w-3 h-3 mr-1" /> : <AlertTriangle className="w-3 h-3 mr-1" />}
        {score}%
      </Badge>
    );
  };

  const scoreDiff = newImage?.qcScore !== null && previousImage.qcScore !== null
    ? (newImage?.qcScore ?? 0) - (previousImage.qcScore ?? 0)
    : null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="w-5 h-5 text-purple-500" />
            Comparar Coherencia: {slotLabel}
          </DialogTitle>
          <DialogDescription>
            Compara la imagen anterior con la nueva regenerada y elige cuál conservar
          </DialogDescription>
        </DialogHeader>

        {/* Comparison Grid */}
        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="grid grid-cols-2 gap-4 p-2">
            {/* Previous Image */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="font-medium text-sm flex items-center gap-2">
                  <ArrowLeft className="w-4 h-4" />
                  Imagen Anterior
                </h3>
                {getScoreBadge(previousImage.qcScore)}
              </div>
              <div className="aspect-square rounded-lg border-2 border-muted overflow-hidden bg-muted/30">
                <img 
                  src={previousImage.url} 
                  alt="Imagen anterior"
                  className="w-full h-full object-cover"
                />
              </div>
              {previousImage.qcIssues && previousImage.qcIssues.length > 0 && (
                <div className="text-xs text-muted-foreground space-y-1 max-h-20 overflow-y-auto">
                  {previousImage.qcIssues.slice(0, 3).map((issue, i) => (
                    <div key={i} className="flex items-start gap-1">
                      <span className="text-yellow-500">•</span>
                      <span className="line-clamp-2">{issue}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* New Image */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="font-medium text-sm flex items-center gap-2">
                  <ArrowRight className="w-4 h-4" />
                  Imagen Nueva
                  {scoreDiff !== null && scoreDiff !== 0 && (
                    <Badge 
                      variant={scoreDiff > 0 ? 'pass' : 'destructive'} 
                      className="text-xs"
                    >
                      {scoreDiff > 0 ? '+' : ''}{scoreDiff}%
                    </Badge>
                  )}
                </h3>
                {newImage && getScoreBadge(newImage.qcScore)}
              </div>
              <div className="aspect-square rounded-lg border-2 border-purple-500/50 overflow-hidden bg-muted/30">
                {isGenerating ? (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-3">
                    <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
                    <p className="text-sm text-muted-foreground">Regenerando con coherencia...</p>
                  </div>
                ) : newImage ? (
                  <img 
                    src={newImage.url} 
                    alt="Imagen nueva"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                    <p className="text-sm">Esperando regeneración...</p>
                  </div>
                )}
              </div>
              {newImage?.qcIssues && newImage.qcIssues.length > 0 && (
                <div className="text-xs text-muted-foreground space-y-1 max-h-20 overflow-y-auto">
                  {newImage.qcIssues.slice(0, 3).map((issue, i) => (
                    <div key={i} className="flex items-start gap-1">
                      <span className="text-yellow-500">•</span>
                      <span className="line-clamp-2">{issue}</span>
                    </div>
                  ))}
                </div>
              )}
              {newImage && (!newImage.qcIssues || newImage.qcIssues.length === 0) && (
                <div className="text-xs text-green-600 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  Sin problemas detectados
                </div>
              )}
            </div>
          </div>

          {/* Score Summary */}
          {newImage && scoreDiff !== null && (
            <div className={`mx-2 mt-4 p-3 rounded-lg border ${
              scoreDiff > 0 
                ? 'bg-green-500/10 border-green-500/30' 
                : scoreDiff < 0 
                  ? 'bg-red-500/10 border-red-500/30'
                  : 'bg-muted/30 border-border'
            }`}>
              <p className="text-sm text-center">
                {scoreDiff > 5 ? (
                  <>✨ La nueva imagen mejoró la coherencia en <strong>+{scoreDiff}%</strong></>
                ) : scoreDiff > 0 ? (
                  <>La nueva imagen es ligeramente mejor (<strong>+{scoreDiff}%</strong>)</>
                ) : scoreDiff < -5 ? (
                  <>⚠️ La nueva imagen empeoró la coherencia (<strong>{scoreDiff}%</strong>)</>
                ) : scoreDiff < 0 ? (
                  <>La nueva imagen es ligeramente peor (<strong>{scoreDiff}%</strong>)</>
                ) : (
                  <>Ambas imágenes tienen coherencia similar</>
                )}
              </p>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex-shrink-0 pt-4 border-t border-border">
          <div className="flex gap-2 justify-between">
            <Button 
              variant="outline" 
              onClick={onKeepPrevious}
              disabled={isGenerating}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Conservar Anterior
            </Button>
            
            <div className="flex gap-2">
              <Button 
                variant="outline"
                onClick={onRegenerateAgain}
                disabled={isGenerating}
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Regenerar Otra
              </Button>
              
              <Button 
                onClick={onAcceptNew}
                disabled={isGenerating || !newImage}
                className="bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600"
              >
                {isGenerating ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                )}
                Aceptar Nueva
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
