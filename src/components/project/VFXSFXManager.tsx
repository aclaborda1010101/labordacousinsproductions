/**
 * VFXSFXManager - DEPRECATED
 * This component previously used vfx_sfx table which has been removed.
 * VFX/SFX are now managed at the shot level through shot metadata.
 */

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { AlertTriangle, Sparkles } from 'lucide-react';

interface VFXSFXManagerProps {
  projectId: string;
}

export default function VFXSFXManager({ projectId }: VFXSFXManagerProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            VFX & SFX
          </h2>
          <p className="text-sm text-muted-foreground">
            Biblioteca de efectos visuales y de sonido
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            Módulo en Actualización
          </CardTitle>
          <CardDescription>
            La gestión de VFX/SFX está siendo migrada
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Los efectos visuales y de sonido ahora se gestionan directamente 
            en cada shot a través del editor técnico. Los efectos se definen 
            como parte de los metadatos del shot y se renderizan automáticamente.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
