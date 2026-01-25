import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { 
  Database, 
  Loader2, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle,
  Copy,
  Eye,
  EyeOff,
  RefreshCw
} from 'lucide-react';

export type ClonePhase = 
  | 'idle' 
  | 'connecting' 
  | 'enums' 
  | 'schema' 
  | 'data' 
  | 'functions' 
  | 'policies' 
  | 'verification'
  | 'done' 
  | 'error';

interface VerificationResult {
  table: string;
  sourceCount: number;
  targetCount: number;
  match: boolean;
}

interface CloneProgress {
  phase: ClonePhase;
  current: number;
  total: number;
  currentItem: string;
  error?: string;
  details?: string;
  verification?: VerificationResult[];
  verificationPassed?: boolean;
}

const PHASE_LABELS: Record<ClonePhase, string> = {
  idle: 'Esperando...',
  connecting: 'Conectando a bases de datos...',
  enums: 'Creando tipos ENUM...',
  schema: 'Creando tablas...',
  data: 'Copiando datos...',
  functions: 'Creando funciones...',
  policies: 'Aplicando políticas RLS...',
  verification: 'Verificando integridad...',
  done: '¡Clonación completada!',
  error: 'Error en la clonación'
};

const PHASE_ICONS: Record<ClonePhase, React.ReactNode> = {
  idle: <Database className="w-4 h-4" />,
  connecting: <Loader2 className="w-4 h-4 animate-spin" />,
  enums: <Loader2 className="w-4 h-4 animate-spin" />,
  schema: <Loader2 className="w-4 h-4 animate-spin" />,
  data: <Loader2 className="w-4 h-4 animate-spin" />,
  functions: <Loader2 className="w-4 h-4 animate-spin" />,
  policies: <Loader2 className="w-4 h-4 animate-spin" />,
  verification: <Loader2 className="w-4 h-4 animate-spin" />,
  done: <CheckCircle2 className="w-4 h-4 text-green-500" />,
  error: <XCircle className="w-4 h-4 text-red-500" />
};

