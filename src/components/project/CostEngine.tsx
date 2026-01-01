import { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/contexts/LanguageContext';
import { toast } from 'sonner';
import { DollarSign, TrendingUp, TrendingDown, Settings, Loader2, Save, AlertTriangle, Clock, Film, Tv, FileDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { exportBudgetPDF } from '@/lib/exportBudgetPDF';

interface CostEngineProps { projectId: string; }

interface CostAssumptions {
  id: string;
  price_per_sec: number;
  currency: string;
  padding_low: number;
  padding_expected: number;
  padding_high: number;
  retry_cine_low: number;
  retry_cine_expected: number;
  retry_cine_high: number;
  retry_ultra_low: number;
  retry_ultra_expected: number;
  retry_ultra_high: number;
  retry_hero_low: number;
  retry_hero_expected: number;
  retry_hero_high: number;
  max_attempts_cine: number;
  max_attempts_ultra: number;
  max_attempts_hero: number;
}

interface SceneEstimate {
  scene_id: string;
  slugline: string;
  quality_mode: string;
  shot_count: number;
  total_duration: number;
  hero_count: number;
  episode_no: number;
  low: number;
  expected: number;
  high: number;
}

interface EpisodeEstimate {
  episode_no: number;
  scene_count: number;
  shot_count: number;
  total_duration: number;
  low: number;
  expected: number;
  high: number;
}

interface ProjectInfo {
  episodes_count: number;
  target_duration_min: number;
  budget_cap_project_eur: number | null;
  budget_cap_episode_eur: number | null;
  budget_cap_scene_eur: number | null;
}

export default function CostEngine({ projectId }: CostEngineProps) {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [assumptions, setAssumptions] = useState<CostAssumptions | null>(null);
  const [sceneEstimates, setSceneEstimates] = useState<SceneEstimate[]>([]);
  const [episodeEstimates, setEpisodeEstimates] = useState<EpisodeEstimate[]>([]);
  const [projectInfo, setProjectInfo] = useState<ProjectInfo | null>(null);
  const [projectTitle, setProjectTitle] = useState<string>('Proyecto');

  useEffect(() => {
    async function fetch() {
      // Fetch project info
      const { data: projectData } = await supabase
        .from('projects')
        .select('title, episodes_count, target_duration_min, budget_cap_project_eur, budget_cap_episode_eur, budget_cap_scene_eur')
        .eq('id', projectId)
        .single();
      
      if (projectData) {
        setProjectInfo(projectData);
        setProjectTitle(projectData.title || 'Proyecto');
      }

      // Fetch assumptions
      const { data: assumptionsData } = await supabase
        .from('cost_assumptions')
        .select('*')
        .eq('project_id', projectId)
        .maybeSingle();
      
      if (assumptionsData) {
        setAssumptions(assumptionsData);
      } else {
        const { data: newData } = await supabase
          .from('cost_assumptions')
          .insert({ project_id: projectId })
          .select()
          .single();
        setAssumptions(newData);
      }

      // Fetch scenes and shots for estimation
      const { data: scenes } = await supabase
        .from('scenes')
        .select('id, slugline, quality_mode, episode_no')
        .eq('project_id', projectId)
        .order('episode_no')
        .order('scene_no');

      if (scenes && (assumptionsData || assumptions)) {
        const a = assumptionsData || assumptions!;
        const sceneEsts: SceneEstimate[] = [];
        
        for (const scene of scenes) {
          const { data: shots } = await supabase
            .from('shots')
            .select('duration_target, hero, effective_mode')
            .eq('scene_id', scene.id);
          
          if (shots && shots.length > 0) {
            const shotCount = shots.length;
            const heroCount = shots.filter(s => s.hero).length;
            const totalDuration = shots.reduce((sum, s) => sum + (s.duration_target || 3), 0);
            
            const estimate = calculateSceneEstimate(
              shots,
              a,
              scene.quality_mode as 'CINE' | 'ULTRA'
            );
            
            sceneEsts.push({
              scene_id: scene.id,
              slugline: scene.slugline,
              quality_mode: scene.quality_mode,
              shot_count: shotCount,
              total_duration: totalDuration,
              hero_count: heroCount,
              episode_no: scene.episode_no,
              ...estimate
            });
          }
        }
        
        setSceneEstimates(sceneEsts);

        // Calculate episode estimates
        const episodeMap = new Map<number, EpisodeEstimate>();
        for (const scene of sceneEsts) {
          const existing = episodeMap.get(scene.episode_no) || {
            episode_no: scene.episode_no,
            scene_count: 0,
            shot_count: 0,
            total_duration: 0,
            low: 0,
            expected: 0,
            high: 0,
          };
          
          episodeMap.set(scene.episode_no, {
            ...existing,
            scene_count: existing.scene_count + 1,
            shot_count: existing.shot_count + scene.shot_count,
            total_duration: existing.total_duration + scene.total_duration,
            low: existing.low + scene.low,
            expected: existing.expected + scene.expected,
            high: existing.high + scene.high,
          });
        }
        
        setEpisodeEstimates(Array.from(episodeMap.values()).sort((a, b) => a.episode_no - b.episode_no));
      }
      
      setLoading(false);
    }
    fetch();
  }, [projectId]);

  const calculateSceneEstimate = (
    shots: Array<{ duration_target: number | null; hero: boolean | null; effective_mode: string }>,
    a: CostAssumptions,
    sceneMode: 'CINE' | 'ULTRA'
  ) => {
    let low = 0, expected = 0, high = 0;

    for (const shot of shots) {
      const duration = shot.duration_target || 3;
      const isHero = shot.hero;
      const mode = isHero ? 'ULTRA' : sceneMode;
      const takes = mode === 'ULTRA' ? 5 : 3;
      
      let retryLow, retryExpected, retryHigh;
      if (isHero) {
        retryLow = a.retry_hero_low;
        retryExpected = a.retry_hero_expected;
        retryHigh = a.retry_hero_high;
      } else if (mode === 'ULTRA') {
        retryLow = a.retry_ultra_low;
        retryExpected = a.retry_ultra_expected;
        retryHigh = a.retry_ultra_high;
      } else {
        retryLow = a.retry_cine_low;
        retryExpected = a.retry_cine_expected;
        retryHigh = a.retry_cine_high;
      }

      low += duration * a.price_per_sec * takes * (1 + a.padding_low) * (1 + retryLow);
      expected += duration * a.price_per_sec * takes * (1 + a.padding_expected) * (1 + retryExpected);
      high += duration * a.price_per_sec * takes * (1 + a.padding_high) * (1 + retryHigh);
    }

    return { low, expected, high };
  };

  const saveAssumptions = async () => {
    if (!assumptions) return;
    setSaving(true);
    const { error } = await supabase
      .from('cost_assumptions')
      .update(assumptions)
      .eq('id', assumptions.id);
    if (error) toast.error('Error al guardar');
    else toast.success('Configuración guardada');
    setSaving(false);
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  };

  const totalLow = sceneEstimates.reduce((sum, e) => sum + e.low, 0);
  const totalExpected = sceneEstimates.reduce((sum, e) => sum + e.expected, 0);
  const totalHigh = sceneEstimates.reduce((sum, e) => sum + e.high, 0);
  const totalDuration = sceneEstimates.reduce((sum, e) => sum + e.total_duration, 0);
  const overBudget = projectInfo?.budget_cap_project_eur && totalExpected > projectInfo.budget_cap_project_eur;

  if (loading) return <div className="p-6 flex justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground mb-1">{t.costEngine.title}</h2>
          <p className="text-muted-foreground">{t.costEngine.subtitle}</p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={() => {
              exportBudgetPDF({
                projectTitle,
                sceneEstimates,
                episodeEstimates,
                totalLow,
                totalExpected,
                totalHigh,
                totalDuration,
                budgetCap: projectInfo?.budget_cap_project_eur,
              });
              toast.success('PDF exportado correctamente');
            }}
            disabled={sceneEstimates.length === 0}
          >
            <FileDown className="w-4 h-4 mr-2" />
            Exportar PDF
          </Button>
          <Button variant="outline" onClick={() => setShowSettings(!showSettings)}>
            <Settings className="w-4 h-4 mr-2" />
            {t.costEngine.settings}
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingDown className="w-4 h-4" />
              {t.costEngine.low}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-foreground">€{totalLow.toFixed(2)}</p>
          </CardContent>
        </Card>
        
        <Card className={cn(overBudget && "border-destructive")}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <DollarSign className="w-4 h-4" />
              {t.costEngine.expected}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className={cn("text-2xl font-bold", overBudget ? "text-destructive" : "text-foreground")}>
              €{totalExpected.toFixed(2)}
            </p>
            {projectInfo?.budget_cap_project_eur && (
              <p className="text-xs text-muted-foreground mt-1">
                Límite: €{projectInfo.budget_cap_project_eur.toFixed(2)}
              </p>
            )}
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              {t.costEngine.high}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-foreground">€{totalHigh.toFixed(2)}</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Duración Total
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-foreground">{formatDuration(totalDuration)}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {sceneEstimates.length} escenas
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Budget warning */}
      {overBudget && (
        <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-destructive mt-0.5" />
          <div>
            <p className="font-medium text-destructive">{t.costEngine.overBudget}</p>
            <p className="text-sm text-muted-foreground mt-1">
              {t.costEngine.overBudgetDesc}
            </p>
          </div>
        </div>
      )}

      {/* Settings panel */}
      {showSettings && assumptions && (
        <Card>
          <CardHeader>
            <CardTitle>{t.costEngine.costAssumptions}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 gap-6">
              <div>
                <Label>{t.costEngine.pricePerSecond} (€)</Label>
                <Input 
                  type="number" 
                  step="0.01"
                  value={assumptions.price_per_sec}
                  onChange={e => setAssumptions({...assumptions, price_per_sec: parseFloat(e.target.value) || 0.05})}
                />
              </div>
              <div>
                <Label>{t.costEngine.currency}</Label>
                <Input value={assumptions.currency} disabled />
              </div>
            </div>

            <div>
              <Label className="mb-3 block">{t.costEngine.padding}</Label>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <span className="text-xs text-muted-foreground">{t.costEngine.low}</span>
                  <Input 
                    type="number" 
                    step="0.01"
                    value={assumptions.padding_low}
                    onChange={e => setAssumptions({...assumptions, padding_low: parseFloat(e.target.value) || 0.1})}
                  />
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">{t.costEngine.expected}</span>
                  <Input 
                    type="number" 
                    step="0.01"
                    value={assumptions.padding_expected}
                    onChange={e => setAssumptions({...assumptions, padding_expected: parseFloat(e.target.value) || 0.15})}
                  />
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">{t.costEngine.high}</span>
                  <Input 
                    type="number" 
                    step="0.01"
                    value={assumptions.padding_high}
                    onChange={e => setAssumptions({...assumptions, padding_high: parseFloat(e.target.value) || 0.2})}
                  />
                </div>
              </div>
            </div>

            <div>
              <Label className="mb-3 block">{t.costEngine.cineRetryRates}</Label>
              <div className="grid grid-cols-3 gap-4">
                <Input type="number" step="0.01" value={assumptions.retry_cine_low} onChange={e => setAssumptions({...assumptions, retry_cine_low: parseFloat(e.target.value) || 0.1})} />
                <Input type="number" step="0.01" value={assumptions.retry_cine_expected} onChange={e => setAssumptions({...assumptions, retry_cine_expected: parseFloat(e.target.value) || 0.15})} />
                <Input type="number" step="0.01" value={assumptions.retry_cine_high} onChange={e => setAssumptions({...assumptions, retry_cine_high: parseFloat(e.target.value) || 0.25})} />
              </div>
            </div>

            <div>
              <Label className="mb-3 block">{t.costEngine.ultraRetryRates}</Label>
              <div className="grid grid-cols-3 gap-4">
                <Input type="number" step="0.01" value={assumptions.retry_ultra_low} onChange={e => setAssumptions({...assumptions, retry_ultra_low: parseFloat(e.target.value) || 0.2})} />
                <Input type="number" step="0.01" value={assumptions.retry_ultra_expected} onChange={e => setAssumptions({...assumptions, retry_ultra_expected: parseFloat(e.target.value) || 0.4})} />
                <Input type="number" step="0.01" value={assumptions.retry_ultra_high} onChange={e => setAssumptions({...assumptions, retry_ultra_high: parseFloat(e.target.value) || 0.6})} />
              </div>
            </div>

            <Button variant="gold" onClick={saveAssumptions} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              <Save className="w-4 h-4 mr-2" />
              {t.costEngine.saveSettings}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Cost Breakdown Tabs */}
      <Tabs defaultValue="episodes" className="w-full">
        <TabsList>
          <TabsTrigger value="episodes" className="flex items-center gap-2">
            <Tv className="w-4 h-4" />
            Por Episodio
          </TabsTrigger>
          <TabsTrigger value="scenes" className="flex items-center gap-2">
            <Film className="w-4 h-4" />
            Por Escena
          </TabsTrigger>
        </TabsList>

        <TabsContent value="episodes" className="mt-4">
          {episodeEstimates.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                Añade escenas con planos para ver estimaciones por episodio
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {episodeEstimates.map((ep) => {
                const overEpBudget = projectInfo?.budget_cap_episode_eur && ep.expected > projectInfo.budget_cap_episode_eur;
                return (
                  <Card key={ep.episode_no} className={cn(overEpBudget && "border-destructive")}>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-4">
                        <div className="w-16 h-16 rounded-lg bg-primary/10 flex items-center justify-center">
                          <span className="text-2xl font-bold text-primary">{ep.episode_no}</span>
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-semibold text-foreground">Episodio {ep.episode_no}</h3>
                            {overEpBudget && (
                              <Badge variant="destructive">Sobre presupuesto</Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {ep.scene_count} escenas • {ep.shot_count} planos • {formatDuration(ep.total_duration)}
                          </p>
                        </div>
                        <div className="grid grid-cols-3 gap-6 text-right">
                          <div>
                            <p className="text-xs text-muted-foreground">{t.costEngine.low}</p>
                            <p className="font-semibold text-foreground">€{ep.low.toFixed(2)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">{t.costEngine.expected}</p>
                            <p className={cn("font-semibold", overEpBudget ? "text-destructive" : "text-foreground")}>
                              €{ep.expected.toFixed(2)}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">{t.costEngine.high}</p>
                            <p className="font-semibold text-foreground">€{ep.high.toFixed(2)}</p>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}

              {/* Series Total */}
              <Card className="bg-primary/5 border-primary/20">
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-lg bg-primary/20 flex items-center justify-center">
                      <Tv className="w-8 h-8 text-primary" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-foreground">Total Serie</h3>
                      <p className="text-sm text-muted-foreground">
                        {episodeEstimates.length} episodios • {formatDuration(totalDuration)}
                      </p>
                    </div>
                    <div className="grid grid-cols-3 gap-6 text-right">
                      <div>
                        <p className="text-xs text-muted-foreground">{t.costEngine.low}</p>
                        <p className="font-bold text-foreground text-lg">€{totalLow.toFixed(2)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">{t.costEngine.expected}</p>
                        <p className={cn("font-bold text-lg", overBudget ? "text-destructive" : "text-foreground")}>
                          €{totalExpected.toFixed(2)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">{t.costEngine.high}</p>
                        <p className="font-bold text-foreground text-lg">€{totalHigh.toFixed(2)}</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        <TabsContent value="scenes" className="mt-4">
          {sceneEstimates.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                {t.costEngine.addScenesForEstimates}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {sceneEstimates.map((scene) => {
                const overSceneBudget = projectInfo?.budget_cap_scene_eur && scene.expected > projectInfo.budget_cap_scene_eur;
                return (
                  <Card key={scene.scene_id} className={cn(overSceneBudget && "border-destructive/50")}>
                    <CardContent className="p-4 flex items-center gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="shrink-0">Ep {scene.episode_no}</Badge>
                          <p className="font-mono text-foreground truncate">{scene.slugline}</p>
                          <Badge variant={scene.quality_mode === 'ULTRA' ? 'ultra' : 'cine'}>
                            {scene.quality_mode}
                          </Badge>
                          {scene.hero_count > 0 && (
                            <Badge variant="hero">{scene.hero_count} hero</Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          {scene.shot_count} {t.costEngine.shots} • {formatDuration(scene.total_duration)}
                        </p>
                      </div>
                      <div className="shrink-0 grid grid-cols-3 gap-4 text-sm text-right">
                        <div>
                          <span className="text-muted-foreground">{t.costEngine.low}</span>
                          <p className="font-medium text-foreground">€{scene.low.toFixed(2)}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">{t.costEngine.expected}</span>
                          <p className={cn("font-medium", overSceneBudget ? "text-destructive" : "text-foreground")}>
                            €{scene.expected.toFixed(2)}
                          </p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">{t.costEngine.high}</span>
                          <p className="font-medium text-foreground">€{scene.high.toFixed(2)}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
