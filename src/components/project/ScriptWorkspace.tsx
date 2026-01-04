/**
 * ScriptWorkspace v2 - Two clear modes: Generate from idea / Analyze existing script
 * With quality diagnosis, visual summary, and adapted UX by level (Normal/Pro)
 */

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
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
import { ScriptSummaryPanelAssisted } from './ScriptSummaryPanelAssisted';
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
} from 'lucide-react';

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
  entity_type?: string;
  description?: string;
  priority?: string;
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

interface BreakdownResult {
  synopsis?: ScriptSynopsis;
  characters: CharacterData[];
  locations: LocationData[];
  scenes: SceneData[];
  props?: any[];
  set_pieces?: any[];
  summary?: {
    total_scenes?: number;
    total_characters?: number;
    total_locations?: number;
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
  
  // User level from EKB
  const { userLevel } = useEditorialKnowledgeBase({
    projectId,
    assetType: 'character',
  });
  const isPro = userLevel === 'pro';

  // Entry mode state
  const [entryMode, setEntryMode] = useState<EntryMode | null>(null);
  const [hasExistingScript, setHasExistingScript] = useState(false);
  const [existingScriptText, setExistingScriptText] = useState('');

  // Form state
  const [ideaText, setIdeaText] = useState('');
  const [scriptText, setScriptText] = useState('');
  const [inputMethod, setInputMethod] = useState<InputMethod>('paste');
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);

  // Generation state
  const [status, setStatus] = useState<WorkflowStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [generatedScript, setGeneratedScript] = useState<unknown>(null);
  const [breakdownResult, setBreakdownResult] = useState<BreakdownResult | null>(null);
  const [qualityDiagnosis, setQualityDiagnosis] = useState<QualityDiagnosis | null>(null);

  // Pro mode controls
  const [selectedModel, setSelectedModel] = useState<'rapido' | 'profesional'>('rapido');
  const [extractCharacters, setExtractCharacters] = useState(true);
  const [extractLocations, setExtractLocations] = useState(true);
  const [extractScenes, setExtractScenes] = useState(true);

