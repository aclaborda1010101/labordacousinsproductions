/**
 * OutlineWizardV11 - Visual wizard for SOP V11 Pipeline
 * 
 * Shows:
 * - Current pipeline stage badge
 * - Visual checklist of requirements
 * - Main action button (progressive)
 * - Blockers panel when QC fails
 */

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import {
  CheckCircle,
  XCircle,
  Lock,
  Loader2,
  AlertTriangle,
  Zap,
  GitBranch,
  Crown,
  Sparkles,
  ChevronRight,
  RefreshCw,
} from 'lucide-react';
import { STAGE_CONFIG, humanizeBlocker, groupBlockers, getSuggestedAction, type PipelineStage, type QCStatus } from '@/lib/qcUtils';

interface OutlineWizardV11Props {
  outline: Record<string, unknown> | null;
  qcStatus: QCStatus | null;
  isEnriching: boolean;
  isUpgrading: boolean;
  isPipelineRunning: boolean;
  onEnrich: () => void;
  onThreads: () => void;
  onShowrunner: () => void;
  onGenerateEpisodes: () => void;
  // P0: Staleness detection + resume
  isStaleGenerating?: boolean;
  canResume?: boolean;
  onResume?: () => void;
  outlineParts?: any;
}

interface ChecklistItem {
  id: string;
  label: string;
  passed: boolean;
  stage: PipelineStage;
}

function getChecklistItems(outline: Record<string, unknown> | null): ChecklistItem[] {
  if (!outline) return [];
  
  const arc = (outline.season_arc as Record<string, unknown>) || {};
  const episodes = (outline.episode_beats as unknown[]) || [];
  const threads = (outline.threads as unknown[]) || [];
  const factions = (outline.factions as unknown[]) || [];
  
  // Check 5 hitos
  const has5Hitos = Boolean(
    arc.inciting_incident &&
    arc.first_turn &&
    arc.midpoint_reversal &&
    arc.all_is_lost &&
    arc.final_choice
  );
  
  // Check setpieces in all episodes
  const hasSetpieces = episodes.every((ep: any) => {
    const sp = ep?.setpiece;
    return sp?.stakes && sp?.participants?.length > 0;
  });
  
  // Check turning points (4+ per episode with proper structure)
  const hasTurningPoints = episodes.every((ep: any) => {
    const tps = ep?.turning_points;
    if (!Array.isArray(tps) || tps.length < 4) return false;
    return tps.every((tp: any) => 
      typeof tp === 'object' && tp?.agent && tp?.event && tp?.consequence
    );
  });
  
  // Check threads (5-8)
  const hasThreads = threads.length >= 5 && threads.length <= 8;
  
  // Check thread_usage in all episodes
  const hasThreadUsage = episodes.every((ep: any) => {
    const tu = ep?.thread_usage;
    return tu?.A && tu?.crossover_event;
  });
  
  // Check factions (2+)
  const hasFactions = factions.length >= 2;
  
  // Check cliffhangers
  const hasCliffhangers = episodes.every((ep: any) => 
    typeof ep?.cliffhanger === 'string' && ep.cliffhanger.length >= 12
  );
  
  return [
    { id: '5hitos', label: '5 hitos del arco de temporada', passed: has5Hitos, stage: 'operational' },
    { id: 'factions', label: 'Facciones en conflicto (mín 2)', passed: hasFactions, stage: 'operational' },
    { id: 'setpieces', label: 'Setpieces con stakes y participantes', passed: hasSetpieces, stage: 'operational' },
    { id: 'turningpoints', label: 'Turning points estructurados (4+ por ep)', passed: hasTurningPoints, stage: 'operational' },
    { id: 'cliffhangers', label: 'Cliffhangers por episodio', passed: hasCliffhangers, stage: 'operational' },
    { id: 'threads', label: 'Threads narrativos (5-8)', passed: hasThreads, stage: 'threaded' },
    { id: 'threadusage', label: 'Thread usage por episodio (A + cruce)', passed: hasThreadUsage, stage: 'threaded' },
  ];
}

