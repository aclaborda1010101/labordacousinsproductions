import { useState, useEffect, forwardRef, useRef, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { invokeAuthedFunction } from '@/lib/invokeAuthedFunction';
import { invokeWithTimeout, InvokeFunctionError } from '@/lib/supabaseFetchWithTimeout';
import {
  type BatchPlan,
  type GenerationState,
  type DensityGateResult,
  buildClientBatchPlan,
  createInitialState,
  updateGenerationStateClient,
  validateBatchResult
} from '@/lib/batchPlannerTypes';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';

import EpisodeRegenerateDialog from './EpisodeRegenerateDialog';
import { CastingReportTable } from './CastingReportTable';
import OutlineWizardV11 from './OutlineWizardV11';
import ThreadsDisplay from './ThreadsDisplay';
import { useVoiceRecorder } from '@/hooks/useVoiceRecorder';
import { DensityProfileSelector } from './DensityProfileSelector';
import { 
  FileText, 
  Wand2, 
  Loader2,
  CheckCircle,
  Film,
  Users,
  MapPin,
  Lightbulb,
  Stethoscope,
  Layers,
  AlertTriangle,
  Info,
  ChevronDown,
  ChevronUp,
  Download,
  Lock,
  Unlock,
  Package,
  Volume2,
  Zap,
  BookOpen,
  FileDown,
  Settings2,
  Rocket,
  XCircle,
  RefreshCw,
  Snowflake,
  Import,
  CheckSquare,
  Square,
  Sparkles,
  Scissors,
  Trash2,
  Book,
  History,
  RotateCcw,
  Video,
  Play,
  PlayCircle,
  Clapperboard,
  Mic,
  MicOff,
  Upload,
  ArrowRight,
  Crown,
  Shield,
  GitBranch
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import jsPDF from 'jspdf';
import { ScrollArea } from '@/components/ui/scroll-area';
import { calculateAutoTargets, CalculatedTargets, TargetInputs, calculateDynamicBatches, BatchConfig, QualityTier, QUALITY_TIERS } from '@/lib/autoTargets';
import { type QCStatus, STAGE_CONFIG } from '@/lib/qcUtils';

/**
 * Checks if a materialize-entities response indicates NO_OUTLINE_FOUND.
 * When edge function returns 404, Supabase puts the JSON body in `data` (not `error.message`).
 */
function isMaterializeNoOutline(data: any, error: any): boolean {
  // Case 1: Direct data.error check (most common)
  if (data?.error === 'NO_OUTLINE_FOUND') return true;
  
  // Case 2: error.context.bodyJson for some Supabase versions
  if ((error as any)?.context?.status === 404 && 
      (error as any)?.context?.bodyJson?.error === 'NO_OUTLINE_FOUND') return true;
  
  // Case 3: Error message contains the error code
  if (error?.message?.includes('NO_OUTLINE_FOUND')) return true;
  
  // Case 4: Stringified response contains the error
  try {
    const stringified = JSON.stringify(data) + JSON.stringify(error);
    if (stringified.includes('NO_OUTLINE_FOUND')) return true;
  } catch {}
  
  return false;
}

// Helper to migrate legacy quality tier values to new system
function migrateQualityTier(tier: string): QualityTier {
  const legacyMap: Record<string, QualityTier> = {
    'DRAFT': 'rapido',
    'PRODUCTION': 'profesional',
    'draft': 'rapido',
    'production': 'profesional'
  };
  
  if (tier === 'rapido' || tier === 'profesional' || tier === 'hollywood') {
    return tier as QualityTier;
  }
  
  return legacyMap[tier] || 'profesional';
}
import { useCreativeModeOptional } from '@/contexts/CreativeModeContext';
import { exportScreenplayPDF, exportEpisodeScreenplayPDF } from '@/lib/exportScreenplayPDF';
import { exportOutlinePDF, type OutlineData as OutlinePDFData } from '@/lib/exportOutlinePDF';
import { getSceneSlugline } from '@/lib/sceneNormalizer';
import {
  estimateEpisodeMs,
  estimateBatchMs,
  estimateFullScriptMs,
  formatDurationMs,
  loadScriptTimingModel,
  saveScriptTimingModel,
  updateBatchTiming,
  updateOutlineTiming,
} from '@/lib/scriptTimingModel';
import { useBackgroundTasks } from '@/contexts/BackgroundTasksContext';
import { retryWithBackoff, isRetryableError } from '@/lib/retryWithBackoff';
import { saveDraft, loadDraft, deleteDraft } from '@/lib/draftPersistence';
import { useOutlinePersistence } from '@/hooks/useOutlinePersistence';
import { getStageInfo, deriveProgress } from '@/lib/outlineStages';
import OutlineStatusPanel from './OutlineStatusPanel';
import { ScriptGenerationOverlay } from './ScriptGenerationOverlay';
import ProjectDataStatus from './ProjectDataStatus';
import {
  hydrateCharacters,
  hydrateLocations,
  hydrateScenes,
  hydrateProps,
  getBreakdownPayload,
  buildRobustCounts,
  extractTitle,
  extractWriters,
} from '@/lib/breakdown/hydrate';
import { 
  normalizeOutlineForDisplay, 
  getCharacterDescription, 
  getLocationDescription 
} from '@/lib/outlineEntityDisplay';

interface ScriptImportProps {
  projectId: string;
  onScenesCreated?: () => void;
}

interface PipelineStep {
  id: string;
  label: string;
  status: 'pending' | 'running' | 'success' | 'error';
}

export default function ScriptImport({ projectId, onScenesCreated }: ScriptImportProps) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('generate');
  const [scriptText, setScriptText] = useState('');
  const [scriptLocked, setScriptLocked] = useState(false);
  const [currentScriptId, setCurrentScriptId] = useState<string | null>(null);
  
  // Outline persistence hook (saves to database)
  const outlinePersistence = useOutlinePersistence({ projectId });
  
  // Script history state
  const [scriptHistory, setScriptHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [deletingScript, setDeletingScript] = useState(false);
  
  // Delete all project data state
  const [deletingAllData, setDeletingAllData] = useState(false);

  // Form state
  const [ideaText, setIdeaText] = useState('');
  const [format, setFormatState] = useState<'film' | 'series'>('series');
  const [episodesCount, setEpisodesCountState] = useState(6);
  const [episodeDurationMin, setEpisodeDurationMinState] = useState(45);
  const [filmDurationMin, setFilmDurationMinState] = useState(100);

  // Handlers that persist config changes to the projects table
  const handleFormatChange = async (newFormat: 'film' | 'series') => {
    setFormatState(newFormat);
    await supabase
      .from('projects')
      .update({ format: newFormat })
      .eq('id', projectId);
  };

  const handleEpisodesCountChange = async (count: number) => {
    setEpisodesCountState(count);
    await supabase
      .from('projects')
      .update({ episodes_count: count })
      .eq('id', projectId);
  };

  const handleEpisodeDurationChange = async (duration: number) => {
    setEpisodeDurationMinState(duration);
    await supabase
      .from('projects')
      .update({ target_duration_min: duration })
      .eq('id', projectId);
  };

  const handleFilmDurationChange = async (duration: number) => {
    setFilmDurationMinState(duration);
    await supabase
      .from('projects')
      .update({ target_duration_min: duration })
      .eq('id', projectId);
  };

  // Aliases for backward compatibility with internal state setters
  const setFormat = setFormatState;
  const setEpisodesCount = setEpisodesCountState;
  const setEpisodeDurationMin = setEpisodeDurationMinState;
  const setFilmDurationMin = setFilmDurationMinState;
  const [genre, setGenre] = useState('drama');
  const [tone, setTone] = useState('Cinematográfico realista');
  const [language, setLanguage] = useState('es-ES');
  const [references, setReferences] = useState('');
  const [complexity, setComplexity] = useState<'simple' | 'medium' | 'high'>('medium');
  
  // MASTER SHOWRUNNER: Narrative mode
  const [narrativeMode, setNarrativeMode] = useState<'serie_adictiva' | 'voz_de_autor' | 'giro_imprevisible'>('serie_adictiva');
  
  // V3.0: Quality tier selection (replaces legacy generationModel)
  const [qualityTier, setQualityTier] = useState<QualityTier>('profesional');
  
  // V4.0 DIRECT GENERATION: Density profile for simplified single-call generation
  const [densityProfile, setDensityProfile] = useState<'indie' | 'standard' | 'hollywood'>('standard');
  
  // V4.0: Use direct generation mode (new architecture)
  const [useDirectGeneration, setUseDirectGeneration] = useState(true);
  
  // V3.0: Disable narrative density (let AI generate based purely on user idea)
  const [disableDensity, setDisableDensity] = useState(true); // Default: OFF (no density constraints)
  
  // Creative mode context
  const creativeModeContext = useCreativeModeOptional();
  const effectiveCreativeMode = creativeModeContext?.effectiveMode ?? 'ASSISTED';

  // Auto/Pro mode
  const [proMode, setProMode] = useState(false);
  const [targets, setTargets] = useState<CalculatedTargets | null>(null);

  // Pipeline V2 state - with localStorage persistence
  const PIPELINE_STORAGE_KEY = `script_pipeline_${projectId}`;
  
  // PRO mode draft persistence (idea + config)
  const DRAFT_STORAGE_KEY = `script_import_draft_${projectId}`;
  
  const loadPipelineState = () => {
    try {
      const stored = localStorage.getItem(PIPELINE_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Check if pipeline is still running (less than 2 hours old)
        // Accept legacy states without projectId field
        if (
          parsed.startedAt && 
          Date.now() - parsed.startedAt < 2 * 60 * 60 * 1000 &&
          (!parsed.projectId || parsed.projectId === projectId)
        ) {
          // Update storage with projectId for future if missing
          if (!parsed.projectId) {
            savePipelineState({ ...parsed, projectId });
          }
          return parsed;
        }
      }
    } catch {}
    return null;
  };

  const savePipelineState = (state: any) => {
    try {
      localStorage.setItem(PIPELINE_STORAGE_KEY, JSON.stringify({
        ...state,
        projectId, // Always include projectId for validation
        startedAt: state.startedAt || Date.now(),
        lastUpdated: Date.now() // Track last update time
      }));
    } catch {}
  };

  const clearPipelineState = () => {
    try {
      localStorage.removeItem(PIPELINE_STORAGE_KEY);
    } catch {}
  };

  const [pipelineRunning, setPipelineRunning] = useState(false);
  const [pipelineProgress, setPipelineProgress] = useState(0);
  const [currentEpisodeGenerating, setCurrentEpisodeGenerating] = useState<number | null>(null);
  const [totalEpisodesToGenerate, setTotalEpisodesToGenerate] = useState(0);
  const [generatedEpisodesList, setGeneratedEpisodesList] = useState<any[]>([]);
  const [cancelController, setCancelController] = useState<AbortController | null>(null);
  const [pipelineSteps, setPipelineSteps] = useState<PipelineStep[]>([
    { id: 'outline', label: 'Generando outline rápido', status: 'pending' },
    { id: 'approval', label: 'Aprobación del outline', status: 'pending' },
    { id: 'episodes', label: 'Generando episodios', status: 'pending' },
    { id: 'dialogues', label: 'Generando diálogos completos', status: 'pending' },
    { id: 'teasers', label: 'Generando teasers', status: 'pending' },
    { id: 'save', label: 'Guardando', status: 'pending' },
  ]);
  const [currentStepLabel, setCurrentStepLabel] = useState<string>('');
  const [backgroundGeneration, setBackgroundGeneration] = useState(false);
  
  // Background task tracking for global progress visibility
  const { addTask, updateTask, completeTask, failTask } = useBackgroundTasks();
  const [scriptTaskId, setScriptTaskId] = useState<string | null>(null);

  // Timing model (aprende tiempos reales para estimar ETA)
  const [timingModel, setTimingModel] = useState(() => loadScriptTimingModel());
  const [episodeStartedAtMs, setEpisodeStartedAtMs] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  
  // Light outline state (Pipeline V2)
  const [lightOutline, setLightOutlineRaw] = useState<any>(null);
  const [outlineApproved, setOutlineApproved] = useState(false);
  const [generatingOutline, setGeneratingOutline] = useState(false);
  
  // V24: Stable outline ref to prevent flicker during operations
  const lastStableOutlineRef = useRef<any>(null);
  
  // V24: PDF export loading state
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  
  // V22: Helper to normalize outline fields for consistent UI rendering
  // This ensures main_characters and main_locations are always populated WITH descriptions
  const normalizeOutline = useCallback((outline: any): any => {
    if (!outline) return null;
    // Use centralized normalizer that handles want/need/flaw -> description
    return normalizeOutlineForDisplay(outline);
  }, []);
  
  // V22: Wrapper for setLightOutline that normalizes the data
  // V24: Also updates the stable ref for flicker prevention
  const setLightOutline = useCallback((outline: any) => {
    const normalized = normalizeOutline(outline);
    setLightOutlineRaw(normalized);
    if (normalized) {
      lastStableOutlineRef.current = normalized;
    }
  }, [normalizeOutline]);
  
  // V24: Get stable outline for UI rendering (prevents flicker to 0 during operations)
  const outlineForUI = useMemo(() => {
    return lightOutline ?? lastStableOutlineRef.current;
  }, [lightOutline]);
  
  // Showrunner upgrade state (Phase 2)
  const [upgradingOutline, setUpgradingOutline] = useState(false);
  
  // Enrichment state (Operational Meat)
  const [enrichingOutline, setEnrichingOutline] = useState(false);
  
  // Outline generation progress tracking (V4.0 - Polling UI)
  const [outlineStartTime, setOutlineStartTime] = useState<number | null>(null);
  const [outlineElapsedSeconds, setOutlineElapsedSeconds] = useState(0);
  
  // Script generation elapsed timer
  const [scriptStartTime, setScriptStartTime] = useState<number | null>(null);
  const [scriptElapsedSeconds, setScriptElapsedSeconds] = useState(0);
  
  // Episode view mode: summary vs full screenplay
  const [episodeViewMode, setEpisodeViewMode] = useState<Record<number, 'summary' | 'full'>>({});

  // Generated data
  const [outline, setOutline] = useState<any>(null);
  const [qcResult, setQcResult] = useState<any>(null);
  const [generatedScript, setGeneratedScript] = useState<any>(null);
  const [generatedTeasers, setGeneratedTeasers] = useState<any>(null);
  const [expandedEpisodes, setExpandedEpisodes] = useState<Record<number, boolean>>({});

  // Script Doctor state
  const [analyzing, setAnalyzing] = useState(false);
  const [doctorSuggestions, setDoctorSuggestions] = useState<any[]>([]);
  const [doctorScore, setDoctorScore] = useState<number | null>(null);
  const [applyingDoctor, setApplyingDoctor] = useState(false);
  const [selectedSuggestions, setSelectedSuggestions] = useState<Set<number>>(new Set());

  // Entity import state
  const [selectedCharacters, setSelectedCharacters] = useState<Set<number>>(new Set());
  const [selectedLocations, setSelectedLocations] = useState<Set<number>>(new Set());
  const [selectedProps, setSelectedProps] = useState<Set<number>>(new Set());
  const [importing, setImporting] = useState(false);
  
  // Scene segmentation state
  const [segmenting, setSegmenting] = useState(false);
  const [segmentedEpisodes, setSegmentedEpisodes] = useState<Set<number>>(new Set());
  
  // Dialogue generation state (PRO mode)
  const [generatingDialogues, setGeneratingDialogues] = useState(false);
  const [dialogueProgress, setDialogueProgress] = useState({ current: 0, total: 0, phase: '' });
  
  // Imported script parsing state
  const [parsingImportedScript, setParsingImportedScript] = useState(false);
  
  // Script sync state (sync dialogues from breakdown to scenes)
  const [syncingFromScript, setSyncingFromScript] = useState(false);
  
  // Professional Breakdown state (two-step analysis)
  const [breakdownPro, setBreakdownPro] = useState<any>(null);
  const [generatingBreakdownPro, setGeneratingBreakdownPro] = useState(false);
  const [breakdownProSteps, setBreakdownProSteps] = useState<string[]>([]);
  const [autoBreakdownPro, setAutoBreakdownPro] = useState(false);
  
  // Dynamic batch configuration
  const [batchConfig, setBatchConfig] = useState<BatchConfig | null>(null);
  
  // V3.0: Project lock state for PROJECT_BUSY (409) errors
  const [projectLockInfo, setProjectLockInfo] = useState<{
    isLocked: boolean;
    lockReason?: string;
    retryAfterSeconds?: number;
    lockedAt?: Date;
  } | null>(null);
  
  // V21: Outline generation error state (anti-blank-screen)
  const [outlineError, setOutlineError] = useState<{
    code: string;
    message: string;
    substage?: string;
    retryable: boolean;
  } | null>(null);
  
  // P1 FIX: Entity materialization state (sync outline to Bible)
  const [materializingEntities, setMaterializingEntities] = useState(false);
  
  // Scene materialization state (sync outline to scenes table)
  const [materializingScenes, setMaterializingScenes] = useState(false);
  const [scenesCount, setScenesCount] = useState(0);
  
  // Bible data from DB (source of truth for UI)
  const [bibleCharacters, setBibleCharacters] = useState<any[]>([]);
  const [bibleLocations, setBibleLocations] = useState<any[]>([]);
  const [bibleLoading, setBibleLoading] = useState(false);

  // Episode regeneration state
  const [showRegenerateDialog, setShowRegenerateDialog] = useState(false);
  const [regenerateEpisodeNo, setRegenerateEpisodeNo] = useState(1);
  const [regenerateEpisodeSynopsis, setRegenerateEpisodeSynopsis] = useState('');
  
  // V11.2: Batch Planner State - GATES + State Accumulation
  const [batchPlans, setBatchPlans] = useState<BatchPlan[]>([]);
  const [generationState, setGenerationState] = useState<GenerationState | null>(null);
  const [densityGateResult, setDensityGateResult] = useState<DensityGateResult | null>(null);
  const [showDensityGateModal, setShowDensityGateModal] = useState(false);
  const [isPatchingOutline, setIsPatchingOutline] = useState(false);
  const [attemptsByBatch, setAttemptsByBatch] = useState<Record<number, number>>({});
  
  // V11: QC Status for visual gating
  const qcStatus = useMemo<QCStatus | null>(() => {
    if (!lightOutline) return null;
    
    // Calculate pipeline stage
    const getPipelineStageLocal = (): 'light' | 'operational' | 'threaded' | 'showrunner' => {
      const quality = outlinePersistence.savedOutline?.quality;
      if (quality === 'showrunner') return 'showrunner';
      
      // V21: For FILM format, use different stage logic
      if (format === 'film') {
        const acts = lightOutline.acts_summary as Record<string, unknown> || {};
        const hasFullActStructure = !!(
          (acts.act_i_goal || acts.inciting_incident_summary) &&
          (acts.midpoint_summary || acts.act_ii_goal) &&
          (acts.climax_summary || acts.act_iii_goal)
        );
        
        // Films with complete 3-act structure are considered 'threaded' (ready for script)
        if (hasFullActStructure) return 'threaded';
        
        // Films with partial structure are 'operational'
        const hasPartialStructure = !!(
          acts.act_i_goal || acts.act_ii_goal || acts.act_iii_goal ||
          acts.inciting_incident_summary || acts.midpoint_summary || acts.climax_summary
        );
        if (hasPartialStructure) return 'operational';
        
        return 'light';
      }
      
      // SERIES: Original logic
      const threads = lightOutline.threads as unknown[];
      const episodes = lightOutline.episode_beats as Array<Record<string, unknown>>;
      
      const hasValidThreads = Array.isArray(threads) && threads.length >= 5 && threads.length <= 8;
      const hasAllThreadUsage = Array.isArray(episodes) && episodes.every((ep: any) => {
        const tu = ep.thread_usage as Record<string, unknown>;
        return tu?.A && typeof tu?.crossover_event === 'string' && (tu.crossover_event as string).length >= 12;
      });
      
      if (hasValidThreads && hasAllThreadUsage) return 'threaded';
      
      // Check operational
      const factions = lightOutline.factions as unknown[];
      const hasFactions = Array.isArray(factions) && factions.length >= 2;
      
      const arc = lightOutline.season_arc as Record<string, unknown> || {};
      const has5Hitos = Boolean(
        arc.inciting_incident && arc.first_turn && arc.midpoint_reversal &&
        arc.all_is_lost && arc.final_choice
      );
      
      const hasSetpieces = Array.isArray(episodes) && episodes.every((ep: any) => {
        const sp = ep?.setpiece;
        return sp?.stakes && sp?.participants?.length > 0;
      });
      
      if (hasFactions && has5Hitos && hasSetpieces) return 'operational';
      
      return 'light';
    };
    
    // Calculate blockers (simplified client-side version)
    // V21: Supports both FILM and SERIES formats with different validation paths
    const calculateBlockers = (): string[] => {
      const blockers: string[] = [];
      
      // FILM FORMAT: Validate 3-act structure instead of episodes
      if (format === 'film') {
        const acts = lightOutline.acts_summary as Record<string, unknown> || {};
        
        // For films, check that we have a valid 3-act structure
        const hasActI = !!(acts.act_i_goal || acts.inciting_incident_summary);
        const hasActII = !!(acts.midpoint_summary || acts.act_ii_goal);
        const hasActIII = !!(acts.climax_summary || acts.act_iii_goal);
        
        if (!hasActI) {
          blockers.push('FILM_STRUCTURE:act_i_missing');
        }
        if (!hasActII) {
          blockers.push('FILM_STRUCTURE:act_ii_missing');
        }
        if (!hasActIII) {
          blockers.push('FILM_STRUCTURE:act_iii_missing');
        }
        
        // Films don't need episode_beats, so return early with film-specific blockers
        return blockers;
      }
      
      // SERIES FORMAT: Original episode-based validation
      const arc = lightOutline.season_arc as Record<string, unknown> || {};
      const episodes = lightOutline.episode_beats as Array<Record<string, unknown>> || [];
      // Use outline's episode_count as source of truth, fallback to UI episodesCount
      const outlineEpisodeCount = lightOutline.episode_count as number | undefined;
      const expectedEps = outlineEpisodeCount || episodesCount;
      
      // CRITICAL: Block if outline has NO episodes or incomplete episode generation
      if (!episodes || episodes.length === 0) {
        blockers.push('OUTLINE_INCOMPLETE:no_episodes_generated');
        return blockers; // Early return - no point checking other things
      }
      
      // Block if episodes generated don't match expected count
      if (episodes.length < expectedEps) {
        blockers.push(`OUTLINE_INCOMPLETE:${episodes.length}/${expectedEps}_episodes`);
        return blockers; // Early return - need to regenerate outline
      }
      
      // Season arc hitos
      if (!arc.inciting_incident) blockers.push('SEASON_ARC:inciting_incident_missing');
      if (!arc.first_turn) blockers.push('SEASON_ARC:first_turn_missing');
      if (!arc.midpoint_reversal) blockers.push('SEASON_ARC:midpoint_reversal_missing');
      if (!arc.all_is_lost) blockers.push('SEASON_ARC:all_is_lost_missing');
      if (!arc.final_choice) blockers.push('SEASON_ARC:final_choice_missing');
      
      // Per-episode checks
      episodes.forEach((ep: any, idx: number) => {
        const epN = ep.episode ?? idx + 1;
        
        // Turning points
        const tps = ep.turning_points;
        if (!Array.isArray(tps) || tps.length < 4) {
          blockers.push(`EP${epN}:turning_points_${Array.isArray(tps) ? tps.length : 0}/4`);
        } else {
          tps.forEach((tp: any, j: number) => {
            if (typeof tp === 'string') {
              blockers.push(`EP${epN}_TP${j + 1}:is_string_must_be_object`);
            }
          });
        }
        
        // Setpiece
        const sp = ep.setpiece;
        if (!sp?.stakes || !sp?.participants?.length) {
          blockers.push(`EP${epN}:setpiece_invalid`);
        }
        
        // Cliffhanger
        if (typeof ep.cliffhanger !== 'string' || ep.cliffhanger.length < 12) {
          blockers.push(`EP${epN}:cliffhanger_missing`);
        }
        
        // Thread usage
        const tu = ep.thread_usage;
        if (!tu?.A || typeof tu?.crossover_event !== 'string' || tu.crossover_event.length < 12) {
          blockers.push(`EP${epN}:thread_usage_invalid`);
        }
      });
      
      return blockers;
    };
    
    // Calculate warnings
    const calculateWarnings = (): string[] => {
      const warnings: string[] = [];
      const threads = lightOutline.threads as unknown[];
      const factions = lightOutline.factions as unknown[];
      
      if (!Array.isArray(threads) || threads.length < 5) {
        warnings.push('threads:needs_5-8');
      }
      if (!Array.isArray(factions) || factions.length < 2) {
        warnings.push('factions:less_than_2');
      }
      
      return warnings;
    };
    
    const pipelineStage = getPipelineStageLocal();
    const blockers = calculateBlockers();
    const warnings = calculateWarnings();
    
    // Calculate score
    let score = 100;
    score -= blockers.length * 5;
    score -= warnings.length * 2;
    score = Math.max(0, Math.min(100, score));
    
    // Can generate episodes only if threaded/showrunner AND no blockers
    const canGenerateEpisodes = (pipelineStage === 'threaded' || pipelineStage === 'showrunner') && blockers.length === 0;
    
    return {
      pipelineStage,
      blockers,
      warnings,
      score,
      canGenerateEpisodes,
    };
  }, [lightOutline, outlinePersistence.savedOutline?.quality, episodesCount, format]);

  // File upload for import tab
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [importMethod, setImportMethod] = useState<'paste' | 'upload'>('paste');
  const [pdfProcessing, setPdfProcessing] = useState(false);
  const [pdfProgress, setPdfProgress] = useState(0);
  const pdfAbortRef = useRef<AbortController | null>(null);

  // Voice recorder for idea input
  const voiceRecorder = useVoiceRecorder({
    onTranscript: (text) => {
      setIdeaText((prev) => prev ? `${prev}\n\n${text}` : text);
    },
    maxDurationMs: 120000, // 2 minutes max
  });

  // Handle file upload for script import
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadedFileName(file.name);

    if (file.name.endsWith('.txt')) {
      // Plain text file
      const text = await file.text();
      setScriptText(text);
      toast.success(`Archivo "${file.name}" cargado`);
    } else if (file.name.endsWith('.pdf')) {
      // PDF file - use AI extraction
      setPdfProcessing(true);
      setPdfProgress(10);

      try {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = reader.result as string;
            resolve(result.split(',')[1]);
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        setPdfProgress(30);

        const controller = new AbortController();
        pdfAbortRef.current = controller;

        // Extended timeouts for large Hollywood scripts (pages ≈ KB/3.5)
        const fileSizeKB = file.size / 1024;
        const estimatedPages = Math.ceil(fileSizeKB / 3.5);
        const timeoutMs = estimatedPages < 60 ? 150000 
          : estimatedPages < 100 ? 240000 
          : estimatedPages < 150 ? 360000 
          : estimatedPages < 200 ? 480000 
          : 600000; // >200 pages: 10 min

        const invokeParse = () =>
          invokeWithTimeout(
            'parse-script',
            { pdfBase64: base64, fileName: file.name, parseMode: 'extract_only', projectId },
            { timeoutMs, signal: controller.signal }
          );

        let { data, error } = await invokeParse();

        // Handle PROJECT_BUSY (409) without crashing the UI
        if (error instanceof InvokeFunctionError) {
          const body = (error.bodyJson ?? {}) as any;
          const code = typeof body?.code === 'string' ? body.code : undefined;
          const retryAfter = typeof body?.retryAfter === 'number' ? body.retryAfter : 30;

          if (error.status === 409 && code === 'PROJECT_BUSY') {
            toast.message('Proyecto ocupado', {
              description: `Reintento en ${retryAfter}s...`,
              duration: Math.min(8000, retryAfter * 1000),
            });

            // Keep UI responsive and retry once automatically
            await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
            if (!controller.signal.aborted) {
              ;({ data, error } = await invokeParse());
            }
          }
        }

        setPdfProgress(80);

        if (error) throw error;

        const result = data as { extractedText?: string; rawText?: string } | null;
        if (result?.extractedText) {
          setScriptText(result.extractedText);
          toast.success('PDF extraído correctamente');
        } else if (result?.rawText) {
          setScriptText(result.rawText);
          toast.success('Texto extraído del PDF');
        } else {
          throw new Error('No se pudo extraer texto del PDF');
        }

        setPdfProgress(100);
      } catch (err: any) {
        console.error('PDF processing error:', err);

        const status = err instanceof InvokeFunctionError ? err.status : undefined;
        const bodyJson = err instanceof InvokeFunctionError ? err.bodyJson : undefined;
        const errorMsg = err?.message || 'Error procesando PDF';

        // Log useful diagnostics for 401/409
        if (status) {
          console.warn('[parse-script][client] error', { status, bodyJson, message: errorMsg });
        }

        // Handle PROJECT_BUSY explicitly
        if (err instanceof InvokeFunctionError && err.status === 409 && (err.bodyJson as any)?.code === 'PROJECT_BUSY') {
          const retryAfter = typeof (err.bodyJson as any)?.retryAfter === 'number' ? (err.bodyJson as any).retryAfter : 30;
          toast.warning('Proyecto ocupado', {
            description: `Reintenta en ${retryAfter}s`,
            duration: 8000,
          });
          return;
        }

        // Handle JWT/session errors with clear guidance (no blank screen)
        if (
          status === 401 ||
          errorMsg.includes('401') ||
          errorMsg.toLowerCase().includes('missing auth.uid') ||
          errorMsg.includes('JWT') ||
          errorMsg.includes('Unauthorized') ||
          errorMsg.includes('Sesión')
        ) {
          toast.error('Tu sesión ha expirado. Inicia sesión de nuevo.', {
            duration: 8000,
            action: {
              label: 'Ir a login',
              onClick: () => (window.location.href = '/auth'),
            },
          });
        } else {
          toast.error(errorMsg);
        }
      } finally {
        setPdfProcessing(false);
        pdfAbortRef.current = null;
      }
    } else {
      toast.error('Formato no soportado. Usa .txt o .pdf');
    }

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const cancelPdfProcessing = () => {
    pdfAbortRef.current?.abort();
    setPdfProcessing(false);
    setUploadedFileName(null);
    toast.info('Procesamiento cancelado');
  };

  // Restore pipeline state on mount and poll for updates
  useEffect(() => {
    const storedState = loadPipelineState();
    
    // V9.0: Detect and clear stale pipeline states (>30 min old)
    const MAX_STALE_AGE_MS = 30 * 60 * 1000; // 30 minutes
    if (storedState && storedState.startedAt) {
      const stateAgeMs = Date.now() - storedState.startedAt;
      if (stateAgeMs > MAX_STALE_AGE_MS) {
        console.warn('[ScriptImport] Stale pipeline state detected (>30min), clearing');
        clearPipelineState();
        return; // Don't restore stale state
      }
    }
    
    // CRITICAL: Verify the stored state is valid
    // Accept legacy states without projectId field for backward compatibility
    if (storedState && storedState.pipelineRunning && (!storedState.projectId || storedState.projectId === projectId)) {
      const totalEps = storedState.totalEpisodes || episodesCount;
      const storedEpisodes = (storedState.episodes as any[]) || [];
      const episodesDone = storedEpisodes.length;
      const isStillRunning = episodesDone < totalEps;
      const safeCurrentEpisode = Math.min(storedState.currentEpisode || 1, totalEps);

      setBackgroundGeneration(isStillRunning);
      setPipelineRunning(isStillRunning);
      setPipelineProgress(storedState.progress || 0);
      setCurrentEpisodeGenerating(isStillRunning ? safeCurrentEpisode : null);
      setTotalEpisodesToGenerate(totalEps);
      setGeneratedEpisodesList(storedEpisodes);
      setLightOutline(storedState.outline || null);
      setOutlineApproved(true);

      setPipelineSteps(prev => prev.map(s =>
        s.id === 'outline' || s.id === 'approval' ? { ...s, status: 'success' } :
        s.id === 'episodes'
          ? isStillRunning
            ? { ...s, status: 'running', label: `Generando episodio ${safeCurrentEpisode} de ${totalEps}...` }
            : { ...s, status: 'success', label: 'Episodios generados' }
          : s
      ));

      // If we detect a stale state (e.g. currentEpisode > totalEpisodes), persist a corrected snapshot
      if (!isStillRunning) {
        savePipelineState({
          ...storedState,
          pipelineRunning: false,
          currentEpisode: totalEps,
          totalEpisodes: totalEps,
          episodes: storedEpisodes,
        });
      }

      toast.info('Generación en segundo plano detectada. Recargando estado...');
    } else {
      // Clear orphaned state from different project
      if (storedState && storedState.projectId !== projectId) {
        clearPipelineState();
      }
      
      // No pipeline running - first check for database-persisted outline
      if (outlinePersistence.savedOutline && !outlinePersistence.isLoading && !lightOutline) {
        const dbOutline = outlinePersistence.savedOutline;
        
        // V8.0: Handle incomplete/draft outlines - sync generatingOutline state with DB
        if (dbOutline.status === 'generating' || (dbOutline.status === 'draft' && dbOutline.stage && dbOutline.stage !== 'none')) {
          // Outline is in progress - sync UI state and start polling
          setGeneratingOutline(true);
          setOutlineStartTime(Date.now());
          outlinePersistence.startPolling(dbOutline.id, {
            onComplete: () => {
              setGeneratingOutline(false);
              outlinePersistence.refreshOutline();
              toast.success('Outline generado correctamente');
            },
            onError: (err) => {
              setGeneratingOutline(false);
              // V23: Detect CHUNK_READY_NEXT as "continue" state
              const isReadyNext = err.includes('CHUNK_READY_NEXT');
              if (isReadyNext) {
                setOutlineError({
                  code: 'CHUNK_READY_NEXT',
                  message: err,
                  substage: dbOutline.substage || undefined,
                  retryable: true
                });
              } else if (err.includes('CHUNK') || err.includes('TIMEOUT') || err.includes('AI_') || err.includes('stalled')) {
                setOutlineError({
                  code: 'GENERATION_ERROR',
                  message: err,
                  substage: dbOutline.substage || undefined,
                  retryable: true
                });
              } else {
                toast.error('Error: ' + err);
              }
            }
          });
          return; // Don't continue - wait for completion
        }
        
        // V8.0: Draft with stage=none means never started or failed to start - show recovery card
        if (dbOutline.status === 'draft' && (!dbOutline.stage || dbOutline.stage === 'none')) {
          // Restore ONLY narrative fields - NOT config (format, episodes, duration) which comes from projects table
          if (dbOutline.idea) setIdeaText(dbOutline.idea);
          if (dbOutline.genre) setGenre(dbOutline.genre);
          if (dbOutline.tone) setTone(dbOutline.tone);
          // Don't set lightOutline - let recovery card show
          return;
        }
        
        // Normal case: completed or approved outline
        // Restore ONLY narrative fields - config comes from projects table (already loaded)
        setLightOutline(dbOutline.outline_json);
        if (dbOutline.idea) setIdeaText(dbOutline.idea);
        if (dbOutline.genre) setGenre(dbOutline.genre);
        if (dbOutline.tone) setTone(dbOutline.tone);
        
        if (dbOutline.status === 'approved') {
          setOutlineApproved(true);
          updatePipelineStep('outline', 'success');
          updatePipelineStep('approval', 'success');
          toast.info('Outline aprobado recuperado de la base de datos.');
        } else if (dbOutline.status === 'completed') {
          updatePipelineStep('outline', 'success');
          updatePipelineStep('approval', 'running', 'Esperando aprobación...');
          toast.info('Outline recuperado de la base de datos. Revísalo y apruébalo.');
        }
      } else {
        // Fallback: check localStorage for saved outline draft (pre-approval state)
        const outlineDraft = loadDraft<any>('outline', projectId);
        if (outlineDraft?.data && !lightOutline) {
          setLightOutline(outlineDraft.data.outline || outlineDraft.data);
          // Also restore idea if saved with outline
          if (outlineDraft.data.idea) {
            setIdeaText(outlineDraft.data.idea);
          }
          updatePipelineStep('outline', 'success');
          updatePipelineStep('approval', 'running', 'Esperando aprobación...');
          toast.info('Outline recuperado. Revísalo y apruébalo.');
        }
      }
      
      // Restore form draft - ONLY narrative/creative fields, NOT config (format, episodes, duration)
      // Config comes from projects table which is the source of truth
      try {
        const savedDraft = localStorage.getItem(DRAFT_STORAGE_KEY);
        if (savedDraft) {
          const draft = JSON.parse(savedDraft);
          if (draft.ideaText && !ideaText) setIdeaText(draft.ideaText);
          // Restore creative/narrative fields only
          if (draft.genre) setGenre(draft.genre);
          if (draft.tone) setTone(draft.tone);
          if (draft.references) setReferences(draft.references);
          if (draft.narrativeMode) setNarrativeMode(draft.narrativeMode);
          if (draft.qualityTier) setQualityTier(migrateQualityTier(draft.qualityTier));
          if (draft.complexity) setComplexity(draft.complexity);
          if (typeof draft.disableDensity === 'boolean') setDisableDensity(draft.disableDensity);
          // DO NOT restore: format, episodesCount, episodeDurationMin, filmDurationMin
          // These come from the projects table (lines 1031-1039)
        }
      } catch (e) {
        console.warn('[ScriptImport] Error loading draft:', e);
      }
    }
  }, [projectId, episodesCount, outlinePersistence.savedOutline, outlinePersistence.isLoading]);

  // V10.3: Sync generatingOutline state with DB status (for progress bar visibility)
  useEffect(() => {
    const status = outlinePersistence.savedOutline?.status;
    if (status === 'generating' || status === 'queued') {
      if (!generatingOutline) {
        setGeneratingOutline(true);
        if (!outlineStartTime) setOutlineStartTime(Date.now());
      }
    } else if (status === 'completed' || status === 'approved' || status === 'error' || status === 'failed' || status === 'stalled' || status === 'timeout') {
      if (generatingOutline) {
        setGeneratingOutline(false);
      }
    }
  }, [outlinePersistence.savedOutline?.status]);

  // V6: Robust sync of outline_json to lightOutline for ANY status with valid content
  // This ensures outline visibility even in inconsistent states (e.g., approved but incomplete)
  useEffect(() => {
    const saved = outlinePersistence.savedOutline;
    if (!saved || outlinePersistence.isLoading) return;
    
    const status = saved.status;
    const hasValidContent = saved.outline_json && Object.keys(saved.outline_json).length > 0 && (saved.outline_json as any).title;
    
    // If we have valid content but lightOutline is empty, sync it regardless of status
    // This catches: stalled, timeout, approved (with error), failed with partial data, etc.
    if (hasValidContent && !lightOutline) {
      console.log('[ScriptImport] V6: Syncing outline from persistence, status:', status);
      setLightOutline(saved.outline_json);
      if (saved.idea) setIdeaText(saved.idea);
      if (saved.genre) setGenre(saved.genre);
      if (saved.tone) setTone(saved.tone);
      
      // V6: Also sync outlineApproved state based on persisted status
      if (status === 'approved') {
        setOutlineApproved(true);
        updatePipelineStep('outline', 'success');
        updatePipelineStep('approval', 'success');
      } else if (status === 'completed') {
        updatePipelineStep('outline', 'success');
        updatePipelineStep('approval', 'running', 'Esperando aprobación...');
      }
    }
    
    // V6: Keep outlineApproved in sync with persistence status
    if (status === 'approved' && !outlineApproved && hasValidContent) {
      console.log('[ScriptImport] V6: Syncing outlineApproved=true from persistence');
      setOutlineApproved(true);
    }
  }, [outlinePersistence.savedOutline, outlinePersistence.isLoading, lightOutline, outlineApproved]);

  // V11: Zombie outline detection - check if heartbeat is stale
  const isZombieOutline = useMemo(() => {
    const saved = outlinePersistence.savedOutline;
    if (!saved) return false;
    
    // Only check for zombie if status is generating/queued
    if (saved.status !== 'generating' && saved.status !== 'queued') return false;
    
    const heartbeat = saved.heartbeat_at;
    if (!heartbeat) return true; // No heartbeat = zombie
    
    const heartbeatAge = Date.now() - new Date(heartbeat).getTime();
    const ZOMBIE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
    
    return heartbeatAge > ZOMBIE_THRESHOLD_MS;
  }, [outlinePersistence.savedOutline]);
  
  // V11: Reset zombie outline to allow retry
  // V11.1: Recoverable error codes that allow retry
  const RECOVERABLE_ERROR_CODES = ['AI_TIMEOUT', 'ZOMBIE_TIMEOUT', 'STAGE_TIMEOUT', 'RATE_LIMIT', 'WORKER_TIMEOUT', 'QUEUE_TIMEOUT'];

  // V11.1: Helper to detect resumable outline parts
  const getResumableInfo = (outline: any) => {
    if (!outline) return { canResume: false, fromStep: null, label: null };
    
    const parts = outline.outline_parts || {};
    const hasSummary = !!outline.summary_text;
    const hasArc = !!parts.arc || !!parts.part_a;
    const hasEpisodes1 = !!parts.episodes_1 || !!parts.part_b;
    const hasEpisodes2 = !!parts.episodes_2 || !!parts.part_c;
    
    if (hasEpisodes1 && !hasEpisodes2) {
      return { canResume: true, fromStep: 'episodes_2', label: 'Reanudar desde Episodios 6-10' };
    }
    if (hasArc && !hasEpisodes1) {
      return { canResume: true, fromStep: 'episodes_1', label: 'Reanudar desde Episodios 1-5' };
    }
    if (hasSummary && !hasArc) {
      return { canResume: true, fromStep: 'arc', label: 'Reanudar desde Arc' };
    }
    return { canResume: false, fromStep: null, label: null };
  };

  const handleResetZombieOutline = async () => {
    const saved = outlinePersistence.savedOutline;
    if (!saved) return;
    
    try {
      // V11.1: Use 'error' status but do NOT overwrite stage - preserve for resume
      const { error } = await supabase
        .from('project_outlines')
        .update({ 
          status: 'error', 
          // stage: preserved - do NOT overwrite with 'done'
          quality: 'error',
          error_code: 'WORKER_TIMEOUT',
          error_detail: 'Marcado como fallido por el usuario',
          completed_at: new Date().toISOString()
        })
        .eq('id', saved.id);
      
      if (error) throw error;
      
      toast.info('Outline marcado como fallido. Puedes reintentar la generación.');
      outlinePersistence.refreshOutline();
    } catch (err: any) {
      console.error('[ScriptImport] Error resetting zombie outline:', err);
      toast.error('Error al resetear el outline');
    }
  };

  // V11.1: Resume generation from specific substep
  const handleResumeGeneration = async (fromStep: string) => {
    const saved = outlinePersistence.savedOutline;
    if (!saved) return;
    
    try {
      // Reset status to generating but keep outline_parts
      await supabase
        .from('project_outlines')
        .update({
          status: 'generating',
          substage: fromStep,
          error_code: null,
          error_detail: null,
          heartbeat_at: new Date().toISOString()
        })
        .eq('id', saved.id);
      
      // Invoke worker with resume flag
      const { error } = await supabase.functions.invoke('outline-worker', {
        body: { 
          outline_id: saved.id,
          resume_from: fromStep  // Worker will use existing outline_parts
        }
      });
      
      if (error) throw error;
      
      toast.success(`Reanudando generación desde ${fromStep}...`);
      outlinePersistence.startPolling(saved.id);
      setGeneratingOutline(true);
    } catch (err: any) {
      console.error('[ScriptImport] Resume failed:', err);
      toast.error('Error al reanudar. Intenta reiniciar.');
    }
  };

  // V10.3+: Fallback to load outline from persistence when completed/approved but lightOutline is empty
  // This ensures that if the user refreshes or the polling callback misses setting state, we still recover
  useEffect(() => {
    const outline = outlinePersistence.savedOutline;
    const status = outline?.status;
    const isTerminalSuccess = status === 'completed' || status === 'approved';
    const hasValidContent = outline?.outline_json && Object.keys(outline.outline_json).length > 0;
    
    if (isTerminalSuccess && hasValidContent && !lightOutline) {
      console.log('[ScriptImport] Recovering outline from persistence:', outline.id, 'status:', status);
      setLightOutline(outline.outline_json);
      
      // Restore idea/genre/tone from persisted outline if available
      if (outline.idea && !ideaText) setIdeaText(outline.idea);
      if (outline.genre) setGenre(outline.genre);
      if (outline.tone) setTone(outline.tone);
      
      if (status === 'approved') {
        setOutlineApproved(true);
        updatePipelineStep('outline', 'success');
        updatePipelineStep('approval', 'success');
      } else {
        updatePipelineStep('outline', 'success');
        updatePipelineStep('approval', 'running', 'Esperando aprobación...');
      }
      
      // Only show toast if not loading (to avoid showing on initial load)
      if (!outlinePersistence.isLoading) {
        toast.success('Outline recuperado desde el servidor');
      }
    }
  }, [outlinePersistence.savedOutline, outlinePersistence.isLoading, lightOutline, ideaText]);
  
  // V4.1: Auto-initialize ideaText from failed/stalled outline for recovery UI
  // This ensures the "Generar nuevo" button is enabled even on fresh page load
  useEffect(() => {
    const outline = outlinePersistence.savedOutline;
    const status = outline?.status;
    const isFailed = status === 'failed' || status === 'stalled';
    
    if (isFailed && outline?.idea && !ideaText.trim()) {
      console.log('[ScriptImport] V4.1: Initializing ideaText from failed outline');
      setIdeaText(outline.idea);
      if (outline.genre) setGenre(outline.genre);
      if (outline.tone) setTone(outline.tone);
    }
  }, [outlinePersistence.savedOutline?.id, outlinePersistence.savedOutline?.status]);

  // Auto-save form draft for PRO mode (debounced)
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      try {
        const draft = {
          ideaText,
          format,
          genre,
          tone,
          references,
          narrativeMode,
          qualityTier,
          episodesCount,
          episodeDurationMin,
          filmDurationMin,
          complexity,
          disableDensity,
        };
        localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
      } catch (e) {
        console.warn('[ScriptImport] Error saving draft:', e);
      }
    }, 1000); // 1s debounce
    
    return () => clearTimeout(timeoutId);
  }, [ideaText, format, genre, tone, references, narrativeMode, qualityTier, episodesCount, episodeDurationMin, filmDurationMin, complexity, disableDensity, DRAFT_STORAGE_KEY]);

  // Poll for script updates when background generation is active
  useEffect(() => {
    if (!backgroundGeneration) return;
    
    const pollInterval = setInterval(async () => {
      const { data: scriptData } = await supabase
        .from('scripts')
        .select('parsed_json, created_at')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      
      if (scriptData?.parsed_json) {
        const parsed = scriptData.parsed_json as Record<string, unknown>;
        const episodes = (parsed.episodes as any[]) || [];
        
        if (episodes.length > 0) {
          const storedState = loadPipelineState();
          const previousCount = storedState?.episodes?.length || 0;
          
          if (episodes.length > previousCount) {
            // New episodes detected!
            setGeneratedEpisodesList(episodes);
            setGeneratedScript(parsed);
            
            // Use batch-based progress if available, otherwise fallback to episode-based
            const totalEps = storedState?.totalEpisodes || episodesCount;
            let progress: number;
            if (storedState?.completedBatches && storedState?.totalBatches) {
              progress = 10 + Math.round((storedState.completedBatches / storedState.totalBatches) * 75);
            } else {
              progress = 10 + Math.round((episodes.length / totalEps) * 75);
            }
            setPipelineProgress(progress);
            
            // Only set currentEpisodeGenerating if there are more episodes to generate
            if (episodes.length < totalEps) {
              setCurrentEpisodeGenerating(episodes.length + 1);
            } else {
              // All episodes done, clear the counter
              setCurrentEpisodeGenerating(null);
            }
            
            toast.success(`Episodio ${episodes.length} generado en segundo plano`);
            
            // Update stored state - cap currentEpisode to totalEpisodes
            savePipelineState({
              ...storedState,
              episodes,
              progress,
              currentEpisode: Math.min(episodes.length + 1, totalEps)
            });
          }
          
          // Check if complete
          if (episodes.length >= (storedState?.totalEpisodes || episodesCount)) {
            setBackgroundGeneration(false);
            setPipelineRunning(false);
            setPipelineProgress(100);
            clearPipelineState();
            setPipelineSteps(prev => prev.map(s => ({ ...s, status: 'success' })));
            toast.success('¡Generación en segundo plano completada!');
          }
        }
      }
    }, 5000); // Poll every 5 seconds
    
    return () => clearInterval(pollInterval);
  }, [backgroundGeneration, projectId, episodesCount]);

  // Load existing script
  useEffect(() => {
    const fetchData = async () => {
      const [projectRes, scriptsRes] = await Promise.all([
        supabase.from('projects').select('episodes_count, format, target_duration_min').eq('id', projectId).single(),
        supabase.from('scripts').select('id, status, raw_text, parsed_json').eq('project_id', projectId).order('created_at', { ascending: false }).limit(1)
      ]);
      
      if (projectRes.data) {
        setEpisodesCount(projectRes.data.episodes_count || 6);
        setFormat(projectRes.data.format === 'film' ? 'film' : 'series');
        // Sync duration from project settings
        const projectDuration = projectRes.data.target_duration_min;
        if (projectDuration) {
          setEpisodeDurationMin(projectDuration);
          setFilmDurationMin(projectDuration);
        }
      }
      
      if (scriptsRes.data && scriptsRes.data.length > 0) {
        const script = scriptsRes.data[0];
        setCurrentScriptId(script.id);
        setScriptLocked(script.status === 'locked');
        if (script.raw_text) setScriptText(script.raw_text);
        if (script.parsed_json && typeof script.parsed_json === 'object') {
          const parsed = script.parsed_json as Record<string, unknown>;
          if (parsed.episodes || parsed.screenplay || parsed.title || parsed.characters) {
            // Use shared hydration helpers for v10+ nested structure support
            const payload = getBreakdownPayload(parsed) ?? parsed;
            const chars = hydrateCharacters(payload);
            const locs = hydrateLocations(payload);
            const propsArr = hydrateProps(payload);
            const scenes = hydrateScenes(payload);
            const episodesArr = Array.isArray(payload?.episodes) ? payload.episodes : [];
            
            // Use shared robust counts builder
            const counts = buildRobustCounts(payload, chars, locs, scenes, propsArr, episodesArr);

            const hydratedScriptData = {
              ...parsed,
              // Keep original payload for downstream consumers (e.g., Casting Report enrichment)
              breakdown: payload,
              title: extractTitle(payload),
              writers: extractWriters(payload),
              main_characters: chars,
              characters: chars,
              locations: locs,
              scenes: scenes,
              props: propsArr,
              counts,
            };

            setGeneratedScript(hydratedScriptData);

            // Rehydrate Pro breakdown (if it exists in DB)
            const storedBreakdownPro = (parsed as any).breakdown_pro;
            if (storedBreakdownPro && typeof storedBreakdownPro === 'object') {
              setBreakdownPro(storedBreakdownPro);
            }

            // Load teasers from parsed_json if they exist
            if (parsed.teasers) {
              setGeneratedTeasers(parsed.teasers);
            }
            setActiveTab('summary');
          }
        }
      }
    };
    fetchData();
  }, [projectId]);

  // Calculate targets when inputs change
  useEffect(() => {
    if (!proMode) {
      const inputs: TargetInputs = {
        format,
        duration: filmDurationMin,
        episodesCount,
        episodeDurationMin,
        complexity,
        genre
      };
      setTargets(calculateAutoTargets(inputs));
    }
  }, [format, filmDurationMin, episodesCount, episodeDurationMin, complexity, genre, proMode]);

  // Tick para ETA mientras se generan episodios
  useEffect(() => {
    if (!pipelineRunning) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [pipelineRunning]);

  // Tick for outline generation elapsed time
  useEffect(() => {
    if (!generatingOutline || !outlineStartTime) {
      setOutlineElapsedSeconds(0);
      return;
    }
    const interval = setInterval(() => {
      setOutlineElapsedSeconds(Math.floor((Date.now() - outlineStartTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [generatingOutline, outlineStartTime]);

  // Script generation elapsed timer (V47: Full-screen overlay support)
  useEffect(() => {
    if (!pipelineRunning || !scriptStartTime) {
      if (!pipelineRunning) setScriptElapsedSeconds(0);
      return;
    }
    const interval = setInterval(() => {
      setScriptElapsedSeconds(Math.floor((Date.now() - scriptStartTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [pipelineRunning, scriptStartTime]);

  const updatePipelineStep = (stepId: string, status: PipelineStep['status'], label?: string) => {
    setPipelineSteps(prev => prev.map(s => s.id === stepId ? { ...s, status, label: label || s.label } : s));
    if (label) setCurrentStepLabel(label);
  };

  // Analyze imported script (PRO mode) - extracts characters, locations, scenes
  const analyzeImportedScript = async () => {
    if (!scriptText.trim() || scriptText.length < 200) {
      toast.error('El guion debe tener al menos 200 caracteres');
      return;
    }

    setParsingImportedScript(true);
    toast.info('Analizando guion importado...');

    try {
      // 1. Save or update script in DB
      const { data: existingScript } = await supabase
        .from('scripts')
        .select('id')
        .eq('project_id', projectId)
        .limit(1)
        .maybeSingle();

      let savedScript;
      if (existingScript) {
        const { data, error } = await supabase
          .from('scripts')
          .update({
            raw_text: scriptText.trim(),
            status: 'draft',
          })
          .eq('id', existingScript.id)
          .select()
          .single();
        if (error) throw error;
        savedScript = data;
      } else {
        const { data, error } = await supabase
          .from('scripts')
          .insert({
            project_id: projectId,
            raw_text: scriptText.trim(),
            status: 'draft',
          })
          .select()
          .single();
        if (error) throw error;
        savedScript = data;
      }

      if (!savedScript) throw new Error('No se pudo guardar el guion');

      // 2. Call script-breakdown to analyze
      // NOTE: script-breakdown runs as a background task and returns { taskId, polling: true }
      const invokeBreakdown = () =>
        invokeWithTimeout<any>(
          'script-breakdown',
          {
            projectId,
            scriptText: scriptText.trim(),
            scriptId: savedScript.id,
            language,
            format,
            episodesCount: format === 'series' ? episodesCount : 1,
            episodeDurationMin,
          },
          { timeoutMs: 240000 }
        );

      let { data: breakdownData, error: breakdownError } = await invokeBreakdown();

      // Handle PROJECT_BUSY (409) without crashing the UI; retry once.
      if (breakdownError instanceof InvokeFunctionError) {
        const body = (breakdownError.bodyJson ?? {}) as any;
        const code = typeof body?.code === 'string' ? body.code : undefined;
        const retryAfter = typeof body?.retryAfter === 'number' ? body.retryAfter : 30;

        console.warn('[ScriptImport] script-breakdown failed', {
          status: breakdownError.status,
          code,
          retryAfter,
          message: breakdownError.message,
          body,
        });

        if (breakdownError.status === 409 && code === 'PROJECT_BUSY') {
          toast.message('Proyecto ocupado', {
            description: `Reintento en ${retryAfter}s...`,
            duration: Math.min(8000, retryAfter * 1000),
          });

          await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
          ;({ data: breakdownData, error: breakdownError } = await invokeBreakdown());
        }
      }

      if (breakdownError) {
        if (breakdownError instanceof InvokeFunctionError) {
          const message = String(breakdownError.message || '').toLowerCase();

          if (breakdownError.status === 401 || message.includes('missing auth.uid')) {
            console.warn('[ScriptImport] Unauthorized while analyzing imported script', {
              status: breakdownError.status,
              message: breakdownError.message,
              body: breakdownError.bodyJson,
            });
            toast.error('Sesión expirada. Vuelve a iniciar sesión.', {
              duration: 8000,
              action: {
                label: 'Ir a login',
                onClick: () => navigate('/auth'),
              },
            });
            return;
          }

          toast.error(breakdownError.message || 'Error al analizar el guion');
          return;
        }

        throw breakdownError;
      }

      // 3. script-breakdown is async (background task). Poll the task and then load parsed_json.
      const taskId = (breakdownData as any)?.taskId as string | undefined;
      const isPolling = Boolean(taskId) && Boolean((breakdownData as any)?.polling);

      if (isPolling && taskId) {
        const estimatedTimeMin =
          typeof (breakdownData as any)?.estimatedTimeMin === 'number'
            ? (breakdownData as any).estimatedTimeMin
            : 10;

        toast.message('Análisis iniciado', {
          description: `Se está procesando en segundo plano (~${estimatedTimeMin} min).`,
          duration: 6000,
        });

        const pollingInterval = 3000;
        const maxPollingTime = Math.max(5 * 60 * 1000, estimatedTimeMin * 60 * 1000 * 2);
        const startTime = Date.now();

        let completed = false;
        while (!completed && Date.now() - startTime < maxPollingTime) {
          await new Promise((resolve) => setTimeout(resolve, pollingInterval));

          const { data: taskData, error: taskError } = await supabase
            .from('background_tasks')
            .select('status, progress, error, description')
            .eq('id', taskId)
            .maybeSingle();

          if (taskError) {
            console.warn('[ScriptImport] Error polling script analysis task:', taskError);
            continue;
          }

          const status = taskData?.status;
          const progress = typeof taskData?.progress === 'number' ? taskData.progress : null;
          const description = typeof taskData?.description === 'string' ? taskData.description : '';

          if (typeof progress === 'number') {
            // Reuse existing state just to show users "something is happening"
            setPdfProgress(Math.min(99, Math.max(10, progress)));
          }
          if (description) {
            setBreakdownProSteps((prev) => {
              const next = prev.length ? [...prev] : [];
              if (!next.includes(description)) next.push(description);
              return next.slice(-6);
            });
          }

          if (status === 'completed') {
            completed = true;
            break;
          }

          if (status === 'failed') {
            throw new Error(taskData?.error || 'El análisis falló');
          }
        }

        if (!completed) {
          throw new Error('El análisis sigue en proceso. Espera un poco y revisa el resumen de nuevo.');
        }

        // Load the final parsed_json written by the backend
        const { data: scriptRow, error: scriptErr } = await supabase
          .from('scripts')
          .select('id, status, raw_text, parsed_json')
          .eq('id', savedScript.id)
          .maybeSingle();

        if (scriptErr) throw scriptErr;

        const parsed = scriptRow?.parsed_json as Record<string, unknown> | null | undefined;
        if (!parsed || typeof parsed !== 'object' || Object.keys(parsed).length === 0) {
          throw new Error('El análisis terminó pero no se encontró el resultado guardado.');
        }

        // Use shared hydration helpers for v10+ nested structure support
        const payload = getBreakdownPayload(parsed) ?? parsed;
        const chars = hydrateCharacters(payload);
        const locs = hydrateLocations(payload);
        const propsArr = hydrateProps(payload);
        const scenes = hydrateScenes(payload);
        const episodesArr = Array.isArray((payload as any)?.episodes) ? (payload as any).episodes : [];

        // Use shared robust counts builder
        const counts = buildRobustCounts(payload, chars, locs, scenes, propsArr, episodesArr);

        const hydratedScriptData = {
          ...parsed,
          title: extractTitle(payload),
          writers: extractWriters(payload),
          main_characters: chars,
          characters: chars,
          locations: locs,
          scenes: scenes,
          props: propsArr,
          counts,
          parsedJson: parsed, // Keep raw parsed JSON for extended export
        };

        setGeneratedScript(hydratedScriptData);
        setCurrentScriptId(savedScript.id);
        setActiveTab('summary');

        toast.success('¡Guion analizado! Ve a la pestaña "Resumen" para ver el resultado.');

        // Auto-trigger pro breakdown if checkbox is enabled
        if (autoBreakdownPro && scriptText.trim().length >= 200) {
          setTimeout(() => {
            generateBreakdownPro();
          }, 500);
        }

        return;
      }

      // 3B. Legacy synchronous response (fallback)
      const breakdown = (breakdownData as any)?.breakdown || breakdownData;

      // Extract characters from multiple possible sources
      const chars = (breakdown as any)?.characters || [];
      const locs = (breakdown as any)?.locations || [];
      const propsArr = (breakdown as any)?.props || [];
      const scenes = (breakdown as any)?.scenes || [];

      // Count scenes from episodes if no root-level scenes
      const episodesArr = (breakdown as any)?.episodes ||
        (scenes.length > 0
          ? [
              {
                episode_number: 1,
                title: (breakdown as any)?.title || 'Película',
                synopsis: (breakdown as any)?.synopsis,
                scenes: scenes,
              },
            ]
          : []);

      const totalScenes =
        scenes.length || episodesArr.reduce((sum: number, ep: any) => sum + (ep.scenes?.length || 0), 0) || 0;

      // Count by role
      const protagonists = chars.filter((c: any) => c.role === 'protagonist' || c.priority === 'P0').length;
      const supporting = chars.filter((c: any) => c.role === 'supporting' || c.priority === 'P1').length;
      const heroProps = propsArr.filter((p: any) => p.importance === 'hero' || p.priority === 'P0').length;

      const scriptData = {
        title: (breakdown as any)?.title || 'Guion Importado',
        logline: (breakdown as any)?.logline || (breakdown as any)?.synopsis?.slice(0, 150) || '',
        synopsis: (breakdown as any)?.synopsis || '',
        genre: (breakdown as any)?.genre || genre,
        tone: (breakdown as any)?.tone || tone,
        themes: (breakdown as any)?.themes || [],
        main_characters: chars,
        characters: chars, // Keep both fields for compatibility
        locations: locs,
        props: propsArr,
        subplots: (breakdown as any)?.subplots || [],
        plot_twists: (breakdown as any)?.plot_twists || (breakdown as any)?.plotTwists || [],
        episodes: episodesArr,
        counts: {
          protagonists,
          supporting,
          characters_total: chars.length,
          locations: locs.length,
          total_scenes: totalScenes,
          hero_props: heroProps,
          props: propsArr.length,
        },
      };

      // 4. Update parsed_json in DB ONLY for legacy sync results
      await supabase.from('scripts').update({ parsed_json: scriptData }).eq('id', savedScript.id);

      // 5. Set local state
      setGeneratedScript(scriptData);
      setCurrentScriptId(savedScript.id);
      setActiveTab('summary');

      toast.success('¡Guion analizado! Ve a la pestaña "Resumen" para ver el resultado.');

      // 6. Auto-trigger pro breakdown if checkbox is enabled
      if (autoBreakdownPro && scriptText.trim().length >= 200) {
        // Use setTimeout to allow state to settle before triggering
        setTimeout(() => {
          generateBreakdownPro();
        }, 500);
      }
    } catch (err: any) {
      console.error('Error analyzing imported script:', err);
      toast.error(err.message || 'Error al analizar el guion');
    } finally {
      setParsingImportedScript(false);
    }
  };

  // Professional Breakdown: Two-step analysis with detailed production data
  const generateBreakdownPro = async () => {
    if (!scriptText.trim() || scriptText.length < 200) {
      toast.error('El guion debe tener al menos 200 caracteres');
      return;
    }

    setGeneratingBreakdownPro(true);
    setBreakdownProSteps(['Detectando formato de guion']);
    
    try {
      // Simulate progress steps for UX
      const progressInterval = setInterval(() => {
        setBreakdownProSteps(prev => {
          if (prev.length >= 5) return prev;
          const steps = [
            'Detectando formato de guion',
            'Contando escenas (INT./EXT.)',
            'Extrayendo personajes',
            'Identificando setpieces',
            'Evaluando complejidad de producción',
          ];
          return steps.slice(0, Math.min(prev.length + 1, 5));
        });
      }, 2000);

      const { data, error } = await invokeWithTimeout<any>(
        'script-breakdown-pro',
        {
          projectId,
          scriptText: scriptText.trim(),
          scriptId: currentScriptId,
          language,
        },
        { timeoutMs: 180000 }
      );

      clearInterval(progressInterval);
      setBreakdownProSteps([
        'Detectando formato de guion',
        'Contando escenas (INT./EXT.)',
        'Extrayendo personajes',
        'Identificando setpieces',
        'Evaluando complejidad de producción',
        '✓ Análisis completado',
      ]);

      if (error) {
        console.error('Error generating breakdown pro:', error);
        toast.error('Error al generar el breakdown profesional');
        return;
      }

      if (data?.breakdown) {
        setBreakdownPro(data.breakdown);
        toast.success('¡Breakdown profesional completado!');
      }
    } catch (err: any) {
      console.error('Error generating breakdown pro:', err);
      toast.error(err.message || 'Error al generar el breakdown profesional');
    } finally {
      setGeneratingBreakdownPro(false);
    }
  };
  const generateTeaserScenes = async (teaserData: any) => {
    if (!teaserData) return;
    
    setSegmenting(true);
    try {
      // Generate scenes for teaser 60s
      if (teaserData.teaser60) {
        toast.info('Generando escenas para Teaser 60s...');
        const { error: err60 } = await supabase.functions.invoke('generate-scenes', {
          body: {
            projectId,
            episodeNo: -1,
            synopsis: `TEASER 60s: ${teaserData.teaser60.logline}. ${teaserData.teaser60.scenes?.map((s: any) => s.description).join(' ')}`,
            sceneCount: teaserData.teaser60.scenes?.length || 6,
            isTeaser: true,
            teaserType: '60s',
            teaserData: teaserData.teaser60
          }
        });
        if (err60) throw err60;
      }
      
      // Generate scenes for teaser 30s
      if (teaserData.teaser30) {
        toast.info('Generando escenas para Teaser 30s...');
        const { error: err30 } = await supabase.functions.invoke('generate-scenes', {
          body: {
            projectId,
            episodeNo: -2,
            synopsis: `TEASER 30s: ${teaserData.teaser30.logline}. ${teaserData.teaser30.scenes?.map((s: any) => s.description).join(' ')}`,
            sceneCount: teaserData.teaser30.scenes?.length || 4,
            isTeaser: true,
            teaserType: '30s',
            teaserData: teaserData.teaser30
          }
        });
        if (err30) throw err30;
      }
      
      toast.success('Escenas de teasers generadas. Ve al módulo de Escenas.');
    } catch (err) {
      console.error('Error generating teaser scenes:', err);
      toast.error('Error al generar escenas de teasers');
    } finally {
      setSegmenting(false);
    }
  };

  // PIPELINE V2: Step 1 - Generate Light Outline with Polling (V4.0)
  const generateLightOutline = async () => {
    if (!ideaText.trim()) {
      toast.error('Escribe una idea para generar el guion');
      return;
    }

    setGeneratingOutline(true);
    setOutlineStartTime(Date.now()); // V4.0: Track start time for progress UI
    setLightOutline(null);
    setOutlineApproved(false);
    setPipelineSteps(prev => prev.map(s => ({ ...s, status: 'pending' })));
    updatePipelineStep('outline', 'running');

    const t0 = Date.now();
    const ideaLength = ideaText.trim().length;
    
    // Show info for long texts
    if (ideaLength > 30000) {
      toast.info('Texto extenso detectado', {
        description: `${Math.round(ideaLength / 1000)}K caracteres. La generación puede tardar varios minutos...`,
        duration: 8000,
      });
    }

    try {
      // Short timeout to get the outline_id (backend creates record immediately)
      const initialTimeoutMs = 45000; // 45s to get outline_id
      
      const { data, error } = await invokeWithTimeout<{ 
        outline?: typeof lightOutline; 
        polling?: boolean;
        outline_id?: string;
        outline_quality?: string;
        warnings?: string[];
      }>(
        'generate-outline-light',
        {
          idea: ideaText.trim(),
          episodesCount: format === 'series' ? episodesCount : 1,
          format,
          genre,
          tone,
          language,
          narrativeMode,
          densityTargets: targets,
          qualityTier,
          disableDensity,
          usePolling: true, // V4.0: Enable polling mode
          projectId,
        },
        initialTimeoutMs
      );

      // If we got full response immediately (fast generation), use it directly
      if (!error && data?.outline && Object.keys(data.outline).length > 0) {
        const durationMs = Date.now() - t0;
        console.log('[ScriptImport] Outline received synchronously in', durationMs, 'ms');
        
        handleOutlineSuccess(data.outline, data.outline_quality || 'FULL', data.warnings || [], durationMs);
        return;
      }

      // If we got outline_id, start polling
      if (!error && data?.polling && data?.outline_id) {
        console.log('[ScriptImport] Starting polling for outline:', data.outline_id);
        toast.info('Generación iniciada', {
          description: 'Consultando estado cada 5 segundos...',
          duration: 5000,
        });
        
        outlinePersistence.startPolling(data.outline_id, {
          pollInterval: 5000,
          maxPollDuration: 15 * 60 * 1000, // 15 minutes max
          onComplete: (completedOutline) => {
            const durationMs = Date.now() - t0;
            console.log('[ScriptImport] Outline polling completed in', durationMs, 'ms');
            
            // V4.4: Extract from outline_parts if outline_json is empty (stalled recovery)
            let outlineJson = completedOutline.outline_json as typeof lightOutline;
            const outlineParts = completedOutline.outline_parts as Record<string, any>;
            
            // If outline_json is empty but we have parts data, reconstruct from parts
            if ((!outlineJson || Object.keys(outlineJson).length === 0) && outlineParts) {
              const scaffold = outlineParts.film_scaffold?.data;
              const actI = outlineParts.expand_act_i?.data;
              const actII = outlineParts.expand_act_ii?.data;
              const actIII = outlineParts.expand_act_iii?.data;
              
              if (scaffold || actI || actII || actIII) {
                console.log('[ScriptImport] V4.4: Reconstructing outline from parts data');
                const allBeats = [
                  ...(actI?.beats || []),
                  ...(actII?.beats || []),
                  ...(actIII?.beats || []),
                ];
                outlineJson = { 
                  ...scaffold,
                  beats: allBeats.length > 0 ? allBeats : scaffold?.beats || [],
                };
              }
            }
            
            const quality = completedOutline.quality || 'FULL';
            const qcIssues = completedOutline.qc_issues || [];
            
            handleOutlineSuccess(outlineJson, quality, qcIssues, durationMs);
            setGeneratingOutline(false);
            setOutlineStartTime(null); // V4.0: Clear start time
          },
          onError: (errorMsg) => {
            console.error('[ScriptImport] Outline polling error:', errorMsg);
            setGeneratingOutline(false);
            setOutlineStartTime(null); // V4.0: Clear start time
            
            // V23: Detect CHUNK_READY_NEXT as "continue" state, not error
            const isReadyNext = errorMsg.includes('CHUNK_READY_NEXT');
            if (isReadyNext) {
              setOutlineError({
                code: 'CHUNK_READY_NEXT',
                message: errorMsg,
                substage: outlinePersistence.savedOutline?.substage || undefined,
                retryable: true
              });
              toast.info('Chunk completado. Presiona "Continuar" para el siguiente.');
            } else if (errorMsg.includes('CHUNK') || errorMsg.includes('TIMEOUT') || errorMsg.includes('AI_') || errorMsg.includes('stalled')) {
              updatePipelineStep('outline', 'error');
              setOutlineError({
                code: 'GENERATION_ERROR',
                message: errorMsg,
                substage: outlinePersistence.savedOutline?.substage || undefined,
                retryable: true
              });
            } else {
              updatePipelineStep('outline', 'error');
              toast.error('Error generando outline', { 
                description: errorMsg,
                duration: 10000,
              });
            }
          }
        });
        
        // Don't set generatingOutline to false - polling callbacks will do it
        return;
      }

      // If error, check if we can recover from DB
      if (error) {
        const errorMessage = String(error?.message || '').toLowerCase();
        const isTimeoutError = errorMessage.includes('timeout') || 
                               errorMessage.includes('failed to fetch') ||
                               errorMessage.includes('aborted');
        
        // V4.1: Handle PROJECT_BUSY error (409) - another generation is in progress
        const errorObj = error as any;
        const isProjectBusy = errorMessage.includes('project_busy') || 
                              errorMessage.includes('ya está generando') ||
                              (errorObj?.status === 409);
        
        if (isProjectBusy) {
          console.log('[ScriptImport] Project busy, checking for existing generation...');
          
          // Check if there's a generating outline we can poll instead
          const { data: generatingOutline } = await supabase
            .from('project_outlines')
            .select('id, status, created_at')
            .eq('project_id', projectId)
            .eq('status', 'generating')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          
          if (generatingOutline) {
            const createdAt = new Date(generatingOutline.created_at).getTime();
            const ageMinutes = (Date.now() - createdAt) / 60000;
            
            if (ageMinutes < 15) {
              console.log('[ScriptImport] Found existing generation, starting polling:', generatingOutline.id);
              toast.info('Ya hay una generación en progreso', {
                description: 'Conectando con la generación existente...',
                duration: 5000,
              });
              
              outlinePersistence.startPolling(generatingOutline.id, {
                pollInterval: 5000,
                maxPollDuration: (15 - ageMinutes) * 60 * 1000,
                onComplete: (completedOutline) => {
                  const durationMs = Date.now() - t0;
                  const outlineJson = completedOutline.outline_json as typeof lightOutline;
                  handleOutlineSuccess(outlineJson, completedOutline.quality || 'FULL', completedOutline.qc_issues || [], durationMs);
                  setGeneratingOutline(false);
                  setOutlineStartTime(null);
                },
                onError: (errorMsg) => {
                  updatePipelineStep('outline', 'error');
                  setGeneratingOutline(false);
                  setOutlineStartTime(null);
                  // V21: Set error state for persistent UI feedback
                  if (errorMsg.includes('CHUNK') || errorMsg.includes('TIMEOUT') || errorMsg.includes('AI_') || errorMsg.includes('stalled')) {
                    setOutlineError({
                      code: 'GENERATION_ERROR',
                      message: errorMsg,
                      substage: outlinePersistence.savedOutline?.substage || undefined,
                      retryable: true
                    });
                  } else {
                    toast.error('Error generando outline', { description: errorMsg });
                  }
                }
              });
              
              return;
            }
          }
          
          // No active generation found - show message to wait
          const retryAfter = errorObj?.retryAfter || 30;
          toast.error('Proyecto ocupado', {
            description: `Ya hay una operación en curso. Espera ${retryAfter} segundos e inténtalo de nuevo.`,
            duration: 10000,
          });
          updatePipelineStep('outline', 'error');
          return;
        }
        
        if (isTimeoutError) {
          console.log('[ScriptImport] Timeout detected, checking for generating outline in DB...');
          
          // Check if there's a generating outline we can poll
          const { data: generatingOutline } = await supabase
            .from('project_outlines')
            .select('id, status, created_at')
            .eq('project_id', projectId)
            .eq('status', 'generating')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          
          if (generatingOutline) {
            const createdAt = new Date(generatingOutline.created_at).getTime();
            const ageMinutes = (Date.now() - createdAt) / 60000;
            
            if (ageMinutes < 15) {
              console.log('[ScriptImport] Found generating outline, resuming polling:', generatingOutline.id);
              toast.info('Recuperando generación en progreso...', {
                description: 'La conexión se perdió pero la generación continúa en el servidor.',
                duration: 6000,
              });
              
              outlinePersistence.startPolling(generatingOutline.id, {
                pollInterval: 5000,
                maxPollDuration: (15 - ageMinutes) * 60 * 1000, // Remaining time
                onComplete: (completedOutline) => {
                  const durationMs = Date.now() - t0;
                  const outlineJson = completedOutline.outline_json as typeof lightOutline;
                  handleOutlineSuccess(outlineJson, completedOutline.quality || 'FULL', completedOutline.qc_issues || [], durationMs);
                  setGeneratingOutline(false);
                  setOutlineStartTime(null); // V4.0: Clear start time
                },
                onError: (errorMsg) => {
                  updatePipelineStep('outline', 'error');
                  setGeneratingOutline(false);
                  setOutlineStartTime(null); // V4.0: Clear start time
                  // V21: Set error state for persistent UI feedback
                  if (errorMsg.includes('CHUNK') || errorMsg.includes('TIMEOUT') || errorMsg.includes('AI_') || errorMsg.includes('stalled')) {
                    setOutlineError({
                      code: 'GENERATION_ERROR',
                      message: errorMsg,
                      substage: outlinePersistence.savedOutline?.substage || undefined,
                      retryable: true
                    });
                  } else {
                    toast.error('Error generando outline', { description: errorMsg });
                  }
                }
              });
              
              return;
            }
          }
          
          // No recoverable outline found
          toast.error('La generación tardó demasiado', {
            description: 'El texto es muy extenso. Inténtalo de nuevo.',
            duration: 10000,
          });
          updatePipelineStep('outline', 'error');
        } else {
          throw error;
        }
      }

    } catch (err: any) {
      console.error('Error generating light outline:', err);
      updatePipelineStep('outline', 'error');
      
      // V4.3: Better error messages for specific error types
      const errorMessage = String(err?.message || err || '').toLowerCase();
      
      if (errorMessage.includes('temperature') || errorMessage.includes('unsupported')) {
        toast.error('Error de compatibilidad del modelo', {
          description: 'Reintentando con configuración alternativa...',
          duration: 6000,
        });
        // Auto-retry with a slight delay
        setTimeout(() => generateOutlineDirect(), 1500);
        return;
      }
      
      if (errorMessage.includes('rate limit') || errorMessage.includes('429')) {
        toast.error('Límite de solicitudes alcanzado', {
          description: 'Espera unos segundos e inténtalo de nuevo.',
          duration: 8000,
        });
      } else if (errorMessage.includes('402') || errorMessage.includes('payment')) {
        toast.error('Créditos agotados', {
          description: 'Añade créditos a tu workspace de Lovable AI.',
          duration: 10000,
        });
      } else {
        toast.error(err.message || 'Error al generar outline');
      }
    } finally {
      // Only set to false if we're not polling
      if (!outlinePersistence.isPolling) {
        setGeneratingOutline(false);
        setOutlineStartTime(null); // V4.0: Clear start time
      }
    }
  };

  // Helper function to handle successful outline generation
  const handleOutlineSuccess = async (
    outline: any, 
    outlineQuality: string, 
    outlineWarnings: string[],
    durationMs: number
  ) => {
    const targetEpisodes = format === 'series' ? episodesCount : 1;
    const generatedEpisodes = outline?.episode_beats?.length || 0;
    
    // Show warnings but DON'T block
    if (outlineQuality === 'DEGRADED' && outlineWarnings.length > 0) {
      toast.warning('Outline generado con avisos', {
        description: outlineWarnings.join(', '),
        duration: 8000,
        action: {
          label: 'Regenerar',
          onClick: () => regenerateOutline(),
        },
      });
    }
    
    // Warn if episode count doesn't match
    if (generatedEpisodes !== targetEpisodes && generatedEpisodes > 0) {
      toast.warning(`Se generaron ${generatedEpisodes} episodios en lugar de ${targetEpisodes}.`, {
        description: 'Puedes regenerar o aprobar el outline actual.',
        duration: 6000,
      });
    }

    // Update timing model
    setTimingModel(prev => {
      const next = updateOutlineTiming(prev, {
        episodesCount: format === 'series' ? episodesCount : 1,
        durationMs,
      });
      saveScriptTimingModel(next);
      return next;
    });

    setLightOutline(outline);
    saveDraft('outline', projectId, { outline, idea: ideaText.trim() });
    
    // Persist to database - but avoid creating duplicates if already completed
    const existingOutline = outlinePersistence.savedOutline;
    if (existingOutline?.status === 'completed' || existingOutline?.status === 'approved') {
      console.log('[ScriptImport] Outline already persisted as completed/approved, skipping duplicate save');
    } else {
      const saveResult = await outlinePersistence.saveOutline({
        outline,
        quality: outlineQuality,
        qcIssues: outlineWarnings,
        idea: ideaText.trim(),
        genre,
        tone,
        format,
        episodeCount: format === 'series' ? episodesCount : 1,
        targetDuration: format === 'series' ? episodeDurationMin : filmDurationMin,
        status: 'approved', // V10.5: Mark as approved directly since it's ready for review
      });
      
      if (saveResult.success) {
        console.log('[ScriptImport] Outline persisted to database:', saveResult.id);
      }
    }
    
    updatePipelineStep('outline', 'success');
    updatePipelineStep('approval', 'running', 'Esperando aprobación...');
    
    const successMessage = outlineQuality === 'DEGRADED' 
      ? 'Outline generado (con avisos). Revísalo antes de aprobar.'
      : 'Outline generado. Revísalo y apruébalo para continuar.';
    toast.success(successMessage);
  };

  // PIPELINE V2: Step 2 - Regenerate Outline
  const regenerateOutline = () => {
    setLightOutline(null);
    setOutlineApproved(false);
    if (useDirectGeneration) {
      generateOutlineDirect();
    } else {
      generateLightOutline();
    }
  };

  // ============================================================================
  // V4.0 DIRECT GENERATION - Simplified single-call outline generation
  // ============================================================================
  const generateOutlineDirect = async () => {
    if (!ideaText.trim()) {
      toast.error('Escribe una idea para generar el guion');
      return;
    }

    setGeneratingOutline(true);
    setOutlineStartTime(Date.now());
    setLightOutline(null);
    setOutlineApproved(false);
    setOutlineError(null);
    setPipelineSteps(prev => prev.map(s => ({ ...s, status: 'pending' })));
    updatePipelineStep('outline', 'running');

    const t0 = Date.now();

    try {
      toast.info('Generación directa iniciada...', {
        description: 'Una sola llamada al modelo. ~60-90 segundos.',
        duration: 5000,
      });

      const { data, error } = await invokeWithTimeout<{
        success: boolean;
        outline?: any;
        outlineId?: string;
        warnings?: { type: string; message: string; current: number; required: number }[];
        score?: number;
        error?: string;
        message?: string;
      }>(
        'generate-outline-direct',
        {
          projectId,
          idea: ideaText.trim(),
          format,
          densityProfile,
          genre,
          tone,
          duration: format === 'film' ? filmDurationMin : episodeDurationMin,
        },
        130000 // 130s timeout (un poco más que el worker de 120s)
      );

      if (error) {
        // Handle specific error codes
        const errorMessage = String(error?.message || '');
        
        if (errorMessage.includes('PROJECT_BUSY') || errorMessage.includes('409')) {
          toast.warning('Proyecto ocupado', {
            description: 'Ya hay una generación en curso. Espera un momento.',
            duration: 8000,
          });
          updatePipelineStep('outline', 'error');
          return;
        }
        
        throw error;
      }

      if (!data?.success) {
        throw new Error(data?.message || data?.error || 'Error en generación directa');
      }

      const durationMs = Date.now() - t0;
      console.log('[ScriptImport] Direct outline generated in', durationMs, 'ms');

      // Show warnings if any (but don't block!)
      if (data.warnings && data.warnings.length > 0) {
        const warningMessages = data.warnings.map(w => w.message);
        toast.warning(`Outline generado con ${data.warnings.length} sugerencias`, {
          description: warningMessages.slice(0, 2).join('. '),
          duration: 10000,
        });
      }

      // Handle success - save and display
      handleOutlineSuccess(
        data.outline,
        data.score && data.score >= 80 ? 'FULL' : 'DEGRADED',
        data.warnings?.map(w => w.message) || [],
        durationMs
      );

      // Refresh outline persistence to get the latest from DB
      await outlinePersistence.refreshOutline();

    } catch (err: any) {
      console.error('[generateOutlineDirect] Error:', err);
      updatePipelineStep('outline', 'error');
      
      const errorMessage = String(err?.message || err || '').toLowerCase();
      
      if (errorMessage.includes('rate limit') || errorMessage.includes('429')) {
        toast.error('Límite de solicitudes alcanzado', {
          description: 'Espera unos segundos e inténtalo de nuevo.',
          duration: 8000,
        });
      } else if (errorMessage.includes('402') || errorMessage.includes('payment')) {
        toast.error('Créditos agotados', {
          description: 'Añade créditos a tu workspace de Lovable AI.',
          duration: 10000,
        });
      } else if (errorMessage.includes('timeout') || errorMessage.includes('aborted')) {
        setOutlineError({
          code: 'AI_TIMEOUT',
          message: 'La generación tardó demasiado. Inténtalo de nuevo.',
          retryable: true,
        });
        toast.error('Timeout en la generación', {
          description: 'Inténtalo de nuevo. El servidor puede estar ocupado.',
          duration: 8000,
        });
      } else {
        setOutlineError({
          code: 'GENERATION_ERROR',
          message: err.message || 'Error desconocido',
          retryable: true,
        });
        toast.error(err.message || 'Error al generar outline');
      }
    } finally {
      setGeneratingOutline(false);
      setOutlineStartTime(null);
    }
  };

  // PIPELINE V2: Delete Outline
  const handleDeleteOutline = async () => {
    if (!confirm('¿Seguro que quieres borrar el outline? Esta acción no se puede deshacer.')) {
      return;
    }
    
    // Clear local state
    setLightOutline(null);
    setOutlineApproved(false);
    
    // Delete from database via persistence hook
    const success = await outlinePersistence.deleteOutline();
    if (success) {
      toast.success('Outline eliminado correctamente');
    } else {
      toast.error('Error al eliminar el outline');
    }
  };

  // Handler to delete ALL project data and start fresh
  const handleDeleteAllProjectData = async () => {
    setDeletingAllData(true);
    try {
      // Order matters: delete in dependency order (children first)
      const tables = [
        // Child tables first (respect FK constraints)
        'storyboard_panels',        // Depends on storyboards
        'storyboards',              // Depends on scenes
        'shot_transitions',         // Depends on shots
        'micro_shots',              // Depends on shots
        'keyframes',                // Depends on shots
        'shots',                    // Depends on scenes
        'scene_camera_plan',        // Depends on scenes
        'scene_technical_docs',     // Depends on scenes
        'scenes',                   // Depends on scripts/episodes
        'episodes',                 // Depends on project
        'scripts',                  // Main script data
        'script_breakdowns',        // Auxiliary
        'character_pack_slots',     // Depends on characters
        'character_visual_dna',     // Depends on characters
        'character_outfits',        // Depends on characters
        'character_narrative',      // Depends on characters
        'character_reference_anchors', // Depends on characters
        'reference_anchors',        // Depends on characters
        'characters',               // Base entity
        'locations',                // Base entity
        'props',                    // Base entity
        'project_outlines',         // Narrative structure
        'project_bibles',           // Bible data
        'continuity_locks',         // Continuity data
        'generation_runs',          // Logs
        'batch_run_items',          // Logs (child of batch_runs)
        'batch_runs',               // Logs
      ];

      let errors: string[] = [];
      
      for (const table of tables) {
        const { error } = await supabase
          .from(table as any)
          .delete()
          .eq('project_id', projectId);
        
        if (error) {
          console.warn(`[DeleteAll] Error deleting from ${table}:`, error.message);
          errors.push(table);
        }
      }

      // Clear local state
      setLightOutline(null);
      setOutlineApproved(false);
      setGeneratedScript(null);
      setScriptText('');
      setCurrentScriptId(null);
      setScriptLocked(false);
      setGeneratedEpisodesList([]);
      setBibleCharacters([]);
      setBibleLocations([]);
      setBreakdownPro(null);
      setScenesCount(0);
      setDensityGateResult(null);
      setGenerationState(null);
      setBatchPlans([]);
      
      // Clear localStorage pipeline state
      clearPipelineState();
      
      // Clear draft persistence
      try {
        localStorage.removeItem(DRAFT_STORAGE_KEY);
      } catch {}
      
      if (errors.length > 0) {
        toast.warning(`Proyecto limpiado con algunos errores en: ${errors.join(', ')}`);
      } else {
        toast.success('Proyecto limpiado completamente. Puedes empezar de cero.');
      }
      
      // Trigger parent refresh if available
      if (onScenesCreated) onScenesCreated();
      
    } catch (error) {
      console.error('[DeleteAll] Error:', error);
      toast.error('Error al limpiar el proyecto');
    } finally {
      setDeletingAllData(false);
    }
  };

  // PHASE 2: Upgrade Outline to Showrunner level (V2 - Chunked with stages)
  const handleUpgradeToShowrunner = async () => {
    const outlineId = outlinePersistence.savedOutline?.id;
    if (!outlineId) {
      toast.error('No hay outline guardado para mejorar');
      return;
    }
    
    // Already showrunner level
    if (outlinePersistence.savedOutline?.quality === 'showrunner') {
      toast.info('Este outline ya está a nivel Showrunner');
      return;
    }
    
    setUpgradingOutline(true);
    
    const STAGE_LABELS: Record<string, string> = {
      'season_arc': 'Arco de temporada',
      'character_arcs': 'Arcos de personajes',
      'episode_enrich': 'Enriquecimiento de episodios'
    };
    
    const MAX_STAGES = 3;
    let completedStages = 0;
    let lastError: string | null = null;
    
    toast.info('Elevando outline a nivel Showrunner...', {
      description: 'Procesando en etapas para mayor estabilidad.',
      duration: 5000,
    });
    
    try {
      // Loop through stages - each invocation does ONE stage
      while (completedStages < MAX_STAGES) {
        const { data, error } = await invokeWithTimeout<any>(
          'outline-upgrade',
          { outline_id: outlineId },
          { timeoutMs: 90000 } // 90s timeout per stage (45s AI + buffer)
        );
        
        if (error) {
          lastError = error.message || 'Error desconocido';
          break;
        }
        
        if (!data?.success) {
          lastError = data?.error || 'Error desconocido';
          break;
        }
        
        // Stage completed
        if (data.stage_completed) {
          completedStages++;
          const stageLabel = STAGE_LABELS[data.stage_completed] || data.stage_completed;
          toast.info(`✓ ${stageLabel} completado`, {
            description: data.next_stage 
              ? `Siguiente: ${STAGE_LABELS[data.next_stage] || data.next_stage}` 
              : 'Finalizando...',
            duration: 3000,
          });
        }
        
        // All stages done
        if (data.is_complete) {
          await outlinePersistence.refreshOutline();
          toast.success('🎬 Outline elevado a nivel Showrunner', {
            description: 'Arcos dramáticos, mitología y estructura profunda añadidos.',
            duration: 8000,
          });
          break;
        }
        
        // Small delay between stages
        await new Promise(r => setTimeout(r, 500));
      }
      
      // If we have an error after some stages, show partial success
      if (lastError && completedStages > 0) {
        await outlinePersistence.refreshOutline();
        toast.warning(`Upgrade parcial: ${completedStages}/3 etapas`, {
          description: `Error: ${lastError}. Puedes reintentar para completar.`,
          duration: 8000,
        });
      } else if (lastError) {
        // Handle specific error types
        if (lastError.includes('RATE_LIMIT') || lastError.includes('429')) {
          toast.error('Límite de solicitudes alcanzado', {
            description: 'Espera unos segundos e inténtalo de nuevo.',
          });
        } else if (lastError.includes('CREDITS') || lastError.includes('402')) {
          toast.error('Créditos agotados', {
            description: 'Añade créditos a tu workspace.',
          });
        } else {
          toast.error('Error al mejorar outline', {
            description: lastError,
          });
        }
      }
      
    } catch (err: any) {
      console.error('Error upgrading outline:', err);
      
      // If some stages completed, refresh and show partial
      if (completedStages > 0) {
        await outlinePersistence.refreshOutline();
        toast.warning(`Upgrade parcial: ${completedStages}/3 etapas`, {
          description: 'Puedes reintentar para completar las etapas restantes.',
        });
      } else {
        toast.error('Error al mejorar outline', {
          description: err.message || 'Inténtalo de nuevo.',
        });
      }
    } finally {
      setUpgradingOutline(false);
    }
  };

  // V8.0: Retry draft outline that failed to start
  const handleRetryDraftOutline = async () => {
    const outlineId = outlinePersistence.savedOutline?.id;
    if (!outlineId) {
      toast.error('No hay outline para reintentar');
      return;
    }
    
    setGeneratingOutline(true);
    setOutlineStartTime(Date.now());
    
    try {
      // Update status to 'generating' and set initial stage
      const { error: updateError } = await supabase.from('project_outlines').update({
        status: 'generating',
        stage: 'summarize',
        progress: 0,
        updated_at: new Date().toISOString()
      }).eq('id', outlineId);
      
      if (updateError) {
        throw new Error('Error actualizando outline: ' + updateError.message);
      }
      
      // Invoke worker
      const { error: invokeError } = await invokeWithTimeout('outline-worker', {
        outline_id: outlineId
      }, { timeoutMs: 10000 });
      
      if (invokeError) {
        console.warn('[ScriptImport] Worker invoke warning:', invokeError);
        // Continue anyway - worker might still be processing
      }
      
      // Start polling
      outlinePersistence.startPolling(outlineId, {
        onComplete: () => {
          setGeneratingOutline(false);
          outlinePersistence.refreshOutline();
          toast.success('Outline generado correctamente');
        },
        onError: (err) => {
          setGeneratingOutline(false);
          // V21: Set error state for persistent UI feedback
          if (err.includes('CHUNK') || err.includes('TIMEOUT') || err.includes('AI_') || err.includes('stalled')) {
            setOutlineError({
              code: 'GENERATION_ERROR',
              message: err,
              substage: outlinePersistence.savedOutline?.substage || undefined,
              retryable: true
            });
          } else {
            toast.error('Error: ' + err);
          }
        }
      });
      
      toast.info('Reintentando generación de outline...', {
        description: 'El proceso puede tardar 1-3 minutos.',
      });
    } catch (err: any) {
      setGeneratingOutline(false);
      console.error('Error retrying draft outline:', err);
      toast.error('Error al reintentar: ' + (err.message || 'Error desconocido'));
    }
  };

  // Pre-flight check: ensure Bible has entities before generating
  // Fetch Bible data from DB (characters + locations)
  const fetchBibleData = async () => {
    if (!projectId) return;
    setBibleLoading(true);
    try {
      const [charsRes, locsRes] = await Promise.all([
        supabase.from('characters').select('id, name, role, bio, character_role, profile_json, created_at')
          .eq('project_id', projectId).order('created_at', { ascending: false }).limit(50),
        supabase.from('locations').select('id, name, description, int_ext, created_at')
          .eq('project_id', projectId).order('created_at', { ascending: false }).limit(50),
      ]);
      setBibleCharacters(charsRes.data || []);
      setBibleLocations(locsRes.data || []);
    } catch (err) {
      console.error('[fetchBibleData] Error:', err);
    } finally {
      setBibleLoading(false);
    }
  };
  
  // Fetch Bible on mount and when projectId changes
  useEffect(() => {
    fetchBibleData();
  }, [projectId]);

  const ensureBibleMaterialized = async (): Promise<boolean> => {
    // V24: Prevent multiple concurrent calls
    if (materializingEntities) {
      console.log('[ensureBibleMaterialized] Already materializing, skipping');
      return false;
    }
    
    setMaterializingEntities(true);
    try {
      const hasChars = bibleCharacters.length > 0;
      const hasLocs = bibleLocations.length > 0;

      if (hasChars && hasLocs) return true;

      // V24: Don't attempt if outline is still generating and scaffold isn't ready
      const outlineStatus = outlinePersistence.savedOutline?.status;
      const outlineProgress = outlinePersistence.savedOutline?.progress || 0;
      const hasScaffold = !!(outlinePersistence.savedOutline?.outline_parts as any)?.film_scaffold?.data;
      
      if ((outlineStatus === 'generating' || outlineStatus === 'queued') && !hasScaffold && outlineProgress < 20) {
        console.log('[ensureBibleMaterialized] Outline generating without scaffold, skipping materialization');
        return false;
      }

      toast.info('Sincronizando personajes y locaciones del outline...');

      // V24: Pass outlineId if available for targeted materialization
      const outlineId = outlinePersistence.savedOutline?.id;
      const { data, error } = await supabase.functions.invoke('materialize-entities', {
        body: { projectId, source: 'outline', outlineId }
      });

      // Use robust helper to detect NO_OUTLINE_FOUND in any response format
      if (isMaterializeNoOutline(data, error)) {
        toast.info('Genera un outline primero.');
        return false;
      }
      
      // V24: Handle OUTLINE_NOT_READY (scaffold exists but no entities yet)
      if (data?.error === 'OUTLINE_NOT_READY') {
        toast.info('Outline en progreso. Entidades disponibles al completar scaffold.', {
          duration: 5000,
        });
        return false;
      }

      if (error) {
        toast.error('No se pudo sincronizar la Bible. Reintenta.');
        return false;
      }
      
      // V24: Check if actually materialized anything
      const totalMaterialized = (data?.characters?.created || 0) + (data?.characters?.updated || 0) +
                                 (data?.locations?.created || 0) + (data?.locations?.updated || 0);
      
      if (totalMaterialized === 0 && !data?.success) {
        toast.info('Outline aún no tiene entidades extraíbles. Continúa la generación.');
        return false;
      }

      // Refresh Bible data after sync
      await fetchBibleData();
      toast.success('Bible sincronizada ✓');
      return true;
    } finally {
      setMaterializingEntities(false);
    }
  };

  // V11.2: Helper to normalize required_fixes from backend to frontend format
  const normalizeRequiredFixes = (fixes: any[] | undefined): DensityGateResult['required_fixes'] => {
    if (!fixes || !Array.isArray(fixes)) return [];
    
    return fixes.map(fix => ({
      type: fix.type || 'UNKNOWN',
      title: fix.title || 'Fix requerido',
      current: fix.current ?? 0,
      required: fix.required ?? 1,
      fix_hint: fix.fix_hint || fix.why_needed || fix.acceptance_test || '',
      // Keep backend fields for compatibility
      why_needed: fix.why_needed,
      where_to_apply: fix.where_to_apply,
      acceptance_test: fix.acceptance_test,
    }));
  };

  // V11.2: DENSITY PRECHECK - Run before script generation
  const runDensityPrecheck = useCallback(async (): Promise<DensityGateResult | null> => {
    try {
      const { data, error } = await invokeAuthedFunction('density-precheck', {
        projectId,
        formatProfile: format === 'film' ? 'pelicula_90min' : 'serie_drama',
      });

      if (error) {
        // Handle 422/404 from backend as FAIL
        const errorObj = error as any;
        if (errorObj?.status === 422 || errorObj?.status === 404 || errorObj?.code?.includes('GATE_FAILED')) {
          return {
            status: 'FAIL',
            // NORMALIZATION: Backend uses 'score', frontend uses 'density_score'
            density_score: errorObj.density_score ?? errorObj.score ?? 0,
            required_fixes: normalizeRequiredFixes(errorObj.required_fixes),
            human_summary: errorObj.human_summary || errorObj.message || 'Densidad insuficiente',
          };
        }
        throw error;
      }

      // Map backend response to our type
      const checkResult = data?.check_result;
      return {
        status: data?.ok_to_generate ? 'PASS' : 'FAIL',
        // NORMALIZATION: Backend uses 'score', frontend uses 'density_score'
        density_score: checkResult?.density_score ?? checkResult?.score ?? 100,
        required_fixes: normalizeRequiredFixes(checkResult?.required_fixes),
        human_summary: data?.human_summary || checkResult?.human_summary,
        warnings: data?.recommendations,
      };
    } catch (err: any) {
      console.error('[runDensityPrecheck] Error:', err);
      // On network error, allow generation with warning
      toast.warning('No se pudo verificar densidad, continuando con precaución...');
      return {
        status: 'WARN',
        density_score: 0,
        human_summary: 'Verificación de densidad no disponible',
        required_fixes: [],
        warnings: [],
      };
    }
  }, [projectId, format]);

  // V11.2: Handle auto-patching of outline when density gate fails
  const handleAutoPatching = async () => {
    // Keep modal open with loading state - Adjustment #1
    setIsPatchingOutline(true);
    
    try {
      // Map frontend fix format to backend format if needed
      const fixesForBackend = (densityGateResult?.required_fixes || []).map(fix => ({
        type: fix.type,
        id: `fix_${fix.type}_${Date.now()}`,
        title: fix.title,
        why_needed: fix.fix_hint || `Necesario para cumplir mínimo de ${fix.required || 1}`,
        where_to_apply: 'global',
        acceptance_test: `${fix.type} >= ${fix.required || 1}`
      }));
      
      const { data, error } = await invokeAuthedFunction('outline-patch', {
        projectId,
        requiredFixes: fixesForBackend,
        formatProfile: format === 'film' ? 'pelicula_90min' : 'serie_drama',
      });
      
      if (error) throw error;
      
      // Reload outline from DB
      if (outlinePersistence?.refreshOutline) {
        await outlinePersistence.refreshOutline();
      }
      
      // Re-check density
      const newResult = await runDensityPrecheck();
      
      if (newResult?.status === 'PASS') {
        toast.success(`Outline parcheado exitosamente (score: ${newResult.density_score})`);
        setDensityGateResult(newResult);
        setShowDensityGateModal(false); // Only close on PASS - Adjustment #1
      } else {
        toast.warning('El outline mejoró pero aún necesita más contenido');
        setDensityGateResult(newResult);
        // Modal stays open to show remaining fixes
      }
    } catch (err: any) {
      console.error('[handleAutoPatching] Error:', err);
      toast.error(err.message || 'Error parcheando outline');
    } finally {
      setIsPatchingOutline(false);
    }
  };

  // Fetch scenes count from DB
  const fetchScenesCount = async () => {
    if (!projectId) return;
    const { count } = await supabase
      .from('scenes')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', projectId);
    setScenesCount(count || 0);
  };

  // Fetch scenes count on mount
  useEffect(() => {
    fetchScenesCount();
  }, [projectId]);

  // Materialize scenes from outline
  const materializeScenesFromOutline = async (): Promise<boolean> => {
    setMaterializingScenes(true);
    try {
      toast.info('Extrayendo escenas del outline...');

      const { data, error } = await supabase.functions.invoke('materialize-scenes', {
        body: { projectId }
      });

      if (error) {
        toast.error('No se pudieron extraer las escenas: ' + error.message);
        return false;
      }

      if (data?.scenes?.created > 0) {
        toast.success(`✓ ${data.scenes.created} escenas creadas desde el outline`);
        await fetchScenesCount();
        return true;
      } else {
        toast.warning('No se encontraron escenas en el outline');
        return false;
      }
    } catch (err: any) {
      toast.error('Error al materializar escenas: ' + err.message);
      return false;
    } finally {
      setMaterializingScenes(false);
    }
  };

  // Auto-materialize Bible on page load if outline has data but Bible is empty
  useEffect(() => {
    const autoMaterializeIfNeeded = async () => {
      if (!projectId || !lightOutline) return;
      
      // Check if outline has entities worth syncing
      const outlineHasChars = (lightOutline.main_characters?.length ?? 0) > 0;
      const outlineHasLocs = (lightOutline.main_locations?.length ?? 0) > 0;
      
      if (!outlineHasChars && !outlineHasLocs) return;
      
      // Use already-fetched Bible state (no redundant query)
      const hasChars = bibleCharacters.length > 0;
      const hasLocs = bibleLocations.length > 0;
      
      // If outline has data but Bible is empty, sync silently
      if (!hasChars && !hasLocs && !bibleLoading) {
        console.log('[AutoMaterialize] Bible empty but outline has entities, syncing in background...');
        setMaterializingEntities(true);
        try {
          const { data, error } = await supabase.functions.invoke('materialize-entities', {
            body: { projectId, source: 'outline' }
          });
          
          // Gracefully handle NO_OUTLINE_FOUND - this is expected after deletion
          if (error || isMaterializeNoOutline(data, error)) {
            console.log('[AutoMaterialize] Skipped - no outline available (expected after delete)');
            return;
          }
          
          console.log('[AutoMaterialize] Sync completed successfully');
          // Refresh Bible data after auto-sync
          await fetchBibleData();
        } catch (err) {
          console.error('[AutoMaterialize] Sync failed:', err);
        } finally {
          setMaterializingEntities(false);
        }
      }
    };
    
    autoMaterializeIfNeeded();
  }, [projectId, lightOutline, bibleCharacters.length, bibleLocations.length, bibleLoading]);

  // PIPELINE V2: Step 3 - Approve Outline & Generate Episodes (with batches)
  // V11.2: Now includes DENSITY GATE + BATCH PLANNER + STATE ACCUMULATION
  const approveAndGenerateEpisodes = async () => {
    if (!lightOutline) return;

    // Proactively refresh session before starting long pipeline
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      toast.error('Sesión expirada. Por favor inicia sesión de nuevo.');
      return;
    }
    // Refresh token to maximize validity for the pipeline
    await supabase.auth.refreshSession();
    console.log('[ScriptImport] Session refreshed before starting pipeline');

    // ════════════════════════════════════════════════════════════════════════
    // V11.2: DENSITY GATE - Block generation if outline doesn't meet minimums
    // ════════════════════════════════════════════════════════════════════════
    toast.info('Verificando densidad del outline...');
    const densityResult = await runDensityPrecheck();
    
    if (!densityResult) {
      toast.error('No se pudo verificar la densidad del outline');
      return;
    }
    
    setDensityGateResult(densityResult);
    
    if (densityResult.status === 'FAIL') {
      console.error('[DENSITY_GATE] BLOCKED - Setting modal visible. Fixes required:', densityResult.required_fixes);
      console.log('[DENSITY_GATE] Full result:', JSON.stringify(densityResult, null, 2));
      setDensityGateResult(densityResult);
      setShowDensityGateModal(true);
      toast.warning('Outline bloqueado por requisitos de densidad - revisa el modal');
      return; // ← BLOCK generation until density is fixed
    }
    
    if (densityResult.status === 'PASS') {
      toast.success(`Densidad OK (score: ${densityResult.density_score})`);
    }

    // PRE-FLIGHT: Ensure Bible has characters/locations before generating
    const bibleReady = await ensureBibleMaterialized();
    if (!bibleReady) {
      toast.warning('No se pudo preparar la Bible. Intenta sincronizar manualmente.');
      return;
    }

    setOutlineApproved(true);
    updatePipelineStep('approval', 'success');
    updatePipelineStep('episodes', 'running');
    setPipelineRunning(true);
    setPipelineProgress(10);
    setGeneratedEpisodesList([]);
    setScriptStartTime(Date.now()); // V47: Track start time for overlay timer

    const controller = new AbortController();
    setCancelController(controller);

    const totalEpisodes = lightOutline.episode_beats?.length || episodesCount;
    setTotalEpisodesToGenerate(totalEpisodes);

    // Clear the outline draft since it's now saved in pipeline state
    deleteDraft('outline', projectId);
    
    // V3.3: Mark outline as approved in database
    if (outlinePersistence.savedOutline) {
      await outlinePersistence.approveOutline();
      console.log('[ScriptImport] Outline marked as approved in database');
    }

    // Save initial pipeline state for background recovery
    savePipelineState({
      projectId, // CRITICAL: Include projectId to prevent cross-project state conflicts
      pipelineRunning: true,
      progress: 10,
      currentEpisode: 1,
      totalEpisodes,
      episodes: [],
      outline: lightOutline,
      startedAt: Date.now(),
      completedBatches: 0,
      totalBatches: totalEpisodes * calculateDynamicBatches(targets!, complexity, undefined, episodeDurationMin, qualityTier).batchesPerEpisode
    });

    // V3.0: Calculate dynamic batch configuration based on complexity, episode duration, AND quality tier
    const tierConfig = QUALITY_TIERS[qualityTier];
    const dynamicBatchConfig = calculateDynamicBatches(targets!, complexity, undefined, episodeDurationMin, qualityTier);
    setBatchConfig(dynamicBatchConfig);
    
    const BATCHES_PER_EPISODE = dynamicBatchConfig.batchesPerEpisode;
    const SCENES_PER_BATCH = dynamicBatchConfig.scenesPerBatch;
    const DELAY_BETWEEN_BATCHES = dynamicBatchConfig.delayBetweenBatchesMs;
    const DELAY_BETWEEN_EPISODES = tierConfig.delayBetweenEpisodesMs;
    
    console.log(`[V3.0 BATCH] Tier: ${qualityTier} | Complexity: ${complexity} | Config: ${BATCHES_PER_EPISODE} batches × ${SCENES_PER_BATCH} scenes = ${dynamicBatchConfig.estimatedScenesTotal} scenes/episode`);
    
    const totalBatches = totalEpisodes * BATCHES_PER_EPISODE;
    let completedBatches = 0;
    
    // V49: Register background task for global progress tracking
    const estimatedMs = estimateFullScriptMs(timingModel, {
      episodesCount: totalEpisodes,
      batchesPerEpisode: BATCHES_PER_EPISODE,
      complexity,
    });
    const taskId = addTask({
      type: 'script_generation',
      title: `Generando guion (${totalEpisodes} ${totalEpisodes === 1 ? 'episodio' : 'episodios'})`,
      description: `Tier: ${qualityTier} | ETA: ${formatDurationMs(estimatedMs)}`,
      projectId,
      metadata: {
        totalEpisodes,
        totalBatches,
        estimatedMs,
        batchesPerEpisode: BATCHES_PER_EPISODE,
        complexity,
        qualityTier,
      },
    });
    setScriptTaskId(taskId);

    try {
      const episodes: any[] = [];
      const MAX_REPAIR_ATTEMPTS = 2; // V11.2: Max repair attempts per batch

      for (let epNum = 1; epNum <= totalEpisodes; epNum++) {
        if (controller.signal.aborted) {
          toast.info('Generación cancelada');
          break;
        }

        setCurrentEpisodeGenerating(epNum);
        const episodeBeat = lightOutline.episode_beats?.[epNum - 1];

        // ════════════════════════════════════════════════════════════════════
        // V11.2: BUILD BATCH PLAN FOR THIS EPISODE
        // ════════════════════════════════════════════════════════════════════
        const episodeBatchPlan = buildClientBatchPlan(
          epNum,
          lightOutline,
          BATCHES_PER_EPISODE,
          SCENES_PER_BATCH
        );
        setBatchPlans(episodeBatchPlan);
        console.log(`[V11.2] BatchPlan for Ep${epNum}:`, episodeBatchPlan.map(p => ({ 
          batch: p.batchNumber, 
          threads: p.requiredThreads, 
          tps: p.requiredTurningPoints 
        })));

        // ════════════════════════════════════════════════════════════════════
        // V11.2: INITIALIZE GENERATION STATE FOR THIS EPISODE
        // ════════════════════════════════════════════════════════════════════
        let episodeState: GenerationState = createInitialState();
        setGenerationState(episodeState);
        const batchAttempts: Record<number, number> = {};

        // Generate episode with dynamic batch count
        const allScenes: any[] = [];
        let synopsisFromClaude: string | null = null;
        let episodeError: string | null = null;

        // Add delay BEFORE starting episode based on tier rate limits
        if (epNum > 1) {
          console.log(`[${qualityTier}] Waiting ${DELAY_BETWEEN_EPISODES}ms before Episode ${epNum}...`);
          await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_EPISODES));
        }

        for (let batchIdx = 0; batchIdx < BATCHES_PER_EPISODE; batchIdx++) {
          if (controller.signal.aborted) break;

          // V11.2: Get the batch plan for this batch
          const currentPlan = episodeBatchPlan[batchIdx];
          batchAttempts[batchIdx] = batchAttempts[batchIdx] || 0;

          // Add delay between batches based on tier rate limits
          if (batchIdx > 0) {
            console.log(`[${qualityTier}] Waiting ${DELAY_BETWEEN_BATCHES}ms before batch ${batchIdx + 1}...`);
            await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
          }

          const sceneStart = batchIdx * SCENES_PER_BATCH + 1;
          const sceneEnd = sceneStart + SCENES_PER_BATCH - 1;
          // Clean label for internal logging only - UI shows percentage
          const batchLabel = `Ep${epNum} batch ${batchIdx + 1}/${BATCHES_PER_EPISODE}`;
          // UI message: just "Episodio X" - no batch details
          updatePipelineStep('episodes', 'running', `Episodio ${epNum} de ${totalEpisodes}`);

          const t0 = Date.now();
          setEpisodeStartedAtMs(t0);
          
          // V11.2: Batch loop with repair attempts
          let batchPassed = false;
          let lastBatchData: any = null;
          
          while (!batchPassed && batchAttempts[batchIdx] <= MAX_REPAIR_ATTEMPTS) {
            const isRepairAttempt = batchAttempts[batchIdx] > 0;
            
            if (isRepairAttempt) {
              console.log(`[${batchLabel}] REPAIR attempt ${batchAttempts[batchIdx]}...`);
              toast.info(`Reparando batch ${batchIdx + 1}...`, { duration: 3000 });
            }

            try {
              const invokeBatch = async () => {
                if (controller.signal.aborted) {
                  throw new Error('Aborted');
                }
                // V3.0: Call generate-script canonical router instead of legacy batch function
                // V11.1: CRITICAL - projectId MUST be passed for Bible injection
                // V11.2: Now includes currentBatchPlan + generationState
                return await invokeAuthedFunction('generate-script', {
                  projectId,  // ← P0 FIX: Required for Bible fetch
                  outline: { ...lightOutline, idea: ideaText },  // ← V11.2: Include ideaText for ADAPT_FROM_SOURCE mode
                  episodeNumber: epNum,
                  language,
                  batchIndex: batchIdx,
                  previousScenes: allScenes,
                  narrativeMode,
                  // Dynamic batch config
                  scenesPerBatch: SCENES_PER_BATCH,
                  totalBatches: BATCHES_PER_EPISODE,
                  isLastBatch: batchIdx === BATCHES_PER_EPISODE - 1,
                  // V3.0: Quality tier instead of model selection
                  qualityTier,
                  // V11.2: Batch planner fields
                  currentBatchPlan: currentPlan,
                  generationState: episodeState,
                  isRepairAttempt,
                  repairBlockers: isRepairAttempt ? episodeState.lastRepairReason : undefined,
                });
              };

              const { data, error } = await retryWithBackoff(invokeBatch, {
                maxRetries: 2,
                initialDelayMs: 1500,
                maxDelayMs: 12000,
                retryOn: (e) => {
                  if (controller.signal.aborted) return false;
                  return (
                    isRetryableError(e) ||
                    (e instanceof Error &&
                      /Failed to send a request to the Edge Function|Failed to fetch/i.test(e.message))
                  );
                },
                onRetry: (attempt, err, nextDelayMs) => {
                  console.warn(
                    `[${batchLabel}] Reintentando (${attempt}) en ${Math.round(nextDelayMs)}ms...`,
                    err
                  );
                },
              });

              const batchDurationMs = Date.now() - t0;

              if (error) {
                console.error(`Error in ${batchLabel}:`, error);
                
                // Handle GATE errors - abort immediately, don't retry
                const errorObj = error as any;
                const errorMsg = error?.message || '';
                const errorCode = errorObj?.code || '';
                
                // V3.0: Enhanced density gate detection (includes DENSITY_INSUFFICIENT)
                const isDensityError = 
                  errorObj?.status === 422 || 
                  errorMsg.includes('GATE_FAILED') || 
                  errorMsg.includes('DENSITY_INSUFFICIENT') ||
                  errorCode === 'DENSITY_INSUFFICIENT' ||
                  errorCode === 'DENSITY_GATE_FAILED';
                
                if (isDensityError) {
                  setDensityGateResult({
                    status: 'FAIL',
                    density_score: errorObj.density_score ?? errorObj.score ?? 0,
                    required_fixes: errorObj.required_fixes || [],
                    human_summary: errorObj.human_summary || errorMsg,
                  });
                  setShowDensityGateModal(true);
                  
                  // Also show toast with summary
                  toast.error('Densidad narrativa insuficiente', {
                    description: errorObj.human_summary || 'El outline necesita más contenido para generar el guión',
                    duration: 10000
                  });
                  
                  throw new Error(`GATE_FAILED: ${errorMsg}`);
                }
                
                // Handle BIBLE_EMPTY recoverable error
                if (errorMsg.includes('BIBLE_EMPTY') || error?.code === 'BIBLE_EMPTY') {
                  toast.error('Faltan personajes/locaciones en la Bible.', {
                    action: {
                      label: 'Sincronizar ahora',
                      onClick: async () => {
                        await ensureBibleMaterialized();
                      }
                    },
                    duration: 10000
                  });
                  // Break the episode loop - don't retry this error
                  episodeError = 'BIBLE_EMPTY';
                  batchPassed = true; // exit loop
                  break;
                }
                
                // Handle PARSE_FAILED - show actionable error and allow retry
                if (errorMsg.includes('PARSE_FAILED') || errorMsg.includes('Cannot coerce')) {
                  toast.error('Error al procesar respuesta del modelo AI', {
                    description: 'El modelo devolvió una respuesta mal formada. Reintentando...',
                    duration: 5000
                  });
                  // Continue to retry logic below
                }
                
                // V3.0: Handle PROJECT_BUSY (409) - show lock info and allow unlock
                if (errorObj?.status === 409 || errorObj?.code === 'PROJECT_BUSY' || errorMsg.includes('PROJECT_BUSY')) {
                  const retryAfter = errorObj?.retry_after_seconds || 60;
                  const lockReason = errorObj?.lock_reason || 'script_generation';
                  
                  setProjectLockInfo({
                    isLocked: true,
                    lockReason,
                    retryAfterSeconds: retryAfter,
                    lockedAt: new Date(),
                  });
                  
                  toast.warning(`Proyecto ocupado: ${lockReason}`, {
                    description: `Espera ${Math.ceil(retryAfter / 60)} min o desbloquea manualmente`,
                    action: {
                      label: 'Desbloquear',
                      onClick: async () => {
                        try {
                          const { error: unlockError } = await invokeAuthedFunction('force-unlock-project', { projectId });
                          if (unlockError) throw unlockError;
                          setProjectLockInfo(null);
                          toast.success('Proyecto desbloqueado');
                        } catch (e: any) {
                          toast.error(`Error al desbloquear: ${e.message}`);
                        }
                      }
                    },
                    duration: 15000
                  });
                  
                  // Break the generation loop - don't retry automatically
                  episodeError = 'PROJECT_BUSY';
                  batchPassed = true; // exit loop
                  break;
                }
                
                // For other errors, increment attempt and maybe retry
                batchAttempts[batchIdx]++;
                episodeState = {
                  ...episodeState,
                  repairAttempts: episodeState.repairAttempts + 1,
                  lastRepairReason: errorMsg,
                };
                continue; // retry
              }

              lastBatchData = data;

              if (data?.scenes && Array.isArray(data.scenes)) {
                // ════════════════════════════════════════════════════════════════
                // V11.2: UPDATE GENERATION STATE
                // ════════════════════════════════════════════════════════════════
                if (data.updatedGenerationState) {
                  // Use backend-provided state (preferred)
                  episodeState = data.updatedGenerationState;
                } else {
                  // Fallback: update state manually from response
                  episodeState = updateGenerationStateClient(episodeState, {
                    threads_advanced: data.threads_advanced || data._qc?.threads_advanced || [],
                    turning_points_executed: data.turning_points_executed || data._qc?.turning_points_executed || [],
                    characters_appeared: data.characters_appeared || [],
                    scenes: data.scenes,
                  });
                }
                setGenerationState(episodeState);

                // V11.2: Validate batch result against plan (soft validation - log only)
                const validation = validateBatchResult(data, currentPlan);
                if (!validation.passed) {
                  console.warn(`[${batchLabel}] Batch validation:`, validation.blockers);
                  // Don't fail here - QC is for logging, we already got scenes
                }

                allScenes.push(...data.scenes);
                if (data.synopsis && !synopsisFromClaude) {
                  synopsisFromClaude = data.synopsis;
                }

                // Learn batch timing
                setTimingModel(prev => {
                  const next = updateBatchTiming(prev, {
                    durationMs: batchDurationMs,
                    complexity,
                  });
                  saveScriptTimingModel(next);
                  return next;
                });

                completedBatches++;
                const progress = 10 + Math.round((completedBatches / totalBatches) * 75);
                setPipelineProgress(progress);
                
                // V49: Update background task progress with ETA
                if (taskId) {
                  const remainingBatches = totalBatches - completedBatches;
                  const remainingMs = remainingBatches * estimateBatchMs(timingModel, complexity) + 15000; // +dialogues+teasers+save
                  updateTask(taskId, { 
                    progress, 
                    description: `Episodio ${epNum}/${totalEpisodes} | Restante: ${formatDurationMs(remainingMs)}`
                  });
                }

                console.log(`[${batchLabel}] ✓ ${data.scenes.length} scenes | State: threads=${episodeState.threadsAdvanced.length}, tps=${episodeState.turningPointsDone.length}`);
                batchPassed = true; // success!
              } else {
                // No scenes returned - retry
                batchAttempts[batchIdx]++;
                episodeState.lastRepairReason = 'No scenes returned';
              }
            } catch (err: any) {
              console.error(`Exception in ${batchLabel}:`, err);
              
              // If it's a GATE error, propagate it up
              if (err.message?.includes('GATE_FAILED')) {
                throw err;
              }
              
              batchAttempts[batchIdx]++;
              episodeState.lastRepairReason = err.message || 'Unknown error';
            }
          }
          
          // If batch still not passed after all attempts, log and continue
          if (!batchPassed) {
            console.error(`[${batchLabel}] FAILED after ${batchAttempts[batchIdx]} attempts`);
            episodeError = `Batch ${batchIdx + 1} failed after ${MAX_REPAIR_ATTEMPTS} attempts`;
            // Don't break - continue with other batches to get partial data
          }
        }

        // Build episode object
        // Only mark as error if NO scenes were generated - partial success is NOT an error
        const hasScenes = allScenes.length > 0;
        const effectiveError = hasScenes ? null : episodeError;
        
        const episode = {
          episode_number: epNum,
          title: episodeBeat?.title || `Episodio ${epNum}`,
          synopsis: synopsisFromClaude || episodeBeat?.summary || '',
          scenes: allScenes.sort((a, b) => a.scene_number - b.scene_number),
          total_dialogue_lines: allScenes.reduce((sum, s) => sum + (s.dialogue?.length || 0), 0),
          duration_min: Math.round(allScenes.reduce((sum, s) => sum + (s.duration_estimate_sec || 90), 0) / 60),
          error: effectiveError,
          // Track partial completion info for transparency
          batches_completed: completedBatches,
          batches_total: BATCHES_PER_EPISODE,
          partial_error: hasScenes && episodeError ? episodeError : null,
        };

        episodes.push(episode);
        setGeneratedEpisodesList([...episodes]);

        // V11.1: Incremental persistence - save after each episode to prevent data loss
        try {
          const partialScreenplay = {
            title: lightOutline.title,
            logline: lightOutline.logline,
            episodes: episodes.slice(), // Copy current episodes
            partial: true,
            last_saved_at: new Date().toISOString(),
            completed_episodes: episodes.length,
            total_episodes: totalEpisodes,
          };
          
          if (currentScriptId) {
            await supabase.from('scripts')
              .update({
                parsed_json: partialScreenplay as any,
                status: 'generating',
              })
              .eq('id', currentScriptId);
            console.log(`[ScriptImport] Incremental save: ${episodes.length}/${totalEpisodes} episodes (update)`);
          } else {
            const { data: inserted } = await supabase.from('scripts')
              .insert({
                project_id: projectId,
                parsed_json: partialScreenplay as any,
                status: 'generating',
                version: 1
              })
              .select()
              .single();
            
            if (inserted?.id) {
              setCurrentScriptId(inserted.id);
              console.log(`[ScriptImport] Incremental save: ${episodes.length}/${totalEpisodes} episodes (new: ${inserted.id})`);
            }
          }
        } catch (saveErr) {
          console.warn('[ScriptImport] Incremental save failed (non-blocking):', saveErr);
        }

        // Update localStorage state for background recovery
        // Use batch-based progress for accurate calculation
        const batchesDoneThisRun = completedBatches;
        const currentProgress = 10 + Math.round((batchesDoneThisRun / totalBatches) * 75);
        // Only save next episode if there are more to generate
        const nextEpisode = epNum < totalEpisodes ? epNum + 1 : totalEpisodes;
        savePipelineState({
          pipelineRunning: epNum < totalEpisodes, // Mark as not running if this was the last
          progress: currentProgress,
          currentEpisode: nextEpisode,
          totalEpisodes,
          episodes: [...episodes],
          outline: lightOutline,
          startedAt: loadPipelineState()?.startedAt || Date.now(),
          completedBatches: batchesDoneThisRun,
          totalBatches
        });

        if (!episodeError) {
          toast.success(`Episodio ${epNum} completado ✓ (${episode.scenes.length} escenas)`);
        }
      }

      setCurrentEpisodeGenerating(null);
      
      // Calculate actual counts from generated content
      const protagonistsCount = lightOutline.main_characters?.filter((c: any) => c.role === 'protagonist').length || 0;
      const supportingCount = lightOutline.main_characters?.filter((c: any) => c.role === 'supporting' || c.role === 'antagonist').length || 0;
      const locationsCount = lightOutline.main_locations?.length || 0;
      const totalScenes = episodes.reduce((sum, ep) => sum + (ep.scenes?.length || 0), 0);
      const totalDialogueLines = episodes.reduce((sum, ep) => sum + (ep.total_dialogue_lines || 0), 0);
      
      // ════════════════════════════════════════════════════════════════════════
      // V3.2 CRITICAL: Fail if 0 scenes were generated (don't silently succeed)
      // ════════════════════════════════════════════════════════════════════════
      if (totalScenes === 0) {
        const failReason = episodes.length > 0 && episodes[0].error 
          ? `Sin escenas generadas: ${episodes[0].error}` 
          : 'Sin escenas generadas. Revisa el outline y la Bible del proyecto.';
        
        console.error('[Pipeline] FAILURE: 0 scenes generated across all episodes', { 
          episodes: episodes.map(e => ({ ep: e.episode_number, scenes: e.scenes?.length, error: e.error }))
        });
        
        toast.error('Generación fallida: 0 escenas', {
          description: failReason,
          action: {
            label: 'Diagnóstico',
            onClick: () => {
              // Show diagnostic info
              console.log('[Diagnostic] Outline:', lightOutline);
              console.log('[Diagnostic] Episodes:', episodes);
              toast.info('Revisa la consola del navegador para más detalles de diagnóstico.');
            }
          },
          duration: 15000
        });
        
        updatePipelineStep('episodes', 'error');
        
        if (taskId) {
          failTask(taskId, failReason);
          setScriptTaskId(null);
        }
        
        // Don't proceed with dialogues/teasers/save - the generation failed
        return;
      }
      
      updatePipelineStep('episodes', 'success');

      // Build complete screenplay with density metrics
      const completeScreenplay: Record<string, any> = {
        title: lightOutline.title,
        logline: lightOutline.logline,
        synopsis: lightOutline.synopsis,
        genre: lightOutline.genre,
        tone: lightOutline.tone,
        narrative_mode: lightOutline.narrative_mode || narrativeMode,
        characters: lightOutline.main_characters,
        locations: lightOutline.main_locations,
        episodes,
        // Store density state and only save targets if density is enabled
        disable_density: disableDensity,
        ...(disableDensity ? {} : { density_targets: targets }),
        // Always store achieved values from real breakdown
        density_achieved: {
          protagonists: protagonistsCount,
          supporting: supportingCount,
          locations: locationsCount,
          total_scenes: totalScenes,
          scenes_per_episode: Math.round(totalScenes / episodes.length),
          dialogue_lines: totalDialogueLines,
        },
        counts: {
          total_scenes: totalScenes,
          total_dialogue_lines: totalDialogueLines,
          protagonists: protagonistsCount,
          supporting: supportingCount,
          locations: locationsCount,
        }
      };

      setGeneratedScript(completeScreenplay);
      setPipelineProgress(80);

      // Generate dialogues for all scenes that need them
      updatePipelineStep('dialogues', 'running', 'Generando diálogos completos...');
      try {
        // Process episodes in sequence to avoid rate limits
        let totalDialoguesGenerated = 0;
        for (let epIdx = 0; epIdx < episodes.length; epIdx++) {
          const ep = episodes[epIdx];
          if (!ep.scenes || ep.scenes.length === 0) continue;
          
          // Check which scenes need dialogue
          const scenesNeedingDialogue = ep.scenes.filter((s: any) => {
            const hasCharacters = s.characters && s.characters.length > 0;
            const hasDialogue = s.dialogue && s.dialogue.length > 0;
            return hasCharacters && !hasDialogue;
          });
          
          if (scenesNeedingDialogue.length === 0) {
            console.log(`[Pipeline] Episode ${ep.episode_number}: all scenes have dialogues`);
            continue;
          }
          
          console.log(`[Pipeline] Episode ${ep.episode_number}: generating dialogues for ${scenesNeedingDialogue.length} scenes`);
          updatePipelineStep('dialogues', 'running', `Diálogos episodio ${ep.episode_number}/${episodes.length}...`);
          
          // Extract character names from screenplay for dialogue generation
          const scriptCharacters = completeScreenplay.characters?.narrative_classification
            ? [
                ...(completeScreenplay.characters.narrative_classification.protagonists || []),
                ...(completeScreenplay.characters.narrative_classification.major_supporting || []),
                ...(completeScreenplay.characters.narrative_classification.minor_speaking || []),
              ].map((c: any) => c.name || c.canonical_name || '').filter(Boolean)
            : Array.isArray(completeScreenplay.characters?.cast)
              ? completeScreenplay.characters.cast.map((c: any) => c.name || c.canonical_name || '').filter(Boolean)
              : [];
          
          const { data: dialogueData, error: dialogueError } = await supabase.functions.invoke('generate-dialogues-batch', {
            body: {
              projectId,
              scenes: ep.scenes,
              projectCharacters: scriptCharacters,
              language,
              tone: completeScreenplay.tone || 'dramático',
              genre: completeScreenplay.genre || 'drama',
            }
          });
          
          if (dialogueError) {
            console.warn(`[Pipeline] Dialogue generation failed for episode ${ep.episode_number}:`, dialogueError);
            // Continue with other episodes, don't fail the whole pipeline
          } else if (dialogueData?.scenes) {
            // Update episode scenes with generated dialogues
            episodes[epIdx] = {
              ...ep,
              scenes: dialogueData.scenes,
              total_dialogue_lines: dialogueData.scenes.reduce((sum: number, s: any) => 
                sum + (s.dialogue?.length || 0), 0
              ),
            };
            totalDialoguesGenerated += dialogueData.generated_count || 0;
          }
          
          // Small delay between episodes to avoid rate limits
          if (epIdx < episodes.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        }
        
        // Update screenplay with enriched episodes
        completeScreenplay.episodes = episodes;
        completeScreenplay.counts.total_dialogue_lines = episodes.reduce(
          (sum, ep) => sum + (ep.total_dialogue_lines || 0), 0
        );

        // === V48: Aggregate dialogue metrics for Casting Report ===
        const { aggregateDialogueMetrics } = await import('@/lib/breakdown/hydrate');
        const { byCharacter, totalLines } = aggregateDialogueMetrics(episodes);

        // Build dialogues.by_character for CastingReportTable
        const dialoguesByCharacter: Record<string, { lines: number; words: number; scenes_count: number }> = {};
        for (const [name, data] of Object.entries(byCharacter)) {
          dialoguesByCharacter[name] = {
            lines: data.lines,
            words: data.words,
            scenes_count: data.scenes.size,
          };
        }

        // Enrich characters array with dialogue counts
        const baseChars = Array.isArray(completeScreenplay.characters)
          ? completeScreenplay.characters
          : completeScreenplay.characters?.cast || completeScreenplay.characters?.narrative_classification?.protagonists || [];
        
        const enrichedCharacters = baseChars.map((c: any) => {
          const nameKey = (c.name || c.canonical_name || '').toUpperCase().trim();
          const metrics = byCharacter[nameKey];
          return {
            ...c,
            dialogue_lines: metrics?.lines || 0,
            dialogue_words: metrics?.words || 0,
            scenes_count: metrics?.scenes.size || 0,
          };
        });

        // Store in expected format with dialogues map
        completeScreenplay.dialogues = {
          by_character: dialoguesByCharacter,
          total_lines: totalLines,
        };
        completeScreenplay.characters = { cast: enrichedCharacters };
        completeScreenplay.counts.total_dialogue_lines = totalLines;

        setGeneratedScript({ ...completeScreenplay });
        setGeneratedEpisodesList([...episodes]);
        
        if (totalDialoguesGenerated > 0) {
          updatePipelineStep('dialogues', 'success');
          toast.success(`${totalDialoguesGenerated} escenas con diálogos generados`);
        } else {
          updatePipelineStep('dialogues', 'success', 'Todas las escenas ya tenían diálogos');
        }
      } catch (dialogueErr) {
        console.error('Dialogue generation exception:', dialogueErr);
        updatePipelineStep('dialogues', 'error');
        toast.warning('Diálogos no generados completamente, continuando...');
      }

      setPipelineProgress(88);

      // Generate teasers (60s and 30s) - use invokeAuthedFunction to ensure fresh JWT
      updatePipelineStep('teasers', 'running', 'Generando teasers promocionales...');
      try {
        const { data: teaserData, error: teaserError } = await invokeAuthedFunction('generate-teasers', {
          projectId,
          screenplay: completeScreenplay,
          language
        });

        if (teaserError) {
          console.error('Teaser generation error:', teaserError);
          updatePipelineStep('teasers', 'error');
          toast.warning('Teasers no generados, continuando...');
        } else if (teaserData?.teasers) {
          setGeneratedTeasers(teaserData.teasers);
          // Add teasers to screenplay
          completeScreenplay.teasers = teaserData.teasers;
          updatePipelineStep('teasers', 'success');
          toast.success('Teasers generados (60s + 30s)');
        }
      } catch (teaserErr) {
        console.error('Teaser exception:', teaserErr);
        updatePipelineStep('teasers', 'error');
      }

      setPipelineProgress(95);

      // Save to DB
      updatePipelineStep('save', 'running');
      // CRITICAL: raw_text must be screenplay text, NOT JSON
      // parsed_json stores the structured data
      const { renderScreenplayFromScenes } = await import('@/lib/renderScreenplayText');
      const screenplayText = renderScreenplayFromScenes(completeScreenplay);

      let savedScript;
      let saveError;

      if (currentScriptId) {
        // Update existing script
        const result = await supabase.from('scripts')
          .update({
            raw_text: screenplayText,
            parsed_json: completeScreenplay as any,
            status: 'draft',
          })
          .eq('id', currentScriptId)
          .select()
          .single();
        savedScript = result.data;
        saveError = result.error;
      } else {
        // Insert new script
        const result = await supabase.from('scripts')
          .insert({
            project_id: projectId,
            raw_text: screenplayText,
            parsed_json: completeScreenplay as any,
            status: 'draft',
            version: 1
          })
          .select()
          .single();
        savedScript = result.data;
        saveError = result.error;
      }

      if (saveError) throw saveError;
      setCurrentScriptId(savedScript.id);
      setScriptText(screenplayText);
      
      // Also save teasers separately in generatedTeasers state for immediate UI update
      if (completeScreenplay.teasers) {
        setGeneratedTeasers(completeScreenplay.teasers);
      }

      updatePipelineStep('save', 'success');
      setPipelineProgress(100);

      const successCount = episodes.filter(ep => !ep.error).length;
      toast.success(`¡Guion generado! ${successCount}/${totalEpisodes} episodios completados.`);
      setActiveTab('summary');
      
      // V49: Complete background task
      if (taskId) {
        completeTask(taskId, { 
          episodesGenerated: successCount, 
          totalEpisodes,
          scenesCount: episodes.reduce((sum, ep) => sum + (ep.scenes?.length || 0), 0),
        });
        setScriptTaskId(null);
      }

    } catch (error: any) {
      console.error('Pipeline error:', error);
      
      // Show actionable error message based on error type
      const errorMsg = error?.message || 'Error en la generación';
      
      if (errorMsg.includes('PARSE_FAILED') || errorMsg.includes('Cannot coerce')) {
        toast.error('Error al procesar respuesta del AI', {
          description: 'El modelo no devolvió un guion válido. Intenta regenerar.',
          action: {
            label: 'Regenerar',
            onClick: () => approveAndGenerateEpisodes()
          },
          duration: 15000
        });
      } else if (errorMsg.includes('GATE_FAILED')) {
        // Already handled by DensityGateModal
      } else {
        toast.error(errorMsg);
      }
      
      updatePipelineStep('episodes', 'error');
      
      // V49: Fail background task
      if (taskId) {
        failTask(taskId, errorMsg);
        setScriptTaskId(null);
      }
    } finally {
      setPipelineRunning(false);
      setCurrentEpisodeGenerating(null);
      setEpisodeStartedAtMs(null);
      setCancelController(null);
      setBackgroundGeneration(false);
      setScriptStartTime(null); // V47: Reset timer
      clearPipelineState(); // Clear localStorage on completion
    }
  };

  // PIPELINE V2: Cancel generation
  const cancelGeneration = () => {
    if (cancelController) {
      cancelController.abort();
      setCancelController(null);
    }
    setPipelineRunning(false);
    setCurrentEpisodeGenerating(null);
    setEpisodeStartedAtMs(null);
    setBackgroundGeneration(false);
    setScriptStartTime(null); // V47: Reset timer
    clearPipelineState();
    
    // V49: Cancel background task
    if (scriptTaskId) {
      failTask(scriptTaskId, 'Cancelado por el usuario');
      setScriptTaskId(null);
    }
    
    toast.info('Generación cancelada. Los episodios ya generados se han conservado.');
  };

  const getEstimatedRemainingMs = () => {
    if (!pipelineRunning) return 0;

    const perBatchMs = estimateBatchMs(timingModel, complexity);
    const totalBatches = totalEpisodesToGenerate * 3;

    // Calculate completed batches from progress (10-85% = batches phase)
    const batchProgress = Math.max(0, pipelineProgress - 10);
    const completedBatches = Math.round((batchProgress / 75) * totalBatches);
    const remainingBatches = Math.max(0, totalBatches - completedBatches);

    const elapsedCurrent = episodeStartedAtMs ? Math.max(0, nowMs - episodeStartedAtMs) : 0;
    const remainingCurrent = Math.max(0, perBatchMs - elapsedCurrent);

    return remainingCurrent + (Math.max(0, remainingBatches - 1) * perBatchMs);
  };

  // Legacy pipeline (keeping for compatibility)
  const runFullPipeline = async () => {
    // Redirect to new V2 flow
    generateOutlineDirect();
  };

  // Script Doctor
  const analyzeWithDoctor = async (focusAreas?: string[]) => {
    const textToAnalyze = generatedScript ? JSON.stringify(generatedScript) : scriptText;
    if (!textToAnalyze || textToAnalyze.length < 200) {
      toast.error('El guion debe tener contenido suficiente');
      return;
    }
    
    setAnalyzing(true);
    try {
      const { data, error } = await supabase.functions.invoke('script-doctor', {
        body: { scriptText: textToAnalyze, language, focusAreas }
      });
      if (error) throw error;
      if (data?.analysis) {
        setDoctorScore(data.analysis.overall_assessment?.score || null);
        const suggestions = data.analysis.suggestions || [];
        setDoctorSuggestions(suggestions);
        // Pre-select critical and high severity by default
        const preSelected = new Set<number>();
        suggestions.forEach((s: any, i: number) => {
          if (s.severity === 'critical' || s.severity === 'high') {
            preSelected.add(i);
          }
        });
        setSelectedSuggestions(preSelected);
        toast.success(`Análisis completado: ${suggestions.length} sugerencias`);
      }
    } catch (err: any) {
      console.error('Error analyzing script:', err);
      toast.error('Error al analizar guion');
    }
    setAnalyzing(false);
  };

  // Apply Doctor Suggestions - MERGE with existing script to preserve episodes/scenes
  const applyDoctorSuggestions = async () => {
    if (!generatedScript || selectedSuggestions.size === 0) {
      toast.error('Selecciona al menos una sugerencia para aplicar');
      return;
    }

    setApplyingDoctor(true);
    try {
      // Build rewrite instructions from SELECTED suggestions only
      const rewriteInstructions = doctorSuggestions
        .filter((_, i) => selectedSuggestions.has(i))
        .map(s => `- [${s.category}] ${s.issue}: ${s.suggestion}${s.rewrite_snippet ? ` (Ejemplo: "${s.rewrite_snippet}")` : ''}`)
        .join('\n');

      const { data, error } = await supabase.functions.invoke('script-rewrite-outline', {
        body: {
          outline: generatedScript,
          rewriteInstructions: `Aplica las siguientes mejoras del Script Doctor:\n\n${rewriteInstructions}`,
          targets: targets || {}
        }
      });

      if (error) throw error;

      if (data?.outline) {
        // CRITICAL: Merge the improved outline with existing full screenplay
        // The rewrite only returns outline-level data, not full episodes with scenes
        const mergedScript = {
          ...generatedScript, // Keep all existing data (episodes, scenes, dialogue)
          // Override only the outline-level improvements
          title: data.outline.title || generatedScript.title,
          genre: data.outline.genre || generatedScript.genre,
          tone: data.outline.tone || generatedScript.tone,
          themes: data.outline.themes || generatedScript.themes,
          premise: data.outline.premise || generatedScript.premise,
          logline: data.outline.logline || generatedScript.logline,
          synopsis: data.outline.synopsis || generatedScript.synopsis,
          // Update characters if improved (but keep existing if more detailed)
          characters: data.outline.main_characters?.length > 0 
            ? data.outline.main_characters 
            : generatedScript.characters,
          // Update locations if improved
          locations: data.outline.main_locations?.length > 0
            ? data.outline.main_locations
            : generatedScript.locations,
          // Update episode titles/summaries but PRESERVE scenes
          episodes: generatedScript.episodes?.map((ep: any, idx: number) => ({
            ...ep, // Keep all existing scene data
            title: data.outline.episode_beats?.[idx]?.title || ep.title,
            synopsis: data.outline.episode_beats?.[idx]?.summary || ep.synopsis,
          })) || generatedScript.episodes,
          // Keep existing counts (they're based on actual generated content)
          counts: generatedScript.counts,
        };
        
        setGeneratedScript(mergedScript);
        
        // Save the improved script
        if (currentScriptId) {
          await supabase.from('scripts').update({
            parsed_json: mergedScript,
            updated_at: new Date().toISOString()
          }).eq('id', currentScriptId);
        }

        toast.success(`${selectedSuggestions.size} sugerencias aplicadas - Episodios y escenas preservados`);
        // Remove applied suggestions from list
        const remainingSuggestions = doctorSuggestions.filter((_, i) => !selectedSuggestions.has(i));
        setDoctorSuggestions(remainingSuggestions);
        setSelectedSuggestions(new Set());
        if (remainingSuggestions.length === 0) {
          setDoctorScore(null);
          setActiveTab('summary');
        }
      }
    } catch (err: any) {
      console.error('Error applying doctor suggestions:', err);
      toast.error('Error al aplicar sugerencias');
    } finally {
      setApplyingDoctor(false);
    }
  };

  // Freeze script
  const freezeScript = async () => {
    if (!currentScriptId) {
      toast.error('Primero genera o guarda un guion');
      return;
    }

    try {
      const { error } = await supabase.functions.invoke('script-freeze', {
        body: { scriptId: currentScriptId, projectId }
      });
      if (error) throw error;
      setScriptLocked(true);
      toast.success('Guion congelado correctamente');
    } catch (err: any) {
      console.error('Error freezing script:', err);
      toast.error('Error al congelar guion');
    }
  };

  const unlockScript = async () => {
    if (!currentScriptId) return;
    
    const { error } = await supabase.from('scripts').update({ status: 'draft' }).eq('id', currentScriptId);
    if (error) {
      toast.error('Error al desbloquear');
      return;
    }
    setScriptLocked(false);
    toast.success('Guion desbloqueado');
  };

  // Generate missing dialogues for episodes that need them
  const generateMissingDialogues = async () => {
    const episodes = generatedScript?.episodes || [];
    if (episodes.length === 0) return;
    
    // Check which episodes need dialogues - any scene without dialogue array needs generation
    const episodesNeedingDialogue = episodes.filter((ep: any) => 
      ep.scenes?.some((s: any) => {
        // Check dialogue exists and has content - don't depend on characters field
        const hasDialogue = s.dialogue && Array.isArray(s.dialogue) && s.dialogue.length > 0;
        return !hasDialogue; // Any scene without dialogue needs generation
      })
    );
    
    if (episodesNeedingDialogue.length === 0) {
      toast.info('Todas las escenas ya tienen diálogos');
      return;
    }
    
    setGeneratingDialogues(true);
    const totalEpisodes = episodesNeedingDialogue.length;
    
    try {
      let updatedEpisodes = [...episodes];
      
      for (let i = 0; i < episodesNeedingDialogue.length; i++) {
        const episode = episodesNeedingDialogue[i];
        const epIdx = episodes.findIndex((ep: any) => ep.episode_number === episode.episode_number);
        
        setDialogueProgress({
          current: i + 1,
          total: totalEpisodes,
          phase: `Ep ${episode.episode_number} (${i + 1}/${totalEpisodes})...`
        });
        
        // Extract character names from generated script for dialogue generation
        const scriptCharacters = generatedScript?.characters?.narrative_classification
          ? [
              ...(generatedScript.characters.narrative_classification.protagonists || []),
              ...(generatedScript.characters.narrative_classification.major_supporting || []),
              ...(generatedScript.characters.narrative_classification.minor_speaking || []),
            ].map((c: any) => c.name || c.canonical_name || '').filter(Boolean)
          : Array.isArray(generatedScript?.characters?.cast)
            ? generatedScript.characters.cast.map((c: any) => c.name || c.canonical_name || '').filter(Boolean)
            : [];
        
        const { data, error } = await supabase.functions.invoke('generate-dialogues-batch', {
          body: {
            projectId,
            scenes: episode.scenes,
            projectCharacters: scriptCharacters,
            language,
            tone: generatedScript?.tone || 'dramático',
            genre: generatedScript?.genre || 'drama',
          }
        });
        
        if (error) {
          console.error(`Error generando diálogos episodio ${episode.episode_number}:`, error);
          toast.error(`Error en episodio ${episode.episode_number}`);
        } else if (data?.scenes) {
          // Update episode with new dialogues
          updatedEpisodes[epIdx] = {
            ...updatedEpisodes[epIdx],
            scenes: data.scenes,
            total_dialogue_lines: data.scenes.reduce((sum: number, s: any) => 
              sum + (s.dialogue?.length || 0), 0
            ),
          };
        }
        
        // Small delay to avoid rate limits
        if (i < episodesNeedingDialogue.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
      
      // Update generatedScript state
      const updatedScript = {
        ...generatedScript,
        episodes: updatedEpisodes,
        counts: {
          ...generatedScript?.counts,
          total_dialogue_lines: updatedEpisodes.reduce(
            (sum: number, ep: any) => sum + (ep.total_dialogue_lines || 0), 0
          ),
        },
      };
      setGeneratedScript(updatedScript);
      
      // Save to database
      if (currentScriptId) {
        const { error: saveError } = await supabase
          .from('scripts')
          .update({ parsed_json: updatedScript })
          .eq('id', currentScriptId);
          
        if (saveError) {
          console.error('Error saving dialogues:', saveError);
          toast.warning('Diálogos generados pero hubo un error al guardar');
        } else {
          toast.success('¡Diálogos generados correctamente!');
        }
      } else {
        toast.success('¡Diálogos generados!');
      }
      
    } catch (err) {
      console.error('Error generating dialogues:', err);
      toast.error('Error al generar diálogos');
    } finally {
      setGeneratingDialogues(false);
      setDialogueProgress({ current: 0, total: 0, phase: '' });
    }
  };

  // Delete current script
  const deleteCurrentScript = async () => {
    if (!currentScriptId) {
      toast.error('No hay guion para eliminar');
      return;
    }

    const confirm = window.confirm(
      '¿Estás seguro de que deseas eliminar este guion? Esta acción no se puede deshacer.'
    );
    if (!confirm) return;

    setDeletingScript(true);
    try {
      const { error } = await supabase
        .from('scripts')
        .delete()
        .eq('id', currentScriptId);

      if (error) throw error;

      // Clear local state
      setCurrentScriptId(null);
      setGeneratedScript(null);
      setScriptText('');
      setScriptLocked(false);
      setLightOutline(null);
      setOutlineApproved(false);
      setActiveTab('generate');
      
      // Reload history
      await loadScriptHistory();
      
      toast.success('Guion eliminado correctamente');
    } catch (err: any) {
      console.error('Error deleting script:', err);
      toast.error('Error al eliminar guion');
    } finally {
      setDeletingScript(false);
    }
  };

  // Load script history
  const loadScriptHistory = async () => {
    setLoadingHistory(true);
    try {
      const { data, error } = await supabase
        .from('scripts')
        .select('id, status, raw_text, parsed_json, created_at')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setScriptHistory(data || []);
    } catch (err: any) {
      console.error('Error loading script history:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  // Restore script from history
  const restoreScriptFromHistory = async (script: any) => {
    const confirm = window.confirm(
      `¿Restaurar el guion del ${new Date(script.created_at).toLocaleString()}? El guion actual será reemplazado.`
    );
    if (!confirm) return;

    setCurrentScriptId(script.id);
    setScriptLocked(script.status === 'locked');
    if (script.raw_text) setScriptText(script.raw_text);
    if (script.parsed_json && typeof script.parsed_json === 'object') {
      const parsed = script.parsed_json as Record<string, unknown>;
      if (parsed.episodes || parsed.screenplay || parsed.title) {
        // V48: Recalculate dialogue metrics if missing (legacy scripts)
        const hasDialoguesMap = parsed.dialogues && typeof parsed.dialogues === 'object' && 
          (parsed.dialogues as any).by_character && 
          Object.keys((parsed.dialogues as any).by_character).length > 0;
        
        if (Array.isArray(parsed.episodes) && parsed.episodes.length > 0 && !hasDialoguesMap) {
          const { aggregateDialogueMetrics } = await import('@/lib/breakdown/hydrate');
          const { byCharacter, totalLines } = aggregateDialogueMetrics(parsed.episodes as any[]);
          
          const dialoguesByCharacter: Record<string, any> = {};
          for (const [name, data] of Object.entries(byCharacter)) {
            dialoguesByCharacter[name] = { lines: data.lines, words: data.words, scenes_count: data.scenes.size };
          }
          parsed.dialogues = { by_character: dialoguesByCharacter, total_lines: totalLines };
          
          // V48: Enrich characters array with dialogue metrics
          const rawChars = Array.isArray(parsed.characters) 
            ? parsed.characters 
            : (parsed.characters as any)?.cast || [];
          
          if (rawChars.length > 0) {
            const enrichedCharacters = rawChars.map((c: any) => {
              const nameKey = (c.name || c.canonical_name || '').toUpperCase().trim();
              const metrics = byCharacter[nameKey];
              return {
                ...c,
                dialogue_lines: metrics?.lines || 0,
                dialogue_words: metrics?.words || 0,
                scenes_count: metrics?.scenes?.size || 0,
              };
            });
            parsed.characters = { cast: enrichedCharacters };
          }
        }
        setGeneratedScript(parsed);
        setActiveTab('summary');
      }
    }
    toast.success('Guion restaurado');
  };

  // Load history when switching to history tab
  useEffect(() => {
    if (activeTab === 'history') {
      loadScriptHistory();
    }
  }, [activeTab]);

  // Export PDF - Professional Screenplay Format
  const exportCompletePDF = () => {
    if (!generatedScript) return;
    try {
      exportScreenplayPDF(generatedScript);
      toast.success('Guion exportado en formato profesional');
    } catch (err) {
      console.error('Error exporting PDF:', err);
      toast.error('Error al exportar PDF');
    }
  };

  // Export single episode - Professional Format
  const exportEpisodePDF = (episode: any, epIdx: number) => {
    if (!generatedScript) return;
    try {
      exportEpisodeScreenplayPDF(generatedScript, epIdx);
      toast.success(`Episodio ${epIdx + 1} exportado en formato profesional`);
    } catch (err) {
      console.error('Error exporting episode PDF:', err);
      toast.error('Error al exportar episodio');
    }
  };

  // Segment scenes from script into database
  const segmentScenesFromEpisode = async (episode: any, episodeNumber: number) => {
    if (!episode?.scenes?.length) {
      toast.error('Este episodio no tiene escenas');
      return;
    }

    // V11.2: Check for degraded/placeholder scenes before segmentation
    const hasDegradedScenes = episode.scenes.every((s: any) => 
      s.slugline === 'INT. UBICACIÓN - DÍA' || 
      s.action_summary === 'Por generar' ||
      !s.action_summary
    );
    
    if (hasDegradedScenes) {
      toast.error('Este episodio tiene escenas placeholder. Regenera el episodio primero.');
      return;
    }

    setSegmenting(true);
    try {
      // Check if scenes already exist for this episode
      const { data: existingScenes } = await supabase
        .from('scenes')
        .select('id')
        .eq('project_id', projectId)
        .eq('episode_no', episodeNumber)
        .limit(1);

      if (existingScenes && existingScenes.length > 0) {
        const confirm = window.confirm(
          `Ya existen escenas para el Episodio ${episodeNumber}. ¿Deseas reemplazarlas?`
        );
        if (!confirm) {
          setSegmenting(false);
          return;
        }
        // Delete existing scenes for this episode
        await supabase
          .from('scenes')
          .delete()
          .eq('project_id', projectId)
          .eq('episode_no', episodeNumber);
      }

      // V11.1: Create scenes from the script data
      // Always use array index for scene_no to guarantee uniqueness
      // (scene.scene_number from script can be duplicated or incorrect)
      const scenesToInsert = episode.scenes.map((scene: any, idx: number) => ({
        project_id: projectId,
        episode_no: episodeNumber,
        scene_no: idx + 1,
        slugline: scene.slugline || `ESCENA ${idx + 1}`,
        summary: scene.summary || scene.action || null,
        time_of_day: extractTimeOfDay(scene.slugline),
        quality_mode: 'CINE',
        parsed_json: {
          dialogue: scene.dialogue || [],
          action: scene.action || '',
          music_cue: scene.music_cue || null,
          sfx_cue: scene.sfx_cue || null,
          mood: scene.mood || null,
          characters: scene.characters || [],
          vfx: scene.vfx || []
        }
      }));

      // V11.2: Diagnostic logging for scene insertion
      console.log(`[segmentScenes] Inserting ${scenesToInsert.length} scenes for Episode ${episodeNumber}:`,
        scenesToInsert.map((s: any) => ({ scene_no: s.scene_no, slugline: s.slugline }))
      );

      const { data: insertedScenes, error } = await supabase
        .from('scenes')
        .insert(scenesToInsert)
        .select();

      if (error) {
        console.error('[segmentScenes] Insert error:', error);
        throw error;
      }

      console.log(`[segmentScenes] Successfully inserted ${insertedScenes?.length} scenes`);

      // Generate shots automatically from dialogue and action
      if (insertedScenes && insertedScenes.length > 0) {
        let totalShotsCreated = 0;
        
        for (let i = 0; i < insertedScenes.length; i++) {
          const insertedScene = insertedScenes[i];
          const originalScene = episode.scenes[i];
          const shotsToInsert: any[] = [];
          const sceneNo = originalScene.scene_number || (i + 1);
          const shotLetters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
          let shotIndex = 0;
          
          // Create establishing shot
          const estLetter = shotLetters[shotIndex++] || String(shotIndex);
          shotsToInsert.push({
            scene_id: insertedScene.id,
            shot_no: 1,
            name: `${sceneNo}${estLetter} - Establishing Wide`,
            shot_type: 'wide',
            duration_target: 4,
            hero: false,
            effective_mode: 'CINE',
            dialogue_text: null,
            coverage_type: 'Master',
            story_purpose: 'establish_geography',
            transition_in: 'CUT',
            transition_out: 'hard_cut'
          });
          
          // Create shots from dialogue
          const dialogues = originalScene.dialogue || [];
          dialogues.forEach((d: any, dIdx: number) => {
            const letter = shotLetters[shotIndex++] || String(shotIndex);
            const charName = d.character || 'Character';
            const isOTS = dIdx % 2 !== 0;
            const shotTypeName = isOTS ? 'OTS' : 'CU';
            shotsToInsert.push({
              scene_id: insertedScene.id,
              shot_no: dIdx + 2,
              name: `${sceneNo}${letter} - ${charName} ${shotTypeName}`,
              shot_type: isOTS ? 'medium' : 'closeup',
              duration_target: Math.min(Math.max(3, Math.ceil((d.line?.length || 20) / 25)), 8),
              hero: false,
              effective_mode: 'CINE',
              dialogue_text: d.line || null,
              coverage_type: isOTS ? 'OTS' : 'Single',
              story_purpose: 'dialogue_focus',
              transition_in: 'CUT',
              transition_out: 'hard_cut',
              blocking: {
                subject_positions: charName,
                action: d.parenthetical || 'Speaking'
              }
            });
          });
          
          // Add action shot if there's action text
          if (originalScene.action && dialogues.length > 0) {
            const letter = shotLetters[shotIndex++] || String(shotIndex);
            shotsToInsert.push({
              scene_id: insertedScene.id,
              shot_no: shotsToInsert.length + 1,
              name: `${sceneNo}${letter} - Action`,
              shot_type: 'medium',
              duration_target: 3,
              hero: false,
              effective_mode: 'CINE',
              dialogue_text: null,
              coverage_type: 'Master',
              story_purpose: 'reveal_information',
              transition_in: 'CUT',
              transition_out: 'hard_cut',
              blocking: {
                action: originalScene.action.substring(0, 200)
              }
            });
          }
          
          // Insert shots for this scene
          if (shotsToInsert.length > 0) {
            const { error: shotError } = await supabase
              .from('shots')
              .insert(shotsToInsert);
            
            if (!shotError) {
              totalShotsCreated += shotsToInsert.length;
            }
          }
        }
        
        toast.success(`${insertedScenes.length} escenas con ${totalShotsCreated} planos creados para Episodio ${episodeNumber}`);
      } else {
        toast.success(`${scenesToInsert.length} escenas creadas para Episodio ${episodeNumber}`);
      }

      setSegmentedEpisodes(prev => new Set([...prev, episodeNumber]));
      
      if (onScenesCreated) {
        onScenesCreated();
      }
    } catch (err: any) {
      console.error('Error segmenting scenes:', err);
      toast.error('Error al segmentar escenas: ' + (err.message || 'Error desconocido'));
    } finally {
      setSegmenting(false);
    }
  };

  // Segment ALL episodes at once
  const segmentAllEpisodes = async () => {
    if (!generatedScript) return;
    
    const episodes = generatedScript.episodes || [{ scenes: generatedScript.scenes }];
    const confirm = window.confirm(
      `¿Segmentar ${episodes.length} episodio(s) en escenas con planos?\n\nEsto creará las escenas Y los planos automáticamente basados en los diálogos.`
    );
    if (!confirm) return;

    setSegmenting(true);
    let totalScenes = 0;
    let totalShots = 0;

    try {
      for (let i = 0; i < episodes.length; i++) {
        const ep = episodes[i];
        const episodeNumber = ep.episode_number || i + 1;
        
        if (ep.scenes?.length) {
          // Delete existing scenes for this episode
          await supabase
            .from('scenes')
            .delete()
            .eq('project_id', projectId)
            .eq('episode_no', episodeNumber);

          // Create scenes from the script data
          const scenesToInsert = ep.scenes.map((scene: any, idx: number) => ({
            project_id: projectId,
            episode_no: episodeNumber,
            scene_no: scene.scene_number || idx + 1,
            slugline: scene.slugline || `ESCENA ${idx + 1}`,
            summary: scene.summary || scene.action || null,
            time_of_day: extractTimeOfDay(scene.slugline),
            quality_mode: 'CINE',
            parsed_json: {
              dialogue: scene.dialogue || [],
              action: scene.action || '',
              music_cue: scene.music_cue || null,
              sfx_cue: scene.sfx_cue || null,
              mood: scene.mood || null,
              characters: scene.characters || [],
              vfx: scene.vfx || []
            }
          }));

          const { data: insertedScenes, error } = await supabase
            .from('scenes')
            .insert(scenesToInsert)
            .select();

          if (error) throw error;
          totalScenes += insertedScenes?.length || 0;
          
          // Generate shots for each scene
          if (insertedScenes && insertedScenes.length > 0) {
            for (let j = 0; j < insertedScenes.length; j++) {
              const insertedScene = insertedScenes[j];
              const originalScene = ep.scenes[j];
              const shotsToInsert: any[] = [];
              
              // Establishing shot
              shotsToInsert.push({
                scene_id: insertedScene.id,
                shot_no: 1,
                shot_type: 'wide',
                duration_target: 4,
                hero: false,
                effective_mode: 'CINE',
                dialogue_text: null,
                coverage_type: 'Master',
                story_purpose: 'establish_geography',
                transition_in: 'CUT',
                transition_out: 'hard_cut'
              });
              
              // Shots from dialogue
              const dialogues = originalScene.dialogue || [];
              dialogues.forEach((d: any, dIdx: number) => {
                shotsToInsert.push({
                  scene_id: insertedScene.id,
                  shot_no: dIdx + 2,
                  shot_type: dIdx % 2 === 0 ? 'medium' : 'closeup',
                  duration_target: Math.min(Math.max(3, Math.ceil((d.line?.length || 20) / 25)), 8),
                  hero: false,
                  effective_mode: 'CINE',
                  dialogue_text: d.line || null,
                  coverage_type: dIdx % 2 === 0 ? 'Single' : 'OTS',
                  story_purpose: 'dialogue_focus',
                  transition_in: 'CUT',
                  transition_out: 'hard_cut',
                  blocking: {
                    subject_positions: d.character || 'Character in frame',
                    action: d.parenthetical || 'Speaking'
                  }
                });
              });
              
              // Action shot
              if (originalScene.action && dialogues.length > 0) {
                shotsToInsert.push({
                  scene_id: insertedScene.id,
                  shot_no: shotsToInsert.length + 1,
                  shot_type: 'medium',
                  duration_target: 3,
                  hero: false,
                  effective_mode: 'CINE',
                  dialogue_text: null,
                  coverage_type: 'Master',
                  story_purpose: 'reveal_information',
                  transition_in: 'CUT',
                  transition_out: 'hard_cut',
                  blocking: { action: originalScene.action.substring(0, 200) }
                });
              }
              
              if (shotsToInsert.length > 0) {
                const { error: shotError } = await supabase.from('shots').insert(shotsToInsert);
                if (!shotError) totalShots += shotsToInsert.length;
              }
            }
          }
          
          setSegmentedEpisodes(prev => new Set([...prev, episodeNumber]));
        }
      }

      toast.success(`${totalScenes} escenas con ${totalShots} planos creados en ${episodes.length} episodio(s)`);
      
      if (onScenesCreated) {
        onScenesCreated();
      }
    } catch (err: any) {
      console.error('Error segmenting all episodes:', err);
      toast.error('Error al segmentar escenas');
    } finally {
      setSegmenting(false);
    }
  };

  // Sync dialogues from script breakdown to episode scenes
  const syncDialoguesFromScript = async () => {
    if (!breakdownPro || !generatedScript) {
      toast.error('No hay datos de breakdown para sincronizar');
      return;
    }
    
    setSyncingFromScript(true);
    try {
      // Get scenes from breakdown (scripts.parsed_json)
      const breakdownScenes = breakdownPro.scenes || hydrateScenes(breakdownPro) || [];
      
      if (breakdownScenes.length === 0) {
        toast.error('El breakdown no contiene escenas con diálogos');
        setSyncingFromScript(false);
        return;
      }
      
      // Extract dialogues from raw script text for each scene
      const rawText = scriptText || '';
      
      // Helper to extract dialogues from a scene block
      const extractDialoguesFromBlock = (sceneText: string): { character: string; line: string; parenthetical?: string }[] => {
        const dialogues: { character: string; line: string; parenthetical?: string }[] = [];
        const lines = sceneText.split('\n');
        let currentSpeaker: string | null = null;
        let currentParenthetical: string | null = null;
        
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          
          // Skip empty lines
          if (!line) {
            currentSpeaker = null;
            currentParenthetical = null;
            continue;
          }
          
          // Character cue detection: ALL CAPS name, not a slugline, < 40 chars
          const isSlugline = /^(INT\.|EXT\.|INT\/EXT\.|I\/E\.)/i.test(line);
          const isAllCaps = /^[A-ZÁÉÍÓÚÑÜ][A-ZÁÉÍÓÚÑÜ\s.'\-]+$/.test(line);
          
          if (!isSlugline && isAllCaps && line.length < 40 && line.length > 1) {
            // This is a character cue
            currentSpeaker = line.replace(/\s*\(.*?\)\s*$/, '').trim();
            // Check for parenthetical in same line
            const parenMatch = line.match(/\((.*?)\)$/);
            currentParenthetical = parenMatch ? parenMatch[1] : null;
          } else if (currentSpeaker && line && !isSlugline) {
            // Check if this line is a parenthetical
            if (/^\(.*\)$/.test(line)) {
              currentParenthetical = line.replace(/^\(|\)$/g, '');
            } else {
              // This is a dialogue line
              dialogues.push({
                character: currentSpeaker,
                line: line,
                parenthetical: currentParenthetical || undefined
              });
              currentParenthetical = null;
            }
          }
        }
        
        return dialogues;
      };
      
      // Match breakdown scenes with episode scenes and sync dialogues
      const updatedEpisodes = [...(generatedScript.episodes || [generatedScript])];
      let syncedCount = 0;
      
      for (let epIdx = 0; epIdx < updatedEpisodes.length; epIdx++) {
        const ep = updatedEpisodes[epIdx];
        if (!ep.scenes) continue;
        
        for (let scIdx = 0; scIdx < ep.scenes.length; scIdx++) {
          const scene = ep.scenes[scIdx];
          const sceneSlugline = (scene.slugline || scene.heading || getSceneSlugline(scene) || '').toUpperCase();
          
          // Find matching scene in breakdown by slugline or scene number
          const matchingBreakdown = breakdownScenes.find((bs: any) => {
            const bsSlugline = (bs.heading || bs.slugline || bs.location_raw || '').toUpperCase();
            return bsSlugline && sceneSlugline && (
              bsSlugline.includes(sceneSlugline.substring(0, 20)) || 
              sceneSlugline.includes(bsSlugline.substring(0, 20)) ||
              bs.scene_number === scene.scene_number
            );
          });
          
          if (matchingBreakdown) {
            // Get dialogues from breakdown or extract from raw text
            let dialogues = matchingBreakdown.dialogue || matchingBreakdown.dialogues || [];
            
            // If no pre-parsed dialogues, try to extract from raw text
            if (dialogues.length === 0 && rawText && matchingBreakdown.heading) {
              const sceneStart = rawText.indexOf(matchingBreakdown.heading);
              if (sceneStart >= 0) {
                // Find the end of this scene (next slugline)
                const textAfter = rawText.slice(sceneStart + matchingBreakdown.heading.length);
                const nextSceneMatch = textAfter.match(/\n\s*(INT\.|EXT\.)/i);
                const sceneEnd = nextSceneMatch 
                  ? sceneStart + matchingBreakdown.heading.length + (nextSceneMatch.index || 0)
                  : rawText.length;
                
                const sceneBlock = rawText.slice(sceneStart, sceneEnd);
                dialogues = extractDialoguesFromBlock(sceneBlock);
              }
            }
            
            if (dialogues.length > 0) {
              ep.scenes[scIdx] = {
                ...scene,
                dialogue: dialogues,
                characters_present: matchingBreakdown.characters_present || matchingBreakdown.characters || scene.characters_present,
                parsed_json: {
                  ...(scene.parsed_json || {}),
                  dialogue: dialogues,
                  synced_from_breakdown: true
                }
              };
              syncedCount++;
            }
          }
        }
      }
      
      // Update generatedScript state
      if (syncedCount > 0) {
        setGeneratedScript({
          ...generatedScript,
          episodes: updatedEpisodes
        });
        toast.success(`${syncedCount} escenas sincronizadas con diálogos del guión`);
      } else {
        toast.info('No se encontraron diálogos para sincronizar. Puede que el guión sea solo un outline.');
      }
    } catch (err: any) {
      console.error('Error syncing dialogues:', err);
      toast.error('Error al sincronizar diálogos');
    } finally {
      setSyncingFromScript(false);
    }
  };

  // Helper: Extract time of day from slugline
  const extractTimeOfDay = (slugline: string): string => {
    if (!slugline) return 'day';
    const lower = slugline.toLowerCase();
    if (lower.includes('noche') || lower.includes('night')) return 'night';
    if (lower.includes('atardecer') || lower.includes('dusk') || lower.includes('sunset')) return 'dusk';
    if (lower.includes('amanecer') || lower.includes('dawn') || lower.includes('sunrise')) return 'dawn';
    return 'day';
  };

  // Toggle entity selection
  const toggleCharacter = (idx: number) => {
    setSelectedCharacters(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const toggleLocation = (idx: number) => {
    setSelectedLocations(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const toggleProp = (idx: number) => {
    setSelectedProps(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const selectAllCharacters = () => {
    if (!generatedScript?.characters) return;
    if (selectedCharacters.size === generatedScript.characters.length) {
      setSelectedCharacters(new Set());
    } else {
      setSelectedCharacters(new Set(generatedScript.characters.map((_: any, i: number) => i)));
    }
  };

  const selectAllLocations = () => {
    if (!generatedScript?.locations) return;
    if (selectedLocations.size === generatedScript.locations.length) {
      setSelectedLocations(new Set());
    } else {
      setSelectedLocations(new Set(generatedScript.locations.map((_: any, i: number) => i)));
    }
  };

  const selectAllProps = () => {
    if (!generatedScript?.props) return;
    if (selectedProps.size === generatedScript.props.length) {
      setSelectedProps(new Set());
    } else {
      setSelectedProps(new Set(generatedScript.props.map((_: any, i: number) => i)));
    }
  };

  // Import selected entities to Bible
  const importEntitiesToBible = async () => {
    if (selectedCharacters.size === 0 && selectedLocations.size === 0 && selectedProps.size === 0) {
      toast.error('Selecciona al menos una entidad para importar');
      return;
    }

    setImporting(true);
    try {
      // Import characters
      if (selectedCharacters.size > 0 && generatedScript?.characters) {
        const charsToImport = generatedScript.characters.filter((_: any, i: number) => selectedCharacters.has(i));
        for (const char of charsToImport) {
          const { error } = await supabase.from('characters').insert({
            project_id: projectId,
            name: char.name,
            role: char.role || 'supporting',
            bio: char.description || char.bio || '',
            arc: char.arc || '',
          });
          if (error) throw error;
        }
      }

      // Import locations
      if (selectedLocations.size > 0 && generatedScript?.locations) {
        const locsToImport = generatedScript.locations.filter((_: any, i: number) => selectedLocations.has(i));
        for (const loc of locsToImport) {
          const { error } = await supabase.from('locations').insert({
            project_id: projectId,
            name: typeof loc === 'string' ? loc : (loc.name ?? loc.base_name ?? loc.location_name ?? 'UNKNOWN'),
            description: typeof loc === 'object' ? (loc.description || loc.int_ext || '') : '',
          });
          if (error) throw error;
        }
      }

      // Import props
      if (selectedProps.size > 0 && generatedScript?.props) {
        const propsToImport = generatedScript.props.filter((_: any, i: number) => selectedProps.has(i));
        for (const prop of propsToImport) {
          const { error } = await supabase.from('props').insert({
            project_id: projectId,
            name: typeof prop === 'string' ? prop : prop.name,
            description: typeof prop === 'object' ? (prop.description || '') : '',
          });
          if (error) throw error;
        }
      }
      toast.success(`Importados: ${selectedCharacters.size} personajes, ${selectedLocations.size} localizaciones, ${selectedProps.size} props`);
      
      // Clear selections
      setSelectedCharacters(new Set());
      setSelectedLocations(new Set());
      setSelectedProps(new Set());
    } catch (err: any) {
      console.error('Error importing entities:', err);
      toast.error('Error al importar entidades');
    } finally {
      setImporting(false);
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'blocker': return 'bg-red-500/20 text-red-600 border-red-500/30';
      case 'critical': return 'bg-orange-500/20 text-orange-600 border-orange-500/30';
      case 'warning': return 'bg-yellow-500/20 text-yellow-600 border-yellow-500/30';
      default: return 'bg-blue-500/20 text-blue-600 border-blue-500/30';
    }
  };

  // Hollywood workflow step computation
  const workflowStep = (() => {
    if (!generatedScript && !lightOutline) return 'idea'; // Step 1: Write/Import
    if (lightOutline && !outlineApproved) return 'review'; // Step 2: Review outline (Outline)
    
    // Check if dialogues are missing
    const hasEpisodes = generatedScript?.episodes?.length > 0;
    const needsDialogues = hasEpisodes && generatedScript.episodes.some((ep: any) =>
      ep.scenes?.some((s: any) => !s.dialogue || s.dialogue.length === 0)
    );
    if (needsDialogues) return 'script'; // Step 3: Script generated (needs dialogues)
    
    if (hasEpisodes) return 'production'; // Step 4: Ready for production
    return 'idea';
  })();
  
  const workflowSteps = [
    { id: 'idea', label: 'Guion', description: 'Genera o importa tu guion' },
    { id: 'review', label: 'Outline', description: 'Revisa y aprueba la estructura' },
    { id: 'script', label: 'Guion generado', description: 'Episodios y diálogos completos' },
    { id: 'production', label: 'Producción', description: 'Generar shots y microshots' },
  ];
  
  const currentStepIndex = workflowSteps.findIndex(s => s.id === workflowStep);

  // Check if script is complete (has dialogues)
  const isScriptComplete = generatedScript?.episodes?.every((ep: any) =>
    ep.scenes?.every((s: any) => s.dialogue && s.dialogue.length > 0)
  ) ?? false;

  // Count episodes needing dialogues
  const episodesNeedingDialogue = generatedScript?.episodes?.filter((ep: any) =>
    ep.scenes?.some((s: any) => !s.dialogue || s.dialogue.length === 0)
  ) || [];

  return (
    <>
      {/* V47: Full-screen Script Generation Overlay */}
      {pipelineRunning && !backgroundGeneration && (
        <ScriptGenerationOverlay
          progress={pipelineProgress}
          currentEpisode={currentEpisodeGenerating}
          totalEpisodes={totalEpisodesToGenerate}
          generatedEpisodes={generatedEpisodesList}
          estimatedRemainingMs={getEstimatedRemainingMs()}
          elapsedSeconds={scriptElapsedSeconds}
          currentStepLabel={currentStepLabel}
          onContinueInBackground={() => setBackgroundGeneration(true)}
          onCancel={cancelGeneration}
        />
      )}
      
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
      {/* Hollywood Workflow Progress Indicator */}
      {(generatedScript || lightOutline || pipelineRunning) && (
        <Card className="border-primary/30 bg-gradient-to-r from-primary/5 to-transparent">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-4 overflow-x-auto pb-2">
              {workflowSteps.map((step, i) => {
                const isActive = step.id === workflowStep;
                const isCompleted = i < currentStepIndex;
                const isPending = i > currentStepIndex;
                
                // Map workflow step to tab for navigation
                const stepToTab: Record<string, string> = {
                  'idea': 'generate',
                  'review': 'generate',
                  'script': 'summary',
                  'production': 'production',
                };
                
                const handleStepClick = () => {
                  const targetTab = stepToTab[step.id] || 'generate';
                  setActiveTab(targetTab);
                };
                
                return (
                  <div 
                    key={step.id} 
                    className="flex items-center gap-2 shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
                    onClick={handleStepClick}
                    title={`Ir a ${step.label}`}
                  >
                    <div className={`
                      w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all
                      ${isActive ? 'bg-primary text-primary-foreground ring-2 ring-primary/30 ring-offset-2' : ''}
                      ${isCompleted ? 'bg-green-500 text-white' : ''}
                      ${isPending ? 'bg-muted text-muted-foreground' : ''}
                    `}>
                      {isCompleted ? <CheckCircle className="w-4 h-4" /> : i + 1}
                    </div>
                    <div className={`hidden sm:block ${isActive ? '' : 'opacity-60'}`}>
                      <p className={`text-sm font-medium ${isActive ? 'text-foreground' : 'text-muted-foreground'}`}>
                        {step.label}
                      </p>
                      {isActive && (
                        <p className="text-xs text-muted-foreground">{step.description}</p>
                      )}
                    </div>
                    {i < workflowSteps.length - 1 && (
                      <div className={`w-8 h-0.5 ${isCompleted ? 'bg-green-500' : 'bg-muted'}`} />
                    )}
                  </div>
                );
              })}
              
              {/* Generating badge overlay */}
              {pipelineRunning && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/20 border border-amber-500/40 rounded-full animate-pulse ml-2">
                  <Loader2 className="w-4 h-4 animate-spin text-amber-600" />
                  <span className="text-sm font-medium text-amber-600">Generando...</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* V3.0: PROJECT LOCKED BANNER */}
      {projectLockInfo?.isLocked && (
        <Card className="border-2 border-amber-500/50 bg-amber-500/10">
          <CardContent className="pt-4 pb-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-amber-500/20">
                  <Lock className="w-6 h-6 text-amber-600" />
                </div>
                <div>
                  <p className="font-semibold text-amber-600">
                    🔒 Proyecto Bloqueado: {projectLockInfo.lockReason || 'Generación en curso'}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Otra operación está en curso. 
                    {projectLockInfo.retryAfterSeconds && (
                      <span> Espera ~{Math.ceil(projectLockInfo.retryAfterSeconds / 60)} min o desbloquea si crees que es un error.</span>
                    )}
                  </p>
                </div>
              </div>
              <Button 
                variant="outline"
                size="sm"
                onClick={async () => {
                  try {
                    const { error: unlockError } = await invokeAuthedFunction('force-unlock-project', { projectId });
                    if (unlockError) throw unlockError;
                    setProjectLockInfo(null);
                    toast.success('Proyecto desbloqueado exitosamente');
                  } catch (e: any) {
                    toast.error(`Error al desbloquear: ${e.message}`);
                  }
                }}
                className="gap-2 shrink-0 border-amber-500/50 text-amber-600 hover:bg-amber-500/10"
              >
                <Unlock className="w-4 h-4" />
                Desbloquear Proyecto
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* V23: OUTLINE GENERATION STATUS BANNER - Handles errors AND "ready to continue" states */}
      {outlineError && (
        <Card className={`border-2 ${
          outlineError.code === 'CHUNK_READY_NEXT' 
            ? 'border-blue-500/50 bg-blue-500/5' 
            : 'border-destructive/50 bg-destructive/5'
        }`}>
          <CardContent className="pt-4 pb-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${
                  outlineError.code === 'CHUNK_READY_NEXT' 
                    ? 'bg-blue-500/20' 
                    : 'bg-destructive/20'
                }`}>
                  {outlineError.code === 'CHUNK_READY_NEXT' ? (
                    <Play className="w-6 h-6 text-blue-600" />
                  ) : (
                    <AlertTriangle className="w-6 h-6 text-destructive" />
                  )}
                </div>
                <div>
                  <p className={`font-semibold ${
                    outlineError.code === 'CHUNK_READY_NEXT' 
                      ? 'text-blue-600' 
                      : 'text-destructive'
                  }`}>
                    {outlineError.code === 'CHUNK_READY_NEXT' 
                      ? '⏳ Chunk completado - Continuar generación'
                      : `⚠️ Error en Generación: ${outlineError.code}`
                    }
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {outlineError.message}
                    {outlineError.substage && (
                      <span className="ml-1 text-xs">({outlineError.substage})</span>
                    )}
                  </p>
                  {outlinePersistence.savedOutline?.progress != null && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Progreso actual: {outlinePersistence.savedOutline.progress}%
                    </p>
                  )}
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                {outlineError.retryable && outlinePersistence.savedOutline?.id && (
                  <Button 
                    variant={outlineError.code === 'CHUNK_READY_NEXT' ? 'default' : 'outline'}
                    size="sm"
                    onClick={async () => {
                      // V25: AUTO-LOOP - Continue all chunks automatically
                      setOutlineError(null);
                      setGeneratingOutline(true);
                      setOutlineStartTime(Date.now());
                      
                      const MAX_AUTO_CHUNKS = 20; // Safety limit for infinite loop prevention
                      let chunkCount = 0;
                      let shouldContinue = true;
                      
                      const processChunk = async (): Promise<boolean> => {
                        if (!shouldContinue || chunkCount >= MAX_AUTO_CHUNKS) {
                          if (chunkCount >= MAX_AUTO_CHUNKS) {
                            toast.warning('Límite de auto-continuaciones alcanzado');
                          }
                          return false;
                        }
                        
                        chunkCount++;
                        const outlineId = outlinePersistence.savedOutline?.id;
                        if (!outlineId) return false;
                        
                        try {
                          // Reset status to generating
                          await supabase
                            .from('project_outlines')
                            .update({
                              status: 'generating',
                              error_code: null,
                              error_detail: null,
                              heartbeat_at: new Date().toISOString()
                            })
                            .eq('id', outlineId);
                          
                          // Invoke worker
                          const { data, error } = await invokeWithTimeout<any>('outline-worker', {
                            outline_id: outlineId
                          }, { timeoutMs: 90000 }); // 90s timeout for chunk
                          
                          if (error) {
                            console.error('[V25 Auto-Loop] Worker error:', error);
                            // Check if it's a timeout/retryable error
                            const errMsg = String(error?.message || error || '');
                            if (errMsg.includes('CHUNK_READY_NEXT') || errMsg.includes('CHUNK_COMPLETE')) {
                              // Chunk done, continue to next
                              toast.info(`✓ Chunk ${chunkCount} completado, continuando...`, { duration: 2000 });
                              await new Promise(r => setTimeout(r, 800)); // Brief pause
                              return processChunk(); // Recursive call for next chunk
                            }
                            throw new Error(errMsg);
                          }
                          
                          // Check response for continuation signals
                          const needsContinue = data?.needs_continue || data?.code === 'CHUNK_COMPLETE' || data?.code === 'CHUNK_READY_NEXT';
                          const isComplete = data?.code === 'GENERATION_COMPLETE' || data?.status === 'completed' || data?.is_complete;
                          
                          if (isComplete) {
                            return true; // Done!
                          }
                          
                          if (needsContinue) {
                            toast.info(`✓ Chunk ${chunkCount} completado, continuando...`, { duration: 2000 });
                            await new Promise(r => setTimeout(r, 800)); // Brief pause
                            return processChunk(); // Recursive call
                          }
                          
                          // If we get here without clear signals, check DB status
                          await new Promise(r => setTimeout(r, 1000));
                          const { data: checkData } = await supabase
                            .from('project_outlines')
                            .select('status, progress, error_code')
                            .eq('id', outlineId)
                            .single();
                          
                          if (checkData?.status === 'completed' || checkData?.status === 'approved') {
                            return true;
                          }
                          if (checkData?.status === 'stalled' || checkData?.error_code?.includes('CHUNK')) {
                            // Continue from stalled state
                            toast.info(`Chunk ${chunkCount} pausado, reintentando...`, { duration: 2000 });
                            await new Promise(r => setTimeout(r, 500));
                            return processChunk();
                          }
                          
                          return true; // Assume done if unclear
                        } catch (e: any) {
                          console.error('[V25 Auto-Loop] Chunk error:', e);
                          throw e;
                        }
                      };
                      
                      try {
                        toast.info('Iniciando generación automática de chunks...', { duration: 3000 });
                        const success = await processChunk();
                        
                        if (success) {
                          setGeneratingOutline(false);
                          setOutlineStartTime(null);
                          await outlinePersistence.refreshOutline();
                          toast.success(`🎬 Outline completado (${chunkCount} chunks procesados)`);
                        }
                      } catch (e: any) {
                        setGeneratingOutline(false);
                        setOutlineStartTime(null);
                        setOutlineError({
                          code: 'CHUNK_ERROR',
                          message: e.message || 'Error en chunk',
                          substage: outlinePersistence.savedOutline?.substage || undefined,
                          retryable: true
                        });
                      }
                    }}
                    className={outlineError.code === 'CHUNK_READY_NEXT' 
                      ? 'gap-2' 
                      : 'gap-2 border-destructive/50 text-destructive hover:bg-destructive/10'
                    }
                  >
                    {outlineError.code === 'CHUNK_READY_NEXT' ? (
                      <>
                        <Play className="w-4 h-4" />
                        Continuar Generación
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-4 h-4" />
                        Reintentar Chunk
                      </>
                    )}
                  </Button>
                )}
                <Button 
                  variant="ghost"
                  size="sm"
                  onClick={() => setOutlineError(null)}
                >
                  Cerrar
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {episodesNeedingDialogue.length > 0 && !pipelineRunning && (
        <Card className="border-2 border-destructive/50 bg-destructive/5">
          <CardContent className="pt-4 pb-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-destructive/20">
                  <AlertTriangle className="w-6 h-6 text-destructive" />
                </div>
                <div>
                  <p className="font-semibold text-destructive">
                    ⚠️ Guion Incompleto: Faltan Diálogos
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {episodesNeedingDialogue.length} episodio(s) tienen escenas sin diálogos. 
                    <span className="font-medium"> Un guion profesional requiere diálogos completos.</span>
                  </p>
                </div>
              </div>
              <Button 
                variant="gold"
                size="lg"
                onClick={generateMissingDialogues}
                disabled={generatingDialogues}
                className="gap-2 shrink-0"
              >
                {generatingDialogues ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {dialogueProgress.phase || 'Generando...'}
                  </>
                ) : (
                  <>
                    <Wand2 className="w-5 h-5" />
                    Generar Diálogos Ahora
                  </>
                )}
              </Button>
            </div>
            {generatingDialogues && dialogueProgress.total > 0 && (
              <div className="mt-4">
                <Progress value={(dialogueProgress.current / dialogueProgress.total) * 100} className="h-2" />
                <p className="text-xs text-muted-foreground mt-1 text-center">
                  Episodio {dialogueProgress.current} de {dialogueProgress.total}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
        <div>
          <h2 className="text-lg sm:text-xl font-semibold text-foreground">Guion</h2>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Flujo Hollywood: Guion → Resumen → Producción → Mejoras
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Edit Bible Button */}
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => navigate(`/projects/${projectId}/`)}
          >
            <Book className="w-4 h-4" />
            <span className="ml-2 hidden sm:inline">Editar Biblia</span>
          </Button>
          
          {generatedScript && (
            <>
              {/* Regenerate Script Button */}
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => {
                  // Reset states to allow regeneration
                  setGeneratedScript(null);
                  setOutlineApproved(false);
                  setLightOutline(null);
                  setGeneratedEpisodesList([]);
                  clearPipelineState();
                  setActiveTab('generate');
                  
                  // Auto-regenerate if we have an idea saved
                  if (ideaText.trim()) {
                    toast.info('Regenerando outline con tu idea original...');
                    // Use setTimeout to allow state updates before calling generateOutlineDirect
                    setTimeout(() => {
                      generateOutlineDirect();
                    }, 100);
                  } else {
                    toast.info('Ingresa tu idea y genera un nuevo outline.');
                  }
                }}
                disabled={pipelineRunning}
              >
                <RefreshCw className="w-4 h-4" />
                <span className="ml-2 hidden sm:inline">Regenerar</span>
              </Button>
              <Button 
                variant={scriptLocked ? "default" : "outline"} 
                size="sm"
                onClick={scriptLocked ? unlockScript : freezeScript}
              >
                {scriptLocked ? <Lock className="w-4 h-4" /> : <Snowflake className="w-4 h-4" />}
                <span className="ml-2 hidden sm:inline">{scriptLocked ? 'Congelado' : 'Freeze'}</span>
              </Button>
              {/* Delete Script Button */}
              <Button 
                variant="destructive" 
                size="sm"
                onClick={deleteCurrentScript}
                disabled={deletingScript}
              >
                {deletingScript ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                <span className="ml-2 hidden sm:inline">Eliminar</span>
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Pipeline Status - Hidden for cleaner UI */}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        {/* Simplified 5-tab structure */}
        <div className="overflow-x-auto scrollbar-hide -mx-4 sm:mx-0 px-4 sm:px-0">
        <TabsList className="inline-flex w-max min-w-full sm:grid sm:grid-cols-5 sm:w-full h-auto sm:h-10 gap-1 sm:gap-0">
            <TabsTrigger value="generate" className="flex items-center gap-1.5 sm:gap-2 shrink-0 text-xs sm:text-sm px-3 py-2">
              <FileText className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              Guion
            </TabsTrigger>
            <TabsTrigger value="summary" className="flex items-center gap-1.5 sm:gap-2 shrink-0 text-xs sm:text-sm px-3 py-2">
              <BookOpen className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              Resumen
            </TabsTrigger>
            <TabsTrigger value="production" className="flex items-center gap-1.5 sm:gap-2 shrink-0 text-xs sm:text-sm px-3 py-2">
              <Clapperboard className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              Producción
            </TabsTrigger>
            <TabsTrigger value="doctor" className="flex items-center gap-1.5 sm:gap-2 shrink-0 text-xs sm:text-sm px-3 py-2">
              <Stethoscope className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              Mejoras
            </TabsTrigger>
            <TabsTrigger value="history" className="flex items-center gap-1.5 sm:gap-2 shrink-0 text-xs sm:text-sm px-3 py-2">
              <History className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              Histórico
            </TabsTrigger>
          </TabsList>
        </div>

        {/* GUION TAB - Merged Generate + Import */}
        <TabsContent value="generate" className="space-y-4">
          {/* Project Data Status - Shows what's in backend */}
          <ProjectDataStatus
            hasOutline={!!outlinePersistence.savedOutline?.outline_json && Object.keys(outlinePersistence.savedOutline.outline_json).length > 0}
            hasPartialOutline={!!(outlinePersistence.savedOutline?.outline_parts && Object.keys(outlinePersistence.savedOutline.outline_parts as Record<string, unknown> || {}).length > 0)}
            outlineStatus={outlinePersistence.savedOutline?.status}
            outlineProgress={outlinePersistence.savedOutline?.progress}
            outlineErrorCode={outlinePersistence.savedOutline?.error_code}
            hasScript={!!generatedScript || !!scriptText}
            charactersCount={bibleCharacters.length}
            locationsCount={bibleLocations.length}
            isLoading={outlinePersistence.isLoading}
            onRefresh={() => {
              outlinePersistence.refreshOutline();
              fetchBibleData();
            }}
            onGenerateOutline={ideaText.trim() ? generateOutlineDirect : undefined}
            onResumeGeneration={(outlinePersistence.savedOutline?.status === 'stalled' || outlinePersistence.savedOutline?.status === 'timeout' || outlinePersistence.canResume) ? async () => {
              // Resume generation from where it left off using the hook's resumeGeneration
              toast.info('Reanudando generación...');
              const result = await outlinePersistence.resumeGeneration();
              if (!result.success) {
                if (result.errorCode === 'MAX_ATTEMPTS_EXCEEDED') {
                  toast.error('Máximo de intentos alcanzado. Usa "Nuevo intento" para continuar.');
                } else {
                  toast.error('No se pudo reanudar. Intenta regenerar.');
                }
              }
            } : undefined}
            onCreateNewAttempt={async () => {
              // V6: Create a fresh outline attempt but preserve scaffold if possible
              toast.info('Creando nuevo intento...');
              // Delete current outline and regenerate
              await outlinePersistence.deleteOutline?.();
              if (ideaText.trim()) {
                generateOutlineDirect();
              } else {
                toast.info('Escribe tu idea y pulsa "Generar Outline"');
              }
            }}
          />
          
          {/* V4.0: Failed Outline Recovery Card - Show when outline failed/blocked by QC */}
          {outlinePersistence.savedOutline?.status === 'failed' && (
            <Card className="border-red-500/50 bg-red-50/30 dark:bg-red-950/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2 text-red-700 dark:text-red-400">
                  <XCircle className="h-5 w-5" />
                  Outline rechazado por QC
                </CardTitle>
                <CardDescription className="text-red-600/80 dark:text-red-400/80">
                  {outlinePersistence.savedOutline?.error_detail || outlinePersistence.savedOutline?.error_code || 'El outline anterior no pasó las validaciones de calidad'}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                <Button 
                  variant="default" 
                  className="gap-2"
                  disabled={generatingOutline || (!ideaText.trim() && !outlinePersistence.savedOutline?.idea)}
                  onClick={async () => {
                    // Use saved idea as fallback if local state is empty
                    const effectiveIdea = ideaText.trim() || outlinePersistence.savedOutline?.idea || '';
                    
                    if (!effectiveIdea) {
                      toast.error('No hay idea disponible para regenerar');
                      return;
                    }
                    
                    // Ensure ideaText state is populated for generateOutlineDirect
                    if (!ideaText.trim() && effectiveIdea) {
                      setIdeaText(effectiveIdea);
                    }
                    
                    // Mark old outline as obsolete and generate new with Direct Generation
                    if (outlinePersistence.savedOutline?.id) {
                      await supabase
                        .from('project_outlines')
                        .update({ status: 'obsolete' })
                        .eq('id', outlinePersistence.savedOutline.id);
                    }
                    setLightOutline(null);
                    setOutlineApproved(false);
                    await outlinePersistence.refreshOutline();
                    
                    // Small delay to ensure state updates propagate before generation
                    await new Promise(r => setTimeout(r, 100));
                    generateOutlineDirect();
                  }}
                >
                  <Sparkles className="h-4 w-4" />
                  Generar nuevo (Generación Directa)
                </Button>
                <Button 
                  variant="outline" 
                  className="gap-2"
                  onClick={() => {
                    // Use the existing failed outline anyway
                    const outlineJson = outlinePersistence.savedOutline?.outline_json;
                    if (outlineJson && Object.keys(outlineJson).length > 0) {
                      setLightOutline(outlineJson);
                      updatePipelineStep('outline', 'success');
                      toast.info('Usando outline existente a pesar de los warnings');
                    } else {
                      toast.error('No hay datos de outline para usar');
                    }
                  }}
                >
                  <CheckCircle className="h-4 w-4" />
                  Usar este outline de todos modos
                </Button>
              </CardContent>
            </Card>
          )}
          
          {/* Script Source Selector - Only show when no script exists */}
          {!lightOutline && !pipelineRunning && !generatedScript && (
            <div className="grid gap-4 md:grid-cols-2">
              {/* OPTION 1: Generate from Idea */}
              <Card className="border-primary/50 bg-gradient-to-r from-primary/5 to-transparent hover:border-primary transition-colors">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <div className="p-2 bg-primary/10 rounded-lg">
                      <Sparkles className="w-5 h-5 text-primary" />
                    </div>
                    Generar desde Idea
                  </CardTitle>
                  <CardDescription>
                    Describe tu idea y generaremos un guion completo con personajes, localizaciones y diálogos
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* V4.0: Density Profile Selector */}
                  <DensityProfileSelector 
                    value={densityProfile} 
                    onChange={setDensityProfile}
                    compact
                  />
                  
                  <Button 
                    variant="gold" 
                    className="w-full"
                    onClick={useDirectGeneration ? generateOutlineDirect : generateLightOutline} 
                    disabled={generatingOutline || !ideaText.trim()}
                  >
                    {generatingOutline ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Generando...</>
                    ) : (
                      <><Zap className="w-4 h-4 mr-2" />Generar Outline</>
                    )}
                  </Button>
                  <p className="text-xs text-muted-foreground mt-2 text-center">
                    ↓ Escribe tu idea abajo primero
                  </p>
                </CardContent>
              </Card>

              {/* OPTION 2: Import Existing Script */}
              <Card className="border-border hover:border-primary/50 transition-colors">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <div className="p-2 bg-muted rounded-lg">
                      <Upload className="w-5 h-5 text-muted-foreground" />
                    </div>
                    Importar Guion Existente
                  </CardTitle>
                  <CardDescription>
                    Sube un PDF o pega texto de un guion ya escrito para analizarlo
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div 
                      className="border-2 border-dashed rounded-lg p-4 text-center cursor-pointer hover:border-primary/50 transition-colors"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Upload className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
                      <p className="text-sm font-medium">
                        {uploadedFileName || 'Subir PDF o TXT'}
                      </p>
                      <p className="text-xs text-muted-foreground">.pdf, .txt</p>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".txt,.pdf,text/plain,application/pdf"
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                    </div>
                    {scriptText.length > 0 && (
                      <Button 
                        variant="outline" 
                        className="w-full"
                        onClick={analyzeImportedScript} 
                        disabled={parsingImportedScript || scriptText.length < 200}
                      >
                        {parsingImportedScript ? (
                          <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Analizando...</>
                        ) : (
                          <><Sparkles className="w-4 h-4 mr-2" />Analizar Guion ({scriptText.length} chars)</>
                        )}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* PDF Processing Indicator */}
          {pdfProcessing && (
            <Card className="border-2 border-primary/50 bg-primary/5">
              <CardContent className="pt-6">
                <div className="text-center space-y-4">
                  <div className="relative mx-auto w-16 h-16 mb-4">
                    <FileText className="h-10 w-10 mx-auto text-primary absolute inset-0 m-auto" />
                    <div className="absolute inset-0 border-2 border-primary/30 rounded-full animate-ping" />
                  </div>
                  <p className="font-medium text-primary">{uploadedFileName}</p>
                  <Progress value={pdfProgress} className="h-2 max-w-sm mx-auto" />
                  <p className="text-sm text-muted-foreground">Extrayendo texto del PDF...</p>
                  <Button variant="outline" size="sm" onClick={cancelPdfProcessing}>
                    <Square className="h-4 w-4 mr-2" />
                    Cancelar
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Script Analysis Progress */}
          {parsingImportedScript && (
            <Card className="border-2 border-primary/50 bg-primary/5">
              <CardContent className="pt-6">
                <div className="text-center space-y-4">
                  <div className="relative mx-auto w-20 h-20 mb-4">
                    <Sparkles className="h-10 w-10 mx-auto text-primary absolute inset-0 m-auto animate-pulse" />
                    <div className="absolute inset-0 border-4 border-t-primary border-r-transparent border-b-primary/30 border-l-transparent rounded-full animate-spin" />
                  </div>
                  <h3 className="text-lg font-semibold text-primary">Analizando Guion Importado</h3>
                  <p className="text-sm text-muted-foreground">
                    Extracción profesional de personajes, localizaciones y escenas
                  </p>
                  <p className="text-xs text-muted-foreground/70">Puede tardar hasta 2 minutos</p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* V8.0: DRAFT OUTLINE RECOVERY CARD - For outlines that never started */}
          {!lightOutline && !generatingOutline && !pipelineRunning && 
           outlinePersistence.savedOutline?.status === 'draft' && 
           (!outlinePersistence.savedOutline?.stage || outlinePersistence.savedOutline?.stage === 'none') && (
            <Card className="border-2 border-yellow-500/50 bg-yellow-500/5">
              <CardContent className="pt-6 text-center space-y-4">
                <AlertTriangle className="w-12 h-12 mx-auto text-yellow-500" />
                <h3 className="font-semibold text-lg">Outline Incompleto Detectado</h3>
                <p className="text-sm text-muted-foreground">
                  Se encontró un outline que no terminó de generarse. Puedes reintentar la generación o empezar de nuevo.
                </p>
                <div className="flex gap-3 justify-center flex-wrap">
                  <Button onClick={handleRetryDraftOutline} variant="default">
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Reintentar Generación
                  </Button>
                  <Button variant="destructive" onClick={handleDeleteOutline}>
                    <Trash2 className="w-4 h-4 mr-2" />
                    Borrar y Empezar
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* CTA Principal - Only when generating and no outline yet */}
          {!lightOutline && !pipelineRunning && generatedScript && (
            <Card className="border-primary/50 bg-gradient-to-r from-primary/5 to-transparent">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <div>
                    <h3 className="font-semibold text-lg flex items-center gap-2">
                      <CheckCircle className="w-5 h-5 text-green-500" />
                      Guion Cargado
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {generatedScript.title || 'Sin título'} • {generatedScript.episodes?.length || 1} episodio(s)
                    </p>
                  </div>
                  <Button variant="outline" onClick={() => setActiveTab('summary')}>
                    <ArrowRight className="w-4 h-4 mr-2" />
                    Ver Resumen
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* OUTLINE APPROVAL CARD - Pipeline V2 Step 2 */}
          {lightOutline && !outlineApproved && !generatingOutline && outlinePersistence.savedOutline?.status === 'completed' && (
            <Card className="border-2 border-amber-500/50 bg-amber-500/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-amber-500" />
                  Outline Generado: Revisa y Aprueba
                </CardTitle>
                <CardDescription>
                  Revisa el outline antes de generar los episodios completos
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Title & Logline */}
                <div className="p-4 bg-background rounded-lg border">
                  <h3 className="font-bold text-xl mb-2">{lightOutline.title}</h3>
                  <p className="text-muted-foreground italic">{lightOutline.logline}</p>
                  <div className="flex gap-2 mt-3">
                    <Badge variant="secondary">{lightOutline.genre}</Badge>
                    <Badge variant="outline">{lightOutline.tone}</Badge>
                  </div>
                </div>

                {/* Synopsis */}
                {lightOutline.synopsis && (
                  <div>
                    <Label className="text-xs uppercase text-muted-foreground">Sinopsis</Label>
                    <p className="text-sm mt-1">{lightOutline.synopsis}</p>
                  </div>
                )}

                {/* Characters (with role + description) */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-xs uppercase text-muted-foreground">
                      Personajes {bibleLoading || materializingEntities ? '' : `(${outlineForUI?.main_characters?.length || 0})`}
                    </Label>
                    {/* P1 FIX: Materialize Bible Button */}
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={materializingEntities || pipelineRunning}
                      onClick={async () => {
                        setMaterializingEntities(true);
                        try {
                          const { data, error } = await supabase.functions.invoke('materialize-entities', {
                            body: { projectId, source: 'outline' }
                          });

                          // Use robust helper to detect NO_OUTLINE_FOUND
                          if (isMaterializeNoOutline(data, error)) {
                            toast.info('Genera un outline primero antes de sincronizar.');
                            return;
                          }

                          if (error) throw error;
                          // Refresh Bible data after sync
                          await fetchBibleData();
                          toast.success(data?.message || 'Personajes y locaciones sincronizados a la Bible');
                        } catch (err: any) {
                          console.error('[materialize-entities]', err);
                          toast.error('Error al sincronizar: ' + (err.message || 'Error desconocido'));
                        } finally {
                          setMaterializingEntities(false);
                        }
                      }}
                    >
                      {materializingEntities ? (
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      ) : (
                        <Users className="h-3 w-3 mr-1" />
                      )}
                      Sincronizar a Bible
                    </Button>
                  </div>
                  <div className="grid gap-2 md:grid-cols-2">
                    {(outlineForUI?.main_characters ?? []).map((char: any, i: number) => {
                      const role = char.role || '';
                      const roleDetail = char.role_detail || char.roleDetail;
                      const variant = role === 'protagonist' ? 'default' : role === 'antagonist' ? 'destructive' : 'secondary';
                      // V21: Support multiple description field formats from different outline generators
                      const description = char.description || char.bio || char.want;
                      const details = char.need || char.flaw || char.arc;
                      const decisionKey = char.decision_key;
                      return (
                        <div key={i} className="p-3 bg-muted/30 rounded border space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant={variant}>{char.name}</Badge>
                            {(role || roleDetail) && (
                              <span className="text-xs text-muted-foreground">
                                {role}{roleDetail ? ` • ${roleDetail}` : ''}
                              </span>
                            )}
                          </div>
                          {description && (
                            <p className="text-xs text-muted-foreground">{description}</p>
                          )}
                          {details && (
                            <p className="text-xs text-muted-foreground/70 italic">{details}</p>
                          )}
                          {decisionKey && (
                            <p className="text-xs text-primary/80 italic">🎯 {decisionKey}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Locations (with type + description) */}
                <div>
                  <Label className="text-xs uppercase text-muted-foreground mb-2 block">
                    Localizaciones {bibleLoading || materializingEntities ? '' : `(${outlineForUI?.main_locations?.length || 0})`}
                  </Label>
                  <div className="grid gap-2 md:grid-cols-2">
                    {(outlineForUI?.main_locations ?? []).map((loc: any, i: number) => {
                      // V21: Support multiple field formats from different generators
                      const description = loc.description || loc.visual_identity || loc.function;
                      const details = loc.function && loc.visual_identity ? loc.function : null;
                      return (
                        <div key={i} className="p-2 bg-muted/30 rounded border space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline">{loc.name}</Badge>
                            {loc.type && <span className="text-xs text-muted-foreground">{loc.type}</span>}
                          </div>
                          {description && (
                            <p className="text-xs text-muted-foreground">{description}</p>
                          )}
                          {details && (
                            <p className="text-xs text-muted-foreground/70 italic">{details}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Density Gap Warning */}
                {targets && (() => {
                  const charsCount = lightOutline.main_characters?.length || 0;
                  const locsCount = lightOutline.main_locations?.length || 0;
                  const propsCount = lightOutline.main_props?.length || 0;
                  const charsMin = (targets.protagonists_min || 0) + (targets.supporting_min || 0);
                  const locsMin = targets.locations_min || 0;
                  const propsMin = targets.hero_props_min || 0;
                  const hasGap = charsCount < charsMin || locsCount < locsMin || propsCount < propsMin;
                  
                  if (!hasGap) return null;
                  
                  return (
                    <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                      <Label className="text-xs uppercase text-amber-600 mb-2 block flex items-center gap-2">
                        <AlertTriangle className="h-3 w-3" />
                        Densidad Narrativa
                      </Label>
                      <div className="grid gap-1 text-xs">
                        {charsCount < charsMin && (
                          <p className="text-muted-foreground">
                            ⚠️ Personajes: {charsCount} / {charsMin} mínimo
                          </p>
                        )}
                        {locsCount < locsMin && (
                          <p className="text-muted-foreground">
                            ⚠️ Localizaciones: {locsCount} / {locsMin} mínimo
                          </p>
                        )}
                        {propsCount < propsMin && (
                          <p className="text-muted-foreground">
                            ⚠️ Props clave: {propsCount} / {propsMin} mínimo
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* Props */}
                {!!lightOutline.main_props?.length && (
                  <div>
                    <Label className="text-xs uppercase text-muted-foreground mb-2 block">
                      Props / Objetos clave ({lightOutline.main_props.length})
                    </Label>
                    <div className="flex flex-wrap gap-2">
                      {lightOutline.main_props.map((prop: any, i: number) => {
                        const name = typeof prop === 'string' ? prop : prop.name;
                        return (
                          <Badge key={i} variant="secondary">
                            {name}
                          </Badge>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Subplots */}
                {!!lightOutline.subplots?.length && (
                  <div>
                    <Label className="text-xs uppercase text-muted-foreground mb-2 block">
                      Subtramas ({lightOutline.subplots.length})
                    </Label>
                    <div className="space-y-2">
                      {lightOutline.subplots.map((subplot: any, i: number) => (
                        <div key={i} className="p-2 bg-muted/30 rounded border">
                          <p className="text-sm font-medium">{subplot.name}</p>
                          {subplot.description && (
                            <p className="text-xs text-muted-foreground mt-1">{subplot.description}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Plot Twists */}
                {!!lightOutline.plot_twists?.length && (
                  <div>
                    <Label className="text-xs uppercase text-muted-foreground mb-2 block">
                      Giros narrativos ({lightOutline.plot_twists.length})
                    </Label>
                    <div className="space-y-2">
                      {lightOutline.plot_twists.map((twist: any, i: number) => (
                        <div key={i} className="p-2 bg-muted/30 rounded border">
                          <div className="flex items-center gap-2">
                            <Badge
                              variant={
                                twist.impact === 'paradigm_shift'
                                  ? 'destructive'
                                  : twist.impact === 'major'
                                    ? 'default'
                                    : 'secondary'
                              }
                              className="text-xs"
                            >
                              {twist.impact === 'paradigm_shift' ? '💥' : twist.impact === 'major' ? '⚡' : '✨'}
                              {twist.impact === 'paradigm_shift' ? 'Cambio total' : twist.impact === 'major' ? 'Mayor' : 'Menor'}
                            </Badge>
                            <p className="text-sm font-medium">{twist.name}</p>
                          </div>
                          {twist.description && (
                            <p className="text-xs text-muted-foreground mt-1">{twist.description}</p>
                          )}
                        </div>
                      ))}
                    </div>
                </div>
                )}

                {/* ═══════════════════════════════════════════════════════════════ */}
                {/* SHOWRUNNER-LEVEL SECTIONS (only visible when quality=showrunner) */}
                {/* ═══════════════════════════════════════════════════════════════ */}
                
                {/* Season Arc - Showrunner Enhancement */}
                {lightOutline.season_arc && (
                  <div className="p-4 bg-purple-500/5 border border-purple-500/30 rounded-lg">
                    <Label className="text-xs uppercase text-purple-600 dark:text-purple-400 mb-3 block flex items-center gap-2">
                      <Crown className="w-3 h-3" />
                      Arco de Temporada (Showrunner)
                    </Label>
                    <div className="grid gap-3 text-sm">
                      {lightOutline.season_arc.protagonist_name && (
                        <div className="font-medium text-purple-700 dark:text-purple-300">
                          Protagonista: {lightOutline.season_arc.protagonist_name}
                        </div>
                      )}
                      <div className="grid md:grid-cols-3 gap-3">
                        <div className="p-2 bg-green-500/10 rounded border border-green-500/20">
                          <span className="text-xs text-green-600 dark:text-green-400 uppercase block mb-1">Inicio</span>
                          <p className="text-xs">{lightOutline.season_arc.protagonist_start}</p>
                        </div>
                        <div className="p-2 bg-amber-500/10 rounded border border-amber-500/20">
                          <span className="text-xs text-amber-600 dark:text-amber-400 uppercase block mb-1">Quiebre</span>
                          <p className="text-xs">{lightOutline.season_arc.protagonist_break}</p>
                        </div>
                        <div className="p-2 bg-red-500/10 rounded border border-red-500/20">
                          <span className="text-xs text-red-600 dark:text-red-400 uppercase block mb-1">Final</span>
                          <p className="text-xs">{lightOutline.season_arc.protagonist_end}</p>
                        </div>
                      </div>
                      {lightOutline.season_arc.midpoint_event && (
                        <div className="p-2 bg-blue-500/10 rounded border border-blue-500/20">
                          <span className="text-xs text-blue-600 dark:text-blue-400 uppercase block mb-1">
                            Midpoint {lightOutline.season_arc.midpoint_episode ? `(Ep ${lightOutline.season_arc.midpoint_episode})` : ''}
                          </span>
                          <p className="text-xs">{lightOutline.season_arc.midpoint_event}</p>
                          {lightOutline.season_arc.midpoint_consequence && (
                            <p className="text-xs text-muted-foreground mt-1 italic">{lightOutline.season_arc.midpoint_consequence}</p>
                          )}
                        </div>
                      )}
                      {lightOutline.season_arc.thematic_question && (
                        <div className="p-2 bg-muted/30 rounded border">
                          <span className="text-xs text-muted-foreground uppercase block mb-1">Pregunta Temática</span>
                          <p className="text-xs font-medium">{lightOutline.season_arc.thematic_question}</p>
                          {lightOutline.season_arc.thematic_answer && (
                            <p className="text-xs text-muted-foreground mt-1">→ {lightOutline.season_arc.thematic_answer}</p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Mythology Rules - Showrunner Enhancement */}
                {Array.isArray(lightOutline.mythology_rules) && lightOutline.mythology_rules.length > 0 && (
                  <div className="p-4 bg-purple-500/5 border border-purple-500/30 rounded-lg">
                    <Label className="text-xs uppercase text-purple-600 dark:text-purple-400 mb-3 block flex items-center gap-2">
                      <Sparkles className="w-3 h-3" />
                      Reglas de Mitología ({lightOutline.mythology_rules.length})
                    </Label>
                    <div className="space-y-3">
                      {lightOutline.mythology_rules.map((rule: any, i: number) => (
                        <div key={i} className="p-3 bg-muted/30 rounded border">
                          <div className="flex items-center gap-2 mb-2">
                            <Badge variant="outline" className="bg-purple-500/10 border-purple-500/30 text-purple-700 dark:text-purple-300">
                              {rule.entity}
                            </Badge>
                            {rule.nature && (
                              <span className="text-xs text-muted-foreground">{rule.nature}</span>
                            )}
                          </div>
                          <div className="grid md:grid-cols-2 gap-2 text-xs">
                            {rule.can_do?.length > 0 && (
                              <div className="p-2 bg-green-500/10 rounded">
                                <span className="text-green-600 dark:text-green-400 font-medium">✓ Puede:</span>
                                <ul className="mt-1 space-y-0.5 text-muted-foreground">
                                  {rule.can_do.map((item: string, j: number) => (
                                    <li key={j}>• {item}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {rule.cannot_do?.length > 0 && (
                              <div className="p-2 bg-red-500/10 rounded">
                                <span className="text-red-600 dark:text-red-400 font-medium">✗ No puede:</span>
                                <ul className="mt-1 space-y-0.5 text-muted-foreground">
                                  {rule.cannot_do.map((item: string, j: number) => (
                                    <li key={j}>• {item}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                          {rule.weakness && (
                            <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                              ⚡ Debilidad: {rule.weakness}
                            </p>
                          )}
                          {rule.dramatic_purpose && (
                            <p className="text-xs text-muted-foreground mt-1 italic">
                              Propósito dramático: {rule.dramatic_purpose}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Character Arcs - Showrunner Enhancement */}
                {Array.isArray(lightOutline.character_arcs) && lightOutline.character_arcs.length > 0 && (
                  <div className="p-4 bg-purple-500/5 border border-purple-500/30 rounded-lg">
                    <Label className="text-xs uppercase text-purple-600 dark:text-purple-400 mb-3 block flex items-center gap-2">
                      <Users className="w-3 h-3" />
                      Arcos de Personajes ({lightOutline.character_arcs.length})
                    </Label>
                    <div className="space-y-3">
                      {lightOutline.character_arcs.map((arc: any, i: number) => (
                        <div key={i} className="p-3 bg-muted/30 rounded border">
                          <div className="flex items-center gap-2 mb-2">
                            <Badge variant="default">{arc.name}</Badge>
                            {arc.role && <span className="text-xs text-muted-foreground">{arc.role}</span>}
                            {arc.arc_type && (
                              <Badge variant="outline" className="text-xs">
                                {arc.arc_type}
                              </Badge>
                            )}
                          </div>
                          <div className="grid md:grid-cols-3 gap-2 text-xs">
                            <div className="p-2 bg-green-500/10 rounded">
                              <span className="text-green-600 dark:text-green-400 block mb-1">Inicio:</span>
                              <p className="text-muted-foreground">{arc.arc_start}</p>
                            </div>
                            {arc.arc_midpoint && (
                              <div className="p-2 bg-amber-500/10 rounded">
                                <span className="text-amber-600 dark:text-amber-400 block mb-1">Midpoint:</span>
                                <p className="text-muted-foreground">{arc.arc_midpoint}</p>
                              </div>
                            )}
                            <div className="p-2 bg-red-500/10 rounded">
                              <span className="text-red-600 dark:text-red-400 block mb-1">Final:</span>
                              <p className="text-muted-foreground">{arc.arc_end}</p>
                            </div>
                          </div>
                          {arc.internal_conflict && (
                            <p className="text-xs text-muted-foreground mt-2">
                              💭 Conflicto interno: {arc.internal_conflict}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* ═══════════════════════════════════════════════════════════════ */}
                {/* OPERATIONAL MEAT: Factions & Entity Rules                       */}
                {/* ═══════════════════════════════════════════════════════════════ */}
                
                {/* Factions Display */}
                {Array.isArray(lightOutline.factions) && lightOutline.factions.length > 0 && (
                  <div className="p-4 bg-red-500/5 border border-red-500/30 rounded-lg">
                    <Label className="text-xs uppercase text-red-600 dark:text-red-400 mb-3 block flex items-center gap-2">
                      <Shield className="w-3 h-3" />
                      Facciones ({lightOutline.factions.length})
                    </Label>
                    <div className="grid gap-3">
                      {lightOutline.factions.map((faction: any, i: number) => (
                        <div key={i} className="p-3 bg-muted/30 rounded border">
                          <div className="flex items-center gap-2 mb-2">
                            <Badge variant="destructive">{faction.name}</Badge>
                            {faction.leader && <span className="text-xs text-muted-foreground">Líder: {faction.leader}</span>}
                          </div>
                          <p className="text-xs"><strong>Objetivo:</strong> {faction.objective}</p>
                          <p className="text-xs"><strong>Método:</strong> {faction.method}</p>
                          {faction.red_line && (
                            <p className="text-xs text-red-600 dark:text-red-400 mt-1">🚫 Línea roja: {faction.red_line}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Entity Rules Display */}
                {Array.isArray(lightOutline.entity_rules) && lightOutline.entity_rules.length > 0 && (
                  <div className="p-4 bg-emerald-500/5 border border-emerald-500/30 rounded-lg">
                    <Label className="text-xs uppercase text-emerald-600 dark:text-emerald-400 mb-3 block flex items-center gap-2">
                      <Zap className="w-3 h-3" />
                      Reglas Operativas de Entidades ({lightOutline.entity_rules.length})
                    </Label>
                    <div className="grid gap-3">
                      {lightOutline.entity_rules.map((rule: any, i: number) => (
                        <div key={i} className="p-3 bg-muted/30 rounded border">
                          <Badge variant="outline" className="mb-2 bg-emerald-500/10 border-emerald-500/30">{rule.entity}</Badge>
                          <div className="grid md:grid-cols-2 gap-2 text-xs">
                            {rule.can_do?.length > 0 && (
                              <div className="p-2 bg-green-500/10 rounded">
                                <span className="text-green-600 dark:text-green-400 font-medium">✅ Puede:</span>
                                <ul className="mt-1 space-y-0.5 text-muted-foreground">
                                  {rule.can_do.map((item: string, j: number) => <li key={j}>• {item}</li>)}
                                </ul>
                              </div>
                            )}
                            {rule.cannot_do?.length > 0 && (
                              <div className="p-2 bg-red-500/10 rounded">
                                <span className="text-red-600 dark:text-red-400 font-medium">❌ No puede:</span>
                                <ul className="mt-1 space-y-0.5 text-muted-foreground">
                                  {rule.cannot_do.map((item: string, j: number) => <li key={j}>• {item}</li>)}
                                </ul>
                              </div>
                            )}
                          </div>
                          {rule.cost && <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">💰 Coste: {rule.cost}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* V7: FILM vs SERIES structure rendering */}
                {format === 'film' ? (
                  /* FILM: Show 3-Act Structure */
                  <div>
                    <Label className="text-xs uppercase text-muted-foreground mb-2 block flex items-center gap-2">
                      <Film className="w-3 h-3" />
                      Estructura de 3 Actos
                    </Label>
                    <div className="space-y-3">
                      {/* Act I */}
                      <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge variant="outline" className="bg-green-500/20 border-green-500/50">Acto I</Badge>
                          <span className="text-xs text-muted-foreground">Setup</span>
                        </div>
                        {lightOutline.acts_summary?.act_i_goal && (
                          <p className="text-sm mb-1"><strong>Objetivo:</strong> {lightOutline.acts_summary.act_i_goal}</p>
                        )}
                        {lightOutline.acts_summary?.inciting_incident_summary && (
                          <p className="text-xs text-muted-foreground">
                            <span className="text-green-600 dark:text-green-400">🎬 Incidente Incitador:</span> {lightOutline.acts_summary.inciting_incident_summary}
                          </p>
                        )}
                      </div>
                      
                      {/* Act II */}
                      <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge variant="outline" className="bg-amber-500/20 border-amber-500/50">Acto II</Badge>
                          <span className="text-xs text-muted-foreground">Confrontación</span>
                        </div>
                        {lightOutline.acts_summary?.act_ii_goal && (
                          <p className="text-sm mb-1"><strong>Objetivo:</strong> {lightOutline.acts_summary.act_ii_goal}</p>
                        )}
                        {lightOutline.acts_summary?.midpoint_summary && (
                          <p className="text-xs text-muted-foreground mb-1">
                            <span className="text-amber-600 dark:text-amber-400">⚡ Punto Medio:</span> {lightOutline.acts_summary.midpoint_summary}
                          </p>
                        )}
                        {lightOutline.acts_summary?.all_is_lost_summary && (
                          <p className="text-xs text-muted-foreground">
                            <span className="text-red-600 dark:text-red-400">💔 Todo Perdido:</span> {lightOutline.acts_summary.all_is_lost_summary}
                          </p>
                        )}
                      </div>
                      
                      {/* Act III */}
                      <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge variant="outline" className="bg-red-500/20 border-red-500/50">Acto III</Badge>
                          <span className="text-xs text-muted-foreground">Resolución</span>
                        </div>
                        {lightOutline.acts_summary?.act_iii_goal && (
                          <p className="text-sm mb-1"><strong>Objetivo:</strong> {lightOutline.acts_summary.act_iii_goal}</p>
                        )}
                        {lightOutline.acts_summary?.climax_summary && (
                          <p className="text-xs text-muted-foreground">
                            <span className="text-red-600 dark:text-red-400">🔥 Clímax:</span> {lightOutline.acts_summary.climax_summary}
                          </p>
                        )}
                      </div>
                      
                      {/* Beats if available (from expansion) */}
                      {lightOutline.beats?.length > 0 && (
                        <div className="mt-2">
                          <Label className="text-xs text-muted-foreground uppercase mb-1 block">
                            Beats Detallados ({lightOutline.beats.length})
                          </Label>
                          <div className="grid gap-1">
                            {lightOutline.beats.slice(0, 6).map((beat: any, i: number) => (
                              <div key={i} className="p-2 bg-muted/30 rounded text-xs">
                                <span className="font-medium">Beat {i + 1}:</span> {beat.event || beat.summary || beat.description}
                              </div>
                            ))}
                            {lightOutline.beats.length > 6 && (
                              <p className="text-xs text-muted-foreground text-center">
                                +{lightOutline.beats.length - 6} más...
                              </p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  /* SERIES/MINI: Show Episodes */
                  <div>
                    <Label className="text-xs uppercase text-muted-foreground mb-2 block">
                      Episodios ({lightOutline.episode_beats?.length || 0}) 
                      <span className="ml-2 text-[10px] font-normal normal-case text-muted-foreground/70">
                        (haz clic en el título para editarlo)
                      </span>
                    </Label>
                    <div className="space-y-2">
                      {lightOutline.episode_beats?.map((ep: any, idx: number) => (
                        <div key={ep.episode} className="p-2 bg-muted/30 rounded border">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm shrink-0">Ep {ep.episode}:</span>
                            <Input
                              value={ep.title || ''}
                              onChange={(e) => {
                                const newBeats = [...(lightOutline.episode_beats || [])];
                                newBeats[idx] = { ...newBeats[idx], title: e.target.value };
                                setLightOutline({ ...lightOutline, episode_beats: newBeats });
                              }}
                              className="h-7 text-sm font-medium border-transparent bg-transparent hover:border-input focus:border-input transition-colors"
                              placeholder="Título del episodio..."
                            />
                          </div>
                          <p className="text-xs text-muted-foreground mt-1 pl-12">{ep.summary}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* V11: Threads Display */}
                {lightOutline?.threads?.length > 0 && (
                  <ThreadsDisplay 
                    threads={lightOutline.threads} 
                    episodeBeats={lightOutline.episode_beats}
                  />
                )}

                {/* V11: Outline Wizard with QC Gating */}
                <OutlineWizardV11
                  outline={lightOutline}
                  qcStatus={qcStatus}
                  isEnriching={enrichingOutline}
                  isUpgrading={upgradingOutline}
                  isPipelineRunning={pipelineRunning}
                  format={format}
                  onEnrich={async () => {
                    if (!outlinePersistence.savedOutline?.id) return;
                    setEnrichingOutline(true);
                    try {
                      const { data, error } = await invokeAuthedFunction('outline-enrich', {
                        outline_id: outlinePersistence.savedOutline.id
                      });
                      if (error) throw error;
                      await outlinePersistence.refreshOutline();
                      if (data?.outline) setLightOutline(data.outline);
                      toast.success('Outline enriquecido con facciones, reglas y setpieces');
                    } catch (err) {
                      toast.error('Error al enriquecer: ' + (err as Error).message);
                    } finally {
                      setEnrichingOutline(false);
                    }
                  }}
                  onThreads={async () => {
                    if (!outlinePersistence.savedOutline?.id) return;
                    setEnrichingOutline(true);
                    try {
                      const { data, error } = await invokeAuthedFunction('outline-enrich', {
                        outline_id: outlinePersistence.savedOutline.id,
                        enrich_mode: 'threads'
                      });
                      if (error) throw error;
                      await outlinePersistence.refreshOutline();
                      if (data?.outline) setLightOutline(data.outline);
                      toast.success(`Generados ${data?.enriched?.threads || 0} threads con cruces por episodio`);
                    } catch (err) {
                      toast.error('Error al generar threads: ' + (err as Error).message);
                    } finally {
                      setEnrichingOutline(false);
                    }
                  }}
                  onShowrunner={handleUpgradeToShowrunner}
                  onGenerateEpisodes={approveAndGenerateEpisodes}
                  isStaleGenerating={outlinePersistence.isStaleGenerating}
                  canResume={outlinePersistence.canResume}
                  onResume={async () => {
                    const result = await outlinePersistence.resumeGeneration();
                    if (result.success) {
                      toast.info('Reanudando generación desde el último paso...');
                    } else if (result.errorCode === 'MAX_ATTEMPTS_EXCEEDED') {
                      toast.error('Máximo de intentos alcanzado. Regenera el outline.');
                    } else {
                      toast.error('Error al reanudar la generación');
                    }
                  }}
                  outlineParts={(outlinePersistence.savedOutline as any)?.outline_parts}
                  savedOutline={outlinePersistence.savedOutline}
                />

                {/* Time Warning */}
                <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                    <div className="text-sm">
                      <p className="font-medium text-amber-700 dark:text-amber-400">
                        Tiempo de generación: ~{(lightOutline.episode_beats?.length || episodesCount) * 5} minutos
                      </p>
                      <p className="text-muted-foreground text-xs mt-1">
                        Cada episodio tarda aproximadamente 5 minutos en generarse. 
                        Puedes navegar a otras secciones mientras se genera - el proceso continuará en segundo plano.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Legacy Action Buttons (hidden by default, wizard handles this) */}
                <div className="flex flex-wrap gap-3 pt-4 border-t">
                  <Button 
                    variant="gold" 
                    size="lg"
                    className="flex-1 min-w-[200px]"
                    onClick={approveAndGenerateEpisodes}
                    disabled={pipelineRunning || upgradingOutline || !qcStatus?.canGenerateEpisodes}
                  >
                    {qcStatus?.canGenerateEpisodes ? (
                      <>
                        <CheckCircle className="w-4 h-4 mr-2" />
                        {format === 'film' ? '✅ Aprobar y Generar Guión' : '✅ Aprobar y Generar Episodios'}
                      </>
                    ) : (
                      <>
                        <Lock className="w-4 h-4 mr-2" />
                        🔒 Completa el outline primero
                      </>
                    )}
                  </Button>
                  
                  {/* Showrunner Upgrade Button - Only show if not already showrunner */}
                  {outlinePersistence.savedOutline?.quality !== 'showrunner' && (
                    <Button 
                      variant="secondary"
                      onClick={handleUpgradeToShowrunner}
                      disabled={generatingOutline || pipelineRunning || upgradingOutline}
                      className="bg-purple-500/10 hover:bg-purple-500/20 border-purple-500/30 text-purple-700 dark:text-purple-300"
                    >
                      {upgradingOutline ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Mejorando...
                        </>
                      ) : (
                        <>
                          <Crown className="w-4 h-4 mr-2" />
                          Mejorar (Showrunner)
                        </>
                      )}
                    </Button>
                  )}
                  
                  {/* Badge if already showrunner */}
                  {outlinePersistence.savedOutline?.quality === 'showrunner' && (
                    <Badge variant="outline" className="h-10 px-4 bg-purple-500/10 border-purple-500/50 text-purple-600 dark:text-purple-400 flex items-center gap-2">
                      <Crown className="w-3 h-3" />
                      Nivel Showrunner
                    </Badge>
                  )}
                  
                  {/* Enrichment Button - Add Operational Meat */}
                  {outlinePersistence.savedOutline?.quality !== 'enriched' && (
                    <Button 
                      variant="outline"
                      onClick={async () => {
                        if (!outlinePersistence.savedOutline?.id) return;
                        setEnrichingOutline(true);
                        try {
                          const { data, error } = await invokeAuthedFunction('outline-enrich', {
                            outline_id: outlinePersistence.savedOutline.id
                          });
                          if (error) throw error;
                          await outlinePersistence.refreshOutline();
                          if (data?.outline) setLightOutline(data.outline);
                          toast.success('Outline enriquecido con facciones, reglas y setpieces');
                        } catch (err) {
                          toast.error('Error al enriquecer: ' + (err as Error).message);
                        } finally {
                          setEnrichingOutline(false);
                        }
                      }}
                      disabled={generatingOutline || pipelineRunning || upgradingOutline || enrichingOutline}
                      className="bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/30 text-emerald-700 dark:text-emerald-300"
                    >
                      {enrichingOutline ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Enriqueciendo...
                        </>
                      ) : (
                        <>
                          <Zap className="w-4 h-4 mr-2" />
                          Añadir Carne Operativa
                        </>
                      )}
                    </Button>
                  )}
                  
                  {/* Badge if enriched */}
                  {outlinePersistence.savedOutline?.quality === 'enriched' && (
                    <Badge variant="outline" className="h-10 px-4 bg-emerald-500/10 border-emerald-500/50 text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
                      <Zap className="w-3 h-3" />
                      Operativo
                    </Badge>
                  )}
                  
                  {/* V11: Threads Button - Add Narrative Lanes */}
                  {(outlinePersistence.savedOutline?.quality === 'enriched' || outlinePersistence.savedOutline?.quality === 'showrunner') && 
                   (!lightOutline?.threads || lightOutline.threads.length < 5 || 
                    !lightOutline?.episode_beats?.every((ep: any) => ep.thread_usage?.A)) && (
                    <Button 
                      variant="outline"
                      onClick={async () => {
                        if (!outlinePersistence.savedOutline?.id) return;
                        setEnrichingOutline(true);
                        try {
                          const { data, error } = await invokeAuthedFunction('outline-enrich', {
                            outline_id: outlinePersistence.savedOutline.id,
                            enrich_mode: 'threads'
                          });
                          if (error) throw error;
                          await outlinePersistence.refreshOutline();
                          if (data?.outline) setLightOutline(data.outline);
                          toast.success(`Generados ${data?.enriched?.threads || 0} threads con cruces por episodio`);
                        } catch (err) {
                          toast.error('Error al generar threads: ' + (err as Error).message);
                        } finally {
                          setEnrichingOutline(false);
                        }
                      }}
                      disabled={generatingOutline || pipelineRunning || upgradingOutline || enrichingOutline}
                      className="bg-indigo-500/10 hover:bg-indigo-500/20 border-indigo-500/30 text-indigo-700 dark:text-indigo-300"
                    >
                      {enrichingOutline ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Generando threads...
                        </>
                      ) : (
                        <>
                          <GitBranch className="w-4 h-4 mr-2" />
                          Añadir Threads ({lightOutline?.threads?.length || 0}/5-8)
                        </>
                      )}
                    </Button>
                  )}
                  
                  {/* Badge if threaded */}
                  {outlinePersistence.savedOutline?.quality === 'threaded' && (
                    <Badge variant="outline" className="h-10 px-4 bg-indigo-500/10 border-indigo-500/50 text-indigo-600 dark:text-indigo-400 flex items-center gap-2">
                      <GitBranch className="w-3 h-3" />
                      Threads V11
                    </Badge>
                  )}
                  
                  {/* Export PDF Button - Comprehensive mapping with try/catch */}
                  <Button 
                    variant="outline"
                    disabled={isExportingPdf}
                    onClick={async () => {
                      // V24: Use outlineForUI for stable reference during export
                      const outline = outlineForUI;
                      if (!outline) {
                        toast.error('No hay outline para exportar');
                        return;
                      }
                      
                      setIsExportingPdf(true);
                      
                      // Yield to event loop so React paints loading state
                      await new Promise(r => setTimeout(r, 0));
                      
                      try {
                        // Extract characters from cast or main_characters
                        const chars = outline.cast || outline.main_characters || [];
                        
                        // Extract locations from main_locations or locations
                        const locs = outline.main_locations || outline.locations || [];
                        
                        // Build acts structure with beats for film
                        const buildActs = () => {
                          if (format !== 'film' || !outline.acts_summary) return undefined;
                          
                          const allBeats = outline.beats || [];
                          
                          return [
                            {
                              act_number: 1,
                              title: 'Acto I',
                              goal: outline.acts_summary.act_i_goal,
                              summary: outline.acts_summary.act_i_summary,
                              inciting_incident: outline.acts_summary.inciting_incident_summary,
                              break_point: outline.acts_summary.act_i_break,
                              beats: allBeats.filter((b: any) => b.beat_number <= 8).map((b: any) => ({
                                beat_number: b.beat_number,
                                event: b.event || b.description,
                                agent: b.agent,
                                consequence: b.consequence,
                                situation_detail: b.situation_detail,
                              })),
                            },
                            {
                              act_number: 2,
                              title: 'Acto II',
                              goal: outline.acts_summary.act_ii_goal,
                              summary: outline.acts_summary.act_ii_summary,
                              midpoint: outline.acts_summary.midpoint_summary,
                              all_is_lost: outline.acts_summary.all_is_lost_summary,
                              break_point: outline.acts_summary.act_ii_break,
                              beats: allBeats.filter((b: any) => b.beat_number > 8 && b.beat_number <= 16).map((b: any) => ({
                                beat_number: b.beat_number,
                                event: b.event || b.description,
                                agent: b.agent,
                                consequence: b.consequence,
                                situation_detail: b.situation_detail,
                              })),
                            },
                            {
                              act_number: 3,
                              title: 'Acto III',
                              goal: outline.acts_summary.act_iii_goal,
                              summary: outline.acts_summary.act_iii_summary,
                              climax: outline.acts_summary.climax_summary,
                              beats: allBeats.filter((b: any) => b.beat_number > 16).map((b: any) => ({
                                beat_number: b.beat_number,
                                event: b.event || b.description,
                                agent: b.agent,
                                consequence: b.consequence,
                                situation_detail: b.situation_detail,
                              })),
                            },
                          ];
                        };
                        
                        // Build synopsis from acts_summary if not available
                        const buildSynopsis = (): string => {
                          if (outline.synopsis) return outline.synopsis;
                          
                          if (outline.acts_summary) {
                            const parts: string[] = [];
                            
                            // Acto I
                            if (outline.acts_summary.act_i_goal) {
                              parts.push(`ACTO I: ${outline.acts_summary.act_i_goal}`);
                            }
                            if (outline.acts_summary.inciting_incident_summary) {
                              parts.push(`Detonante: ${outline.acts_summary.inciting_incident_summary}`);
                            }
                            if (outline.acts_summary.act_i_break) {
                              parts.push(`Quiebre: ${outline.acts_summary.act_i_break}`);
                            }
                            
                            // Acto II
                            if (outline.acts_summary.act_ii_goal) {
                              parts.push(`\nACTO II: ${outline.acts_summary.act_ii_goal}`);
                            }
                            if (outline.acts_summary.midpoint_summary) {
                              parts.push(`Midpoint: ${outline.acts_summary.midpoint_summary}`);
                            }
                            if (outline.acts_summary.all_is_lost_summary) {
                              parts.push(`Crisis: ${outline.acts_summary.all_is_lost_summary}`);
                            }
                            
                            // Acto III
                            if (outline.acts_summary.act_iii_goal) {
                              parts.push(`\nACTO III: ${outline.acts_summary.act_iii_goal}`);
                            }
                            if (outline.acts_summary.climax_summary) {
                              parts.push(`Clímax: ${outline.acts_summary.climax_summary}`);
                            }
                            
                            return parts.join('\n');
                          }
                          
                          return '';
                        };
                        
                        const outlineData: OutlinePDFData = {
                          title: outline.title || 'Sin título',
                          logline: outline.logline,
                          synopsis: buildSynopsis(),
                          genre: outline.genre,
                          tone: outline.tone,
                          format: format,
                          estimatedDuration: outline.estimated_duration || (format === 'film' ? filmDurationMin : episodeDurationMin),
                          themes: outline.themes,
                          visualStyle: outline.visual_style,
                          thematic_thread: outline.thematic_thread,
                          
                          // Full character data with want/need/flaw/arc
                          characters: chars.map((char: any) => ({
                            name: char.name,
                            role: char.role,
                            role_detail: char.role_detail,
                            description: char.description || char.bio,
                            want: char.want,
                            need: char.need,
                            flaw: char.flaw,
                            decision_key: char.decision_key,
                            arc: char.arc,
                            arc_start: char.arc_start,
                            arc_end: char.arc_end,
                          })),
                          
                          // Full location data with visual identity
                          locations: locs.map((loc: any) => ({
                            name: loc.name,
                            type: loc.type,
                            description: loc.description,
                            visual_identity: loc.visual_identity,
                            function: loc.function,
                            narrative_role: loc.narrative_role || loc.role,
                          })),
                          
                          // Acts structure with beats (for film)
                          acts: buildActs(),
                          
                          // Episodes (for series)
                          episodes: format !== 'film' && outline.episode_beats
                            ? outline.episode_beats.map((ep: any, i: number) => ({
                                episode_number: ep.episode || i + 1,
                                title: ep.title || `Episodio ${i + 1}`,
                                synopsis: ep.summary || ep.synopsis,
                              }))
                            : undefined,
                          
                          // Factions
                          factions: outline.factions?.map((f: any) => ({
                            name: f.name,
                            leader: f.leader,
                            objective: f.objective,
                            method: f.method,
                            red_line: f.red_line,
                          })),
                          
                          // Entity rules (can/cannot do)
                          entity_rules: outline.entity_rules?.map((r: any) => ({
                            entity: r.entity,
                            can_do: r.can_do,
                            cannot_do: r.cannot_do,
                            cost: r.cost,
                            dramatic_purpose: r.dramatic_purpose,
                          })),
                          
                          // Subplots and twists
                          subplots: outline.subplots,
                          plot_twists: outline.plot_twists,
                        };
                        
                        exportOutlinePDF(outlineData);
                        toast.success('PDF del outline generado');
                      } catch (err: any) {
                        console.error('[ExportPDF] Error:', err);
                        toast.error('Error al exportar PDF: ' + (err?.message || 'Error desconocido'));
                      } finally {
                        setIsExportingPdf(false);
                      }
                    }}
                    className="gap-2"
                  >
                    {isExportingPdf ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Download className="w-4 h-4" />
                    )}
                    {isExportingPdf ? 'Generando...' : 'Exportar PDF'}
                  </Button>
                  
                  <Button 
                    variant="outline"
                    onClick={regenerateOutline}
                    disabled={generatingOutline || upgradingOutline}
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Regenerar
                  </Button>
                  <Button 
                    variant="destructive"
                    onClick={handleDeleteOutline}
                    disabled={pipelineRunning || generatingOutline || upgradingOutline || deletingAllData}
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Borrar
                  </Button>
                  
                  {/* DELETE ALL - Nuclear reset */}
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button 
                        variant="outline"
                        className="border-destructive/50 text-destructive hover:bg-destructive/10"
                        disabled={pipelineRunning || generatingOutline || deletingAllData}
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Borrar TODO
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2 text-destructive">
                          <AlertTriangle className="w-5 h-5" />
                          ¿Borrar TODO y empezar de cero?
                        </AlertDialogTitle>
                        <AlertDialogDescription className="space-y-3">
                          <p>Esta acción eliminará permanentemente:</p>
                          <ul className="list-disc pl-6 text-sm space-y-1">
                            <li>Outline y estructura narrativa</li>
                            <li>Todos los guiones y escenas</li>
                            <li>Personajes, locaciones y props</li>
                            <li>Storyboards y renders</li>
                            <li>Histórico de generaciones</li>
                          </ul>
                          <p className="font-medium text-destructive pt-2">
                            El proyecto se mantendrá, pero completamente vacío. Esta acción NO se puede deshacer.
                          </p>
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction 
                          onClick={handleDeleteAllProjectData}
                          className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                        >
                          {deletingAllData && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                          Sí, borrar TODO
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </CardContent>
            </Card>
          )}

          {/* APPROVED OUTLINE WITHOUT SCRIPT - Show content + CTA to generate */}
          {lightOutline && outlineApproved && !generatedScript && !pipelineRunning && (
            <Card className="border-2 border-green-500/50 bg-green-500/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-green-500" />
                  Outline Aprobado
                </CardTitle>
                <CardDescription>
                  Tu outline está listo. Ahora puedes generar el guion completo.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Title & Logline */}
                <div className="p-4 bg-background rounded-lg border">
                  <h3 className="font-bold text-xl mb-2">{lightOutline.title}</h3>
                  <p className="text-muted-foreground italic">{lightOutline.logline}</p>
                  <div className="flex gap-2 mt-3">
                    {lightOutline.genre && <Badge variant="secondary">{lightOutline.genre}</Badge>}
                    {lightOutline.tone && <Badge variant="outline">{lightOutline.tone}</Badge>}
                  </div>
                </div>

                {/* Synopsis */}
                {lightOutline.synopsis && (
                  <div>
                    <Label className="text-xs uppercase text-muted-foreground">Sinopsis</Label>
                    <p className="text-sm mt-1">{lightOutline.synopsis}</p>
                  </div>
                )}

                {/* Characters */}
                <div>
                  <Label className="text-xs uppercase text-muted-foreground mb-2 block">
                    Personajes {bibleLoading || materializingEntities ? '' : `(${outlineForUI?.main_characters?.length || 0})`}
                  </Label>
                  <div className="grid gap-2 md:grid-cols-2">
                    {(outlineForUI?.main_characters ?? []).map((char: any, i: number) => {
                      const role = char.role || '';
                      const variant = role === 'protagonist' ? 'default' : role === 'antagonist' ? 'destructive' : 'secondary';
                      // V22: Use normalized description (already populated by normalizeOutlineForDisplay)
                      const charDescription = char.description || getCharacterDescription(char);
                      return (
                        <div key={i} className="p-2 bg-muted/30 rounded border">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant={variant}>{char.name}</Badge>
                            {role && <span className="text-xs text-muted-foreground">{role}</span>}
                          </div>
                          {charDescription && (
                            <p className="text-xs text-muted-foreground mt-1">{charDescription}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Locations */}
                <div>
                  <Label className="text-xs uppercase text-muted-foreground mb-2 block">
                    Localizaciones {bibleLoading || materializingEntities ? '' : `(${outlineForUI?.main_locations?.length || 0})`}
                  </Label>
                  <div className="grid gap-2 md:grid-cols-2">
                    {(outlineForUI?.main_locations ?? []).map((loc: any, i: number) => {
                      // V22: Use normalized description (already populated by normalizeOutlineForDisplay)
                      const locDescription = loc.description || getLocationDescription(loc);
                      return (
                        <div key={i} className="p-2 bg-muted/30 rounded border">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline">{loc.name}</Badge>
                            {loc.type && <span className="text-xs text-muted-foreground">{loc.type}</span>}
                          </div>
                          {locDescription && (
                            <p className="text-xs text-muted-foreground mt-1">{locDescription}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* V7: FILM vs SERIES structure (simple view) */}
                {format === 'film' ? (
                  <div>
                    <Label className="text-xs uppercase text-muted-foreground mb-2 block flex items-center gap-2">
                      <Film className="w-3 h-3" />
                      Estructura de 3 Actos
                    </Label>
                    <div className="grid gap-2 md:grid-cols-3">
                      <div className="p-2 bg-green-500/10 rounded border border-green-500/30">
                        <span className="text-xs font-medium text-green-600 dark:text-green-400 block">Acto I</span>
                        <p className="text-xs text-muted-foreground">{lightOutline.acts_summary?.act_i_goal || 'Setup'}</p>
                      </div>
                      <div className="p-2 bg-amber-500/10 rounded border border-amber-500/30">
                        <span className="text-xs font-medium text-amber-600 dark:text-amber-400 block">Acto II</span>
                        <p className="text-xs text-muted-foreground">{lightOutline.acts_summary?.act_ii_goal || 'Confrontación'}</p>
                      </div>
                      <div className="p-2 bg-red-500/10 rounded border border-red-500/30">
                        <span className="text-xs font-medium text-red-600 dark:text-red-400 block">Acto III</span>
                        <p className="text-xs text-muted-foreground">{lightOutline.acts_summary?.act_iii_goal || 'Resolución'}</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div>
                    <Label className="text-xs uppercase text-muted-foreground mb-2 block">
                      Episodios ({lightOutline.episode_beats?.length || 0})
                    </Label>
                    <div className="space-y-2">
                      {lightOutline.episode_beats?.map((ep: any, idx: number) => (
                        <div key={ep.episode || idx} className="p-2 bg-muted/30 rounded border">
                          <span className="font-medium text-sm">Ep {ep.episode}: {ep.title}</span>
                          {ep.summary && <p className="text-xs text-muted-foreground mt-1">{ep.summary}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* V11 Wizard for approved outlines */}
                {qcStatus && (
                  <OutlineWizardV11
                    outline={lightOutline}
                    qcStatus={qcStatus}
                    isEnriching={enrichingOutline}
                    isUpgrading={upgradingOutline}
                    isPipelineRunning={pipelineRunning}
                    format={format}
                    onEnrich={async () => {
                      if (!outlinePersistence.savedOutline?.id) return;
                      setEnrichingOutline(true);
                      try {
                        const { data, error } = await invokeAuthedFunction('outline-enrich', {
                          outline_id: outlinePersistence.savedOutline.id
                        });
                        if (error) throw error;
                        await outlinePersistence.refreshOutline();
                        if (data?.outline) setLightOutline(data.outline);
                        toast.success('Outline enriquecido con facciones, reglas y setpieces');
                      } catch (err) {
                        toast.error('Error al enriquecer: ' + (err as Error).message);
                      } finally {
                        setEnrichingOutline(false);
                      }
                    }}
                    onThreads={async () => {
                      if (!outlinePersistence.savedOutline?.id) return;
                      setEnrichingOutline(true);
                      try {
                        const { data, error } = await invokeAuthedFunction('outline-enrich', {
                          outline_id: outlinePersistence.savedOutline.id,
                          enrich_mode: 'threads'
                        });
                        if (error) throw error;
                        await outlinePersistence.refreshOutline();
                        if (data?.outline) setLightOutline(data.outline);
                        toast.success(`Generados ${data?.enriched?.threads || 0} threads con cruces por episodio`);
                      } catch (err) {
                        toast.error('Error al generar threads: ' + (err as Error).message);
                      } finally {
                        setEnrichingOutline(false);
                      }
                    }}
                    onShowrunner={handleUpgradeToShowrunner}
                    onGenerateEpisodes={approveAndGenerateEpisodes}
                    isStaleGenerating={outlinePersistence.isStaleGenerating}
                    canResume={outlinePersistence.canResume}
                    onResume={async () => {
                      const result = await outlinePersistence.resumeGeneration();
                      if (result.success) {
                        toast.info('Reanudando generación desde el último paso...');
                      } else if (result.errorCode === 'MAX_ATTEMPTS_EXCEEDED') {
                        toast.error('Máximo de intentos alcanzado. Regenera el outline.');
                      } else {
                        toast.error('Error al reanudar la generación');
                      }
                    }}
                    outlineParts={(outlinePersistence.savedOutline as any)?.outline_parts}
                    savedOutline={outlinePersistence.savedOutline}
                  />
                )}

                {/* CTA Buttons */}
                <div className="flex gap-3 flex-wrap pt-4 border-t">
                  <Button 
                    variant="gold" 
                    size="lg"
                    className="flex-1 min-w-[200px]"
                    onClick={approveAndGenerateEpisodes}
                    disabled={pipelineRunning || !qcStatus?.canGenerateEpisodes}
                  >
                    <Sparkles className="w-4 h-4 mr-2" />
                    Generar Guion Completo
                  </Button>
                  <Button 
                    variant="outline"
                    onClick={async () => {
                      if (outlinePersistence.savedOutline?.id) {
                        await outlinePersistence.saveOutline({
                          outline: lightOutline,
                          quality: outlinePersistence.savedOutline.quality || 'light',
                          status: 'completed'
                        });
                        setOutlineApproved(false);
                        toast.info('Outline vuelto a estado de revisión');
                      }
                    }}
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Volver a Revisar
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* EPISODE GENERATION PROGRESS - Clean Commercial UI */}
          {pipelineRunning && (
            <Card className="border-2 border-blue-500/50 bg-blue-500/5">
              <CardContent className="pt-6 space-y-4">
                {/* Main Progress Display */}
                <div className="text-center space-y-2">
                  <div className="text-4xl font-bold text-primary">
                    {pipelineProgress}%
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {pipelineProgress < 100 
                      ? `Generando guion • ${formatDurationMs(getEstimatedRemainingMs())} restante`
                      : 'Finalizando...'}
                  </p>
                </div>
                
                <Progress value={pipelineProgress} className="h-3" />
                
                {/* Episode Pills - Visual Progress */}
                <div className="space-y-2">
                  <p className="text-xs text-center text-muted-foreground font-medium uppercase tracking-wide">Episodios</p>
                  <div className="flex justify-center gap-1 flex-wrap">
                    {Array.from({ length: totalEpisodesToGenerate }, (_, i) => {
                      const epNum = i + 1;
                      const isCompleted = generatedEpisodesList.some(ep => ep.episode_number === epNum);
                      const isCurrentlyGenerating = currentEpisodeGenerating === epNum;
                      const hasError = generatedEpisodesList.find(ep => ep.episode_number === epNum)?.error;
                      
                      return (
                        <div
                          key={i}
                          className={`
                            w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium transition-all
                            ${isCompleted && !hasError ? 'bg-green-500 text-white' : ''}
                            ${hasError ? 'bg-red-500 text-white' : ''}
                            ${isCurrentlyGenerating ? 'bg-blue-500 text-white animate-pulse' : ''}
                            ${!isCompleted && !isCurrentlyGenerating ? 'bg-muted text-muted-foreground' : ''}
                          `}
                        >
                          {isCompleted && !hasError ? <CheckCircle className="w-4 h-4" /> : epNum}
                        </div>
                      );
                    })}
                  </div>
                </div>
                
                {/* Background Mode Notice */}
                <div className="p-2 bg-blue-500/10 rounded border border-blue-500/20">
                  <p className="text-xs text-blue-600 dark:text-blue-400 flex items-center justify-center gap-2">
                    <Rocket className="w-3 h-3" />
                    Puedes navegar libremente. La generación continúa en segundo plano.
                  </p>
                </div>

                <div className="flex justify-center">
                  <Button 
                    variant="destructive" 
                    size="sm"
                    onClick={cancelGeneration}
                  >
                    <XCircle className="w-4 h-4 mr-2" />
                    Cancelar
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* V11: Zombie Outline Warning - when heartbeat is stale but status is still generating */}
          {isZombieOutline && !pipelineRunning && (
            <Card className="border-2 border-destructive/50 bg-destructive/5">
              <CardContent className="pt-6">
                <div className="space-y-4">
                  <div className="flex items-start gap-4">
                    <AlertTriangle className="h-8 w-8 text-destructive flex-shrink-0" />
                    <div className="flex-1">
                      <h3 className="font-semibold text-destructive">
                        Generación atascada
                      </h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        El proceso de outline no ha respondido en más de 5 minutos. 
                        Esto puede ocurrir por un timeout del servidor o un error de red.
                      </p>
                    </div>
                  </div>
                  
                  {/* Show last known progress */}
                  {outlinePersistence.savedOutline?.progress && (
                    <div className="p-3 bg-muted/50 rounded-lg">
                      <p className="text-sm text-muted-foreground">
                        Último progreso: <span className="font-mono font-medium">{outlinePersistence.savedOutline.progress}%</span>
                        {outlinePersistence.savedOutline.substage && (
                          <> • Etapa: <span className="font-medium">{outlinePersistence.savedOutline.substage}</span></>
                        )}
                      </p>
                    </div>
                  )}
                  
                  <div className="flex gap-2">
                    <Button 
                      variant="destructive"
                      onClick={handleResetZombieOutline}
                      className="flex-1"
                    >
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Marcar como fallido y reintentar
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        outlinePersistence.refreshOutline();
                        toast.info('Verificando estado...');
                      }}
                    >
                      Verificar
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
          
          {/* V11.1: Error/Failed Outline Recovery Card - Shows for recoverable errors */}
          {(() => {
            const saved = outlinePersistence.savedOutline;
            if (!saved) return null;
            
            const status = saved.status;
            const errorCode = saved.error_code;
            const quality = saved.quality;
            
            // V11.1: Unified recovery detection
            // Case 1: Error status with recoverable error_code
            const isRecoverableError = status === 'error' && 
              errorCode && RECOVERABLE_ERROR_CODES.includes(errorCode);
            
            // Case 2: Error without specific code (generic error)
            const isGenericError = status === 'error' && !errorCode;
            
            // Case 3: Timeout status (exists in DB)
            const isTimeout = status === 'timeout';
            
            // Case 4: Zombie - generating with stale heartbeat (already detected above)
            const isZombie = isZombieOutline;
            
            // Case 5: Degraded quality that might need retry
            const isDegraded = (status === 'completed' || status === 'approved') && 
              quality === 'degraded';
            
            // V11.1: Show recovery if any condition met
            // REMOVED: !lightOutline check - show even if partial outline exists
            const shouldShowRecovery = 
              (isRecoverableError || isGenericError || isTimeout || isZombie || isDegraded) && 
              !generatingOutline && !pipelineRunning;
            
            if (!shouldShowRecovery) return null;
            
            // Get resumable info for intelligent retry
            const resumeInfo = getResumableInfo(saved);
            
            // Get friendly title based on error code or state
            const getErrorTitle = () => {
              if (isZombie) return 'Proceso detenido';
              if (isDegraded) return 'Outline con calidad degradada';
              switch (errorCode) {
                case 'ZOMBIE_TIMEOUT': return 'Proceso interrumpido';
                case 'AI_TIMEOUT': return 'Timeout del modelo AI';
                case 'STAGE_TIMEOUT': return 'Timeout de etapa';
                case 'WORKER_TIMEOUT': return 'Worker no respondió';
                case 'QUEUE_TIMEOUT': return 'Tiempo de espera agotado';
                case 'RATE_LIMIT': return 'Límite de velocidad';
                default: return 'Error en la generación';
              }
            };
            
            return (
              <Card className="border-2 border-orange-500/50 bg-orange-500/5">
                <CardContent className="pt-6">
                  <div className="space-y-4">
                    <div className="flex items-start gap-4">
                      <AlertTriangle className="h-8 w-8 text-orange-500 flex-shrink-0" />
                      <div className="flex-1">
                        <h3 className="font-semibold text-orange-600 dark:text-orange-400">
                          {getErrorTitle()}
                        </h3>
                        <p className="text-sm text-muted-foreground mt-1">
                          {isZombie 
                            ? 'El proceso de generación dejó de responder. Puedes marcarlo como fallido y reintentar.'
                            : isDegraded
                            ? 'El outline fue generado pero con calidad reducida. Puedes intentar regenerarlo.'
                            : saved.error_detail || 
                              'El proceso anterior no completó correctamente. Puedes reintentar la generación.'}
                        </p>
                        <div className="flex gap-2 mt-2 flex-wrap">
                          {errorCode && (
                            <Badge variant="outline" className="text-xs">
                              {errorCode}
                            </Badge>
                          )}
                          {saved.stage && saved.stage !== 'done' && (
                            <Badge variant="secondary" className="text-xs">
                              Etapa: {saved.stage}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    {/* Show last known progress if available */}
                    {(saved.progress ?? 0) > 0 && (
                      <div className="p-3 bg-muted/50 rounded-lg">
                        <div className="flex justify-between text-sm text-muted-foreground mb-2">
                          <span>Progreso alcanzado</span>
                          <span className="font-mono">{saved.progress}%</span>
                        </div>
                        <Progress value={saved.progress ?? 0} className="h-2" />
                      </div>
                    )}
                    
                    <div className="flex gap-2 flex-wrap">
                      {/* V11.1: Resume button if parts exist */}
                      {resumeInfo.canResume && !isZombie && (
                        <Button 
                          onClick={() => handleResumeGeneration(resumeInfo.fromStep!)}
                          className="flex-1"
                        >
                          <PlayCircle className="h-4 w-4 mr-2" />
                          {resumeInfo.label}
                        </Button>
                      )}
                      
                      {/* Zombie needs to be marked as failed first */}
                      {isZombie && (
                        <Button 
                          onClick={handleResetZombieOutline}
                          variant="destructive"
                          className="flex-1"
                        >
                          <RefreshCw className="h-4 w-4 mr-2" />
                          Marcar como fallido
                        </Button>
                      )}
                      
                      {/* Retry from scratch */}
                      {!isZombie && (
                        <Button 
                          onClick={generateOutlineDirect}
                          disabled={!ideaText.trim() || ideaText.trim().length < 30}
                          variant={resumeInfo.canResume ? "outline" : "default"}
                          className={resumeInfo.canResume ? "" : "flex-1"}
                        >
                          <RefreshCw className="h-4 w-4 mr-2" />
                          {resumeInfo.canResume ? 'Reintentar todo' : 'Reintentar generación'}
                        </Button>
                      )}
                      
                      <Button
                        variant="outline"
                        onClick={async () => {
                          await outlinePersistence.deleteOutline?.();
                          toast.info('Outline eliminado. Puedes empezar de nuevo.');
                        }}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Descartar
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })()}

          {/* V7.0: Outline Generation Progress Card with stage-aware progress */}
          {generatingOutline && !pipelineRunning && !isZombieOutline && (() => {
            const stageInfo = getStageInfo(outlinePersistence.savedOutline?.stage);
            const derivedProgress = deriveProgress(
              outlinePersistence.savedOutline?.stage,
              outlinePersistence.savedOutline?.progress
            );
            
            return (
              <Card className="border-2 border-amber-500/50 bg-amber-500/5">
                <CardContent className="pt-6">
                  <div className="space-y-4">
                    {/* Header with animated icon and stage info */}
                    <div className="flex items-center gap-4">
                      <div className="relative w-14 h-14 flex-shrink-0">
                        <Sparkles className="h-7 w-7 mx-auto text-amber-500 absolute inset-0 m-auto animate-pulse" />
                        <div className="absolute inset-0 border-4 border-t-amber-500 border-r-transparent border-b-amber-500/30 border-l-transparent rounded-full animate-spin" />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold text-amber-600 dark:text-amber-400">
                          {stageInfo.label}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          {stageInfo.description}
                        </p>
                      </div>
                    </div>
                    
                    {/* Real progress bar */}
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Progreso</span>
                        <span>{Math.round(derivedProgress)}%</span>
                      </div>
                      <Progress value={derivedProgress} className="h-2" />
                    </div>
                    
                    {/* Elapsed time with active indicator */}
                    <div className="flex items-center justify-center gap-4 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                        <span className="text-muted-foreground">Activo</span>
                      </div>
                      <span className="font-mono text-lg text-amber-600 dark:text-amber-400">
                        {Math.floor(outlineElapsedSeconds / 60)}:{String(outlineElapsedSeconds % 60).padStart(2, '0')}
                      </span>
                    </div>
                    
                    {/* V7: Stuck warning */}
                    {outlinePersistence.isStuck && (
                      <div className="p-3 bg-orange-500/10 border border-orange-500/30 rounded-lg">
                        <div className="flex items-center gap-2 text-orange-600 dark:text-orange-400">
                          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                          <span className="text-sm font-medium">Posible bloqueo detectado</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          El proceso no ha progresado en un rato. Puedes reintentar la etapa actual.
                        </p>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="mt-2"
                          onClick={async () => {
                            const success = await outlinePersistence.retryCurrentStage?.();
                            if (success) {
                              toast.info('Reintentando etapa actual...');
                            } else {
                              toast.error('No se pudo reintentar');
                            }
                          }}
                        >
                          <RefreshCw className="w-3 h-3 mr-2" />
                          Reintentar etapa
                        </Button>
                      </div>
                    )}
                    
                    {/* V12.0: Outline Status Panel (compact mode) */}
                    <OutlineStatusPanel
                      outline={outlinePersistence.savedOutline}
                      projectId={projectId}
                      isPolling={outlinePersistence.isPolling}
                      isStuck={outlinePersistence.isStuck}
                      stuckSince={outlinePersistence.stuckSince}
                      onRefresh={outlinePersistence.refreshOutline}
                      onContinueInBackground={() => {
                        // Close overlay but keep polling
                        setGeneratingOutline(false);
                        setOutlineStartTime(null);
                        toast.info('Generación continúa en segundo plano', {
                          description: 'Recibirás una notificación cuando termine.',
                          duration: 5000,
                        });
                      }}
                      onForceUnlockSuccess={() => {
                        // Refresh state after unlock
                        outlinePersistence.refreshOutline();
                        setGeneratingOutline(false);
                        setOutlineStartTime(null);
                      }}
                      compact
                    />
                    
                    {/* Background notice */}
                    <div className="p-2 bg-amber-500/10 rounded border border-amber-500/20">
                      <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center justify-center gap-2">
                        <Rocket className="w-3 h-3" />
                        Puedes navegar. La generación continúa en segundo plano.
                      </p>
                    </div>
                    
                    {/* V12.0: Improved action buttons */}
                    <div className="flex justify-center gap-2">
                      <Button 
                        variant="secondary" 
                        size="sm"
                        onClick={() => {
                          setGeneratingOutline(false);
                          setOutlineStartTime(null);
                          toast.info('Generación continúa en segundo plano');
                        }}
                      >
                        <Rocket className="h-4 w-4 mr-2" />
                        Continuar en segundo plano
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => {
                          outlinePersistence.stopPolling?.();
                          setGeneratingOutline(false);
                          setOutlineStartTime(null);
                          updatePipelineStep('outline', 'pending');
                          toast.info('Generación cancelada');
                        }}
                      >
                        <Square className="h-4 w-4 mr-2" />
                        Cancelar
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })()}

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Idea & Format */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center justify-between">
                  <span>Tu Idea</span>
                  <div className="flex items-center gap-2">
                    {voiceRecorder.isRecording && (
                      <div className="flex items-center gap-1.5 text-xs text-destructive animate-pulse">
                        <div className="w-2 h-2 rounded-full bg-destructive" />
                        {Math.floor(voiceRecorder.recordingTime / 60)}:{String(voiceRecorder.recordingTime % 60).padStart(2, '0')}
                      </div>
                    )}
                    {voiceRecorder.isTranscribing && (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Transcribiendo...
                      </div>
                    )}
                    <Button
                      type="button"
                      variant={voiceRecorder.isRecording ? "destructive" : "outline"}
                      size="sm"
                      className="h-7 gap-1.5 text-xs"
                      onClick={voiceRecorder.toggleRecording}
                      disabled={pipelineRunning || voiceRecorder.isTranscribing}
                    >
                      {voiceRecorder.isRecording ? (
                        <>
                          <Square className="h-3 w-3" />
                          Detener
                        </>
                      ) : (
                        <>
                          <Mic className="h-3.5 w-3.5" />
                          Dictar
                        </>
                      )}
                    </Button>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea
                  placeholder="Ej: Una detective de homicidios descubre que su padre... (o pulsa 'Dictar' para usar tu voz)"
                  value={ideaText}
                  onChange={(e) => setIdeaText(e.target.value)}
                  className="min-h-[120px]"
                  disabled={voiceRecorder.isRecording}
                />
                
                {/* V3.0: Toggle para desactivar densidad narrativa */}
                <div className="flex items-center space-x-2 pt-3 border-t border-border/50">
                  <Checkbox
                    id="disableDensityImport"
                    checked={disableDensity}
                    onCheckedChange={(checked) => setDisableDensity(checked === true)}
                  />
                  <Label htmlFor="disableDensityImport" className="text-sm font-normal cursor-pointer">
                    Sin densidad narrativa
                  </Label>
                  <span className="text-xs text-muted-foreground">
                    (genera solo lo que aportes)
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Formato</Label>
                    <Select value={format} onValueChange={(v: 'film' | 'series') => handleFormatChange(v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="series">Serie</SelectItem>
                        <SelectItem value="film">Película</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {format === 'series' ? (
                    <>
                      <div className="space-y-2">
                        <Label>Nº Episodios</Label>
                        <Select value={String(episodesCount)} onValueChange={(v) => handleEpisodesCountChange(Number(v))}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {[3, 4, 6, 8, 10, 12].map(n => (
                              <SelectItem key={n} value={String(n)}>{n} episodios</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Duración/ep</Label>
                        <div className="flex items-center gap-2">
                          <Input 
                            type="number" 
                            min={5} 
                            max={180} 
                            value={episodeDurationMin} 
                            onChange={(e) => handleEpisodeDurationChange(parseInt(e.target.value) || 30)} 
                            className="w-20"
                          />
                          <span className="text-sm text-muted-foreground">min</span>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="space-y-2">
                      <Label>Duración</Label>
                      <div className="flex items-center gap-2">
                        <Input 
                          type="number" 
                          min={10} 
                          max={300} 
                          value={filmDurationMin} 
                          onChange={(e) => handleFilmDurationChange(parseInt(e.target.value) || 90)} 
                          className="w-20"
                        />
                        <span className="text-sm text-muted-foreground">min</span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Género</Label>
                    <Select value={genre} onValueChange={setGenre}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="drama">Drama</SelectItem>
                        <SelectItem value="thriller">Thriller</SelectItem>
                        <SelectItem value="comedy">Comedia</SelectItem>
                        <SelectItem value="action">Acción</SelectItem>
                        <SelectItem value="horror">Terror</SelectItem>
                        <SelectItem value="sci-fi">Ciencia Ficción</SelectItem>
                        <SelectItem value="crime">Crimen</SelectItem>
                        <SelectItem value="romance">Romance</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Tono</Label>
                    <Select value={tone} onValueChange={setTone}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Cinematográfico realista">Cinematográfico realista</SelectItem>
                        <SelectItem value="Oscuro y tenso">Oscuro y tenso</SelectItem>
                        <SelectItem value="Ligero y entretenido">Ligero y entretenido</SelectItem>
                        <SelectItem value="Épico y grandioso">Épico y grandioso</SelectItem>
                        <SelectItem value="Intimista y emocional">Intimista y emocional</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Referencias (inspiración, no copiar)</Label>
                  <Input
                    placeholder="Ej: True Detective, Mindhunter, Sicario..."
                    value={references}
                    onChange={(e) => setReferences(e.target.value)}
                  />
                </div>

                {/* MASTER SHOWRUNNER: Modo Narrativo */}
                <div className="space-y-2 pt-4 border-t">
                  <Label className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-primary" />
                    Modo Narrativo
                  </Label>
                  <Select value={narrativeMode} onValueChange={(v: 'serie_adictiva' | 'voz_de_autor' | 'giro_imprevisible') => setNarrativeMode(v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="serie_adictiva">
                        🔥 Serie Adictiva
                      </SelectItem>
                      <SelectItem value="voz_de_autor">
                        ✍️ Voz de Autor
                      </SelectItem>
                      <SelectItem value="giro_imprevisible">
                        🔀 Giro Imprevisible
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {narrativeMode === 'serie_adictiva' && 'Ritmo alto, cliffhangers potentes, eventos irreversibles cada episodio.'}
                    {narrativeMode === 'voz_de_autor' && 'Respeta el ADN del texto original, densidad literaria, temas recurrentes.'}
                    {narrativeMode === 'giro_imprevisible' && 'Giros estructurales, narradores no fiables, recontextualizaciones (Mr. Robot, Dark).'}
                  </p>
                </div>
                
                {/* V3.0: Quality Tier Selector (replaces legacy model selector) */}
                <div className="space-y-2 pt-4 border-t">
                  <Label className="flex items-center gap-2">
                    <Rocket className="w-4 h-4 text-primary" />
                    Modo de Generación
                  </Label>
                  <Select value={qualityTier} onValueChange={(v: QualityTier) => setQualityTier(v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="rapido">
                        {QUALITY_TIERS.rapido.displayName}
                      </SelectItem>
                      <SelectItem value="profesional">
                        {QUALITY_TIERS.profesional.displayName}
                      </SelectItem>
                      <SelectItem value="hollywood">
                        {QUALITY_TIERS.hollywood.displayName}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {QUALITY_TIERS[qualityTier]?.description || 'Selecciona un modo de generación'}
                  </p>
                  <div className="flex gap-2 flex-wrap mt-1">
                    <Badge variant="outline" className="text-xs">
                      ~{QUALITY_TIERS[qualityTier]?.estimatedTimePerEpisodeMin || 5} min/ep
                    </Badge>
                    {qualityTier === 'hollywood' && (
                      <Badge variant="secondary" className="text-xs bg-primary/10">
                        ✨ Calidad Hollywood
                      </Badge>
                    )}
                  </div>
                </div>
              </CardContent>
              
              {/* V10.1: Always visible Generate/Regenerate Button */}
              <CardFooter className="pt-0">
                <Button 
                  variant="gold" 
                  className="w-full"
                  onClick={generateOutlineDirect} 
                  disabled={generatingOutline || !ideaText.trim() || pipelineRunning}
                >
                  {generatingOutline ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Generando Outline...</>
                  ) : lightOutline || outlinePersistence.savedOutline ? (
                    <><RefreshCw className="w-4 h-4 mr-2" />Regenerar Outline</>
                  ) : (
                    <><Sparkles className="w-4 h-4 mr-2" />Generar Outline</>
                  )}
                </Button>
              </CardFooter>
            </Card>

            {/* Density Settings */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Settings2 className="w-4 h-4" />
                    Densidad Narrativa
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-normal text-muted-foreground">Modo PRO</span>
                    <Switch checked={proMode} onCheckedChange={setProMode} />
                  </div>
                </CardTitle>
                <CardDescription>
                  {proMode ? 'Edita los targets manualmente' : 'Targets calculados automáticamente'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {!proMode && (
                  <div className="space-y-2">
                    <Label>Complejidad</Label>
                    <Select value={complexity} onValueChange={(v: 'simple' | 'medium' | 'high') => setComplexity(v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="simple">Simple</SelectItem>
                        <SelectItem value="medium">Media</SelectItem>
                        <SelectItem value="high">Alta</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {targets && (
                  <div className="grid grid-cols-2 gap-3">
                    <TargetField label="Protagonistas" value={targets.protagonists_min} editable={proMode} onChange={(v) => setTargets({...targets, protagonists_min: v})} />
                    <TargetField label="Secundarios" value={targets.supporting_min} editable={proMode} onChange={(v) => setTargets({...targets, supporting_min: v})} />
                    <TargetField label="Extras c/frase" value={targets.extras_min} editable={proMode} onChange={(v) => setTargets({...targets, extras_min: v})} />
                    <TargetField label="Localizaciones" value={targets.locations_min} editable={proMode} onChange={(v) => setTargets({...targets, locations_min: v})} />
                    <TargetField label="Props clave" value={targets.hero_props_min} editable={proMode} onChange={(v) => setTargets({...targets, hero_props_min: v})} />
                    <TargetField label="Setpieces" value={targets.setpieces_min} editable={proMode} onChange={(v) => setTargets({...targets, setpieces_min: v})} />
                    <TargetField label="Subtramas" value={targets.subplots_min} editable={proMode} onChange={(v) => setTargets({...targets, subplots_min: v})} />
                    <TargetField label="Giros" value={targets.twists_min} editable={proMode} onChange={(v) => setTargets({...targets, twists_min: v})} />
                    {format === 'series' && targets.scenes_per_episode && (
                      <TargetField label="Escenas/ep" value={targets.scenes_per_episode} editable={proMode} onChange={(v) => setTargets({...targets, scenes_per_episode: v})} />
                    )}
                    {format === 'film' && targets.scenes_target && (
                      <TargetField label="Escenas total" value={targets.scenes_target} editable={proMode} onChange={(v) => setTargets({...targets, scenes_target: v})} />
                    )}
                    <div className="col-span-2">
                      <Label className="text-xs text-muted-foreground">Ratio Diálogo/Acción</Label>
                      <Badge variant="secondary" className="mt-1">{targets.dialogue_action_ratio}</Badge>
                    </div>
                    
                    {/* V3.0: Dynamic Batch Configuration Preview */}
                    {(() => {
                      const batchPreview = calculateDynamicBatches(targets, complexity, undefined, episodeDurationMin, qualityTier);
                      const tierCfg = QUALITY_TIERS[qualityTier];
                      const totalTimeMin = episodesCount * tierCfg.estimatedTimePerEpisodeMin;
                      return (
                        <div className="col-span-2 pt-2 border-t mt-2">
                          <Label className="text-xs text-muted-foreground flex items-center gap-1">
                            <Settings2 className="w-3 h-3" />
                            Estimación con {tierCfg.displayName}
                          </Label>
                          <div className="flex flex-wrap gap-2 mt-1">
                            <Badge variant="outline" className="text-xs">
                              {batchPreview.batchesPerEpisode} batches/episodio
                            </Badge>
                            <Badge variant="outline" className="text-xs">
                              {batchPreview.scenesPerBatch} escenas/batch
                            </Badge>
                            <Badge variant="outline" className="text-xs bg-primary/10">
                              ~{batchPreview.estimatedScenesTotal} escenas/episodio
                            </Badge>
                          </div>
                          <div className="flex flex-wrap gap-2 mt-2">
                            <Badge variant="secondary" className="text-xs">
                              ⏱️ ~{totalTimeMin < 60 ? `${totalTimeMin.toFixed(0)} min` : `${(totalTimeMin / 60).toFixed(1)} hrs`} total
                            </Badge>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* QC Result */}
          {qcResult && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  {qcResult.passes ? <CheckCircle className="w-5 h-5 text-green-500" /> : <AlertTriangle className="w-5 h-5 text-orange-500" />}
                  QC del Outline: {qcResult.passes ? 'APROBADO' : 'REVISIÓN NECESARIA'}
                </CardTitle>
              </CardHeader>
              {qcResult.issues?.length > 0 && (
                <CardContent>
                  <div className="space-y-2">
                    {qcResult.issues.map((issue: any, i: number) => (
                      <div key={i} className={`p-2 rounded border ${getSeverityColor(issue.severity)}`}>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{issue.severity}</Badge>
                          <span className="text-sm font-medium">{issue.message}</span>
                        </div>
                        <p className="text-xs mt-1">{issue.fix}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              )}
            </Card>
          )}
        </TabsContent>

        {/* SUMMARY TAB */}
        <TabsContent value="summary" className="space-y-4">
          {!generatedScript ? (
            <Card>
              <CardContent className="py-12 text-center">
                {lightOutline ? (
                  <>
                    {/* Has outline but no full script */}
                    <CheckCircle className="w-12 h-12 mx-auto mb-4 text-green-500/50" />
                    <h3 className="font-medium text-lg mb-2">Outline Disponible</h3>
                    <p className="text-muted-foreground mb-4">
                      Tienes un outline generado con {lightOutline.episode_beats?.length || 0} episodios.
                      {!outlineApproved && ' Apruébalo para poder generar el guion completo.'}
                    </p>
                    {outlineApproved ? (
                      <Button variant="default" onClick={() => setActiveTab('generate')}>
                        <Sparkles className="w-4 h-4 mr-2" />
                        Generar Guion Completo
                      </Button>
                    ) : (
                      <Button variant="outline" onClick={() => setActiveTab('generate')}>
                        <FileText className="w-4 h-4 mr-2" />
                        Ir a Aprobar Outline
                      </Button>
                    )}
                  </>
                ) : outlinePersistence.isLoading ? (
                  <>
                    {/* Loading state */}
                    <Loader2 className="w-12 h-12 mx-auto mb-4 text-muted-foreground animate-spin" />
                    <h3 className="font-medium text-lg mb-2">Cargando proyecto...</h3>
                    <p className="text-muted-foreground mb-4">
                      Verificando datos del proyecto
                    </p>
                  </>
                ) : (
                  <>
                    {/* No outline, no script */}
                    <BookOpen className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                    <h3 className="font-medium text-lg mb-2">No hay contenido todavía</h3>
                    <p className="text-muted-foreground mb-4">
                      Empieza escribiendo tu idea y generando un outline desde la pestaña "Guion"
                    </p>
                    <Button variant="default" onClick={() => setActiveTab('generate')}>
                      <Sparkles className="w-4 h-4 mr-2" />
                      Ir a Generar Outline
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Header with export */}
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h3 className="font-semibold text-xl">{generatedScript.title || 'Guion Generado'}</h3>
                  <p className="text-sm text-muted-foreground">
                    {generatedScript.episodes?.length || 1} episodio(s) • {generatedScript.genre || ''} • {generatedScript.counts?.total_scenes || '?'} escenas totales
                    {!isScriptComplete && <span className="text-amber-500 font-medium ml-2">• ⚠️ Faltan diálogos</span>}
                  </p>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button 
                        onClick={exportCompletePDF} 
                        variant="outline"
                        className="border-primary/30 hover:bg-primary/10"
                      >
                        <FileDown className="w-4 h-4 mr-2" />
                        Exportar PDF
                        {!isScriptComplete && (
                          <Badge variant="outline" className="ml-2 text-xs bg-amber-500/10 text-amber-600 border-amber-500/30">
                            Parcial
                          </Badge>
                        )}
                      </Button>
                    </TooltipTrigger>
                    {!isScriptComplete && (
                      <TooltipContent>
                        <p>Exportará outline sin diálogos completos</p>
                      </TooltipContent>
                    )}
                  </Tooltip>
                  <Button onClick={segmentAllEpisodes} disabled={segmenting || !isScriptComplete} variant="gold">
                    {segmenting ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Segmentando...</>
                    ) : (
                      <><ArrowRight className="w-4 h-4 mr-2" />Ir a Producción</>
                    )}
                  </Button>
                </div>
              </div>

              {/* MASTER SCRIPT OVERVIEW */}
              <Card className="border-2">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Film className="w-5 h-5 text-primary" />
                    Guion Maestro
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Logline & Synopsis */}
                  {generatedScript.logline && (
                    <div>
                      <Label className="text-xs text-muted-foreground uppercase">Logline</Label>
                      <p className="text-sm font-medium">{generatedScript.logline}</p>
                    </div>
                  )}
                  {generatedScript.synopsis && (
                    <div>
                      <Label className="text-xs text-muted-foreground uppercase">Sinopsis</Label>
                      <p className="text-sm">{generatedScript.synopsis}</p>
                    </div>
                  )}
                  
                  {/* Genre, Tone, Themes */}
                  <div className="flex flex-wrap gap-2">
                    {generatedScript.genre && <Badge>{generatedScript.genre}</Badge>}
                    {generatedScript.tone && <Badge variant="outline">{generatedScript.tone}</Badge>}
                    {generatedScript.themes?.map((t: string, i: number) => (
                      <Badge key={i} variant="secondary">{t}</Badge>
                    ))}
                  </div>

                  {/* Narrative Mode Badge */}
                  {generatedScript.narrative_mode && (
                    <div className="mb-4">
                      <Badge variant="outline" className="bg-primary/10">
                        {generatedScript.narrative_mode === 'serie_adictiva' && '🔥 Serie Adictiva'}
                        {generatedScript.narrative_mode === 'voz_de_autor' && '✍️ Voz de Autor'}
                        {generatedScript.narrative_mode === 'giro_imprevisible' && '🔀 Giro Imprevisible'}
                      </Badge>
                    </div>
                  )}

                  {/* Density: Targets vs Achieved (or just Extracted Metrics if no density) */}
                  {(generatedScript.density_targets || generatedScript.counts || breakdownPro?.counts || lightOutline) && (
                    <div className="space-y-3">
                      <Label className="text-xs text-muted-foreground uppercase flex items-center gap-2">
                        <Settings2 className="w-3 h-3" />
                        {generatedScript.density_targets ? 'Densidad Narrativa' : (breakdownPro?.counts || generatedScript.counts) ? 'Métricas Extraídas' : 'Métricas del Outline'}
                      </Label>
                      <div className="grid gap-2 grid-cols-2 md:grid-cols-5">
                        <DensityCompareCard 
                          label="Protagonistas" 
                          achieved={
                            breakdownPro?.counts?.protagonists || 
                            generatedScript.counts?.protagonists || 
                            generatedScript.density_achieved?.protagonists || 
                            lightOutline?.main_characters?.filter((c: any) => c.role?.toLowerCase().includes('protagonist')).length || 
                            0
                          } 
                          target={generatedScript.density_targets?.protagonists_min}
                        />
                        <DensityCompareCard 
                          label="Personajes" 
                          achieved={
                            breakdownPro?.counts?.characters_total || 
                            breakdownPro?.counts?.characters || 
                            generatedScript.counts?.characters_total || 
                            generatedScript.main_characters?.length || 
                            ((lightOutline?.main_characters?.length || 0) + (lightOutline?.supporting_characters?.length || 0)) ||
                            0
                          } 
                          target={generatedScript.density_targets?.characters_min}
                        />
                        <DensityCompareCard 
                          label="Secundarios" 
                          achieved={
                            breakdownPro?.counts?.supporting || 
                            generatedScript.counts?.supporting || 
                            generatedScript.density_achieved?.supporting || 
                            lightOutline?.main_characters?.filter((c: any) => !c.role?.toLowerCase().includes('protagonist')).length ||
                            0
                          } 
                          target={generatedScript.density_targets?.supporting_min}
                        />
                        <DensityCompareCard 
                          label="Localizaciones" 
                          achieved={
                            breakdownPro?.counts?.locations || 
                            generatedScript.counts?.locations || 
                            generatedScript.density_achieved?.locations || 
                            lightOutline?.main_locations?.length ||
                            0
                          } 
                          target={generatedScript.density_targets?.locations_min}
                        />
                        <DensityCompareCard 
                          label="Escenas Totales" 
                          achieved={
                            breakdownPro?.counts?.scenes || 
                            generatedScript.counts?.total_scenes || 
                            generatedScript.density_achieved?.total_scenes || 
                            lightOutline?.episode_beats?.reduce((sum: number, ep: any) => sum + (ep.turning_points?.length || 0), 0) ||
                            0
                          } 
                          target={generatedScript.density_targets?.scenes_per_episode ? (generatedScript.density_targets.scenes_per_episode * (generatedScript.episodes?.length || 1)) : generatedScript.density_targets?.scenes_target}
                        />
                      </div>
                      <div className="grid gap-2 grid-cols-2 md:grid-cols-4">
                        <DensityCompareCard 
                          label="Props" 
                          achieved={breakdownPro?.props?.length || breakdownPro?.counts?.props || generatedScript.counts?.props || generatedScript.props?.length || 0} 
                          target={generatedScript.density_targets?.props_min}
                        />
                        <DensityCompareCard 
                          label="Setpieces" 
                          achieved={breakdownPro?.setpieces?.length || breakdownPro?.counts?.setpieces || generatedScript.counts?.setpieces || 0} 
                          target={generatedScript.density_targets?.setpieces_min}
                        />
                        <DensityCompareCard 
                          label="Diálogos" 
                          achieved={breakdownPro?.counts?.dialogues || generatedScript.counts?.dialogues || generatedScript.counts?.total_dialogue_lines || 0} 
                        />
                        {generatedScript.density_targets?.dialogue_action_ratio && (
                          <div className="p-2 bg-muted/30 rounded-lg text-center">
                            <div className="text-xs text-muted-foreground">Ratio D/A</div>
                            <div className="text-sm font-medium">{generatedScript.density_targets.dialogue_action_ratio}</div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Music & SFX Design */}
                  {(generatedScript.music_design?.length > 0 || generatedScript.sfx_design?.length > 0) && (
                    <div className="grid md:grid-cols-2 gap-4">
                      {generatedScript.music_design?.length > 0 && (
                        <div>
                          <Label className="text-xs text-muted-foreground uppercase flex items-center gap-1">
                            <Volume2 className="w-3 h-3" /> Diseño Musical
                          </Label>
                          <div className="mt-1 space-y-1">
                            {generatedScript.music_design.map((m: any, i: number) => (
                              <div key={i} className="text-xs p-2 bg-muted/50 rounded">
                                <span className="font-medium">{m.name}</span>
                                <span className="text-muted-foreground"> - {m.description}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {generatedScript.sfx_design?.length > 0 && (
                        <div>
                          <Label className="text-xs text-muted-foreground uppercase flex items-center gap-1">
                            <Zap className="w-3 h-3" /> Diseño SFX
                          </Label>
                          <div className="mt-1 space-y-1">
                            {generatedScript.sfx_design.map((s: any, i: number) => (
                              <div key={i} className="text-xs p-2 bg-muted/50 rounded">
                                <span className="font-medium">{s.category}</span>
                                <span className="text-muted-foreground"> - {s.description}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* BREAKDOWN COMPLETO (PRO) */}
                  <div className="pt-4 border-t">
                    {!breakdownPro && !generatingBreakdownPro ? (
                      <div className="space-y-3">
                        {/* Auto checkbox */}
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id="auto-breakdown"
                            checked={autoBreakdownPro}
                            onCheckedChange={(checked) => setAutoBreakdownPro(!!checked)}
                          />
                          <Label htmlFor="auto-breakdown" className="text-sm cursor-pointer">
                            Generar breakdown completo automáticamente tras el outline
                          </Label>
                        </div>
                        <p className="text-xs text-muted-foreground pl-6 -mt-1">
                          Útil para guiones finales o documentos de rodaje
                        </p>
                        
                        <Button 
                          onClick={generateBreakdownPro} 
                          variant="outline" 
                          className="w-full justify-start gap-3 h-auto py-4"
                          disabled={!scriptText || scriptText.length < 200}
                        >
                          <div className="p-2 bg-primary/10 rounded-lg">
                            <Layers className="w-5 h-5 text-primary" />
                          </div>
                          <div className="flex-1 text-left">
                            <div className="font-medium">Generar Breakdown Completo</div>
                            <div className="text-xs text-muted-foreground">
                              Análisis profesional del guion para producción
                            </div>
                          </div>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="p-1 hover:bg-muted rounded">
                                <Info className="w-4 h-4 text-muted-foreground" />
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side="left" className="max-w-xs">
                              <p className="font-medium mb-1">¿Qué incluye el Breakdown Completo?</p>
                              <ul className="text-xs space-y-1">
                                <li>• Conteo real de escenas (INT./EXT.)</li>
                                <li>• Personajes por peso narrativo</li>
                                <li>• Localizaciones detalladas</li>
                                <li>• Props clave y setpieces</li>
                                <li>• Complejidad de producción y riesgos</li>
                                <li>• Datos listos para biblia y planificación</li>
                              </ul>
                            </TooltipContent>
                          </Tooltip>
                        </Button>
                      </div>
                    ) : generatingBreakdownPro ? (
                      <div className="space-y-3 p-4 bg-muted/30 rounded-lg">
                        <div className="flex items-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin text-primary" />
                          <span className="font-medium">Analizando el guion...</span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Leyendo escenas, personajes y estructura narrativa
                        </p>
                        <div className="space-y-1">
                          {breakdownProSteps.map((step, i) => (
                            <div key={i} className="flex items-center gap-2 text-xs">
                              {step.startsWith('✓') ? (
                                <CheckCircle className="w-3 h-3 text-green-500" />
                              ) : i === breakdownProSteps.length - 1 ? (
                                <Loader2 className="w-3 h-3 animate-spin text-primary" />
                              ) : (
                                <CheckCircle className="w-3 h-3 text-green-500" />
                              )}
                              <span className={step.startsWith('✓') ? 'text-green-600' : ''}>
                                {step.replace('✓ ', '')}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : breakdownPro ? (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <CheckCircle className="w-5 h-5 text-green-500" />
                            <span className="font-medium">Breakdown Completo del Guion</span>
                          </div>
                          <Badge variant="outline" className="text-xs">
                            {breakdownPro.source?.type || 'screenplay'} • {breakdownPro.source?.confidence || 'high'}
                          </Badge>
                        </div>
                        
                        {/* Counts Grid */}
                        <div className="grid grid-cols-3 gap-3">
                          <div className="p-3 bg-primary/5 rounded-lg text-center">
                            <div className="text-2xl font-bold text-primary">{breakdownPro.counts?.scenes || 0}</div>
                            <div className="text-xs text-muted-foreground">Escenas</div>
                          </div>
                          <div className="p-3 bg-primary/5 rounded-lg text-center">
                            <div className="text-2xl font-bold text-primary">{breakdownPro.counts?.characters || 0}</div>
                            <div className="text-xs text-muted-foreground">Personajes</div>
                          </div>
                          <div className="p-3 bg-primary/5 rounded-lg text-center">
                            <div className="text-2xl font-bold text-primary">{breakdownPro.counts?.locations || 0}</div>
                            <div className="text-xs text-muted-foreground">Localizaciones</div>
                          </div>
                        </div>

                        {/* Characters by role */}
                        {breakdownPro.characters && (
                          <div className="space-y-2">
                            <Label className="text-xs text-muted-foreground uppercase">Personajes por Rol</Label>
                            <div className="space-y-1">
                              {breakdownPro.characters.protagonists?.length > 0 && (
                                <div className="flex items-center gap-2 text-sm">
                                  <Badge variant="default" className="text-xs">Protagonistas</Badge>
                                  <span>{breakdownPro.characters.protagonists.map((c: any) => c.name).join(', ')}</span>
                                </div>
                              )}
                              {breakdownPro.characters.co_protagonists?.length > 0 && (
                                <div className="flex items-center gap-2 text-sm">
                                  <Badge variant="secondary" className="text-xs">Co-protagonistas</Badge>
                                  <span>{breakdownPro.characters.co_protagonists.map((c: any) => c.name).join(', ')}</span>
                                </div>
                              )}
                              {breakdownPro.characters.secondary?.length > 0 && (
                                <div className="flex items-center gap-2 text-sm">
                                  <Badge variant="outline" className="text-xs">Secundarios</Badge>
                                  <span className="text-muted-foreground">{breakdownPro.characters.secondary.map((c: any) => c.name).join(', ')}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Production Signals */}
                        {breakdownPro.production && (
                          <div className="grid grid-cols-3 gap-2">
                            <div className="p-2 bg-muted/50 rounded text-center">
                              <div className="text-xs text-muted-foreground">Diálogos</div>
                              <div className="text-sm font-medium capitalize">{breakdownPro.production.dialogue_density || 'medium'}</div>
                            </div>
                            <div className="p-2 bg-muted/50 rounded text-center">
                              <div className="text-xs text-muted-foreground">Reparto</div>
                              <div className="text-sm font-medium capitalize">{breakdownPro.production.cast_size || 'medium'}</div>
                            </div>
                            <div className="p-2 bg-muted/50 rounded text-center">
                              <div className="text-xs text-muted-foreground">Complejidad</div>
                              <div className="text-sm font-medium capitalize">{breakdownPro.production.complexity || 'medium'}</div>
                            </div>
                          </div>
                        )}

                        {/* Safety Flags */}
                        {breakdownPro.production?.safety_flags?.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {breakdownPro.production.safety_flags.map((flag: string, i: number) => (
                              <Badge key={i} variant="destructive" className="text-xs">
                                ⚠️ {flag}
                              </Badge>
                            ))}
                          </div>
                        )}

                        {/* Setpieces */}
                        {breakdownPro.setpieces?.length > 0 && (
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground uppercase">Setpieces</Label>
                            <div className="flex flex-wrap gap-1">
                              {breakdownPro.setpieces.map((sp: any, i: number) => (
                                <Badge key={i} variant="outline" className="text-xs">
                                  {sp.name} ({sp.type})
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}

                        <p className="text-xs text-muted-foreground italic pt-2 border-t">
                          El análisis se basa exclusivamente en el texto del guion. Outlines y documentos auxiliares no afectan al conteo de escenas.
                        </p>
                      </div>
                    ) : null}
                  </div>
                </CardContent>
              </Card>

              {/* TEASERS Section */}
              {(generatedScript?.teasers || generatedTeasers) && (
                <Card className="border-amber-500/50">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-base flex items-center gap-2">
                          <Film className="w-5 h-5 text-amber-500" />
                          Teasers Promocionales
                        </CardTitle>
                        <CardDescription>
                          Teasers auto-generados para promoción: 60 segundos y 30 segundos
                        </CardDescription>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const teaserData = generatedScript?.teasers || generatedTeasers;
                            if (teaserData) {
                              import('@/lib/exportScreenplayPDF').then(({ exportTeaserPDF }) => {
                                exportTeaserPDF(generatedScript?.title || 'Proyecto', teaserData);
                                toast.success('PDF de teasers exportado');
                              });
                            }
                          }}
                        >
                          <FileDown className="w-4 h-4 mr-1" />
                          PDF
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="default"
                              size="sm"
                              onClick={async (e) => {
                                const teaserData = generatedScript?.teasers || generatedTeasers;
                                if (!teaserData) return;
                                
                                // Check if teaser scenes already exist
                                const { data: existingScenes } = await supabase
                                  .from('scenes')
                                  .select('id, episode_no')
                                  .eq('project_id', projectId)
                                  .in('episode_no', [-1, -2])
                                  .limit(1);
                                
                                if (existingScenes && existingScenes.length > 0) {
                                  // Let AlertDialog handle it
                                  return;
                                }
                                
                                // No existing scenes, generate directly
                                e.preventDefault();
                                await generateTeaserScenes(teaserData);
                              }}
                              disabled={segmenting}
                            >
                              {segmenting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Clapperboard className="w-4 h-4 mr-1" />}
                              Generar Escenas
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>¿Sobrescribir escenas existentes?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Ya existen escenas generadas para los teasers. Si continúas, se eliminarán las escenas actuales y se generarán nuevas.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={async () => {
                                  const teaserData = generatedScript?.teasers || generatedTeasers;
                                  if (teaserData) {
                                    await generateTeaserScenes(teaserData);
                                  }
                                }}
                              >
                                Sobrescribir
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-6 md:grid-cols-2">
                      {/* Teaser 60s */}
                      {(generatedScript?.teasers?.teaser60 || generatedTeasers?.teaser60) && (
                        <Card className="bg-gradient-to-br from-amber-500/10 to-orange-500/10">
                          <CardHeader className="pb-2">
                            <div className="flex items-center justify-between">
                              <Badge variant="outline" className="bg-amber-500/20">60 segundos</Badge>
                              <div className="flex items-center gap-2">
                                <Badge variant="secondary">{(generatedScript?.teasers?.teaser60?.scenes || generatedTeasers?.teaser60?.scenes)?.length || 0} planos</Badge>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  onClick={() => {
                                    const teaserData = generatedScript?.teasers || generatedTeasers;
                                    if (teaserData) {
                                      import('@/lib/exportScreenplayPDF').then(({ exportTeaserPDF }) => {
                                        exportTeaserPDF(generatedScript?.title || 'Proyecto', teaserData, { teaserType: '60' });
                                        toast.success('PDF Teaser 60s exportado');
                                      });
                                    }
                                  }}
                                >
                                  <FileDown className="w-3 h-3" />
                                </Button>
                              </div>
                            </div>
                            <CardTitle className="text-sm mt-2">
                              {generatedScript?.teasers?.teaser60?.title || generatedTeasers?.teaser60?.title || 'Teaser Principal'}
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="text-sm space-y-3">
                            <div>
                              <Label className="text-xs text-muted-foreground">Tagline</Label>
                              <p className="italic">"{generatedScript?.teasers?.teaser60?.logline || generatedTeasers?.teaser60?.logline}"</p>
                            </div>
                            <div>
                              <Label className="text-xs text-muted-foreground">Música</Label>
                              <p>{generatedScript?.teasers?.teaser60?.music_cue || generatedTeasers?.teaser60?.music_cue}</p>
                            </div>
                            {(generatedScript?.teasers?.teaser60?.voiceover_text || generatedTeasers?.teaser60?.voiceover_text) && (
                              <div>
                                <Label className="text-xs text-muted-foreground">Voice Over</Label>
                                <p className="italic text-muted-foreground">"{generatedScript?.teasers?.teaser60?.voiceover_text || generatedTeasers?.teaser60?.voiceover_text}"</p>
                              </div>
                            )}
                            <Collapsible>
                              <CollapsibleTrigger className="text-xs text-primary flex items-center gap-1 hover:underline">
                                <ChevronDown className="w-3 h-3" />
                                Ver montaje teaser (auto)
                              </CollapsibleTrigger>
                              <CollapsibleContent className="mt-2 space-y-2">
                                <p className="text-xs text-amber-600 dark:text-amber-400 mb-2">
                                  ⚠️ Este montaje es automático y promocional. No sustituye el Storyboard de producción.
                                </p>
                                {(generatedScript?.teasers?.teaser60?.scenes || generatedTeasers?.teaser60?.scenes)?.map((shot: any, idx: number) => (
                                  <div key={idx} className="p-2 bg-muted/50 rounded text-xs">
                                    <div className="flex items-center justify-between mb-1">
                                      <Badge variant="outline" className="text-[10px]">{shot.shot_type}</Badge>
                                      <span className="text-muted-foreground">{shot.duration_sec}s</span>
                                    </div>
                                    <p>{shot.description}</p>
                                    {shot.dialogue_snippet && (
                                      <p className="italic text-muted-foreground mt-1">"{shot.dialogue_snippet}"</p>
                                    )}
                                  </div>
                                ))}
                              </CollapsibleContent>
                            </Collapsible>
                          </CardContent>
                        </Card>
                      )}

                      {/* Teaser 30s */}
                      {(generatedScript?.teasers?.teaser30 || generatedTeasers?.teaser30) && (
                        <Card className="bg-gradient-to-br from-red-500/10 to-pink-500/10">
                          <CardHeader className="pb-2">
                            <div className="flex items-center justify-between">
                              <Badge variant="outline" className="bg-red-500/20">30 segundos</Badge>
                              <div className="flex items-center gap-2">
                                <Badge variant="secondary">{(generatedScript?.teasers?.teaser30?.scenes || generatedTeasers?.teaser30?.scenes)?.length || 0} planos</Badge>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  onClick={() => {
                                    const teaserData = generatedScript?.teasers || generatedTeasers;
                                    if (teaserData) {
                                      import('@/lib/exportScreenplayPDF').then(({ exportTeaserPDF }) => {
                                        exportTeaserPDF(generatedScript?.title || 'Proyecto', teaserData, { teaserType: '30' });
                                        toast.success('PDF Teaser 30s exportado');
                                      });
                                    }
                                  }}
                                >
                                  <FileDown className="w-3 h-3" />
                                </Button>
                              </div>
                            </div>
                            <CardTitle className="text-sm mt-2">
                              {generatedScript?.teasers?.teaser30?.title || generatedTeasers?.teaser30?.title || 'Teaser Corto'}
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="text-sm space-y-3">
                            <div>
                              <Label className="text-xs text-muted-foreground">Tagline</Label>
                              <p className="italic">"{generatedScript?.teasers?.teaser30?.logline || generatedTeasers?.teaser30?.logline}"</p>
                            </div>
                            <div>
                              <Label className="text-xs text-muted-foreground">Música</Label>
                              <p>{generatedScript?.teasers?.teaser30?.music_cue || generatedTeasers?.teaser30?.music_cue}</p>
                            </div>
                            {(generatedScript?.teasers?.teaser30?.voiceover_text || generatedTeasers?.teaser30?.voiceover_text) && (
                              <div>
                                <Label className="text-xs text-muted-foreground">Voice Over</Label>
                                <p className="italic text-muted-foreground">"{generatedScript?.teasers?.teaser30?.voiceover_text || generatedTeasers?.teaser30?.voiceover_text}"</p>
                              </div>
                            )}
                            <Collapsible>
                              <CollapsibleTrigger className="text-xs text-primary flex items-center gap-1 hover:underline">
                                <ChevronDown className="w-3 h-3" />
                                Ver montaje teaser (auto)
                              </CollapsibleTrigger>
                              <CollapsibleContent className="mt-2 space-y-2">
                                <p className="text-xs text-amber-600 dark:text-amber-400 mb-2">
                                  ⚠️ Este montaje es automático y promocional. No sustituye el Storyboard de producción.
                                </p>
                                {(generatedScript?.teasers?.teaser30?.scenes || generatedTeasers?.teaser30?.scenes)?.map((shot: any, idx: number) => (
                                  <div key={idx} className="p-2 bg-muted/50 rounded text-xs">
                                    <div className="flex items-center justify-between mb-1">
                                      <Badge variant="outline" className="text-[10px]">{shot.shot_type}</Badge>
                                      <span className="text-muted-foreground">{shot.duration_sec}s</span>
                                    </div>
                                    <p>{shot.description}</p>
                                    {shot.dialogue_snippet && (
                                      <p className="italic text-muted-foreground mt-1">"{shot.dialogue_snippet}"</p>
                                    )}
                                  </div>
                                ))}
                              </CollapsibleContent>
                            </Collapsible>
                          </CardContent>
                        </Card>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Bible Empty State - Sync from Outline (reads from DB, not snapshot) */}
              {lightOutline && (bibleCharacters.length === 0 && bibleLocations.length === 0) && (
                ((lightOutline.main_characters?.length || 0) > 0 || (lightOutline.main_locations?.length || 0) > 0) && (
                  <Card className="border-amber-500/50 bg-amber-500/5">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-amber-500/20 rounded-lg">
                            <AlertTriangle className="w-5 h-5 text-amber-500" />
                          </div>
                          <div>
                            <CardTitle className="text-base">Bible vacía</CardTitle>
                            <CardDescription>
                              Hay {lightOutline.main_characters?.length || 0} personajes y {lightOutline.main_locations?.length || 0} locaciones en el outline listos para sincronizar.
                            </CardDescription>
                          </div>
                        </div>
                        <Button 
                          variant="gold" 
                          onClick={() => ensureBibleMaterialized()}
                          disabled={materializingEntities}
                        >
                          {materializingEntities ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          ) : (
                            <Download className="w-4 h-4 mr-2" />
                          )}
                          Sincronizar ahora
                        </Button>
                      </div>
                    </CardHeader>
                  </Card>
                )
              )}
              
              {/* Bible Synced Success State */}
              {(bibleCharacters.length > 0 || bibleLocations.length > 0) && (
                <Card className="border-green-500/50 bg-green-500/5">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-green-500/20 rounded-lg">
                          <CheckCircle className="w-5 h-5 text-green-500" />
                        </div>
                        <div>
                          <CardTitle className="text-base">Bible Sincronizada</CardTitle>
                          <CardDescription>
                            {bibleCharacters.length} personajes y {bibleLocations.length} locaciones en la Bible del proyecto.
                          </CardDescription>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => navigate(`/projects/${projectId}/bible/characters`)}
                        >
                          <Users className="w-4 h-4 mr-1" />
                          Ver Personajes
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => navigate(`/projects/${projectId}/bible/locations`)}
                        >
                          <MapPin className="w-4 h-4 mr-1" />
                          Ver Locaciones
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                </Card>
              )}

              {/* Scenes Empty State - Generate from Outline */}
              {lightOutline && scenesCount === 0 && (bibleCharacters.length > 0 || bibleLocations.length > 0) && (
                <Card className="border-amber-500/50 bg-amber-500/5">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between flex-wrap gap-3">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-amber-500/20 rounded-lg">
                          <Film className="w-5 h-5 text-amber-500" />
                        </div>
                        <div>
                          <CardTitle className="text-base">Escenas pendientes de generar</CardTitle>
                          <CardDescription>
                            El outline tiene {lightOutline.episode_beats?.length || 0} episodios definidos pero aún no hay escenas en producción.
                          </CardDescription>
                        </div>
                      </div>
                      <Button 
                        variant="gold" 
                        onClick={materializeScenesFromOutline}
                        disabled={materializingScenes}
                      >
                        {materializingScenes ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <Clapperboard className="w-4 h-4 mr-2" />
                        )}
                        Generar Escenas desde Outline
                      </Button>
                    </div>
                  </CardHeader>
                </Card>
              )}

              {/* Scenes Synced Success State */}
              {scenesCount > 0 && (
                <Card className="border-green-500/50 bg-green-500/5">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-green-500/20 rounded-lg">
                          <Film className="w-5 h-5 text-green-500" />
                        </div>
                        <div>
                          <CardTitle className="text-base">Escenas Listas</CardTitle>
                          <CardDescription>
                            {scenesCount} escenas en la tabla de producción.
                          </CardDescription>
                        </div>
                      </div>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => navigate(`/projects/${projectId}/scenes`)}
                      >
                        <Clapperboard className="w-4 h-4 mr-1" />
                        Ir a Escenas
                      </Button>
                    </div>
                  </CardHeader>
                </Card>
              )}

              {/* BREAKDOWN - Import Entities */}
              <Card className="border-primary/50">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Sparkles className="w-5 h-5 text-primary" />
                      Breakdown: Importar a Biblia
                    </CardTitle>
                    <Button 
                      onClick={importEntitiesToBible} 
                      disabled={importing || (selectedCharacters.size === 0 && selectedLocations.size === 0 && selectedProps.size === 0)}
                    >
                      {importing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Import className="w-4 h-4 mr-2" />}
                      Importar ({selectedCharacters.size + selectedLocations.size + selectedProps.size})
                    </Button>
                  </div>
                  <CardDescription>
                    Selecciona entidades para añadirlas a la Biblia del proyecto
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 md:grid-cols-3">
                    {/* Characters */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="flex items-center gap-2">
                          <Users className="w-4 h-4 text-primary" />
                          Personajes ({generatedScript.characters?.length || 0})
                        </Label>
                        <Button variant="ghost" size="sm" onClick={selectAllCharacters}>
                          {selectedCharacters.size === (generatedScript.characters?.length || 0) ? 'Ninguno' : 'Todos'}
                        </Button>
                      </div>
                      <ScrollArea className="h-[180px] border rounded-md p-2">
                        {generatedScript.characters?.map((char: any, i: number) => (
                          <div 
                            key={i} 
                            className={`flex items-start gap-2 p-2 rounded cursor-pointer hover:bg-muted/50 ${selectedCharacters.has(i) ? 'bg-primary/10' : ''}`}
                            onClick={() => toggleCharacter(i)}
                          >
                            {selectedCharacters.has(i) ? 
                              <CheckSquare className="w-4 h-4 text-primary shrink-0 mt-0.5" /> : 
                              <Square className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                            }
                            <div className="min-w-0">
                              <p className="font-medium text-sm truncate">{char.name}</p>
                              {(char.role || char.role_detail) && (
                                <div className="flex flex-wrap gap-1 mt-0.5">
                                  {char.role && <Badge variant="outline" className="text-xs">{char.role}</Badge>}
                                  {char.role_detail && <Badge variant="secondary" className="text-xs">{char.role_detail}</Badge>}
                                </div>
                              )}
                              {char.description && (
                                <p className="text-xs text-muted-foreground mt-1 break-words">{char.description}</p>
                              )}
                            </div>
                          </div>
                        ))}
                        {(!generatedScript.characters || generatedScript.characters.length === 0) && (
                          <p className="text-sm text-muted-foreground text-center py-4">Sin personajes</p>
                        )}
                      </ScrollArea>
                    </div>

                    {/* Locations */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="flex items-center gap-2">
                          <MapPin className="w-4 h-4 text-primary" />
                          Localizaciones ({generatedScript.locations?.length || 0})
                        </Label>
                        <Button variant="ghost" size="sm" onClick={selectAllLocations}>
                          {selectedLocations.size === (generatedScript.locations?.length || 0) ? 'Ninguno' : 'Todos'}
                        </Button>
                      </div>
                      <ScrollArea className="h-[180px] border rounded-md p-2">
                        {generatedScript.locations?.map((loc: any, i: number) => (
                          <div 
                            key={i} 
                            className={`flex items-start gap-2 p-2 rounded cursor-pointer hover:bg-muted/50 ${selectedLocations.has(i) ? 'bg-primary/10' : ''}`}
                            onClick={() => toggleLocation(i)}
                          >
                            {selectedLocations.has(i) ? 
                              <CheckSquare className="w-4 h-4 text-primary shrink-0 mt-0.5" /> : 
                              <Square className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                            }
                            <div className="min-w-0">
                              <p className="font-medium text-sm truncate">{typeof loc === 'string' ? loc : (loc.name ?? loc.base_name ?? loc.location_name ?? 'UNKNOWN')}</p>
                              {typeof loc === 'object' && (loc.description || loc.int_ext) && (
                                <p className="text-xs text-muted-foreground mt-1 break-words">{loc.description}</p>
                              )}
                            </div>
                          </div>
                        ))}
                        {(!generatedScript.locations || generatedScript.locations.length === 0) && (
                          <p className="text-sm text-muted-foreground text-center py-4">Sin localizaciones</p>
                        )}
                      </ScrollArea>
                    </div>

                    {/* Props */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="flex items-center gap-2">
                          <Package className="w-4 h-4 text-primary" />
                          Props ({generatedScript.props?.length || 0})
                        </Label>
                        <Button variant="ghost" size="sm" onClick={selectAllProps}>
                          {selectedProps.size === (generatedScript.props?.length || 0) ? 'Ninguno' : 'Todos'}
                        </Button>
                      </div>
                      <ScrollArea className="h-[180px] border rounded-md p-2">
                        {generatedScript.props?.map((prop: any, i: number) => (
                          <div 
                            key={i} 
                            className={`flex items-start gap-2 p-2 rounded cursor-pointer hover:bg-muted/50 ${selectedProps.has(i) ? 'bg-primary/10' : ''}`}
                            onClick={() => toggleProp(i)}
                          >
                            {selectedProps.has(i) ? 
                              <CheckSquare className="w-4 h-4 text-primary shrink-0 mt-0.5" /> : 
                              <Square className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                            }
                            <div className="min-w-0">
                              <p className="font-medium text-sm truncate">{typeof prop === 'string' ? prop : prop.name}</p>
                              {typeof prop === 'object' && prop.description && (
                                <p className="text-xs text-muted-foreground mt-1 break-words">{prop.description}</p>
                              )}
                            </div>
                          </div>
                        ))}
                        {(!generatedScript.props || generatedScript.props.length === 0) && (
                          <p className="text-sm text-muted-foreground text-center py-4">Sin props</p>
                        )}
                      </ScrollArea>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Casting Report Table */}
              {(generatedScript?.characters || breakdownPro?.characters) && (
                <Card>
                  <CardContent className="pt-6">
                    {/* Prefer generatedScript because it contains characters.cast dialogue_lines */}
                    <CastingReportTable scriptParsedJson={generatedScript || breakdownPro} />
                  </CardContent>
                </Card>
              )}

              {/* Narrative Depth (Subplots + Plot Twists) */}
              {(() => {
                const subplots = (generatedScript.subplots || generatedScript.subplots || []) as any[];
                const plotTwists = (generatedScript.plot_twists || generatedScript.plotTwists || []) as any[];

                if (subplots.length === 0 && plotTwists.length === 0) return null;

                return (
                  <div className="grid gap-4 md:grid-cols-2">
                    {subplots.length > 0 && (
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-base flex items-center gap-2">
                            <Layers className="w-5 h-5 text-primary" />
                            Subtramas ({subplots.length})
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                          {subplots.slice(0, 12).map((subplot, i) => (
                            <div key={i} className="p-3 bg-muted/30 rounded-lg">
                              <p className="text-sm font-medium">{subplot.name}</p>
                              {subplot.description && (
                                <p className="text-xs text-muted-foreground mt-1">{subplot.description}</p>
                              )}
                              {subplot.characters_involved?.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-2">
                                  {subplot.characters_involved.slice(0, 8).map((c: string, j: number) => (
                                    <Badge key={j} variant="outline" className="text-xs">{c}</Badge>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                          {subplots.length > 12 && (
                            <p className="text-xs text-muted-foreground">+{subplots.length - 12} más</p>
                          )}
                        </CardContent>
                      </Card>
                    )}

                    {plotTwists.length > 0 && (
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-base flex items-center gap-2">
                            <Zap className="w-5 h-5 text-primary" />
                            Giros narrativos ({plotTwists.length})
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                          {plotTwists.slice(0, 12).map((twist, i) => (
                            <div key={i} className="p-3 bg-muted/30 rounded-lg">
                              <div className="flex items-center gap-2">
                                <Badge
                                  variant={
                                    twist.impact === 'paradigm_shift'
                                      ? 'destructive'
                                      : twist.impact === 'major'
                                        ? 'default'
                                        : 'secondary'
                                  }
                                  className="text-xs"
                                >
                                  {twist.impact === 'paradigm_shift' ? '💥' : twist.impact === 'major' ? '⚡' : '✨'}
                                  {twist.impact === 'paradigm_shift' ? 'Cambio total' : twist.impact === 'major' ? 'Mayor' : 'Menor'}
                                </Badge>
                                <p className="text-sm font-medium">{twist.name}</p>
                              </div>
                              {twist.description && (
                                <p className="text-xs text-muted-foreground mt-1">{twist.description}</p>
                              )}
                              {(twist.episode || twist.scene) && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  {twist.episode ? `Episodio ${twist.episode}` : `Escena ${twist.scene}`}
                                </p>
                              )}
                            </div>
                          ))}
                          {plotTwists.length > 12 && (
                            <p className="text-xs text-muted-foreground">+{plotTwists.length - 12} más</p>
                          )}
                        </CardContent>
                      </Card>
                    )}
                  </div>
                );
              })()}

              {/* GENERATE MISSING DIALOGUES - PRO MODE */}
              {generatedScript?.episodes?.some((ep: any) => 
                ep.scenes?.some((s: any) => {
                  const hasCharacters = s.characters && s.characters.length > 0;
                  const hasDialogue = s.dialogue && s.dialogue.length > 0;
                  return hasCharacters && !hasDialogue;
                })
              ) && (
                <Card className="border-amber-500/30 bg-amber-500/5">
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-amber-500/20">
                          <FileText className="w-5 h-5 text-amber-600" />
                        </div>
                        <div>
                          <p className="font-medium text-amber-700 dark:text-amber-300">
                            Algunas escenas no tienen diálogos escritos
                          </p>
                          <p className="text-sm text-muted-foreground">
                            Genera diálogos completos para las escenas que solo tienen resumen
                          </p>
                        </div>
                      </div>
                      
                      <Button 
                        variant="gold"
                        onClick={generateMissingDialogues}
                        disabled={generatingDialogues}
                        className="gap-2"
                      >
                        {generatingDialogues ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            {dialogueProgress.phase || 'Generando...'}
                          </>
                        ) : (
                          <>
                            <Wand2 className="w-4 h-4" />
                            Generar Diálogos Faltantes
                          </>
                        )}
                      </Button>
                    </div>
                    
                    {generatingDialogues && dialogueProgress.total > 0 && (
                      <Progress 
                        value={(dialogueProgress.current / dialogueProgress.total) * 100} 
                        className="mt-3 h-2"
                      />
                    )}
                  </CardContent>
                </Card>
              )}

              {/* EPISODES / CHAPTERS - WITH SUMMARY vs FULL SCREENPLAY TOGGLE */}
              <div className="space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h4 className="font-semibold text-lg">Capítulos / Episodios</h4>
                  <div className="flex gap-2">
                    {/* Sync dialogues from script breakdown */}
                    {breakdownPro && (
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={syncDialoguesFromScript}
                        disabled={syncingFromScript}
                        className="gap-1"
                      >
                        {syncingFromScript ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <RefreshCw className="w-4 h-4" />
                        )}
                        Sincronizar desde Guión
                      </Button>
                    )}
                    <Button variant="outline" size="sm" onClick={() => {
                      const allExpanded = Object.values(expandedEpisodes).every(v => v);
                      const newState: Record<number, boolean> = {};
                      (generatedScript.episodes || [generatedScript]).forEach((_: any, i: number) => { newState[i] = !allExpanded; });
                      setExpandedEpisodes(newState);
                    }}>
                      {Object.values(expandedEpisodes).every(v => v) ? 'Contraer todos' : 'Expandir todos'}
                    </Button>
                  </div>
                </div>

                {(generatedScript.episodes || [{ episode_number: 1, title: generatedScript.title || 'Película', synopsis: generatedScript.synopsis, scenes: generatedScript.scenes || [] }]).map((ep: any, epIdx: number) => {
                  const episodeNum = ep.episode_number || epIdx + 1;
                  const viewMode = episodeViewMode[epIdx] || 'summary';
                  const toNum = (v: any) => {
                    const n = typeof v === "string" ? Number(v) : v;
                    return typeof n === "number" && Number.isFinite(n) ? n : 0;
                  };

                  const dialogueCount =
                    toNum(ep.total_dialogue_lines) ||
                    toNum(ep.dialogue_lines) ||
                    toNum(ep.counts?.total_dialogue_lines) ||
                    toNum(ep.counts?.dialogues) ||
                    toNum(ep.dialogues?.total_lines) ||
                    toNum(ep.dialogue_count) ||
                    toNum(
                      ep.scenes?.reduce((sum: number, s: any) => {
                        return (
                          sum +
                          toNum(s.total_dialogue_lines) +
                          toNum(s.dialogue_lines) +
                          toNum(s.dialogue_count) +
                          (Array.isArray(s.dialogue) ? s.dialogue.length : 0) +
                          (Array.isArray(s.dialogues) ? s.dialogues.length : 0)
                        );
                      }, 0)
                    ) ||
                    ((generatedScript.episodes?.length ?? 0) <= 1
                      ? toNum(generatedScript.counts?.total_dialogue_lines) ||
                        toNum(generatedScript.counts?.dialogues) ||
                        toNum(generatedScript.dialogues?.total_lines) ||
                        toNum(breakdownPro?.counts?.dialogues) ||
                        toNum(generatedScript.dialogue_count)
                      : 0) ||
                    0;
                  
                  return (
                    <Card key={epIdx} className="overflow-hidden">
                      <Collapsible open={expandedEpisodes[epIdx] ?? false} onOpenChange={(open) => setExpandedEpisodes(prev => ({ ...prev, [epIdx]: open }))}>
                        <CardHeader className="bg-muted/30">
                          <div className="flex items-center justify-between w-full">
                            <CollapsibleTrigger className="flex items-center gap-3 text-left">
                              {expandedEpisodes[epIdx] ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                              <div>
                                <span className="font-semibold text-base">
                                  {ep.episode_number ? `Episodio ${ep.episode_number}: ` : ''}{ep.title || `Capítulo ${epIdx + 1}`}
                                </span>
                                <div className="flex gap-2 mt-1 flex-wrap">
                                  <Badge variant="secondary">{ep.scenes?.length || 0} escenas</Badge>
                                  <Badge variant="outline">{dialogueCount} diálogos</Badge>
                                  {ep.duration_min && <Badge variant="outline">{ep.duration_min} min</Badge>}
                                  {/* Show batch completion status */}
                                  {ep.batches_total && ep.batches_completed < ep.batches_total && (
                                    <Badge variant="outline" className="bg-amber-500/20 text-amber-700 border-amber-500/30">
                                      {ep.batches_completed}/{ep.batches_total} batches
                                    </Badge>
                                  )}
                                  {segmentedEpisodes.has(episodeNum) && (
                                    <Badge variant="default" className="bg-green-600">
                                      <CheckCircle className="w-3 h-3 mr-1" />
                                      Segmentado
                                    </Badge>
                                  )}
                                  {/* Show partial error as warning, not blocking error */}
                                  {ep.partial_error && (
                                    <Tooltip>
                                      <TooltipTrigger>
                                        <Badge variant="outline" className="bg-amber-500/20 text-amber-700 border-amber-500/30">
                                          <AlertTriangle className="w-3 h-3 mr-1" />
                                          Parcial
                                        </Badge>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        <p className="max-w-xs text-sm">{ep.partial_error}</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  )}
                                  {/* Only show error badge if NO scenes were generated */}
                                  {ep.error && (
                                    <Badge variant="destructive">
                                      <AlertTriangle className="w-3 h-3 mr-1" />
                                      Error
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            </CollapsibleTrigger>
                            <div className="flex gap-2">
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setRegenerateEpisodeNo(episodeNum);
                                  setRegenerateEpisodeSynopsis(ep.synopsis || '');
                                  setShowRegenerateDialog(true);
                                }}
                              >
                                <RefreshCw className="w-4 h-4 mr-1" />
                                Regenerar
                              </Button>
                              <Button variant="outline" size="sm" onClick={() => exportEpisodePDF(ep, epIdx)}>
                                <FileDown className="w-4 h-4 mr-1" />
                                PDF
                              </Button>
                            </div>
                          </div>
                        </CardHeader>
                        
                        <CollapsibleContent>
                          <CardContent className="pt-4 space-y-4">
                            {/* View Mode Toggle: Summary vs Full Screenplay */}
                            <div className="flex items-center justify-between border-b pb-3">
                              <div className="flex gap-2">
                                <Button
                                  variant={viewMode === 'summary' ? 'default' : 'outline'}
                                  size="sm"
                                  onClick={() => setEpisodeViewMode(prev => ({ ...prev, [epIdx]: 'summary' }))}
                                >
                                  <BookOpen className="w-4 h-4 mr-1" />
                                  Resumen
                                </Button>
                                <Button
                                  variant={viewMode === 'full' ? 'default' : 'outline'}
                                  size="sm"
                                  onClick={() => setEpisodeViewMode(prev => ({ ...prev, [epIdx]: 'full' }))}
                                >
                                  <Film className="w-4 h-4 mr-1" />
                                  Guion Completo
                                </Button>
                              </div>
                              
                              {/* Segment button - ONLY for full screenplay view */}
                              {viewMode === 'full' && ep.scenes?.length > 0 && (
                                <Button 
                                  variant="gold" 
                                  size="sm" 
                                  onClick={() => segmentScenesFromEpisode(ep, episodeNum)}
                                  disabled={segmenting}
                                >
                                  {segmenting ? (
                                    <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                                  ) : (
                                    <Scissors className="w-4 h-4 mr-1" />
                                  )}
                                  Segmentar Escenas
                                </Button>
                              )}
                            </div>
                            
                            {/* SUMMARY VIEW */}
                            {viewMode === 'summary' && (
                              <div className="space-y-4">
                                {/* Synopsis */}
                                {ep.synopsis && (
                                  <div className="p-4 bg-muted/30 rounded-lg">
                                    <Label className="text-xs text-muted-foreground uppercase mb-2 block">Sinopsis del Episodio</Label>
                                    <p className="text-sm leading-relaxed">{ep.synopsis}</p>
                                  </div>
                                )}
                                
                                {/* Short summary */}
                                {ep.summary && ep.summary !== ep.synopsis && (
                                  <p className="text-sm text-muted-foreground italic">{ep.summary}</p>
                                )}
                                
                                {/* Act structure if available */}
                                {ep.act_structure && (
                                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                    {Object.entries(ep.act_structure).map(([act, scenes]) => (
                                      <div key={act} className="p-2 bg-muted/20 rounded text-center">
                                        <div className="text-xs text-muted-foreground uppercase">{act.replace('_', ' ')}</div>
                                        <div className="text-sm font-medium">{String(scenes)}</div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                                
                                {/* Cliffhanger */}
                                {ep.cliffhanger && (
                                  <div className="p-3 bg-primary/10 rounded-lg border border-primary/20">
                                    <Label className="text-xs text-primary uppercase">Cliffhanger</Label>
                                    <p className="text-sm mt-1">{ep.cliffhanger}</p>
                                  </div>
                                )}
                                
                                {/* Quick stats */}
                                <div className="grid grid-cols-3 gap-4 pt-2">
                                  <div className="text-center p-3 bg-muted/30 rounded-lg">
                                    <div className="text-xl font-bold text-primary">{ep.scenes?.length || 0}</div>
                                    <div className="text-xs text-muted-foreground">Escenas</div>
                                  </div>
                                  <div className="text-center p-3 bg-muted/30 rounded-lg">
                                    <div className="text-xl font-bold text-primary">{dialogueCount}</div>
                                    <div className="text-xs text-muted-foreground">Diálogos</div>
                                  </div>
                                  <div className="text-center p-3 bg-muted/30 rounded-lg">
                                    <div className="text-xl font-bold text-primary">{ep.duration_min || '~45'}</div>
                                    <div className="text-xs text-muted-foreground">Minutos</div>
                                  </div>
                                </div>
                                
                                <p className="text-center text-sm text-muted-foreground pt-2">
                                  Cambia a "Guion Completo" para ver todas las escenas con diálogos y poder segmentar.
                                </p>
                              </div>
                            )}
                            
                            {/* FULL SCREENPLAY VIEW */}
                            {viewMode === 'full' && (
                              <div className="space-y-4">
                                {/* All scenes with full content */}
                                {(ep.scenes || []).map((scene: any, sceneIdx: number) => (
                                  <div key={sceneIdx} className="border rounded-lg overflow-hidden">
                                    {/* Scene Header - Slugline */}
                                    <div className="bg-foreground text-background px-4 py-2 font-mono text-sm font-bold flex items-center justify-between">
                                      <span>
                                        {scene.scene_number || sceneIdx + 1}. {getSceneSlugline(scene) || 'SIN SLUGLINE'}
                                      </span>
                                      {segmentedEpisodes.has(epIdx + 1) && (
                                        <Button
                                          size="sm"
                                          variant="secondary"
                                          className="h-7 text-xs bg-background text-foreground hover:bg-muted"
                                          onClick={() => navigate(`/projects/${projectId}/scenes?episode=${epIdx + 1}&scene=${scene.scene_number || sceneIdx + 1}`)}
                                        >
                                          <Video className="w-3 h-3 mr-1" />
                                          Producir
                                        </Button>
                                      )}
                                    </div>
                                    
                                    <div className="p-4 space-y-3">
                                      {/* Scene summary */}
                                      {scene.summary && (
                                        <p className="text-sm text-muted-foreground italic border-l-2 border-primary/50 pl-3">
                                          {scene.summary}
                                        </p>
                                      )}

                                      {/* Action */}
                                      {scene.action && (
                                        <div className="text-sm leading-relaxed">
                                          {scene.action}
                                        </div>
                                      )}

                                      {/* Dialogue - FULL */}
                                      {(() => {
                                        // Fallback: check scene.dialogue, scene.dialogues, and scene.parsed_json.dialogue
                                        const dialogues = scene.dialogue || scene.dialogues || scene.parsed_json?.dialogue || [];
                                        if (dialogues.length > 0) {
                                          return (
                                            <div className="space-y-3 bg-muted/30 rounded-lg p-4">
                                              {dialogues.map((d: any, di: number) => (
                                                <div key={di} className="pl-4">
                                                  <div className="font-bold text-sm text-center uppercase tracking-wide">
                                                    {d.character || d.speaker}
                                                  </div>
                                                  {d.parenthetical && (
                                                    <div className="text-xs text-muted-foreground text-center italic">
                                                      ({d.parenthetical})
                                                    </div>
                                                  )}
                                                  <div className="text-sm text-center max-w-md mx-auto mt-1">
                                                    {d.line || d.text}
                                                  </div>
                                                </div>
                                              ))}
                                            </div>
                                          );
                                        } else {
                                          // No dialogue - show message
                                          return (
                                            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 text-center">
                                              <AlertTriangle className="w-5 h-5 mx-auto mb-2 text-amber-600" />
                                              <p className="text-sm text-amber-700 dark:text-amber-300 font-medium">
                                                Esta escena no tiene diálogos escritos
                                              </p>
                                              <p className="text-xs text-amber-600/80 dark:text-amber-400/80 mt-1">
                                                El guion actual es un <strong>outline</strong> (resumen de escenas). Para ver diálogos completos, genera el screenplay desde la pestaña "Generar".
                                              </p>
                                            </div>
                                          );
                                        }
                                      })()}

                                      {/* Technical cues: Music, SFX, VFX */}
                                      <div className="flex flex-wrap gap-2 pt-2 border-t">
                                        {scene.music_cue && (
                                          <Badge variant="outline" className="text-xs">
                                            <Volume2 className="w-3 h-3 mr-1" />
                                            {scene.music_cue}
                                          </Badge>
                                        )}
                                        {scene.sfx_cue && (
                                          <Badge variant="outline" className="text-xs">
                                            <Zap className="w-3 h-3 mr-1" />
                                            {scene.sfx_cue}
                                          </Badge>
                                        )}
                                        {scene.vfx?.length > 0 && scene.vfx.map((v: string, vi: number) => (
                                          <Badge key={vi} variant="secondary" className="text-xs">{v}</Badge>
                                        ))}
                                        {scene.mood && (
                                          <Badge variant="outline" className="text-xs bg-primary/10">
                                            Mood: {scene.mood}
                                          </Badge>
                                        )}
                                      </div>

                                      {/* Characters in scene */}
                                      {scene.characters?.length > 0 && (
                                        <div className="flex flex-wrap gap-1 text-xs text-muted-foreground">
                                          {scene.characters.map((c: string, ci: number) => (
                                            <span key={ci} className="bg-muted px-2 py-0.5 rounded">{c}</span>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                ))}

                                {(!ep.scenes || ep.scenes.length === 0) && (
                                  <div className="text-center py-8">
                                    <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                                    <p className="text-muted-foreground">
                                      {ep.error ? `Error al generar: ${ep.error}` : 'Sin escenas en este episodio'}
                                    </p>
                                  </div>
                                )}
                              </div>
                            )}
                          </CardContent>
                        </CollapsibleContent>
                      </Collapsible>
                    </Card>
                  );
                })}
              </div>

              {/* NEXT STEP: Navigate to Scenes for shot segmentation */}
              {segmentedEpisodes.size > 0 && (
                <Card className="border-primary/30 bg-primary/5">
                  <CardContent className="pt-6">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-primary/10">
                          <Video className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium">Siguiente paso: Segmentar en Micro-Shots</p>
                          <p className="text-sm text-muted-foreground">
                            {segmentedEpisodes.size} episodio{segmentedEpisodes.size !== 1 ? 's' : ''} listo{segmentedEpisodes.size !== 1 ? 's' : ''} para producción
                          </p>
                        </div>
                      </div>
                      <Button onClick={() => navigate(`/projects/${projectId}/scenes?episode=1`)}>
                        Ir a Escenas
                        <ArrowRight className="ml-2 w-4 h-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* QC Notes if available */}
              {generatedScript.qc_notes?.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Notas de Producción (QC)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="text-sm space-y-1 list-disc pl-4">
                      {generatedScript.qc_notes.map((note: string, i: number) => (
                        <li key={i}>{note}</li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>

        {/* PRODUCTION TAB */}
        <TabsContent value="production" className="space-y-4">
          <Card className="border-primary/30 bg-gradient-to-r from-primary/5 to-transparent">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clapperboard className="w-5 h-5 text-primary" />
                Producción: Escenas, Shots y Micro-Shots
              </CardTitle>
              <CardDescription>
                Genera propuestas de producción con planos, movimientos de cámara, transiciones y descripciones de keyframes
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!generatedScript ? (
                <div className="text-center py-8">
                  <AlertTriangle className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                  <h3 className="font-medium text-lg mb-2">No hay guion disponible</h3>
                  <p className="text-muted-foreground mb-4">
                    Primero genera o importa un guion desde las pestañas anteriores
                  </p>
                  <Button variant="outline" onClick={() => setActiveTab('generate')}>
                    <Lightbulb className="w-4 h-4 mr-2" />
                    Ir a Generar
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Quick Stats */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="p-4 rounded-lg bg-muted/50 text-center">
                      <div className="text-2xl font-bold text-primary">
                        {generatedScript.episodes?.length || 1}
                      </div>
                      <div className="text-xs text-muted-foreground">Episodios</div>
                    </div>
                    <div className="p-4 rounded-lg bg-muted/50 text-center">
                      <div className="text-2xl font-bold text-primary">
                        {generatedScript.counts?.total_scenes || '?'}
                      </div>
                      <div className="text-xs text-muted-foreground">Escenas</div>
                    </div>
                    <div className="p-4 rounded-lg bg-muted/50 text-center">
                      <div className="text-2xl font-bold text-primary">
                        {segmentedEpisodes.size}
                      </div>
                      <div className="text-xs text-muted-foreground">Eps. Segmentados</div>
                    </div>
                    <div className="p-4 rounded-lg bg-muted/50 text-center">
                      <div className="text-2xl font-bold text-primary">
                        {generatedScript.counts?.total_dialogue_lines || '?'}
                      </div>
                      <div className="text-xs text-muted-foreground">Líneas Diálogo</div>
                    </div>
                  </div>

                  {/* Main Actions */}
                  <div className="grid gap-4 md:grid-cols-2">
                    {/* Segment All Button */}
                    <div className="p-4 border rounded-lg space-y-3">
                      <div className="flex items-center gap-2">
                        <Scissors className="w-5 h-5 text-primary" />
                        <h4 className="font-medium">Segmentar Escenas</h4>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Crea escenas y planos automáticamente basados en los diálogos del guion
                      </p>
                      <Button 
                        onClick={segmentAllEpisodes} 
                        disabled={segmenting}
                        variant="gold"
                        className="w-full"
                      >
                        {segmenting ? (
                          <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Segmentando...</>
                        ) : (
                          <><Scissors className="w-4 h-4 mr-2" />Segmentar Todos los Episodios</>
                        )}
                      </Button>
                    </div>

                    {/* Go to Scenes Module */}
                    <div className="p-4 border rounded-lg space-y-3">
                      <div className="flex items-center gap-2">
                        <Video className="w-5 h-5 text-primary" />
                        <h4 className="font-medium">Módulo de Escenas</h4>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Vista completa con propuestas de shots, microshots, cámara y transiciones
                      </p>
                      <Button 
                        onClick={() => navigate(`/projects/${projectId}/scenes`)}
                        variant="outline"
                        className="w-full"
                      >
                        <ArrowRight className="w-4 h-4 mr-2" />
                        Ir al Módulo de Escenas
                      </Button>
                    </div>
                  </div>

                  {/* Episodes Overview for Production */}
                  {generatedScript.episodes?.length > 0 && (
                    <div className="space-y-3">
                      <Label className="text-xs uppercase text-muted-foreground">Episodios para Producción</Label>
                      <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                        {generatedScript.episodes.map((ep: any, idx: number) => {
                          const epNum = ep.episode_number || idx + 1;
                          const isSegmented = segmentedEpisodes.has(epNum);
                          const sceneCount = ep.scenes?.length || 0;
                          const hasDialogues = ep.scenes?.some((s: any) => s.dialogue?.length > 0);
                          
                          return (
                            <div 
                              key={idx}
                              className={`p-4 border rounded-lg transition-colors ${
                                isSegmented ? 'border-green-500/50 bg-green-500/5' : 'border-border'
                              }`}
                            >
                              <div className="flex items-center justify-between mb-2">
                                <h5 className="font-medium truncate">Ep {epNum}: {ep.title}</h5>
                                {isSegmented && (
                                  <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30">
                                    <CheckCircle className="w-3 h-3 mr-1" />
                                    Listo
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
                                <span>{sceneCount} escenas</span>
                                {hasDialogues ? (
                                  <Badge variant="outline" className="text-[10px]">Con diálogos</Badge>
                                ) : (
                                  <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-600 border-amber-500/30">Sin diálogos</Badge>
                                )}
                              </div>
                              <div className="flex gap-2">
                                {!isSegmented ? (
                                  <Button 
                                    size="sm" 
                                    variant="outline"
                                    onClick={() => segmentScenesFromEpisode(ep, epNum)}
                                    disabled={segmenting}
                                    className="flex-1"
                                  >
                                    <Scissors className="w-3 h-3 mr-1" />
                                    Segmentar
                                  </Button>
                                ) : (
                                  <Button 
                                    size="sm" 
                                    variant="secondary"
                                    onClick={() => navigate(`/projects/${projectId}/scenes?episode=${epNum}`)}
                                    className="flex-1"
                                  >
                                    <Play className="w-3 h-3 mr-1" />
                                    Producir
                                  </Button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Production Info */}
                  <div className="p-4 bg-blue-500/5 border border-blue-500/20 rounded-lg">
                    <div className="flex items-start gap-3">
                      <Info className="w-5 h-5 text-blue-500 mt-0.5 shrink-0" />
                      <div className="text-sm">
                        <p className="font-medium text-blue-700 dark:text-blue-400 mb-1">
                          Flujo de Producción
                        </p>
                        <ol className="list-decimal list-inside text-muted-foreground space-y-1">
                          <li><strong>Segmentar:</strong> Crea escenas y planos desde el guion</li>
                          <li><strong>Módulo Escenas:</strong> Genera propuestas de producción (shot-suggest)</li>
                          <li><strong>Review:</strong> Aprueba/edita planos, cámara, transiciones</li>
                          <li><strong>Micro-shots:</strong> Subdivide en segmentos de 2 segundos para keyframes</li>
                        </ol>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* MEJORAS TAB - 3 Clear Improvement Options */}
        <TabsContent value="doctor" className="space-y-4">
          {/* Three Improvement Options */}
          <div className="grid gap-4 md:grid-cols-3">
            {/* Option 1: Mejorar Guion */}
            <Card className="border-border hover:border-primary/50 transition-colors">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <div className="p-2 bg-blue-500/10 rounded-lg">
                    <FileText className="w-5 h-5 text-blue-500" />
                  </div>
                  Guion
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <ul className="text-xs text-muted-foreground space-y-1">
                  <li>• Estructura narrativa</li>
                  <li>• Arcos de personaje</li>
                  <li>• Ritmo y pacing</li>
                  <li>• Coherencia de trama</li>
                </ul>
                <Button 
                  variant="outline" 
                  className="w-full"
                  onClick={() => analyzeWithDoctor(['structure', 'character', 'pacing'])}
                  disabled={analyzing || (!generatedScript && scriptText.length < 200)}
                >
                  {analyzing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Stethoscope className="w-4 h-4 mr-2" />}
                  Analizar Guion
                </Button>
              </CardContent>
            </Card>

            {/* Option 2: Mejorar Diálogos */}
            <Card className="border-border hover:border-primary/50 transition-colors">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <div className="p-2 bg-amber-500/10 rounded-lg">
                    <Users className="w-5 h-5 text-amber-500" />
                  </div>
                  Diálogos
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <ul className="text-xs text-muted-foreground space-y-1">
                  <li>• Naturalidad del habla</li>
                  <li>• Voces distintivas</li>
                  <li>• Subtexto y tensión</li>
                  <li>• Exposición sutil</li>
                </ul>
                <Button 
                  variant="outline" 
                  className="w-full"
                  onClick={() => analyzeWithDoctor(['dialogue'])}
                  disabled={analyzing || (!generatedScript && scriptText.length < 200)}
                >
                  {analyzing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Stethoscope className="w-4 h-4 mr-2" />}
                  Analizar Diálogos
                </Button>
              </CardContent>
            </Card>

            {/* Option 3: Mejorar Producción */}
            <Card className="border-border hover:border-primary/50 transition-colors">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <div className="p-2 bg-green-500/10 rounded-lg">
                    <Clapperboard className="w-5 h-5 text-green-500" />
                  </div>
                  Producción
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <ul className="text-xs text-muted-foreground space-y-1">
                  <li>• Cinematografía visual</li>
                  <li>• Descripciones de acción</li>
                  <li>• Continuidad visual</li>
                  <li>• Transiciones de escena</li>
                </ul>
                <Button 
                  variant="outline" 
                  className="w-full"
                  onClick={() => analyzeWithDoctor(['visual', 'continuity'])}
                  disabled={analyzing || (!generatedScript && scriptText.length < 200)}
                >
                  {analyzing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Stethoscope className="w-4 h-4 mr-2" />}
                  Analizar Producción
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Full Analysis Button */}
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="pt-4 pb-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <Stethoscope className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium">Análisis Completo</p>
                    <p className="text-sm text-muted-foreground">
                      Analiza todos los aspectos: estructura, diálogos y producción
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {doctorScore !== null && (
                    <Badge variant={doctorScore >= 80 ? 'default' : doctorScore >= 60 ? 'secondary' : 'destructive'}>
                      Score: {doctorScore}/100
                    </Badge>
                  )}
                  <Button 
                    variant="gold"
                    onClick={() => analyzeWithDoctor()}
                    disabled={analyzing || (!generatedScript && scriptText.length < 200)}
                  >
                    {analyzing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
                    Análisis Completo
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Suggestions Results */}
          {doctorSuggestions.length > 0 && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Sugerencias de Mejora</CardTitle>
                  <div className="flex gap-2">
                    <Button 
                      onClick={applyDoctorSuggestions} 
                      disabled={applyingDoctor || !generatedScript || selectedSuggestions.size === 0}
                    >
                      {applyingDoctor ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Wand2 className="w-4 h-4 mr-2" />}
                      Aplicar ({selectedSuggestions.size})
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {/* Select all / none controls */}
                <div className="flex items-center justify-between mb-3 pb-3 border-b">
                  <span className="text-sm text-muted-foreground">
                    {selectedSuggestions.size} de {doctorSuggestions.length} seleccionadas
                  </span>
                  <div className="flex gap-2">
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => setSelectedSuggestions(new Set(doctorSuggestions.map((_, i) => i)))}
                    >
                      Seleccionar todas
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => setSelectedSuggestions(new Set())}
                    >
                      Ninguna
                    </Button>
                  </div>
                </div>
                <ScrollArea className="h-[400px]">
                  <div className="space-y-3">
                    {doctorSuggestions.map((s: any, i: number) => (
                      <div 
                        key={i} 
                        className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                          selectedSuggestions.has(i) 
                            ? 'border-primary bg-primary/5' 
                            : 'border-border hover:border-muted-foreground'
                        }`}
                        onClick={() => {
                          const newSelected = new Set(selectedSuggestions);
                          if (newSelected.has(i)) {
                            newSelected.delete(i);
                          } else {
                            newSelected.add(i);
                          }
                          setSelectedSuggestions(newSelected);
                        }}
                      >
                        <div className="flex items-start gap-3">
                          <Checkbox 
                            checked={selectedSuggestions.has(i)}
                            onCheckedChange={(checked) => {
                              const newSelected = new Set(selectedSuggestions);
                              if (checked) {
                                newSelected.add(i);
                              } else {
                                newSelected.delete(i);
                              }
                              setSelectedSuggestions(newSelected);
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="mt-1"
                          />
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <Badge className={getSeverityColor(s.severity)}>{s.severity}</Badge>
                              <Badge variant="outline">{s.category}</Badge>
                              {s.location && (
                                <span className="text-xs text-muted-foreground">{s.location}</span>
                              )}
                            </div>
                            <p className="font-medium text-sm">{s.issue}</p>
                            <p className="text-xs text-muted-foreground mt-1">{s.reason}</p>
                            <div className="mt-2 p-2 bg-primary/5 rounded text-sm">
                              <strong>Sugerencia:</strong> {s.suggestion}
                            </div>
                            {s.rewrite_snippet && (
                              <div className="mt-2 p-2 bg-muted rounded text-xs font-mono">
                                <strong>Ejemplo:</strong> "{s.rewrite_snippet}"
                              </div>
                            )}
                            {s.impact && (
                              <p className="text-xs text-green-600 dark:text-green-400 mt-2">
                                ✓ {s.impact}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* HISTORY TAB */}
        <TabsContent value="history" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="w-5 h-5" />
                Histórico de Guiones
              </CardTitle>
              <CardDescription>
                Versiones anteriores de guiones generados para este proyecto
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingHistory ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : scriptHistory.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <History className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No hay guiones en el histórico</p>
                  <p className="text-sm mt-1">Los guiones generados aparecerán aquí</p>
                </div>
              ) : (
                <ScrollArea className="h-[500px]">
                  <div className="space-y-3">
                    {scriptHistory.map((script, idx) => {
                      const parsed = script.parsed_json as Record<string, unknown> | null;
                      const title = parsed?.title as string || 'Sin título';
                      const episodeCount = (parsed?.episodes as any[])?.length || 0;
                      const isCurrentScript = script.id === currentScriptId;
                      
                      return (
                        <div 
                          key={script.id} 
                          className={`p-4 rounded-lg border transition-colors ${
                            isCurrentScript 
                              ? 'border-primary bg-primary/5' 
                              : 'border-border hover:border-primary/50 hover:bg-muted/50'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <h4 className="font-medium truncate">{title}</h4>
                                {isCurrentScript && (
                                  <Badge variant="default" className="shrink-0">Actual</Badge>
                                )}
                                <Badge 
                                  variant={script.status === 'locked' ? 'secondary' : 'outline'}
                                  className="shrink-0"
                                >
                                  {script.status === 'locked' ? (
                                    <><Lock className="w-3 h-3 mr-1" />Congelado</>
                                  ) : (
                                    'Borrador'
                                  )}
                                </Badge>
                              </div>
                              <p className="text-sm text-muted-foreground">
                                {new Date(script.created_at).toLocaleString('es-ES', {
                                  year: 'numeric',
                                  month: 'long',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </p>
                              <div className="flex gap-2 mt-2">
                                {episodeCount > 0 && (
                                  <Badge variant="outline" className="text-xs">
                                    {episodeCount} episodio{episodeCount !== 1 ? 's' : ''}
                                  </Badge>
                                )}
                              </div>
                            </div>
                            <div className="flex gap-2 shrink-0">
                              {!isCurrentScript && (
                                <Button 
                                  variant="outline" 
                                  size="sm"
                                  onClick={() => restoreScriptFromHistory(script)}
                                >
                                  <RotateCcw className="w-4 h-4 mr-2" />
                                  Restaurar
                                </Button>
                              )}
                              <Button 
                                variant="ghost" 
                                size="sm"
                                onClick={async () => {
                                  const confirm = window.confirm('¿Eliminar este guion del histórico?');
                                  if (!confirm) return;
                                  
                                  await supabase.from('scripts').delete().eq('id', script.id);
                                  
                                  if (script.id === currentScriptId) {
                                    setCurrentScriptId(null);
                                    setGeneratedScript(null);
                                    setScriptText('');
                                    setScriptLocked(false);
                                  }
                                  
                                  await loadScriptHistory();
                                  toast.success('Guion eliminado del histórico');
                                }}
                              >
                                <Trash2 className="w-4 h-4 text-destructive" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Episode Regenerate Dialog */}
      <EpisodeRegenerateDialog
        open={showRegenerateDialog}
        onOpenChange={setShowRegenerateDialog}
        projectId={projectId}
        episodeNo={regenerateEpisodeNo}
        episodeSynopsis={regenerateEpisodeSynopsis}
        existingSceneCount={0}
        onRegenerated={() => {
          // Refresh the script data after regeneration
          supabase.from('scripts').select('id, status, raw_text, parsed_json').eq('project_id', projectId).order('created_at', { ascending: false }).limit(1).single().then(({ data }) => {
            if (data?.parsed_json && typeof data.parsed_json === 'object') {
              const parsed = data.parsed_json as Record<string, unknown>;
              if (parsed.episodes || parsed.screenplay || parsed.title) {
                setGeneratedScript(parsed);
              }
            }
          });
        }}
      />

      {/* DENSITY GATE MODAL - Blocks generation if density insufficient */}
      <AlertDialog open={showDensityGateModal} onOpenChange={(open) => !isPatchingOutline && setShowDensityGateModal(open)}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="w-5 h-5" />
              No se puede generar guion todavía
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4">
                {/* Score display */}
                <div className="flex items-center justify-between">
                  <span>Densidad narrativa:</span>
                  <Badge variant={(densityGateResult?.density_score ?? 0) >= 60 ? 'secondary' : 'destructive'}>
                    {densityGateResult?.density_score || 0}/100
                  </Badge>
                </div>
                
                {/* Required Fixes List */}
                {densityGateResult?.required_fixes && densityGateResult.required_fixes.length > 0 && (
                  <div className="bg-muted p-3 rounded-md space-y-2">
                    <p className="font-medium text-sm">Elementos faltantes:</p>
                    <ul className="text-sm space-y-1">
                      {densityGateResult.required_fixes.map((fix, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <XCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                          <span>
                            <strong>{fix.title}</strong>
                            {fix.current !== undefined && fix.required !== undefined && (
                              <span className="text-muted-foreground ml-1">({fix.current}/{fix.required})</span>
                            )}
                            {fix.fix_hint && <span className="text-muted-foreground ml-1">— {fix.fix_hint}</span>}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                
                {/* Human Summary */}
                {densityGateResult?.human_summary && (
                  <p className="text-sm text-muted-foreground whitespace-pre-line">
                    {densityGateResult.human_summary}
                  </p>
                )}
                
                {/* Patching indicator */}
                {isPatchingOutline && (
                  <div className="flex items-center gap-2 text-primary">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-sm">Parcheando outline...</span>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <Button 
              variant="outline" 
              onClick={() => setShowDensityGateModal(false)}
              disabled={isPatchingOutline}
            >
              Editar manualmente
            </Button>
            <Button 
              onClick={handleAutoPatching}
              disabled={isPatchingOutline}
            >
              {isPatchingOutline ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Parcheando...</>
              ) : (
                <><Wand2 className="w-4 h-4 mr-2" />Auto-parchear outline</>
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
    </>
  );
}

// Helper components
function TargetField({ label, value, editable, onChange }: { label: string; value: number; editable: boolean; onChange: (v: number) => void }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {editable ? (
        <Input
          type="number"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="h-8"
        />
      ) : (
        <div className="h-8 flex items-center px-3 rounded-md bg-muted text-sm font-medium">{value}</div>
      )}
    </div>
  );
}

const CountBadge = forwardRef<HTMLDivElement, { label: string; value: number }>(
  ({ label, value }, ref) => {
    return (
      <div ref={ref} className="text-center p-2 rounded-lg bg-muted/50">
        <div className="text-lg font-bold text-primary">{value || 0}</div>
        <div className="text-xs text-muted-foreground">{label}</div>
      </div>
    );
  },
);
CountBadge.displayName = 'CountBadge';

// Density comparison card: shows achieved vs target
const DensityCompareCard = forwardRef<HTMLDivElement, { 
  label: string; 
  achieved: number; 
  target?: number;
}>(({ label, achieved, target }, ref) => {
  const meetsTarget = target ? achieved >= target : true;
  
  return (
    <div 
      ref={ref}
      className={`p-2 rounded-lg text-center ${meetsTarget ? 'bg-green-500/10 border border-green-500/30' : 'bg-orange-500/10 border border-orange-500/30'}`}
    >
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div className="flex items-center justify-center gap-1">
        <span className={`text-lg font-bold ${meetsTarget ? 'text-green-600' : 'text-orange-600'}`}>
          {achieved}
        </span>
        {target !== undefined && (
          <>
            <span className="text-muted-foreground text-xs">/</span>
            <span className="text-xs text-muted-foreground">{target}</span>
          </>
        )}
      </div>
      {target !== undefined && (
        <div className="text-[10px] mt-1">
          {meetsTarget ? (
            <span className="text-green-600">✓ Cumple</span>
          ) : (
            <span className="text-orange-600">↓ {target - achieved} más</span>
          )}
        </div>
      )}
    </div>
  );
});

DensityCompareCard.displayName = 'DensityCompareCard';
