import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
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
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import ReferenceScriptLibrary from './ReferenceScriptLibrary';
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
  Scissors
} from 'lucide-react';
import jsPDF from 'jspdf';
import { ScrollArea } from '@/components/ui/scroll-area';
import { calculateAutoTargets, CalculatedTargets, TargetInputs } from '@/lib/autoTargets';
import { exportScreenplayPDF, exportEpisodeScreenplayPDF } from '@/lib/exportScreenplayPDF';

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
  const [activeTab, setActiveTab] = useState('generate');
  const [scriptText, setScriptText] = useState('');
  const [scriptLocked, setScriptLocked] = useState(false);
  const [currentScriptId, setCurrentScriptId] = useState<string | null>(null);

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

  // Auto/Pro mode
  const [proMode, setProMode] = useState(false);
  const [targets, setTargets] = useState<CalculatedTargets | null>(null);

  // Pipeline state
  const [pipelineRunning, setPipelineRunning] = useState(false);
  const [pipelineProgress, setPipelineProgress] = useState(0);
  const [currentEpisodeGenerating, setCurrentEpisodeGenerating] = useState<number | null>(null);
  const [pipelineSteps, setPipelineSteps] = useState<PipelineStep[]>([
    { id: 'targets', label: 'Calculando targets', status: 'pending' },
    { id: 'outline', label: 'Generando outline', status: 'pending' },
    { id: 'qc', label: 'QC del outline', status: 'pending' },
    { id: 'episodes', label: 'Generando episodios', status: 'pending' },
    { id: 'save', label: 'Guardando', status: 'pending' },
  ]);
  const [currentStepLabel, setCurrentStepLabel] = useState<string>('');
  
  // Episode view mode: summary vs full screenplay
  const [episodeViewMode, setEpisodeViewMode] = useState<Record<number, 'summary' | 'full'>>({});

  // Generated data
  const [outline, setOutline] = useState<any>(null);
  const [qcResult, setQcResult] = useState<any>(null);
  const [generatedScript, setGeneratedScript] = useState<any>(null);
  const [expandedEpisodes, setExpandedEpisodes] = useState<Record<number, boolean>>({});

  // Script Doctor state
  const [analyzing, setAnalyzing] = useState(false);
  const [doctorSuggestions, setDoctorSuggestions] = useState<any[]>([]);
  const [doctorScore, setDoctorScore] = useState<number | null>(null);
  const [applyingDoctor, setApplyingDoctor] = useState(false);

  // Entity import state
  const [selectedCharacters, setSelectedCharacters] = useState<Set<number>>(new Set());
  const [selectedLocations, setSelectedLocations] = useState<Set<number>>(new Set());
  const [selectedProps, setSelectedProps] = useState<Set<number>>(new Set());
  const [importing, setImporting] = useState(false);
  
  // Scene segmentation state
  const [segmenting, setSegmenting] = useState(false);
  const [segmentedEpisodes, setSegmentedEpisodes] = useState<Set<number>>(new Set());

  // Load existing script
  useEffect(() => {
    const fetchData = async () => {
      const [projectRes, scriptsRes] = await Promise.all([
        supabase.from('projects').select('episodes_count, format').eq('id', projectId).single(),
        supabase.from('scripts').select('id, status, raw_text, parsed_json').eq('project_id', projectId).order('created_at', { ascending: false }).limit(1)
      ]);
      
      if (projectRes.data) {
        setEpisodesCount(projectRes.data.episodes_count || 6);
        setFormat(projectRes.data.format === 'film' ? 'film' : 'series');
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

  const updatePipelineStep = (stepId: string, status: PipelineStep['status'], label?: string) => {
    setPipelineSteps(prev => prev.map(s => s.id === stepId ? { ...s, status, label: label || s.label } : s));
    if (label) setCurrentStepLabel(label);
  };

  // Main pipeline: Generate Script "Listo para Rodar" - NEW: Episode by Episode
  const runFullPipeline = async () => {
    if (!ideaText.trim()) {
      toast.error('Escribe una idea para generar el guion');
      return;
    }

    if (!targets) {
      toast.error('Los targets no están calculados');
      return;
    }

    setPipelineRunning(true);
    setPipelineProgress(0);
    setPipelineSteps(prev => prev.map(s => ({ ...s, status: 'pending' })));

    try {
      // Step 1: Targets (already calculated) + Load References
      updatePipelineStep('targets', 'running');
      setPipelineProgress(5);
      
      // Fetch reference scripts from library
      const { data: refScriptsData } = await supabase
        .from('reference_scripts')
        .select('title, content, genre, notes')
        .or(`project_id.eq.${projectId},is_global.eq.true`)
        .order('created_at', { ascending: false })
        .limit(2);
      
      const referenceScripts = refScriptsData || [];
      
      updatePipelineStep('targets', 'success');
      setPipelineProgress(10);

      // Step 2: Generate DETAILED Outline
      updatePipelineStep('outline', 'running', 'Segmentando episodios (outline)...');
      toast.info('Generando outline (segmentación por episodios)...');

      const normalizedIdea = ideaText.trim();
      const ideaForGeneration = normalizedIdea.length > 1800 ? normalizedIdea.slice(0, 1800) : normalizedIdea;
      if (normalizedIdea.length > 1800) {
        toast.info('Idea muy larga: usando un extracto para evitar que se quede colgado.');
      }

      const referencesForGeneration = references?.length > 600 ? references.slice(0, 600) : references;

      const { data: outlineData, error: outlineError } = await supabase.functions.invoke('script-generate-outline', {
        body: {
          projectId,
          idea: ideaForGeneration,
          format,
          episodesCount: format === 'series' ? episodesCount : undefined,
          episodeDurationMin: format === 'series' ? episodeDurationMin : undefined,
          filmDurationMin: format === 'film' ? filmDurationMin : undefined,
          genre,
          tone,
          language,
          references: referencesForGeneration,
          referenceScripts: referenceScripts.length > 0 ? referenceScripts : undefined,
          targets
        }
      });

      if (outlineError) throw outlineError;
      if (!outlineData?.outline) throw new Error('No se generó el outline');
      
      let currentOutline = outlineData.outline;
      setOutline(currentOutline);
      updatePipelineStep('outline', 'success');
      setPipelineProgress(25);

      // Step 3: QC Outline
      updatePipelineStep('qc', 'running');
      let qcPassed = false;
      let retryCount = 0;
      const maxRetries = 2;

      while (!qcPassed && retryCount <= maxRetries) {
        const { data: qcData, error: qcError } = await supabase.functions.invoke('script-qc-outline', {
          body: { outline: currentOutline, targets }
        });

        if (qcError) throw qcError;
        setQcResult(qcData);

        if (qcData?.passes) {
          qcPassed = true;
        } else if (retryCount < maxRetries && qcData?.rewrite_instructions) {
          toast.info(`QC no aprobado, reintentando (${retryCount + 1}/${maxRetries})...`);
          const { data: rewriteData, error: rewriteError } = await supabase.functions.invoke('script-rewrite-outline', {
            body: { outline: currentOutline, rewriteInstructions: qcData.rewrite_instructions, targets }
          });
          if (rewriteError) throw rewriteError;
          if (rewriteData?.outline) {
            currentOutline = rewriteData.outline;
            setOutline(currentOutline);
          }
          retryCount++;
        } else {
          updatePipelineStep('qc', 'error');
          toast.error('El outline no cumple los targets después de varios intentos');
          setPipelineRunning(false);
          return;
        }
      }

      updatePipelineStep('qc', 'success');
      setPipelineProgress(35);

      // Step 4: Generate EACH EPISODE separately with full dialogue
      updatePipelineStep('episodes', 'running', 'Preparando episodios...');
      
      const episodeOutlines = currentOutline.episode_outlines || [{ 
        episode_number: 1, 
        title: currentOutline.title,
        synopsis: currentOutline.synopsis,
        scenes_count: currentOutline.counts?.total_scenes || 15
      }];
      
      const totalEpisodes = episodeOutlines.length;
      const generatedEpisodes: any[] = [];
      
      for (let i = 0; i < totalEpisodes; i++) {
        const epOutline = episodeOutlines[i];
        const episodeNum = epOutline.episode_number || i + 1;
        setCurrentEpisodeGenerating(episodeNum);
        
        // Update step label with current episode
        updatePipelineStep('episodes', 'running', `Episodio ${episodeNum} de ${totalEpisodes}...`);
        toast.info(`Generando episodio ${episodeNum}/${totalEpisodes}...`);
        
        const { data: episodeData, error: episodeError } = await supabase.functions.invoke('script-generate-episode', {
          body: {
            outline: currentOutline,
            episodeNumber: episodeNum,
            episodeOutline: epOutline,
            characters: currentOutline.character_list || [],
            locations: currentOutline.location_list || [],
            language
          }
        });
        
        if (episodeError) {
          console.error(`Error generating episode ${episodeNum}:`, episodeError);
          toast.error(`Error en episodio ${episodeNum}: ${episodeError.message}`);
          // Continue with next episode instead of failing completely
          generatedEpisodes.push({
            episode_number: episodeNum,
            title: epOutline.title || `Episodio ${episodeNum}`,
            synopsis: epOutline.synopsis,
            summary: epOutline.synopsis?.substring(0, 200),
            scenes: [],
            error: episodeError.message
          });
        } else if (episodeData?.episode) {
          generatedEpisodes.push(episodeData.episode);
        }
        
        // Update progress
        const episodeProgress = 35 + Math.round((i + 1) / totalEpisodes * 50);
        setPipelineProgress(episodeProgress);
      }
      
      setCurrentEpisodeGenerating(null);
      
      // Build complete screenplay object
      const completeScreenplay = {
        title: currentOutline.title,
        logline: currentOutline.logline,
        synopsis: currentOutline.synopsis,
        genre: currentOutline.genre,
        tone: currentOutline.tone,
        themes: currentOutline.themes,
        characters: currentOutline.character_list,
        locations: currentOutline.location_list,
        props: currentOutline.hero_props,
        episodes: generatedEpisodes,
        music_design: currentOutline.music_design || [],
        sfx_design: currentOutline.sfx_design || [],
        vfx_requirements: currentOutline.vfx_requirements || [],
        counts: {
          ...currentOutline.counts,
          total_dialogue_lines: generatedEpisodes.reduce((sum, ep) => sum + (ep.total_dialogue_lines || 0), 0)
        },
        qc_notes: currentOutline.assumptions || []
      };
      
      setGeneratedScript(completeScreenplay);
      updatePipelineStep('episodes', 'success');
      setPipelineProgress(90);

      // Step 5: Save to DB
      updatePipelineStep('save', 'running');
      const screenplayText = JSON.stringify(completeScreenplay, null, 2);

      const { data: savedScript, error: saveError } = await supabase.from('scripts').upsert({
        id: currentScriptId || undefined,
        project_id: projectId,
        raw_text: screenplayText,
        parsed_json: completeScreenplay as any,
        status: 'draft',
        version: 1
      }, { onConflict: 'id' }).select().single();

      if (saveError) throw saveError;
      setCurrentScriptId(savedScript.id);
      setScriptText(screenplayText);

      updatePipelineStep('save', 'success');
      setPipelineProgress(100);

      toast.success(`¡Guion completo generado! ${generatedEpisodes.length} episodios con diálogos extensos.`);
      setActiveTab('summary');

    } catch (error: any) {
      console.error('Pipeline error:', error);

      let message = error?.message || 'Error en el pipeline de generación';

      // FunctionsHttpError: intenta leer el body JSON devuelto por la función
      if (error?.name === 'FunctionsHttpError' && error?.context && typeof error.context?.clone === 'function') {
        try {
          const resp: Response = error.context as Response;
          const cloned = resp.clone();

          let body: any = null;
          try {
            body = await cloned.json();
          } catch {
            const text = await cloned.text();
            body = text ? { error: text } : null;
          }

          if (body?.error) message = body.error;
          else if (body?.message) message = body.message;
          else message = `Error (${resp.status}) en la función de backend.`;
        } catch {
          // ignore
        }
      }

      toast.error(message);
      const currentStep = pipelineSteps.find(s => s.status === 'running');
      if (currentStep) updatePipelineStep(currentStep.id, 'error');
    } finally {
      setPipelineRunning(false);
      setCurrentEpisodeGenerating(null);
    }
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
        setDoctorSuggestions(data.analysis.suggestions || []);
        toast.success(`Análisis completado: ${data.analysis.suggestions?.length || 0} sugerencias`);
      }
    } catch (err: any) {
      console.error('Error analyzing script:', err);
      toast.error('Error al analizar guion');
    }
    setAnalyzing(false);
  };

  // Apply Doctor Suggestions
  const applyDoctorSuggestions = async () => {
    if (!generatedScript || doctorSuggestions.length === 0) {
      toast.error('No hay sugerencias para aplicar');
      return;
    }

    setApplyingDoctor(true);
    try {
      // Build rewrite instructions from suggestions
      const rewriteInstructions = doctorSuggestions
        .filter(s => s.severity === 'critical' || s.severity === 'high' || s.severity === 'medium')
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
        setGeneratedScript(data.outline);
        
        // Save the improved script
        if (currentScriptId) {
          await supabase.from('scripts').update({
            parsed_json: data.outline,
            updated_at: new Date().toISOString()
          }).eq('id', currentScriptId);
        }

        toast.success('Sugerencias aplicadas correctamente');
        setDoctorSuggestions([]);
        setDoctorScore(null);
        setActiveTab('summary');
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

      const { error } = await supabase
        .from('scenes')
        .insert(scenesToInsert);

      if (error) throw error;

      setSegmentedEpisodes(prev => new Set([...prev, episodeNumber]));
      toast.success(`${scenesToInsert.length} escenas creadas para Episodio ${episodeNumber}`);
      
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
      `¿Segmentar ${episodes.length} episodio(s) en escenas individuales?\n\nEsto creará las escenas en la base de datos para que puedas añadir planos.`
    );
    if (!confirm) return;

    setSegmenting(true);
    let totalScenes = 0;

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

          const { error } = await supabase
            .from('scenes')
            .insert(scenesToInsert);

          if (error) throw error;
          totalScenes += scenesToInsert.length;
          setSegmentedEpisodes(prev => new Set([...prev, episodeNumber]));
        }
      }

      toast.success(`${totalScenes} escenas creadas en ${episodes.length} episodio(s)`);
      
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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Guion (Generar / Importar)</h2>
          <p className="text-sm text-muted-foreground">
            Pipeline completo: Idea → Outline → QC → Guion → Freeze
          </p>
        </div>
        <div className="flex items-center gap-2">
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
            </>
          )}
        </div>
      </div>

      {/* Pipeline Status */}
      <div className="flex gap-2 p-3 bg-muted/30 rounded-lg items-center overflow-x-auto">
        <span className="text-xs font-medium text-muted-foreground shrink-0">Pipeline:</span>
        {['Draft', 'Outline', 'QC', 'Screenplay', 'Doctor', 'Freeze', 'Breakdown'].map((step, i) => (
          <Badge 
            key={step} 
            variant={
              (step === 'Draft' && !outline && !generatedScript) ||
              (step === 'Outline' && outline && !generatedScript) ||
              (step === 'Screenplay' && generatedScript && !scriptLocked) ||
              (step === 'Freeze' && scriptLocked)
                ? 'default' 
                : 'outline'
            }
            className="shrink-0"
          >
            {step}
          </Badge>
        ))}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-5">
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
          <TabsTrigger value="doctor" className="flex items-center gap-2">
            <Stethoscope className="w-4 h-4" />
            Doctor
          </TabsTrigger>
        </TabsList>

        {/* GENERATE TAB */}
        <TabsContent value="generate" className="space-y-4">
          {/* CTA Principal */}
          <Card className="border-primary/50 bg-gradient-to-r from-primary/5 to-transparent">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-lg flex items-center gap-2">
                    <Rocket className="w-5 h-5 text-primary" />
                    Generar Guion Listo para Rodar
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Pipeline automático: Targets → Outline → QC → Screenplay completo
                  </p>
                </div>
                <Button 
                  variant="gold" 
                  size="lg"
                  onClick={runFullPipeline} 
                  disabled={pipelineRunning || !ideaText.trim()}
                >
                  {pipelineRunning ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Generando...</>
                  ) : (
                    <><Wand2 className="w-4 h-4 mr-2" />Generar Guion Completo</>
                  )}
                </Button>
              </div>

              {/* Pipeline Progress */}
              {pipelineRunning && (
                <div className="mt-4 space-y-3">
                  <Progress value={pipelineProgress} className="h-2" />
                  <div className="flex gap-2 flex-wrap items-center">
                    {pipelineSteps.map(step => (
                      <Badge 
                        key={step.id}
                        variant={step.status === 'success' ? 'default' : step.status === 'error' ? 'destructive' : 'outline'}
                        className="flex items-center gap-1"
                      >
                        {step.status === 'running' && <Loader2 className="w-3 h-3 animate-spin" />}
                        {step.status === 'success' && <CheckCircle className="w-3 h-3" />}
                        {step.status === 'error' && <XCircle className="w-3 h-3" />}
                        {step.label}
                      </Badge>
                    ))}
                  </div>
                  {currentEpisodeGenerating !== null && (
                    <div className="flex items-center gap-2 text-sm font-medium text-primary">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Escribiendo diálogos del Episodio {currentEpisodeGenerating}...</span>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

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
                            {[4, 6, 8, 10, 12].map(n => (
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

                  {/* Counts */}
                  {generatedScript.counts && (
                    <div className="grid gap-2 grid-cols-4 md:grid-cols-8">
                      <CountBadge label="Protagonistas" value={generatedScript.counts.protagonists} />
                      <CountBadge label="Secundarios" value={generatedScript.counts.supporting} />
                      <CountBadge label="Extras" value={generatedScript.counts.extras_with_lines} />
                      <CountBadge label="Localizaciones" value={generatedScript.counts.locations} />
                      <CountBadge label="Props" value={generatedScript.counts.hero_props} />
                      <CountBadge label="Setpieces" value={generatedScript.counts.setpieces} />
                      <CountBadge label="Escenas" value={generatedScript.counts.total_scenes} />
                      <CountBadge label="Diálogos" value={generatedScript.counts.total_dialogue_lines} />
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
                              {char.role && <Badge variant="outline" className="text-xs">{char.role}</Badge>}
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
                            <p className="font-medium text-sm truncate">{typeof loc === 'string' ? loc : loc.name}</p>
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
                            <p className="font-medium text-sm truncate">{typeof prop === 'string' ? prop : prop.name}</p>
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
                                  {segmentedEpisodes.has(episodeNum) && (
                                    <Badge variant="default" className="bg-green-600">
                                      <CheckCircle className="w-3 h-3 mr-1" />
                                      Segmentado
                                    </Badge>
                                  )}
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
                                    <div className="bg-foreground text-background px-4 py-2 font-mono text-sm font-bold">
                                      {scene.scene_number || sceneIdx + 1}. {scene.slugline || 'SIN SLUGLINE'}
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
                      disabled={applyingDoctor || !generatedScript}
                    >
                      {applyingDoctor ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Wand2 className="w-4 h-4 mr-2" />}
                      Aplicar Cambios
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            {doctorSuggestions.length > 0 && (
              <CardContent>
                <ScrollArea className="h-[400px]">
                  <div className="space-y-3">
                    {doctorSuggestions.map((s: any, i: number) => (
                      <div key={i} className="p-3 rounded-lg border">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge className={getSeverityColor(s.severity)}>{s.severity}</Badge>
                          <Badge variant="outline">{s.category}</Badge>
                        </div>
                        <p className="font-medium text-sm">{s.issue}</p>
                        <p className="text-xs text-muted-foreground mt-1">{s.reason}</p>
                        <div className="mt-2 p-2 bg-primary/5 rounded text-sm">
                          <strong>Sugerencia:</strong> {s.suggestion}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            )}
          </Card>
        </TabsContent>
      </Tabs>
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

function CountBadge({ label, value }: { label: string; value: number }) {
  return (
    <div className="text-center p-2 rounded-lg bg-muted/50">
      <div className="text-lg font-bold text-primary">{value || 0}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