// Helper to show completed parts description
function getCompletedPartsDescription(parts: any): string {
  if (!parts) return 'Ninguna';
  const completed: string[] = [];
  if (parts?.film_scaffold?.status === 'done') completed.push('Scaffold');
  if (parts?.expand_act_i?.status === 'done') completed.push('Acto I');
  if (parts?.expand_act_ii?.status === 'done') completed.push('Acto II');
  if (parts?.expand_act_iii?.status === 'done') completed.push('Acto III');
  if (parts?.part_a?.status === 'done') completed.push('Parte A');
  if (parts?.part_b?.status === 'done') completed.push('Parte B');
  if (parts?.part_c?.status === 'done') completed.push('Parte C');
  return completed.length > 0 ? completed.join(', ') : 'Ninguna';
}

export default function OutlineWizardV11({
  outline,
  qcStatus,
  isEnriching,
  isUpgrading,
  isPipelineRunning,
  onEnrich,
  onThreads,
  onShowrunner,
  onGenerateEpisodes,
  isStaleGenerating,
  canResume,
  onResume,
  outlineParts,
}: OutlineWizardV11Props) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  
  const checklistItems = useMemo(() => getChecklistItems(outline), [outline]);
  const passedCount = checklistItems.filter(item => item.passed).length;
  const totalCount = checklistItems.length;
  const progressPercent = totalCount > 0 ? Math.round((passedCount / totalCount) * 100) : 0;
  
  const stageConfig = qcStatus ? STAGE_CONFIG[qcStatus.pipelineStage] : STAGE_CONFIG.light;
  const suggestedAction = qcStatus ? getSuggestedAction(qcStatus.blockers, qcStatus.pipelineStage) : null;
  const groupedBlockers = qcStatus ? groupBlockers(qcStatus.blockers) : {};
  
  const isLoading = isEnriching || isUpgrading || isPipelineRunning;
  
  if (!outline || !qcStatus) return null;

  return (
    <Card className={`border-2 ${stageConfig.borderColor} ${stageConfig.bgColor}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Sparkles className="w-5 h-5" />
            Estado del Outline
          </CardTitle>
          
          {/* Stage Badge */}
          <Badge 
            variant="outline" 
            className={`text-sm px-3 py-1 ${stageConfig.bgColor} ${stageConfig.borderColor} ${stageConfig.color}`}
          >
            {stageConfig.emoji} {stageConfig.label}
          </Badge>
        </div>
        
        <CardDescription>
          {qcStatus.canGenerateEpisodes 
            ? '✅ Outline listo para generar episodios'
            : `Completa ${totalCount - passedCount} requisitos más para generar episodios`
          }
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* P0: Banner de generación pausada con opción de resume */}
        {canResume && isStaleGenerating && (
          <Alert className="border-amber-500/50 bg-amber-500/10">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertTitle className="text-amber-700 dark:text-amber-300">
              Generación pausada
            </AlertTitle>
            <AlertDescription className="text-amber-600/80 dark:text-amber-400/80">
              <p className="mb-2">
                No hay heartbeat reciente, pero hay trabajo guardado. 
                Puedes continuar desde el último paso completado.
              </p>
              {outlineParts && (
                <p className="text-xs mb-2 opacity-75">
                  Partes completadas: {getCompletedPartsDescription(outlineParts)}
                </p>
              )}
              <Button 
                variant="default" 
                size="sm"
                onClick={onResume}
                className="mt-2"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Continuar generación
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Progreso</span>
            <span className="font-medium">{passedCount}/{totalCount} requisitos</span>
          </div>
          <Progress value={progressPercent} className="h-2" />
        </div>
        
        {/* Checklist */}
        <div className="grid gap-2">
          {checklistItems.map((item) => (
            <div 
              key={item.id}
              className={`flex items-center gap-2 p-2 rounded-lg text-sm ${
                item.passed 
                  ? 'bg-green-500/10 text-green-700 dark:text-green-300' 
                  : 'bg-muted/50 text-muted-foreground'
              }`}
            >
              {item.passed ? (
                <CheckCircle className="w-4 h-4 shrink-0 text-green-500" />
              ) : (
                <XCircle className="w-4 h-4 shrink-0 text-muted-foreground" />
              )}
              <span>{item.label}</span>
              {!item.passed && (
                <Badge variant="outline" className="ml-auto text-xs">
                  {item.stage === 'operational' ? 'Carne Op.' : 'Threads'}
                </Badge>
              )}
            </div>
          ))}
        </div>
        
        {/* QC Score */}
        <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
          <span className="text-sm text-muted-foreground">QC Score</span>
          <Badge 
            variant={qcStatus.score >= 80 ? 'default' : qcStatus.score >= 60 ? 'secondary' : 'destructive'}
            className="text-lg px-3"
          >
            {qcStatus.score}/100
          </Badge>
        </div>
        
        {/* Blockers Panel */}
        {qcStatus.blockers.length > 0 && !qcStatus.canGenerateEpisodes && (
          <Alert variant="destructive" className="border-red-500/30">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Outline aún no está listo</AlertTitle>
            <AlertDescription className="mt-2">
              <div className="space-y-2">
                {Object.entries(groupedBlockers).map(([category, items]) => (
                  <div key={category}>
                    <p className="font-medium text-xs uppercase text-red-600 dark:text-red-400 mb-1">
                      {category}
                    </p>
                    <ul className="space-y-0.5 text-xs">
                      {items.slice(0, 3).map((item, i) => (
                        <li key={i} className="flex items-start gap-1">
                          <span>•</span>
                          <span>{item}</span>
                        </li>
                      ))}
                      {items.length > 3 && (
                        <li className="italic text-red-400">+{items.length - 3} más</li>
                      )}
                    </ul>
                  </div>
                ))}
              </div>
            </AlertDescription>
          </Alert>
        )}
        
        {/* Main Action Button */}
        <div className="pt-2 space-y-3">
          {suggestedAction && !qcStatus.canGenerateEpisodes && (
            <Button
              variant={suggestedAction.action === 'enrich' ? 'default' : 'secondary'}
              size="lg"
              className="w-full"
              onClick={() => {
                if (suggestedAction.action === 'enrich') onEnrich();
                else if (suggestedAction.action === 'threads') onThreads();
                else if (suggestedAction.action === 'showrunner') onShowrunner();
              }}
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : suggestedAction.action === 'enrich' ? (
                <Zap className="w-4 h-4 mr-2" />
              ) : suggestedAction.action === 'threads' ? (
                <GitBranch className="w-4 h-4 mr-2" />
              ) : (
                <Crown className="w-4 h-4 mr-2" />
              )}
              {suggestedAction.label}
              <ChevronRight className="w-4 h-4 ml-2" />
            </Button>
          )}
          
          {/* Generate Episodes Button */}
          <Button
            variant="gold"
            size="lg"
            className="w-full"
            onClick={onGenerateEpisodes}
            disabled={!qcStatus.canGenerateEpisodes || isLoading}
          >
            {qcStatus.canGenerateEpisodes ? (
              <>
                <CheckCircle className="w-4 h-4 mr-2" />
                ✅ Aprobar y Generar Episodios
              </>
            ) : (
              <>
                <Lock className="w-4 h-4 mr-2" />
                🔒 Completa el outline primero
              </>
            )}
          </Button>
          
          {/* Advanced toggle */}
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-muted-foreground"
            onClick={() => setShowAdvanced(!showAdvanced)}
          >
            {showAdvanced ? 'Ocultar' : 'Ver'} pasos avanzados
          </Button>
          
          {/* Advanced buttons */}
          {showAdvanced && (
            <div className="grid grid-cols-2 gap-2 pt-2 border-t">
              <Button
                variant="outline"
                size="sm"
                onClick={onEnrich}
                disabled={isLoading}
                className="bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/30 text-emerald-700 dark:text-emerald-300"
              >
                <Zap className="w-3 h-3 mr-1" />
                Carne Op.
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={onThreads}
                disabled={isLoading}
                className="bg-indigo-500/10 hover:bg-indigo-500/20 border-indigo-500/30 text-indigo-700 dark:text-indigo-300"
              >
                <GitBranch className="w-3 h-3 mr-1" />
                Threads
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={onShowrunner}
                disabled={isLoading}
                className="bg-purple-500/10 hover:bg-purple-500/20 border-purple-500/30 text-purple-700 dark:text-purple-300"
              >
                <Crown className="w-3 h-3 mr-1" />
                Showrunner
              </Button>
            </div>
          )}
        </div>
        
        {/* Warnings */}
        {qcStatus.warnings.length > 0 && (
          <div className="pt-2 border-t">
            <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1 mb-1">
              <AlertTriangle className="w-3 h-3" />
              Advertencias ({qcStatus.warnings.length})
            </p>
            <ul className="text-xs text-muted-foreground space-y-0.5">
              {qcStatus.warnings.slice(0, 3).map((w, i) => (
                <li key={i}>• {humanizeBlocker(w)}</li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
