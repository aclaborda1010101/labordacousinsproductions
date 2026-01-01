import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/contexts/LanguageContext';
import { toast } from 'sonner';
import { Plus, Clapperboard, Loader2, Trash2, ChevronDown, ChevronRight, Star, Sparkles, Lock, Wand2, FileDown, Video, Film, Copy, Clock, Settings, Play } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { exportStoryboardPDF } from '@/lib/exportStoryboardPDF';
import ShotEditor from './ShotEditor';

interface ScenesProps { projectId: string; bibleReady: boolean; }
type QualityMode = 'CINE' | 'ULTRA';

interface Scene { 
  id: string; 
  scene_no: number; 
  episode_no: number; 
  slugline: string; 
  summary: string | null; 
  quality_mode: QualityMode; 
  priority: string; 
  approved: boolean; 
  time_of_day: string | null;
  character_ids: string[] | null;
  location_id: string | null;
}
interface Character { id: string; name: string; token?: string; turnaround_urls?: any; }
interface Location { id: string; name: string; token?: string; reference_urls?: any; }
interface Shot { 
  id: string; 
  shot_no: number; 
  shot_type: string; 
  duration_target: number; 
  hero: boolean; 
  effective_mode: QualityMode; 
  dialogue_text: string | null;
  camera?: any;
  blocking?: any;
}
interface Render {
  id: string;
  shot_id: string;
  video_url: string | null;
  status: string;
  engine: string | null;
}

