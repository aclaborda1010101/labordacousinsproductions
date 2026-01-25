import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { 
  Database, 
  Loader2, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle,
  Eye,
  EyeOff,
  RefreshCw,
  Trash2,
  PlayCircle,
  Activity
} from 'lucide-react';
import { toast } from 'sonner';

type ClonePhase = 
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

type CloneCheckpoint = {
  completedPhases: ClonePhase[];
  completedTables: string[];
  currentTable: string | null;
  currentTableOffset: number;
  dataRowsCopied: number;
  tableCounts?: Record<string, number>;
  totalRows?: number;
};

type VerificationResult = { 
  table: string; 
  sourceCount: number; 
  targetCount: number; 
  match: boolean;
};

type CloneProgress = {
  phase: ClonePhase;
  current: number;
  total: number;
  currentItem: string;
  error?: string;
  cancelled?: boolean;
  verification?: VerificationResult[];
  verificationPassed?: boolean;
};

type PreviousJobInfo = {
  id: string;
  status: string;
  progress: CloneProgress;
  checkpoint?: CloneCheckpoint;
  updated_at: string;
  isStale: boolean;
};

// Stale threshold: 60 seconds without update
const STALE_THRESHOLD_MS = 60_000;

// Delay between steps (ms)
const STEP_DELAY_MS = 500;

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

