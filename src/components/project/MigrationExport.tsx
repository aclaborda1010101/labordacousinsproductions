import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { 
  Download, 
  Database, 
  HardDrive, 
  Code, 
  CheckCircle2, 
  AlertCircle,
  Loader2,
  Package,
  FileCode,
  FolderArchive
} from 'lucide-react';
import { toast } from 'sonner';
import { 
  exportMigrationBundle, 
  downloadBlob, 
  type ExportProgress 
} from '@/lib/exportMigrationBundle';

interface MigrationExportProps {
  projectTitle?: string;
}

const PHASE_LABELS: Record<ExportProgress['phase'], string> = {
  idle: 'Listo para exportar',
  init: 'Inicializando...',
  tables: 'Exportando tablas',
  storage: 'Listando storage',
  functions: 'Preparando functions',
  compressing: 'Comprimiendo ZIP',
  done: '¡Completado!',
  error: 'Error',
};

const PHASE_ICONS: Record<ExportProgress['phase'], React.ReactNode> = {
  idle: <Package className="w-4 h-4" />,
  init: <Loader2 className="w-4 h-4 animate-spin" />,
  tables: <Database className="w-4 h-4" />,
  storage: <HardDrive className="w-4 h-4" />,
  functions: <Code className="w-4 h-4" />,
  compressing: <FolderArchive className="w-4 h-4" />,
  done: <CheckCircle2 className="w-4 h-4 text-green-500" />,
  error: <AlertCircle className="w-4 h-4 text-destructive" />,
};

export function MigrationExport({ projectTitle = 'lcstudio' }: MigrationExportProps) {
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState<ExportProgress>({
    phase: 'idle',
    current: 0,
    total: 0,
    currentItem: '',
  });
  const [includeStorage, setIncludeStorage] = useState(true);
  const [includeData, setIncludeData] = useState(true);

  const handleExport = async () => {
    setExporting(true);
    setProgress({ phase: 'init', current: 0, total: 1, currentItem: 'Iniciando...' });

    try {
      const blob = await exportMigrationBundle(
        (p) => setProgress(p),
        { includeStorage, includeData }
      );

      const date = new Date().toISOString().split('T')[0];
      const filename = `${projectTitle}-migration-${date}.zip`;
      
      downloadBlob(blob, filename);
      toast.success('Paquete de migración descargado');

    } catch (error) {
      console.error('Export failed:', error);
      toast.error('Error al exportar: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setExporting(false);
    }
  };

  const progressPercent = progress.total > 0 
    ? Math.round((progress.current / progress.total) * 100) 
    : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileCode className="w-5 h-5" />
          Migración Completa
        </CardTitle>
        <CardDescription>
          Exporta la base de datos completa para clonar en tu propio Supabase
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Options */}
        <div className="space-y-3">
          <div className="flex items-center space-x-2">
            <Checkbox 
              id="includeData" 
              checked={includeData}
              onCheckedChange={(c) => setIncludeData(!!c)}
              disabled={exporting}
            />
            <Label htmlFor="includeData" className="text-sm">
              Incluir datos de todas las tablas (SQL + JSON)
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox 
              id="includeStorage" 
              checked={includeStorage}
              onCheckedChange={(c) => setIncludeStorage(!!c)}
              disabled={exporting}
            />
            <Label htmlFor="includeStorage" className="text-sm">
              Incluir manifest de Storage (lista de archivos)
            </Label>
          </div>
        </div>

        {/* Progress */}
        {exporting && (
          <div className="space-y-2 p-4 bg-muted/50 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {PHASE_ICONS[progress.phase]}
                <span className="text-sm font-medium">
                  {PHASE_LABELS[progress.phase]}
                </span>
              </div>
              {progress.total > 0 && (
                <Badge variant="outline">
                  {progress.current}/{progress.total}
                </Badge>
              )}
            </div>
            
            <Progress value={progressPercent} className="h-2" />
            
            {progress.currentItem && (
              <p className="text-xs text-muted-foreground truncate">
                {progress.currentItem}
              </p>
            )}
          </div>
        )}

        {/* Result */}
        {progress.phase === 'done' && !exporting && (
          <div className="flex items-center gap-2 p-3 bg-green-500/10 text-green-600 rounded-lg">
            <CheckCircle2 className="w-4 h-4" />
            <span className="text-sm">Paquete exportado correctamente</span>
          </div>
        )}

        {progress.phase === 'error' && (
          <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive rounded-lg">
            <AlertCircle className="w-4 h-4" />
            <span className="text-sm">{progress.error}</span>
          </div>
        )}

        {/* Info */}
        <div className="text-xs text-muted-foreground space-y-1">
          <p>El paquete incluirá:</p>
          <ul className="list-disc list-inside space-y-0.5 ml-2">
            <li>Schema de base de datos (tablas, funciones, RLS)</li>
            <li>Datos de ~100 tablas en formato SQL e JSON</li>
            <li>Lista de archivos de Storage</li>
            <li>README con instrucciones de migración</li>
            <li>Template de secrets para configurar</li>
          </ul>
        </div>

        {/* Action */}
        <Button 
          onClick={handleExport} 
          disabled={exporting}
          className="w-full"
          variant="default"
        >
          {exporting ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Exportando...
            </>
          ) : (
            <>
              <Download className="w-4 h-4 mr-2" />
              Generar Paquete de Migración
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
