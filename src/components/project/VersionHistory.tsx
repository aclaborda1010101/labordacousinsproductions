/**
 * VersionHistory - DEPRECATED
 * This component previously used entity_versions table which has been removed.
 * Version control is now handled at the project level through migrations.
 */

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { AlertTriangle, History } from 'lucide-react';

interface VersionHistoryProps { 
  projectId: string; 
  entityType: 'script' | 'scene'; 
  entityId: string; 
  currentData: Record<string, unknown>; 
  onRollback?: () => void; 
}

export default function VersionHistory({ projectId, entityType, entityId, currentData, onRollback }: VersionHistoryProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="h-5 w-5 text-primary" />
          Historial de Versiones
        </CardTitle>
        <CardDescription>
          Sistema de versiones en actualización
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <AlertTriangle className="h-4 w-4 text-yellow-500" />
          <p>
            El historial de versiones está siendo migrado a un nuevo sistema 
            integrado con el control de cambios del proyecto.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
