/**
 * SetPiecesManager - DEPRECATED
 * This component previously used set_pieces table which has been removed.
 * Set pieces functionality is now managed through scenes and shots.
 */

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { AlertTriangle, Clapperboard } from 'lucide-react';

interface SetPiecesManagerProps {
  projectId: string;
}

export default function SetPiecesManager({ projectId }: SetPiecesManagerProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Clapperboard className="w-5 h-5 text-primary" />
            Set Pieces
          </h2>
          <p className="text-sm text-muted-foreground">
            Secuencias de acción y tomas complejas
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
            La gestión de set pieces está siendo migrada
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Las secuencias de acción y tomas complejas ahora se gestionan directamente 
            desde la vista de escenas y shots. Los set pieces se definen como escenas 
            especiales con configuración avanzada de cámara y efectos.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
