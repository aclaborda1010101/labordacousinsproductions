/**
 * ScriptSummaryPanelAssisted - Simplified summary for ASSISTED mode
 * Shows episodes, teasers, characters, locations with export to Bible
 * Generates scenes + shots automatically with clear messaging
 * Supports background task execution for all generation processes
 * 
 * v2: Simplified UI with NextStepIndicator and fewer duplicate buttons
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Progress } from '@/components/ui/progress';
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
} from 'lucide-react';
import { exportScreenplayPDF } from '@/lib/exportScreenplayPDF';
import { exportBibleSummaryPDF } from '@/lib/exportBibleSummaryPDF';
import { exportOutlinePDF } from '@/lib/exportOutlinePDF';
import { useCreativeModeOptional } from '@/contexts/CreativeModeContext';

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
  locations?: LocationData[];
  props?: any[];
  subplots?: SubplotData[];
  plot_twists?: PlotTwistData[];
  counts?: {
    total_scenes?: number;
    total_dialogue_lines?: number;
  };
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
        setScriptData({
          id: script.id,
          title: parsed.title || 'Guion',
          synopsis: parsed.synopsis || parsed.logline,
          episodes: parsed.episodes || [],
          teasers: parsed.teasers,
          characters: parsed.characters || parsed.main_characters || [],
          locations: parsed.locations || parsed.main_locations || [],
          props: parsed.props || [],
          subplots: parsed.subplots || [],
          plot_twists: parsed.plot_twists || [],
          counts: parsed.counts,
        });
      }

      // Check existing entities in Bible
      const [{ count: charCount }, { count: locCount }] = await Promise.all([
        supabase.from('characters').select('*', { count: 'exact', head: true }).eq('project_id', projectId),
        supabase.from('locations').select('*', { count: 'exact', head: true }).eq('project_id', projectId),
      ]);
      
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

  // Extract entities to Bible
  const extractEntitiesToBible = async () => {
    if (!scriptData) return;
    
    setExtractingEntities(true);
    try {
      // Insert characters
      if (scriptData.characters?.length) {
        for (const char of scriptData.characters) {
          await supabase.from('characters').upsert({
            project_id: projectId,
            name: char.name,
            role: char.role || char.description || null,
            bio: char.description || null,
          }, { onConflict: 'project_id,name', ignoreDuplicates: true });
        }
      }

      // Insert locations
      if (scriptData.locations?.length) {
        for (const loc of scriptData.locations) {
          await supabase.from('locations').upsert({
            project_id: projectId,
            name: loc.name,
            description: loc.description || loc.type || null,
          }, { onConflict: 'project_id,name', ignoreDuplicates: true });
        }
      }

      // Insert props if available
      if (scriptData.props?.length) {
        for (const prop of scriptData.props) {
          await supabase.from('props').upsert({
            project_id: projectId,
            name: typeof prop === 'string' ? prop : prop.name,
            description: typeof prop === 'object' ? prop.description : null,
          }, { onConflict: 'project_id,name', ignoreDuplicates: true });
        }
      }

      setEntitiesExtracted(true);
      toast.success('Elementos añadidos a la Biblia');
      onEntitiesExtracted?.();
    } catch (err) {
      console.error('Error extracting entities:', err);
      toast.error('Error al exportar elementos');
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

  // Export script PDF
  const handleExportPDF = () => {
    if (!scriptData) return;
    try {
      exportScreenplayPDF({
        title: scriptData.title,
        synopsis: scriptData.synopsis,
        episodes: scriptData.episodes as any[],
        characters: scriptData.characters,
        locations: scriptData.locations,
      });
      toast.success('Guion PDF exportado');
    } catch (err) {
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
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex-1 min-w-0">
              <CardTitle className="text-xl flex items-center gap-3">
                <div className="p-2 bg-primary/20 rounded-lg flex-shrink-0">
                  <Film className="h-5 w-5 text-primary" />
                </div>
                <span className="truncate">{scriptData.title}</span>
              </CardTitle>
              {scriptData.synopsis && (
                <CardDescription className="mt-2 line-clamp-2">
                  {scriptData.synopsis}
                </CardDescription>
              )}
            </div>
            
            {/* Consolidated Export Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <FileDown className="h-4 w-4" />
                  Exportar
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
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
        
        <CardContent className="pt-0">
          {/* Quick stats - More compact */}
          <div className="grid grid-cols-5 gap-2">
            <div className="p-3 bg-background/50 rounded-lg text-center">
              <div className="text-2xl font-bold text-primary">{scriptData.episodes.length}</div>
              <div className="text-xs text-muted-foreground">
                {projectFormat === 'film' ? 'Actos' : projectFormat === 'short' ? 'Partes' : 'Eps'}
              </div>
            </div>
            <div className="p-3 bg-background/50 rounded-lg text-center">
              <div className="text-2xl font-bold text-primary">{totalScenes}</div>
              <div className="text-xs text-muted-foreground">Escenas</div>
            </div>
            <div className="p-3 bg-background/50 rounded-lg text-center">
              <div className="text-2xl font-bold text-primary">{scriptData.characters?.length || 0}</div>
              <div className="text-xs text-muted-foreground">Personajes</div>
            </div>
            <div className="p-3 bg-background/50 rounded-lg text-center">
              <div className="text-2xl font-bold text-primary">{scriptData.locations?.length || 0}</div>
              <div className="text-xs text-muted-foreground">Locs</div>
            </div>
            <div className="p-3 bg-background/50 rounded-lg text-center">
              <div className="text-2xl font-bold text-primary">{scriptData.props?.length || 0}</div>
              <div className="text-xs text-muted-foreground">Props</div>
            </div>
          </div>
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
                  {scriptData.characters?.length || 0} personajes, {scriptData.locations?.length || 0} localizaciones
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
        </div>
      )}

      {/* Collapsible Details - Only for PRO/DIRECTOR modes */}
      {effectiveMode !== 'ASSISTED' && (
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
                {/* Characters - Categorized */}
                {scriptData.characters && scriptData.characters.length > 0 && (() => {
                  const protagonists = scriptData.characters.filter(c => c.role === 'protagonist');
                  const antagonists = scriptData.characters.filter(c => c.role === 'antagonist');
                  const supporting = scriptData.characters.filter(c => c.role === 'supporting');
                  const collectiveEntities = scriptData.characters.filter(c => 
                    c.role === 'collective_entity' || c.entity_type === 'collective' || c.entity_type === 'civilization'
                  );
                  const others = scriptData.characters.filter(c => 
                    !['protagonist', 'antagonist', 'supporting', 'recurring', 'collective_entity'].includes(c.role || '') &&
                    !['collective', 'civilization'].includes(c.entity_type || '')
                  );
                  
                  return (
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <Users className="h-4 w-4 text-primary" />
                        <span className="font-medium text-sm">Personajes ({scriptData.characters.length})</span>
                      </div>
                      <div className="space-y-2">
                        {protagonists.length > 0 && (
                          <div className="flex flex-wrap gap-1 items-center">
                            <span className="text-xs text-muted-foreground flex items-center gap-1 mr-1">
                              <Crown className="h-3 w-3" /> Protagonistas:
                            </span>
                            {protagonists.map((char, i) => (
                              <Badge key={i} variant="default" className="text-xs">{char.name}</Badge>
                            ))}
                          </div>
                        )}
                        {antagonists.length > 0 && (
                          <div className="flex flex-wrap gap-1 items-center">
                            <span className="text-xs text-muted-foreground flex items-center gap-1 mr-1">
                              <Skull className="h-3 w-3" /> Antagonistas:
                            </span>
                            {antagonists.map((char, i) => (
                              <Badge key={i} variant="destructive" className="text-xs">{char.name}</Badge>
                            ))}
                          </div>
                        )}
                        {supporting.length > 0 && (
                          <div className="flex flex-wrap gap-1 items-center">
                            <span className="text-xs text-muted-foreground mr-1">Secundarios:</span>
                            {supporting.map((char, i) => (
                              <Badge key={i} variant="secondary" className="text-xs">{char.name}</Badge>
                            ))}
                          </div>
                        )}
                        {collectiveEntities.length > 0 && (
                          <div className="flex flex-wrap gap-1 items-center">
                            <span className="text-xs text-muted-foreground mr-1">Colectivos:</span>
                            {collectiveEntities.map((char, i) => (
                              <Badge key={i} variant="outline" className="text-xs">{char.name}</Badge>
                            ))}
                          </div>
                        )}
                        {others.length > 0 && (
                          <div className="flex flex-wrap gap-1 items-center">
                            <span className="text-xs text-muted-foreground mr-1">Otros:</span>
                            {others.map((char, i) => (
                              <Badge key={i} variant="outline" className="text-xs">{char.name}</Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* Locations */}
                {scriptData.locations && scriptData.locations.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <MapPin className="h-4 w-4 text-primary" />
                      <span className="font-medium text-sm">Localizaciones ({scriptData.locations.length})</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {scriptData.locations.map((loc, i) => (
                        <Badge key={i} variant="outline" className="text-xs">{loc.name}</Badge>
                      ))}
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
      )}

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
                    <div className="font-medium text-sm truncate">
                      {projectFormat === 'film' ? `Acto ${episode.episode_number}` : `Ep. ${episode.episode_number}`}: {episode.title}
                    </div>
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
