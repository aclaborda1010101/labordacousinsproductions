import React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Lock, AlertTriangle, Check, Palette } from 'lucide-react';
import { cn } from '@/lib/utils';
import { 
  getAllStoryboardStylePresets, 
  type StoryboardStylePresetId,
  STYLE_LOCKING_POLICY 
} from '@/lib/storyboardStylePresets';

interface StoryboardStylePickerProps {
  selectedPresetId: StoryboardStylePresetId;
  onSelectPreset: (presetId: StoryboardStylePresetId) => void;
  isLocked: boolean;
  existingPanelCount: number;
  onConfirmChange?: () => void;
}

export function StoryboardStylePicker({
  selectedPresetId,
  onSelectPreset,
  isLocked,
  existingPanelCount,
  onConfirmChange,
}: StoryboardStylePickerProps) {
  const [open, setOpen] = React.useState(false);
  const [pendingPreset, setPendingPreset] = React.useState<StoryboardStylePresetId | null>(null);
  const [confirmDialogOpen, setConfirmDialogOpen] = React.useState(false);

  const presets = getAllStoryboardStylePresets();
  const selectedPreset = presets.find(p => p.id === selectedPresetId);

  const handleSelectPreset = (presetId: StoryboardStylePresetId) => {
    if (isLocked && STYLE_LOCKING_POLICY.changeRequiresRegeneration && existingPanelCount > 0) {
      setPendingPreset(presetId);
      setConfirmDialogOpen(true);
    } else {
      onSelectPreset(presetId);
      setOpen(false);
    }
  };

  const handleConfirmChange = () => {
    if (pendingPreset) {
      onSelectPreset(pendingPreset);
      onConfirmChange?.();
      setPendingPreset(null);
      setConfirmDialogOpen(false);
      setOpen(false);
    }
  };

  return (
    <>
      {/* Trigger Button */}
      <Button 
        variant="outline" 
        size="sm"
        className="gap-2"
        onClick={() => setOpen(true)}
      >
        <span className="text-lg">{selectedPreset?.icon || '🎬'}</span>
        <span className="hidden sm:inline">{selectedPreset?.name || 'Estilo'}</span>
        {isLocked && existingPanelCount > 0 && (
          <Lock className="w-3 h-3 text-amber-500" />
        )}
      </Button>

      {/* Style Picker Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Palette className="w-5 h-5" />
              Elige lenguaje de storyboard
            </DialogTitle>
            <DialogDescription>
              No es solo estética: define cómo se encuadra y qué se prioriza.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-4">
            {presets.map((preset) => (
              <Card
                key={preset.id}
                className={cn(
                  "cursor-pointer transition-all hover:border-primary/50",
                  selectedPresetId === preset.id && "ring-2 ring-primary border-primary",
                  isLocked && existingPanelCount > 0 && "opacity-80"
                )}
                onClick={() => handleSelectPreset(preset.id)}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <span className="text-2xl">{preset.icon}</span>
                    {selectedPresetId === preset.id && (
                      <Badge className="bg-primary text-primary-foreground">
                        <Check className="w-3 h-3 mr-1" />
                        Seleccionado
                      </Badge>
                    )}
                  </div>
                  <CardTitle className="text-base">{preset.name}</CardTitle>
                  <CardDescription className="text-xs">{preset.useCase}</CardDescription>
                </CardHeader>
                <CardContent className="text-xs space-y-1 text-muted-foreground">
                  <p>• Línea: <span className="text-foreground">{preset.visualSignature.line.replace(/_/g, ' ')}</span></p>
                  <p>• Sombreado: <span className="text-foreground">{preset.visualSignature.shading.replace(/_/g, ' ')}</span></p>
                  <p>• Detalle: <span className="text-foreground">{preset.visualSignature.detailLevel.replace(/_/g, ' ')}</span></p>
                </CardContent>
              </Card>
            ))}
          </div>

          {isLocked && existingPanelCount > 0 && (
            <Alert variant="default" className="border-amber-500/50 bg-amber-500/10">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              <AlertDescription className="text-amber-200">
                Cambiar estilo regenerará los {existingPanelCount} paneles existentes.
              </AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Regeneration Dialog */}
      <Dialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-500">
              <AlertTriangle className="w-5 h-5" />
              ¿Cambiar estilo de storyboard?
            </DialogTitle>
            <DialogDescription>
              Cambiar a <strong>{presets.find(p => p.id === pendingPreset)?.name}</strong> regenerará 
              los <strong>{existingPanelCount} paneles</strong> existentes.
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4 space-y-2 text-sm text-muted-foreground">
            <p><Check className="w-4 h-4 inline mr-2 text-green-500" />Se conservarán: guion, cámaras, personajes, continuidad</p>
            <p><AlertTriangle className="w-4 h-4 inline mr-2 text-amber-500" />Se regenerarán: todas las imágenes con nuevo estilo</p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDialogOpen(false)}>
              Cancelar
            </Button>
            <Button 
              variant="default" 
              onClick={handleConfirmChange}
              className="bg-amber-600 hover:bg-amber-700"
            >
              Regenerar con nuevo estilo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
