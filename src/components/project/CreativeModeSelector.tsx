import React, { useState } from 'react';
import { useCreativeMode, CreativeMode } from '@/contexts/CreativeModeContext';
import { cn } from '@/lib/utils';
import { Sparkles, Crown, Info, ChevronDown } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

const MODE_CONFIG: Record<CreativeMode, {
  label: string;
  shortLabel: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  borderColor: string;
}> = {
  ASSISTED: {
    label: 'Asistido',
    shortLabel: 'Asistido',
    icon: <Sparkles className="h-3.5 w-3.5" />,
    color: 'text-emerald-600 dark:text-emerald-400',
    bgColor: 'bg-emerald-50 dark:bg-emerald-950/30',
    borderColor: 'border-emerald-200 dark:border-emerald-800',
  },
  PRO: {
    label: 'Pro / Showrunner',
    shortLabel: 'Pro',
    icon: <Crown className="h-3.5 w-3.5" />,
    color: 'text-rose-600 dark:text-rose-400',
    bgColor: 'bg-rose-50 dark:bg-rose-950/30',
    borderColor: 'border-rose-200 dark:border-rose-800',
  },
};

interface CreativeModeSelectorProps {
  compact?: boolean;
  className?: string;
  showDescription?: boolean;
}

export function CreativeModeSelector({ 
  compact = false, 
  className,
  showDescription = true
}: CreativeModeSelectorProps) {
  const { 
    projectMode, 
    setProjectMode, 
    effectiveMode,
    getModeDescription,
    getModeTooltip,
    isLoading 
  } = useCreativeMode();
  
  const [pendingMode, setPendingMode] = useState<CreativeMode | null>(null);
  const [proConfirmOpen, setProConfirmOpen] = useState(false);
  const [downgradeConfirmOpen, setDowngradeConfirmOpen] = useState(false);
  const [proAcknowledged, setProAcknowledged] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const handleModeChange = async (newMode: CreativeMode) => {
    if (newMode === projectMode) {
      setIsOpen(false);
      return;
    }
    
    // Upgrading to PRO requires confirmation
    if (newMode === 'PRO' && projectMode !== 'PRO') {
      setPendingMode(newMode);
      setProConfirmOpen(true);
      setIsOpen(false);
      return;
    }
    
    // Downgrading from PRO requires confirmation
    if (projectMode === 'PRO' && newMode !== 'PRO') {
      setPendingMode(newMode);
      setDowngradeConfirmOpen(true);
      setIsOpen(false);
      return;
    }
    
    // Direct change
    await setProjectMode(newMode);
    setIsOpen(false);
  };

  const confirmProUpgrade = async () => {
    if (pendingMode && proAcknowledged) {
      await setProjectMode(pendingMode);
      setProConfirmOpen(false);
      setPendingMode(null);
      setProAcknowledged(false);
    }
  };

  const confirmDowngrade = async () => {
    if (pendingMode) {
      await setProjectMode(pendingMode);
      setDowngradeConfirmOpen(false);
      setPendingMode(null);
    }
  };

  const currentConfig = MODE_CONFIG[effectiveMode];

  if (isLoading) {
    return (
      <div className={cn("h-9 w-32 animate-pulse rounded-md bg-muted", className)} />
    );
  }

  return (
    <TooltipProvider>
      <div className={cn("flex flex-col gap-1", className)}>
        {/* Mode Selector */}
        <Popover open={isOpen} onOpenChange={setIsOpen}>
          <PopoverTrigger asChild>
            <button
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-md border transition-all",
                "hover:shadow-sm cursor-pointer",
                currentConfig.bgColor,
                currentConfig.borderColor,
                currentConfig.color
              )}
            >
              {currentConfig.icon}
              <span className="text-sm font-medium">
                {compact ? currentConfig.shortLabel : currentConfig.label}
              </span>
              <ChevronDown className="h-3 w-3 opacity-60" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-2" align="start">
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground px-2 py-1">
                Control creativo
              </p>
              {(Object.keys(MODE_CONFIG) as CreativeMode[]).map((mode) => {
                const config = MODE_CONFIG[mode];
                const isActive = mode === projectMode;
                
                return (
                  <Tooltip key={mode}>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => handleModeChange(mode)}
                        className={cn(
                          "w-full flex items-center gap-3 px-3 py-2 rounded-md transition-all text-left",
                          isActive 
                            ? cn(config.bgColor, config.borderColor, "border")
                            : "hover:bg-muted"
                        )}
                      >
                        <span className={cn(config.color)}>
                          {config.icon}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className={cn(
                            "text-sm font-medium",
                            isActive ? config.color : "text-foreground"
                          )}>
                            {config.label}
                          </p>
                          <p className="text-xs text-muted-foreground line-clamp-1">
                            {getModeTooltip(mode)}
                          </p>
                        </div>
                        {isActive && (
                          <div className={cn(
                            "w-2 h-2 rounded-full",
                            mode === 'ASSISTED' && "bg-emerald-500",
                            mode === 'PRO' && "bg-rose-500"
                          )} />
                        )}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="max-w-xs">
                      <p>{getModeTooltip(mode)}</p>
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          </PopoverContent>
        </Popover>

        {/* Description Banner */}
        {showDescription && !compact && (
          <div className={cn(
            "flex items-center gap-2 px-2 py-1 rounded text-xs",
            currentConfig.bgColor,
            currentConfig.color
          )}>
            <Info className="h-3 w-3 shrink-0" />
            <span className="truncate">{getModeDescription(effectiveMode)}</span>
          </div>
        )}

        {/* PRO Upgrade Confirmation Modal */}
        <Dialog open={proConfirmOpen} onOpenChange={setProConfirmOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Crown className="h-5 w-5 text-rose-500" />
                Entrar en modo Pro / Showrunner
              </DialogTitle>
              <DialogDescription className="text-left pt-2">
                Este modo desbloquea cámara, lentes, alturas, iluminación y overrides. 
                La coherencia depende de tus decisiones. El sistema mostrará warnings pero no bloqueará.
              </DialogDescription>
            </DialogHeader>
            <div className="flex items-start gap-3 py-4">
              <Checkbox 
                id="pro-acknowledge"
                checked={proAcknowledged}
                onCheckedChange={(checked) => setProAcknowledged(checked as boolean)}
              />
              <label 
                htmlFor="pro-acknowledge" 
                className="text-sm cursor-pointer leading-relaxed"
              >
                Entiendo la responsabilidad y acepto que la IA no corregirá mis decisiones.
              </label>
            </div>
            <DialogFooter>
              <Button 
                variant="outline" 
                onClick={() => {
                  setProConfirmOpen(false);
                  setPendingMode(null);
                  setProAcknowledged(false);
                }}
              >
                Cancelar
              </Button>
              <Button 
                onClick={confirmProUpgrade}
                disabled={!proAcknowledged}
                className="bg-rose-600 hover:bg-rose-700"
              >
                Activar Pro
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Downgrade Confirmation Modal */}
        <Dialog open={downgradeConfirmOpen} onOpenChange={setDowngradeConfirmOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                Volver a modo Asistido
              </DialogTitle>
              <DialogDescription className="text-left pt-2">
                Los campos avanzados se ocultarán, pero tus valores se conservarán. 
                Podrás reactivarlos cuando vuelvas a Pro.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button 
                variant="outline" 
                onClick={() => {
                  setDowngradeConfirmOpen(false);
                  setPendingMode(null);
                }}
              >
                Cancelar
              </Button>
              <Button onClick={confirmDowngrade}>
                Cambiar modo
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
