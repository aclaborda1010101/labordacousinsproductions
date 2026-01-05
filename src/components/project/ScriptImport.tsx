import { useState, useEffect, forwardRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { invokeWithTimeout } from '@/lib/supabaseFetchWithTimeout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import ReferenceScriptLibrary from './ReferenceScriptLibrary';
import EpisodeRegenerateDialog from './EpisodeRegenerateDialog';
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
  Clapperboard
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import jsPDF from 'jspdf';
import { ScrollArea } from '@/components/ui/scroll-area';
import { calculateAutoTargets, CalculatedTargets, TargetInputs, calculateDynamicBatches, BatchConfig, GenerationModel, GENERATION_MODELS } from '@/lib/autoTargets';
import { useCreativeModeOptional } from '@/contexts/CreativeModeContext';
import { exportScreenplayPDF, exportEpisodeScreenplayPDF } from '@/lib/exportScreenplayPDF';
import {
  estimateEpisodeMs,
  estimateBatchMs,
  formatDurationMs,
  loadScriptTimingModel,
  saveScriptTimingModel,
  updateBatchTiming,
  updateOutlineTiming,
} from '@/lib/scriptTimingModel';
import { retryWithBackoff, isRetryableError } from '@/lib/retryWithBackoff';

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
  
  // Script history state
  const [scriptHistory, setScriptHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [deletingScript, setDeletingScript] = useState(false);

  // Form state
  const [ideaText, setIdeaText] = useState('');
  const [format, setFormat] = useState<'film' | 'series'>('series');
  const [episodesCount, setEpisodesCount] = useState(6);
  const [episodeDurationMin, setEpisodeDurationMin] = useState(45);
  const [filmDurationMin, setFilmDurationMin] = useState(100);
  const [genre, setGenre] = useState('drama');
  const [tone, setTone] = useState('Cinematográfico realista');
  const [language, setLanguage] = useState('es-ES');
  const [references, setReferences] = useState('');
  const [complexity, setComplexity] = useState<'simple' | 'medium' | 'high'>('medium');
  
  // MASTER SHOWRUNNER: Narrative mode
  const [narrativeMode, setNarrativeMode] = useState<'serie_adictiva' | 'voz_de_autor' | 'giro_imprevisible'>('serie_adictiva');
  
  // Generation model selection (speed vs quality) - default to 'rapido'
  const [generationModel, setGenerationModel] = useState<GenerationModel>('rapido');
  
  // Creative mode context for gating generation models
  const creativeModeContext = useCreativeModeOptional();
  const effectiveCreativeMode = creativeModeContext?.effectiveMode ?? 'ASSISTED';
  
  // Available generation models based on creative mode
  // PRO: all models (rapido, profesional, hollywood)
  // ASSISTED: only rapido and profesional
  const availableGenerationModels: GenerationModel[] = effectiveCreativeMode === 'PRO' 
    ? ['rapido', 'profesional', 'hollywood']
    : ['rapido', 'profesional'];

  // Auto/Pro mode
  const [proMode, setProMode] = useState(false);
  const [targets, setTargets] = useState<CalculatedTargets | null>(null);

  // Pipeline V2 state - with localStorage persistence
  const PIPELINE_STORAGE_KEY = `script_pipeline_${projectId}`;
  
  const loadPipelineState = () => {
    try {
      const stored = localStorage.getItem(PIPELINE_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Check if pipeline is still running (less than 30 min old)
        if (parsed.startedAt && Date.now() - parsed.startedAt < 30 * 60 * 1000) {
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
        startedAt: state.startedAt || Date.now()
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
    { id: 'teasers', label: 'Generando teasers', status: 'pending' },
    { id: 'save', label: 'Guardando', status: 'pending' },
  ]);
  const [currentStepLabel, setCurrentStepLabel] = useState<string>('');
  const [backgroundGeneration, setBackgroundGeneration] = useState(false);

  // Timing model (aprende tiempos reales para estimar ETA)
  const [timingModel, setTimingModel] = useState(() => loadScriptTimingModel());
  const [episodeStartedAtMs, setEpisodeStartedAtMs] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  
  // Light outline state (Pipeline V2)
  const [lightOutline, setLightOutline] = useState<any>(null);
  const [outlineApproved, setOutlineApproved] = useState(false);
  const [generatingOutline, setGeneratingOutline] = useState(false);
  
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
  
  // Dynamic batch configuration
  const [batchConfig, setBatchConfig] = useState<BatchConfig | null>(null);

  // Episode regeneration state
  const [showRegenerateDialog, setShowRegenerateDialog] = useState(false);
  const [regenerateEpisodeNo, setRegenerateEpisodeNo] = useState(1);
  const [regenerateEpisodeSynopsis, setRegenerateEpisodeSynopsis] = useState('');

  // Restore pipeline state on mount and poll for updates
  useEffect(() => {
    const storedState = loadPipelineState();
    if (storedState && storedState.pipelineRunning) {
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
    }
  }, [projectId, episodesCount]);

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
            
            const totalEps = storedState?.totalEpisodes || episodesCount;
            const progress = 10 + Math.round((episodes.length / totalEps) * 75);
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
          if (parsed.episodes || parsed.screenplay || parsed.title) {
            setGeneratedScript(parsed);
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

  const updatePipelineStep = (stepId: string, status: PipelineStep['status'], label?: string) => {
    setPipelineSteps(prev => prev.map(s => s.id === stepId ? { ...s, status, label: label || s.label } : s));
    if (label) setCurrentStepLabel(label);
  };

  // Helper function to generate teaser scenes
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

  // PIPELINE V2: Step 1 - Generate Light Outline (fast ~10s)
  const generateLightOutline = async () => {
    if (!ideaText.trim()) {
      toast.error('Escribe una idea para generar el guion');
      return;
    }

    setGeneratingOutline(true);
    setLightOutline(null);
    setOutlineApproved(false);
    setPipelineSteps(prev => prev.map(s => ({ ...s, status: 'pending' })));
    updatePipelineStep('outline', 'running');

    try {
      const t0 = Date.now();
      // Timeout dinámico por modelo y nº de episodios (evita aborts falsos)
      const outlineEpisodes = format === 'series' ? episodesCount : 1;
      const timeoutMs = (() => {
        if (generationModel === 'hollywood') {
          // Claude: más lento y con más variabilidad
          const base = 90000;
          const perEp = 25000;
          return Math.min(300000, Math.max(120000, base + perEp * outlineEpisodes));
        }
        if (generationModel === 'profesional') {
          // GPT-4o: normalmente rápido, pero puede tardar en outlines largos
          const base = 45000;
          const perEp = 12000;
          return Math.min(180000, Math.max(60000, base + perEp * outlineEpisodes));
        }
        // GPT-4o-mini (rápido)
        const base = 30000;
        const perEp = 8000;
        return Math.min(150000, Math.max(60000, base + perEp * outlineEpisodes));
      })();
      const { data, error } = await invokeWithTimeout<{ outline: typeof lightOutline }>(
        'generate-outline-light',
        {
          idea: ideaText.trim().slice(0, 2000),
          episodesCount: format === 'series' ? episodesCount : 1,
          format,
          genre,
          tone,
          language,
          narrativeMode,
          densityTargets: targets,
          generationModel // Pass the selected model
        },
        timeoutMs
      );
      const durationMs = Date.now() - t0;

      if (error) throw error;
      if (!data?.outline) throw new Error('No se generó el outline');

      // Aprendizaje: tiempo real de outline
      setTimingModel(prev => {
        const next = updateOutlineTiming(prev, {
          episodesCount: format === 'series' ? episodesCount : 1,
          durationMs,
        });
        saveScriptTimingModel(next);
        return next;
      });

      setLightOutline(data.outline);
      updatePipelineStep('outline', 'success');
      updatePipelineStep('approval', 'running', 'Esperando aprobación...');
      toast.success('Outline generado. Revísalo y apruébalo para continuar.');

    } catch (err: any) {
      console.error('Error generating light outline:', err);
      updatePipelineStep('outline', 'error');
      toast.error(err.message || 'Error al generar outline');
    } finally {
      setGeneratingOutline(false);
    }
  };

  // PIPELINE V2: Step 2 - Regenerate Outline
  const regenerateOutline = () => {
    setLightOutline(null);
    setOutlineApproved(false);
    generateLightOutline();
  };

  // PIPELINE V2: Step 3 - Approve Outline & Generate Episodes (with batches)
  const approveAndGenerateEpisodes = async () => {
    if (!lightOutline) return;

    setOutlineApproved(true);
    updatePipelineStep('approval', 'success');
    updatePipelineStep('episodes', 'running');
    setPipelineRunning(true);
    setPipelineProgress(10);
    setGeneratedEpisodesList([]);

    const controller = new AbortController();
    setCancelController(controller);

    const totalEpisodes = lightOutline.episode_beats?.length || episodesCount;
    setTotalEpisodesToGenerate(totalEpisodes);

    // Save initial pipeline state for background recovery
    savePipelineState({
      pipelineRunning: true,
      progress: 10,
      currentEpisode: 1,
      totalEpisodes,
      episodes: [],
      outline: lightOutline,
      startedAt: Date.now()
    });

    // Calculate dynamic batch configuration based on complexity, episode duration, AND generation model
    const modelConfig = GENERATION_MODELS[generationModel];
    const dynamicBatchConfig = calculateDynamicBatches(targets!, complexity, undefined, episodeDurationMin, generationModel);
    setBatchConfig(dynamicBatchConfig);
    
    const BATCHES_PER_EPISODE = dynamicBatchConfig.batchesPerEpisode;
    const SCENES_PER_BATCH = dynamicBatchConfig.scenesPerBatch;
    const DELAY_BETWEEN_BATCHES = dynamicBatchConfig.delayBetweenBatchesMs;
    const DELAY_BETWEEN_EPISODES = modelConfig.delayBetweenEpisodesMs;
    
    console.log(`[DYNAMIC BATCHES] Model: ${generationModel} | Complexity: ${complexity} | Config: ${BATCHES_PER_EPISODE} batches × ${SCENES_PER_BATCH} scenes = ${dynamicBatchConfig.estimatedScenesTotal} scenes/episode | Batch delay: ${DELAY_BETWEEN_BATCHES}ms | Episode delay: ${DELAY_BETWEEN_EPISODES}ms`);
    
    const totalBatches = totalEpisodes * BATCHES_PER_EPISODE;
    let completedBatches = 0;

    try {
      const episodes: any[] = [];

      for (let epNum = 1; epNum <= totalEpisodes; epNum++) {
        if (controller.signal.aborted) {
          toast.info('Generación cancelada');
          break;
        }

        setCurrentEpisodeGenerating(epNum);
        const episodeBeat = lightOutline.episode_beats?.[epNum - 1];

        // Generate episode with dynamic batch count
        const allScenes: any[] = [];
        let synopsisFromClaude: string | null = null;
        let episodeError: string | null = null;

        // Add delay BEFORE starting episode based on model's rate limits
        if (epNum > 1) {
          console.log(`[${generationModel.toUpperCase()}] Waiting ${DELAY_BETWEEN_EPISODES}ms before Episode ${epNum}...`);
          await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_EPISODES));
        }

        for (let batchIdx = 0; batchIdx < BATCHES_PER_EPISODE; batchIdx++) {
          if (controller.signal.aborted) break;

          // Add delay between batches based on model's rate limits
          if (batchIdx > 0) {
            console.log(`[${generationModel.toUpperCase()}] Waiting ${DELAY_BETWEEN_BATCHES}ms before batch ${batchIdx + 1}...`);
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

          try {
            const invokeBatch = async () => {
              if (controller.signal.aborted) {
                throw new Error('Aborted');
              }
              return await supabase.functions.invoke('episode-generate-batch', {
                body: {
                  outline: lightOutline,
                  episodeNumber: epNum,
                  language,
                  batchIndex: batchIdx,
                  previousScenes: allScenes,
                  narrativeMode,
                  // Dynamic batch config
                  scenesPerBatch: SCENES_PER_BATCH,
                  totalBatches: BATCHES_PER_EPISODE,
                  isLastBatch: batchIdx === BATCHES_PER_EPISODE - 1,
                  // Model selection for speed/quality
                  generationModel,
                },
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
              episodeError = error.message;
              toast.error(`Error en ${batchLabel}: ${error.message}`);
              break;
            }

            if (data?.scenes && Array.isArray(data.scenes)) {
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

              console.log(`[${batchLabel}] ✓ ${data.scenes.length} scenes in ${batchDurationMs}ms`);
            } else {
              episodeError = 'No scenes returned';
              break;
            }
          } catch (err: any) {
            console.error(`Exception in ${batchLabel}:`, err);
            episodeError = err.message || 'Unknown error';
            break;
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

        // Update localStorage state for background recovery
        const currentProgress = 10 + Math.round((episodes.length / totalEpisodes) * 75);
        // Only save next episode if there are more to generate
        const nextEpisode = epNum < totalEpisodes ? epNum + 1 : totalEpisodes;
        savePipelineState({
          pipelineRunning: epNum < totalEpisodes, // Mark as not running if this was the last
          progress: currentProgress,
          currentEpisode: nextEpisode,
          totalEpisodes,
          episodes: [...episodes],
          outline: lightOutline,
          startedAt: loadPipelineState()?.startedAt || Date.now()
        });

        if (!episodeError) {
          toast.success(`Episodio ${epNum} completado ✓ (${episode.scenes.length} escenas)`);
        }
      }

      setCurrentEpisodeGenerating(null);
      updatePipelineStep('episodes', 'success');

      // Calculate actual counts from generated content
      const protagonistsCount = lightOutline.main_characters?.filter((c: any) => c.role === 'protagonist').length || 0;
      const supportingCount = lightOutline.main_characters?.filter((c: any) => c.role === 'supporting' || c.role === 'antagonist').length || 0;
      const locationsCount = lightOutline.main_locations?.length || 0;
      const totalScenes = episodes.reduce((sum, ep) => sum + (ep.scenes?.length || 0), 0);
      const totalDialogueLines = episodes.reduce((sum, ep) => sum + (ep.total_dialogue_lines || 0), 0);

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
        // Store both targets and actual achieved values
        density_targets: targets,
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
      setPipelineProgress(85);

      // Generate teasers (60s and 30s)
      updatePipelineStep('teasers', 'running', 'Generando teasers promocionales...');
      try {
        const { data: teaserData, error: teaserError } = await supabase.functions.invoke('generate-teasers', {
          body: {
            projectId,
            screenplay: completeScreenplay,
            language
          }
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

      setPipelineProgress(90);

      // Save to DB
      updatePipelineStep('save', 'running');
      const screenplayText = JSON.stringify(completeScreenplay, null, 2);

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

    } catch (error: any) {
      console.error('Pipeline error:', error);
      toast.error(error.message || 'Error en la generación');
      updatePipelineStep('episodes', 'error');
    } finally {
      setPipelineRunning(false);
      setCurrentEpisodeGenerating(null);
      setEpisodeStartedAtMs(null);
      setCancelController(null);
      setBackgroundGeneration(false);
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
    clearPipelineState();
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
    generateLightOutline();
  };

  // Script Doctor
  const analyzeWithDoctor = async () => {
    const textToAnalyze = generatedScript ? JSON.stringify(generatedScript) : scriptText;
    if (!textToAnalyze || textToAnalyze.length < 200) {
      toast.error('El guion debe tener contenido suficiente');
      return;
    }
    
    setAnalyzing(true);
    try {
      const { data, error } = await supabase.functions.invoke('script-doctor', {
        body: { scriptText: textToAnalyze, language }
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

      // Create scenes from the script data
      const scenesToInsert = episode.scenes.map((scene: any, idx: number) => ({
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
            name: typeof loc === 'string' ? loc : loc.name,
            description: typeof loc === 'object' ? (loc.description || '') : '',
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

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Guion (Generar / Importar)</h2>
          <p className="text-sm text-muted-foreground">
            Pipeline completo: Idea → Outline → QC → Guion → Freeze
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Edit Bible Button */}
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => navigate(`/projects/${projectId}/`)}
          >
            <Book className="w-4 h-4 mr-2" />
            Editar Biblia
          </Button>
          
          {generatedScript && (
            <>
              <Button 
                variant={scriptLocked ? "default" : "outline"} 
                size="sm"
                onClick={scriptLocked ? unlockScript : freezeScript}
              >
                {scriptLocked ? <Lock className="w-4 h-4 mr-2" /> : <Snowflake className="w-4 h-4 mr-2" />}
                {scriptLocked ? 'Congelado' : 'Freeze Script'}
              </Button>
              <Button variant="outline" size="sm" onClick={analyzeWithDoctor} disabled={analyzing}>
                {analyzing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Stethoscope className="w-4 h-4 mr-2" />}
                Script Doctor
              </Button>
              {/* Delete Script Button */}
              <Button 
                variant="destructive" 
                size="sm"
                onClick={deleteCurrentScript}
                disabled={deletingScript}
              >
                {deletingScript ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
                Eliminar Guion
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Pipeline Status - Hidden for cleaner UI */}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="generate" className="flex items-center gap-2">
            <Lightbulb className="w-4 h-4" />
            Generar
          </TabsTrigger>
          <TabsTrigger value="import" className="flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Importar
          </TabsTrigger>
          <TabsTrigger value="library" className="flex items-center gap-2">
            <Film className="w-4 h-4" />
            Referencias
          </TabsTrigger>
          <TabsTrigger value="summary" className="flex items-center gap-2">
            <BookOpen className="w-4 h-4" />
            Resumen
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-2">
            <History className="w-4 h-4" />
            Histórico
          </TabsTrigger>
          <TabsTrigger value="doctor" className="flex items-center gap-2">
            <Stethoscope className="w-4 h-4" />
            Doctor
          </TabsTrigger>
        </TabsList>

        {/* GENERATE TAB */}
        <TabsContent value="generate" className="space-y-4">
          {/* CTA Principal - Pipeline V2 */}
          {/* Generate Outline Button - Only show when no outline and not running */}
          {!lightOutline && !pipelineRunning && (
            <Card className="border-primary/50 bg-gradient-to-r from-primary/5 to-transparent">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <div>
                    <h3 className="font-semibold text-lg flex items-center gap-2">
                      <Sparkles className="w-5 h-5 text-primary" />
                      Genera tu guion
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Describe tu idea y generaremos un outline para tu aprobación
                    </p>
                  </div>
                  <Button 
                    variant="gold" 
                    size="lg"
                    onClick={generateLightOutline} 
                    disabled={generatingOutline || !ideaText.trim()}
                  >
                    {generatingOutline ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Generando...</>
                    ) : (
                      <><Sparkles className="w-4 h-4 mr-2" />Generar Outline</>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* OUTLINE APPROVAL CARD - Pipeline V2 Step 2 */}
          {lightOutline && !outlineApproved && (
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
                  <Label className="text-xs uppercase text-muted-foreground mb-2 block">
                    Personajes ({lightOutline.main_characters?.length || 0})
                  </Label>
                  <div className="grid gap-2 md:grid-cols-2">
                    {lightOutline.main_characters?.map((char: any, i: number) => {
                      const role = char.role || '';
                      const roleDetail = char.role_detail || char.roleDetail;
                      const variant = role === 'protagonist' ? 'default' : role === 'antagonist' ? 'destructive' : 'secondary';
                      return (
                        <div key={i} className="p-2 bg-muted/30 rounded border">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant={variant}>{char.name}</Badge>
                            {(role || roleDetail) && (
                              <span className="text-xs text-muted-foreground">
                                {role}{roleDetail ? ` • ${roleDetail}` : ''}
                              </span>
                            )}
                          </div>
                          {char.description && (
                            <p className="text-xs text-muted-foreground mt-1">{char.description}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Locations (with type + description) */}
                <div>
                  <Label className="text-xs uppercase text-muted-foreground mb-2 block">
                    Localizaciones ({lightOutline.main_locations?.length || 0})
                  </Label>
                  <div className="grid gap-2 md:grid-cols-2">
                    {lightOutline.main_locations?.map((loc: any, i: number) => (
                      <div key={i} className="p-2 bg-muted/30 rounded border">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline">{loc.name}</Badge>
                          {loc.type && <span className="text-xs text-muted-foreground">{loc.type}</span>}
                        </div>
                        {loc.description && (
                          <p className="text-xs text-muted-foreground mt-1">{loc.description}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

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


                {/* Episodes - Editable Titles */}
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

                {/* Action Buttons */}
                <div className="flex gap-3 pt-4 border-t">
                  <Button 
                    variant="gold" 
                    size="lg"
                    className="flex-1"
                    onClick={approveAndGenerateEpisodes}
                    disabled={pipelineRunning}
                  >
                    <CheckCircle className="w-4 h-4 mr-2" />
                    ✅ Aprobar y Generar Episodios
                  </Button>
                  <Button 
                    variant="outline"
                    onClick={regenerateOutline}
                    disabled={generatingOutline}
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Regenerar
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

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Idea & Format */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Tu Idea</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea
                  placeholder="Ej: Una detective de homicidios descubre que su padre, un policía retirado, podría estar involucrado en una serie de asesinatos sin resolver..."
                  value={ideaText}
                  onChange={(e) => setIdeaText(e.target.value)}
                  className="min-h-[120px]"
                />

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Formato</Label>
                    <Select value={format} onValueChange={(v: 'film' | 'series') => setFormat(v)}>
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
                        <Select value={String(episodesCount)} onValueChange={(v) => setEpisodesCount(Number(v))}>
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
                        <Select value={String(episodeDurationMin)} onValueChange={(v) => setEpisodeDurationMin(Number(v))}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {[20, 30, 45, 60].map(n => (
                              <SelectItem key={n} value={String(n)}>{n} min</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </>
                  ) : (
                    <div className="space-y-2">
                      <Label>Duración</Label>
                      <Select value={String(filmDurationMin)} onValueChange={(v) => setFilmDurationMin(Number(v))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {[80, 90, 100, 120].map(n => (
                            <SelectItem key={n} value={String(n)}>{n} min</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
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
                
                {/* Generation Model Selector */}
                <div className="space-y-2 pt-4 border-t">
                  <Label className="flex items-center gap-2">
                    <Rocket className="w-4 h-4 text-primary" />
                    Velocidad de Generación
                  </Label>
                  <Select value={generationModel} onValueChange={(v: GenerationModel) => setGenerationModel(v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {availableGenerationModels.map((model) => (
                        <SelectItem key={model} value={model}>
                          {GENERATION_MODELS[model].displayName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {GENERATION_MODELS[generationModel].description}
                  </p>
                  <div className="flex gap-2 flex-wrap mt-1">
                    <Badge variant="outline" className="text-xs">
                      ~{GENERATION_MODELS[generationModel].estimatedTimePerEpisodeMin} min/ep
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      ~${GENERATION_MODELS[generationModel].costPerEpisodeUsd.toFixed(3)}/ep
                    </Badge>
                    {effectiveCreativeMode !== 'PRO' && (
                      <Badge variant="secondary" className="text-xs">
                        🎬 Hollywood requiere modo PRO
                      </Badge>
                    )}
                  </div>
                </div>
              </CardContent>
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
                    
                    {/* Dynamic Batch Configuration Preview */}
                    {(() => {
                      const batchPreview = calculateDynamicBatches(targets, complexity, undefined, episodeDurationMin, generationModel);
                      const modelCfg = GENERATION_MODELS[generationModel];
                      const totalTimeMin = episodesCount * modelCfg.estimatedTimePerEpisodeMin;
                      const totalCost = episodesCount * modelCfg.costPerEpisodeUsd;
                      return (
                        <div className="col-span-2 pt-2 border-t mt-2">
                          <Label className="text-xs text-muted-foreground flex items-center gap-1">
                            <Settings2 className="w-3 h-3" />
                            Estimación con {modelCfg.displayName}
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
                            <Badge variant="secondary" className="text-xs">
                              💰 ~${totalCost.toFixed(2)} total
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

        {/* IMPORT TAB */}
        <TabsContent value="import" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Importar Guion Existente
              </CardTitle>
              <CardDescription>
                Pega tu guion para analizarlo, ejecutar Script Doctor o Breakdown
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                placeholder="INT. CAFETERÍA - DÍA&#10;&#10;SARA (30s) espera nerviosa..."
                value={scriptText}
                onChange={(e) => setScriptText(e.target.value)}
                className="min-h-[300px] font-mono text-sm"
                disabled={scriptLocked}
              />
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">{scriptText.length} caracteres</p>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={analyzeWithDoctor} disabled={analyzing || scriptText.length < 200}>
                    {analyzing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Stethoscope className="w-4 h-4 mr-2" />}
                    Script Doctor
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* LIBRARY TAB */}
        <TabsContent value="library" className="space-y-4">
          <ReferenceScriptLibrary projectId={projectId} />
        </TabsContent>

        {/* SUMMARY TAB */}
        <TabsContent value="summary" className="space-y-4">
          {!generatedScript ? (
            <Card>
              <CardContent className="py-12 text-center">
                <BookOpen className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                <h3 className="font-medium text-lg mb-2">No hay guion generado</h3>
                <p className="text-muted-foreground mb-4">
                  Genera un guion desde la pestaña "Generar desde Idea"
                </p>
                <Button variant="outline" onClick={() => setActiveTab('generate')}>
                  <Lightbulb className="w-4 h-4 mr-2" />
                  Ir a Generar
                </Button>
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
                  </p>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Button onClick={exportCompletePDF} variant="outline">
                    <FileDown className="w-4 h-4 mr-2" />
                    Exportar PDF Profesional
                  </Button>
                  <Button onClick={segmentAllEpisodes} disabled={segmenting} variant="gold">
                    {segmenting ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Segmentando...</>
                    ) : (
                      <><Scissors className="w-4 h-4 mr-2" />Segmentar Todas las Escenas</>
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

                  {/* Density: Targets vs Achieved */}
                  {(generatedScript.density_targets || generatedScript.counts) && (
                    <div className="space-y-3">
                      <Label className="text-xs text-muted-foreground uppercase flex items-center gap-2">
                        <Settings2 className="w-3 h-3" />
                        Densidad Narrativa
                      </Label>
                      <div className="grid gap-2 grid-cols-2 md:grid-cols-4">
                        <DensityCompareCard 
                          label="Protagonistas" 
                          achieved={generatedScript.counts?.protagonists || generatedScript.density_achieved?.protagonists || 0} 
                          target={generatedScript.density_targets?.protagonists_min}
                        />
                        <DensityCompareCard 
                          label="Secundarios" 
                          achieved={generatedScript.counts?.supporting || generatedScript.density_achieved?.supporting || 0} 
                          target={generatedScript.density_targets?.supporting_min}
                        />
                        <DensityCompareCard 
                          label="Localizaciones" 
                          achieved={generatedScript.counts?.locations || generatedScript.density_achieved?.locations || 0} 
                          target={generatedScript.density_targets?.locations_min}
                        />
                        <DensityCompareCard 
                          label="Escenas Totales" 
                          achieved={generatedScript.counts?.total_scenes || generatedScript.density_achieved?.total_scenes || 0} 
                          target={generatedScript.density_targets?.scenes_per_episode ? (generatedScript.density_targets.scenes_per_episode * (generatedScript.episodes?.length || 1)) : generatedScript.density_targets?.scenes_target}
                        />
                      </div>
                      <div className="grid gap-2 grid-cols-2 md:grid-cols-4">
                        <DensityCompareCard 
                          label="Props Clave" 
                          achieved={generatedScript.counts?.hero_props || 0} 
                          target={generatedScript.density_targets?.hero_props_min}
                        />
                        <DensityCompareCard 
                          label="Setpieces" 
                          achieved={generatedScript.counts?.setpieces || 0} 
                          target={generatedScript.density_targets?.setpieces_min}
                        />
                        <DensityCompareCard 
                          label="Diálogos" 
                          achieved={generatedScript.counts?.total_dialogue_lines || 0} 
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
                                Ver secuencia de planos
                              </CollapsibleTrigger>
                              <CollapsibleContent className="mt-2 space-y-2">
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
                                Ver secuencia de planos
                              </CollapsibleTrigger>
                              <CollapsibleContent className="mt-2 space-y-2">
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
                              <p className="font-medium text-sm truncate">{typeof loc === 'string' ? loc : loc.name}</p>
                              {typeof loc === 'object' && loc.description && (
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

              {/* EPISODES / CHAPTERS - WITH SUMMARY vs FULL SCREENPLAY TOGGLE */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold text-lg">Capítulos / Episodios</h4>
                  <Button variant="outline" size="sm" onClick={() => {
                    const allExpanded = Object.values(expandedEpisodes).every(v => v);
                    const newState: Record<number, boolean> = {};
                    (generatedScript.episodes || [generatedScript]).forEach((_: any, i: number) => { newState[i] = !allExpanded; });
                    setExpandedEpisodes(newState);
                  }}>
                    {Object.values(expandedEpisodes).every(v => v) ? 'Contraer todos' : 'Expandir todos'}
                  </Button>
                </div>

                {(generatedScript.episodes || [{ episode_number: 1, title: generatedScript.title || 'Película', synopsis: generatedScript.synopsis, scenes: generatedScript.scenes || [] }]).map((ep: any, epIdx: number) => {
                  const episodeNum = ep.episode_number || epIdx + 1;
                  const viewMode = episodeViewMode[epIdx] || 'summary';
                  const dialogueCount = ep.scenes?.reduce((sum: number, s: any) => sum + (s.dialogue?.length || 0), 0) || 0;
                  
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
                                      <span>{scene.scene_number || sceneIdx + 1}. {scene.slugline || 'SIN SLUGLINE'}</span>
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
                                      {scene.dialogue?.length > 0 && (
                                        <div className="space-y-3 bg-muted/30 rounded-lg p-4">
                                          {scene.dialogue.map((d: any, di: number) => (
                                            <div key={di} className="pl-4">
                                              <div className="font-bold text-sm text-center uppercase tracking-wide">
                                                {d.character}
                                              </div>
                                              {d.parenthetical && (
                                                <div className="text-xs text-muted-foreground text-center italic">
                                                  ({d.parenthetical})
                                                </div>
                                              )}
                                              <div className="text-sm text-center max-w-md mx-auto mt-1">
                                                {d.line}
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      )}

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

        {/* DOCTOR TAB */}
        <TabsContent value="doctor" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Stethoscope className="w-5 h-5 text-blue-500" />
                    Script Doctor
                    {doctorScore !== null && (
                      <Badge variant={doctorScore >= 80 ? 'default' : doctorScore >= 60 ? 'secondary' : 'destructive'}>
                        Score: {doctorScore}/100
                      </Badge>
                    )}
                  </CardTitle>
                  <CardDescription>Análisis profesional con sugerencias accionables</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={analyzeWithDoctor} disabled={analyzing || (!generatedScript && scriptText.length < 200)}>
                    {analyzing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                    Analizar
                  </Button>
                  {doctorSuggestions.length > 0 && (
                    <Button 
                      onClick={applyDoctorSuggestions} 
                      disabled={applyingDoctor || !generatedScript || selectedSuggestions.size === 0}
                    >
                      {applyingDoctor ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Wand2 className="w-4 h-4 mr-2" />}
                      Aplicar ({selectedSuggestions.size})
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            {doctorSuggestions.length > 0 && (
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
            )}
          </Card>
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
    </div>
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
