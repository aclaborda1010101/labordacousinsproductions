/**
 * ScriptWorkspace v2 - Two clear modes: Generate from idea / Analyze existing script
 * With quality diagnosis, visual summary, and adapted UX by level (Normal/Pro)
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { invokeWithTimeout, InvokeFunctionError } from '@/lib/supabaseFetchWithTimeout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { useEditorialKnowledgeBase } from '@/hooks/useEditorialKnowledgeBase';
import { useBackgroundTasks } from '@/contexts/BackgroundTasksContext';
import { ScriptSummaryPanelAssisted } from './ScriptSummaryPanelAssisted';
import { ScriptGenerationProgress } from './ScriptGenerationProgress';
import { exportOutlinePDF } from '@/lib/exportOutlinePDF';
import { calculateAutoTargets, type TargetInputs } from '@/lib/autoTargets';
import { GenerationActionBar } from '@/components/generation/GenerationActionBar';
import {
  Lightbulb,
  FileText,
  Upload,
  Wand2,
  Search,
  Loader2,
  CheckCircle,
  Users,
  MapPin,
  Film,
  Settings2,
  ArrowRight,
  Sparkles,
  AlertTriangle,
  Info,
  Clock,
  Palette,
  BookOpen,
  Clapperboard,
  RefreshCw,
  Edit3,
  Bell,
  Zap,
  GitBranch,
  Crown,
  Skull,
  UserCheck,
  UserPlus,
  Star,
  Users2,
  FileDown,
  Mic,
  MicOff,
  Square,
} from 'lucide-react';
import { useVoiceRecorder } from '@/hooks/useVoiceRecorder';

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
import { importCharactersFromScript } from '@/lib/importCharactersFromScript';

interface ScriptWorkspaceProps {
  projectId: string;
  onEntitiesExtracted?: () => void;
}

type EntryMode = 'idea' | 'existing';
type InputMethod = 'paste' | 'upload';
type WorkflowStatus = 'idle' | 'generating' | 'analyzing' | 'extracting' | 'success' | 'error';
type ScriptQuality = 'solid' | 'incomplete' | 'draft';

interface ScriptSynopsis {
  faithful_summary?: string;
  conflict_type?: string;
  narrative_scope?: string;
  temporal_span?: string;
  tone?: string;
  themes?: string[];
}

interface CharacterData {
  name: string;
  role?: string;
  role_detail?: string;
  entity_type?: string;
  description?: string;
  priority?: string;
  first_appearance?: string;
  scenes_count?: number;
  dialogue_lines?: number;
}

interface LocationData {
  name: string;
  type?: string;
  scale?: string;
  description?: string;
  priority?: string;
}

interface SceneData {
  scene_number?: number;
  slugline?: string;
  summary?: string;
  location_name?: string;
  characters_present?: string[];
  estimated_duration_sec?: number;
}

interface SubplotData {
  name: string;
  description?: string;
  characters_involved?: string[];
  resolution?: string;
}

interface PlotTwistData {
  name: string;
  scene?: number;
  description?: string;
  impact?: 'minor' | 'major' | 'paradigm_shift';
}

interface BreakdownResult {
  synopsis?: ScriptSynopsis;
  characters: CharacterData[];
  locations: LocationData[];
  scenes: SceneData[];
  props?: any[];
  set_pieces?: any[];
  subplots?: SubplotData[];
  plot_twists?: PlotTwistData[];
  summary?: {
    total_scenes?: number;
    total_characters?: number;
    protagonists?: number;
    antagonists?: number;
    supporting_characters?: number;
    recurring_characters?: number;
    cameos?: number;
    extras_with_lines?: number;
    collective_entities?: number;
    total_locations?: number;
    total_subplots?: number;
    total_plot_twists?: number;
    estimated_runtime_min?: number;
    analysis_confidence?: string;
    production_notes?: string;
  };
}

interface QualityDiagnosis {
  quality: ScriptQuality;
  score: number;
  issues: string[];
  suggestions: string[];
}

/**
 * Robust helper to coerce generatedScript to string regardless of format
 * Handles: string, array, object with common keys, null/undefined
 */
function coerceScriptToString(input: unknown): string {
  // Debug log to inspect actual formats returned from API
  console.log('[ScriptWorkspace] coerceScriptToString input type:', typeof input, input);
  
  // Null/undefined
  if (input == null) {
    return '';
  }
  
  // Already a string
  if (typeof input === 'string') {
    return input;
  }
  
  // Array - join with newlines, stringify objects within
  if (Array.isArray(input)) {
    return input
      .map(item => (typeof item === 'string' ? item : JSON.stringify(item)))
      .join('\n');
  }
  
  // Object - try common keys first
  if (typeof input === 'object') {
    const obj = input as Record<string, unknown>;
    const commonKeys = ['script', 'text', 'result', 'content', 'output', 'screenplay', 'raw_text'];
    
    for (const key of commonKeys) {
      if (key in obj && typeof obj[key] === 'string') {
        return obj[key] as string;
      }
    }
    
    // Fallback: stringify the whole object
    return JSON.stringify(obj, null, 2);
  }
  
  // Fallback for other types (number, boolean, etc.)
  return String(input);
}

