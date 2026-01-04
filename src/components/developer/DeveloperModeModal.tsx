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
import { Wrench, Lock, Unlock } from 'lucide-react';

interface DeveloperModeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DeveloperModeModal({ open, onOpenChange }: DeveloperModeModalProps) {
  const { isDeveloperMode, enableDeveloperMode, disableDeveloperMode } = useDeveloperMode();
  const [code, setCode] = useState('');

  const handleUnlock = () => {
    const success = enableDeveloperMode(code);
    if (success) {
      setCode('');
      onOpenChange(false);
    }
  };

  const handleDisable = () => {
    disableDeveloperMode();
    onOpenChange(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isDeveloperMode) {
      handleUnlock();
    }
  };

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
              ? 'El modo desarrollador está activo. Tienes acceso a todas las opciones avanzadas.'
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
              Tienes acceso a paneles de debug, prompts editables, y controles avanzados en todos los módulos.
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
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          {isDeveloperMode ? (
            <Button variant="destructive" onClick={handleDisable}>
              Desactivar
            </Button>
          ) : (
            <Button onClick={handleUnlock} disabled={!code.trim()}>
              Desbloquear
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
