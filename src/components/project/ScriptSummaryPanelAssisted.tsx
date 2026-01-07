/**
 * ScriptSummaryPanelAssisted - Simplified summary for ASSISTED mode
 * Shows episodes, teasers, characters, locations with export to Bible
 * Generates scenes + shots automatically with clear messaging
 * Supports background task execution for all generation processes
 * 
 * v2: Simplified UI with NextStepIndicator and fewer duplicate buttons
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { useBackgroundTasks } from '@/contexts/BackgroundTasksContext';
import { NextStepIndicator, determineWorkflowStep, WorkflowStep } from './NextStepIndicator';
import {
  Film,
  ChevronDown,
  ChevronUp,
  Loader2,
  CheckCircle,
  FileDown,
  Clock,
  Users,
  MapPin,
  Play,
  Sparkles,
  Box,
  Download,
  Check,
  Crown,
  Skull,
  UserCheck,
  UserPlus,
  Star,
  Users2,
  GitBranch,
  Zap,
  BookOpen,
  MoreHorizontal,
  Bell,
  Pencil,
  Wand2,
  Target,
  Package,
} from 'lucide-react';
import { exportScreenplayPDF } from '@/lib/exportScreenplayPDF';
import { exportBibleSummaryPDF } from '@/lib/exportBibleSummaryPDF';
import { exportOutlinePDF } from '@/lib/exportOutlinePDF';
import { useCreativeModeOptional } from '@/contexts/CreativeModeContext';
import { 
  getSceneSlugline, 
  isValidSlugline, 
  normalizeScenes, 
  countValidSluglines,
  getBreakdownReliability 
} from '@/lib/sceneNormalizer';

interface ScriptSummaryPanelAssistedProps {
  projectId: string;
  projectFormat?: 'film' | 'series' | 'short' | string;
  onScenesGenerated?: () => void;
  onEntitiesExtracted?: () => void;
}

interface ScriptData {
  id: string;
  title: string;
  synopsis?: string;
  episodes: EpisodeData[];
  teasers?: {
    teaser60?: TeaserData;
    teaser30?: TeaserData;
  };
  characters?: CharacterData[];
  featured_extras?: CharacterData[];
  voices?: CharacterData[];
  locations?: LocationData[];
  props?: any[];
  subplots?: SubplotData[];
  plot_twists?: PlotTwistData[];
  scenes?: SceneData[];
  counts?: {
    total_scenes?: number;
    total_dialogue_lines?: number;
    cast_characters_total?: number;
    featured_extras_total?: number;
    voices_total?: number;
    characters_total?: number;
    locations_base_total?: number;
  };
  parsedJson?: any; // Raw parsed JSON for extended export
}

interface SceneData {
  scene_number?: number;
  slugline?: string;
  location?: string;
  time_of_day?: string;
  int_ext?: string;
  summary?: string;
  characters_present?: string[];
}

interface EpisodeData {
  episode_number: number;
  title: string;
  synopsis?: string;
  scenes?: any[];
  duration_min?: number;
}

interface TeaserData {
  title?: string;
  logline?: string;
  scenes?: any[];
  music_cue?: string;
  voiceover_text?: string;
}

interface CharacterData {
  name: string;
  role?: string;
  role_detail?: string;
  entity_type?: string;
  description?: string;
  priority?: string;
  arc?: string;
}

interface LocationData {
  name: string;
  type?: string;
  description?: string;
}

interface SubplotData {
  name: string;
  description?: string;
  characters_involved?: string[];
}

interface PlotTwistData {
  name: string;
  description?: string;
  impact?: 'minor' | 'major' | 'paradigm_shift';
}

export function ScriptSummaryPanelAssisted({ 
  projectId, 
  projectFormat = 'series',
  onScenesGenerated,
  onEntitiesExtracted 
}: ScriptSummaryPanelAssistedProps) {
  const navigate = useNavigate();
  const creativeMode = useCreativeModeOptional();
  const effectiveMode = creativeMode?.effectiveMode || 'ASSISTED';
  const { addTask, updateTask, completeTask, failTask, setIsOpen } = useBackgroundTasks();
  
  const [loading, setLoading] = useState(true);
  const [scriptData, setScriptData] = useState<ScriptData | null>(null);
  const [segmenting, setSegmenting] = useState(false);
  const [segmentProgress, setSegmentProgress] = useState({ current: 0, total: 0, phase: '' });
  const [segmentedEpisodes, setSegmentedEpisodes] = useState<Set<number>>(new Set());
  const [extractingEntities, setExtractingEntities] = useState(false);
  const [entitiesExtracted, setEntitiesExtracted] = useState(false);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [runningInBackground, setRunningInBackground] = useState(false);
  
  // Bible counts (from actual database)
  const [bibleCharacterCount, setBibleCharacterCount] = useState<number>(0);
  const [bibleLocationCount, setBibleLocationCount] = useState<number>(0);
  
  // Inline editing states (DIRECTOR/PRO only)
  const [editingMainTitle, setEditingMainTitle] = useState(false);
  const [editingEpisodeIndex, setEditingEpisodeIndex] = useState<number | null>(null);
  const [tempTitle, setTempTitle] = useState('');
  const titleInputRef = useRef<HTMLInputElement>(null);
  
  const canEditTitles = effectiveMode === 'PRO';
  
  // Determine current workflow step
  const allEpisodesSegmented = scriptData?.episodes?.every(ep => segmentedEpisodes.has(ep.episode_number)) ?? false;
  
  const currentStep = determineWorkflowStep({
    hasScript: !!scriptData,
    hasEntities: entitiesExtracted,
    isExtractingEntities: extractingEntities,
    hasScenes: allEpisodesSegmented,
    isGeneratingScenes: segmenting,
  });

  // Load script data
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      
      // Get latest script
      const { data: script } = await supabase
        .from('scripts')
        .select('id, parsed_json')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (script?.parsed_json) {
        const parsed = script.parsed_json as any;
        
        // Hydrate characters - PRIORITIZE narrative_classification (complete semantic extraction)
        let characters: any[] = [];
        let featured_extras: any[] = [];
        let voices: any[] = [];
        
        const narrativeClass = parsed.characters?.narrative_classification;
        
        if (narrativeClass) {
          // Use narrative_classification - contains ALL semantically classified characters
          const protagonists = Array.isArray(narrativeClass.protagonists) 
            ? narrativeClass.protagonists.map((c: any) => ({ ...c, category: 'protagonist' })) 
            : [];
          const majorSupporting = Array.isArray(narrativeClass.major_supporting) 
            ? narrativeClass.major_supporting.map((c: any) => ({ ...c, category: 'major_supporting' })) 
            : [];
          const minorSpeaking = Array.isArray(narrativeClass.minor_speaking) 
            ? narrativeClass.minor_speaking.map((c: any) => ({ ...c, category: 'minor_speaking' })) 
            : [];
          const voicesSystems = Array.isArray(narrativeClass.voices_systems) 
            ? narrativeClass.voices_systems.map((c: any) => ({ ...c, category: 'voice' })) 
            : [];
          
          // Main cast = protagonists + major supporting
          characters = [...protagonists, ...majorSupporting];
          // Featured extras = minor speaking roles
          featured_extras = minorSpeaking;
          // Voices = voices and systems
          voices = voicesSystems;
          
          console.log('[ScriptSummary] Using narrative_classification:', {
            protagonists: protagonists.length,
            majorSupporting: majorSupporting.length,
            minorSpeaking: minorSpeaking.length,
            voices: voicesSystems.length
          });
        } else if (Array.isArray(parsed.characters)) {
          characters = parsed.characters;
        } else if (parsed.characters && typeof parsed.characters === 'object') {
          // Fallback to nested format: cast + featured_extras + voices
          characters = Array.isArray(parsed.characters.cast) ? parsed.characters.cast : [];
          featured_extras = Array.isArray(parsed.characters.featured_extras_with_lines) ? parsed.characters.featured_extras_with_lines : [];
          voices = Array.isArray(parsed.characters.voices_and_functional) ? parsed.characters.voices_and_functional : [];
        } else if (Array.isArray(parsed.main_characters)) {
          characters = parsed.main_characters;
        }
        
        // Hydrate locations - handle both nested (locations.base) and flat formats
        let locations: any[] = [];
        if (Array.isArray(parsed.locations)) {
          locations = parsed.locations;
        } else if (parsed.locations?.base && Array.isArray(parsed.locations.base)) {
          locations = parsed.locations.base;
        } else if (Array.isArray(parsed.main_locations)) {
          locations = parsed.main_locations;
        }
        
        // Hydrate props - handle both nested (props.items) and flat formats
        let props: any[] = [];
        if (Array.isArray(parsed.props)) {
          props = parsed.props;
        } else if (parsed.props?.items && Array.isArray(parsed.props.items)) {
          props = parsed.props.items;
        }
        
        // Compute total characters across ALL categories (cast + featured + voices)
        const castLen = characters.length;
        const featuredLen = featured_extras.length;
        const voicesLen = voices.length;
        const totalCharacters = castLen + featuredLen + voicesLen;
        
        // Use counts from parsed_json if available, otherwise compute
        const counts = parsed.counts || {
          cast_characters_total: castLen,
          featured_extras_total: featuredLen,
          voices_total: voicesLen,
          characters_total: totalCharacters,
          locations_base_total: locations.length,
        };
        
        // Ensure characters_total is always the sum
        counts.characters_total = (counts.cast_characters_total || 0) + (counts.featured_extras_total || 0) + (counts.voices_total || 0);
        
        console.log('[ScriptSummary] Hydrated counts:', { 
          cast: castLen,
          featured: featuredLen,
          voices: voicesLen,
          total: counts.characters_total,
          locations: locations.length, 
          props: props.length,
        });
        
        // Hydrate scenes - handle both nested (scenes.list) and flat formats
        let scenes: any[] = [];
        if (Array.isArray(parsed.scenes)) {
          scenes = parsed.scenes;
        } else if (parsed.scenes?.list && Array.isArray(parsed.scenes.list)) {
          scenes = parsed.scenes.list;
        }
        
        setScriptData({
          id: script.id,
          title: parsed.title || 'Guion',
          synopsis: parsed.synopsis || parsed.logline,
          episodes: parsed.episodes || [],
          teasers: parsed.teasers,
          characters,
          featured_extras,
          voices,
          locations,
          props,
          subplots: parsed.subplots || [],
          plot_twists: parsed.plot_twists || [],
          scenes,
          counts,
          parsedJson: parsed, // Keep raw parsed JSON for extended export
        });
      }

      // Check existing entities in Bible
      const [{ count: charCount }, { count: locCount }] = await Promise.all([
        supabase.from('characters').select('*', { count: 'exact', head: true }).eq('project_id', projectId),
        supabase.from('locations').select('*', { count: 'exact', head: true }).eq('project_id', projectId),
      ]);
      
      // Store actual Bible counts
      setBibleCharacterCount(charCount || 0);
      setBibleLocationCount(locCount || 0);
      
      if ((charCount || 0) > 0 || (locCount || 0) > 0) {
        setEntitiesExtracted(true);
      }

      // Check which episodes have scenes
      const { data: scenes } = await supabase
        .from('scenes')
        .select('episode_no')
        .eq('project_id', projectId);

      if (scenes) {
        setSegmentedEpisodes(new Set(scenes.map(s => s.episode_no)));
      }

      setLoading(false);
    };

    loadData();
  }, [projectId]);

  // Save title changes to Supabase (DIRECTOR/PRO only)
  const saveMainTitle = async (newTitle: string) => {
    if (!scriptData || !newTitle.trim()) {
      setEditingMainTitle(false);
      return;
    }
    
    try {
      // Get current parsed_json
      const { data: script } = await supabase
        .from('scripts')
        .select('id, parsed_json')
        .eq('id', scriptData.id)
        .single();
      
      if (script?.parsed_json) {
        const updatedJson = { ...(script.parsed_json as any), title: newTitle.trim() };
        await supabase
          .from('scripts')
          .update({ parsed_json: updatedJson })
          .eq('id', scriptData.id);
        
        setScriptData(prev => prev ? { ...prev, title: newTitle.trim() } : null);
        toast.success('Título actualizado');
      }
    } catch (err) {
      console.error('Error updating title:', err);
      toast.error('Error al guardar el título');
    }
    setEditingMainTitle(false);
  };

  const saveEpisodeTitle = async (episodeIndex: number, newTitle: string) => {
    if (!scriptData || !newTitle.trim()) {
      setEditingEpisodeIndex(null);
      return;
    }
    
    try {
      const { data: script } = await supabase
        .from('scripts')
        .select('id, parsed_json')
        .eq('id', scriptData.id)
        .single();
      
      if (script?.parsed_json) {
        const parsed = script.parsed_json as any;
        const updatedEpisodes = [...(parsed.episodes || [])];
        if (updatedEpisodes[episodeIndex]) {
          updatedEpisodes[episodeIndex] = { ...updatedEpisodes[episodeIndex], title: newTitle.trim() };
        }
        
        const updatedJson = { ...parsed, episodes: updatedEpisodes };
        await supabase
          .from('scripts')
          .update({ parsed_json: updatedJson })
          .eq('id', scriptData.id);
        
        setScriptData(prev => {
          if (!prev) return null;
          const newEpisodes = [...prev.episodes];
          if (newEpisodes[episodeIndex]) {
            newEpisodes[episodeIndex] = { ...newEpisodes[episodeIndex], title: newTitle.trim() };
          }
          return { ...prev, episodes: newEpisodes };
        });
        toast.success('Título del episodio actualizado');
      }
    } catch (err) {
      console.error('Error updating episode title:', err);
      toast.error('Error al guardar el título');
    }
    setEditingEpisodeIndex(null);
  };

  // Extract entities to Bible
  const extractEntitiesToBible = async () => {
    if (!scriptData) return;
    
    setExtractingEntities(true);
    let insertedCount = { characters: 0, locations: 0, props: 0 };
    let errors: string[] = [];
    
    try {
      // Get existing characters to avoid duplicates
      const { data: existingChars } = await supabase
        .from('characters')
        .select('name')
        .eq('project_id', projectId);
      const existingCharNames = new Set((existingChars || []).map(c => c.name.toLowerCase()));

      // Insert characters one by one, checking for duplicates
      if (scriptData.characters?.length) {
        for (const char of scriptData.characters) {
          if (!char.name || existingCharNames.has(char.name.toLowerCase())) continue;
          
          const { error } = await supabase.from('characters').insert({
            project_id: projectId,
            name: char.name,
            role: char.role_detail || char.role || char.description || null,
            bio: char.description || null,
            arc: char.arc || null,
          });
          
          if (error) {
            console.error('Error inserting character:', char.name, error);
            errors.push(`Personaje "${char.name}": ${error.message}`);
          } else {
            insertedCount.characters++;
            existingCharNames.add(char.name.toLowerCase());
          }
        }
      }

      // Get existing locations
      const { data: existingLocs } = await supabase
        .from('locations')
        .select('name')
        .eq('project_id', projectId);
      const existingLocNames = new Set((existingLocs || []).map(l => l.name.toLowerCase()));

      // Insert locations
      if (scriptData.locations?.length) {
        for (const loc of scriptData.locations) {
          if (!loc.name || existingLocNames.has(loc.name.toLowerCase())) continue;
          
          const { error } = await supabase.from('locations').insert({
            project_id: projectId,
            name: loc.name,
            description: loc.description || loc.type || null,
          });
          
          if (error) {
            console.error('Error inserting location:', loc.name, error);
            errors.push(`Localización "${loc.name}": ${error.message}`);
          } else {
            insertedCount.locations++;
            existingLocNames.add(loc.name.toLowerCase());
          }
        }
      }

      // Get existing props
      const { data: existingProps } = await supabase
        .from('props')
        .select('name')
        .eq('project_id', projectId);
      const existingPropNames = new Set((existingProps || []).map(p => p.name.toLowerCase()));

      // Insert props
      if (scriptData.props?.length) {
        for (const prop of scriptData.props) {
          const propName = typeof prop === 'string' ? prop : prop.name;
          if (!propName || existingPropNames.has(propName.toLowerCase())) continue;
          
          const { error } = await supabase.from('props').insert({
            project_id: projectId,
            name: propName,
            description: typeof prop === 'object' ? prop.description : null,
          });
          
          if (error) {
            console.error('Error inserting prop:', propName, error);
          } else {
            insertedCount.props++;
            existingPropNames.add(propName.toLowerCase());
          }
        }
      }

      setEntitiesExtracted(true);
      
      const totalInserted = insertedCount.characters + insertedCount.locations + insertedCount.props;
      if (totalInserted > 0) {
        toast.success(`Añadidos: ${insertedCount.characters} personajes, ${insertedCount.locations} localizaciones, ${insertedCount.props} props`);
      } else if (errors.length > 0) {
        toast.error(`Error al añadir elementos: ${errors[0]}`);
      } else {
        toast.info('Todos los elementos ya estaban en la Biblia');
      }
      
      onEntitiesExtracted?.();
    } catch (err) {
      console.error('Error extracting entities:', err);
      toast.error('Error al exportar elementos a la Biblia');
    } finally {
      setExtractingEntities(false);
    }
  };

  // Generate all scenes with shots - runs in background
  const generateAllScenesAndShots = async (runInBackground = false) => {
    if (!scriptData?.episodes?.length) return;
    
    const episodes = scriptData.episodes.filter(ep => !segmentedEpisodes.has(ep.episode_number));
    const totalItems = episodes.length + 
      (scriptData.teasers?.teaser60 && !segmentedEpisodes.has(-1) ? 1 : 0) +
      (scriptData.teasers?.teaser30 && !segmentedEpisodes.has(-2) ? 1 : 0);

    if (totalItems === 0) {
      toast.info('Todas las escenas ya están generadas');
      return;
    }

    // Create background task
    const taskId = addTask({
      type: 'scene_generation',
      title: 'Generando escenas y shots',
      description: `${totalItems} episodios/teasers pendientes`,
      projectId,
      entityName: scriptData.title,
      metadata: { episodeCount: episodes.length },
    });

    if (runInBackground) {
      setRunningInBackground(true);
      toast.success('Generación iniciada en segundo plano', {
        description: 'Puedes navegar a otras pantallas. Te notificaremos cuando termine.',
        action: {
          label: 'Ver progreso',
          onClick: () => setIsOpen(true),
        },
      });
    } else {
      setSegmenting(true);
      setSegmentProgress({ current: 0, total: totalItems, phase: 'Preparando...' });
    }

    try {
      let completed = 0;

      for (let i = 0; i < episodes.length; i++) {
        const episode = episodes[i];
        const phase = `Episodio ${episode.episode_number}: Generando escenas y shots...`;
        
        if (!runInBackground) {
          setSegmentProgress({ current: i + 1, total: totalItems, phase });
        }
        updateTask(taskId, { 
          progress: Math.round((completed / totalItems) * 100),
          description: phase,
        });
        
        const { error } = await supabase.functions.invoke('generate-scenes', {
          body: {
            projectId,
            episodeNo: episode.episode_number,
            synopsis: episode.synopsis || episode.title,
            sceneCount: episode.scenes?.length || 8,
          }
        });

        if (error) {
          console.error(`Error en Episodio ${episode.episode_number}:`, error);
          if (!runInBackground) {
            toast.error(`Error en Episodio ${episode.episode_number}`);
          }
        } else {
          setSegmentedEpisodes(prev => new Set([...prev, episode.episode_number]));
          completed++;
        }
      }

      // Generate teasers if available
      if (scriptData.teasers?.teaser60 && !segmentedEpisodes.has(-1)) {
        const phase = 'Generando Teaser 60s...';
        if (!runInBackground) {
          setSegmentProgress(prev => ({ ...prev, phase }));
        }
        updateTask(taskId, { description: phase, progress: Math.round((completed / totalItems) * 100) });
        
        await supabase.functions.invoke('generate-scenes', {
          body: {
            projectId,
            episodeNo: -1,
            synopsis: `TEASER 60s: ${scriptData.teasers.teaser60.logline}`,
            sceneCount: scriptData.teasers.teaser60.scenes?.length || 6,
            isTeaser: true,
            teaserType: '60s',
          }
        });
        setSegmentedEpisodes(prev => new Set([...prev, -1]));
        completed++;
      }

      if (scriptData.teasers?.teaser30 && !segmentedEpisodes.has(-2)) {
        const phase = 'Generando Teaser 30s...';
        if (!runInBackground) {
          setSegmentProgress(prev => ({ ...prev, phase }));
        }
        updateTask(taskId, { description: phase, progress: Math.round((completed / totalItems) * 100) });
        
        await supabase.functions.invoke('generate-scenes', {
          body: {
            projectId,
            episodeNo: -2,
            synopsis: `TEASER 30s: ${scriptData.teasers.teaser30.logline}`,
            sceneCount: scriptData.teasers.teaser30.scenes?.length || 4,
            isTeaser: true,
            teaserType: '30s',
          }
        });
        setSegmentedEpisodes(prev => new Set([...prev, -2]));
        completed++;
      }
      
      completeTask(taskId, { completedEpisodes: completed });
      toast.success('¡Proyecto listo para producción!');
      onScenesGenerated?.();
    } catch (err) {
      console.error('Error generating scenes:', err);
      failTask(taskId, err instanceof Error ? err.message : 'Error desconocido');
      if (!runInBackground) {
        toast.error('Error al generar escenas');
      }
    } finally {
      setSegmenting(false);
      setRunningInBackground(false);
      setSegmentProgress({ current: 0, total: 0, phase: '' });
    }
  };

  // Export script PDF with extended extraction data
  const handleExportPDF = () => {
    if (!scriptData) return;
    try {
      exportScreenplayPDF({
        title: scriptData.title,
        synopsis: scriptData.synopsis,
        episodes: scriptData.episodes as any[],
        characters: scriptData.characters,
        locations: scriptData.locations,
        parsedJson: scriptData.parsedJson, // Include raw parsed JSON for casting report
      });
      toast.success('Guion profesional PDF exportado');
    } catch (err) {
      console.error('Export PDF error:', err);
      toast.error('Error al exportar PDF');
    }
  };

  // Export bible summary PDF
  const handleExportBiblePDF = () => {
    if (!scriptData) return;
    try {
      const sceneCount = scriptData.counts?.total_scenes || 
        scriptData.episodes.reduce((sum, ep) => sum + (ep.scenes?.length || 0), 0);
      exportBibleSummaryPDF({
        title: scriptData.title,
        synopsis: scriptData.synopsis,
        format: projectFormat,
        episodeCount: scriptData.episodes.length,
        sceneCount,
        characters: scriptData.characters,
        locations: scriptData.locations,
        props: scriptData.props,
        subplots: scriptData.subplots,
        plot_twists: scriptData.plot_twists,
      });
      toast.success('Biblia PDF exportada');
    } catch (err) {
      toast.error('Error al exportar Biblia');
    }
  };

  // Export professional outline PDF
  const handleExportOutlinePDF = () => {
    if (!scriptData) return;
    try {
      const sceneCount = scriptData.counts?.total_scenes || 
        scriptData.episodes.reduce((sum, ep) => sum + (ep.scenes?.length || 0), 0);
      
      // Calculate estimated duration
      const estimatedDuration = scriptData.episodes.reduce((sum, ep) => sum + (ep.duration_min || 0), 0);
      
      exportOutlinePDF({
        title: scriptData.title,
        logline: scriptData.synopsis?.split('.')[0], // First sentence as logline
        synopsis: scriptData.synopsis,
        format: projectFormat,
        estimatedDuration: estimatedDuration || undefined,
        episodes: scriptData.episodes,
        teasers: scriptData.teasers,
        characters: scriptData.characters,
        locations: scriptData.locations,
        props: scriptData.props,
        subplots: scriptData.subplots,
        plot_twists: scriptData.plot_twists,
        counts: {
          total_scenes: sceneCount,
          total_dialogue_lines: scriptData.counts?.total_dialogue_lines,
        },
      });
      toast.success('Outline profesional exportado');
    } catch (err) {
      console.error('Export error:', err);
      toast.error('Error al exportar Outline');
    }
  };

  if (loading) {
    return (
      <Card className="p-8">
        <div className="flex items-center justify-center gap-2">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Cargando guion...</span>
        </div>
      </Card>
    );
  }

  if (!scriptData) {
    return null;
  }

  const totalScenes = scriptData.counts?.total_scenes || 
    scriptData.episodes.reduce((sum, ep) => sum + (ep.scenes?.length || 0), 0);
  const allSegmented = scriptData.episodes.every(ep => segmentedEpisodes.has(ep.episode_number));
  const hasTeasers = scriptData.teasers?.teaser60 || scriptData.teasers?.teaser30;

  return (
    <div className="space-y-4">
      {/* Next Step Indicator - The single source of truth for "what to do next" */}
      <NextStepIndicator
        currentStep={currentStep}
        onAction={() => {
          if (currentStep === 'entities_needed') {
            extractEntitiesToBible();
          } else if (currentStep === 'scenes_needed') {
            generateAllScenesAndShots(false);
          } else if (currentStep === 'production_ready' || currentStep === 'scenes_ready') {
            navigate(`/projects/${projectId}/scenes`);
          }
        }}
        isLoading={extractingEntities || segmenting}
        progress={segmenting && segmentProgress.total > 0 
          ? Math.round((segmentProgress.current / segmentProgress.total) * 100) 
          : undefined}
        progressLabel={segmentProgress.phase || undefined}
        onRunInBackground={effectiveMode !== 'ASSISTED' && currentStep === 'scenes_needed' 
          ? () => generateAllScenesAndShots(true) 
          : undefined}
        mode={effectiveMode}
      />

      {/* Header Card - Overview (simplified) */}
      <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
        <CardHeader className="pb-3 px-3 sm:px-6">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <CardTitle className="text-lg sm:text-xl flex items-center gap-2 sm:gap-3">
                <div className="p-1.5 sm:p-2 bg-primary/20 rounded-lg flex-shrink-0">
                  <Film className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                </div>
                {editingMainTitle && canEditTitles ? (
                  <Input
                    ref={titleInputRef}
                    value={tempTitle}
                    onChange={(e) => setTempTitle(e.target.value)}
                    onBlur={() => saveMainTitle(tempTitle)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveMainTitle(tempTitle);
                      if (e.key === 'Escape') setEditingMainTitle(false);
                    }}
                    className="h-8 text-lg font-semibold flex-1"
                    autoFocus
                  />
                ) : (
                  <span 
                    className={`break-words ${canEditTitles ? 'cursor-pointer hover:text-primary transition-colors group' : ''}`}
                    onClick={() => {
                      if (canEditTitles) {
                        setTempTitle(scriptData.title);
                        setEditingMainTitle(true);
                      }
                    }}
                  >
                    {scriptData.title}
                    {canEditTitles && (
                      <Pencil className="h-3 w-3 inline-block ml-2 opacity-0 group-hover:opacity-50 transition-opacity" />
                    )}
                  </span>
                )}
              </CardTitle>
              {scriptData.synopsis && (
                <CardDescription className="mt-2 line-clamp-2 text-xs sm:text-sm">
                  {scriptData.synopsis}
                </CardDescription>
              )}
            </div>
            
            {/* Consolidated Export Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1 sm:gap-2 flex-shrink-0 px-2 sm:px-3">
                  <FileDown className="h-4 w-4" />
                  <span className="hidden sm:inline">Exportar</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-popover z-50">
                <DropdownMenuItem onClick={handleExportOutlinePDF}>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Outline Pro (PDF)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportPDF}>
                  <FileDown className="h-4 w-4 mr-2" />
                  Guion completo (PDF)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportBiblePDF}>
                  <BookOpen className="h-4 w-4 mr-2" />
                  Resumen Biblia (PDF)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardHeader>
        
        <CardContent className="pt-0 px-3 sm:px-6">
          {/* Quick stats - Responsive grid */}
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
            <div className="p-2 sm:p-3 bg-background/50 rounded-lg text-center">
              <div className="text-lg sm:text-2xl font-bold text-primary">{scriptData.episodes.length}</div>
              <div className="text-[10px] sm:text-xs text-muted-foreground">
                {projectFormat === 'film' ? 'Actos' : projectFormat === 'short' ? 'Partes' : 'Eps'}
              </div>
            </div>
            <div className="p-2 sm:p-3 bg-background/50 rounded-lg text-center">
              <div className="text-lg sm:text-2xl font-bold text-primary">{totalScenes}</div>
              <div className="text-[10px] sm:text-xs text-muted-foreground">Escenas</div>
            </div>
            <div className="p-2 sm:p-3 bg-background/50 rounded-lg text-center">
              <div className="text-lg sm:text-2xl font-bold text-primary">
                {scriptData.counts?.characters_total || scriptData.characters?.length || 0}
              </div>
              <div className="text-[10px] sm:text-xs text-muted-foreground">Del análisis</div>
              {bibleCharacterCount > 0 && (
                <Badge 
                  variant="secondary" 
                  className="text-[9px] mt-1 cursor-pointer hover:bg-primary/20"
                  onClick={() => navigate(`/projects/${projectId}/characters`)}
                >
                  Bible: {bibleCharacterCount}
                </Badge>
              )}
            </div>
            <div className="p-2 sm:p-3 bg-background/50 rounded-lg text-center">
              <div className="text-lg sm:text-2xl font-bold text-primary">{scriptData.locations?.length || 0}</div>
              <div className="text-[10px] sm:text-xs text-muted-foreground">Locs</div>
              {bibleLocationCount > 0 && (
                <Badge 
                  variant="secondary" 
                  className="text-[9px] mt-1 cursor-pointer hover:bg-primary/20"
                  onClick={() => navigate(`/projects/${projectId}/locations`)}
                >
                  Bible: {bibleLocationCount}
                </Badge>
              )}
            </div>
            <div className="p-2 sm:p-3 bg-background/50 rounded-lg text-center">
              <div className="text-lg sm:text-2xl font-bold text-primary">{scriptData.props?.length || 0}</div>
              <div className="text-[10px] sm:text-xs text-muted-foreground">Props</div>
            </div>
          </div>
          
          {/* Quick links to Bible when entities exist */}
          {(bibleCharacterCount > 0 || bibleLocationCount > 0) && (
            <div className="flex gap-2 mt-3 flex-wrap">
              <Button 
                variant="ghost" 
                size="sm" 
                className="text-xs h-7 gap-1"
                onClick={() => navigate(`/projects/${projectId}/characters`)}
              >
                <Users className="h-3 w-3" />
                Ver {bibleCharacterCount} personajes
              </Button>
              <Button 
                variant="ghost" 
                size="sm" 
                className="text-xs h-7 gap-1"
                onClick={() => navigate(`/projects/${projectId}/locations`)}
              >
                <MapPin className="h-3 w-3" />
                Ver {bibleLocationCount} localizaciones
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Step 1: Export to Bible - Simplified, only show if not done */}
      {!entitiesExtracted && (
        <Card className="border-dashed">
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-muted rounded-lg">
                <Download className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">Exportar a Biblia</p>
                <p className="text-xs text-muted-foreground">
                  {scriptData.counts?.characters_total || scriptData.characters?.length || 0} personajes, {scriptData.locations?.length || 0} localizaciones
                </p>
              </div>
              <Button 
                size="sm" 
                variant="outline"
                onClick={extractEntitiesToBible} 
                disabled={extractingEntities}
              >
                {extractingEntities ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  'Exportar'
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Entities extracted confirmation */}
      {entitiesExtracted && (
        <div className="flex items-center gap-2 text-sm text-green-600 px-1">
          <Check className="h-4 w-4" />
          <span>Elementos exportados a la Biblia</span>
          <Button
            variant="link"
            size="sm"
            className="h-auto p-0 text-primary"
            onClick={() => navigate(`/projects/${projectId}/characters`)}
          >
            <Users className="h-3 w-3 mr-1" />
            Abrir Personajes
          </Button>
        </div>
      )}

      {/* Collapsible Details - Available for all modes */}
      <Collapsible 
        open={expandedSection === 'details'} 
        onOpenChange={(open) => setExpandedSection(open ? 'details' : null)}
      >
        <CollapsibleTrigger className="flex items-center justify-between w-full p-3 bg-muted/30 rounded-lg hover:bg-muted/50 transition-colors">
          <span className="text-sm font-medium">Ver detalles del análisis</span>
          {expandedSection === 'details' ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </CollapsibleTrigger>
          <CollapsibleContent>
            <Card className="mt-3 border-dashed">
              <CardContent className="py-4 space-y-4">
                {/* Protagonistas */}
                {scriptData.characters?.filter((c: any) => c.category === 'protagonist').length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Crown className="h-4 w-4 text-amber-500" />
                      <span className="font-medium text-sm">
                        Protagonistas ({scriptData.characters.filter((c: any) => c.category === 'protagonist').length})
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {scriptData.characters.filter((c: any) => c.category === 'protagonist').map((char: any, i: number) => (
                        <Badge key={`${char.canonical_name || char.name}-${i}`} variant="default" className="text-xs">
                          {char.canonical_name || char.name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Soporte Principal */}
                {scriptData.characters?.filter((c: any) => c.category === 'major_supporting').length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Users className="h-4 w-4 text-primary" />
                      <span className="font-medium text-sm">
                        Soporte Principal ({scriptData.characters.filter((c: any) => c.category === 'major_supporting').length})
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {scriptData.characters.filter((c: any) => c.category === 'major_supporting').map((char: any, i: number) => (
                        <Badge key={`${char.canonical_name || char.name}-${i}`} variant="outline" className="text-xs">
                          {char.canonical_name || char.name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Fallback for characters without category (legacy data) */}
                {scriptData.characters?.filter((c: any) => !c.category).length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Users className="h-4 w-4 text-primary" />
                      <span className="font-medium text-sm">
                        Cast Principal ({scriptData.characters.filter((c: any) => !c.category).length})
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {scriptData.characters.filter((c: any) => !c.category).map((char: any, i: number) => (
                        <Badge key={`${char.name}-${i}`} variant="outline" className="text-xs">
                          {char.name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Featured Extras with Lines */}
                {scriptData.featured_extras && scriptData.featured_extras.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <UserPlus className="h-4 w-4 text-primary" />
                      <span className="font-medium text-sm">Extras con Diálogo ({scriptData.featured_extras.length})</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {scriptData.featured_extras.map((char, i) => (
                        <Badge key={`${char.name}-${i}`} variant="secondary" className="text-xs">
                          {char.name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Voices and Functional */}
                {scriptData.voices && scriptData.voices.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Users2 className="h-4 w-4 text-primary" />
                      <span className="font-medium text-sm">Voces y Funcionales ({scriptData.voices.length})</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {scriptData.voices.map((char, i) => (
                        <Badge key={`${char.name}-${i}`} variant="outline" className="text-xs">
                          {char.name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Locations */}
                {scriptData.locations && scriptData.locations.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <MapPin className="h-4 w-4 text-primary" />
                      <span className="font-medium text-sm">Localizaciones ({scriptData.locations.length})</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {scriptData.locations.map((loc, i) => (
                        <Badge key={`${loc.name}-${i}`} variant="outline" className="text-xs">
                          {loc.name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Props */}
                {scriptData.props && scriptData.props.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Box className="h-4 w-4 text-primary" />
                      <span className="font-medium text-sm">Props / Attrezzo ({scriptData.props.length})</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {scriptData.props.map((prop, i) => {
                        const propName = typeof prop === 'string' ? prop : prop.name;
                        return (
                          <Badge key={`${propName}-${i}`} variant="outline" className="text-xs">
                            {propName}
                          </Badge>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Subplots */}
                {scriptData.subplots && scriptData.subplots.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <GitBranch className="h-4 w-4 text-primary" />
                      <span className="font-medium text-sm">Subtramas ({scriptData.subplots.length})</span>
                    </div>
                    <div className="space-y-1">
                      {scriptData.subplots.map((subplot, i) => (
                        <div key={i} className="text-xs bg-muted/50 rounded px-2 py-1">
                          <span className="font-medium">{subplot.name}</span>
                          {subplot.description && (
                            <span className="text-muted-foreground ml-1">- {subplot.description}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Scenes from Analysis with Scene Cards Enhancement */}
                {scriptData.scenes && scriptData.scenes.length > 0 && (() => {
                  // Normalize scenes once for consistent data
                  const normalizedScenes = normalizeScenes(scriptData.scenes);
                  const { valid, total, ratio } = countValidSluglines(normalizedScenes);
                  const reliability = getBreakdownReliability(normalizedScenes);
                  
                  return (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Film className="h-4 w-4 text-primary" />
                          <span className="font-medium text-sm">Escenas del Análisis ({total})</span>
                          {/* Completeness indicator */}
                          {reliability === 'reliable' ? (
                            <Badge variant="default" className="bg-green-600 text-xs">
                              ✓ Breakdown fiable ({valid}/{total})
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="bg-amber-500/20 text-amber-600 text-xs">
                              ⚠️ Estimación ({valid}/{total})
                            </Badge>
                          )}
                        </div>
                      </div>
                      <ScrollArea className="h-80 pr-2">
                        <div className="space-y-1">
                          {normalizedScenes.map((scene, i) => {
                            const slugline = getSceneSlugline(scene);
                            const isValidScene = isValidSlugline(slugline);
                            return (
                              <div 
                                key={i} 
                                className={`text-xs rounded px-2 py-1.5 flex items-start gap-2 ${
                                  isValidScene ? 'bg-muted/50' : 'bg-amber-500/10 border border-amber-500/20'
                                }`}
                              >
                                <span className="font-mono text-muted-foreground w-6 flex-shrink-0">
                                  {scene.scene_number || i + 1}
                                </span>
                                <div className="flex-1 min-w-0">
                                  <span className={`font-medium ${!valid ? 'text-amber-600' : ''}`}>
                                    {slugline || 'SIN SLUGLINE'}
                                  </span>
                                  {scene.summary && (
                                    <p className="text-muted-foreground line-clamp-1 mt-0.5">{scene.summary}</p>
                                  )}
                                  {/* Show beat_goal if available */}
                                  {scene.beat_goal && (
                                    <div className="flex items-center gap-1 mt-1 text-muted-foreground">
                                      <Target className="h-3 w-3" />
                                      <span className="line-clamp-1">{scene.beat_goal}</span>
                                    </div>
                                  )}
                                </div>
                                <div className="flex items-center gap-1 flex-shrink-0">
                                  {scene.characters_present && scene.characters_present.length > 0 && (
                                    <Badge variant="outline" className="text-[10px]">
                                      <Users className="h-2.5 w-2.5 mr-0.5" />
                                      {scene.characters_present.length}
                                    </Badge>
                                  )}
                                  {scene.props_used && scene.props_used.length > 0 && (
                                    <Badge variant="outline" className="text-[10px]">
                                      <Package className="h-2.5 w-2.5 mr-0.5" />
                                      {scene.props_used.length}
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </ScrollArea>
                    </div>
                  );
                })()}

                {/* Plot Twists */}
                {scriptData.plot_twists && scriptData.plot_twists.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Zap className="h-4 w-4 text-primary" />
                      <span className="font-medium text-sm">Giros ({scriptData.plot_twists.length})</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {scriptData.plot_twists.map((twist, i) => (
                        <Badge 
                          key={i} 
                          variant={twist.impact === 'paradigm_shift' ? 'destructive' : twist.impact === 'major' ? 'default' : 'secondary'}
                          className="text-xs"
                        >
                          {twist.impact === 'paradigm_shift' ? '💥' : twist.impact === 'major' ? '⚡' : '✨'} {twist.name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </CollapsibleContent>
        </Collapsible>

      {/* Episodes overview - Always visible, collapsed by default */}
      <Collapsible 
        open={expandedSection === 'episodes'} 
        onOpenChange={(open) => setExpandedSection(open ? 'episodes' : null)}
      >
        <CollapsibleTrigger className="flex items-center justify-between w-full p-3 bg-muted/30 rounded-lg hover:bg-muted/50 transition-colors">
          <div className="flex items-center gap-2">
            <Film className="h-4 w-4 text-primary" />
            <span className="font-medium text-sm">
              {projectFormat === 'film' ? 'Actos' : projectFormat === 'short' ? 'Partes' : 'Episodios'} ({scriptData.episodes.length})
            </span>
            {allEpisodesSegmented && (
              <Badge variant="outline" className="text-xs border-green-500/50 text-green-600">
                ✓ Listos
              </Badge>
            )}
          </div>
          {expandedSection === 'episodes' ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </CollapsibleTrigger>
        <CollapsibleContent>
          <ScrollArea className="max-h-64 mt-3">
            <div className="space-y-2">
              {scriptData.episodes.map((episode, idx) => (
                <div 
                  key={idx}
                  className="flex items-center justify-between p-3 bg-background rounded-lg border"
                >
                  <div className="flex-1 min-w-0">
                    {editingEpisodeIndex === idx && canEditTitles ? (
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">
                          {projectFormat === 'film' ? `Acto ${episode.episode_number}` : `Ep. ${episode.episode_number}`}:
                        </span>
                        <Input
                          value={tempTitle}
                          onChange={(e) => setTempTitle(e.target.value)}
                          onBlur={() => saveEpisodeTitle(idx, tempTitle)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveEpisodeTitle(idx, tempTitle);
                            if (e.key === 'Escape') setEditingEpisodeIndex(null);
                          }}
                          className="h-7 text-sm flex-1"
                          autoFocus
                        />
                      </div>
                    ) : (
                      <div 
                        className={`font-medium text-sm truncate ${canEditTitles ? 'cursor-pointer hover:text-primary transition-colors group' : ''}`}
                        onClick={() => {
                          if (canEditTitles) {
                            setTempTitle(episode.title);
                            setEditingEpisodeIndex(idx);
                          }
                        }}
                      >
                        {projectFormat === 'film' ? `Acto ${episode.episode_number}` : `Ep. ${episode.episode_number}`}: {episode.title}
                        {canEditTitles && (
                          <Pencil className="h-3 w-3 inline-block ml-2 opacity-0 group-hover:opacity-50 transition-opacity" />
                        )}
                      </div>
                    )}
                    <div className="flex gap-2 mt-1">
                      <Badge variant="secondary" className="text-xs">
                        {episode.scenes?.length || 0} escenas
                      </Badge>
                      {episode.duration_min && (
                        <Badge variant="outline" className="text-xs">
                          <Clock className="h-3 w-3 mr-1" />
                          {episode.duration_min} min
                        </Badge>
                      )}
                    </div>
                  </div>
                  {segmentedEpisodes.has(episode.episode_number) && (
                    <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        </CollapsibleContent>
      </Collapsible>

      {/* Teasers - Simplified */}
      {hasTeasers && (
        <div className="grid grid-cols-2 gap-2">
          {scriptData.teasers?.teaser60 && (
            <div className="p-2 bg-amber-500/10 rounded-lg border border-amber-500/30 flex items-center justify-between">
              <Badge className="bg-amber-500 text-xs">Teaser 60s</Badge>
              {segmentedEpisodes.has(-1) && <Check className="h-4 w-4 text-green-500" />}
            </div>
          )}
          {scriptData.teasers?.teaser30 && (
            <div className="p-2 bg-red-500/10 rounded-lg border border-red-500/30 flex items-center justify-between">
              <Badge className="bg-red-500 text-xs">Teaser 30s</Badge>
              {segmentedEpisodes.has(-2) && <Check className="h-4 w-4 text-green-500" />}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
