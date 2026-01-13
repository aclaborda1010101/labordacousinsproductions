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
import { Plus, Clapperboard, Loader2, Trash2, ChevronDown, ChevronRight, Star, Sparkles, Lock, Wand2, FileDown, Video, Film, Copy, Clock, Settings, Play, Camera, RefreshCw, Palette, AlertTriangle, Edit2, Zap, Eye, Layout, FileText, Image as ImageIcon, BookOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { exportStoryboardPDF } from '@/lib/exportStoryboardPDF';
import ShotEditor from './ShotEditor';
import ShotSuggestionPanel from './ShotSuggestionPanel';
import EpisodeRegenerateDialog from './EpisodeRegenerateDialog';
import { ShortTemplatePanel } from './ShortTemplatePanel';
import { useShortTemplate } from '@/hooks/useShortTemplate';
import { useEditorialKnowledgeBase } from '@/hooks/useEditorialKnowledgeBase';
import { runTemplateQAChecks, TemplateQAWarning } from '@/lib/shortTemplates';
import SceneEditDialog from './SceneEditDialog';
import { extractSceneContent, suggestShotCount } from '@/lib/sceneNormalizer';
import { ProductionReviewModal } from './ProductionReviewModal';
import { ProductionProposal } from '@/types/production';
import { StoryboardPanelView } from './StoryboardPanelView';
import { TechnicalDocEditor } from './TechnicalDocEditor';
import { KeyframesPanel } from './KeyframesPanel';
import { SceneScreenplayView } from './SceneScreenplayView';

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
  const [generatingShotsFor, setGeneratingShotsFor] = useState<string | null>(null);
  const [scriptRawText, setScriptRawText] = useState<string>('');
  const [technicalDocStatus, setTechnicalDocStatus] = useState<Record<string, 'draft' | 'approved' | 'locked' | null>>({});
  
  // Production Proposal flow state
  const [productionProposals, setProductionProposals] = useState<Map<string, ProductionProposal>>(new Map());
  const [showProductionReview, setShowProductionReview] = useState(false);
  const [generatingProposals, setGeneratingProposals] = useState(false);
  const [approvingProposals, setApprovingProposals] = useState(false);

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
    
    // Fetch technical doc status for keyframes tab
    fetchTechnicalDocStatus(sceneId);
  };

  const fetchTechnicalDocStatus = async (sceneId: string) => {
    const { data } = await supabase
      .from('scene_technical_docs')
      .select('status')
      .eq('scene_id', sceneId)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();
    
    setTechnicalDocStatus(prev => ({
      ...prev,
      [sceneId]: (data?.status as 'draft' | 'approved' | 'locked') || null
    }));
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
    // Load script to get episode synopses, check for breakdown, and store raw text
    supabase.from('scripts').select('parsed_json, raw_text').eq('project_id', projectId).order('created_at', { ascending: false }).limit(1).single().then(({ data }) => {
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
      // Store raw text for scene content extraction
      if (data?.raw_text) {
        setScriptRawText(data.raw_text);
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

  // Sync scenes from script breakdown AND generate PRODUCTION PROPOSALS (not shots yet)
  const handleSyncFromScript = async () => {
    setSyncing(true);
    setGeneratingProposals(true);
    try {
      // Get script breakdown
      const { data: script } = await supabase
        .from('scripts')
        .select('parsed_json, raw_text')
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
      const rawText = script.raw_text || scriptRawText;

      if (sceneList.length === 0) {
        toast.error('El guión no tiene escenas para sincronizar');
        return;
      }

      // Build location name -> id map
      const locationMap = new Map(locations.map(l => [l.name.toLowerCase().trim(), l.id]));
      
      // Build character name -> id map
      const characterMap = new Map(characters.map(c => [c.name.toLowerCase().trim(), c.id]));

      let updatedCount = 0;
      const scenesToProcess: Scene[] = [];
      
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

        // Extract scene content from raw text
        const sceneContent = extractSceneContent(rawText, sceneNumber, slugline);

        // Update scene with full content
        const { error } = await supabase
          .from('scenes')
          .update({
            slugline: slugline || dbScene.slugline,
            time_of_day: timeOfDay || dbScene.time_of_day,
            location_id: locationId || dbScene.location_id,
            character_ids: characterIds.length > 0 ? characterIds : dbScene.character_ids,
            summary: sceneContent.summary || sceneData.summary || sceneData.description || dbScene.summary,
            parsed_json: {
              dialogues: sceneContent.dialogues,
              actions: sceneContent.actions,
              mood: sceneContent.mood,
              characters_extracted: [...new Set(sceneContent.dialogues.map(d => d.character))],
            }
          })
          .eq('id', dbScene.id);

        if (!error) {
          updatedCount++;
          scenesToProcess.push({
            ...dbScene,
            slugline: slugline || dbScene.slugline,
            time_of_day: timeOfDay || dbScene.time_of_day,
            location_id: locationId || dbScene.location_id,
            character_ids: characterIds.length > 0 ? characterIds : dbScene.character_ids,
            summary: sceneContent.summary || sceneData.summary || dbScene.summary,
          });
        }
      }

      toast.success(`${updatedCount} escenas sincronizadas. Generando propuestas de producción...`);
      await fetchScenes();

      // GENERATE PRODUCTION PROPOSALS using shot-suggest (NOT inserting shots yet)
      const newProposals = new Map<string, ProductionProposal>();
      const MAX_PARALLEL = 2;
      
      for (let i = 0; i < scenesToProcess.length; i += MAX_PARALLEL) {
        const batch = scenesToProcess.slice(i, i + MAX_PARALLEL);
        
        const results = await Promise.all(batch.map(async (scene) => {
          try {
            const sceneContent = extractSceneContent(rawText, scene.scene_no, scene.slugline);
            const sceneLocation = locations.find(l => l.id === scene.location_id);
            const sceneCharacters = characters.filter(c => scene.character_ids?.includes(c.id));
            
            // Get breakdown data for this scene for fallback
            const parsed = (await supabase.from('scripts').select('parsed_json').eq('project_id', projectId).order('created_at', { ascending: false }).limit(1).single()).data?.parsed_json as any;
            const breakdown = parsed?.breakdown_pro || parsed?.breakdown;
            const sceneList = breakdown?.scenes?.list || breakdown?.scene_list || parsed?.scenes?.list || parsed?.scene_list || [];
            const sceneBreakdown = sceneList.find((s: any) => (s.scene_number || s.number) === scene.scene_no);
            
            // FALLBACK: if extractSceneContent returns empty, use breakdown data
            const dialogueArray = sceneContent.dialogues.length > 0
              ? sceneContent.dialogues.map(d => ({ character: d.character, line: d.text, parenthetical: undefined }))
              : (sceneBreakdown?.dialogue || []).map((d: any) => ({
                  character: d.character || 'PERSONAJE',
                  line: d.text || d.line || '',
                  parenthetical: undefined
                }));

            const actionText = sceneContent.actions.length > 0
              ? sceneContent.actions.join(' ')
              : sceneBreakdown?.action || sceneBreakdown?.description || scene.summary || 'Escena sin descripción detallada';

            const moodText = sceneContent.mood || sceneBreakdown?.mood || 'neutral';
            const summaryText = scene.summary || sceneContent.summary || sceneBreakdown?.summary || sceneBreakdown?.description || '';

            console.log(`[Scenes] Scene ${scene.scene_no} content:`, { 
              dialoguesCount: dialogueArray.length, 
              actionLength: actionText.length,
              mood: moodText,
              usingFallback: sceneContent.dialogues.length === 0 
            });

            // Call shot-suggest to get production proposal
            const { data, error } = await supabase.functions.invoke('shot-suggest', {
              body: {
                projectId,
                sceneId: scene.id,
                scene: {
                  slugline: scene.slugline,
                  summary: summaryText,
                  action: actionText,
                  dialogue: dialogueArray,
                  quality_mode: scene.quality_mode,
                  time_of_day: scene.time_of_day || 'DAY',
                  mood: moodText,
                },
                characters: sceneCharacters.map(c => ({
                  id: c.id,
                  name: c.name,
                  token: c.token,
                  has_refs: !!c.turnaround_urls,
                })),
                location: sceneLocation ? {
                  id: sceneLocation.id,
                  name: sceneLocation.name,
                  token: sceneLocation.token,
                  has_refs: !!sceneLocation.reference_urls,
                } : undefined,
                language: 'es',
              }
            });

            if (error) {
              console.error(`Error generating proposal for scene ${scene.scene_no}:`, error);
              return null;
            }

            // Transform response into ProductionProposal
            const proposal: ProductionProposal = {
              sceneId: scene.id,
              scene_analysis: data.scene_analysis || {
                emotional_arc: 'No analizado',
                visual_strategy: 'Estándar',
                coverage_approach: 'Classical',
                key_moments: [],
              },
              scene_setup: data.scene_setup || {
                camera_package: { body: 'ARRI_Alexa35', codec: 'ProRes4444', fps: 24, shutter_angle: 180, iso_target: 800 },
                lens_set: { family: 'ARRI_Signature_Prime', look: 'Modern_Clinical', available_focals: [24, 35, 50, 85] },
                lighting_plan: { key_style: 'Natural', color_temp_base_k: 5600, practicals: [], contrast_ratio: '2:1' },
                audio_plan: { room_tone: 'Interior silencioso', ambience_layers: [], foley_priorities: [] },
              },
              shots: (data.shots || []).map((shot: any, idx: number) => ({
                shot_id: shot.shot_id || `S${String(idx + 1).padStart(2, '0')}`,
                shot_no: shot.shot_no || idx + 1,
                shot_type: shot.shot_type || 'Medium',
                coverage_type: shot.coverage_type || 'Single',
                story_purpose: shot.story_purpose || 'dialogue_focus',
                effective_mode: shot.effective_mode || scene.quality_mode,
                hero: shot.hero || false,
                camera_variation: shot.camera_variation || {
                  focal_mm: 50,
                  aperture: 'T2.8',
                  movement: 'Static',
                  height: 'EyeLevel',
                  stabilization: 'Tripod',
                },
                blocking_min: shot.blocking_min || {
                  subject_positions: '',
                  screen_direction: '',
                  axis_180_compliant: true,
                  action: shot.blocking_min?.action || '',
                  dialogue: shot.blocking_min?.dialogue || null,
                },
                duration_estimate_sec: shot.duration_estimate_sec || 4,
                hold_ms: shot.hold_ms,
                edit_intent: shot.edit_intent,
                continuity: shot.continuity,
                characters_in_frame: shot.characters_in_frame,
                ai_risks: shot.ai_risks || [],
                risk_mitigation: shot.risk_mitigation,
                transition_in: shot.transition_in,
                transition_out: shot.transition_out,
                sound_cue: shot.sound_cue,
              })),
              sequence_summary: data.sequence_summary || {
                total_duration_sec: 30,
                shot_count: data.shots?.length || 0,
                coverage_completeness: 'FULL',
                edit_rhythm: 'Medium',
                keyframes_required: (data.shots?.length || 0) * 4,
                estimated_cost_tier: scene.quality_mode,
              },
              qc_gates: data.qc_gates,
              production_warnings: data.production_warnings || [],
              generated_at: new Date().toISOString(),
              status: 'pending',
            };

            return { sceneId: scene.id, proposal };
          } catch (err) {
            console.error(`Error generating proposal for scene ${scene.scene_no}:`, err);
            return null;
          }
        }));

        // Add successful proposals to map
        results.forEach(result => {
          if (result) {
            newProposals.set(result.sceneId, result.proposal);
          }
        });
      }

      setProductionProposals(newProposals);
      
      if (newProposals.size > 0) {
        setShowProductionReview(true);
        toast.success(`${newProposals.size} propuestas de producción generadas. Revisa y aprueba.`);
      } else {
        toast.error('No se pudieron generar propuestas de producción');
      }
    } catch (error) {
      console.error('Error syncing from script:', error);
      toast.error('Error al sincronizar desde guión');
    } finally {
      setSyncing(false);
      setGeneratingProposals(false);
    }
  };

  // Approve production proposals and insert shots + micro-shots
  const handleApproveProposals = async () => {
    setApprovingProposals(true);
    try {
      let totalShotsInserted = 0;
      
      for (const [sceneId, proposal] of productionProposals) {
        // Delete existing shots for clean insertion
        await supabase.from('shots').delete().eq('scene_id', sceneId);
        
        // Insert shots from the approved proposal
        for (const shot of proposal.shots) {
          const { data: insertedShot, error: insertError } = await supabase.from('shots').insert({
            scene_id: sceneId,
            shot_no: shot.shot_no,
            shot_type: shot.shot_type.toLowerCase(),
            duration_target: shot.duration_estimate_sec,
            effective_mode: shot.effective_mode,
            hero: shot.hero,
            camera: {
              movement: shot.camera_variation.movement,
              focal_mm: shot.camera_variation.focal_mm,
              aperture: shot.camera_variation.aperture,
              height: shot.camera_variation.height,
              stabilization: shot.camera_variation.stabilization,
              lens: proposal.scene_setup.lens_set.family,
            },
            blocking: shot.blocking_min.action,
            dialogue_text: shot.blocking_min.dialogue,
            lighting: {
              style: proposal.scene_setup.lighting_plan.key_style,
              color_temp: proposal.scene_setup.lighting_plan.color_temp_base_k,
            },
            sound_plan: {
              room_tone: proposal.scene_setup.audio_plan.room_tone,
              ambience: proposal.scene_setup.audio_plan.ambience_layers,
            },
            story_purpose: shot.story_purpose,
            ai_risk: shot.ai_risks,
            continuity_notes: shot.continuity?.anchors?.join(', '),
            edit_intent: shot.edit_intent?.rhythm_note,
            coverage_type: shot.coverage_type,
          }).select().single();

          if (!insertError && insertedShot) {
            totalShotsInserted++;
            
            // AUTO-CREATE MICRO-SHOTS for this shot
            await supabase.rpc('subdivide_shot_into_microshots', {
              p_shot_id: insertedShot.id,
              p_micro_duration: 2
            });
          }
        }
        
        // Update proposal status
        proposal.status = 'approved';
      }

      toast.success(`${totalShotsInserted} shots insertados con micro-shots`);
      setShowProductionReview(false);
      setProductionProposals(new Map());
      
      // Refresh shots for all processed scenes
      for (const sceneId of productionProposals.keys()) {
        fetchShots(sceneId);
      }
      
      await fetchScenes();
    } catch (error) {
      console.error('Error approving proposals:', error);
      toast.error('Error al aprobar propuestas');
    } finally {
      setApprovingProposals(false);
    }
  };

  // Update a specific production proposal
  const handleUpdateProposal = (sceneId: string, proposal: ProductionProposal) => {
    setProductionProposals(prev => {
      const newMap = new Map(prev);
      newMap.set(sceneId, proposal);
      return newMap;
    });
  };

  // Generate shots + auto-create micro-shots
  const generateShotsForSceneWithMicroShots = async (scene: Scene) => {
    try {
      // Extract scene content from raw text
      const sceneContent = extractSceneContent(scriptRawText, scene.scene_no, scene.slugline);
      const suggestedCount = suggestShotCount(sceneContent);
      
      // Get location details
      const sceneLocation = locations.find(l => l.id === scene.location_id);
      
      // Get character details for this scene
      const sceneCharacters = characters.filter(c => 
        scene.character_ids?.includes(c.id)
      );

      // If no characters from character_ids, try to extract from content
      const characterNames = sceneContent.dialogues.length > 0 
        ? [...new Set(sceneContent.dialogues.map(d => d.character))]
        : sceneCharacters.map(c => c.name);

      // Delete existing shots for clean regeneration
      await supabase.from('shots').delete().eq('scene_id', scene.id);

      // Generate shots one by one
      const shotsToGenerate = suggestedCount;
      const generatedShots: any[] = [];

      for (let i = 0; i < shotsToGenerate; i++) {
        const prevShot = generatedShots[i - 1];
        const dialogueForShot = sceneContent.dialogues[i] || null;
        
        const { data, error } = await supabase.functions.invoke('generate-shot-details', {
          body: {
            project: {
              title: projectTitle,
              visual_style_bible: visualStyle,
              quality_mode_default: scene.quality_mode,
            },
            scene: {
              slugline: scene.slugline,
              scene_summary: scene.summary || sceneContent.summary,
              scene_mood: sceneContent.mood,
              previous_shot_context: prevShot?.fills?.viewer_notice || null,
            },
            shot: {
              shot_index: i + 1,
              effective_mode: scene.quality_mode,
              duration_sec: 3,
              current_fields: {
                dialogue: dialogueForShot?.text || '',
              }
            },
            location: sceneLocation ? {
              name: sceneLocation.name,
              time_of_day: scene.time_of_day || 'DAY',
            } : undefined,
            characters: characterNames.map(name => ({
              name,
              reference_images_available: sceneCharacters.some(c => c.name === name && c.turnaround_urls),
            })),
          }
        });

        if (error) {
          console.error(`Error generating shot ${i + 1}:`, error);
          continue;
        }

        const fills = data?.fills || {};
        
        // Insert the generated shot
        const { data: insertedShot, error: insertError } = await supabase.from('shots').insert({
          scene_id: scene.id,
          shot_no: i + 1,
          shot_type: fills.shot_type?.toLowerCase() || 'medium',
          duration_target: fills.duration_sec || 3,
          effective_mode: fills.prompt_video?.quality_mode || scene.quality_mode,
          dialogue_text: dialogueForShot?.text || fills.dialogue || null,
          hero: i === 0, // First shot is hero by default
          camera: {
            movement: fills.camera_movement,
            details: fills.camera_details,
            lens: fills.lens,
            composition: fills.composition,
          },
          blocking: fills.blocking_action,
          lighting: fills.lighting,
          sound_plan: fills.sound_design,
          keyframe_hints: fills.keyframes,
          edit_intent: fills.editing_intent,
          ai_risk: fills.ai_risk,
          continuity_notes: fills.continuity,
          story_purpose: fills.intention,
        }).select().single();

        if (!insertError && insertedShot) {
          generatedShots.push({ ...insertedShot, fills });
          
          // AUTO-CREATE MICRO-SHOTS for this shot
          await supabase.rpc('subdivide_shot_into_microshots', {
            p_shot_id: insertedShot.id,
            p_micro_duration: 2 // 2 second micro-shots
          });
        }
      }

      console.log(`[Scene ${scene.scene_no}] Generated ${generatedShots.length} shots with micro-shots`);
    } catch (error) {
      console.error(`Error generating shots for scene ${scene.scene_no}:`, error);
    }
  };

  // Generate detailed shots for a scene using AI (with micro-shots)
  const generateShotsForScene = async (scene: Scene) => {
    setGeneratingShotsFor(scene.id);
    try {
      await generateShotsForSceneWithMicroShots(scene);
      toast.success(`Shots y micro-shots generados para escena ${scene.scene_no}`);
      fetchShots(scene.id);
    } catch (error) {
      console.error('Error generating shots:', error);
      toast.error('Error al generar shots');
    } finally {
      setGeneratingShotsFor(null);
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
              variant="gold" 
              onClick={handleSyncFromScript}
              disabled={syncing || generatingProposals}
            >
              {syncing || generatingProposals ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Eye className="w-4 h-4 mr-2" />}
              {syncing ? 'Hidratando...' : generatingProposals ? 'Generando propuestas...' : 'Hidratar + Propuesta de Producción'}
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
                            <div className="border-t border-border bg-muted/20 p-4">
                              <Tabs defaultValue="screenplay" className="w-full">
                                <TabsList className="mb-4">
                                  {/* P0: Tab Guion - Vista de guion por escena */}
                                  <TabsTrigger value="screenplay" className="gap-2">
                                    <BookOpen className="w-4 h-4" />
                                    Guion
                                  </TabsTrigger>
                                  <TabsTrigger value="storyboard" className="gap-2">
                                    <Layout className="w-4 h-4" />
                                    Storyboard
                                  </TabsTrigger>
                                  <TabsTrigger value="technical" className="gap-2">
                                    <FileText className="w-4 h-4" />
                                    Doc. Técnico
                                  </TabsTrigger>
                                  <TabsTrigger value="shots" className="gap-2">
                                    <Camera className="w-4 h-4" />
                                    Shots
                                    {shots[scene.id]?.length > 0 && (
                                      <Badge variant="secondary" className="ml-1 text-xs">{shots[scene.id].length}</Badge>
                                    )}
                                  </TabsTrigger>
                                  <TabsTrigger value="keyframes" className="gap-2">
                                    <ImageIcon className="w-4 h-4" />
                                    Keyframes
                                  </TabsTrigger>
                                </TabsList>

                                {/* SCREENPLAY TAB - P0: Vista de guion derivada */}
                                <TabsContent value="screenplay" className="space-y-4">
                                  <SceneScreenplayView
                                    projectId={projectId}
                                    episodeNo={scene.episode_no}
                                    sceneNo={scene.scene_no}
                                    slugline={scene.slugline}
                                  />
                                </TabsContent>

                                {/* STORYBOARD TAB */}
                                <TabsContent value="storyboard" className="space-y-4">
                                  <StoryboardPanelView
                                    sceneId={scene.id}
                                    projectId={projectId}
                                    sceneText={scene.summary || scene.slugline}
                                    visualStyle={visualStyle || undefined}
                                    characterRefs={scene.character_ids?.map(cid => {
                                      const char = characters.find(c => c.id === cid);
                                      return char ? { name: char.name, image_url: (char.turnaround_urls as string[])?.[0] } : { name: cid };
                                    })}
                                    locationRef={scene.location_id ? (() => {
                                      const loc = locations.find(l => l.id === scene.location_id);
                                      return loc ? { name: loc.name, image_url: (loc.reference_urls as any)?.[0] } : undefined;
                                    })() : undefined}
                                  />
                                </TabsContent>

                                {/* TECHNICAL DOC TAB */}
                                <TabsContent value="technical" className="space-y-4">
                                  <TechnicalDocEditor
                                    sceneId={scene.id}
                                    projectId={projectId}
                                    sceneSlugline={scene.slugline}
                                    visualStyle={visualStyle || undefined}
                                    charactersInScene={scene.character_ids?.map(cid => {
                                      const char = characters.find(c => c.id === cid);
                                      return char?.name || cid;
                                    })}
                                  />
                                </TabsContent>

                                {/* SHOTS TAB - Original content */}
                                <TabsContent value="shots" className="space-y-3">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-sm font-medium text-foreground">{t.scenes.shots}</span>
                                    <div className="flex gap-2">
                                      <Button 
                                        size="sm" 
                                        variant="gold"
                                        onClick={() => generateShotsForScene(scene)}
                                        disabled={generatingShotsFor === scene.id}
                                      >
                                        {generatingShotsFor === scene.id ? (
                                          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                                        ) : (
                                          <Zap className="w-3 h-3 mr-1" />
                                        )}
                                        Generar Shots
                                      </Button>
                                      <Button size="sm" variant="outline" onClick={() => addShot(scene.id, scene.quality_mode)}>
                                        <Plus className="w-3 h-3 mr-1" />{t.scenes.addShot}
                                      </Button>
                                    </div>
                                  </div>

                                  {/* Scene content preview */}
                                  {scriptRawText && (
                                    <div className="text-xs text-muted-foreground bg-muted/30 p-2 rounded">
                                      {(() => {
                                        const content = extractSceneContent(scriptRawText, scene.scene_no, scene.slugline);
                                        if (content.dialogues.length > 0 || content.actions.length > 0) {
                                          return (
                                            <div className="space-y-1">
                                              {content.dialogues.length > 0 && (
                                                <span className="flex gap-2">
                                                  <strong>Diálogos:</strong> 
                                                  {content.dialogues.slice(0, 3).map((d, i) => (
                                                    <span key={i} className="text-foreground">{d.character}</span>
                                                  ))}
                                                  {content.dialogues.length > 3 && <span>+{content.dialogues.length - 3} más</span>}
                                                </span>
                                              )}
                                              {content.mood !== 'neutral' && (
                                                <span className="text-primary capitalize">Mood: {content.mood}</span>
                                              )}
                                            </div>
                                          );
                                        }
                                        return <span className="opacity-50">Sin contenido extraído del guión</span>;
                                      })()}
                                    </div>
                                  )}

                                  {!shots[scene.id] || shots[scene.id].length === 0 ? (
                                    <p className="text-sm text-muted-foreground text-center py-4">{t.scenes.noShots}</p>
                                  ) : (
                                    <div className="grid gap-2">
                                      {shots[scene.id].map(shot => {
                                        const render = getShotRender(shot.id);
                                        const hasMedia = render?.video_url;
                                        const isVideoEngine = render?.engine?.toLowerCase() === 'kling' || render?.engine?.toLowerCase() === 'veo';
                                        const isVideo = hasMedia && (
                                          render.video_url?.endsWith('.mp4') || 
                                          render.video_url?.endsWith('.webm') || 
                                          render.video_url?.includes('video') ||
                                          render.video_url?.includes('.mp4') ||
                                          isVideoEngine
                                        );
                                        
                                        return (
                                          <div key={shot.id} className={cn("rounded-lg border transition-all overflow-hidden", shot.hero ? "bg-gradient-to-r from-primary/5 to-amber-500/5 border-primary/30" : "bg-card border-border")}>
                                            <div className="flex items-center gap-3 p-3">
                                              {hasMedia ? (
                                                <div className="w-16 h-12 rounded bg-black flex items-center justify-center overflow-hidden shrink-0">
                                                  {isVideo ? (
                                                    <video src={render.video_url!} className="w-full h-full object-cover" muted preload="metadata" />
                                                  ) : (
                                                    <img src={render.video_url!} alt={`Shot ${shot.shot_no}`} className="w-full h-full object-cover" />
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
                                              
                                              <Button size="sm" variant={render ? "outline" : "gold"} className="h-8" onClick={() => openShotEditor(shot, scene)}>
                                                <Settings className="w-3 h-3 mr-1" />
                                                {render ? 'Editar' : 'Configurar'}
                                              </Button>
                                              
                                              <button onClick={() => toggleHeroShot(shot.id, scene.id, shot.hero, scene.quality_mode)} className={cn("p-2 rounded-lg transition-all", shot.hero ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-primary")}>
                                                <Star className="w-4 h-4" fill={shot.hero ? 'currentColor' : 'none'} />
                                              </button>
                                              <Button variant="ghost" size="icon" onClick={() => deleteShot(shot.id, scene.id)}><Trash2 className="w-4 h-4" /></Button>
                                            </div>
                                            
                                            {hasMedia && (
                                              <div className="border-t border-border bg-black/50 p-2">
                                                {isVideo ? (
                                                  <video src={render.video_url!} controls className="w-full max-h-48 rounded object-contain" preload="metadata" />
                                                ) : (
                                                  <img src={render.video_url!} alt={`Shot ${shot.shot_no} keyframe`} className="w-full max-h-48 rounded object-contain cursor-pointer hover:opacity-90 transition-opacity" onClick={() => window.open(render.video_url!, '_blank')} />
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
                                </TabsContent>

                                {/* KEYFRAMES TAB */}
                                <TabsContent value="keyframes" className="space-y-4">
                                  <KeyframesPanel
                                    sceneId={scene.id}
                                    projectId={projectId}
                                    sceneSlugline={scene.slugline}
                                    sceneSummary={scene.summary || undefined}
                                    technicalDocStatus={technicalDocStatus[scene.id] || null}
                                    characters={characters.filter(c => scene.character_ids?.includes(c.id))}
                                    location={locations.find(l => l.id === scene.location_id)}
                                    visualStyle={visualStyle || undefined}
                                  />
                                </TabsContent>
                              </Tabs>
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

      {/* Production Review Modal */}
      <ProductionReviewModal
        open={showProductionReview}
        onOpenChange={setShowProductionReview}
        proposals={productionProposals}
        scenes={scenes.map(s => ({ id: s.id, scene_no: s.scene_no, episode_no: s.episode_no, slugline: s.slugline }))}
        onUpdateProposal={handleUpdateProposal}
        onApprove={handleApproveProposals}
        isApproving={approvingProposals}
      />
    </div>
  );
}
