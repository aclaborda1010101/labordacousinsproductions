/**
 * ScriptSummaryPanelAssisted - Simplified summary for ASSISTED mode
 * Shows episodes, teasers, characters, locations with export to Bible
 * Generates scenes + shots automatically with clear messaging
 * Supports background task execution for all generation processes
 */

import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { useBackgroundTasks } from '@/contexts/BackgroundTasksContext';
import {
  Film,
  ChevronDown,
  ChevronUp,
  Loader2,
  CheckCircle,
  Scissors,
  FileDown,
  Clock,
  Users,
  MapPin,
  Video,
  Clapperboard,
  Play,
  Sparkles,
  ArrowRight,
  Box,
  Download,
  Check,
  AlertCircle,
  Bell,
  Crown,
  Skull,
  UserCheck,
  UserPlus,
  Star,
  Users2,
  GitBranch,
  Zap,
} from 'lucide-react';
import { exportScreenplayPDF } from '@/lib/exportScreenplayPDF';

interface ScriptSummaryPanelAssistedProps {
  projectId: string;
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
  onScenesGenerated,
  onEntitiesExtracted 
}: ScriptSummaryPanelAssistedProps) {
  const navigate = useNavigate();
  const { addTask, updateTask, completeTask, failTask, setIsOpen } = useBackgroundTasks();
  const [loading, setLoading] = useState(true);
  const [scriptData, setScriptData] = useState<ScriptData | null>(null);
  const [segmenting, setSegmenting] = useState(false);
  const [segmentProgress, setSegmentProgress] = useState({ current: 0, total: 0, phase: '' });
  const [segmentedEpisodes, setSegmentedEpisodes] = useState<Set<number>>(new Set());
  const [extractingEntities, setExtractingEntities] = useState(false);
  const [entitiesExtracted, setEntitiesExtracted] = useState(false);
  const [expandedSection, setExpandedSection] = useState<string | null>('episodes');
  const [runningInBackground, setRunningInBackground] = useState(false);

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

  // Export PDF
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
      toast.success('PDF exportado');
    } catch (err) {
      toast.error('Error al exportar PDF');
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
    <div className="space-y-6">
      {/* Header Card - Overview */}
      <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <CardTitle className="text-2xl flex items-center gap-3">
                <div className="p-2 bg-primary/20 rounded-lg">
                  <Film className="h-6 w-6 text-primary" />
                </div>
                {scriptData.title}
              </CardTitle>
              <CardDescription className="mt-2 text-base">
                {scriptData.synopsis?.slice(0, 200) || 'Tu proyecto está listo para producción'}
                {(scriptData.synopsis?.length || 0) > 200 && '...'}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        
        <CardContent>
          {/* Quick stats */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
            <div className="p-4 bg-background/50 rounded-xl text-center">
              <div className="text-3xl font-bold text-primary">{scriptData.episodes.length}</div>
              <div className="text-sm text-muted-foreground">Episodios</div>
            </div>
            <div className="p-4 bg-background/50 rounded-xl text-center">
              <div className="text-3xl font-bold text-primary">{totalScenes}</div>
              <div className="text-sm text-muted-foreground">Escenas</div>
            </div>
            <div className="p-4 bg-background/50 rounded-xl text-center">
              <div className="text-3xl font-bold text-primary">{scriptData.characters?.length || 0}</div>
              <div className="text-sm text-muted-foreground flex items-center justify-center gap-1">
                <Users className="h-3 w-3" /> Personajes
              </div>
            </div>
            <div className="p-4 bg-background/50 rounded-xl text-center">
              <div className="text-3xl font-bold text-primary">{scriptData.locations?.length || 0}</div>
              <div className="text-sm text-muted-foreground flex items-center justify-center gap-1">
                <MapPin className="h-3 w-3" /> Localizaciones
              </div>
            </div>
            <div className="p-4 bg-background/50 rounded-xl text-center">
              <div className="text-3xl font-bold text-primary">{scriptData.props?.length || 0}</div>
              <div className="text-sm text-muted-foreground flex items-center justify-center gap-1">
                <Box className="h-3 w-3" /> Props
              </div>
            </div>
          </div>

          {/* Export actions */}
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={handleExportPDF}>
              <FileDown className="h-4 w-4 mr-2" />
              Descargar Guion PDF
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Step 1: Export to Bible */}
      <Card className={entitiesExtracted ? 'border-green-500/50 bg-green-500/5' : ''}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${entitiesExtracted ? 'bg-green-500/20' : 'bg-muted'}`}>
                {entitiesExtracted ? (
                  <CheckCircle className="h-5 w-5 text-green-500" />
                ) : (
                  <span className="text-lg font-bold text-muted-foreground">1</span>
                )}
              </div>
              <div>
                <CardTitle className="text-lg">Exportar a la Biblia</CardTitle>
                <CardDescription>
                  Añade personajes, localizaciones y props detectados a tu proyecto
                </CardDescription>
              </div>
            </div>
            {!entitiesExtracted && (
              <Button onClick={extractEntitiesToBible} disabled={extractingEntities}>
                {extractingEntities ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Download className="h-4 w-4 mr-2" />
                )}
                Exportar a Biblia
              </Button>
            )}
          </div>
        </CardHeader>
        
        <CardContent>
          {/* Characters - Categorized */}
          {scriptData.characters && scriptData.characters.length > 0 && (() => {
            const protagonists = scriptData.characters.filter(c => c.role === 'protagonist');
            const antagonists = scriptData.characters.filter(c => c.role === 'antagonist');
            const supporting = scriptData.characters.filter(c => c.role === 'supporting');
            const recurring = scriptData.characters.filter(c => c.role === 'recurring');
            const collectiveEntities = scriptData.characters.filter(c => 
              c.role === 'collective_entity' || c.entity_type === 'collective' || c.entity_type === 'civilization'
            );
            const others = scriptData.characters.filter(c => 
              !['protagonist', 'antagonist', 'supporting', 'recurring', 'collective_entity'].includes(c.role || '') &&
              !['collective', 'civilization'].includes(c.entity_type || '')
            );
            
            return (
              <div className="mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <Users className="h-4 w-4 text-primary" />
                  <span className="font-medium text-sm">Personajes detectados ({scriptData.characters.length})</span>
                </div>
                <div className="space-y-2">
                  {/* Protagonists */}
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
                  {/* Antagonists */}
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
                  {/* Supporting */}
                  {supporting.length > 0 && (
                    <div className="flex flex-wrap gap-1 items-center">
                      <span className="text-xs text-muted-foreground flex items-center gap-1 mr-1">
                        <UserCheck className="h-3 w-3" /> Secundarios:
                      </span>
                      {supporting.slice(0, 8).map((char, i) => (
                        <Badge key={i} variant="secondary" className="text-xs">{char.name}</Badge>
                      ))}
                      {supporting.length > 8 && <Badge variant="outline" className="text-xs">+{supporting.length - 8}</Badge>}
                    </div>
                  )}
                  {/* Collective Entities */}
                  {collectiveEntities.length > 0 && (
                    <div className="flex flex-wrap gap-1 items-center">
                      <span className="text-xs text-muted-foreground flex items-center gap-1 mr-1">
                        <Users2 className="h-3 w-3" /> Colectivos:
                      </span>
                      {collectiveEntities.slice(0, 6).map((char, i) => (
                        <Badge key={i} variant="outline" className="text-xs border-primary/50">{char.name}</Badge>
                      ))}
                      {collectiveEntities.length > 6 && <Badge variant="outline" className="text-xs">+{collectiveEntities.length - 6}</Badge>}
                    </div>
                  )}
                  {/* Others (cameos, extras, etc.) */}
                  {others.length > 0 && (
                    <div className="flex flex-wrap gap-1 items-center">
                      <span className="text-xs text-muted-foreground mr-1">Otros:</span>
                      {others.slice(0, 6).map((char, i) => (
                        <Badge key={i} variant="outline" className="text-xs">{char.name}</Badge>
                      ))}
                      {others.length > 6 && <Badge variant="outline" className="text-xs">+{others.length - 6}</Badge>}
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Locations */}
          {scriptData.locations && scriptData.locations.length > 0 && (
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-2">
                <MapPin className="h-4 w-4 text-primary" />
                <span className="font-medium text-sm">Localizaciones detectadas ({scriptData.locations.length})</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {scriptData.locations.slice(0, 12).map((loc, i) => (
                  <Badge key={i} variant="outline">
                    {loc.name}
                  </Badge>
                ))}
                {scriptData.locations.length > 12 && (
                  <Badge variant="secondary">+{scriptData.locations.length - 12} más</Badge>
                )}
              </div>
            </div>
          )}

          {/* Subplots */}
          {scriptData.subplots && scriptData.subplots.length > 0 && (
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-2">
                <GitBranch className="h-4 w-4 text-primary" />
                <span className="font-medium text-sm">Subtramas ({scriptData.subplots.length})</span>
              </div>
              <div className="space-y-1">
                {scriptData.subplots.slice(0, 4).map((subplot, i) => (
                  <div key={i} className="text-xs bg-muted/50 rounded px-2 py-1">
                    <span className="font-medium">{subplot.name}</span>
                    {subplot.description && (
                      <span className="text-muted-foreground ml-1">- {subplot.description.slice(0, 80)}{subplot.description.length > 80 ? '...' : ''}</span>
                    )}
                  </div>
                ))}
                {scriptData.subplots.length > 4 && (
                  <span className="text-xs text-muted-foreground">+{scriptData.subplots.length - 4} más</span>
                )}
              </div>
            </div>
          )}

          {/* Plot Twists */}
          {scriptData.plot_twists && scriptData.plot_twists.length > 0 && (
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="h-4 w-4 text-primary" />
                <span className="font-medium text-sm">Giros narrativos ({scriptData.plot_twists.length})</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {scriptData.plot_twists.slice(0, 5).map((twist, i) => (
                  <Badge 
                    key={i} 
                    variant={twist.impact === 'paradigm_shift' ? 'destructive' : twist.impact === 'major' ? 'default' : 'secondary'}
                    className="text-xs"
                  >
                    {twist.impact === 'paradigm_shift' ? '💥' : twist.impact === 'major' ? '⚡' : '✨'} {twist.name}
                  </Badge>
                ))}
                {scriptData.plot_twists.length > 5 && (
                  <Badge variant="outline" className="text-xs">+{scriptData.plot_twists.length - 5} más</Badge>
                )}
              </div>
            </div>
          )}

          {/* Props */}
          {scriptData.props && scriptData.props.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Box className="h-4 w-4 text-primary" />
                <span className="font-medium text-sm">Props detectados ({scriptData.props.length})</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {scriptData.props.slice(0, 8).map((prop, i) => (
                  <Badge key={i} variant="outline" className="text-xs">
                    {typeof prop === 'string' ? prop : prop.name}
                  </Badge>
                ))}
                {scriptData.props.length > 8 && (
                  <Badge variant="secondary">+{scriptData.props.length - 8} más</Badge>
                )}
              </div>
            </div>
          )}

          {entitiesExtracted && (
            <div className="mt-4 flex items-center gap-2 text-green-600">
              <Check className="h-4 w-4" />
              <span className="text-sm">Elementos exportados correctamente</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Step 2: Generate Scenes & Shots */}
      <Card className={allSegmented ? 'border-green-500/50 bg-green-500/5' : ''}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${allSegmented ? 'bg-green-500/20' : 'bg-muted'}`}>
                {allSegmented ? (
                  <CheckCircle className="h-5 w-5 text-green-500" />
                ) : (
                  <span className="text-lg font-bold text-muted-foreground">2</span>
                )}
              </div>
              <div>
                <CardTitle className="text-lg">Preparar Producción</CardTitle>
                <CardDescription>
                  Genera automáticamente escenas, planos, transiciones y configuración técnica
                </CardDescription>
              </div>
            </div>
            {!allSegmented ? (
              <div className="flex gap-2">
                <Button 
                  onClick={() => generateAllScenesAndShots(false)}
                  disabled={segmenting || runningInBackground}
                  className="gap-2"
                >
                  {segmenting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  Generar Todo
                </Button>
                <Button 
                  variant="outline"
                  onClick={() => generateAllScenesAndShots(true)}
                  disabled={segmenting || runningInBackground}
                  className="gap-2"
                  title="Ejecutar en segundo plano"
                >
                  <Bell className="h-4 w-4" />
                  En segundo plano
                </Button>
              </div>
            ) : (
              <Button 
                onClick={() => navigate(`/projects/${projectId}/scenes`)}
                className="gap-2"
              >
                <Play className="h-4 w-4" />
                Ir a Producción
              </Button>
            )}
          </div>
        </CardHeader>
        
        <CardContent>
          {/* Progress indicator */}
          {segmenting && segmentProgress.total > 0 && (
            <div className="mb-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span>{segmentProgress.phase}</span>
                <span>{segmentProgress.current}/{segmentProgress.total}</span>
              </div>
              <Progress value={(segmentProgress.current / segmentProgress.total) * 100} />
            </div>
          )}

          {/* Info about what gets generated */}
          {!allSegmented && !segmenting && (
            <div className="p-4 bg-muted/30 rounded-lg mb-4">
              <div className="flex items-start gap-3">
                <Sparkles className="h-5 w-5 text-primary mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium mb-1">La IA generará automáticamente:</p>
                  <ul className="text-muted-foreground space-y-1">
                    <li>• Escenas con sluglines y descripciones</li>
                    <li>• Shots con tipos de plano y composición</li>
                    <li>• Movimientos de cámara y transiciones</li>
                    <li>• Configuración de lentes y iluminación</li>
                    <li>• Distribución de diálogos por plano</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Episodes overview */}
          <Collapsible 
            open={expandedSection === 'episodes'} 
            onOpenChange={(open) => setExpandedSection(open ? 'episodes' : null)}
          >
            <CollapsibleTrigger className="flex items-center justify-between w-full p-3 bg-muted/30 rounded-lg hover:bg-muted/50 transition-colors">
              <div className="flex items-center gap-2">
                <Film className="h-4 w-4 text-primary" />
                <span className="font-medium">Episodios ({scriptData.episodes.length})</span>
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
                      <div className="flex-1">
                        <div className="font-medium text-sm">
                          Ep. {episode.episode_number}: {episode.title}
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
                        <Badge className="bg-green-600">
                          <Check className="h-3 w-3 mr-1" />
                          Listo
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CollapsibleContent>
          </Collapsible>

          {/* Teasers */}
          {hasTeasers && (
            <div className="mt-4 grid md:grid-cols-2 gap-3">
              {scriptData.teasers?.teaser60 && (
                <div className="p-3 bg-amber-500/10 rounded-lg border border-amber-500/30">
                  <div className="flex items-center justify-between mb-2">
                    <Badge className="bg-amber-500">Teaser 60s</Badge>
                    {segmentedEpisodes.has(-1) && (
                      <Check className="h-4 w-4 text-green-500" />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground italic">
                    "{scriptData.teasers.teaser60.logline?.slice(0, 80)}..."
                  </p>
                </div>
              )}
              {scriptData.teasers?.teaser30 && (
                <div className="p-3 bg-red-500/10 rounded-lg border border-red-500/30">
                  <div className="flex items-center justify-between mb-2">
                    <Badge className="bg-red-500">Teaser 30s</Badge>
                    {segmentedEpisodes.has(-2) && (
                      <Check className="h-4 w-4 text-green-500" />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground italic">
                    "{scriptData.teasers.teaser30.logline?.slice(0, 80)}..."
                  </p>
                </div>
              )}
            </div>
          )}

          {allSegmented && (
            <div className="mt-4 flex items-center gap-2 text-green-600">
              <CheckCircle className="h-4 w-4" />
              <span className="text-sm">¡Todo listo! Tu proyecto tiene escenas y shots configurados</span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
