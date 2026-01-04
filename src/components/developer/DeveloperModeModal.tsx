import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useDeveloperMode } from '@/contexts/DeveloperModeContext';
import { Wrench, Lock, Unlock, Loader2 } from 'lucide-react';

interface DeveloperModeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DeveloperModeModal({ open, onOpenChange }: DeveloperModeModalProps) {
  const { isDeveloperMode, isLoading, enableDeveloperMode, disableDeveloperMode } = useDeveloperMode();
  const [code, setCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleUnlock = async () => {
    setIsSubmitting(true);
    const success = await enableDeveloperMode(code);
    setIsSubmitting(false);
    if (success) {
      setCode('');
      onOpenChange(false);
    }
  };

  const handleDisable = async () => {
    setIsSubmitting(true);
    await disableDeveloperMode();
    setIsSubmitting(false);
    onOpenChange(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isDeveloperMode && !isSubmitting) {
      handleUnlock();
    }
  };

  if (isLoading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="h-5 w-5" />
            Developer Mode
          </DialogTitle>
          <DialogDescription>
            {isDeveloperMode
              ? 'El modo desarrollador está activo. Tienes acceso a todas las opciones avanzadas en cualquier dispositivo.'
              : 'Introduce el código de desarrollador para desbloquear opciones avanzadas.'}
          </DialogDescription>
        </DialogHeader>

        {isDeveloperMode ? (
          <div className="flex flex-col gap-4 py-4">
            <div className="flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
              <Unlock className="h-5 w-5 text-green-500" />
              <span className="text-green-500 font-medium">Modo Activo</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Tienes acceso a paneles de debug, prompts editables, y controles avanzados en todos los módulos. Este modo está sincronizado en todos tus dispositivos.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4 py-4">
            <div className="flex items-center gap-2 p-3 bg-muted/50 border rounded-lg">
              <Lock className="h-5 w-5 text-muted-foreground" />
              <span className="text-muted-foreground font-medium">Bloqueado</span>
            </div>
            <div className="space-y-2">
              <Label htmlFor="dev-code">Código de desarrollador</Label>
              <Input
                id="dev-code"
                type="password"
                placeholder="••••••"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={handleKeyDown}
                autoComplete="off"
                disabled={isSubmitting}
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancelar
          </Button>
          {isDeveloperMode ? (
            <Button variant="destructive" onClick={handleDisable} disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Desactivar
            </Button>
          ) : (
            <Button onClick={handleUnlock} disabled={!code.trim() || isSubmitting}>
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Desbloquear
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
