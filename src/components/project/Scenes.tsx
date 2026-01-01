import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/contexts/LanguageContext';
import { toast } from 'sonner';
import { Plus, Clapperboard, Loader2, Trash2, ChevronDown, ChevronRight, Star, Film, Sparkles, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ScenesProps { projectId: string; bibleReady: boolean; }
type QualityMode = 'CINE' | 'ULTRA';

interface Scene { id: string; scene_no: number; episode_no: number; slugline: string; summary: string | null; quality_mode: QualityMode; priority: string; approved: boolean; }
interface Shot { id: string; shot_no: number; shot_type: string; duration_target: number; hero: boolean; effective_mode: QualityMode; dialogue_text: string | null; }

export default function Scenes({ projectId, bibleReady }: ScenesProps) {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [shots, setShots] = useState<Record<string, Shot[]>>({});
  const [expandedScenes, setExpandedScenes] = useState<Set<string>>(new Set());
  const [newSlugline, setNewSlugline] = useState('');

  const fetchScenes = async () => {
    const { data } = await supabase.from('scenes').select('*').eq('project_id', projectId).order('episode_no').order('scene_no');
    setScenes(data || []);
    setLoading(false);
  };

  const fetchShots = async (sceneId: string) => {
    const { data } = await supabase.from('shots').select('*').eq('scene_id', sceneId).order('shot_no');
    setShots(prev => ({ ...prev, [sceneId]: data || [] }));
  };

  useEffect(() => { fetchScenes(); }, [projectId]);

  const toggleScene = (sceneId: string) => {
    const newExpanded = new Set(expandedScenes);
    if (newExpanded.has(sceneId)) { newExpanded.delete(sceneId); } 
    else { newExpanded.add(sceneId); if (!shots[sceneId]) fetchShots(sceneId); }
    setExpandedScenes(newExpanded);
  };

  const addScene = async () => {
    if (!newSlugline.trim()) return;
    const nextSceneNo = scenes.length > 0 ? Math.max(...scenes.map(s => s.scene_no)) + 1 : 1;
    const { error } = await supabase.from('scenes').insert({ project_id: projectId, scene_no: nextSceneNo, episode_no: 1, slugline: newSlugline.trim(), quality_mode: 'CINE', priority: 'P1' });
    if (error) toast.error(t.common.error);
    else { toast.success(t.common.success); setNewSlugline(''); fetchScenes(); }
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

  const deleteShot = async (shotId: string, sceneId: string) => { await supabase.from('shots').delete().eq('id', shotId); fetchShots(sceneId); };

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
      <div>
        <h2 className="text-2xl font-bold text-foreground mb-1">{t.scenes.title}</h2>
        <p className="text-muted-foreground">{t.scenes.subtitle}</p>
      </div>

      <div className="flex gap-4 text-sm">
        <div className="flex items-center gap-2"><Badge variant="cine">CINE</Badge><span className="text-muted-foreground">{t.scenes.qualityModes.CINE}</span></div>
        <div className="flex items-center gap-2"><Badge variant="ultra">ULTRA</Badge><span className="text-muted-foreground">{t.scenes.qualityModes.ULTRA}</span></div>
        <div className="flex items-center gap-2"><Badge variant="hero">HERO</Badge><span className="text-muted-foreground">{t.scenes.qualityModes.HERO}</span></div>
      </div>

      <div className="flex gap-2">
        <Input placeholder={t.scenes.sluglinePlaceholder} value={newSlugline} onChange={e => setNewSlugline(e.target.value)} onKeyDown={e => e.key === 'Enter' && addScene()} className="font-mono" />
        <Button variant="gold" onClick={addScene}><Plus className="w-4 h-4" />{t.scenes.addScene}</Button>
      </div>

      <div className="space-y-3">
        {scenes.length === 0 ? (
          <div className="panel p-8 text-center"><Clapperboard className="w-10 h-10 mx-auto text-muted-foreground mb-3" /><p className="text-muted-foreground">{t.scenes.noScenes}</p></div>
        ) : scenes.map(scene => (
          <div key={scene.id} className="panel overflow-hidden">
            <div className="p-4 flex items-center gap-4 cursor-pointer hover:bg-muted/30 transition-colors" onClick={() => toggleScene(scene.id)}>
              {expandedScenes.has(scene.id) ? <ChevronDown className="w-5 h-5 text-muted-foreground" /> : <ChevronRight className="w-5 h-5 text-muted-foreground" />}
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0"><span className="font-mono text-primary font-bold">{scene.scene_no}</span></div>
              <div className="flex-1 min-w-0">
                <p className="font-mono text-foreground truncate">{scene.slugline}</p>
                <p className="text-sm text-muted-foreground">{t.scenes.episode} {scene.episode_no} • {shots[scene.id]?.length || 0} shots</p>
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
                  <Button size="sm" variant="outline" onClick={() => addShot(scene.id, scene.quality_mode)}><Plus className="w-3 h-3" />{t.scenes.addShot}</Button>
                </div>

                {!shots[scene.id] || shots[scene.id].length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">{t.scenes.noShots}</p>
                ) : (
                  <div className="grid gap-2">
                    {shots[scene.id].map(shot => (
                      <div key={shot.id} className={cn("flex items-center gap-3 p-3 rounded-lg border transition-all", shot.hero ? "bg-gradient-to-r from-primary/5 to-amber-500/5 border-primary/30" : "bg-card border-border")}>
                        <div className="w-8 h-8 rounded bg-muted flex items-center justify-center text-sm font-mono">{shot.shot_no}</div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-foreground capitalize">{shot.shot_type}</span>
                            <span className="text-xs text-muted-foreground">{shot.duration_target}s</span>
                            <Badge variant={shot.effective_mode === 'ULTRA' ? 'ultra' : 'cine'} className="text-xs">{shot.effective_mode}</Badge>
                            {shot.hero && <Badge variant="hero" className="text-xs">HERO</Badge>}
                          </div>
                          {shot.dialogue_text && <p className="text-sm text-muted-foreground truncate mt-0.5">{shot.dialogue_text}</p>}
                        </div>
                        <button onClick={() => toggleHeroShot(shot.id, scene.id, shot.hero, scene.quality_mode)} className={cn("p-2 rounded-lg transition-all", shot.hero ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-primary")}><Star className="w-4 h-4" fill={shot.hero ? 'currentColor' : 'none'} /></button>
                        <Button variant="ghost" size="icon" onClick={() => deleteShot(shot.id, scene.id)}><Trash2 className="w-4 h-4" /></Button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex items-start gap-2 p-3 rounded-lg bg-primary/5 border border-primary/10">
                  <Sparkles className="w-4 h-4 text-primary mt-0.5" />
                  <div className="text-xs"><p className="font-medium text-foreground">{t.scenes.sosTip}</p><p className="text-muted-foreground">{t.scenes.sosTipDesc}</p></div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
