/**
 * CinematicProductionEngine - DEPRECATED
 * This component previously used cpe_canon_elements and cpe_feed_blocks tables which have been removed.
 * Keeping as a placeholder for future refactor.
 */

import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle } from 'lucide-react';

interface CinematicProductionEngineProps {
  projectId: string;
}

export function CinematicProductionEngine({ projectId }: CinematicProductionEngineProps) {
  return (
    <div className="h-[calc(100vh-4rem)] bg-background flex items-center justify-center">
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            Módulo en Mantenimiento
          </CardTitle>
          <CardDescription>
            El motor de producción cinematográfica está siendo actualizado.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Esta funcionalidad estará disponible próximamente con mejoras significativas.
            Por favor, utiliza las herramientas de producción en la vista de proyecto.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
