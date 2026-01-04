/**
 * ScriptSummaryPanel - Shows episodes/teasers from saved script with actions
 * Allows generating scenes, exporting PDFs, and navigating to scene production
 */

import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
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
  RefreshCw,
  Play,
  Crown,
  Skull,
  UserCheck,
  Star,
  Zap,
  GitBranch,
  Package,
  Sparkles,
} from 'lucide-react';
import { exportScreenplayPDF, exportEpisodeScreenplayPDF, exportTeaserPDF } from '@/lib/exportScreenplayPDF';

interface ScriptSummaryPanelProps {
  projectId: string;
  onScenesGenerated?: () => void;
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
  characters?: any[];
  locations?: any[];
  props?: any[];
  subplots?: any[];
  plot_twists?: any[];
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

export function ScriptSummaryPanel({ projectId, onScenesGenerated }: ScriptSummaryPanelProps) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [scriptData, setScriptData] = useState<ScriptData | null>(null);
  const [expandedEpisodes, setExpandedEpisodes] = useState<Record<number, boolean>>({});
  const [segmenting, setSegmenting] = useState(false);
  const [segmentedEpisodes, setSegmentedEpisodes] = useState<Set<number>>(new Set());

  // Load script and check which episodes already have scenes
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
          characters: parsed.characters || parsed.main_characters,
          locations: parsed.locations || parsed.main_locations,
          props: parsed.props || parsed.main_props || [],
          subplots: parsed.subplots || [],
          plot_twists: parsed.plot_twists || [],
          counts: parsed.counts,
        });
      }

      // Check which episodes have scenes already
      const { data: scenes } = await supabase
        .from('scenes')
        .select('episode_no')
        .eq('project_id', projectId);

      if (scenes) {
        const episodesWithScenes = new Set(scenes.map(s => s.episode_no));
        setSegmentedEpisodes(episodesWithScenes);
      }

      setLoading(false);
    };

    loadData();
  }, [projectId]);

  // Generate scenes for an episode
  const generateScenesForEpisode = async (episode: EpisodeData) => {
    setSegmenting(true);
    try {
      toast.info(`Generando escenas para Episodio ${episode.episode_number}...`);
      
      const { error } = await supabase.functions.invoke('generate-scenes', {
        body: {
          projectId,
          episodeNo: episode.episode_number,
          synopsis: episode.synopsis || episode.title,
          sceneCount: episode.scenes?.length || 8,
        }
      });

      if (error) throw error;

      setSegmentedEpisodes(prev => new Set([...prev, episode.episode_number]));
      toast.success(`Escenas del Episodio ${episode.episode_number} generadas`);
      onScenesGenerated?.();
    } catch (err) {
      console.error('Error generating scenes:', err);
      toast.error('Error al generar escenas');
    } finally {
      setSegmenting(false);
    }
  };

  // Generate scenes for all episodes
  const generateAllScenes = async () => {
    if (!scriptData?.episodes?.length) return;
    
    setSegmenting(true);
    try {
      for (const episode of scriptData.episodes) {
        if (!segmentedEpisodes.has(episode.episode_number)) {
          toast.info(`Generando escenas para Episodio ${episode.episode_number}...`);
          
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
            toast.error(`Error en Episodio ${episode.episode_number}`);
          } else {
            setSegmentedEpisodes(prev => new Set([...prev, episode.episode_number]));
          }
        }
      }
      
      toast.success('Todas las escenas generadas');
      onScenesGenerated?.();
    } catch (err) {
      console.error('Error generating all scenes:', err);
      toast.error('Error al generar escenas');
    } finally {
      setSegmenting(false);
    }
  };

  // Generate teaser scenes
  const generateTeaserScenes = async (teaserType: '60s' | '30s') => {
    if (!scriptData?.teasers) return;
    
    const teaser = teaserType === '60s' ? scriptData.teasers.teaser60 : scriptData.teasers.teaser30;
    if (!teaser) return;

    const episodeNo = teaserType === '60s' ? -1 : -2;
    
    setSegmenting(true);
    try {
      toast.info(`Generando escenas para Teaser ${teaserType}...`);
      
      const { error } = await supabase.functions.invoke('generate-scenes', {
        body: {
          projectId,
          episodeNo,
          synopsis: `TEASER ${teaserType}: ${teaser.logline}. ${teaser.scenes?.map((s: any) => s.description).join(' ')}`,
          sceneCount: teaser.scenes?.length || (teaserType === '60s' ? 6 : 4),
          isTeaser: true,
          teaserType,
          teaserData: teaser
        }
      });

      if (error) throw error;

      setSegmentedEpisodes(prev => new Set([...prev, episodeNo]));
      toast.success(`Escenas del Teaser ${teaserType} generadas`);
      onScenesGenerated?.();
    } catch (err) {
      console.error('Error generating teaser scenes:', err);
      toast.error('Error al generar escenas del teaser');
    } finally {
      setSegmenting(false);
    }
  };

  // Export episode PDF
  const handleExportEpisodePDF = (episode: EpisodeData, episodeIndex: number) => {
    if (!scriptData) return;
    try {
      // Build screenplay data for export
      const screenplayForExport = {
        title: scriptData.title,
        synopsis: scriptData.synopsis,
        episodes: scriptData.episodes as any[],
        characters: scriptData.characters,
        locations: scriptData.locations,
      };
      exportEpisodeScreenplayPDF(screenplayForExport, episodeIndex);
      toast.success('PDF exportado');
    } catch (err) {
      toast.error('Error al exportar PDF');
    }
  };

  // Export complete PDF
  const handleExportCompletePDF = () => {
    if (!scriptData) return;
    try {
      // Convert to expected format
      exportScreenplayPDF({
        title: scriptData.title,
        synopsis: scriptData.synopsis,
        episodes: scriptData.episodes as any[],
        characters: scriptData.characters,
        locations: scriptData.locations,
      });
      toast.success('PDF completo exportado');
    } catch (err) {
      toast.error('Error al exportar PDF');
    }
  };

  // Export teaser PDF
  const handleExportTeaserPDF = (teaserType?: '60' | '30') => {
    if (!scriptData?.teasers) return;
    try {
      // Convert to expected format with required fields
      const teaserData: any = {};
      if (scriptData.teasers.teaser60) {
        teaserData.teaser60 = {
          ...scriptData.teasers.teaser60,
          duration_sec: 60,
        };
      }
      if (scriptData.teasers.teaser30) {
        teaserData.teaser30 = {
          ...scriptData.teasers.teaser30,
          duration_sec: 30,
        };
      }
      exportTeaserPDF(scriptData.title, teaserData, teaserType ? { teaserType } : undefined);
      toast.success('PDF de teaser exportado');
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

  if (!scriptData || !scriptData.episodes?.length) {
    return null;
  }

  const totalScenes = scriptData.counts?.total_scenes || 
    scriptData.episodes.reduce((sum, ep) => sum + (ep.scenes?.length || 0), 0);
  const allSegmented = scriptData.episodes.every(ep => segmentedEpisodes.has(ep.episode_number));

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Film className="h-5 w-5 text-primary" />
                {scriptData.title}
              </CardTitle>
              <CardDescription>
                {scriptData.episodes.length} episodio(s) • {totalScenes} escenas totales
              </CardDescription>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={handleExportCompletePDF}>
                <FileDown className="h-4 w-4 mr-2" />
                Exportar PDF
              </Button>
              {!allSegmented && (
                <Button 
                  size="sm" 
                  onClick={generateAllScenes}
                  disabled={segmenting}
                >
                  {segmenting ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Scissors className="h-4 w-4 mr-2" />
                  )}
                  Generar Todas las Escenas
                </Button>
              )}
              {allSegmented && (
                <Button 
                  size="sm"
                  onClick={() => navigate(`/projects/${projectId}/scenes`)}
                >
                  <Play className="h-4 w-4 mr-2" />
                  Ir a Producción
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        
        {/* Quick stats */}
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-3 bg-muted/30 rounded-lg text-center">
              <div className="text-2xl font-bold text-primary">{scriptData.episodes.length}</div>
              <div className="text-xs text-muted-foreground">Episodios</div>
            </div>
            <div className="p-3 bg-muted/30 rounded-lg text-center">
              <div className="text-2xl font-bold text-primary">{totalScenes}</div>
              <div className="text-xs text-muted-foreground">Escenas</div>
            </div>
            <div className="p-3 bg-muted/30 rounded-lg text-center">
              <div className="text-2xl font-bold text-primary">{scriptData.characters?.length || 0}</div>
              <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                <Users className="h-3 w-3" /> Personajes
              </div>
            </div>
            <div className="p-3 bg-muted/30 rounded-lg text-center">
              <div className="text-2xl font-bold text-primary">{scriptData.locations?.length || 0}</div>
              <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                <MapPin className="h-3 w-3" /> Localizaciones
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Teasers Section */}
      {scriptData.teasers && (scriptData.teasers.teaser60 || scriptData.teasers.teaser30) && (
        <Card className="border-amber-500/50">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Clapperboard className="h-5 w-5 text-amber-500" />
              Teasers Promocionales
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-4">
              {/* Teaser 60s */}
              {scriptData.teasers.teaser60 && (
                <Card className="bg-gradient-to-br from-amber-500/10 to-orange-500/10">
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between mb-2">
                      <Badge variant="outline" className="bg-amber-500/20">60 segundos</Badge>
                      <Badge variant="secondary">
                        {scriptData.teasers.teaser60.scenes?.length || 0} planos
                      </Badge>
                    </div>
                    <p className="text-sm italic mb-4">
                      "{scriptData.teasers.teaser60.logline}"
                    </p>
                    <div className="flex gap-2">
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => handleExportTeaserPDF('60')}
                      >
                        <FileDown className="h-3 w-3 mr-1" />
                        PDF
                      </Button>
                      <Button 
                        size="sm"
                        onClick={() => generateTeaserScenes('60s')}
                        disabled={segmenting || segmentedEpisodes.has(-1)}
                      >
                        {segmentedEpisodes.has(-1) ? (
                          <>
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Generado
                          </>
                        ) : (
                          <>
                            <Clapperboard className="h-3 w-3 mr-1" />
                            Generar Escenas
                          </>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Teaser 30s */}
              {scriptData.teasers.teaser30 && (
                <Card className="bg-gradient-to-br from-red-500/10 to-pink-500/10">
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between mb-2">
                      <Badge variant="outline" className="bg-red-500/20">30 segundos</Badge>
                      <Badge variant="secondary">
                        {scriptData.teasers.teaser30.scenes?.length || 0} planos
                      </Badge>
                    </div>
                    <p className="text-sm italic mb-4">
                      "{scriptData.teasers.teaser30.logline}"
                    </p>
                    <div className="flex gap-2">
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => handleExportTeaserPDF('30')}
                      >
                        <FileDown className="h-3 w-3 mr-1" />
                        PDF
                      </Button>
                      <Button 
                        size="sm"
                        onClick={() => generateTeaserScenes('30s')}
                        disabled={segmenting || segmentedEpisodes.has(-2)}
                      >
                        {segmentedEpisodes.has(-2) ? (
                          <>
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Generado
                          </>
                        ) : (
                          <>
                            <Clapperboard className="h-3 w-3 mr-1" />
                            Generar Escenas
                          </>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Characters Section with Roles */}
      {scriptData.characters && scriptData.characters.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              Personajes ({scriptData.characters.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {(() => {
                const protagonists = scriptData.characters.filter(c => c.role === 'protagonist' || c.character_role === 'protagonist');
                const antagonists = scriptData.characters.filter(c => c.role === 'antagonist' || c.character_role === 'antagonist');
                const supporting = scriptData.characters.filter(c => c.role === 'supporting' || c.character_role === 'supporting');
                const recurring = scriptData.characters.filter(c => c.role === 'recurring' || c.character_role === 'recurring');
                const collective = scriptData.characters.filter(c => c.role === 'collective_entity' || c.character_role === 'collective_entity');
                const others = scriptData.characters.filter(c => 
                  !['protagonist', 'antagonist', 'supporting', 'recurring', 'collective_entity'].includes(c.role || c.character_role || '')
                );

                const renderGroup = (chars: any[], label: string, Icon: any, variant: 'default' | 'destructive' | 'secondary' | 'outline' = 'secondary') => (
                  chars.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4" />
                        <span className="text-sm font-medium">{label} ({chars.length})</span>
                      </div>
                      <div className="grid gap-2 pl-6">
                        {chars.map((char, i) => (
                          <div key={i} className="p-2 bg-muted/30 rounded-lg">
                            <div className="flex items-center gap-2 mb-1">
                              <Badge variant={variant}>{char.name}</Badge>
                              {char.role && <span className="text-xs text-muted-foreground">({char.role})</span>}
                            </div>
                            {char.description && (
                              <p className="text-xs text-muted-foreground">{char.description}</p>
                            )}
                            {char.bio && !char.description && (
                              <p className="text-xs text-muted-foreground">{char.bio}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                );

                return (
                  <>
                    {renderGroup(protagonists, 'Protagonistas', Crown, 'default')}
                    {renderGroup(antagonists, 'Antagonistas', Skull, 'destructive')}
                    {renderGroup(supporting, 'Secundarios', UserCheck, 'secondary')}
                    {renderGroup(recurring, 'Recurrentes', Star, 'outline')}
                    {renderGroup(collective, 'Entidades Colectivas', Users, 'outline')}
                    {renderGroup(others, 'Otros', Sparkles, 'outline')}
                  </>
                );
              })()}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Locations Section */}
      {scriptData.locations && scriptData.locations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary" />
              Localizaciones ({scriptData.locations.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {scriptData.locations.map((loc, i) => (
                <div key={i} className="p-2 bg-muted/30 rounded-lg">
                  <Badge variant="outline">{loc.name}</Badge>
                  {loc.description && (
                    <p className="text-xs text-muted-foreground mt-1">{loc.description}</p>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Props Section */}
      {scriptData.props && scriptData.props.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Package className="h-5 w-5 text-primary" />
              Props / Objetos Clave ({scriptData.props.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {scriptData.props.map((prop, i) => (
                <div key={i} className="p-2 bg-muted/30 rounded-lg">
                  <Badge variant="secondary">{prop.name}</Badge>
                  {prop.description && (
                    <p className="text-xs text-muted-foreground mt-1">{prop.description}</p>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Subplots Section */}
      {scriptData.subplots && scriptData.subplots.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <GitBranch className="h-5 w-5 text-primary" />
              Subtramas ({scriptData.subplots.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {scriptData.subplots.map((subplot, i) => (
                <div key={i} className="p-3 bg-muted/30 rounded-lg">
                  <div className="font-medium text-sm">{subplot.name}</div>
                  {subplot.description && (
                    <p className="text-xs text-muted-foreground mt-1">{subplot.description}</p>
                  )}
                  {subplot.characters_involved && subplot.characters_involved.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {subplot.characters_involved.map((char: string, ci: number) => (
                        <Badge key={ci} variant="outline" className="text-xs">{char}</Badge>
                      ))}
                    </div>
                  )}
                  {subplot.resolution && subplot.resolution !== 'not_specified' && (
                    <p className="text-xs text-primary mt-1">Resolución: {subplot.resolution}</p>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Plot Twists Section */}
      {scriptData.plot_twists && scriptData.plot_twists.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" />
              Giros Narrativos ({scriptData.plot_twists.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {scriptData.plot_twists.map((twist, i) => (
                <div key={i} className="p-3 bg-muted/30 rounded-lg flex items-start gap-3">
                  <Badge 
                    variant={twist.impact === 'paradigm_shift' ? 'destructive' : twist.impact === 'major' ? 'default' : 'secondary'}
                    className="shrink-0"
                  >
                    {twist.impact === 'paradigm_shift' ? '💥' : twist.impact === 'major' ? '⚡' : '✨'}
                    {twist.impact === 'paradigm_shift' ? 'Cambio Total' : twist.impact === 'major' ? 'Mayor' : 'Menor'}
                  </Badge>
                  <div>
                    <div className="font-medium text-sm">{twist.name}</div>
                    {twist.description && (
                      <p className="text-xs text-muted-foreground mt-1">{twist.description}</p>
                    )}
                    {(twist.episode || twist.scene) && (
                      <p className="text-xs text-primary mt-1">
                        {twist.episode ? `Episodio ${twist.episode}` : `Escena ${twist.scene}`}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Episodes List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Episodios</CardTitle>
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => {
                const allExpanded = Object.values(expandedEpisodes).every(v => v);
                const newState: Record<number, boolean> = {};
                scriptData.episodes.forEach((_, i) => { newState[i] = !allExpanded; });
                setExpandedEpisodes(newState);
              }}
            >
              {Object.values(expandedEpisodes).every(v => v) ? 'Contraer' : 'Expandir'}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {scriptData.episodes.map((episode, idx) => {
            const isSegmented = segmentedEpisodes.has(episode.episode_number);
            const dialogueCount = episode.scenes?.reduce((sum, s: any) => sum + (s.dialogue?.length || 0), 0) || 0;

            return (
              <Card key={idx} className="overflow-hidden">
                <Collapsible
                  open={expandedEpisodes[idx] ?? false}
                  onOpenChange={(open) => setExpandedEpisodes(prev => ({ ...prev, [idx]: open }))}
                >
                  <CardHeader className="bg-muted/30 py-3">
                    <div className="flex items-center justify-between w-full">
                      <CollapsibleTrigger className="flex items-center gap-3 text-left flex-1">
                        {expandedEpisodes[idx] ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                        <div>
                          <span className="font-medium">
                            Episodio {episode.episode_number}: {episode.title}
                          </span>
                          <div className="flex gap-2 mt-1 flex-wrap">
                            <Badge variant="secondary" className="text-xs">
                              {episode.scenes?.length || 0} escenas
                            </Badge>
                            {episode.duration_min && (
                              <Badge variant="outline" className="text-xs">
                                <Clock className="h-3 w-3 mr-1" />
                                {episode.duration_min} min
                              </Badge>
                            )}
                            {isSegmented && (
                              <Badge className="bg-green-600 text-xs">
                                <CheckCircle className="h-3 w-3 mr-1" />
                                En Producción
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
                            handleExportEpisodePDF(episode, idx);
                          }}
                        >
                          <FileDown className="h-3 w-3" />
                        </Button>
                        {isSegmented ? (
                          <Button
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/projects/${projectId}/scenes?episode=${episode.episode_number}`);
                            }}
                          >
                            <Video className="h-4 w-4 mr-1" />
                            Producir
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              generateScenesForEpisode(episode);
                            }}
                            disabled={segmenting}
                          >
                            {segmenting ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <>
                                <Scissors className="h-4 w-4 mr-1" />
                                Generar Escenas
                              </>
                            )}
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardHeader>

                  <CollapsibleContent>
                    <CardContent className="pt-4 space-y-3">
                      {/* Synopsis */}
                      {episode.synopsis && (
                        <div className="p-3 bg-muted/30 rounded-lg">
                          <p className="text-sm">{episode.synopsis}</p>
                        </div>
                      )}

                      {/* Quick stats */}
                      <div className="grid grid-cols-3 gap-3">
                        <div className="text-center p-2 bg-muted/20 rounded">
                          <div className="text-lg font-bold">{episode.scenes?.length || 0}</div>
                          <div className="text-xs text-muted-foreground">Escenas</div>
                        </div>
                        <div className="text-center p-2 bg-muted/20 rounded">
                          <div className="text-lg font-bold">{dialogueCount}</div>
                          <div className="text-xs text-muted-foreground">Diálogos</div>
                        </div>
                        <div className="text-center p-2 bg-muted/20 rounded">
                          <div className="text-lg font-bold">{episode.duration_min || '~45'}</div>
                          <div className="text-xs text-muted-foreground">Minutos</div>
                        </div>
                      </div>

                      {/* Scene list preview */}
                      {episode.scenes && episode.scenes.length > 0 && (
                        <ScrollArea className="max-h-48">
                          <div className="space-y-1">
                            {episode.scenes.slice(0, 8).map((scene: any, sIdx: number) => (
                              <div 
                                key={sIdx}
                                className="text-xs p-2 bg-muted/20 rounded flex items-center justify-between"
                              >
                                <span className="font-mono">
                                  {scene.scene_number || sIdx + 1}. {scene.slugline || 'SIN SLUGLINE'}
                                </span>
                                {scene.dialogue?.length > 0 && (
                                  <Badge variant="outline" className="text-[10px]">
                                    {scene.dialogue.length} líneas
                                  </Badge>
                                )}
                              </div>
                            ))}
                            {episode.scenes.length > 8 && (
                              <p className="text-xs text-muted-foreground text-center py-2">
                                +{episode.scenes.length - 8} escenas más...
                              </p>
                            )}
                          </div>
                        </ScrollArea>
                      )}
                    </CardContent>
                  </CollapsibleContent>
                </Collapsible>
              </Card>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
