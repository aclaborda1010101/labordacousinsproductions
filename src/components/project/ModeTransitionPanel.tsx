/**
 * ModeTransitionPanel - Smooth transition between ASSISTED and PRO modes
 * Helps users understand the differences and choose the right mode
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Lightbulb, 
  Zap, 
  ArrowRight, 
  Check, 
  X, 
  Camera, 
  Settings, 
  Wand2,
  Clock,
  HelpCircle,
  AlertTriangle,
  Crown
} from 'lucide-react';
import { useCreativeModeOptional, CreativeMode } from '@/contexts/CreativeModeContext';
import { cn } from '@/lib/utils';

interface ModeComparisonItem {
  feature: string;
  assisted: boolean | string;
  pro: boolean | string;
  description?: string;
}

const MODE_COMPARISON: ModeComparisonItem[] = [
  {
    feature: 'Guión desde idea',
    assisted: 'Automático con IA',
    pro: 'Control completo de parámetros',
    description: 'Generación de guión a partir de una idea'
  },
  {
    feature: 'Extracción de scripts',
    assisted: 'Análisis automático',
    pro: 'Configuración de parsing',
    description: 'Importar y analizar guiones existentes'
  },
  {
    feature: 'Planificación de shots',
    assisted: 'IA decide técnica',
    pro: 'Control manual completo',
    description: 'Planificación de planos y movimientos de cámara'
  },
  {
    feature: 'Configuración de cámara',
    assisted: false,
    pro: 'Lentes, ángulos, altura',
    description: 'Parámetros técnicos de cámara'
  },
  {
    feature: 'Lighting setup',
    assisted: 'Solo mood básico',
    pro: 'Setup técnico completo',
    description: 'Configuración de iluminación'
  },
  {
    feature: 'Quality control',
    assisted: 'Bloquea errores',
    pro: 'Solo warnings',
    description: 'Control de calidad automático'
  },
  {
    feature: 'Keyframes manuales',
    assisted: false,
    pro: true,
    description: 'Control manual de keyframes de video'
  },
  {
    feature: 'Engine selection',
    assisted: false,
    pro: 'Veo, Kling, otros',
    description: 'Selección de motor de generación'
  }
];

interface ModeTransitionPanelProps {
  currentMode: CreativeMode;
  onModeChange: (mode: CreativeMode) => Promise<void>;
  className?: string;
}

export function ModeTransitionPanel({ currentMode, onModeChange, className }: ModeTransitionPanelProps) {
  const [isChanging, setIsChanging] = useState(false);
  const [showComparison, setShowComparison] = useState(false);

  const handleModeChange = async (newMode: CreativeMode) => {
    if (newMode === currentMode) return;
    
    setIsChanging(true);
    try {
      await onModeChange(newMode);
    } catch (error) {
      console.error('Error changing mode:', error);
    } finally {
      setIsChanging(false);
    }
  };

  const ModeCard = ({ mode, isActive }: { mode: CreativeMode; isActive: boolean }) => {
    const isAssisted = mode === 'ASSISTED';
    const config = {
      ASSISTED: {
        icon: Lightbulb,
        title: 'Modo Asistido',
        description: 'Para usuarios que quieren resultados profesionales sin complejidad técnica',
        pros: [
          'IA toma decisiones técnicas automáticamente',
          'Interfaz simplificada y guiada',
          'Prevención automática de errores',
          'Workflow paso a paso',
          'Ideal para comenzar rápidamente'
        ],
        cons: [
          'Menos control sobre parámetros técnicos',
          'Opciones de personalización limitadas',
          'No acceso a configuración de cámara avanzada'
        ],
        bestFor: 'Creadores de contenido, guionistas, directores que se enfocan en narrativa',
        color: 'green',
        gradient: 'from-green-50 to-emerald-50',
        iconBg: 'bg-green-100',
        iconColor: 'text-green-600'
      },
      PRO: {
        icon: Crown,
        title: 'Modo Profesional',
        description: 'Control completo para profesionales que necesitan decisiones técnicas específicas',
        pros: [
          'Control total sobre todos los parámetros',
          'Configuración técnica avanzada',
          'Overrides de seguridad',
          'Selección de engines y modelos',
          'Workflow tipo industria'
        ],
        cons: [
          'Requiere conocimiento técnico',
          'Más opciones pueden crear confusión',
          'Mayor responsabilidad en QC',
          'Curva de aprendizaje más pronunciada'
        ],
        bestFor: 'Directores experimentados, DPs, productores técnicos',
        color: 'purple',
        gradient: 'from-purple-50 to-blue-50',
        iconBg: 'bg-purple-100',
        iconColor: 'text-purple-600'
      }
    };

    const modeConfig = config[mode];
    const Icon = modeConfig.icon;

    return (
      <Card className={cn(
        'transition-all duration-200',
        isActive ? 'ring-2 ring-primary shadow-md' : 'hover:shadow-sm',
        className
      )}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={cn('w-10 h-10 rounded-full flex items-center justify-center', modeConfig.iconBg)}>
                <Icon className={cn('w-5 h-5', modeConfig.iconColor)} />
              </div>
              <div>
                <CardTitle className="text-lg">{modeConfig.title}</CardTitle>
                {isActive && <Badge className="mt-1">Activo</Badge>}
              </div>
            </div>
            {!isActive && (
              <Button
                variant="outline"
                onClick={() => handleModeChange(mode)}
                disabled={isChanging}
                className="gap-2"
              >
                {isChanging ? (
                  <>
                    <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    Cambiando...
                  </>
                ) : (
                  <>
                    Cambiar
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </Button>
            )}
          </div>
          <CardDescription className="mt-2">{modeConfig.description}</CardDescription>
        </CardHeader>

        <CardContent>
          <div className="space-y-4">
            {/* Ventajas */}
            <div>
              <h4 className="font-medium text-green-700 mb-2 flex items-center gap-2">
                <Check className="w-4 h-4" />
                Ventajas
              </h4>
              <ul className="space-y-1 text-sm">
                {modeConfig.pros.map((pro, index) => (
                  <li key={index} className="flex items-start gap-2">
                    <Check className="w-3 h-3 text-green-500 mt-0.5 flex-shrink-0" />
                    <span>{pro}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Limitaciones */}
            <div>
              <h4 className="font-medium text-orange-700 mb-2 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                Consideraciones
              </h4>
              <ul className="space-y-1 text-sm">
                {modeConfig.cons.map((con, index) => (
                  <li key={index} className="flex items-start gap-2">
                    <X className="w-3 h-3 text-orange-500 mt-0.5 flex-shrink-0" />
                    <span>{con}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Ideal para */}
            <div className="p-3 bg-muted rounded-lg">
              <h4 className="font-medium mb-1 text-sm">Ideal para:</h4>
              <p className="text-sm text-muted-foreground">{modeConfig.bestFor}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-4">
      {/* Current mode status */}
      <Alert className={cn(
        'border-2',
        currentMode === 'ASSISTED' ? 'border-green-200 bg-green-50' : 'border-purple-200 bg-purple-50'
      )}>
        <Settings className="w-4 h-4" />
        <AlertDescription>
          <div className="flex items-center justify-between">
            <div>
              <strong>
                {currentMode === 'ASSISTED' ? 'Modo Asistido' : 'Modo Profesional'} activo
              </strong>
              <br />
              <span className="text-sm">
                {currentMode === 'ASSISTED' 
                  ? 'La IA gestiona automáticamente las decisiones técnicas'
                  : 'Tienes control total sobre todos los parámetros'
                }
              </span>
            </div>
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => setShowComparison(true)}
              className="gap-2"
            >
              <HelpCircle className="w-4 h-4" />
              Comparar modos
            </Button>
          </div>
        </AlertDescription>
      </Alert>

      {/* Mode cards */}
      <div className="grid gap-4 md:grid-cols-2">
        <ModeCard mode="ASSISTED" isActive={currentMode === 'ASSISTED'} />
        <ModeCard mode="PRO" isActive={currentMode === 'PRO'} />
      </div>

      {/* Comparison dialog */}
      <Dialog open={showComparison} onOpenChange={setShowComparison}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Comparación de Modos</DialogTitle>
            <DialogDescription>
              Diferencias detalladas entre Modo Asistido y Profesional
            </DialogDescription>
          </DialogHeader>

          <div className="overflow-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2">Funcionalidad</th>
                  <th className="text-center p-2">
                    <div className="flex items-center justify-center gap-2">
                      <Lightbulb className="w-4 h-4 text-green-600" />
                      Asistido
                    </div>
                  </th>
                  <th className="text-center p-2">
                    <div className="flex items-center justify-center gap-2">
                      <Crown className="w-4 h-4 text-purple-600" />
                      Profesional
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {MODE_COMPARISON.map((item, index) => (
                  <tr key={index} className="border-b hover:bg-muted/50">
                    <td className="p-3">
                      <div>
                        <span className="font-medium">{item.feature}</span>
                        {item.description && (
                          <p className="text-sm text-muted-foreground mt-1">{item.description}</p>
                        )}
                      </div>
                    </td>
                    <td className="p-3 text-center">
                      {typeof item.assisted === 'boolean' ? (
                        item.assisted ? (
                          <Check className="w-5 h-5 text-green-500 mx-auto" />
                        ) : (
                          <X className="w-5 h-5 text-muted-foreground mx-auto" />
                        )
                      ) : (
                        <span className="text-sm">{item.assisted}</span>
                      )}
                    </td>
                    <td className="p-3 text-center">
                      {typeof item.pro === 'boolean' ? (
                        item.pro ? (
                          <Check className="w-5 h-5 text-green-500 mx-auto" />
                        ) : (
                          <X className="w-5 h-5 text-muted-foreground mx-auto" />
                        )
                      ) : (
                        <span className="text-sm">{item.pro}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <DialogFooter>
            <Button onClick={() => setShowComparison(false)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default ModeTransitionPanel;