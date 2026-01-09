import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/contexts/LanguageContext';
import { toast } from 'sonner';
import { Plus, Clapperboard, Loader2, Trash2, ChevronDown, ChevronRight, Star, Sparkles, Lock, Wand2, FileDown, Video, Film, Copy, Clock, Settings, Play, Camera, RefreshCw, Palette, AlertTriangle, Edit2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { exportStoryboardPDF } from '@/lib/exportStoryboardPDF';
import ShotEditor from './ShotEditor';
import ShotSuggestionPanel from './ShotSuggestionPanel';
import EpisodeRegenerateDialog from './EpisodeRegenerateDialog';
import { ShortTemplatePanel } from './ShortTemplatePanel';
import { useShortTemplate } from '@/hooks/useShortTemplate';
import { useEditorialKnowledgeBase } from '@/hooks/useEditorialKnowledgeBase';
import { runTemplateQAChecks, TemplateQAWarning } from '@/lib/shortTemplates';
import SceneEditDialog from './SceneEditDialog';

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
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [shots, setShots] = useState<Record<string, Shot[]>>({});
  const [renders, setRenders] = useState<Record<string, Render[]>>({});
  const [expandedScenes, setExpandedScenes] = useState<Set<string>>(new Set());
  const [expandedEpisodes, setExpandedEpisodes] = useState<Set<number>>(new Set([1]));
  const [newSlugline, setNewSlugline] = useState('');
  const [newEpisodeNo, setNewEpisodeNo] = useState('1');
  const [filterEpisode, setFilterEpisode] = useState<string>('all');
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
  const [scriptEpisodes, setScriptEpisodes] = useState<any[]>([]);
  const [showRegenerateDialog, setShowRegenerateDialog] = useState(false);
  const [regenerateEpisodeNo, setRegenerateEpisodeNo] = useState(1);
  const [regenerateEpisodeSynopsis, setRegenerateEpisodeSynopsis] = useState('');
  const [hasStyleConfig, setHasStyleConfig] = useState<boolean | null>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingScene, setEditingScene] = useState<Scene | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [hasBreakdown, setHasBreakdown] = useState(false);

  // Editorial Knowledge Base context
  const { formatProfile, visualStyle, userLevel } = useEditorialKnowledgeBase({
    projectId,
    enabled: true,
  });

  // Short Templates hook (only for short format)
  const shortTemplate = useShortTemplate({
    projectId,
    visualStyle,
    formatProfile,
    enabled: formatProfile === 'short',
  });

  // QA warnings for templates
  const hasCanon = characters.some(c => c.turnaround_urls);
  const totalShots = Object.values(shots).flat().length;
  const templateWarnings: TemplateQAWarning[] = formatProfile === 'short' ? runTemplateQAChecks(
    { format_profile: formatProfile, visual_style: visualStyle },
    totalShots,
    hasCanon
  ) : [];

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
    // Check if style_config exists (REQUIRED for generation)
    supabase.from('style_packs').select('style_config').eq('project_id', projectId).maybeSingle().then(({ data }) => {
      setHasStyleConfig(!!data?.style_config);
    });
    // Get characters and locations with tokens
    supabase.from('characters').select('id, name, token, turnaround_urls').eq('project_id', projectId).then(({ data }) => {
      if (data) setCharacters(data);
    });
    supabase.from('locations').select('id, name, token, reference_urls').eq('project_id', projectId).then(({ data }) => {
      if (data) setLocations(data);
    });
    // Load script to get episode synopses and check for breakdown
    supabase.from('scripts').select('parsed_json').eq('project_id', projectId).order('created_at', { ascending: false }).limit(1).single().then(({ data }) => {
      if (data?.parsed_json) {
        const parsed = data.parsed_json as any;
        if (parsed.episodes) {
          setScriptEpisodes(parsed.episodes);
        }
        // Check if breakdown exists
        const breakdown = parsed.breakdown_pro || parsed.breakdown;
        const sceneList = breakdown?.scenes?.list || breakdown?.scene_list || parsed.scenes?.list || parsed.scene_list;
        setHasBreakdown(!!sceneList && sceneList.length > 0);
      }
    });
  }, [projectId]);

  // Handle URL params to auto-open episode and scene
  useEffect(() => {
    const episodeParam = searchParams.get('episode');
    const sceneParam = searchParams.get('scene');
    
    if (episodeParam && scenes.length > 0) {
      const episodeNo = parseInt(episodeParam);
      // Expand the episode
      setExpandedEpisodes(prev => new Set(prev).add(episodeNo));
      setFilterEpisode(episodeParam);
      
      if (sceneParam) {
        const sceneNo = parseInt(sceneParam);
        // Find the specific scene
        const scene = scenes.find(s => s.episode_no === episodeNo && s.scene_no === sceneNo);
        if (scene) {
          setExpandedScenes(prev => new Set(prev).add(scene.id));
          if (!shots[scene.id]) fetchShots(scene.id);
          
          setTimeout(() => {
            const sceneElement = document.getElementById(`scene-${scene.id}`);
            if (sceneElement) {
              sceneElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
          }, 300);
        }
      } else {
        // No specific scene - find first scene in episode without shots and expand it
        const episodeScenes = scenes.filter(s => s.episode_no === episodeNo);
        const firstSceneWithoutShots = episodeScenes.find(s => !shots[s.id] || shots[s.id].length === 0);
        const targetScene = firstSceneWithoutShots || episodeScenes[0];
        
        if (targetScene) {
          setExpandedScenes(prev => new Set(prev).add(targetScene.id));
          if (!shots[targetScene.id]) fetchShots(targetScene.id);
          
          setTimeout(() => {
            const sceneElement = document.getElementById(`scene-${targetScene.id}`);
            if (sceneElement) {
              sceneElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
          }, 300);
        }
      }
      
      // Clear the URL params after processing
      setSearchParams({});
    }
  }, [scenes, searchParams]);

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

  // Sync scenes from script breakdown
  const handleSyncFromScript = async () => {
    setSyncing(true);
    try {
      // Get script breakdown
      const { data: script } = await supabase
        .from('scripts')
        .select('parsed_json')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (!script?.parsed_json) {
        toast.error('No se encontró guión con breakdown');
        return;
      }

      const parsed = script.parsed_json as any;
      const breakdown = parsed.breakdown_pro || parsed.breakdown;
      const sceneList = breakdown?.scenes?.list || breakdown?.scene_list || parsed.scenes?.list || parsed.scene_list || [];

      if (sceneList.length === 0) {
        toast.error('El guión no tiene escenas para sincronizar');
        return;
      }

      // Build location name -> id map
      const locationMap = new Map(locations.map(l => [l.name.toLowerCase().trim(), l.id]));
      
      // Build character name -> id map
      const characterMap = new Map(characters.map(c => [c.name.toLowerCase().trim(), c.id]));

      let updatedCount = 0;
      for (const sceneData of sceneList) {
        const sceneNumber = sceneData.scene_number || sceneData.number;
        const episodeNumber = sceneData.episode_number || 1;
        
        // Find matching scene in DB
        const dbScene = scenes.find(s => s.scene_no === sceneNumber && s.episode_no === episodeNumber);
        if (!dbScene) continue;

        // Get slugline from various field names
        const slugline = sceneData.slugline || sceneData.heading || sceneData.location_raw || '';
        const timeOfDay = sceneData.time_of_day || sceneData.time || '';
        
        // Match location
        const locationName = sceneData.location?.toLowerCase().trim() || '';
        const locationId = locationMap.get(locationName) || null;

        // Match characters
        const presentCharacters = sceneData.characters_present || sceneData.characters || [];
        const characterIds = presentCharacters
          .map((name: string) => characterMap.get(name.toLowerCase().trim()))
          .filter(Boolean);

        // Update scene
        const { error } = await supabase
          .from('scenes')
          .update({
            slugline: slugline || dbScene.slugline,
            time_of_day: timeOfDay || dbScene.time_of_day,
            location_id: locationId || dbScene.location_id,
            character_ids: characterIds.length > 0 ? characterIds : dbScene.character_ids,
            summary: sceneData.summary || sceneData.description || dbScene.summary,
          })
          .eq('id', dbScene.id);

        if (!error) updatedCount++;
      }

      toast.success(`${updatedCount} escenas sincronizadas desde el guión`);
      fetchScenes();
    } catch (error) {
      console.error('Error syncing from script:', error);
      toast.error('Error al sincronizar desde guión');
    } finally {
      setSyncing(false);
    }
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

  // Style config gating - Visual Bible must be configured before generation
  if (hasStyleConfig === false) {
    return (
      <div className="p-8 flex-1 flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 rounded-full bg-warning/10 flex items-center justify-center mx-auto mb-4">
            <Palette className="w-8 h-8 text-warning" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-2">Estilo Visual Requerido</h3>
          <p className="text-muted-foreground mb-4">
            Antes de generar escenas, configura el estilo visual de tu proyecto. 
            Este paso es obligatorio para garantizar coherencia cinematográfica.
          </p>
          <Button variant="gold" onClick={() => window.location.href = window.location.pathname.replace('/scenes', '/style')}>
            <Palette className="w-4 h-4 mr-2" />
            Configurar Estilo Visual
          </Button>
        </div>
      </div>
    );
  }

  if (loading || hasStyleConfig === null) return <div className="p-6 flex justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>;

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
          {hasBreakdown && scenes.length > 0 && (
            <Button 
              variant="outline" 
              onClick={handleSyncFromScript}
              disabled={syncing}
            >
              {syncing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
              Sincronizar desde Guión
            </Button>
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

      {/* Short Template Panel (only for short format) */}
      {formatProfile === 'short' && (
        <ShortTemplatePanel
          userLevel={userLevel}
          template={shortTemplate.template}
          availableTemplates={shortTemplate.availableTemplates}
          currentStepIndex={shortTemplate.currentStepIndex}
          totalSteps={shortTemplate.totalSteps}
          progress={shortTemplate.progress}
          isComplete={shortTemplate.isComplete}
          currentStep={shortTemplate.currentStep}
          warnings={templateWarnings}
          loading={shortTemplate.loading}
          onApplyTemplate={(id) => {
            shortTemplate.applyTemplate(id);
            toast.success('Template aplicado');
          }}
          onAdvanceStep={() => {
            shortTemplate.advanceStep();
            toast.success('Paso avanzado');
          }}
          onGoToStep={(index) => shortTemplate.goToStep(index)}
          onClearTemplate={() => {
            shortTemplate.clearTemplate();
            toast.info('Template eliminado');
          }}
          onGenerateForStep={() => {
            // TODO: Integrate with generation panel
            toast.info(`Genera: ${shortTemplate.currentStep?.label}`);
          }}
        />
      )}

      <div className="flex gap-4 text-sm">
        <div className="flex items-center gap-2"><Badge variant="cine">CINE</Badge><span className="text-muted-foreground">{t.scenes.qualityModes.CINE}</span></div>
        <div className="flex items-center gap-2"><Badge variant="ultra">ULTRA</Badge><span className="text-muted-foreground">{t.scenes.qualityModes.ULTRA}</span></div>
        <div className="flex items-center gap-2"><Badge variant="hero">HERO</Badge><span className="text-muted-foreground">{t.scenes.qualityModes.HERO}</span></div>
      </div>

      {/* Episode filter */}
      <div className="flex items-center gap-4 p-3 bg-muted/30 rounded-lg">
        <Label className="text-sm font-medium">Ver episodio:</Label>
        <Select value={filterEpisode} onValueChange={setFilterEpisode}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los episodios</SelectItem>
            {/* Teasers (negative episode numbers) */}
            {scenes.some(s => s.episode_no === -1) && (
              <SelectItem value="-1">🎬 Teaser 60s</SelectItem>
            )}
            {scenes.some(s => s.episode_no === -2) && (
              <SelectItem value="-2">🎬 Teaser 30s</SelectItem>
            )}
            {/* Regular episodes */}
            {Array.from({ length: episodesCount }, (_, i) => (
              <SelectItem key={i + 1} value={String(i + 1)}>
                Episodio {i + 1}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Add new scene */}
      <div className="flex gap-2">
        <div className="flex items-center gap-2">
          <Label className="text-sm whitespace-nowrap">Añadir a Ep:</Label>
          <Select value={newEpisodeNo} onValueChange={setNewEpisodeNo}>
            <SelectTrigger className="w-[100px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: episodesCount }, (_, i) => (
                <SelectItem key={i + 1} value={String(i + 1)}>
                  {i + 1}
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
          // Build episode list including teasers (negative episode numbers) + regular episodes
          (() => {
            const teaserEpisodes: number[] = [];
            if (scenes.some(s => s.episode_no === -1)) teaserEpisodes.push(-1);
            if (scenes.some(s => s.episode_no === -2)) teaserEpisodes.push(-2);
            const regularEpisodes = Array.from({ length: episodesCount }, (_, i) => i + 1);
            const allEpisodes = [...teaserEpisodes, ...regularEpisodes];
            
            return allEpisodes
              .filter(epNo => filterEpisode === 'all' || epNo === parseInt(filterEpisode))
              .map(episodeNo => {
                const episodeScenes = scenesByEpisode[episodeNo] || [];
                const isExpanded = expandedEpisodes.has(episodeNo);
                const isTeaser = episodeNo < 0;
                const teaserLabel = episodeNo === -1 ? 'Teaser 60s' : episodeNo === -2 ? 'Teaser 30s' : '';
                
                return (
                  <div key={episodeNo} className={cn("panel overflow-hidden", isTeaser && "border-amber-500/50")}>
                    {/* Episode header */}
                    <div 
                      className={cn(
                        "p-4 flex items-center gap-4 cursor-pointer hover:bg-muted/30 transition-colors border-b border-border",
                        isTeaser && "bg-gradient-to-r from-amber-500/10 to-orange-500/10"
                      )}
                      onClick={() => toggleEpisode(episodeNo)}
                    >
                      {isExpanded ? <ChevronDown className="w-5 h-5 text-primary" /> : <ChevronRight className="w-5 h-5 text-muted-foreground" />}
                      <div className={cn(
                        "w-12 h-12 rounded-lg flex items-center justify-center shrink-0",
                        isTeaser ? "bg-amber-500/20" : "bg-primary/10"
                      )}>
                        {isTeaser ? <Video className="w-6 h-6 text-amber-500" /> : <Film className="w-6 h-6 text-primary" />}
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold text-foreground">
                          {isTeaser ? `🎬 ${teaserLabel}` : `Episodio ${episodeNo}`}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          {episodeScenes.length} escenas • {episodeScenes.reduce((sum, s) => sum + (shots[s.id]?.length || 0), 0)} shots
                        </p>
                      </div>
                      {/* Duration counter */}
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Clock className="w-4 h-4" />
                        <span>{formatDuration(getEpisodeDuration(episodeNo))}</span>
                      </div>
                      <Badge variant={episodeScenes.length > 0 ? 'default' : 'secondary'} className={isTeaser ? "bg-amber-500/20 text-amber-700" : ""}>
                        {episodeScenes.length > 0 ? (isTeaser ? 'Promocional' : 'Con contenido') : 'Vacío'}
                      </Badge>
                      {/* Regenerate Episode Button - only for regular episodes */}
                      {!isTeaser && (
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            const scriptEp = scriptEpisodes.find((ep: any) => (ep.episode_number || 1) === episodeNo) || scriptEpisodes[episodeNo - 1];
                            setRegenerateEpisodeNo(episodeNo);
                            setRegenerateEpisodeSynopsis(scriptEp?.synopsis || '');
                            setShowRegenerateDialog(true);
                          }}
                          className="gap-1.5"
                        >
                          <RefreshCw className="w-4 h-4" />
                          Regenerar
                        </Button>
                      )}
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
                        <div key={scene.id} id={`scene-${scene.id}`} className="rounded-lg border border-border bg-card overflow-hidden">
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
                            <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); setEditingScene(scene); setShowEditDialog(true); }} title="Editar escena"><Edit2 className="w-4 h-4" /></Button>
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
                                    const hasMedia = render?.video_url;
                                    // Check for video: mp4, webm, or video in path, or Kling/Veo engines
                                    const isVideoEngine = render?.engine?.toLowerCase() === 'kling' || render?.engine?.toLowerCase() === 'veo';
                                    const isVideo = hasMedia && (
                                      render.video_url?.endsWith('.mp4') || 
                                      render.video_url?.endsWith('.webm') || 
                                      render.video_url?.includes('video') ||
                                      render.video_url?.includes('.mp4') ||
                                      isVideoEngine
                                    );
                                    const isImage = hasMedia && !isVideo;
                                    
                                    return (
                                      <div key={shot.id} className={cn("rounded-lg border transition-all overflow-hidden", shot.hero ? "bg-gradient-to-r from-primary/5 to-amber-500/5 border-primary/30" : "bg-card border-border")}>
                                        <div className="flex items-center gap-3 p-3">
                                          {/* Thumbnail preview */}
                                          {hasMedia ? (
                                            <div className="w-16 h-12 rounded bg-black flex items-center justify-center overflow-hidden shrink-0">
                                              {isVideo ? (
                                                <video
                                                  src={render.video_url!}
                                                  className="w-full h-full object-cover"
                                                  muted
                                                  preload="metadata"
                                                />
                                              ) : (
                                                <img
                                                  src={render.video_url!}
                                                  alt={`Shot ${shot.shot_no}`}
                                                  className="w-full h-full object-cover"
                                                />
                                              )}
                                            </div>
                                          ) : (
                                            <div className="w-16 h-12 rounded bg-muted flex items-center justify-center text-sm font-mono shrink-0">
                                              <span className="text-muted-foreground">{shot.shot_no}</span>
                                            </div>
                                          )}
                                          
                                          <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                              <span className="font-medium text-foreground capitalize">{shot.shot_type}</span>
                                              <span className="text-xs text-muted-foreground">{shot.duration_target}s</span>
                                              <Badge variant={shot.effective_mode === 'ULTRA' ? 'ultra' : 'cine'} className="text-xs">{shot.effective_mode}</Badge>
                                              {shot.hero && <Badge variant="hero" className="text-xs">HERO</Badge>}
                                              {render && (
                                                <Badge 
                                                  variant={render.status === 'succeeded' ? 'default' : 'secondary'}
                                                  className={cn("text-xs", render.status === 'succeeded' ? "bg-green-600" : render.status === 'failed' && "bg-amber-600")}
                                                >
                                                  <Video className="w-3 h-3 mr-1" />
                                                  {render.status === 'failed' ? 'Fallback' : render.engine?.toUpperCase()}
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
                                        
                                        {/* Expanded media preview */}
                                        {hasMedia && (
                                          <div className="border-t border-border bg-black/50 p-2">
                                            {isVideo ? (
                                              <video
                                                src={render.video_url!}
                                                controls
                                                className="w-full max-h-48 rounded object-contain"
                                                preload="metadata"
                                              />
                                            ) : (
                                              <img
                                                src={render.video_url!}
                                                alt={`Shot ${shot.shot_no} keyframe`}
                                                className="w-full max-h-48 rounded object-contain cursor-pointer hover:opacity-90 transition-opacity"
                                                onClick={() => window.open(render.video_url!, '_blank')}
                                              />
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}

                              {/* Shot Suggestion Panel */}
                              <ShotSuggestionPanel
                                sceneId={scene.id}
                                sceneSlugline={scene.slugline}
                                sceneSummary={scene.summary || undefined}
                                sceneTimeOfDay={scene.time_of_day || undefined}
                                characters={characters.filter(c => scene.character_ids?.includes(c.id))}
                                location={locations.find(l => l.id === scene.location_id)}
                                qualityMode={scene.quality_mode}
                                existingShotCount={shots[scene.id]?.length || 0}
                                onShotsAdded={() => fetchShots(scene.id)}
                              />

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
          });
          })()
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
      <Dialog open={showAIDialog} onOpenChange={(open) => {
        setShowAIDialog(open);
        if (open) {
          // Auto-load synopsis from script when dialog opens
          const epNo = parseInt(aiForm.episodeNo);
          const scriptEp = scriptEpisodes.find((ep: any) => (ep.episode_number || 1) === epNo) || scriptEpisodes[epNo - 1];
          if (scriptEp?.synopsis) {
            setAiForm(prev => ({ ...prev, synopsis: scriptEp.synopsis }));
          }
        }
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wand2 className="w-5 h-5 text-primary" />
              Generar Escenas con IA
            </DialogTitle>
            <DialogDescription>
              {scriptEpisodes.length > 0 
                ? 'La sinopsis se carga automáticamente del guión. Puedes editarla si lo deseas.'
                : 'La IA utilizará los personajes y localizaciones de tu bible para crear escenas coherentes'}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Episodio</Label>
                <Select 
                  value={aiForm.episodeNo} 
                  onValueChange={v => {
                    const epNo = parseInt(v);
                    const scriptEp = scriptEpisodes.find((ep: any) => (ep.episode_number || 1) === epNo) || scriptEpisodes[epNo - 1];
                    setAiForm({
                      ...aiForm, 
                      episodeNo: v,
                      synopsis: scriptEp?.synopsis || aiForm.synopsis
                    });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: episodesCount }, (_, i) => {
                      const scriptEp = scriptEpisodes.find((ep: any) => (ep.episode_number || 1) === i + 1) || scriptEpisodes[i];
                      const hasSynopsis = !!scriptEp?.synopsis;
                      return (
                        <SelectItem key={i + 1} value={String(i + 1)}>
                          Episodio {i + 1} {hasSynopsis && '✓'}
                        </SelectItem>
                      );
                    })}
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
              <div className="flex items-center justify-between">
                <Label>Sinopsis del Episodio {scriptEpisodes.length > 0 && <span className="text-xs text-green-500 ml-2">(del guión)</span>}</Label>
                {scriptEpisodes.length > 0 && !aiForm.synopsis && (
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => {
                      const epNo = parseInt(aiForm.episodeNo);
                      const scriptEp = scriptEpisodes.find((ep: any) => (ep.episode_number || 1) === epNo) || scriptEpisodes[epNo - 1];
                      if (scriptEp?.synopsis) {
                        setAiForm(prev => ({ ...prev, synopsis: scriptEp.synopsis }));
                        toast.success('Sinopsis cargada del guión');
                      }
                    }}
                  >
                    Cargar del guión
                  </Button>
                )}
              </div>
              <Textarea 
                value={aiForm.synopsis}
                onChange={e => setAiForm({...aiForm, synopsis: e.target.value})}
                placeholder={scriptEpisodes.length > 0 
                  ? "La sinopsis se carga automáticamente al seleccionar un episodio con guión..." 
                  : "Describe qué ocurre en este episodio: la trama principal, conflictos, giros importantes..."}
                rows={5}
              />
              {!aiForm.synopsis && scriptEpisodes.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  💡 Tip: Si generas un guión primero, la sinopsis se cargará automáticamente aquí
                </p>
              )}
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

      {/* Episode Regenerate Dialog */}
      <EpisodeRegenerateDialog
        open={showRegenerateDialog}
        onOpenChange={setShowRegenerateDialog}
        projectId={projectId}
        episodeNo={regenerateEpisodeNo}
        episodeSynopsis={regenerateEpisodeSynopsis}
        existingSceneCount={(scenesByEpisode[regenerateEpisodeNo] || []).length}
        onRegenerated={() => {
          fetchScenes();
          setExpandedEpisodes(prev => new Set(prev).add(regenerateEpisodeNo));
        }}
      />

      {/* Scene Edit Dialog */}
      <SceneEditDialog
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
        scene={editingScene}
        projectId={projectId}
        characters={characters}
        locations={locations}
        onSaved={() => {
          fetchScenes();
          setEditingScene(null);
        }}
      />
    </div>
  );
}