  // File input ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Check for existing script on mount
  useEffect(() => {
    const checkExistingScript = async () => {
      const { data } = await supabase
        .from('scripts')
        .select('id, raw_text')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data?.raw_text) {
        setHasExistingScript(true);
        // Ensure raw_text is always a string
        const rawText = typeof data.raw_text === 'string' ? data.raw_text : JSON.stringify(data.raw_text);
        setExistingScriptText(rawText);
      }
    };
    checkExistingScript();
  }, [projectId]);

  // Evaluate script quality from breakdown result
  const evaluateQuality = (breakdown: BreakdownResult): QualityDiagnosis => {
    const issues: string[] = [];
    const suggestions: string[] = [];
    let score = 100;

    const characterCount = breakdown.characters?.length || 0;
    const sceneCount = breakdown.scenes?.length || 0;
    const locationCount = breakdown.locations?.length || 0;
    const hasProtagonist = breakdown.characters?.some(c => c.role === 'protagonist');
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
    const hasDialogue = breakdown.scenes?.some(s => 
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

  // Handle file upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['text/plain', 'application/pdf'];
    if (!allowedTypes.includes(file.type) && !file.name.endsWith('.txt') && !file.name.endsWith('.pdf')) {
      toast.error('Solo se permiten archivos .txt o .pdf');
      return;
    }

    setUploadedFileName(file.name);
    
    if (file.type === 'text/plain' || file.name.endsWith('.txt')) {
      const text = await file.text();
      setScriptText(text);
      toast.success('Archivo cargado correctamente');
    } else if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
      toast.info('Procesando PDF...');
      
      const fileName = `${projectId}/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from('scripts')
        .upload(fileName, file);

      if (uploadError) {
        toast.error('Error al subir archivo');
        console.error(uploadError);
        return;
      }

      const { data: urlData } = supabase.storage.from('scripts').getPublicUrl(fileName);
      
      try {
        const { data, error } = await supabase.functions.invoke('parse-script', {
          body: { pdfUrl: urlData.publicUrl, projectId }
        });

        if (error) throw error;
        
        if (data?.needsManualInput) {
          toast.warning(data.error || 'El PDF requiere entrada manual. Por favor, copia y pega el texto.');
          return;
        }
        
        if (data?.rawText) {
          setScriptText(data.rawText);
          toast.success('PDF procesado correctamente');
        } else if (data?.error) {
          toast.error(data.error);
        }
      } catch (err) {
        console.error('PDF parse error:', err);
        toast.error('Error al procesar el PDF. Intenta copiar y pegar el texto directamente.');
      }
    }
  };

  // Generate script from idea
  const handleGenerateScript = async () => {
    if (!ideaText.trim()) {
      toast.error('Escribe tu idea primero');
      return;
    }

    setStatus('generating');
    setProgress(10);

    try {
      const { data: outlineData, error: outlineError } = await supabase.functions.invoke('generate-outline-light', {
        body: {
          projectId,
          idea: ideaText,
          model: selectedModel,
          format: 'short',
        }
      });

      if (outlineError) throw outlineError;
      setProgress(50);

      const { data: scriptData, error: scriptError } = await supabase.functions.invoke('script-generate', {
        body: {
          projectId,
          outline: outlineData?.outline,
          idea: ideaText,
          model: selectedModel,
        }
      });

      if (scriptError) throw scriptError;
      setProgress(100);

      const rawScript = scriptData?.screenplay || scriptData?.script || '';
      setGeneratedScript(rawScript);
      
      // Ensure parsed_json has required structure for ScriptSummaryPanel
      const parsedJson = {
        ...scriptData,
        title: scriptData?.title || 'Guion Generado',
        synopsis: scriptData?.synopsis || scriptData?.logline || '',
        episodes: scriptData?.episodes || [],
        teasers: scriptData?.teasers,
        characters: scriptData?.characters || scriptData?.main_characters || [],
        locations: scriptData?.locations || scriptData?.main_locations || [],
      };
      
      await supabase.from('scripts').insert({
        project_id: projectId,
        raw_text: rawScript,
        parsed_json: parsedJson,
        status: 'draft',
      });

      // Trigger refresh to show ScriptSummaryPanel
      setHasExistingScript(true);
      setExistingScriptText(rawScript);
      setEntryMode(null);

      setStatus('success');
      toast.success('¡Guion generado!');
    } catch (err) {
      console.error('Generation error:', err);
      setStatus('error');
      toast.error('Error al generar el guion');
    }
  };

  // Analyze existing script with quality diagnosis
  const handleAnalyzeScript = async () => {
    const textToAnalyze = scriptText.trim();
    if (!textToAnalyze) {
      toast.error('Pega o sube un guion primero');
      return;
    }

    setStatus('analyzing');
    setProgress(20);

    try {
      // Save script first
      const { data: savedScript, error: saveError } = await supabase
        .from('scripts')
        .insert({
          project_id: projectId,
          raw_text: textToAnalyze,
          status: 'draft',
        })
        .select()
        .single();

      if (saveError) throw saveError;
      setProgress(40);

      // Call script-breakdown to analyze
      const { data: breakdownData, error: breakdownError } = await supabase.functions.invoke('script-breakdown', {
        body: {
          projectId,
          scriptText: textToAnalyze,
          scriptId: savedScript.id,
          language: 'es-ES',
        }
      });

      if (breakdownError) throw breakdownError;
      setProgress(80);

      const breakdown: BreakdownResult = breakdownData?.breakdown || {
        characters: breakdownData?.characters || [],
        locations: breakdownData?.locations || [],
        scenes: breakdownData?.scenes || [],
        synopsis: breakdownData?.synopsis,
        summary: breakdownData?.summary,
      };

      // Update script with parsed_json for ScriptSummaryPanel
      const parsedJson = {
        title: breakdown.synopsis?.faithful_summary?.slice(0, 50) || 'Guion Analizado',
        synopsis: breakdown.synopsis?.faithful_summary || '',
        episodes: breakdownData?.episodes || [{
          episode_number: 1,
          title: 'Episodio 1',
          synopsis: breakdown.synopsis?.faithful_summary || '',
          scenes: breakdown.scenes,
          duration_min: breakdown.summary?.estimated_runtime_min || 10,
        }],
        characters: breakdown.characters,
        locations: breakdown.locations,
        scenes: breakdown.scenes,
        teasers: breakdownData?.teasers,
        counts: {
          total_scenes: breakdown.scenes?.length || 0,
          total_dialogue_lines: 0,
        },
      };

      await supabase.from('scripts')
        .update({ parsed_json: JSON.parse(JSON.stringify(parsedJson)) })
        .eq('id', savedScript.id);

      setBreakdownResult(breakdown);
      
      // Evaluate quality
      const diagnosis = evaluateQuality(breakdown);
      setQualityDiagnosis(diagnosis);

      // Mark as having script for the summary panel
      setHasExistingScript(true);
      setExistingScriptText(textToAnalyze);

      setProgress(100);
      setStatus('success');
      toast.success('¡Análisis completado!');
    } catch (err) {
      console.error('Analysis error:', err);
      setStatus('error');
      toast.error('Error al analizar el guion');
    }
  };

  // Prepare project (extract entities from generated script)
  const handlePrepareProject = async () => {
    const scriptTextNormalized = coerceScriptToString(generatedScript);
    if (!scriptTextNormalized) return;

    setStatus('extracting');
    setProgress(20);

    try {
      const { data: breakdownData, error: breakdownError } = await supabase.functions.invoke('script-breakdown', {
        body: {
          projectId,
          scriptText: scriptTextNormalized,
          language: 'es-ES',
        }
      });

      if (breakdownError) throw breakdownError;
      setProgress(80);

      const breakdown: BreakdownResult = breakdownData?.breakdown || {
        characters: breakdownData?.characters || [],
        locations: breakdownData?.locations || [],
        scenes: breakdownData?.scenes || [],
        synopsis: breakdownData?.synopsis,
        summary: breakdownData?.summary,
      };

      setBreakdownResult(breakdown);
      const diagnosis = evaluateQuality(breakdown);
      setQualityDiagnosis(diagnosis);

      setProgress(100);
      setStatus('success');
      toast.success('¡Proyecto preparado!');
    } catch (err) {
      console.error('Extraction error:', err);
      setStatus('error');
      toast.error('Error al preparar el proyecto');
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

    const { synopsis, characters, locations, scenes, summary } = breakdownResult;
    const protagonists = characters?.filter(c => c.role === 'protagonist') || [];
    const supporting = characters?.filter(c => c.role === 'supporting') || [];
    const estimatedRuntime = summary?.estimated_runtime_min || 
      Math.round((scenes?.reduce((acc, s) => acc + (s.estimated_duration_sec || 60), 0) || 0) / 60);

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
              {synopsis.themes?.slice(0, 3).map((theme, i) => (
                <Badge key={i} variant="outline" className="text-xs">
                  {theme}
                </Badge>
              ))}
            </div>
          </Card>
        )}

        {/* Characters list */}
        {characters && characters.length > 0 && (
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                <span className="font-medium">Personajes detectados</span>
              </div>
              <Badge variant="secondary">{characters.length}</Badge>
            </div>
            <ScrollArea className="max-h-48">
              <div className="space-y-2">
                {protagonists.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Protagonistas</p>
                    <div className="flex flex-wrap gap-2">
                      {protagonists.map((char, i) => (
                        <Badge key={i} variant="default" className="gap-1">
                          {char.name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                {supporting.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Secundarios</p>
                    <div className="flex flex-wrap gap-2">
                      {supporting.map((char, i) => (
                        <Badge key={i} variant="secondary">
                          {char.name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                {characters.filter(c => !['protagonist', 'supporting'].includes(c.role || '')).length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Otros</p>
                    <div className="flex flex-wrap gap-2">
                      {characters
                        .filter(c => !['protagonist', 'supporting'].includes(c.role || ''))
                        .slice(0, 10)
                        .map((char, i) => (
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
              {locations.slice(0, 12).map((loc, i) => (
                <Badge key={i} variant="outline" className="gap-1">
                  <Clapperboard className="h-3 w-3" />
                  {loc.name}
                </Badge>
              ))}
              {locations.length > 12 && (
                <Badge variant="secondary">+{locations.length - 12} más</Badge>
              )}
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
      </div>
    );
  };

  // If script already exists, show summary with episodes panel
  if (hasExistingScript && !entryMode) {
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
          <Button variant="outline" onClick={() => setHasExistingScript(false)}>
            Empezar nuevo guion
          </Button>
        </div>

        {/* Script Summary Panel with episodes, teasers, and actions */}
        <ScriptSummaryPanelAssisted 
          projectId={projectId} 
          onScenesGenerated={() => {
            toast.success('Escenas generadas. Ve al módulo de Escenas para producir.');
          }}
          onEntitiesExtracted={onEntitiesExtracted}
        />

        {/* Raw text preview (collapsed) */}
        <Accordion type="single" collapsible>
          <AccordionItem value="raw-text">
            <AccordionTrigger className="text-sm">
              Ver texto del guion
            </AccordionTrigger>
            <AccordionContent>
              <div className="bg-muted/50 rounded-lg p-4 max-h-60 overflow-y-auto">
                <pre className="text-xs whitespace-pre-wrap font-mono">
                  {(existingScriptText || '').slice(0, 2000)}
                  {(existingScriptText || '').length > 2000 && '...'}
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
                <Label htmlFor="idea">Describe tu historia</Label>
                <Textarea
                  id="idea"
                  placeholder="Ej: Una comedia sobre un robot que quiere ser chef en un restaurante de alta cocina..."
                  value={ideaText}
                  onChange={(e) => setIdeaText(e.target.value)}
                  rows={6}
                  className="mt-2"
                  disabled={status === 'generating'}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Incluye personajes, conflicto, tono y ambientación para mejores resultados
                </p>
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
                      <div>
                        <Label>Modelo de generación</Label>
                        <Select value={selectedModel} onValueChange={(v) => setSelectedModel(v as any)}>
                          <SelectTrigger className="mt-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="rapido">Rápido (GPT-4o-mini)</SelectItem>
                            <SelectItem value="profesional">Profesional (GPT-4o)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              )}

              {status === 'generating' && (
                <div className="space-y-2">
                  <Progress value={progress} />
                  <p className="text-xs text-muted-foreground text-center">
                    Generando guion...
                  </p>
                </div>
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

              {!generatedScript && (
                <Button 
                  onClick={handleGenerateScript} 
                  className="w-full" 
                  disabled={!ideaText.trim() || status === 'generating'}
                >
                  {status === 'generating' ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Generando...
                    </>
                  ) : (
                    <>
                      <Wand2 className="h-4 w-4 mr-2" />
                      Generar guion
                    </>
                  )}
                </Button>
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
                  <Textarea
                    placeholder="Pega aquí tu guion..."
                    value={scriptText}
                    onChange={(e) => setScriptText(e.target.value)}
                    rows={12}
                    disabled={status === 'analyzing'}
                  />
                </TabsContent>

                <TabsContent value="upload" className="mt-4">
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
                  {scriptText && (
                    <div className="mt-4 bg-muted/50 rounded-lg p-4 max-h-40 overflow-y-auto">
                      <pre className="text-xs whitespace-pre-wrap font-mono">
                        {scriptText.slice(0, 500)}...
                      </pre>
                    </div>
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
                <div className="space-y-2">
                  <Progress value={progress} />
                  <p className="text-xs text-muted-foreground text-center">
                    Analizando guion...
                  </p>
                </div>
              )}

              <Button 
                onClick={handleAnalyzeScript} 
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