export default function Scenes({ projectId, bibleReady }: ScenesProps) {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [shots, setShots] = useState<Record<string, Shot[]>>({});
  const [renders, setRenders] = useState<Record<string, Render[]>>({});
  const [expandedScenes, setExpandedScenes] = useState<Set<string>>(new Set());
  const [expandedEpisodes, setExpandedEpisodes] = useState<Set<number>>(new Set([1]));
  const [newSlugline, setNewSlugline] = useState('');
  const [newEpisodeNo, setNewEpisodeNo] = useState('1');
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
  const [duplicateFromEpisode, setDuplicateFromEpisode] = useState('1');
  const [duplicateToEpisode, setDuplicateToEpisode] = useState('2');
  const [duplicating, setDuplicating] = useState(false);
  const [showAIDialog, setShowAIDialog] = useState(false);
  const [showShotEditor, setShowShotEditor] = useState(false);
  const [selectedShot, setSelectedShot] = useState<{ shot: Shot; scene: Scene } | null>(null);
  const [generating, setGenerating] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [projectTitle, setProjectTitle] = useState('');
  const [preferredEngine, setPreferredEngine] = useState<string | null>(null);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [aiForm, setAiForm] = useState({
    episodeNo: '1',
    synopsis: '',
    sceneCount: '5',
  });
  const [episodesCount, setEpisodesCount] = useState(1);

  const fetchScenes = async () => {
    const { data } = await supabase.from('scenes').select('*').eq('project_id', projectId).order('episode_no').order('scene_no');
    setScenes(data || []);
    setLoading(false);
  };

  const fetchShots = async (sceneId: string) => {
    const { data } = await supabase.from('shots').select('*').eq('scene_id', sceneId).order('shot_no');
    setShots(prev => ({ ...prev, [sceneId]: data || [] }));
    
    // Also fetch renders for these shots
    if (data && data.length > 0) {
      const shotIds = data.map(s => s.id);
      const { data: rendersData } = await supabase
        .from('renders')
        .select('*')
        .in('shot_id', shotIds)
        .order('created_at', { ascending: false });
      
      if (rendersData) {
        const rendersByShot: Record<string, Render[]> = {};
        rendersData.forEach(r => {
          if (!rendersByShot[r.shot_id]) rendersByShot[r.shot_id] = [];
          rendersByShot[r.shot_id].push(r as Render);
        });
        setRenders(prev => ({ ...prev, ...rendersByShot }));
      }
    }
  };

  useEffect(() => { 
    fetchScenes();
    // Get project info including preferred engine
    supabase.from('projects').select('episodes_count, title, preferred_engine').eq('id', projectId).single().then(({ data }) => {
      if (data) {
        setEpisodesCount(data.episodes_count);
        setProjectTitle(data.title);
        setPreferredEngine(data.preferred_engine);
      }
    });
    // Get characters and locations with tokens
    supabase.from('characters').select('id, name, token, turnaround_urls').eq('project_id', projectId).then(({ data }) => {
      if (data) setCharacters(data);
    });
    supabase.from('locations').select('id, name, token, reference_urls').eq('project_id', projectId).then(({ data }) => {
      if (data) setLocations(data);
    });
  }, [projectId]);

  const toggleEpisode = (episodeNo: number) => {
    const newExpanded = new Set(expandedEpisodes);
    if (newExpanded.has(episodeNo)) { newExpanded.delete(episodeNo); } 
    else { newExpanded.add(episodeNo); }
    setExpandedEpisodes(newExpanded);
  };

  const toggleScene = (sceneId: string) => {
    const newExpanded = new Set(expandedScenes);
    if (newExpanded.has(sceneId)) { newExpanded.delete(sceneId); } 
    else { newExpanded.add(sceneId); if (!shots[sceneId]) fetchShots(sceneId); }
    setExpandedScenes(newExpanded);
  };

  const addScene = async () => {
    if (!newSlugline.trim()) return;
    const episodeScenes = scenes.filter(s => s.episode_no === parseInt(newEpisodeNo));
    const nextSceneNo = episodeScenes.length > 0 ? Math.max(...episodeScenes.map(s => s.scene_no)) + 1 : 1;
    const { error } = await supabase.from('scenes').insert({ 
      project_id: projectId, 
      scene_no: nextSceneNo, 
      episode_no: parseInt(newEpisodeNo), 
      slugline: newSlugline.trim(), 
      quality_mode: 'CINE', 
      priority: 'P1' 
    });
    if (error) toast.error(t.common.error);
    else { 
      toast.success(t.common.success); 
      setNewSlugline(''); 
      fetchScenes(); 
      // Expand the episode where scene was added
      setExpandedEpisodes(prev => new Set(prev).add(parseInt(newEpisodeNo)));
    }
  };

  // Group scenes by episode
  const scenesByEpisode = scenes.reduce((acc, scene) => {
    if (!acc[scene.episode_no]) acc[scene.episode_no] = [];
    acc[scene.episode_no].push(scene);
    return acc;
  }, {} as Record<number, Scene[]>);

  // Calculate episode durations based on shots
  const getEpisodeDuration = (episodeNo: number): number => {
    const episodeScenes = scenesByEpisode[episodeNo] || [];
    let totalDuration = 0;
    episodeScenes.forEach(scene => {
      const sceneShots = shots[scene.id] || [];
      sceneShots.forEach(shot => {
        totalDuration += shot.duration_target || 3;
      });
    });
    return totalDuration;
  };

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  };

  // Duplicate scenes from one episode to another
  const duplicateEpisodeScenes = async () => {
    const fromEp = parseInt(duplicateFromEpisode);
    const toEp = parseInt(duplicateToEpisode);
    
    if (fromEp === toEp) {
      toast.error('Selecciona episodios diferentes');
      return;
    }

    const scenesToDuplicate = scenesByEpisode[fromEp] || [];
    if (scenesToDuplicate.length === 0) {
      toast.error('El episodio origen no tiene escenas');
      return;
    }

    setDuplicating(true);
    try {
      // Get existing scene count in target episode
      const existingScenes = scenesByEpisode[toEp] || [];
      let nextSceneNo = existingScenes.length > 0 ? Math.max(...existingScenes.map(s => s.scene_no)) + 1 : 1;

      for (const scene of scenesToDuplicate) {
        // Create new scene
        const { data: newScene, error: sceneError } = await supabase
          .from('scenes')
          .insert([{
            project_id: projectId,
            episode_no: toEp,
            scene_no: nextSceneNo,
            slugline: scene.slugline,
            summary: scene.summary,
            quality_mode: scene.quality_mode,
            priority: scene.priority as 'P0' | 'P1' | 'P2',
            time_of_day: scene.time_of_day,
            character_ids: scene.character_ids,
            location_id: scene.location_id,
          }])
          .select()
          .single();

        if (sceneError) throw sceneError;

        // Duplicate shots for this scene
        const { data: sceneShots } = await supabase
          .from('shots')
          .select('*')
          .eq('scene_id', scene.id)
          .order('shot_no');

        if (sceneShots && sceneShots.length > 0) {
          const shotInserts = sceneShots.map(shot => ({
            scene_id: newScene.id,
            shot_no: shot.shot_no,
            shot_type: shot.shot_type,
            duration_target: shot.duration_target,
            hero: shot.hero,
            effective_mode: shot.effective_mode,
            dialogue_text: shot.dialogue_text,
          }));
          await supabase.from('shots').insert(shotInserts);
        }

        nextSceneNo++;
      }

      toast.success(`${scenesToDuplicate.length} escenas duplicadas al Episodio ${toEp}`);
      setShowDuplicateDialog(false);
      setExpandedEpisodes(prev => new Set(prev).add(toEp));
      fetchScenes();
    } catch (error) {
      console.error('Error duplicating scenes:', error);
      toast.error('Error al duplicar escenas');
    } finally {
      setDuplicating(false);
    }
  };

  const deleteScene = async (id: string) => { await supabase.from('scenes').delete().eq('id', id); fetchScenes(); };

  const updateSceneMode = async (sceneId: string, mode: QualityMode) => {
    await supabase.from('scenes').update({ quality_mode: mode }).eq('id', sceneId);
    await supabase.from('shots').update({ effective_mode: mode }).eq('scene_id', sceneId).eq('hero', false);
    fetchScenes();
    if (shots[sceneId]) fetchShots(sceneId);
    toast.success(t.common.success);
  };

  const addShot = async (sceneId: string, sceneMode: QualityMode) => {
    const sceneShots = shots[sceneId] || [];
    const nextShotNo = sceneShots.length > 0 ? Math.max(...sceneShots.map(s => s.shot_no)) + 1 : 1;
    await supabase.from('shots').insert({ scene_id: sceneId, shot_no: nextShotNo, shot_type: 'medium', duration_target: 3.0, effective_mode: sceneMode });
    fetchShots(sceneId);
    toast.success(t.common.success);
  };

  const toggleHeroShot = async (shotId: string, sceneId: string, currentHero: boolean, sceneMode: QualityMode) => {
    const newHero = !currentHero;
    await supabase.from('shots').update({ hero: newHero, effective_mode: newHero ? 'ULTRA' : sceneMode }).eq('id', shotId);
    fetchShots(sceneId);
    toast.success(t.common.success);
  };

  const deleteShot = async (shotId: string, sceneId: string) => { 
    await supabase.from('shots').delete().eq('id', shotId); 
    fetchShots(sceneId); 
  };

  const openShotEditor = (shot: Shot, scene: Scene) => {
    setSelectedShot({ shot, scene });
    setShowShotEditor(true);
  };

  const getShotRender = (shotId: string): Render | undefined => {
    return renders[shotId]?.[0];
  };

  if (!bibleReady) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Lock className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-foreground mb-2">{t.scenes.bibleRequired}</h3>
          <p className="text-muted-foreground max-w-md">{t.scenes.bibleRequiredDesc}</p>
        </div>
      </div>
    );
  }

  if (loading) return <div className="p-6 flex justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground mb-1">{t.scenes.title}</h2>
          <p className="text-muted-foreground">{t.scenes.subtitle}</p>
        </div>
        <div className="flex gap-2">
          {scenes.length > 0 && (
            <>
              <Button variant="outline" onClick={() => setShowDuplicateDialog(true)}>
                <Copy className="w-4 h-4 mr-2" />
                Duplicar Episodio
              </Button>
              <Button variant="outline" onClick={async () => {
                setExporting(true);
                // Build scenes with shots for export
                const scenesWithShots = scenes.map(scene => ({
                  ...scene,
                  shots: shots[scene.id] || []
                }));
                exportStoryboardPDF({
                  projectTitle,
                  scenes: scenesWithShots,
                  characters,
                  locations
                });
                setExporting(false);
              }} disabled={exporting}>
                {exporting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <FileDown className="w-4 h-4 mr-2" />}
                Exportar Storyboard
              </Button>
            </>
          )}
          <Button variant="gold" onClick={() => setShowAIDialog(true)}>
            <Wand2 className="w-4 h-4 mr-2" />
            Generar con IA
          </Button>
        </div>
      </div>

      {/* Engine preference indicator */}
      {preferredEngine && (
        <div className="flex items-center gap-2 p-3 bg-primary/10 rounded-lg">
          <Video className="w-4 h-4 text-primary" />
          <span className="text-sm">
            Motor preferido: <strong className="text-primary uppercase">{preferredEngine}</strong>
            <span className="text-muted-foreground ml-2">(determinado por Engine Shootout)</span>
          </span>
        </div>
      )}

      <div className="flex gap-4 text-sm">
        <div className="flex items-center gap-2"><Badge variant="cine">CINE</Badge><span className="text-muted-foreground">{t.scenes.qualityModes.CINE}</span></div>
        <div className="flex items-center gap-2"><Badge variant="ultra">ULTRA</Badge><span className="text-muted-foreground">{t.scenes.qualityModes.ULTRA}</span></div>
        <div className="flex items-center gap-2"><Badge variant="hero">HERO</Badge><span className="text-muted-foreground">{t.scenes.qualityModes.HERO}</span></div>
      </div>

      <div className="flex gap-2">
        <div className="flex items-center gap-2">
          <Label className="text-sm whitespace-nowrap">Episodio:</Label>
          <Select value={newEpisodeNo} onValueChange={setNewEpisodeNo}>
            <SelectTrigger className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: episodesCount }, (_, i) => (
                <SelectItem key={i + 1} value={String(i + 1)}>
                  Ep. {i + 1}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Input placeholder={t.scenes.sluglinePlaceholder} value={newSlugline} onChange={e => setNewSlugline(e.target.value)} onKeyDown={e => e.key === 'Enter' && addScene()} className="font-mono flex-1" />
        <Button variant="outline" onClick={addScene}><Plus className="w-4 h-4 mr-1" />{t.scenes.addScene}</Button>
      </div>

      {/* Episodes with scenes */}
      <div className="space-y-4">
        {scenes.length === 0 ? (
          <div className="panel p-8 text-center">
            <Clapperboard className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground mb-4">{t.scenes.noScenes}</p>
            <Button variant="gold" onClick={() => setShowAIDialog(true)}>
              <Wand2 className="w-4 h-4 mr-2" />
              Generar escenas con IA
            </Button>
          </div>
        ) : (
          Array.from({ length: episodesCount }, (_, i) => i + 1).map(episodeNo => {
            const episodeScenes = scenesByEpisode[episodeNo] || [];
            const isExpanded = expandedEpisodes.has(episodeNo);
            
            return (
              <div key={episodeNo} className="panel overflow-hidden">
                {/* Episode header */}
                <div 
                  className="p-4 flex items-center gap-4 cursor-pointer hover:bg-muted/30 transition-colors border-b border-border"
                  onClick={() => toggleEpisode(episodeNo)}
                >
                  {isExpanded ? <ChevronDown className="w-5 h-5 text-primary" /> : <ChevronRight className="w-5 h-5 text-muted-foreground" />}
                  <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Film className="w-6 h-6 text-primary" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-foreground">Episodio {episodeNo}</h3>
                    <p className="text-sm text-muted-foreground">
                      {episodeScenes.length} escenas • {episodeScenes.reduce((sum, s) => sum + (shots[s.id]?.length || 0), 0)} shots
                    </p>
                  </div>
                  {/* Duration counter */}
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="w-4 h-4" />
                    <span>{formatDuration(getEpisodeDuration(episodeNo))}</span>
                  </div>
                  <Badge variant={episodeScenes.length > 0 ? 'default' : 'secondary'}>
                    {episodeScenes.length > 0 ? 'Con contenido' : 'Vacío'}
                  </Badge>
                </div>

                {/* Episode scenes */}
                {isExpanded && (
                  <div className="p-4 space-y-3 bg-muted/10">
                    {episodeScenes.length === 0 ? (
                      <div className="text-center py-6 text-muted-foreground">
                        <p className="mb-2">No hay escenas en este episodio</p>
                        <p className="text-xs">Importa un guión o añade escenas manualmente</p>
                      </div>
                    ) : (
                      episodeScenes.map(scene => (
                        <div key={scene.id} className="rounded-lg border border-border bg-card overflow-hidden">
                          <div className="p-4 flex items-center gap-4 cursor-pointer hover:bg-muted/30 transition-colors" onClick={() => toggleScene(scene.id)}>
                            {expandedScenes.has(scene.id) ? <ChevronDown className="w-5 h-5 text-muted-foreground" /> : <ChevronRight className="w-5 h-5 text-muted-foreground" />}
                            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0"><span className="font-mono text-primary font-bold">{scene.scene_no}</span></div>
                            <div className="flex-1 min-w-0">
                              <p className="font-mono text-foreground truncate">{scene.slugline}</p>
                              <p className="text-sm text-muted-foreground">{shots[scene.id]?.length || 0} shots</p>
                            </div>
                            <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                              <button onClick={() => updateSceneMode(scene.id, 'CINE')} className={cn("px-3 py-1 rounded text-xs font-semibold transition-all", scene.quality_mode === 'CINE' ? "bg-primary/20 text-primary border border-primary/30" : "bg-muted text-muted-foreground hover:bg-muted/80")}>CINE</button>
                              <button onClick={() => updateSceneMode(scene.id, 'ULTRA')} className={cn("px-3 py-1 rounded text-xs font-semibold transition-all", scene.quality_mode === 'ULTRA' ? "bg-gradient-to-r from-primary/20 to-amber-500/20 text-primary border border-primary/30" : "bg-muted text-muted-foreground hover:bg-muted/80")}>ULTRA</button>
                            </div>
                            <Badge variant={scene.priority === 'P0' ? 'p0' : scene.priority === 'P1' ? 'p1' : 'p2'}>{scene.priority}</Badge>
                            <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); deleteScene(scene.id); }}><Trash2 className="w-4 h-4" /></Button>
                          </div>

                          {expandedScenes.has(scene.id) && (
                            <div className="border-t border-border bg-muted/20 p-4 space-y-3">
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-medium text-foreground">{t.scenes.shots}</span>
                                <Button size="sm" variant="outline" onClick={() => addShot(scene.id, scene.quality_mode)}><Plus className="w-3 h-3 mr-1" />{t.scenes.addShot}</Button>
                              </div>

                              {!shots[scene.id] || shots[scene.id].length === 0 ? (
                                <p className="text-sm text-muted-foreground text-center py-4">{t.scenes.noShots}</p>
                              ) : (
                                <div className="grid gap-2">
                                  {shots[scene.id].map(shot => {
                                    const render = getShotRender(shot.id);
                                    const hasVideo = render?.video_url && render.status === 'succeeded';
                                    
                                    return (
                                      <div key={shot.id} className={cn("rounded-lg border transition-all overflow-hidden", shot.hero ? "bg-gradient-to-r from-primary/5 to-amber-500/5 border-primary/30" : "bg-card border-border")}>
                                        <div className="flex items-center gap-3 p-3">
                                          <div className="w-8 h-8 rounded bg-muted flex items-center justify-center text-sm font-mono">{shot.shot_no}</div>
                                          <div className="flex-1">
                                            <div className="flex items-center gap-2">
                                              <span className="font-medium text-foreground capitalize">{shot.shot_type}</span>
                                              <span className="text-xs text-muted-foreground">{shot.duration_target}s</span>
                                              <Badge variant={shot.effective_mode === 'ULTRA' ? 'ultra' : 'cine'} className="text-xs">{shot.effective_mode}</Badge>
                                              {shot.hero && <Badge variant="hero" className="text-xs">HERO</Badge>}
                                              {render && (
                                                <Badge 
                                                  variant={render.status === 'succeeded' ? 'default' : 'secondary'}
                                                  className={cn("text-xs", render.status === 'succeeded' && "bg-green-600")}
                                                >
                                                  <Video className="w-3 h-3 mr-1" />
                                                  {render.engine?.toUpperCase()}
                                                </Badge>
                                              )}
                                            </div>
                                            {shot.dialogue_text && <p className="text-sm text-muted-foreground truncate mt-0.5">{shot.dialogue_text}</p>}
                                          </div>
                                          
                                          <Button
                                            size="sm"
                                            variant={render ? "outline" : "gold"}
                                            className="h-8"
                                            onClick={() => openShotEditor(shot, scene)}
                                          >
                                            <Settings className="w-3 h-3 mr-1" />
                                            {render ? 'Editar' : 'Configurar'}
                                          </Button>
                                          
                                          <button onClick={() => toggleHeroShot(shot.id, scene.id, shot.hero, scene.quality_mode)} className={cn("p-2 rounded-lg transition-all", shot.hero ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-primary")}><Star className="w-4 h-4" fill={shot.hero ? 'currentColor' : 'none'} /></button>
                                          <Button variant="ghost" size="icon" onClick={() => deleteShot(shot.id, scene.id)}><Trash2 className="w-4 h-4" /></Button>
                                        </div>
                                        
                                        {hasVideo && (
                                          <div className="border-t border-border bg-black/50 p-2">
                                            <video
                                              src={render.video_url!}
                                              controls
                                              className="w-full max-h-48 rounded object-contain"
                                              preload="metadata"
                                            />
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}

                              <div className="flex items-start gap-2 p-3 rounded-lg bg-primary/5 border border-primary/10">
                                <Sparkles className="w-4 h-4 text-primary mt-0.5" />
                                <div className="text-xs"><p className="font-medium text-foreground">{t.scenes.sosTip}</p><p className="text-muted-foreground">{t.scenes.sosTipDesc}</p></div>
                              </div>
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>


      {/* Shot Editor Modal */}
      {selectedShot && (
        <ShotEditor
          open={showShotEditor}
          onOpenChange={(open) => {
            setShowShotEditor(open);
            if (!open) setSelectedShot(null);
          }}
          shot={selectedShot.shot}
          scene={selectedShot.scene}
          characters={characters}
          locations={locations}
          preferredEngine={preferredEngine}
          onShotUpdated={() => {
            fetchShots(selectedShot.scene.id);
          }}
        />
      )}

      {/* AI Generation Dialog */}
      <Dialog open={showAIDialog} onOpenChange={setShowAIDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wand2 className="w-5 h-5 text-primary" />
              Generar Escenas con IA
            </DialogTitle>
            <DialogDescription>
              La IA utilizará los personajes y localizaciones de tu bible para crear escenas coherentes
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Episodio</Label>
                <Select 
                  value={aiForm.episodeNo} 
                  onValueChange={v => setAiForm({...aiForm, episodeNo: v})}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: episodesCount }, (_, i) => (
                      <SelectItem key={i + 1} value={String(i + 1)}>
                        Episodio {i + 1}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Número de Escenas</Label>
                <Select 
                  value={aiForm.sceneCount} 
                  onValueChange={v => setAiForm({...aiForm, sceneCount: v})}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="3">3 escenas</SelectItem>
                    <SelectItem value="5">5 escenas</SelectItem>
                    <SelectItem value="8">8 escenas</SelectItem>
                    <SelectItem value="10">10 escenas</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div className="space-y-2">
              <Label>Sinopsis del Episodio *</Label>
              <Textarea 
                value={aiForm.synopsis}
                onChange={e => setAiForm({...aiForm, synopsis: e.target.value})}
                placeholder="Describe qué ocurre en este episodio: la trama principal, conflictos, giros importantes..."
                rows={5}
              />
              <p className="text-xs text-muted-foreground">
                Una sinopsis detallada ayuda a generar escenas más coherentes con tu historia
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAIDialog(false)} disabled={generating}>
              Cancelar
            </Button>
            <Button variant="gold" onClick={async () => {
              if (!aiForm.synopsis.trim()) {
                toast.error('Por favor, escribe una sinopsis');
                return;
              }
              setGenerating(true);
              try {
                const { data, error } = await supabase.functions.invoke('generate-scenes', {
                  body: { 
                    projectId, 
                    episodeNo: parseInt(aiForm.episodeNo),
                    synopsis: aiForm.synopsis,
                    sceneCount: parseInt(aiForm.sceneCount),
                    characters: characters.map(c => ({ id: c.id, name: c.name })),
                    locations: locations.map(l => ({ id: l.id, name: l.name }))
                  }
                });
                if (error) throw error;
                if (data?.scenes) {
                  toast.success(`${data.scenes.length} escenas generadas`);
                  setShowAIDialog(false);
                  setAiForm({ episodeNo: '1', synopsis: '', sceneCount: '5' });
                  setExpandedEpisodes(prev => new Set(prev).add(parseInt(aiForm.episodeNo)));
                  fetchScenes();
                }
              } catch (err) {
                console.error('Error generating scenes:', err);
                toast.error('Error al generar escenas');
              } finally {
                setGenerating(false);
              }
            }} disabled={generating}>
              {generating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Generando...
                </>
              ) : (
                <>
                  <Wand2 className="w-4 h-4 mr-2" />
                  Generar Escenas
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Duplicate Episode Dialog */}
      <Dialog open={showDuplicateDialog} onOpenChange={setShowDuplicateDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Copy className="w-5 h-5 text-primary" />
              Duplicar Escenas de Episodio
            </DialogTitle>
            <DialogDescription>
              Copia todas las escenas y shots de un episodio a otro
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Desde Episodio</Label>
                <Select 
                  value={duplicateFromEpisode} 
                  onValueChange={setDuplicateFromEpisode}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: episodesCount }, (_, i) => (
                      <SelectItem key={i + 1} value={String(i + 1)}>
                        Episodio {i + 1} ({(scenesByEpisode[i + 1] || []).length} escenas)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>A Episodio</Label>
                <Select 
                  value={duplicateToEpisode} 
                  onValueChange={setDuplicateToEpisode}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: episodesCount }, (_, i) => (
                      <SelectItem key={i + 1} value={String(i + 1)}>
                        Episodio {i + 1}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {duplicateFromEpisode && (
              <div className="p-3 bg-muted/50 rounded-lg text-sm">
                <p className="text-muted-foreground">
                  Se duplicarán <strong>{(scenesByEpisode[parseInt(duplicateFromEpisode)] || []).length}</strong> escenas 
                  del Episodio {duplicateFromEpisode} al Episodio {duplicateToEpisode}
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDuplicateDialog(false)} disabled={duplicating}>
              Cancelar
            </Button>
            <Button variant="gold" onClick={duplicateEpisodeScenes} disabled={duplicating}>
              {duplicating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Duplicando...
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 mr-2" />
                  Duplicar Escenas
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
