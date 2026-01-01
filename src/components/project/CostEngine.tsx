import { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/contexts/LanguageContext';
import { toast } from 'sonner';
import { DollarSign, TrendingUp, TrendingDown, Settings, Loader2, Save, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

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
  low: number;
  expected: number;
  high: number;
}

export default function CostEngine({ projectId }: CostEngineProps) {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [assumptions, setAssumptions] = useState<CostAssumptions | null>(null);
  const [estimates, setEstimates] = useState<SceneEstimate[]>([]);
  const [budgetCap, setBudgetCap] = useState<number | null>(null);

  useEffect(() => {
    async function fetch() {
      // Fetch assumptions
      const { data: assumptionsData } = await supabase
        .from('cost_assumptions')
        .select('*')
        .eq('project_id', projectId)
        .maybeSingle();
      
      if (assumptionsData) {
        setAssumptions(assumptionsData);
      } else {
        // Create default if none exists
        const { data: newData } = await supabase
          .from('cost_assumptions')
          .insert({ project_id: projectId })
          .select()
          .single();
        setAssumptions(newData);
      }

      // Fetch project budget cap
      const { data: projectData } = await supabase
        .from('projects')
        .select('budget_cap_project_eur')
        .eq('id', projectId)
        .single();
      setBudgetCap(projectData?.budget_cap_project_eur || null);

      // Fetch scenes and shots for estimation
      const { data: scenes } = await supabase
        .from('scenes')
        .select('id, slugline, quality_mode')
        .eq('project_id', projectId);

      if (scenes && assumptionsData) {
        const sceneEstimates: SceneEstimate[] = [];
        
        for (const scene of scenes) {
          const { data: shots } = await supabase
            .from('shots')
            .select('duration_target, hero, effective_mode')
            .eq('scene_id', scene.id);
          
          if (shots && shots.length > 0) {
            const shotCount = shots.length;
            const heroCount = shots.filter(s => s.hero).length;
            const totalDuration = shots.reduce((sum, s) => sum + (s.duration_target || 3), 0);
            
            // Calculate estimates
            const estimate = calculateSceneEstimate(
              shots,
              assumptionsData,
              scene.quality_mode as 'CINE' | 'ULTRA'
            );
            
            sceneEstimates.push({
              scene_id: scene.id,
              slugline: scene.slugline,
              quality_mode: scene.quality_mode,
              shot_count: shotCount,
              total_duration: totalDuration,
              hero_count: heroCount,
              ...estimate
            });
          }
        }
        
        setEstimates(sceneEstimates);
      }
      
      setLoading(false);
    }
    fetch();
  }, [projectId]);

  const calculateSceneEstimate = (
    shots: Array<{ duration_target: number; hero: boolean; effective_mode: string }>,
    a: CostAssumptions,
    sceneMode: 'CINE' | 'ULTRA'
  ) => {
    let low = 0, expected = 0, high = 0;

    for (const shot of shots) {
      const duration = shot.duration_target || 3;
      const isHero = shot.hero;
      const mode = isHero ? 'ULTRA' : sceneMode;
      const takes = mode === 'ULTRA' ? 5 : 3;
      
      // Get retry rates based on mode
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

      // Cost formula: duration * price * takes * (1 + padding) * (1 + retry)
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
    if (error) toast.error('Failed to save');
    else toast.success('Cost settings saved');
    setSaving(false);
  };

  const totalLow = estimates.reduce((sum, e) => sum + e.low, 0);
  const totalExpected = estimates.reduce((sum, e) => sum + e.expected, 0);
  const totalHigh = estimates.reduce((sum, e) => sum + e.high, 0);
  const overBudget = budgetCap && totalExpected > budgetCap;

  if (loading) return <div className="p-6 flex justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground mb-1">{t.costEngine.title}</h2>
          <p className="text-muted-foreground">{t.costEngine.subtitle}</p>
        </div>
        <Button variant="outline" onClick={() => setShowSettings(!showSettings)}>
          <Settings className="w-4 h-4" />
          {t.costEngine.settings}
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="panel p-5">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <TrendingDown className="w-4 h-4" />
            <span className="text-sm">Low</span>
          </div>
          <div className="text-2xl font-bold text-foreground">
            €{totalLow.toFixed(2)}
          </div>
        </div>
        <div className={cn("panel p-5", overBudget && "border-destructive")}>
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <DollarSign className="w-4 h-4" />
            <span className="text-sm">Expected</span>
          </div>
          <div className={cn("text-2xl font-bold", overBudget ? "text-destructive" : "text-foreground")}>
            €{totalExpected.toFixed(2)}
          </div>
          {budgetCap && (
            <div className="text-xs text-muted-foreground mt-1">
              Cap: €{budgetCap.toFixed(2)}
            </div>
          )}
        </div>
        <div className="panel p-5">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <TrendingUp className="w-4 h-4" />
            <span className="text-sm">High</span>
          </div>
          <div className="text-2xl font-bold text-foreground">
            €{totalHigh.toFixed(2)}
          </div>
        </div>
      </div>

      {/* Budget warning */}
      {overBudget && (
        <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-destructive mt-0.5" />
          <div>
            <p className="font-medium text-destructive">Over Budget</p>
            <p className="text-sm text-muted-foreground mt-1">
              Expected cost exceeds budget cap by €{(totalExpected - (budgetCap || 0)).toFixed(2)}. 
              Consider reducing ULTRA scenes, limiting hero shots, or adjusting durations.
            </p>
          </div>
        </div>
      )}

      {/* Settings panel */}
      {showSettings && assumptions && (
        <div className="panel p-6 space-y-6">
          <h3 className="font-semibold text-foreground">Cost Assumptions</h3>
          
          <div className="grid grid-cols-2 gap-6">
            <div>
              <Label>Price per Second (€)</Label>
              <Input 
                type="number" 
                step="0.01"
                value={assumptions.price_per_sec}
                onChange={e => setAssumptions({...assumptions, price_per_sec: parseFloat(e.target.value) || 0.05})}
              />
            </div>
            <div>
              <Label>Currency</Label>
              <Input value={assumptions.currency} disabled />
            </div>
          </div>

          <div>
            <Label className="mb-3 block">Padding (extra duration for montage)</Label>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <span className="text-xs text-muted-foreground">Low</span>
                <Input 
                  type="number" 
                  step="0.01"
                  value={assumptions.padding_low}
                  onChange={e => setAssumptions({...assumptions, padding_low: parseFloat(e.target.value) || 0.1})}
                />
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Expected</span>
                <Input 
                  type="number" 
                  step="0.01"
                  value={assumptions.padding_expected}
                  onChange={e => setAssumptions({...assumptions, padding_expected: parseFloat(e.target.value) || 0.15})}
                />
              </div>
              <div>
                <span className="text-xs text-muted-foreground">High</span>
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
            <Label className="mb-3 block">CINE Retry Rates</Label>
            <div className="grid grid-cols-3 gap-4">
              <Input type="number" step="0.01" value={assumptions.retry_cine_low} onChange={e => setAssumptions({...assumptions, retry_cine_low: parseFloat(e.target.value) || 0.1})} />
              <Input type="number" step="0.01" value={assumptions.retry_cine_expected} onChange={e => setAssumptions({...assumptions, retry_cine_expected: parseFloat(e.target.value) || 0.15})} />
              <Input type="number" step="0.01" value={assumptions.retry_cine_high} onChange={e => setAssumptions({...assumptions, retry_cine_high: parseFloat(e.target.value) || 0.25})} />
            </div>
          </div>

          <div>
            <Label className="mb-3 block">ULTRA Retry Rates</Label>
            <div className="grid grid-cols-3 gap-4">
              <Input type="number" step="0.01" value={assumptions.retry_ultra_low} onChange={e => setAssumptions({...assumptions, retry_ultra_low: parseFloat(e.target.value) || 0.2})} />
              <Input type="number" step="0.01" value={assumptions.retry_ultra_expected} onChange={e => setAssumptions({...assumptions, retry_ultra_expected: parseFloat(e.target.value) || 0.4})} />
              <Input type="number" step="0.01" value={assumptions.retry_ultra_high} onChange={e => setAssumptions({...assumptions, retry_ultra_high: parseFloat(e.target.value) || 0.6})} />
            </div>
          </div>

          <Button variant="gold" onClick={saveAssumptions} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            <Save className="w-4 h-4" />
            Save Settings
          </Button>
        </div>
      )}

      {/* Scene breakdown */}
      <div>
        <h3 className="font-semibold text-foreground mb-4">Scene Breakdown</h3>
        {estimates.length === 0 ? (
          <div className="panel p-8 text-center text-muted-foreground">
            Add scenes with shots to see cost estimates
          </div>
        ) : (
          <div className="space-y-2">
            {estimates.map((scene) => (
              <div key={scene.scene_id} className="panel p-4 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-mono text-foreground truncate">{scene.slugline}</p>
                    <Badge variant={scene.quality_mode === 'ULTRA' ? 'ultra' : 'cine'}>
                      {scene.quality_mode}
                    </Badge>
                    {scene.hero_count > 0 && (
                      <Badge variant="hero">{scene.hero_count} hero</Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {scene.shot_count} shots • {scene.total_duration.toFixed(1)}s total
                  </p>
                </div>
                <div className="text-right shrink-0 grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Low</span>
                    <p className="font-medium text-foreground">€{scene.low.toFixed(2)}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Exp</span>
                    <p className="font-medium text-foreground">€{scene.expected.toFixed(2)}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">High</span>
                    <p className="font-medium text-foreground">€{scene.high.toFixed(2)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