export default function ScriptWorkspace({ projectId, onEntitiesExtracted }: ScriptWorkspaceProps) {
  const navigate = useNavigate();
  const { addTask, updateTask, completeTask, failTask, setIsOpen } = useBackgroundTasks();
  
  // User level from EKB
  const { userLevel } = useEditorialKnowledgeBase({
    projectId,
    assetType: 'character',
  });
  const isPro = userLevel === 'pro';

  // Draft persistence key
  const DRAFT_KEY = `script_draft_${projectId}`;

  // Entry mode state
  const [entryMode, setEntryMode] = useState<EntryMode | null>(null);
  const [hasExistingScript, setHasExistingScript] = useState(false);
  const [existingScriptText, setExistingScriptText] = useState('');
  const [hasDraft, setHasDraft] = useState(false);

  // Form state
  const [ideaText, setIdeaText] = useState('');
  const [scriptText, setScriptText] = useState('');
  const [inputMethod, setInputMethod] = useState<InputMethod>('paste');
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);

  // Generation state
  const [status, setStatus] = useState<WorkflowStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [generatedScript, setGeneratedScript] = useState<unknown>(null);
  const [breakdownResult, setBreakdownResult] = useState<BreakdownResult | null>(null);
  const [qualityDiagnosis, setQualityDiagnosis] = useState<QualityDiagnosis | null>(null);
  
  // Streaming state for real-time script generation
  const [streamingContent, setStreamingContent] = useState<string>('');
  const [isStreaming, setIsStreaming] = useState(false);
  const streamAbortRef = useRef<AbortController | null>(null);
  
  // Generation timing for estimated time calculation
  const [generationStartTime, setGenerationStartTime] = useState<Date | null>(null);

  // V3.0: Quality tier control (replaces legacy model selection)
  const [qualityTier, setQualityTier] = useState<'rapido' | 'profesional' | 'hollywood'>('profesional');
  const [extractCharacters, setExtractCharacters] = useState(true);
  const [extractLocations, setExtractLocations] = useState(true);
  const [extractScenes, setExtractScenes] = useState(true);
  
  // V3.0: Disable narrative density (let AI generate based purely on user idea)
  const [disableDensity, setDisableDensity] = useState(true); // Default: OFF (no density constraints)

  // File input ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  // PDF processing cancellation + persistent error message (upload mode)
  const pdfAbortRef = useRef<AbortController | null>(null);
  const [pdfUploadError, setPdfUploadError] = useState<string | null>(null);

  // Voice recorder for idea input
  const voiceRecorder = useVoiceRecorder({
    onTranscript: (text) => {
      setIdeaText((prev) => prev ? `${prev}\n\n${text}` : text);
    },
    maxDurationMs: 120000, // 2 minutes max
  });

  // Load draft from localStorage on mount
  useEffect(() => {
    try {
      const savedDraft = localStorage.getItem(DRAFT_KEY);
      if (savedDraft) {
        const draft = JSON.parse(savedDraft);
        if (draft.ideaText) setIdeaText(draft.ideaText);
        if (draft.scriptText) setScriptText(coerceScriptToString(draft.scriptText));
        // Note: we intentionally do NOT auto-restore entryMode.
        // This avoids jumping back into the old edit screen when a script already exists.
        if (draft.inputMethod) setInputMethod(draft.inputMethod);
        if (draft.uploadedFileName) setUploadedFileName(draft.uploadedFileName);
        if (draft.qualityTier) setQualityTier(draft.qualityTier);
        setHasDraft(true);
        console.log('[ScriptWorkspace] Draft restored:', draft.entryMode);
      }
    } catch (e) {
      console.warn('[ScriptWorkspace] Error loading draft:', e);
    }
  }, [DRAFT_KEY]);

  // Auto-save draft when relevant state changes
  useEffect(() => {
    // Don't save if we have an existing script or generation succeeded
    if (hasExistingScript || status === 'success') {
      // Clear draft when script is saved successfully
      localStorage.removeItem(DRAFT_KEY);
      return;
    }
    
    // Only save if there's content to save
    if (ideaText || scriptText || entryMode) {
      const draft = {
        ideaText,
        scriptText,
        entryMode,
        inputMethod,
        uploadedFileName,
        qualityTier,
        savedAt: new Date().toISOString(),
      };
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    }
  }, [ideaText, scriptText, entryMode, inputMethod, uploadedFileName, qualityTier, hasExistingScript, status, DRAFT_KEY]);

  // Clear draft when discarding
  const clearDraft = () => {
    localStorage.removeItem(DRAFT_KEY);
    setHasDraft(false);
    setIdeaText('');
    setScriptText('');
    setEntryMode(null);
    setUploadedFileName(null);
    toast.info('Borrador descartado');
  };

  // Project settings (used for episode planning)
  const [projectFormat, setProjectFormat] = useState<'film' | 'series' | 'short' | string>('series');
  const [episodesCount, setEpisodesCount] = useState<number>(1);
  const [episodeDurationMin, setEpisodeDurationMin] = useState<number>(30);
  const [masterLanguage, setMasterLanguage] = useState<string>('es');
  
  // Refresh trigger for re-fetching script
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Loading state for script data
  const [isLoadingScript, setIsLoadingScript] = useState(true);

  // Check for existing script on mount or refresh
  const refreshScriptData = useCallback(async () => {
    setIsLoadingScript(true);
    console.log('[ScriptWorkspace] Fetching script data for project:', projectId);
    
    try {
      // Get project settings
      const { data: projectData, error: projectError } = await supabase
        .from('projects')
        .select('format, episodes_count, target_duration_min, master_language')
        .eq('id', projectId)
        .maybeSingle();
      
      if (projectError) {
        console.error('[ScriptWorkspace] Error fetching project:', projectError);
      }
      
      if (projectData?.format) {
        setProjectFormat(projectData.format);
      }
      if (typeof projectData?.episodes_count === 'number') {
        setEpisodesCount(projectData.episodes_count || 1);
      }
      if (typeof projectData?.target_duration_min === 'number') {
        setEpisodeDurationMin(projectData.target_duration_min || 30);
      }
      if (projectData?.master_language) {
        setMasterLanguage(projectData.master_language);
        console.log('[ScriptWorkspace] Master language:', projectData.master_language);
      }

      const { data, error } = await supabase
        .from('scripts')
        .select('id, raw_text, parsed_json, status, created_at')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error('[ScriptWorkspace] Error fetching script:', error);
        toast.error('Error al cargar el guion');
      }

      console.log('[ScriptWorkspace] Script data:', data
        ? { id: data.id, hasText: !!data.raw_text, textLength: data.raw_text?.length, hasParsedJson: !!data.parsed_json && Object.keys(data.parsed_json as object || {}).length > 0, status: data.status, createdAt: data.created_at }
        : 'No script found');

      // If we have parsed_json with content, hydrate the breakdown state
      if (data?.parsed_json && typeof data.parsed_json === 'object' && Object.keys(data.parsed_json as object).length > 0) {
        const pj = data.parsed_json as Record<string, unknown>;
        const payload = (pj as any)?.breakdown ?? pj;
        const breakdown: BreakdownResult = {
          characters: (payload.characters as BreakdownResult['characters']) || [],
          locations: (payload.locations as BreakdownResult['locations']) || [],
          scenes: (payload.scenes as BreakdownResult['scenes']) || [],
          props: (payload.props as BreakdownResult['props']) || [],
          synopsis: payload.synopsis as BreakdownResult['synopsis'],
          subplots: (payload.subplots as BreakdownResult['subplots']) || [],
          plot_twists: (payload.plot_twists as BreakdownResult['plot_twists']) || [],
          summary: (typeof payload.summary === 'object' ? payload.summary : undefined) as BreakdownResult['summary'],
        };
        setBreakdownResult(breakdown);
        setQualityDiagnosis(evaluateQuality(breakdown));
        console.log('[ScriptWorkspace] Hydrated breakdown from parsed_json');
      }

      console.log('[ScriptWorkspace] Script data:', data ? { id: data.id, hasText: !!data.raw_text, textLength: data.raw_text?.length, createdAt: data.created_at } : 'No script found');

      if (data?.raw_text) {
        setHasExistingScript(true);
        // Ensure raw_text is always a string
        const rawText = typeof data.raw_text === 'string' ? data.raw_text : JSON.stringify(data.raw_text);
        setExistingScriptText(rawText);
        console.log('[ScriptWorkspace] Script loaded successfully, length:', rawText.length);
      } else if (data) {
        // Script row exists but has no text yet (e.g. upload-only / transient state)
        // Do NOT clear previously loaded state to avoid flicker.
        console.warn('[ScriptWorkspace] Script row found but raw_text empty; keeping last known script in UI');
      } else {
        // Sometimes the backend can temporarily return 0 rows (e.g. session refresh / RLS timing).
        // Clearing state here makes the UI look like the analysis "lost" data.
        console.warn('[ScriptWorkspace] No script returned; keeping last known script in UI');
      }
    } catch (e) {
      console.error('[ScriptWorkspace] Unexpected error:', e);
    } finally {
      setIsLoadingScript(false);
    }
  }, [projectId]);

  useEffect(() => {
    refreshScriptData();
  }, [refreshScriptData, refreshTrigger]);

  

  // Function to reset and allow uploading a new script
  const handleChangeScript = () => {
    setHasExistingScript(false);
    setExistingScriptText('');
    setScriptText('');
    setBreakdownResult(null);
    setQualityDiagnosis(null);
    setStatus('idle');
    setProgress(0);
    setEntryMode('existing');
    setUploadedFileName(null);
    toast.info('Puedes subir un nuevo guión');
  };

  // Evaluate script quality from breakdown result
  const evaluateQuality = (breakdown: BreakdownResult): QualityDiagnosis => {
    const issues: string[] = [];
    const suggestions: string[] = [];
    let score = 100;

    // Handle both nested and flat array formats for all fields
    const charactersArray = Array.isArray(breakdown.characters) 
      ? breakdown.characters 
      : (breakdown.characters as any)?.cast || [];
    const locationsArray = Array.isArray(breakdown.locations)
      ? breakdown.locations
      : (breakdown.locations as any)?.base || [];
    const scenesArray = Array.isArray(breakdown.scenes)
      ? breakdown.scenes
      : (breakdown.scenes as any)?.list || [];

    const characterCount = charactersArray.length;
    const sceneCount = scenesArray.length || (breakdown.scenes as any)?.total || 0;
    const locationCount = locationsArray.length;
    const hasProtagonist = charactersArray.some((c: any) => c.role === 'protagonist');
    const hasSynopsis = breakdown.synopsis?.faithful_summary && breakdown.synopsis.faithful_summary.length > 50;

    // Check for essential elements
    if (characterCount === 0) {
      issues.push('No se detectaron personajes');
      score -= 30;
    } else if (characterCount < 2) {
      issues.push('Solo un personaje detectado');
      score -= 15;
    }

    if (!hasProtagonist && characterCount > 0) {
      suggestions.push('Considera definir un protagonista claro');
      score -= 10;
    }

    if (sceneCount === 0) {
      issues.push('No se detectaron escenas estructuradas');
      score -= 30;
    } else if (sceneCount < 3) {
      issues.push('Pocas escenas detectadas');
      score -= 15;
    }

    if (locationCount === 0) {
      suggestions.push('Añade descripciones de localizaciones');
      score -= 10;
    }

    if (!hasSynopsis) {
      suggestions.push('El texto podría beneficiarse de más contexto narrativo');
      score -= 10;
    }

    // Check for minimal content
    const hasDialogue = scenesArray.some((s: any) => 
      s.characters_present && s.characters_present.length > 0
    );
    if (!hasDialogue) {
      suggestions.push('Considera añadir diálogos o interacciones');
    }

    // Determine quality level
    let quality: ScriptQuality;
    if (score >= 70 && characterCount >= 2 && sceneCount >= 3) {
      quality = 'solid';
    } else if (score >= 40 && (characterCount >= 1 || sceneCount >= 1)) {
      quality = 'incomplete';
    } else {
      quality = 'draft';
    }

    return { quality, score: Math.max(0, score), issues, suggestions };
  };

  // Calculate dynamic timeout based on file size (pages ≈ KB/3.5)
  // Extended timeouts for large Hollywood scripts (100+ pages)
  const getTimeoutForFileSize = (fileSizeBytes: number): number => {
    const fileSizeKB = fileSizeBytes / 1024;
    const estimatedPages = Math.ceil(fileSizeKB / 3.5);
    
    // Base: 1.5s per page + buffer for large scripts
    if (estimatedPages < 30) return 90000;          // <30 pages: 1.5 min
    if (estimatedPages < 60) return 150000;         // 30-60 pages: 2.5 min
    if (estimatedPages < 100) return 240000;        // 60-100 pages: 4 min
    if (estimatedPages < 150) return 360000;        // 100-150 pages: 6 min
    if (estimatedPages < 200) return 480000;        // 150-200 pages: 8 min
    return 600000;                                   // >200 pages: 10 min
  };

  // Animated progress messages during PDF processing
  const PDF_PROCESSING_MESSAGES = [
    '📄 Leyendo páginas del PDF...',
    '🔍 Identificando formato de guion...',
    '📝 Extrayendo diálogos y acciones...',
    '🎬 Detectando escenas y sluglines...',
    '👥 Identificando personajes...',
    '🏠 Localizando escenarios...',
    '⏱️ Casi listo, finalizando extracción...',
  ];
  const [pdfMessageIndex, setPdfMessageIndex] = useState(0);

  const cancelPdfProcessing = useCallback(() => {
    pdfAbortRef.current?.abort();
    pdfAbortRef.current = null;

    setStatus('idle');
    setProgress(0);
    setProgressMessage('');
    setPdfUploadError(null);
    setUploadedFileName(null);

    if (fileInputRef.current) fileInputRef.current.value = '';

    toast.info('Procesamiento cancelado');
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['text/plain', 'application/pdf'];
    if (!allowedTypes.includes(file.type) && !file.name.endsWith('.txt') && !file.name.endsWith('.pdf')) {
      toast.error('Solo se permiten archivos .txt o .pdf');
      return;
    }

    setUploadedFileName(file.name);
    setStatus('analyzing');
    setProgress(5);
    setProgressMessage('Preparando archivo...');
    setPdfMessageIndex(0);
    
    if (file.type === 'text/plain' || file.name.endsWith('.txt')) {
      const text = await file.text();
      setScriptText(text);
      setStatus('idle');
      setProgress(0);
      setProgressMessage('');
      toast.success('Archivo cargado correctamente');
    } else if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
      const fileSizeKB = Math.round(file.size / 1024);
      const estimatedPages = Math.ceil(file.size / 3500);
      setProgressMessage(`📤 Subiendo PDF (${fileSizeKB}KB, ~${estimatedPages} págs)...`);
      toast.info(`Procesando PDF (~${estimatedPages} páginas, ${fileSizeKB}KB)...`);
      
      const fileName = `${projectId}/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from('scripts')
        .upload(fileName, file);

      if (uploadError) {
        toast.error('Error al subir archivo');
        console.error(uploadError);
        setStatus('error');
        setProgressMessage('');
        return;
      }

      setProgress(15);
      setProgressMessage('✅ Archivo subido. Preparando análisis con IA...');
      const { data: urlData } = supabase.storage.from('scripts').getPublicUrl(fileName);
      
      try {
        // Use dynamic timeout based on file size
        const timeoutMs = getTimeoutForFileSize(file.size);
        console.log(`[ScriptWorkspace] Using timeout ${timeoutMs}ms for ${fileSizeKB}KB PDF`);

        // Allow user cancellation
        pdfAbortRef.current?.abort();
        const abortController = new AbortController();
        pdfAbortRef.current = abortController;
        setPdfUploadError(null);

        // Start progress simulation with rotating messages
        let progressValue = 20;
        let messageIdx = 0;
        const progressInterval = setInterval(() => {
          // Update progress bar
          progressValue = Math.min(progressValue + (progressValue < 50 ? 2 : progressValue < 75 ? 1 : 0.3), 85);
          setProgress(progressValue);

          // Rotate messages
          messageIdx = (messageIdx + 1) % PDF_PROCESSING_MESSAGES.length;
          setPdfMessageIndex(messageIdx);
        }, 3000);

        try {
          setProgressMessage(PDF_PROCESSING_MESSAGES[0]);

          const invokeParse = () =>
            invokeWithTimeout<{
              rawText?: string;
              error?: string;
              needsManualInput?: boolean;
              hint?: string;
              stats?: { estimatedPages?: number; fileSizeKB?: number; modelUsed?: string };
            }>(
              'parse-script',
              { pdfUrl: urlData.publicUrl, projectId, parseMode: 'extract_only' },
              { timeoutMs, signal: abortController.signal }
            );

          let { data, error } = await invokeParse();

          // Handle PROJECT_BUSY (409) without crashing the UI; retry once.
          if (error instanceof InvokeFunctionError) {
            const body = (error.bodyJson ?? {}) as any;
            const code = typeof body?.code === 'string' ? body.code : undefined;
            const retryAfter = typeof body?.retryAfter === 'number' ? body.retryAfter : 30;

            console.warn('[ScriptWorkspace] parse-script failed', {
              status: error.status,
              code,
              retryAfter,
              message: error.message,
              body,
            });

            if (error.status === 409 && code === 'PROJECT_BUSY') {
              toast.warning('Proyecto ocupado', {
                description: `Reintento en ${retryAfter}s`,
                duration: 8000,
              });
              setProgressMessage(`⏳ Proyecto ocupado. Reintento en ${retryAfter}s...`);

              await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
              if (!abortController.signal.aborted) {
                ;({ data, error } = await invokeParse());
              }
            }
          }

          if (error) {
            if (error instanceof InvokeFunctionError) {
              const body = (error.bodyJson ?? {}) as any;
              const message = String(error.message || '').toLowerCase();

              console.warn('[ScriptWorkspace] parse-script final error', {
                status: error.status,
                message: error.message,
                body,
              });

              if (error.status === 401 || message.includes('missing auth.uid')) {
                toast.error('Sesión expirada. Inicia sesión de nuevo.', { duration: 8000 });
                setPdfUploadError('Sesión expirada. Inicia sesión de nuevo.');
                setStatus('idle');
                setProgress(0);
                setProgressMessage('');
                return;
              }

              if (error.status === 409) {
                // Any other 409: keep it as a user-facing error without breaking UI
                setPdfUploadError(error.message || 'Proyecto ocupado. Intenta de nuevo.');
                setStatus('idle');
                setProgress(0);
                setProgressMessage('');
                toast.error(error.message || 'Proyecto ocupado. Intenta de nuevo.');
                return;
              }
            }

            throw error;
          }

          setProgress(90);
          setProgressMessage('✅ Texto extraído. Analizando estructura del guion...');

          if (data?.needsManualInput) {
            toast.warning(data.error || 'El PDF requiere entrada manual.', {
              description: data.hint,
              duration: 8000,
            });
            setStatus('idle');
            setProgress(0);
            setProgressMessage('');
            setUploadedFileName(null);
            if (fileInputRef.current) fileInputRef.current.value = '';
            return;
          }

          if (data?.rawText) {
            setScriptText(data.rawText);
            const stats = data.stats;
            if (stats) {
              console.log(`[ScriptWorkspace] PDF stats: ${stats.estimatedPages} pages, model: ${stats.modelUsed}`);
            }
            setProgressMessage('🎯 Analizando personajes, locaciones y escenas...');
            toast.success('PDF procesado. Analizando guion...');
            // Auto-trigger analysis after PDF processing with the extracted text
            await handleAnalyzeScript(data.rawText);
            // Force refresh to show the saved script
            setRefreshTrigger(prev => prev + 1);
          } else if (data?.error) {
            toast.error(data.error);
            setPdfUploadError(data.error);
            setStatus('idle');
            setProgress(0);
            setProgressMessage('');
          } else {
            setPdfUploadError('No se pudo extraer texto del PDF.');
            setStatus('idle');
            setProgress(0);
            setProgressMessage('');
          }
        } finally {
          clearInterval(progressInterval);
          pdfAbortRef.current = null;
        }
      } catch (err) {
        console.error('PDF parse error:', err);
        const errorMsg = err instanceof Error ? err.message : 'Error desconocido';

        if (errorMsg.toLowerCase().includes('cancelado')) {
          setStatus('idle');
          setProgress(0);
          setProgressMessage('');
          setUploadedFileName(null);
          setPdfUploadError(null);
          return;
        }

        // Avoid leaving the UI in a confusing "blocked" state
        setStatus('idle');
        setProgress(0);
        setProgressMessage('');
        setPdfUploadError(
          errorMsg.includes('Timeout')
            ? `El PDF es muy grande. ${errorMsg}`
            : 'Error al procesar el PDF. Intenta copiar y pegar el texto directamente.'
        );

        toast.error(
          errorMsg.includes('Timeout')
            ? `El PDF es muy grande. ${errorMsg}`
            : 'Error al procesar el PDF. Intenta copiar y pegar el texto directamente.'
        );
      }
    }
  };

  // Generate script from idea - with streaming support
  const handleGenerateScript = async (runInBackground = false) => {
    if (!ideaText.trim()) {
      toast.error('Escribe tu idea primero');
      return;
    }

    // Create background task
    const taskId = addTask({
      type: 'script_generation',
      title: 'Generando guion desde idea',
      description: ideaText.slice(0, 100) + (ideaText.length > 100 ? '...' : ''),
      projectId,
    });

    if (runInBackground) {
      toast.success('Generación iniciada en segundo plano', {
        description: 'Puedes navegar a otras pantallas. Te notificaremos cuando termine.',
        action: {
          label: 'Ver progreso',
          onClick: () => setIsOpen(true),
        },
      });
    } else {
      setStatus('generating');
      setProgress(10);
      setStreamingContent('');
      setIsStreaming(true);
      setGenerationStartTime(new Date());
    }

    // Abort controller for cancellation
    streamAbortRef.current = new AbortController();

    try {
      updateTask(taskId, { progress: 10, description: 'Generando esquema...' });
      
      // Calculate density targets based on project settings
      const targetInputs: TargetInputs = {
        format: projectFormat === 'film' ? 'film' : 'series',
        episodesCount: projectFormat === 'film' ? 1 : episodesCount,
        episodeDurationMin: 45,
        complexity: 'medium',
        genre: 'drama'
      };
      const densityTargets = calculateAutoTargets(targetInputs);
      
      // Generate outline first (non-streaming)
      const { data: outlineData, error: outlineError } = await supabase.functions.invoke('generate-outline-light', {
        body: {
          projectId,
          idea: ideaText,
          format: projectFormat === 'film' ? 'film' : 'series',
          episodesCount: projectFormat === 'film' ? 1 : episodesCount,
          language: masterLanguage === 'es' ? 'es-ES' : masterLanguage,
          qualityTier,
          disableDensity,
          densityTargets, // V3.1: Pass calculated density targets
        }
      });

      if (outlineError) throw outlineError;
      
      // V3.1: Validate outline quality - reject degraded outlines
      const responseData = outlineData as { outline: any; outline_quality?: string; warnings?: string[] } | null;
      const outlineQuality = responseData?.outline_quality || 'UNKNOWN';
      const outlineWarnings = responseData?.warnings || [];
      if (outlineQuality === 'DEGRADED' || !responseData?.outline?.title) {
        const errorMsg = outlineWarnings.length > 0 
          ? `Outline degradado: ${outlineWarnings.join(', ')}`
          : 'El outline no se generó correctamente. Intenta de nuevo.';
        toast.error(errorMsg, { duration: 8000 });
        throw new Error(errorMsg);
      }
      
      if (!runInBackground) setProgress(30);
      updateTask(taskId, { progress: 30, description: 'Escribiendo guion en tiempo real...' });

      // STREAMING: Fetch directly instead of supabase.functions.invoke
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      const {
        data: { session },
      } = await supabase.auth.getSession();
      const accessToken = session?.access_token;
      if (!accessToken) {
        throw new Error('Sesión expirada. Vuelve a iniciar sesión.');
      }

      const response = await fetch(`${supabaseUrl}/functions/v1/script-generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: supabaseKey,
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          idea: ideaText,
          genre: '',
          tone: '',
          format: projectFormat === 'film' ? 'film' : 'series',
          episodesCount: projectFormat === 'film' ? 1 : episodesCount,
          episodeDurationMin,
          language: masterLanguage === 'es' ? 'es-ES' : masterLanguage, // Use project language
          stream: true,
          outline: responseData?.outline,
        }),
        signal: streamAbortRef.current.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `Error ${response.status}`);
      }

      const contentType = response.headers.get('Content-Type') || '';
      let fullText = '';

      if (contentType.includes('text/event-stream')) {
        // Process streaming response (Anthropic SSE format)
        const reader = response.body?.getReader();
        if (!reader) throw new Error('No stream available');
        
        const decoder = new TextDecoder();
        let buffer = '';
        
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          buffer += decoder.decode(value, { stream: true });
          
          // Process SSE events line by line
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // Keep incomplete line in buffer
          
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const jsonStr = line.slice(6).trim();
            if (!jsonStr || jsonStr === '[DONE]') continue;
            
            try {
              const event = JSON.parse(jsonStr);
              
              // Anthropic streaming format: content_block_delta with text
              if (event.type === 'content_block_delta' && event.delta?.text) {
                fullText += event.delta.text;
                setStreamingContent(fullText);
                
                // Update progress based on text length (rough estimate)
                const estimatedProgress = Math.min(30 + (fullText.length / 50), 85);
                if (!runInBackground) setProgress(estimatedProgress);
              }
            } catch (e) {
              // Skip invalid JSON lines (keep-alive, etc.)
            }
          }
        }
      } else {
        // JSON direct response from generate-script
        const jsonData = await response.json();
        
        // Extract raw_content from scenes array (avoid duplicating sluglines)
        if (jsonData.scenes && Array.isArray(jsonData.scenes)) {
          fullText = jsonData.scenes
            .map((s: { slugline?: string; raw_content?: string }) => {
              const slugline = s.slugline?.trim() || '';
              const rawContent = s.raw_content?.trim() || '';
              
              // If raw_content already starts with the slugline, use only raw_content
              if (rawContent && slugline) {
                const rawContentStart = rawContent.slice(0, slugline.length + 20).toUpperCase();
                const sluglineUpper = slugline.toUpperCase();
                if (rawContentStart.includes(sluglineUpper)) {
                  return rawContent;
                }
                return `${slugline}\n\n${rawContent}`;
              }
              
              return rawContent || slugline || '';
            })
            .filter(Boolean)
            .join('\n\n---\n\n');
        } else if (jsonData.script_content) {
          // Fallback: direct script_content field
          fullText = jsonData.script_content;
        } else if (typeof jsonData === 'string') {
          fullText = jsonData;
        }
        
        setStreamingContent(fullText);
        if (!runInBackground) setProgress(85);
      }
      
      // Generation complete
      setIsStreaming(false);
      if (!runInBackground) setProgress(90);
      updateTask(taskId, { progress: 90, description: 'Guardando...' });

      const rawScriptText = fullText.trim();
      if (!rawScriptText) {
        throw new Error('No se recibió texto de guion desde el generador');
      }

      // Build parsed_json structure
      const parsedJson = {
        title: 'Guion Generado',
        synopsis: '',
        episodes: [],
        characters: [],
        locations: [],
        props: [],
        subplots: [],
        plot_twists: [],
      };
      
      // Upsert: update existing or create new (one script per project)
      const { data: existingScript } = await supabase
        .from('scripts')
        .select('id')
        .eq('project_id', projectId)
        .limit(1)
        .maybeSingle();

      let savedScriptId: string | null = existingScript?.id ?? null;

      if (existingScript) {
        const { data: updated, error: updateError } = await supabase
          .from('scripts')
          .update({
            raw_text: rawScriptText,
            parsed_json: parsedJson,
            status: 'draft',
          })
          .eq('id', existingScript.id)
          .select('id')
          .single();

        if (updateError) throw updateError;
        savedScriptId = updated?.id ?? null;
      } else {
        const { data: inserted, error: insertError } = await supabase
          .from('scripts')
          .insert({
            project_id: projectId,
            raw_text: rawScriptText,
            parsed_json: parsedJson,
            status: 'draft',
          })
          .select('id')
          .single();

        if (insertError) throw insertError;
        savedScriptId = inserted?.id ?? null;
      }

      if (!savedScriptId) {
        throw new Error('No se pudo guardar el guion');
      }

      // Run breakdown for episode structure
      updateTask(taskId, { progress: 95, description: 'Analizando estructura...' });
      if (!runInBackground) setProgress(95);

      const { error: breakdownError } = await supabase.functions.invoke('script-breakdown', {
        body: {
          projectId,
          scriptText: rawScriptText,
          scriptId: savedScriptId,
          language: 'es-ES',
          format: projectFormat === 'film' ? 'film' : 'series',
          episodesCount: projectFormat === 'film' ? 1 : episodesCount,
          episodeDurationMin,
        },
      });

      if (breakdownError) throw breakdownError;

      setGeneratedScript(rawScriptText);
      setStreamingContent('');

      // Trigger refresh to show ScriptSummaryPanel
      setHasExistingScript(true);
      setExistingScriptText(rawScriptText);
      setEntryMode(null);

      // Auto-import characters from generated script breakdown
      try {
        const result = await importCharactersFromScript(projectId, parsedJson);
        if (result.imported.length > 0) {
          const skippedInfo = result.skipped.length > 0 ? ` (${result.skipped.length} ya existían)` : '';
          toast.success(`${result.imported.length} personajes añadidos a tu Bible${skippedInfo}`, {
            description: result.imported.slice(0, 3).join(', ') + (result.imported.length > 3 ? '...' : ''),
            action: {
              label: 'Ver personajes',
              onClick: () => navigate(`/projects/${projectId}/characters`),
            },
          });
          onEntitiesExtracted?.();
        } else if (result.skipped.length > 0) {
          toast.info(`Todos los personajes ya existían`, {
            description: `${result.skipped.length} personajes omitidos por duplicados`,
          });
        }
      } catch (importErr) {
        console.warn('[ScriptWorkspace] Character import failed:', importErr);
      }

      completeTask(taskId, { title: parsedJson.title });
      if (!runInBackground) {
        setStatus('success');
      }
      toast.success('¡Guion generado!');
    } catch (err) {
      console.error('Generation error:', err);
      setStreamingContent('');
      setIsStreaming(false);
      setGeneratedScript(null);
      failTask(taskId, err instanceof Error ? err.message : 'Error desconocido');
      if (!runInBackground) {
        setStatus('error');
      }
      toast.error('Error al generar el guion');
    }
  };

  // Analyze existing script with quality diagnosis - NEW: Background polling with Claude Haiku
  const handleAnalyzeScript = async (overrideText?: string) => {
    const textToAnalyze = (overrideText || scriptText).trim();
    if (!textToAnalyze) {
      toast.error('Pega o sube un guion primero');
      return;
    }

    setStatus('analyzing');
    setProgress(5);

    try {
      // Upsert: update existing or create new (one script per project)
      const { data: existingScript } = await supabase
        .from('scripts')
        .select('id')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      let savedScript;
      if (existingScript) {
        const { data, error } = await supabase
          .from('scripts')
          .update({
            raw_text: textToAnalyze,
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
            raw_text: textToAnalyze,
            status: 'draft',
          })
          .select()
          .single();
        if (error) throw error;
        savedScript = data;
      }

      if (!savedScript) throw new Error('Failed to save script');
      setProgress(10);

      // Calculate estimated time for user feedback
      const scriptLength = textToAnalyze.length;
      const estimatedMinutes = Math.ceil(scriptLength / 5000);
      
      console.log(`[ScriptWorkspace] Starting background analysis for ${scriptLength} chars (~${estimatedMinutes} min estimated)`);
      toast.info(`Análisis iniciado con Claude Sonnet`, { 
        description: `Procesando ${Math.round(scriptLength / 1000)}k caracteres. Tiempo estimado: ~${estimatedMinutes} min. Puedes navegar a otras pantallas.`,
        duration: 8000 
      });

      // Start background task
      const { data: startData, error: startError } = await supabase.functions.invoke('script-breakdown', {
        body: {
          projectId,
          scriptText: textToAnalyze,
          scriptId: savedScript.id,
          language: 'es-ES',
          format: projectFormat === 'film' ? 'film' : 'series',
          episodesCount: projectFormat === 'film' ? 1 : episodesCount,
          episodeDurationMin,
        }
      });

      if (startError) {
        console.error('[ScriptWorkspace] Failed to start analysis:', startError);
        throw startError;
      }

      const taskId = startData?.taskId;
      if (!taskId) {
        throw new Error('No se pudo iniciar el análisis en segundo plano');
      }

      console.log(`[ScriptWorkspace] Background task started: ${taskId}`);
      setProgress(15);

      // Poll for task completion
      const maxPollingTime = Math.max(300000, estimatedMinutes * 60 * 1000 * 2); // At least 5 min, or 2x estimated
      const pollingInterval = 3000; // 3 seconds
      const startTime = Date.now();
      let completed = false;
      let lastProgress = 15;

      while (!completed && (Date.now() - startTime) < maxPollingTime) {
        await new Promise(resolve => setTimeout(resolve, pollingInterval));

        const { data: taskData, error: taskError } = await supabase
          .from('background_tasks')
          .select('status, progress, result, error, description')
          .eq('id', taskId)
          .maybeSingle();

        if (taskError) {
          console.warn('[ScriptWorkspace] Error polling task:', taskError);
          continue;
        }

        if (!taskData) {
          console.warn('[ScriptWorkspace] Task not found:', taskId);
          continue;
        }

        // Update progress UI
        const taskProgress = taskData.progress || 0;
        if (taskProgress > lastProgress) {
          lastProgress = taskProgress;
          setProgress(Math.max(15, Math.min(95, taskProgress)));
        }

        // Update progress message
        if (taskData.description) {
          setProgressMessage(taskData.description);
        }

        if (taskData.status === 'completed') {
          completed = true;
          console.log('[ScriptWorkspace] Background task completed successfully');

          const result = taskData.result as any;
          const payload = getBreakdownPayload(result);

          // Debug log for hydration
          console.log('[hydrate] keys:', {
            hasBreakdown: !!result?.breakdown,
            charactersKeys: payload?.characters ? Object.keys(payload.characters) : null,
            locationsKeys: payload?.locations ? Object.keys(payload.locations) : null,
            scenesKeys: payload?.scenes ? Object.keys(payload.scenes) : null,
          });

          const chars = hydrateCharacters(payload);
          const locs = hydrateLocations(payload);
          const scns = hydrateScenes(payload);
          const props = hydrateProps(payload);

          console.log('[hydrate] counts:', { chars: chars.length, locs: locs.length, scns: scns.length, props: props.length });

          const looksLikeBreakdown =
            payload &&
            typeof payload === 'object' &&
            (chars.length > 0 || scns.length > 0 || locs.length > 0);

          if (looksLikeBreakdown) {
            const breakdown: BreakdownResult = {
              characters: chars,
              locations: locs,
              scenes: scns,
              props,
              synopsis: payload.synopsis,
              subplots: Array.isArray(payload.subplots) ? payload.subplots : [],
              plot_twists: Array.isArray(payload.plot_twists) ? payload.plot_twists : [],
              summary: payload.summary,
            };

            setBreakdownResult(breakdown);
            setQualityDiagnosis(evaluateQuality(breakdown));
            setHasExistingScript(true);
            setExistingScriptText(textToAnalyze);
            setProgress(100);
            setProgressMessage('');
            setStatus('success');
            setEntryMode(null);
            setRefreshTrigger((prev) => prev + 1);
            
            // Auto-import characters from breakdown
            try {
              const result = await importCharactersFromScript(projectId, payload);
              if (result.imported.length > 0) {
                const skippedInfo = result.skipped.length > 0 ? ` (${result.skipped.length} ya existían)` : '';
                toast.success(`${result.imported.length} personajes añadidos a tu Bible${skippedInfo}`, {
                  description: result.imported.slice(0, 3).join(', ') + (result.imported.length > 3 ? '...' : ''),
                  action: {
                    label: 'Ver personajes',
                    onClick: () => navigate(`/projects/${projectId}/characters`),
                  },
                });
                onEntitiesExtracted?.();
              } else if (result.skipped.length > 0) {
                toast.info(`Todos los personajes ya existían`, {
                  description: `${result.skipped.length} personajes omitidos por duplicados`,
                });
              }
            } catch (importErr) {
              console.warn('[ScriptWorkspace] Character import failed:', importErr);
            }
            
            toast.success('¡Análisis completado!');
            return;
          }

          // If the task completed but the result shape is unexpected, recover from DB
          console.warn('[ScriptWorkspace] Task completed but result shape unexpected, attempting DB recovery');
          const { data: recoveredScript } = await supabase
            .from('scripts')
            .select('parsed_json')
            .eq('id', savedScript.id)
            .maybeSingle();

          const pj = (recoveredScript?.parsed_json as any) ?? null;
          const recoveredPayload = getBreakdownPayload(pj);

          const recoveredChars = hydrateCharacters(recoveredPayload);
          const recoveredLocs = hydrateLocations(recoveredPayload);
          const recoveredScns = hydrateScenes(recoveredPayload);
          const recoveredProps = hydrateProps(recoveredPayload);

          console.log('[hydrate-recovery] counts:', { 
            chars: recoveredChars.length, 
            locs: recoveredLocs.length, 
            scns: recoveredScns.length, 
            props: recoveredProps.length 
          });

          const recoveredLooksOk =
            recoveredPayload &&
            typeof recoveredPayload === 'object' &&
            (recoveredChars.length > 0 || recoveredScns.length > 0 || recoveredLocs.length > 0);

          if (recoveredLooksOk) {
            const breakdown: BreakdownResult = {
              characters: recoveredChars,
              locations: recoveredLocs,
              scenes: recoveredScns,
              props: recoveredProps,
              synopsis: recoveredPayload.synopsis,
              subplots: Array.isArray(recoveredPayload.subplots) ? recoveredPayload.subplots : [],
              plot_twists: Array.isArray(recoveredPayload.plot_twists) ? recoveredPayload.plot_twists : [],
              summary: recoveredPayload.summary,
            };

            setBreakdownResult(breakdown);
            setQualityDiagnosis(evaluateQuality(breakdown));
            setHasExistingScript(true);
            setExistingScriptText(textToAnalyze);
            setProgress(100);
            setProgressMessage('');
            setStatus('success');
            setEntryMode(null);
            setRefreshTrigger((prev) => prev + 1);
            
            // Auto-import characters from recovered breakdown
            try {
              const result = await importCharactersFromScript(projectId, recoveredPayload);
              if (result.imported.length > 0) {
                const skippedInfo = result.skipped.length > 0 ? ` (${result.skipped.length} ya existían)` : '';
                toast.success(`${result.imported.length} personajes añadidos a tu Bible${skippedInfo}`, {
                  description: result.imported.slice(0, 3).join(', ') + (result.imported.length > 3 ? '...' : ''),
                  action: {
                    label: 'Ver personajes',
                    onClick: () => navigate(`/projects/${projectId}/characters`),
                  },
                });
                onEntitiesExtracted?.();
              } else if (result.skipped.length > 0) {
                toast.info(`Todos los personajes ya existían`, {
                  description: `${result.skipped.length} personajes omitidos por duplicados`,
                });
              }
            } catch (importErr) {
              console.warn('[ScriptWorkspace] Character import failed:', importErr);
            }
            
            toast.success('¡Análisis completado!');
            return;
          }

          throw new Error('El análisis terminó pero no devolvió datos interpretables.');
        } else if (taskData.status === 'failed') {
          completed = true;
          console.error('[ScriptWorkspace] Background task failed:', taskData.error);
          throw new Error(taskData.error || 'El análisis falló');
        }

        // Show elapsed time to user
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        if (elapsed % 15 === 0 && elapsed > 0) {
          console.log(`[ScriptWorkspace] Polling... ${elapsed}s elapsed, progress: ${taskData.progress}%`);
        }
      }

      if (!completed) {
        // Timeout - try to recover from DB
        console.warn('[ScriptWorkspace] Polling timeout, attempting DB recovery...');
        toast.warning('El análisis está tardando más de lo esperado...', {
          description: 'Verificando resultado en base de datos...',
          duration: 8000,
        });

        // Check if script was updated with parsed_json
        const { data: recoveredScript } = await supabase
          .from('scripts')
          .select('parsed_json, status')
          .eq('id', savedScript.id)
          .maybeSingle();

        const pj = recoveredScript?.parsed_json as any;
        const recoveredPayload = getBreakdownPayload(pj);

        const timeoutChars = hydrateCharacters(recoveredPayload);
        const timeoutLocs = hydrateLocations(recoveredPayload);
        const timeoutScns = hydrateScenes(recoveredPayload);
        const timeoutProps = hydrateProps(recoveredPayload);

        if (
          recoveredPayload &&
          typeof recoveredPayload === 'object' &&
          (timeoutChars.length > 0 || timeoutScns.length > 0 || timeoutLocs.length > 0)
        ) {
          console.log('[ScriptWorkspace] Recovered breakdown from DB (timeout path)');

          const breakdown: BreakdownResult = {
            characters: timeoutChars,
            locations: timeoutLocs,
            scenes: timeoutScns,
            props: timeoutProps,
            synopsis: recoveredPayload.synopsis,
            subplots: Array.isArray(recoveredPayload.subplots) ? recoveredPayload.subplots : [],
            plot_twists: Array.isArray(recoveredPayload.plot_twists) ? recoveredPayload.plot_twists : [],
            summary: recoveredPayload.summary,
          };

          setBreakdownResult(breakdown);
          setQualityDiagnosis(evaluateQuality(breakdown));
          setHasExistingScript(true);
          setExistingScriptText(textToAnalyze);
          setProgress(100);
          setProgressMessage('');
          setStatus('success');
          setEntryMode(null);
          setRefreshTrigger((prev) => prev + 1);
          
          // Auto-import characters from timeout recovery
          try {
            const result = await importCharactersFromScript(projectId, recoveredPayload);
            if (result.imported.length > 0) {
              const skippedInfo = result.skipped.length > 0 ? ` (${result.skipped.length} ya existían)` : '';
              toast.success(`${result.imported.length} personajes añadidos a tu Bible${skippedInfo}`, {
                description: result.imported.slice(0, 3).join(', ') + (result.imported.length > 3 ? '...' : ''),
                action: {
                  label: 'Ver personajes',
                  onClick: () => navigate(`/projects/${projectId}/characters`),
                },
              });
              onEntitiesExtracted?.();
            } else if (result.skipped.length > 0) {
              toast.info(`Todos los personajes ya existían`, {
                description: `${result.skipped.length} personajes omitidos por duplicados`,
              });
            }
          } catch (importErr) {
            console.warn('[ScriptWorkspace] Character import failed:', importErr);
          }
          
          toast.success('¡Análisis recuperado exitosamente!');
          return;
        }

        throw new Error('El análisis no se completó a tiempo. Intenta con un guion más corto.');
      }

    } catch (err) {
      console.error('Analysis error:', err);
      setStatus('error');
      setProgress(0);
      setProgressMessage('');
      toast.error(err instanceof Error ? err.message : 'Error al analizar el guion');
    }
  };

  // Prepare project (extract entities from generated script) - NEW: Background polling
  const handlePrepareProject = async () => {
    const scriptTextNormalized = coerceScriptToString(generatedScript);
    if (!scriptTextNormalized) return;

    setStatus('extracting');
    setProgress(5);

    try {
      // First save the script to the database
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
            raw_text: scriptTextNormalized,
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
            raw_text: scriptTextNormalized,
            status: 'draft',
          })
          .select()
          .single();
        if (error) throw error;
        savedScript = data;
      }

      if (!savedScript) throw new Error('Failed to save script');
      setProgress(10);

      const scriptLength = scriptTextNormalized.length;
      const estimatedMinutes = Math.ceil(scriptLength / 5000);

      toast.info(`Extrayendo entidades con Claude Sonnet`, { 
        description: `Tiempo estimado: ~${estimatedMinutes} min`,
        duration: 6000 
      });

      // Start background task
      const { data: startData, error: startError } = await supabase.functions.invoke('script-breakdown', {
        body: {
          projectId,
          scriptText: scriptTextNormalized,
          scriptId: savedScript.id,
          language: masterLanguage === 'es' ? 'es-ES' : masterLanguage, // Use project language
          format: projectFormat === 'film' ? 'film' : 'series',
          episodesCount: projectFormat === 'film' ? 1 : episodesCount,
          episodeDurationMin,
        }
      });

      if (startError) throw startError;

      const taskId = startData?.taskId;
      if (!taskId) {
        throw new Error('No se pudo iniciar la extracción en segundo plano');
      }

      setProgress(15);

      // Poll for task completion
      const maxPollingTime = Math.max(180000, estimatedMinutes * 60 * 1000 * 2);
      const pollingInterval = 3000;
      const startTime = Date.now();
      let completed = false;

      while (!completed && (Date.now() - startTime) < maxPollingTime) {
        await new Promise(resolve => setTimeout(resolve, pollingInterval));

        const { data: taskData } = await supabase
          .from('background_tasks')
          .select('status, progress, result, error, description')
          .eq('id', taskId)
          .maybeSingle();

        if (!taskData) continue;

        if (taskData.progress) {
          setProgress(Math.max(15, Math.min(95, taskData.progress)));
        }
        if (taskData.description) {
          setProgressMessage(taskData.description);
        }

        if (taskData.status === 'completed') {
          completed = true;
          const result = taskData.result as any;
          if (result?.success && result?.breakdown) {
            const breakdown: BreakdownResult = {
              characters: result.breakdown.characters || [],
              locations: result.breakdown.locations || [],
              scenes: result.breakdown.scenes || [],
              props: result.breakdown.props || [],
              synopsis: result.breakdown.synopsis,
              subplots: result.breakdown.subplots || [],
              plot_twists: result.breakdown.plot_twists || [],
              summary: result.breakdown.summary,
            };

            setBreakdownResult(breakdown);
            const diagnosis = evaluateQuality(breakdown);
            setQualityDiagnosis(diagnosis);
            setHasExistingScript(true);
            setExistingScriptText(scriptTextNormalized);
            setProgress(100);
            setProgressMessage('');
            setStatus('success');
            setEntryMode(null);
            toast.success('¡Proyecto preparado con Claude Haiku!');
            return;
          }
        } else if (taskData.status === 'failed') {
          throw new Error(taskData.error || 'La extracción falló');
        }
      }

      if (!completed) {
        throw new Error('La extracción no se completó a tiempo');
      }

    } catch (err) {
      console.error('Extraction error:', err);
      setStatus('error');
      setProgress(0);
      setProgressMessage('');
      toast.error(err instanceof Error ? err.message : 'Error al preparar el proyecto');
    }
  };

  // Auto-improve script (for incomplete/draft)
  const handleImproveScript = async () => {
    toast.info('Esta función estará disponible próximamente');
  };

  // Convert idea to script (when draft is detected)
  const handleConvertToScript = () => {
    setEntryMode('idea');
    setIdeaText(scriptText);
    setScriptText('');
    setBreakdownResult(null);
    setQualityDiagnosis(null);
    setStatus('idle');
  };

  // Reset and start over
  const handleStartOver = () => {
    setBreakdownResult(null);
    setQualityDiagnosis(null);
    setScriptText('');
    setGeneratedScript(null);
    setStatus('idle');
    setProgress(0);
  };

  // Navigate after successful extraction
  const handleContinueToCharacters = () => {
    navigate(`/projects/${projectId}/characters`);
    onEntitiesExtracted?.();
  };

  // Render quality diagnosis card
  const renderQualityDiagnosis = () => {
    if (!qualityDiagnosis) return null;

    const { quality, score, issues, suggestions } = qualityDiagnosis;
    
    const qualityConfig = {
      solid: {
        icon: CheckCircle,
        color: 'text-green-600',
        bg: 'bg-green-50 dark:bg-green-950/20',
        border: 'border-green-200 dark:border-green-800',
        title: '¡Guion sólido!',
        description: 'Tu guion tiene una estructura completa y está listo para producción.',
      },
      incomplete: {
        icon: AlertTriangle,
        color: 'text-amber-600',
        bg: 'bg-amber-50 dark:bg-amber-950/20',
        border: 'border-amber-200 dark:border-amber-800',
        title: 'Guion incompleto',
        description: 'Faltan algunos elementos, pero tienes una buena base.',
      },
      draft: {
        icon: Info,
        color: 'text-blue-600',
        bg: 'bg-blue-50 dark:bg-blue-950/20',
        border: 'border-blue-200 dark:border-blue-800',
        title: 'Esto parece una idea o borrador',
        description: 'Necesita más desarrollo para convertirse en un guion completo.',
      },
    };

    const config = qualityConfig[quality];
    const Icon = config.icon;

    return (
      <Alert className={`${config.bg} ${config.border} mb-6`}>
        <Icon className={`h-5 w-5 ${config.color}`} />
        <AlertTitle className={`${config.color} font-semibold`}>{config.title}</AlertTitle>
        <AlertDescription className="mt-2 space-y-3">
          <p className="text-sm text-muted-foreground">{config.description}</p>
          
          {issues.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Problemas detectados:</p>
              <ul className="text-xs text-muted-foreground list-disc list-inside">
                {issues.map((issue, i) => <li key={i}>{issue}</li>)}
              </ul>
            </div>
          )}
          
          {suggestions.length > 0 && !isPro && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Sugerencias:</p>
              <ul className="text-xs text-muted-foreground list-disc list-inside">
                {suggestions.slice(0, 2).map((sug, i) => <li key={i}>{sug}</li>)}
              </ul>
            </div>
          )}
          
          {isPro && suggestions.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Sugerencias:</p>
              <ul className="text-xs text-muted-foreground list-disc list-inside">
                {suggestions.map((sug, i) => <li key={i}>{sug}</li>)}
              </ul>
            </div>
          )}

          {/* CTAs based on quality */}
          <div className="flex flex-wrap gap-2 mt-4">
            {quality === 'solid' && (
              <Button onClick={handleContinueToCharacters} size="sm">
                <ArrowRight className="h-4 w-4 mr-2" />
                Continuar a Personajes
              </Button>
            )}
            {quality === 'incomplete' && (
              <>
                <Button onClick={handleImproveScript} size="sm" variant="default">
                  <Wand2 className="h-4 w-4 mr-2" />
                  Mejorar automáticamente
                </Button>
                <Button onClick={handleContinueToCharacters} size="sm" variant="outline">
                  Continuar así
                </Button>
              </>
            )}
            {quality === 'draft' && (
              <>
                <Button onClick={handleConvertToScript} size="sm" variant="default">
                  <Sparkles className="h-4 w-4 mr-2" />
                  Convertir idea en guion
                </Button>
                <Button onClick={handleStartOver} size="sm" variant="outline">
                  <Edit3 className="h-4 w-4 mr-2" />
                  Editar texto
                </Button>
              </>
            )}
          </div>
        </AlertDescription>
      </Alert>
    );
  };

  // Render visual summary
  const renderVisualSummary = () => {
    if (!breakdownResult) return null;

    const { synopsis, characters, locations, scenes, summary, subplots, plot_twists } = breakdownResult;
    
    // Categorize characters by role
    const protagonists = characters?.filter(c => c.role === 'protagonist') || [];
    const antagonists = characters?.filter(c => c.role === 'antagonist') || [];
    const supporting = characters?.filter(c => c.role === 'supporting') || [];
    const recurring = characters?.filter(c => c.role === 'recurring') || [];
    const cameos = characters?.filter(c => c.role === 'cameo') || [];
    const extrasWithLines = characters?.filter(c => c.role === 'extra_with_line') || [];
    const collectiveEntities = characters?.filter(c => c.role === 'collective_entity' || c.entity_type === 'collective' || c.entity_type === 'civilization') || [];
    
    const estimatedRuntime = summary?.estimated_runtime_min || 
      Math.round((scenes?.reduce((acc, s) => acc + (s.estimated_duration_sec || 60), 0) || 0) / 60);

    // Character role config for display
    const roleConfig: Record<string, { label: string; icon: React.ReactNode; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
      protagonist: { label: 'Protagonistas', icon: <Crown className="h-3 w-3" />, variant: 'default' },
      antagonist: { label: 'Antagonistas', icon: <Skull className="h-3 w-3" />, variant: 'destructive' },
      supporting: { label: 'Secundarios', icon: <UserCheck className="h-3 w-3" />, variant: 'secondary' },
      recurring: { label: 'Recurrentes', icon: <UserPlus className="h-3 w-3" />, variant: 'secondary' },
      cameo: { label: 'Cameos', icon: <Star className="h-3 w-3" />, variant: 'outline' },
      extra_with_line: { label: 'Extras con diálogo', icon: <Users className="h-3 w-3" />, variant: 'outline' },
      collective_entity: { label: 'Entidades colectivas', icon: <Users2 className="h-3 w-3" />, variant: 'outline' },
    };

    return (
      <div className="space-y-6">
        {/* Main info cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <Film className="h-4 w-4 text-primary" />
              <span className="text-xs text-muted-foreground">Escenas</span>
            </div>
            <p className="text-2xl font-bold">{scenes?.length || 0}</p>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <Users className="h-4 w-4 text-primary" />
              <span className="text-xs text-muted-foreground">Personajes</span>
            </div>
            <p className="text-2xl font-bold">{characters?.length || 0}</p>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <MapPin className="h-4 w-4 text-primary" />
              <span className="text-xs text-muted-foreground">Localizaciones</span>
            </div>
            <p className="text-2xl font-bold">{locations?.length || 0}</p>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="h-4 w-4 text-primary" />
              <span className="text-xs text-muted-foreground">Duración</span>
            </div>
            <p className="text-2xl font-bold">{estimatedRuntime}<span className="text-sm font-normal">min</span></p>
          </Card>
        </div>

        {/* Synopsis info */}
        {synopsis && (
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <BookOpen className="h-4 w-4 text-primary" />
              <span className="font-medium">Resumen</span>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              {synopsis.faithful_summary || 'Sin resumen disponible'}
            </p>
            <div className="flex flex-wrap gap-2">
              {synopsis.tone && (
                <Badge variant="secondary" className="gap-1">
                  <Palette className="h-3 w-3" />
                  {synopsis.tone}
                </Badge>
              )}
              {synopsis.conflict_type && (
                <Badge variant="outline">
                  Conflicto: {synopsis.conflict_type}
                </Badge>
              )}
              {synopsis.narrative_scope && (
                <Badge variant="outline">
                  Alcance: {synopsis.narrative_scope}
                </Badge>
              )}
              {synopsis.themes?.map((theme, i) => (
                <Badge key={i} variant="outline" className="text-xs">
                  {theme}
                </Badge>
              ))}
            </div>
          </Card>
        )}

        {/* Characters list - All categories */}
        {characters && characters.length > 0 && (
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                <span className="font-medium">Personajes detectados</span>
              </div>
              <Badge variant="secondary">{characters.length}</Badge>
            </div>
            <ScrollArea className="max-h-64">
              <div className="space-y-3">
                {/* Protagonists */}
                {protagonists.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                      <Crown className="h-3 w-3" /> Protagonistas ({protagonists.length})
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {protagonists.map((char, i) => (
                        <Badge key={i} variant="default" className="gap-1">
                          {char.name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Antagonists */}
                {antagonists.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                      <Skull className="h-3 w-3" /> Antagonistas ({antagonists.length})
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {antagonists.map((char, i) => (
                        <Badge key={i} variant="destructive" className="gap-1">
                          {char.name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Supporting */}
                {supporting.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                      <UserCheck className="h-3 w-3" /> Secundarios ({supporting.length})
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {supporting.map((char, i) => (
                        <Badge key={i} variant="secondary">
                          {char.name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Recurring */}
                {recurring.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                      <UserPlus className="h-3 w-3" /> Recurrentes ({recurring.length})
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {recurring.map((char, i) => (
                        <Badge key={i} variant="secondary">
                          {char.name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Collective entities */}
                {collectiveEntities.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                      <Users2 className="h-3 w-3" /> Entidades colectivas ({collectiveEntities.length})
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {collectiveEntities.map((char, i) => (
                        <Badge key={i} variant="outline" className="border-primary/50">
                          {char.name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Cameos */}
                {cameos.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                      <Star className="h-3 w-3" /> Cameos ({cameos.length})
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {cameos.map((char, i) => (
                        <Badge key={i} variant="outline" className="text-xs">
                          {char.name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Extras with lines */}
                {extrasWithLines.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                      <Users className="h-3 w-3" /> Extras con diálogo ({extrasWithLines.length})
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {extrasWithLines.map((char, i) => (
                        <Badge key={i} variant="outline" className="text-xs">
                          {char.name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
          </Card>
        )}

        {/* Subplots */}
        {subplots && subplots.length > 0 && (
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <GitBranch className="h-4 w-4 text-primary" />
                <span className="font-medium">Tramas y subtramas</span>
              </div>
              <Badge variant="secondary">{subplots.length}</Badge>
            </div>
            <div className="space-y-2">
              {subplots.map((subplot, i) => (
                <div key={i} className="p-2 bg-muted/50 rounded-lg">
                  <p className="text-sm font-medium">{subplot.name}</p>
                  {subplot.description && (
                    <p className="text-xs text-muted-foreground mt-1">{subplot.description}</p>
                  )}
                  {isPro && subplot.characters_involved && subplot.characters_involved.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {subplot.characters_involved.map((char, j) => (
                        <Badge key={j} variant="outline" className="text-xs">{char}</Badge>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Plot twists */}
        {plot_twists && plot_twists.length > 0 && (
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-primary" />
                <span className="font-medium">Giros narrativos</span>
              </div>
              <Badge variant="secondary">{plot_twists.length}</Badge>
            </div>
            <div className="space-y-2">
              {plot_twists.map((twist, i) => (
                <div key={i} className="p-2 bg-muted/50 rounded-lg flex items-start gap-2">
                  <Badge 
                    variant={twist.impact === 'paradigm_shift' ? 'destructive' : twist.impact === 'major' ? 'default' : 'secondary'}
                    className="shrink-0 mt-0.5"
                  >
                    {twist.impact === 'paradigm_shift' ? '💥' : twist.impact === 'major' ? '⚡' : '✨'}
                  </Badge>
                  <div>
                    <p className="text-sm font-medium">{twist.name}</p>
                    {twist.description && (
                      <p className="text-xs text-muted-foreground mt-1">{twist.description}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Locations list */}
        {locations && locations.length > 0 && (
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-primary" />
                <span className="font-medium">Localizaciones</span>
              </div>
              <Badge variant="secondary">{locations.length}</Badge>
            </div>
            <div className="flex flex-wrap gap-2">
              {locations.map((loc, i) => (
                <Badge key={i} variant="outline" className="gap-1">
                  <Clapperboard className="h-3 w-3" />
                  {loc.name}
                </Badge>
              ))}
            </div>
          </Card>
        )}

        {/* Pro mode: production notes */}
        {isPro && summary?.production_notes && (
          <Accordion type="single" collapsible>
            <AccordionItem value="notes">
              <AccordionTrigger className="text-sm">
                <div className="flex items-center gap-2">
                  <Settings2 className="h-4 w-4" />
                  Notas de producción
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <p className="text-sm text-muted-foreground">{summary.production_notes}</p>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        )}

        {/* Action bar with export */}
        <GenerationActionBar
          status={breakdownResult ? 'generated' : 'idle'}
          hasOutput={!!breakdownResult}
          isAccepted={hasExistingScript}
          isCanon={false}
          onGenerate={() => {}}
          onAccept={() => {
            setHasExistingScript(true);
            toast.success('Outline aceptado');
          }}
          onRegenerate={() => {
            setBreakdownResult(null);
            setQualityDiagnosis(null);
          }}
          onSetCanon={() => {}}
          showCanonButton={false}
          extraAction={{
            label: 'Exportar',
            icon: <FileDown className="w-4 h-4 mr-2" />,
            onClick: () => {
              try {
                exportOutlinePDF({
                  title: 'Outline del Proyecto',
                  logline: synopsis?.faithful_summary?.split('.')[0],
                  synopsis: synopsis?.faithful_summary,
                  format: projectFormat,
                  estimatedDuration: estimatedRuntime || undefined,
                  episodes: [],
                  characters,
                  locations,
                  props: breakdownResult.props,
                  subplots,
                  plot_twists,
                  counts: {
                    total_scenes: scenes?.length,
                  },
                });
                toast.success('Outline profesional exportado');
              } catch (err) {
                console.error('Export error:', err);
                toast.error('Error al exportar Outline');
              }
            },
          }}
        />
      </div>
    );
  };

  // Loading state (do not show summary until script data is fully loaded)
  if (isLoadingScript) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="text-sm text-muted-foreground">Cargando datos del guion...</p>
        </div>
      </div>
    );
  }

  // If script already exists, show summary with episodes panel.
  // Gate it until parsed data is hydrated to avoid showing an empty/partial summary.
  if (hasExistingScript && !entryMode) {
    // If we're re-analyzing from the summary screen, show a dedicated progress view.
    if (status === 'analyzing') {
      return (
        <div className="flex items-center justify-center p-6">
          <Card className="w-full max-w-xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                Analizando guion…
              </CardTitle>
              <CardDescription>
                No cierres esta página • Puede tardar varios minutos
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-3">
                <Progress value={progress} className="h-2 flex-1" />
                <span className="text-xs font-medium tabular-nums shrink-0 text-primary">
                  {Math.round(progress)}%
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                {progressMessage || 'Procesando…'}
              </p>
              <Button variant="outline" size="sm" className="w-full" onClick={() => setIsOpen(true)}>
                Ver tareas
              </Button>
            </CardContent>
          </Card>
        </div>
      );
    }

    // If we have a script row but no parsed breakdown yet, keep showing a loader (not the summary).
    if (!breakdownResult) {
      return (
        <div className="flex items-center justify-center p-12">
          <div className="text-center space-y-4">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
            <p className="text-sm text-muted-foreground">Preparando resumen…</p>
            <Button variant="outline" size="sm" onClick={() => setIsOpen(true)}>
              Ver tareas
            </Button>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-6 p-6">
        {/* Quick actions header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Guion del Proyecto
            </h2>
            <p className="text-sm text-muted-foreground">
              Gestiona episodios, genera escenas y exporta tu guion
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleAnalyzeScript(existingScriptText)}
              disabled={status === 'generating'}
              title="Recalcular episodios, duración y entidades desde el texto actual"
            >
              <Search className="h-4 w-4 mr-2" />
              Reanalizar
            </Button>
            <Button variant="outline" size="sm" onClick={handleChangeScript}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Cambiar guión
            </Button>
          </div>
        </div>

        {/* Script Summary Panel with episodes, teasers, and actions */}
        <ScriptSummaryPanelAssisted
          projectId={projectId}
          projectFormat={projectFormat}
          onScenesGenerated={() => {
            toast.success('Escenas generadas. Ve al módulo de Escenas para producir.');
          }}
          onEntitiesExtracted={onEntitiesExtracted}
        />

        {/* Raw text preview (collapsed) */}
        <Accordion type="single" collapsible>
          <AccordionItem value="raw-text">
            <AccordionTrigger className="text-sm">Ver texto del guion</AccordionTrigger>
            <AccordionContent>
              <div className="bg-muted/50 rounded-lg p-4 max-h-60 overflow-y-auto">
                <pre className="text-xs whitespace-pre-wrap font-mono">
                  {coerceScriptToString(existingScriptText).slice(0, 2000)}
                  {coerceScriptToString(existingScriptText).length > 2000 && '...'}
                </pre>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    );
  }

  // Entry mode selection
  if (!entryMode) {
    return (
      <div className="space-y-6 p-6">
        {/* Draft recovery banner */}
        {hasDraft && (ideaText || scriptText) && (
          <Alert className="border-primary/50 bg-primary/5">
            <RefreshCw className="h-4 w-4 text-primary" />
            <AlertTitle className="text-primary">Borrador recuperado</AlertTitle>
            <AlertDescription className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                Tienes un borrador guardado. ¿Quieres continuar donde lo dejaste?
              </span>
              <div className="flex gap-2 mt-2 sm:mt-0">
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={clearDraft}
                >
                  Descartar
                </Button>
                <Button 
                  size="sm"
                  onClick={() => setEntryMode(ideaText ? 'idea' : 'existing')}
                >
                  Reanudar
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        )}

        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold mb-2">¿Cómo quieres empezar?</h2>
          <p className="text-muted-foreground">
            Elige una opción para comenzar tu proyecto
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto">
          <Card 
            className="cursor-pointer hover:border-primary transition-colors group"
            onClick={() => setEntryMode('idea')}
          >
            <CardHeader className="text-center pb-2">
              <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                <Lightbulb className="h-8 w-8 text-primary" />
              </div>
              <CardTitle>Tengo una idea</CardTitle>
              <CardDescription>
                Describe tu historia y generaremos el guion completo
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center">
              <Badge variant="secondary" className="gap-1">
                <Wand2 className="h-3 w-3" />
                IA genera el guion
              </Badge>
            </CardContent>
          </Card>

          <Card 
            className="cursor-pointer hover:border-primary transition-colors group"
            onClick={() => setEntryMode('existing')}
          >
            <CardHeader className="text-center pb-2">
              <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                <FileText className="h-8 w-8 text-primary" />
              </div>
              <CardTitle>Ya tengo un guion</CardTitle>
              <CardDescription>
                Sube o pega tu guion y extraeremos los elementos
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center">
              <Badge variant="secondary" className="gap-1">
                <Search className="h-3 w-3" />
                Análisis automático
              </Badge>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Mode: Generate from idea
  if (entryMode === 'idea') {
    return (
      <div className="space-y-6 p-6 max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-4">
          <Button variant="ghost" size="sm" onClick={() => setEntryMode(null)}>
            ← Volver
          </Button>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-primary" />
            Genera tu guion desde una idea
          </h2>
          {ideaText && (
            <Badge variant="outline" className="ml-auto text-xs">
              Guardado automático ✓
            </Badge>
          )}
        </div>

        {/* Show results if we have them */}
        {breakdownResult && qualityDiagnosis && (
          <>
            {renderQualityDiagnosis()}
            {renderVisualSummary()}
          </>
        )}

        {/* Input form */}
        {!breakdownResult && (
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="idea">Describe tu historia</Label>
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
                      className="h-8 gap-1.5"
                      onClick={voiceRecorder.toggleRecording}
                      disabled={status === 'generating' || voiceRecorder.isTranscribing}
                    >
                      {voiceRecorder.isRecording ? (
                        <>
                          <Square className="h-3 w-3" />
                          Detener
                        </>
                      ) : (
                        <>
                          <Mic className="h-3.5 w-3.5" />
                          Dictar idea
                        </>
                      )}
                    </Button>
                  </div>
                </div>
                <Textarea
                  id="idea"
                  placeholder="Ej: Una comedia sobre un robot que quiere ser chef en un restaurante de alta cocina... (o pulsa 'Dictar idea' para usar tu voz)"
                  value={ideaText}
                  onChange={(e) => setIdeaText(e.target.value)}
                  rows={6}
                  className="mt-2"
                  disabled={status === 'generating' || voiceRecorder.isRecording}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Incluye personajes, conflicto, tono y ambientación para mejores resultados
                </p>
                
                {/* V3.0: Toggle para desactivar densidad narrativa - visible en todos los modos */}
                <div className="flex items-center space-x-2 mt-3 pt-3 border-t border-border/50">
                  <Checkbox
                    id="disableDensityMain"
                    checked={disableDensity}
                    onCheckedChange={(checked) => setDisableDensity(checked === true)}
                  />
                  <Label htmlFor="disableDensityMain" className="text-sm font-normal cursor-pointer">
                    Sin densidad narrativa
                  </Label>
                  <span className="text-xs text-muted-foreground">
                    (genera solo lo que aportes)
                  </span>
                </div>
              </div>

              {isPro && (
                <Accordion type="single" collapsible className="w-full">
                  <AccordionItem value="advanced" className="border-none">
                    <AccordionTrigger className="py-2 text-xs text-muted-foreground hover:no-underline">
                      <div className="flex items-center gap-2">
                        <Settings2 className="h-3 w-3" />
                        Opciones avanzadas
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="space-y-3 pt-2">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="disableDensity"
                          checked={disableDensity}
                          onCheckedChange={(checked) => setDisableDensity(checked === true)}
                        />
                        <Label htmlFor="disableDensity" className="text-sm font-normal cursor-pointer">
                          Sin densidad narrativa (solo lo que aportes)
                        </Label>
                      </div>
                      <p className="text-xs text-muted-foreground pl-6">
                        Desactiva los mínimos de personajes, locaciones y subtramas. La IA generará basándose únicamente en tu idea.
                      </p>
                      
                      <div className="pt-2">
                        <Label>Modo de generación</Label>
                        <Select value={qualityTier} onValueChange={(v) => setQualityTier(v as 'rapido' | 'profesional' | 'hollywood')}>
                          <SelectTrigger className="mt-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="rapido">⚡ Rápido (GPT-5-mini)</SelectItem>
                            <SelectItem value="profesional">🎬 Profesional (GPT-5)</SelectItem>
                            <SelectItem value="hollywood">🏆 Hollywood (GPT-5.2)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              )}

              {status === 'generating' && !isStreaming && (
                <ScriptGenerationProgress
                  progress={progress}
                  isActive={true}
                  startTime={generationStartTime || undefined}
                />
              )}

              {generatedScript && (status === 'success' || status === 'extracting') && !breakdownResult && (() => {
                const scriptText = coerceScriptToString(generatedScript);
                return (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-green-600">
                      <CheckCircle className="h-4 w-4" />
                      <span className="text-sm font-medium">¡Guion generado!</span>
                    </div>
                    {scriptText ? (
                      <div className="bg-muted/50 rounded-lg p-4 max-h-60 overflow-y-auto">
                        <pre className="text-xs whitespace-pre-wrap font-mono">
                          {scriptText.slice(0, 1000)}...
                        </pre>
                      </div>
                    ) : (
                      <Alert className="bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800">
                        <AlertTriangle className="h-4 w-4 text-amber-600" />
                        <AlertDescription className="text-amber-800 dark:text-amber-200">
                          No se ha generado guion aún o el formato devuelto no es texto. Reintenta.
                        </AlertDescription>
                      </Alert>
                    )}
                    <Button onClick={handlePrepareProject} className="w-full" disabled={status === 'extracting' || !scriptText}>
                      {status === 'extracting' ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Preparando proyecto...
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-4 w-4 mr-2" />
                          Preparar proyecto
                        </>
                      )}
                    </Button>
                  </div>
                );
              })()}

              {status === 'error' && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Error en la generación</AlertTitle>
                  <AlertDescription>
                    Hubo un problema al generar el guion. Tu idea se ha guardado automáticamente.
                    Puedes reintentar o modificar el texto.
                  </AlertDescription>
                </Alert>
              )}

              {/* STREAMING PREVIEW - Show script as it's being written */}
              {isStreaming && (
                <div className="space-y-4">
                  {/* Progress indicator with phases */}
                  <ScriptGenerationProgress
                    progress={progress}
                    isActive={true}
                    startTime={generationStartTime || undefined}
                  />
                  
                  {/* Live script content */}
                  {streamingContent && (
                    <>
                      <div className="flex items-center gap-2 text-sm text-primary">
                        <Edit3 className="h-4 w-4 animate-pulse" />
                        <span className="font-medium">Escribiendo guion en tiempo real...</span>
                        <span className="text-muted-foreground">({streamingContent.length} caracteres)</span>
                      </div>
                      <ScrollArea className="h-[300px] rounded-lg border bg-muted/30 p-4">
                        <pre className="whitespace-pre-wrap font-mono text-sm leading-relaxed">
                          {streamingContent}
                          <span className="inline-block w-2 h-4 bg-primary animate-pulse ml-0.5" />
                        </pre>
                      </ScrollArea>
                    </>
                  )}
                  
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      streamAbortRef.current?.abort();
                      setIsStreaming(false);
                      setStatus('idle');
                      setGenerationStartTime(null);
                      toast.info('Generación cancelada');
                    }}
                  >
                    <Square className="h-3 w-3 mr-2" />
                    Cancelar
                  </Button>
                </div>
              )}

              {(!generatedScript || status === 'error') && (
                <div className="flex gap-2">
                  <Button
                    onClick={() => handleGenerateScript(false)}
                    className="flex-1"
                    disabled={!ideaText.trim() || status === 'generating'}
                  >
                    {status === 'generating' ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Generando...
                      </>
                    ) : status === 'error' ? (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Reintentar
                      </>
                    ) : (
                      <>
                        <Wand2 className="h-4 w-4 mr-2" />
                        Generar guion
                      </>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => handleGenerateScript(true)}
                    disabled={!ideaText.trim() || status === 'generating'}
                    title="Ejecutar en segundo plano"
                  >
                    <Bell className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  // Mode: Analyze existing script
  if (entryMode === 'existing') {
    return (
      <div className="space-y-6 p-6 max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-4">
          <Button variant="ghost" size="sm" onClick={() => { setEntryMode(null); handleStartOver(); }}>
            ← Volver
          </Button>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Analiza tu guion
          </h2>
        </div>

        {/* Show results if we have them */}
        {breakdownResult && qualityDiagnosis && (
          <>
            {renderQualityDiagnosis()}
            {renderVisualSummary()}
            
            {/* Action to restart */}
            <div className="flex justify-center">
              <Button variant="ghost" size="sm" onClick={handleStartOver}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Analizar otro guion
              </Button>
            </div>
          </>
        )}

        {/* Input form - only show if no results yet */}
        {!breakdownResult && (
          <Card>
            <CardContent className="pt-6 space-y-4">
              <Tabs value={inputMethod} onValueChange={(v) => setInputMethod(v as InputMethod)}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="paste">Pegar texto</TabsTrigger>
                  <TabsTrigger value="upload">Subir archivo</TabsTrigger>
                </TabsList>

                <TabsContent value="paste" className="mt-4">
                  {status === 'analyzing' ? (
                    // Show animated processing state for paste mode
                    <div className="border-2 border-primary rounded-lg p-8 text-center bg-primary/5">
                      <div className="relative mx-auto w-16 h-16 mb-4">
                        <FileText className="h-10 w-10 mx-auto text-primary absolute inset-0 m-auto" />
                        <div className="absolute inset-0 border-2 border-primary/30 rounded-full animate-ping" />
                        <div className="absolute inset-0 border-2 border-t-primary border-r-transparent border-b-transparent border-l-transparent rounded-full animate-spin" />
                      </div>
                      <p className="text-sm text-muted-foreground mb-2">Analizando guion...</p>
                      <p className="text-xs text-muted-foreground">
                        No cierres esta página • Puede tardar varios minutos
                      </p>
                    </div>
                  ) : (
                    <Textarea
                      placeholder="Pega aquí tu guion..."
                      value={scriptText}
                      onChange={(e) => setScriptText(e.target.value)}
                      rows={12}
                    />
                  )}
                </TabsContent>

                <TabsContent value="upload" className="mt-4">
                  {status === 'analyzing' && uploadedFileName ? (
                    // Show animated processing state
                    <div className="border-2 border-primary rounded-lg p-8 text-center bg-primary/5">
                      <div className="relative mx-auto w-16 h-16 mb-4">
                        <FileText className="h-10 w-10 mx-auto text-primary absolute inset-0 m-auto" />
                        <div className="absolute inset-0 border-2 border-primary/30 rounded-full animate-ping" />
                        <div className="absolute inset-0 border-2 border-t-primary border-r-transparent border-b-transparent border-l-transparent rounded-full animate-spin" />
                      </div>
                      <p className="font-medium text-primary mb-2">{uploadedFileName}</p>
                      <div className="space-y-3 max-w-sm mx-auto">
                        <div className="relative">
                          <Progress value={progress} className="h-2" />
                          <div 
                            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent rounded-full animate-shimmer"
                            style={{ backgroundSize: '200% 100%' }}
                          />
                        </div>
                        <p className="text-sm text-muted-foreground animate-pulse">{progressMessage}</p>
                        <p className="text-xs text-muted-foreground/60">
                          Si parece bloqueado, es normal: el PDF se está extrayendo.
                        </p>
                        <Button type="button" variant="outline" size="sm" onClick={cancelPdfProcessing}>
                          <Square className="h-4 w-4 mr-2" />
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Normal upload state */}
                      <div 
                        className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary transition-colors"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-4" />
                        <p className="font-medium">
                          {uploadedFileName || 'Arrastra un archivo o haz clic para seleccionar'}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Formatos permitidos: .txt, .pdf
                        </p>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept=".txt,.pdf,text/plain,application/pdf"
                          onChange={handleFileUpload}
                          className="hidden"
                        />
                      </div>

                      {pdfUploadError && (
                        <Alert variant="destructive" className="mt-4">
                          <AlertTriangle className="h-4 w-4" />
                          <AlertTitle>No se pudo procesar el PDF</AlertTitle>
                          <AlertDescription>
                            <p>{pdfUploadError}</p>
                            <div className="mt-3 flex flex-wrap gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setPdfUploadError(null);
                                  setUploadedFileName(null);
                                  if (fileInputRef.current) fileInputRef.current.value = '';
                                  fileInputRef.current?.click();
                                }}
                              >
                                Reintentar
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setInputMethod('paste');
                                }}
                              >
                                Pegar texto
                              </Button>
                            </div>
                          </AlertDescription>
                        </Alert>
                      )}
                    </>
                  )}
                </TabsContent>
              </Tabs>

              {isPro && (
                <Accordion type="single" collapsible className="w-full">
                  <AccordionItem value="advanced" className="border-none">
                    <AccordionTrigger className="py-2 text-xs text-muted-foreground hover:no-underline">
                      <div className="flex items-center gap-2">
                        <Settings2 className="h-3 w-3" />
                        Opciones de extracción
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="space-y-3 pt-2">
                      <div className="flex items-center gap-2">
                        <Checkbox 
                          id="chars" 
                          checked={extractCharacters} 
                          onCheckedChange={(c) => setExtractCharacters(!!c)} 
                        />
                        <Label htmlFor="chars" className="flex items-center gap-1 text-sm">
                          <Users className="h-3 w-3" />
                          Extraer personajes
                        </Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <Checkbox 
                          id="locs" 
                          checked={extractLocations} 
                          onCheckedChange={(c) => setExtractLocations(!!c)} 
                        />
                        <Label htmlFor="locs" className="flex items-center gap-1 text-sm">
                          <MapPin className="h-3 w-3" />
                          Extraer localizaciones
                        </Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <Checkbox 
                          id="scenes" 
                          checked={extractScenes} 
                          onCheckedChange={(c) => setExtractScenes(!!c)} 
                        />
                        <Label htmlFor="scenes" className="flex items-center gap-1 text-sm">
                          <Film className="h-3 w-3" />
                          Extraer escenas
                        </Label>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              )}

              {status === 'analyzing' && (
                <div className="space-y-3 py-2">
                  <div className="flex items-center gap-3">
                    <div className="relative w-full">
                      <Progress value={progress} className="h-2" />
                      {/* Pulsing glow effect */}
                      <div 
                        className="absolute inset-0 bg-gradient-to-r from-primary/20 via-primary/40 to-primary/20 rounded-full animate-pulse"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <span className="text-xs font-medium tabular-nums shrink-0 text-primary">
                      {Math.round(progress)}%
                    </span>
                  </div>
                  <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    <span className="animate-pulse">{progressMessage || 'Analizando guion...'}</span>
                  </div>
                  <p className="text-xs text-center text-muted-foreground/70">
                    Esto puede tomar hasta 2 minutos para PDFs grandes
                  </p>
                </div>
              )}

              <Button 
                id="analyze-script-btn"
                onClick={() => handleAnalyzeScript()} 
                className="w-full" 
                disabled={!scriptText.trim() || status === 'analyzing'}
              >
                {status === 'analyzing' ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Analizando...
                  </>
                ) : (
                  <>
                    <Search className="h-4 w-4 mr-2" />
                    Analizar guion
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  return null;
}