const phaseProgress: Record<ClonePhase, number> = {
  idle: 0,
  connecting: 5,
  enums: 10,
  schema: 25,
  data: 75,
  functions: 85,
  policies: 92,
  verification: 98,
  done: 100,
  error: 0,
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
  const [previousJob, setPreviousJob] = useState<PreviousJobInfo | null>(null);
  const [cleaning, setCleaning] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [verificationResults, setVerificationResults] = useState<VerificationResult[]>([]);
  const [lastUpdateTime, setLastUpdateTime] = useState<number>(Date.now());
  const [isStepRunning, setIsStepRunning] = useState(false);
  
  const hasCheckedActiveJob = useRef(false);
  const isSteppingRef = useRef(false);
  const abortRef = useRef(false);

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
        return /[!@#$%^&*()+=\[\]{}|;':",.<>?/\\]/.test(decodeURIComponent(parsed.password));
      }
    } catch {
      const match = url.match(/:([^@]+)@/);
      if (match) {
        return /[!@#$%^&*()+=\[\]{}|;':",.<>?/\\]/.test(match[1]);
      }
    }
    return false;
  }, []);

  // Format time since last update
  const formatTimeSince = useCallback((timestamp: number): string => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 5) return 'ahora mismo';
    if (seconds < 60) return `hace ${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    return `hace ${minutes}m ${seconds % 60}s`;
  }, []);

  // The step-based runner - calls step repeatedly until done
  const runStepLoop = useCallback(async (currentJobId: string) => {
    if (isSteppingRef.current) {
      console.log('Step loop already running');
      return;
    }

    isSteppingRef.current = true;
    abortRef.current = false;
    setIsStepRunning(true);

    try {
      while (!abortRef.current) {
        const stepStart = Date.now();
        
        const { data, error } = await supabase.functions.invoke('clone-database', {
          body: { action: 'step', jobId: currentJobId }
        });

        if (error) {
          console.error('Step error:', error);
          // Wait and retry
          await new Promise(r => setTimeout(r, 2000));
          continue;
        }

        setLastUpdateTime(Date.now());

        if (data?.progress) {
          setProgress(data.progress);

          if (data.progress.verification) {
            setVerificationResults(data.progress.verification);
          }

          // Check if done or error
          if (data.progress.phase === 'done') {
            setCloning(false);
            setJobId(null);
            setPreviousJob(null);
            const passed = data.progress.verificationPassed;
            if (passed) {
              toast.success('¡Base de datos clonada y verificada exitosamente!');
            } else {
              toast.warning('Clonación completada con discrepancias. Revisa la verificación.');
            }
            break;
          }

          if (data.progress.phase === 'error') {
            setCloning(false);
            setJobId(null);
            toast.error(data.progress.error || 'Error durante la clonación');
            break;
          }
        }

        // If needsMore is false but not done/error, something is off
        if (!data?.needsMore && data?.progress?.phase !== 'done' && data?.progress?.phase !== 'error') {
          console.warn('Step returned needsMore=false but phase is not terminal:', data?.progress?.phase);
          break;
        }

        // If still needs more, wait a bit before next step
        if (data?.needsMore) {
          const elapsed = Date.now() - stepStart;
          const waitTime = Math.max(STEP_DELAY_MS - elapsed, 100);
          await new Promise(r => setTimeout(r, waitTime));
        } else {
          break;
        }
      }
    } catch (err) {
      console.error('Step loop exception:', err);
      toast.error('Error en el proceso de clonación');
    } finally {
      isSteppingRef.current = false;
      setIsStepRunning(false);
    }
  }, []);

  // Check for active or stale clone jobs on mount
  useEffect(() => {
    if (hasCheckedActiveJob.current) return;
    hasCheckedActiveJob.current = true;

    const checkActiveCloneJob = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // Look for recent clone jobs (last 2 hours)
        const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
        
        const { data: recentTask } = await supabase
          .from('background_tasks')
          .select('id, status, metadata, progress, updated_at')
          .eq('user_id', user.id)
          .eq('type', 'clone_database')
          .in('status', ['running', 'failed'])
          .gte('updated_at', twoHoursAgo)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (recentTask) {
          const meta = recentTask.metadata as any;
          const cloneProgress = meta?.clone?.progress as CloneProgress | undefined;
          const checkpoint = meta?.clone?.checkpoint as CloneCheckpoint | undefined;
          
          if (cloneProgress) {
            const lastUpdate = new Date(recentTask.updated_at).getTime();
            const isStale = recentTask.status === 'running' && 
                           Date.now() - lastUpdate > STALE_THRESHOLD_MS;

            if (recentTask.status === 'running' && !isStale) {
              // Active job - reconnect and resume stepping
              setJobId(recentTask.id);
              setCloning(true);
              setProgress(cloneProgress);
              setLastUpdateTime(lastUpdate);
              toast.info('Reconectando a clonación en progreso...');
              // Start step loop
              runStepLoop(recentTask.id);
            } else {
              // Stale or failed job - show recovery options
              setPreviousJob({
                id: recentTask.id,
                status: recentTask.status,
                progress: cloneProgress,
                checkpoint,
                updated_at: recentTask.updated_at,
                isStale,
              });
            }
          }
        }
      } catch (err) {
        console.error('Error checking for active clone job:', err);
      }
    };

    checkActiveCloneJob();
  }, [runStepLoop]);

  // Update the "time since last update" display
  useEffect(() => {
    if (!cloning) return;
    
    const interval = setInterval(() => {
      // Force re-render to update the "hace Xs" display
      setLastUpdateTime(prev => prev);
    }, 1000);

    return () => clearInterval(interval);
  }, [cloning]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortRef.current = true;
    };
  }, []);

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
      currentItem: 'Creando job de clonación...'
    });
    setPreviousJob(null);
    setLastUpdateTime(Date.now());

    try {
      const { data, error } = await supabase.functions.invoke('clone-database', {
        body: {
          action: 'start',
          targetUrl: targetUrl.trim(),
          options: { includeData, includeStorage }
        }
      });

      if (error) throw error;

      if (data?.jobId) {
        setJobId(data.jobId);
        toast.info('Clonación iniciada. Monitorizando en tiempo real...');
        // Start the step loop
        runStepLoop(data.jobId);
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

  const handleResume = async () => {
    if (!previousJob) return;

    setResuming(true);
    try {
      const { data, error } = await supabase.functions.invoke('clone-database', {
        body: { action: 'resume', jobId: previousJob.id }
      });

      if (error) throw error;

      if (data?.resumed) {
        setJobId(previousJob.id);
        setCloning(true);
        setPreviousJob(null);
        setLastUpdateTime(Date.now());
        toast.info(`Reanudando desde ${data.fromTable || data.fromPhase}...`);
        // Start the step loop
        runStepLoop(previousJob.id);
      } else if (data?.error) {
        throw new Error(data.error);
      }
    } catch (err: any) {
      toast.error(err.message || 'Error al reanudar');
    } finally {
      setResuming(false);
    }
  };

  const handleCleanAndRetry = async () => {
    if (!isValidUrl(targetUrl)) {
      toast.error('Primero ingresa una URL válida del proyecto destino');
      return;
    }

    setCleaning(true);
    try {
      // First clean the target
      const { data: cleanData, error: cleanError } = await supabase.functions.invoke('clone-database', {
        body: { action: 'clean', targetUrl: targetUrl.trim() }
      });

      if (cleanError) throw cleanError;
      if (cleanData?.error) throw new Error(cleanData.error);

      toast.success('Base de datos destino limpiada');
      
      // Mark previous job as cancelled
      if (previousJob) {
        await supabase.functions.invoke('clone-database', {
          body: { action: 'cancel', jobId: previousJob.id }
        });
      }

      setPreviousJob(null);
      setCleaning(false);
      
      // Start fresh clone
      await handleStartClone();
    } catch (err: any) {
      console.error('Clean and retry error:', err);
      setCleaning(false);
      toast.error(err.message || 'Error al limpiar el destino');
    }
  };

  const handleCancel = async () => {
    // Stop the step loop
    abortRef.current = true;

    if (!jobId) {
      setCloning(false);
      return;
    }

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

  const handleDismissPreviousJob = () => {
    setPreviousJob(null);
  };

  const calculateProgressPercent = useCallback((): number => {
    const basePercent = phaseProgress[progress.phase] || 0;
    
    if (progress.phase === 'data' && progress.total > 0) {
      const dataProgress = (progress.current / progress.total) * 50;
      return Math.min(25 + dataProgress, 75);
    }
    
    return basePercent;
  }, [progress]);

  const formatCheckpointInfo = (checkpoint?: CloneCheckpoint) => {
    if (!checkpoint) return null;
    
    const completedTables = checkpoint.completedTables.length;
    const currentTable = checkpoint.currentTable;
    const offset = checkpoint.currentTableOffset;
    
    if (currentTable) {
      return `${completedTables} tablas completas, en progreso: ${currentTable} (registro ${offset})`;
    }
    return `${completedTables} tablas completas`;
  };

  const isActive = cloning || cleaning || progress.phase === 'done';

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
        {/* Previous/Stale Job Alert */}
        {previousJob && (
          <Alert className={previousJob.isStale ? "border-orange-500 bg-orange-50 dark:bg-orange-950/20" : "border-red-500 bg-red-50 dark:bg-red-950/20"}>
            <AlertTriangle className={`h-4 w-4 ${previousJob.isStale ? 'text-orange-600' : 'text-red-600'}`} />
            <AlertDescription className="space-y-2">
              <p className="font-medium">
                {previousJob.isStale 
                  ? 'Clonación interrumpida detectada' 
                  : 'Clonación anterior fallida'}
              </p>
              <p className="text-sm text-muted-foreground">
                Fase: {PHASE_LABELS[previousJob.progress.phase]} - {previousJob.progress.currentItem}
              </p>
              {previousJob.checkpoint && (
                <p className="text-xs text-muted-foreground">
                  Checkpoint: {formatCheckpointInfo(previousJob.checkpoint)}
                </p>
              )}
              {previousJob.progress.error && (
                <p className="text-sm text-red-600">{previousJob.progress.error}</p>
              )}
              <div className="flex flex-wrap gap-2 mt-3">
                <Button 
                  size="sm" 
                  onClick={handleResume}
                  disabled={resuming || cleaning}
                >
                  {resuming ? (
                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                  ) : (
                    <PlayCircle className="w-3 h-3 mr-1" />
                  )}
                  Reanudar desde aquí
                </Button>
                <Button 
                  size="sm" 
                  variant="destructive" 
                  onClick={handleCleanAndRetry}
                  disabled={resuming || cleaning || !isValidUrl(targetUrl)}
                >
                  {cleaning ? (
                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                  ) : (
                    <Trash2 className="w-3 h-3 mr-1" />
                  )}
                  Limpiar y empezar de cero
                </Button>
                <Button 
                  size="sm" 
                  variant="ghost" 
                  onClick={handleDismissPreviousJob}
                  disabled={resuming || cleaning}
                >
                  Descartar
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        )}

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
              considera cambiar la contraseña en el proyecto destino.
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
                {progress.total > 0 && ` (${progress.current.toLocaleString()}/${progress.total.toLocaleString()})`}
              </p>
            )}
            {/* Real-time monitoring indicators */}
            {cloning && (
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Activity className={`w-3 h-3 ${isStepRunning ? 'text-green-500 animate-pulse' : 'text-muted-foreground'}`} />
                  {isStepRunning ? 'Ejecutando paso...' : 'Esperando...'}
                </span>
                <span>Última actualización: {formatTimeSince(lastUpdateTime)}</span>
              </div>
            )}
          </div>
        )}

        {/* Error Display */}
        {progress.phase === 'error' && progress.error && !previousJob && (
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
          {!cloning ? (
            <Button 
              onClick={handleStartClone} 
              disabled={!isValidUrl(targetUrl) || cleaning || resuming}
              className="flex-1"
            >
              <Database className="w-4 h-4 mr-2" />
              Iniciar Clonación
            </Button>
          ) : (
            <Button 
              variant="destructive" 
              onClick={handleCancel}
              className="flex-1"
            >
              <XCircle className="w-4 h-4 mr-2" />
              Cancelar
            </Button>
          )}
        </div>

        {/* Instructions */}
        <div className="text-xs text-muted-foreground space-y-1 pt-4 border-t">
          <p className="font-medium">Pasos previos en el proyecto destino:</p>
          <ol className="list-decimal list-inside space-y-1 ml-2">
            <li>Crear un nuevo proyecto en Supabase</li>
            <li>Copiar la Connection String (URI) desde Settings → Database</li>
            <li>Ejecutar las mismas migraciones (o descargar Bundle y aplicar)</li>
            <li>Configurar los mismos secrets en las Edge Functions</li>
          </ol>
        </div>
      </CardContent>
    </Card>
  );
}

export default DatabaseCloner;