export function DatabaseCloner() {
  const [targetUrl, setTargetUrl] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [includeData, setIncludeData] = useState(true);
  const [includeStorage, setIncludeStorage] = useState(false);
  const [cloning, setCloning] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [progress, setProgress] = useState<CloneProgress>({
    phase: 'idle',
    current: 0,
    total: 0,
    currentItem: ''
  });
  const [verificationResults, setVerificationResults] = useState<VerificationResult[]>([]);

  // Validate PostgreSQL URL format
  const isValidUrl = useCallback((url: string): boolean => {
    if (!url) return false;
    try {
      const parsed = new URL(url);
      return parsed.protocol.startsWith('postgres') && 
             !!parsed.hostname && 
             !!parsed.port && 
             !!parsed.pathname.slice(1);
    } catch {
      return false;
    }
  }, []);

  // Detect special characters in password that might cause issues
  const hasSpecialCharsInPassword = useCallback((url: string): boolean => {
    try {
      const parsed = new URL(url);
      if (parsed.password) {
        // Check for characters that commonly cause URL encoding issues
        return /[!@#$%^&*()+=\[\]{}|;':",.<>?/\\]/.test(decodeURIComponent(parsed.password));
      }
    } catch {
      // Fallback: check raw URL for special chars between : and @
      const match = url.match(/:([^@]+)@/);
      if (match) {
        return /[!@#$%^&*()+=\[\]{}|;':",.<>?/\\]/.test(match[1]);
      }
    }
    return false;
  }, []);

  // Poll for status updates
  useEffect(() => {
    if (!jobId || !cloning) return;

    const pollInterval = setInterval(async () => {
      try {
        const { data, error } = await supabase.functions.invoke('clone-database', {
          body: { action: 'status', jobId }
        });

        if (error) {
          console.error('Status poll error:', error);
          return;
        }

        if (data?.progress) {
          setProgress(data.progress);

          if (data.progress.verification) {
            setVerificationResults(data.progress.verification);
          }

          if (data.progress.phase === 'done') {
            setCloning(false);
            setJobId(null);
            const passed = data.progress.verificationPassed;
            if (passed) {
              toast.success('¡Base de datos clonada y verificada exitosamente!');
            } else {
              toast.warning('Clonación completada con discrepancias. Revisa la verificación.');
            }
          } else if (data.progress.phase === 'error') {
            setCloning(false);
            setJobId(null);
            toast.error(data.progress.error || 'Error durante la clonación');
          }
        }
      } catch (err) {
        console.error('Polling error:', err);
      }
    }, 2000);

    return () => clearInterval(pollInterval);
  }, [jobId, cloning]);

  const handleStartClone = async () => {
    if (!isValidUrl(targetUrl)) {
      toast.error('URL de conexión inválida. Formato: postgres://user:pass@host:port/db');
      return;
    }

    setCloning(true);
    setProgress({
      phase: 'connecting',
      current: 0,
      total: 0,
      currentItem: 'Iniciando conexión...'
    });

    try {
      const { data, error } = await supabase.functions.invoke('clone-database', {
        body: {
          action: 'start',
          targetUrl,
          options: {
            includeData,
            includeStorage
          }
        }
      });

      if (error) {
        throw error;
      }

      if (data?.jobId) {
        setJobId(data.jobId);
        toast.info('Clonación iniciada. Esto puede tomar varios minutos...');
      } else if (data?.error) {
        throw new Error(data.error);
      }
    } catch (err: any) {
      console.error('Clone start error:', err);
      setCloning(false);
      setProgress({
        phase: 'error',
        current: 0,
        total: 0,
        currentItem: '',
        error: err.message || 'Error al iniciar la clonación'
      });
      toast.error(err.message || 'Error al iniciar la clonación');
    }
  };

  const handleCancel = async () => {
    if (!jobId) return;

    try {
      await supabase.functions.invoke('clone-database', {
        body: { action: 'cancel', jobId }
      });
      setCloning(false);
      setJobId(null);
      setProgress({ phase: 'idle', current: 0, total: 0, currentItem: '' });
      toast.info('Clonación cancelada');
    } catch (err) {
      console.error('Cancel error:', err);
    }
  };

  const calculateProgressPercent = (): number => {
    const phaseWeights: Record<ClonePhase, number> = {
      idle: 0,
      connecting: 5,
      enums: 10,
      schema: 25,
      data: 75,
      functions: 85,
      policies: 92,
      verification: 98,
      done: 100,
      error: 0
    };

    const basePercent = phaseWeights[progress.phase] || 0;
    
    if (progress.phase === 'data' && progress.total > 0) {
      const dataProgress = (progress.current / progress.total) * 50; // 50% of total for data phase
      return Math.min(25 + dataProgress, 75);
    }

    return basePercent;
  };

  const isActive = cloning || progress.phase === 'done';

  return (
    <Card className="border-dashed">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <RefreshCw className="w-4 h-4" />
          Clonar a Nueva Base de Datos
        </CardTitle>
        <CardDescription className="text-sm">
          Duplica toda la base de datos a otro proyecto Supabase
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Target URL Input */}
        <div className="space-y-2">
          <Label htmlFor="target-url" className="text-sm">
            URL de conexión del destino
          </Label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                id="target-url"
                type={showPassword ? 'text' : 'password'}
                placeholder="postgres://postgres:PASSWORD@db.XXX.supabase.co:5432/postgres"
                value={targetUrl}
                onChange={(e) => setTargetUrl(e.target.value)}
                disabled={cloning}
                className="pr-10 font-mono text-xs"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
              </Button>
            </div>
          </div>
          {targetUrl && !isValidUrl(targetUrl) && (
            <p className="text-xs text-destructive">
              Formato inválido. Usa: postgres://user:pass@host:port/database
            </p>
          )}
          {targetUrl && isValidUrl(targetUrl) && hasSpecialCharsInPassword(targetUrl) && (
            <p className="text-xs text-yellow-600 dark:text-yellow-400">
              ⚠️ La contraseña contiene caracteres especiales. Si hay errores de conexión, 
              considera cambiar la contraseña en el proyecto destino por una sin caracteres especiales.
            </p>
          )}
        </div>

        {/* Options */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Checkbox
              id="include-data"
              checked={includeData}
              onCheckedChange={(c) => setIncludeData(!!c)}
              disabled={cloning}
            />
            <Label htmlFor="include-data" className="text-sm cursor-pointer">
              Incluir todos los datos
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="include-storage"
              checked={includeStorage}
              onCheckedChange={(c) => setIncludeStorage(!!c)}
              disabled={cloning}
            />
            <Label htmlFor="include-storage" className="text-sm cursor-pointer">
              Actualizar URLs de storage al nuevo proyecto
            </Label>
          </div>
        </div>

        {/* Progress Section */}
        {isActive && (
          <div className="space-y-2 pt-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {PHASE_ICONS[progress.phase]}
                <span className="text-sm font-medium">
                  {PHASE_LABELS[progress.phase]}
                </span>
              </div>
              <Badge variant={progress.phase === 'done' ? 'default' : 'secondary'}>
                {Math.round(calculateProgressPercent())}%
              </Badge>
            </div>
            <Progress value={calculateProgressPercent()} className="h-2" />
            {progress.currentItem && (
              <p className="text-xs text-muted-foreground truncate">
                {progress.currentItem}
                {progress.total > 0 && ` (${progress.current}/${progress.total})`}
              </p>
            )}
          </div>
        )}

        {/* Error Display */}
        {progress.phase === 'error' && progress.error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="text-sm">
              {progress.error}
            </AlertDescription>
          </Alert>
        )}

        {/* Success Message */}
        {progress.phase === 'done' && (
          <Alert className="border-green-500 bg-green-50 dark:bg-green-950">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-sm text-green-700 dark:text-green-300">
              La base de datos ha sido clonada exitosamente. Recuerda configurar los secretos 
              y desplegar las Edge Functions en el nuevo proyecto.
            </AlertDescription>
          </Alert>
        )}

        {/* Verification Results */}
        {progress.phase === 'done' && verificationResults.length > 0 && (
          <div className="space-y-2 border rounded-lg p-3">
            <h5 className="text-sm font-medium flex items-center gap-2">
              Verificación de datos:
              {verificationResults.every(v => v.match) ? (
                <Badge variant="default" className="text-xs">✓ Todo correcto</Badge>
              ) : (
                <Badge variant="destructive" className="text-xs">Discrepancias</Badge>
              )}
            </h5>
            <div className="max-h-32 overflow-auto text-xs space-y-1">
              {verificationResults.map(v => (
                <div key={v.table} className="flex justify-between items-center py-0.5">
                  <span className="text-muted-foreground">{v.table}</span>
                  <span className={v.match ? 'text-green-600' : 'text-red-600'}>
                    {v.sourceCount} → {v.targetCount} {v.match ? '✓' : '✗'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-2 pt-2">
          {!cloning && progress.phase !== 'done' && (
            <Button
              onClick={handleStartClone}
              disabled={!isValidUrl(targetUrl)}
              className="flex-1"
            >
              <Database className="w-4 h-4 mr-2" />
              Iniciar Clonación
            </Button>
          )}
          {cloning && (
            <Button
              variant="destructive"
              onClick={handleCancel}
              className="flex-1"
            >
              <XCircle className="w-4 h-4 mr-2" />
              Cancelar
            </Button>
          )}
          {progress.phase === 'done' && (
            <Button
              variant="outline"
              onClick={() => setProgress({ phase: 'idle', current: 0, total: 0, currentItem: '' })}
              className="flex-1"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Nueva Clonación
            </Button>
          )}
        </div>

        {/* Instructions */}
        <div className="text-xs text-muted-foreground space-y-1 pt-2 border-t">
          <p className="font-medium">Instrucciones:</p>
          <ol className="list-decimal list-inside space-y-1">
            <li>Crea un proyecto vacío en supabase.com</li>
            <li>Ve a Settings → Database → Connection string → URI</li>
            <li>Copia la URL y pégala arriba</li>
            <li>Después de clonar, configura los secretos manualmente</li>
          </ol>
        </div>
      </CardContent>
    </Card>
  );
}
