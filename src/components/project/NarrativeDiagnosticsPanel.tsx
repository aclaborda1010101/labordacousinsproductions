/**
 * NarrativeDiagnosticsPanel - Debug panel for narrative generation state
 * 
 * Shows:
 * - scene_intent count and status breakdown
 * - jobs count and status breakdown  
 * - narrative_state presence
 * - Orphan detection and auto-cleanup
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { 
  Bug, 
  RefreshCw, 
  Trash2, 
  ChevronDown,
  AlertTriangle,
  CheckCircle,
  Database,
  Loader2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface DiagnosticsData {
  sceneIntents: {
    total: number;
    byStatus: Record<string, number>;
  };
  jobs: {
    total: number;
    byStatus: Record<string, number>;
    orphaned: number;
  };
  narrativeState: {
    exists: boolean;
    phase?: string;
    scenesGenerated?: number;
  };
  sceneRepairs: {
    total: number;
    byStatus: Record<string, number>;
  };
  integrityIssues: string[];
}

interface NarrativeDiagnosticsPanelProps {
  projectId: string;
  onCleanupComplete?: () => void;
}

export function NarrativeDiagnosticsPanel({ 
  projectId, 
  onCleanupComplete 
}: NarrativeDiagnosticsPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false);
  const [diagnostics, setDiagnostics] = useState<DiagnosticsData | null>(null);

  const runDiagnostics = useCallback(async () => {
    setIsLoading(true);
    try {
      // Fetch scene_intents
      const { data: intents } = await supabase
        .from('scene_intent')
        .select('id, status, job_id')
        .eq('project_id', projectId);

      // Fetch jobs
      const { data: jobs } = await supabase
        .from('jobs')
        .select('id, status, type, payload')
        .eq('project_id', projectId)
        .eq('type', 'scene_generation');

      // Fetch narrative_state
      const { data: narrativeState } = await supabase
        .from('narrative_state')
        .select('id, current_phase, scenes_generated')
        .eq('project_id', projectId)
        .maybeSingle();

      // Fetch scene_repairs
      const { data: repairs } = await supabase
        .from('scene_repairs')
        .select('id, status')
        .eq('project_id', projectId);

      // Calculate status breakdowns
      const intentsByStatus: Record<string, number> = {};
      const intentIds = new Set<string>();
      (intents || []).forEach(i => {
        intentsByStatus[i.status] = (intentsByStatus[i.status] || 0) + 1;
        intentIds.add(i.id);
      });

      const jobsByStatus: Record<string, number> = {};
      let orphanedJobs = 0;
      (jobs || []).forEach(j => {
        jobsByStatus[j.status] = (jobsByStatus[j.status] || 0) + 1;
        // Check if job references a non-existent intent
        const payload = j.payload as { scene_intent_id?: string } | null;
        if (payload?.scene_intent_id && !intentIds.has(payload.scene_intent_id)) {
          orphanedJobs++;
        }
      });

      const repairsByStatus: Record<string, number> = {};
      (repairs || []).forEach(r => {
        repairsByStatus[r.status] = (repairsByStatus[r.status] || 0) + 1;
      });

      // Detect integrity issues
      const issues: string[] = [];
      
      if (orphanedJobs > 0) {
        issues.push(`${orphanedJobs} jobs huérfanos (apuntan a scene_intents inexistentes)`);
      }
      
      if ((jobs?.length || 0) > 0 && (intents?.length || 0) === 0) {
        issues.push('Jobs sin scene_intents correspondientes');
      }

      const pendingJobs = jobs?.filter(j => ['queued', 'pending', 'running'].includes(j.status)) || [];
      if (pendingJobs.length > 0 && !narrativeState) {
        issues.push('Jobs pendientes sin narrative_state');
      }

      setDiagnostics({
        sceneIntents: {
          total: intents?.length || 0,
          byStatus: intentsByStatus,
        },
        jobs: {
          total: jobs?.length || 0,
          byStatus: jobsByStatus,
          orphaned: orphanedJobs,
        },
        narrativeState: {
          exists: !!narrativeState,
          phase: narrativeState?.current_phase,
          scenesGenerated: narrativeState?.scenes_generated,
        },
        sceneRepairs: {
          total: repairs?.length || 0,
          byStatus: repairsByStatus,
        },
        integrityIssues: issues,
      });

    } catch (err) {
      console.error('[Diagnostics] Error:', err);
      toast.error('Error al ejecutar diagnósticos');
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  const cleanupOrphanedData = useCallback(async () => {
    setIsCleaning(true);
    try {
      // 1. Delete orphaned jobs
      const { error: jobsError } = await supabase
        .from('jobs')
        .delete()
        .eq('project_id', projectId)
        .eq('type', 'scene_generation')
        .in('status', ['queued', 'running', 'blocked'] as const);

      if (jobsError) throw jobsError;

      // 2. Delete scene_repairs  
      const { error: repairsError } = await supabase
        .from('scene_repairs')
        .delete()
        .eq('project_id', projectId);

      if (repairsError) throw repairsError;

      // 3. Delete scene_intents
      const { error: intentsError } = await supabase
        .from('scene_intent')
        .delete()
        .eq('project_id', projectId);

      if (intentsError) throw intentsError;

      // 4. Delete narrative_state
      const { error: stateError } = await supabase
        .from('narrative_state')
        .delete()
        .eq('project_id', projectId);

      if (stateError) throw stateError;

      toast.success('Datos de generación limpiados correctamente');
      await runDiagnostics();
      onCleanupComplete?.();

    } catch (err) {
      console.error('[Diagnostics] Cleanup error:', err);
      toast.error('Error al limpiar datos');
    } finally {
      setIsCleaning(false);
    }
  }, [projectId, runDiagnostics, onCleanupComplete]);

  // Run diagnostics when panel opens
  useEffect(() => {
    if (isOpen && !diagnostics) {
      runDiagnostics();
    }
  }, [isOpen, diagnostics, runDiagnostics]);

  const hasIssues = (diagnostics?.integrityIssues.length || 0) > 0;
  const hasData = (diagnostics?.sceneIntents.total || 0) > 0 || 
                  (diagnostics?.jobs.total || 0) > 0 ||
                  diagnostics?.narrativeState.exists;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <Button 
          variant="ghost" 
          size="sm" 
          className={cn(
            "w-full justify-between text-xs",
            hasIssues && "text-amber-600"
          )}
        >
          <span className="flex items-center gap-1">
            <Bug className="h-3 w-3" />
            Diagnósticos
            {hasIssues && (
              <Badge variant="destructive" className="text-[10px] px-1">
                {diagnostics?.integrityIssues.length}
              </Badge>
            )}
          </span>
          <ChevronDown className={cn(
            "h-3 w-3 transition-transform",
            isOpen && "rotate-180"
          )} />
        </Button>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <Card className="mt-2 border-dashed">
          <CardHeader className="py-2 px-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs flex items-center gap-1">
                <Database className="h-3 w-3" />
                Estado del Sistema Narrativo
              </CardTitle>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={runDiagnostics}
                disabled={isLoading}
              >
                <RefreshCw className={cn("h-3 w-3", isLoading && "animate-spin")} />
              </Button>
            </div>
          </CardHeader>

          <CardContent className="py-2 px-3 space-y-3">
            {isLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            ) : diagnostics ? (
              <>
                {/* Integrity Issues */}
                {hasIssues && (
                  <div className="p-2 bg-amber-500/10 border border-amber-500/20 rounded text-xs space-y-1">
                    <div className="flex items-center gap-1 font-medium text-amber-600">
                      <AlertTriangle className="h-3 w-3" />
                      Problemas de Integridad
                    </div>
                    <ul className="list-disc list-inside text-muted-foreground">
                      {diagnostics.integrityIssues.map((issue, i) => (
                        <li key={i}>{issue}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* No issues badge */}
                {!hasIssues && hasData && (
                  <div className="flex items-center gap-1 text-xs text-green-600">
                    <CheckCircle className="h-3 w-3" />
                    Sin problemas de integridad
                  </div>
                )}

                {/* Data Summary */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {/* Scene Intents */}
                  <div className="p-2 bg-muted/50 rounded">
                    <div className="font-medium mb-1">scene_intent</div>
                    <div className="text-muted-foreground">
                      Total: {diagnostics.sceneIntents.total}
                    </div>
                    {Object.entries(diagnostics.sceneIntents.byStatus).map(([status, count]) => (
                      <div key={status} className="text-muted-foreground">
                        {status}: {count}
                      </div>
                    ))}
                  </div>

                  {/* Jobs */}
                  <div className="p-2 bg-muted/50 rounded">
                    <div className="font-medium mb-1">jobs</div>
                    <div className="text-muted-foreground">
                      Total: {diagnostics.jobs.total}
                    </div>
                    {diagnostics.jobs.orphaned > 0 && (
                      <div className="text-amber-600">
                        Huérfanos: {diagnostics.jobs.orphaned}
                      </div>
                    )}
                    {Object.entries(diagnostics.jobs.byStatus).map(([status, count]) => (
                      <div key={status} className="text-muted-foreground">
                        {status}: {count}
                      </div>
                    ))}
                  </div>

                  {/* Narrative State */}
                  <div className="p-2 bg-muted/50 rounded">
                    <div className="font-medium mb-1">narrative_state</div>
                    <div className="text-muted-foreground">
                      {diagnostics.narrativeState.exists ? (
                        <>
                          <div>Fase: {diagnostics.narrativeState.phase || 'N/A'}</div>
                          <div>Escenas: {diagnostics.narrativeState.scenesGenerated || 0}</div>
                        </>
                      ) : (
                        'No existe'
                      )}
                    </div>
                  </div>

                  {/* Scene Repairs */}
                  <div className="p-2 bg-muted/50 rounded">
                    <div className="font-medium mb-1">scene_repairs</div>
                    <div className="text-muted-foreground">
                      Total: {diagnostics.sceneRepairs.total}
                    </div>
                    {Object.entries(diagnostics.sceneRepairs.byStatus).map(([status, count]) => (
                      <div key={status} className="text-muted-foreground">
                        {status}: {count}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Cleanup Button */}
                {hasData && (
                  <Button
                    variant="destructive"
                    size="sm"
                    className="w-full text-xs"
                    onClick={cleanupOrphanedData}
                    disabled={isCleaning}
                  >
                    {isCleaning ? (
                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    ) : (
                      <Trash2 className="h-3 w-3 mr-1" />
                    )}
                    Limpiar Todos los Datos de Generación
                  </Button>
                )}

                {/* No data message */}
                {!hasData && (
                  <div className="text-xs text-muted-foreground text-center py-2">
                    No hay datos de generación narrativa
                  </div>
                )}
              </>
            ) : null}
          </CardContent>
        </Card>
      </CollapsibleContent>
    </Collapsible>
  );
}

export default NarrativeDiagnosticsPanel;
