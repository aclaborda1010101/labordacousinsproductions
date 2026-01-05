import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, RefreshCw, Check, Edit3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NarrativeMode, narrativeModeConfig } from '@/lib/modeCapabilities';
import { useUserProfile } from '@/contexts/UserProfileContext';

interface EpisodeRegenerateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  episodeNo: number;
  episodeSynopsis?: string;
  existingSceneCount: number;
  onRegenerated: () => void;
}

export default function EpisodeRegenerateDialog({
  open,
  onOpenChange,
  projectId,
  episodeNo,
  episodeSynopsis = '',
  existingSceneCount,
  onRegenerated,
}: EpisodeRegenerateDialogProps) {
  const { effectiveProfile } = useUserProfile();
  // PROFESSIONAL or CREATOR get advanced options, EXPLORER gets simplified flow
  const isPro = effectiveProfile === 'PROFESSIONAL' || effectiveProfile === 'CREATOR';
  
  const [generating, setGenerating] = useState(false);
  const [synopsis, setSynopsis] = useState('');
  const [modifications, setModifications] = useState('');
  const [sceneCount, setSceneCount] = useState('8');
  const [selectedModes, setSelectedModes] = useState<NarrativeMode[]>(['SERIE_ADICTIVA']);
  const [deleteExisting, setDeleteExisting] = useState(true);
  const [generateComparison, setGenerateComparison] = useState(false);

  // Pre-fill synopsis when dialog opens or episodeSynopsis changes
  useEffect(() => {
    if (open && episodeSynopsis) {
      setSynopsis(episodeSynopsis);
    }
  }, [open, episodeSynopsis]);

  const toggleMode = (mode: NarrativeMode) => {
    if (generateComparison) {
      // Multi-select for comparison
      if (selectedModes.includes(mode)) {
        if (selectedModes.length > 1) {
          setSelectedModes(selectedModes.filter(m => m !== mode));
        }
      } else {
        setSelectedModes([...selectedModes, mode]);
      }
    } else {
      // Single select
      setSelectedModes([mode]);
    }
  };

  const handleGenerate = async () => {
    if (!synopsis.trim()) {
      toast.error('Por favor, escribe una sinopsis');
      return;
    }

    setGenerating(true);
    try {
      // If delete existing, remove old scenes first
      if (deleteExisting && existingSceneCount > 0) {
        const { error: deleteError } = await supabase
          .from('scenes')
          .delete()
          .eq('project_id', projectId)
          .eq('episode_no', episodeNo);
        
        if (deleteError) {
          console.error('Error deleting existing scenes:', deleteError);
          toast.error('Error al eliminar escenas existentes');
          return;
        }
      }

      // Combine synopsis with modifications if provided
      const finalSynopsis = modifications.trim() 
        ? `${synopsis}\n\n--- MODIFICACIONES SOLICITADAS ---\n${modifications}`
        : synopsis;

      // Generate for each selected narrative mode
      const results: { mode: NarrativeMode; scenes: number; shots: number }[] = [];

      for (const narrativeMode of selectedModes) {
        const { data, error } = await supabase.functions.invoke('generate-scenes', {
          body: {
            projectId,
            episodeNo: generateComparison && results.length > 0 
              ? episodeNo + 100 + results.length // Use different episode numbers for comparison
              : episodeNo,
            synopsis: finalSynopsis,
            sceneCount: parseInt(sceneCount),
            narrativeMode,
            generateFullShots: true, // Request full shot details with SHOT_ASSISTANT fields
          }
        });

        if (error) throw error;

        results.push({
          mode: narrativeMode,
          scenes: data?.scenesGenerated || 0,
          shots: data?.shotsGenerated || 0,
        });
      }

      // Show results
      if (generateComparison && results.length > 1) {
        toast.success(
          `Generadas ${results.length} versiones para comparar:\n` +
          results.map(r => `${narrativeModeConfig[r.mode].icon} ${r.mode}: ${r.scenes} escenas, ${r.shots} shots`).join('\n')
        );
      } else {
        const r = results[0];
        toast.success(`Episodio ${episodeNo} regenerado: ${r.scenes} escenas, ${r.shots} shots`);
      }

      onOpenChange(false);
      onRegenerated();
    } catch (err) {
      console.error('Error regenerating episode:', err);
      toast.error('Error al regenerar episodio');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="w-5 h-5 text-primary" />
            Regenerar Episodio {episodeNo}
          </DialogTitle>
          <DialogDescription>
            Elige el modo narrativo y genera escenas completas con todos los detalles de producción
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Narrative Mode Selection - Only in Pro mode */}
          {isPro && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Modo Narrativo</Label>
                <div className="flex items-center gap-2">
                  <Checkbox 
                    id="compare" 
                    checked={generateComparison}
                    onCheckedChange={(checked) => {
                      setGenerateComparison(!!checked);
                      if (!checked && selectedModes.length > 1) {
                        setSelectedModes([selectedModes[0]]);
                      }
                    }}
                  />
                  <label htmlFor="compare" className="text-xs text-muted-foreground cursor-pointer">
                    Generar los 3 para comparar
                  </label>
                </div>
              </div>
              
              <div className="grid grid-cols-3 gap-3">
                {(Object.keys(narrativeModeConfig) as NarrativeMode[]).map((mode) => {
                  const config = narrativeModeConfig[mode];
                  const isSelected = selectedModes.includes(mode);
                  
                  return (
                    <button
                      key={mode}
                      onClick={() => toggleMode(mode)}
                      className={cn(
                        "relative p-4 rounded-xl border-2 transition-all text-left",
                        isSelected
                          ? "border-primary bg-primary/10"
                          : "border-border hover:border-primary/50 bg-card"
                      )}
                    >
                      {isSelected && (
                        <div className="absolute top-2 right-2">
                          <Check className="w-4 h-4 text-primary" />
                        </div>
                      )}
                      <div className="text-2xl mb-2">{config.icon}</div>
                      <div className={cn("font-semibold text-sm", config.color)}>
                        {config.label}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {config.description}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Scene Count */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Número de Escenas</Label>
              <Select value={sceneCount} onValueChange={setSceneCount}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">5 escenas</SelectItem>
                  <SelectItem value="8">8 escenas</SelectItem>
                  <SelectItem value="10">10 escenas</SelectItem>
                  <SelectItem value="12">12 escenas</SelectItem>
                  <SelectItem value="15">15 escenas</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>Escenas Existentes</Label>
              <div className="flex items-center gap-2 h-10">
                <Checkbox 
                  id="delete-existing"
                  checked={deleteExisting}
                  onCheckedChange={(checked) => setDeleteExisting(!!checked)}
                />
                <label htmlFor="delete-existing" className="text-sm cursor-pointer">
                  Eliminar las {existingSceneCount} escenas existentes
                </label>
              </div>
            </div>
          </div>

          {/* Synopsis - Pre-filled with existing content */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label>Sinopsis del Episodio</Label>
              {episodeSynopsis && (
                <Badge variant="secondary" className="text-xs">
                  Pre-cargada
                </Badge>
              )}
            </div>
            <Textarea
              value={synopsis}
              onChange={(e) => setSynopsis(e.target.value)}
              placeholder="Describe qué ocurre en este episodio: trama principal, conflictos, giros importantes..."
              rows={5}
              className="resize-none"
            />
            {!synopsis && episodeSynopsis && (
              <p className="text-xs text-muted-foreground">
                La sinopsis original se cargará automáticamente
              </p>
            )}
          </div>

          <Separator />

          {/* Modifications - New field for refining */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Edit3 className="w-4 h-4 text-muted-foreground" />
              <Label>Modificaciones Sugeridas (opcional)</Label>
            </div>
            <Textarea
              value={modifications}
              onChange={(e) => setModifications(e.target.value)}
              placeholder="Ej: Añadir más tensión en la escena 3, cambiar el final a un cliffhanger, incluir más diálogo entre personajes X e Y..."
              rows={3}
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground">
              Describe cambios puntuales que quieras aplicar al regenerar. Esto se combinará con la sinopsis.
            </p>
          </div>

          {/* What will be generated */}
          <div className="p-4 bg-muted/50 rounded-lg space-y-2">
            <p className="text-sm font-medium text-foreground">Se generará:</p>
            <ul className="text-xs text-muted-foreground space-y-1">
              <li>• {sceneCount} escenas con sluglines, resúmenes y mood</li>
              <li>• 4-8 shots por escena con cobertura cinematográfica completa</li>
              <li>• <strong>Campos SHOT_ASSISTANT:</strong> intención, viewer_notice, ai_risk, continuity</li>
              <li>• Detalles técnicos: cámara, lentes, iluminación, audio</li>
              <li>• Diálogos distribuidos entre planos</li>
              <li>• Transiciones y edit intent para cada shot</li>
              <li>• Keyframes start/end y notas de continuidad</li>
            </ul>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={generating}>
            Cancelar
          </Button>
          <Button variant="gold" onClick={handleGenerate} disabled={generating}>
            {generating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Generando...
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4 mr-2" />
                Regenerar Episodio
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
