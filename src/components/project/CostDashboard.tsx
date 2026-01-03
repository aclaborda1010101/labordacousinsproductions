import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  DollarSign, 
  TrendingUp, 
  AlertTriangle, 
  Settings, 
  BarChart3,
  Calendar,
  Zap,
  Film,
  Users,
  MapPin,
  FileText,
  ImageIcon,
  Sparkles
} from 'lucide-react';

interface CostDashboardProps {
  projectId?: string;
}

interface UsageData {
  generations_count: number;
  generations_cost_usd: number;
  total_cost_usd: number;
  month: string;
}

interface BudgetSettings {
  daily_limit_usd: number;
  monthly_limit_usd: number;
  alert_threshold_percent: number;
  pause_on_exceed: boolean;
}

interface CostBreakdown {
  scripts: number;
  characters: number;
  locations: number;
  keyframes: number;
  shots: number;
  other: number;
}

export function CostDashboard({ projectId }: CostDashboardProps) {
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [budget, setBudget] = useState<BudgetSettings>({
    daily_limit_usd: 10,
    monthly_limit_usd: 100,
    alert_threshold_percent: 80,
    pause_on_exceed: false
  });
  const [todayCost, setTodayCost] = useState(0);
  const [loading, setLoading] = useState(true);
  const [savingBudget, setSavingBudget] = useState(false);
  const [costBreakdown, setCostBreakdown] = useState<CostBreakdown>({
    scripts: 0,
    characters: 0,
    locations: 0,
    keyframes: 0,
    shots: 0,
    other: 0
  });
  const [generationStats, setGenerationStats] = useState<{
    total: number;
    byType: Record<string, number>;
    byEngine: Record<string, number>;
  }>({ total: 0, byType: {}, byEngine: {} });

  useEffect(() => {
    loadData();
  }, [projectId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Load current month usage
      const currentMonth = new Date().toISOString().slice(0, 7) + '-01';
      const { data: usageData } = await supabase
        .from('user_usage')
        .select('*')
        .eq('user_id', user.id)
        .eq('month', currentMonth)
        .single();

      if (usageData) {
        setUsage(usageData);
      }

      // Load budget settings
      const { data: budgetData } = await supabase
        .from('user_budgets')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (budgetData) {
        setBudget(budgetData);
      }

      // Get today's cost from generation_logs
      const today = new Date().toISOString().slice(0, 10);
      const { data: todayLogs } = await supabase
        .from('generation_logs')
        .select('cost_usd, slot_type, engine')
        .eq('user_id', user.id)
        .gte('created_at', today);

      if (todayLogs) {
        const total = todayLogs.reduce((sum, log) => sum + (Number(log.cost_usd) || 0), 0);
        setTodayCost(total);
      }

      // Get cost breakdown by type (this month)
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);

      const { data: monthLogs } = await supabase
        .from('generation_logs')
        .select('cost_usd, slot_type, engine')
        .eq('user_id', user.id)
        .gte('created_at', monthStart.toISOString());

      if (monthLogs) {
        const breakdown: CostBreakdown = {
          scripts: 0,
          characters: 0,
          locations: 0,
          keyframes: 0,
          shots: 0,
          other: 0
        };
        const byType: Record<string, number> = {};
        const byEngine: Record<string, number> = {};

        monthLogs.forEach(log => {
          const cost = Number(log.cost_usd) || 0;
          const slotType = log.slot_type?.toLowerCase() || 'other';
          const engine = log.engine || 'unknown';

          // Aggregate by type for display
          byType[slotType] = (byType[slotType] || 0) + 1;
          byEngine[engine] = (byEngine[engine] || 0) + 1;

          // Categorize costs
          if (slotType.includes('script') || slotType.includes('episode') || slotType.includes('outline')) {
            breakdown.scripts += cost;
          } else if (slotType.includes('character') || slotType.includes('portrait') || slotType.includes('turnaround')) {
            breakdown.characters += cost;
          } else if (slotType.includes('location') || slotType.includes('environment')) {
            breakdown.locations += cost;
          } else if (slotType.includes('keyframe')) {
            breakdown.keyframes += cost;
          } else if (slotType.includes('shot') || slotType.includes('render')) {
            breakdown.shots += cost;
          } else {
            breakdown.other += cost;
          }
        });

        setCostBreakdown(breakdown);
        setGenerationStats({
          total: monthLogs.length,
          byType,
          byEngine
        });
      }
    } catch (error) {
      console.error('Error loading cost data:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveBudgetSettings = async () => {
    setSavingBudget(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('user_budgets')
        .upsert({
          user_id: user.id,
          ...budget,
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' });

      if (error) throw error;
      toast.success('Configuración de presupuesto guardada');
    } catch (error) {
      console.error('Error saving budget:', error);
      toast.error('Error al guardar configuración');
    } finally {
      setSavingBudget(false);
    }
  };

  const monthlyUsagePercent = budget.monthly_limit_usd > 0 
    ? ((usage?.total_cost_usd || 0) / budget.monthly_limit_usd) * 100 
    : 0;

  const dailyUsagePercent = budget.daily_limit_usd > 0
    ? (todayCost / budget.daily_limit_usd) * 100
    : 0;

  const isNearLimit = monthlyUsagePercent >= budget.alert_threshold_percent;
  const isOverLimit = monthlyUsagePercent >= 100;

  const totalBreakdownCost = Object.values(costBreakdown).reduce((a, b) => a + b, 0);

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'scripts': return <FileText className="h-4 w-4" />;
      case 'characters': return <Users className="h-4 w-4" />;
      case 'locations': return <MapPin className="h-4 w-4" />;
      case 'keyframes': return <ImageIcon className="h-4 w-4" />;
      case 'shots': return <Film className="h-4 w-4" />;
      default: return <Sparkles className="h-4 w-4" />;
    }
  };

  const getCategoryLabel = (category: string) => {
    const labels: Record<string, string> = {
      scripts: 'Guiones (Claude)',
      characters: 'Personajes (FAL)',
      locations: 'Localizaciones (FAL)',
      keyframes: 'Keyframes (FAL)',
      shots: 'Shots/Renders',
      other: 'Otros'
    };
    return labels[category] || category;
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Motor de Costes
            </CardTitle>
            <CardDescription>
              Seguimiento de costes de IA y límites de presupuesto
            </CardDescription>
          </div>
          {isNearLimit && (
            <Badge variant={isOverLimit ? "destructive" : "secondary"} className="flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              {isOverLimit ? 'Presupuesto excedido' : 'Cerca del límite'}
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent>
        <Tabs defaultValue="overview">
          <TabsList className="mb-4">
            <TabsTrigger value="overview">
              <BarChart3 className="h-4 w-4 mr-1" />
              Resumen
            </TabsTrigger>
            <TabsTrigger value="breakdown">
              <Sparkles className="h-4 w-4 mr-1" />
              Desglose por IA
            </TabsTrigger>
            <TabsTrigger value="settings">
              <Settings className="h-4 w-4 mr-1" />
              Configuración
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            {/* Quick Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 text-muted-foreground text-sm">
                    <Calendar className="h-4 w-4" />
                    Hoy
                  </div>
                  <div className="text-2xl font-bold mt-1">
                    ${todayCost.toFixed(2)}
                  </div>
                  <Progress 
                    value={Math.min(dailyUsagePercent, 100)} 
                    className="mt-2 h-1"
                  />
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 text-muted-foreground text-sm">
                    <TrendingUp className="h-4 w-4" />
                    Este Mes
                  </div>
                  <div className="text-2xl font-bold mt-1">
                    ${(usage?.total_cost_usd || 0).toFixed(2)}
                  </div>
                  <Progress 
                    value={Math.min(monthlyUsagePercent, 100)} 
                    className="mt-2 h-1"
                  />
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 text-muted-foreground text-sm">
                    <Zap className="h-4 w-4" />
                    Generaciones
                  </div>
                  <div className="text-2xl font-bold mt-1">
                    {generationStats.total || usage?.generations_count || 0}
                  </div>
                  <div className="text-xs text-muted-foreground mt-2">
                    Este mes
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 text-muted-foreground text-sm">
                    <DollarSign className="h-4 w-4" />
                    Coste Medio
                  </div>
                  <div className="text-2xl font-bold mt-1">
                    ${generationStats.total > 0
                      ? ((usage?.generations_cost_usd || 0) / generationStats.total).toFixed(3) 
                      : '0.00'}
                  </div>
                  <div className="text-xs text-muted-foreground mt-2">
                    Por generación
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Monthly Progress */}
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Uso del Presupuesto Mensual</span>
                  <span className="text-sm text-muted-foreground">
                    ${(usage?.total_cost_usd || 0).toFixed(2)} / ${budget.monthly_limit_usd.toFixed(2)}
                  </span>
                </div>
                <Progress 
                  value={Math.min(monthlyUsagePercent, 100)} 
                  className={`h-3 ${isOverLimit ? '[&>div]:bg-destructive' : isNearLimit ? '[&>div]:bg-yellow-500' : ''}`}
                />
                <div className="flex justify-between mt-2 text-xs text-muted-foreground">
                  <span>{monthlyUsagePercent.toFixed(1)}% usado</span>
                  <span>${(budget.monthly_limit_usd - (usage?.total_cost_usd || 0)).toFixed(2)} restante</span>
                </div>
              </CardContent>
            </Card>

            {/* Alert Banner */}
            {isNearLimit && (
              <Card className={isOverLimit ? 'border-destructive bg-destructive/5' : 'border-yellow-500 bg-yellow-500/5'}>
                <CardContent className="pt-4 flex items-center gap-3">
                  <AlertTriangle className={`h-5 w-5 ${isOverLimit ? 'text-destructive' : 'text-yellow-500'}`} />
                  <div>
                    <p className="font-medium">
                      {isOverLimit 
                        ? '¡Has excedido tu presupuesto mensual!' 
                        : `Has usado ${monthlyUsagePercent.toFixed(0)}% de tu presupuesto mensual`}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {budget.pause_on_exceed 
                        ? 'Las generaciones están pausadas hasta el próximo mes.' 
                        : 'Considera ajustar tu presupuesto en configuración.'}
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="breakdown" className="space-y-4">
            {/* Cost Breakdown by Category */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Desglose por Tipo de IA</CardTitle>
                <CardDescription>Costes del mes actual por categoría</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {Object.entries(costBreakdown)
                  .filter(([_, cost]) => cost > 0)
                  .sort(([, a], [, b]) => b - a)
                  .map(([category, cost]) => {
                    const percent = totalBreakdownCost > 0 ? (cost / totalBreakdownCost) * 100 : 0;
                    return (
                      <div key={category} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            {getCategoryIcon(category)}
                            <span>{getCategoryLabel(category)}</span>
                          </div>
                          <span className="font-medium">${cost.toFixed(2)}</span>
                        </div>
                        <Progress value={percent} className="h-2" />
                        <div className="text-xs text-muted-foreground text-right">
                          {percent.toFixed(1)}% del total
                        </div>
                      </div>
                    );
                  })}
                
                {totalBreakdownCost === 0 && (
                  <div className="text-center py-6 text-muted-foreground">
                    <Sparkles className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No hay costes registrados este mes</p>
                    <p className="text-xs mt-1">Los costes se registrarán automáticamente al generar contenido</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Generation Stats by Engine */}
            {Object.keys(generationStats.byEngine).length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Generaciones por Motor</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(generationStats.byEngine)
                      .sort(([, a], [, b]) => b - a)
                      .map(([engine, count]) => (
                        <div key={engine} className="flex items-center justify-between p-2 bg-muted/30 rounded">
                          <span className="text-sm truncate">{engine}</span>
                          <Badge variant="secondary">{count}</Badge>
                        </div>
                      ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Cost Estimations */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Tarifas de Referencia</CardTitle>
                <CardDescription>Costes aproximados por tipo de generación</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-2 text-sm">
                  <div className="flex justify-between p-2 bg-muted/30 rounded">
                    <span className="flex items-center gap-2"><FileText className="h-4 w-4" /> Episodio (Claude)</span>
                    <span className="font-mono">~$0.15-0.30</span>
                  </div>
                  <div className="flex justify-between p-2 bg-muted/30 rounded">
                    <span className="flex items-center gap-2"><Users className="h-4 w-4" /> Imagen personaje (FAL)</span>
                    <span className="font-mono">~$0.02-0.05</span>
                  </div>
                  <div className="flex justify-between p-2 bg-muted/30 rounded">
                    <span className="flex items-center gap-2"><MapPin className="h-4 w-4" /> Imagen localización (FAL)</span>
                    <span className="font-mono">~$0.03-0.08</span>
                  </div>
                  <div className="flex justify-between p-2 bg-muted/30 rounded">
                    <span className="flex items-center gap-2"><ImageIcon className="h-4 w-4" /> Keyframe (FAL)</span>
                    <span className="font-mono">~$0.02-0.04</span>
                  </div>
                  <div className="flex justify-between p-2 bg-muted/30 rounded">
                    <span className="flex items-center gap-2"><Film className="h-4 w-4" /> Video 5s (Kling/Veo)</span>
                    <span className="font-mono">~$0.10-0.25</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="settings" className="space-y-4">
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="daily-limit">Límite Diario (USD)</Label>
                <Input
                  id="daily-limit"
                  type="number"
                  step="0.01"
                  value={budget.daily_limit_usd}
                  onChange={(e) => setBudget({ ...budget, daily_limit_usd: parseFloat(e.target.value) || 0 })}
                />
                <p className="text-xs text-muted-foreground">
                  Gasto máximo por día antes de alertas
                </p>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="monthly-limit">Límite Mensual (USD)</Label>
                <Input
                  id="monthly-limit"
                  type="number"
                  step="1"
                  value={budget.monthly_limit_usd}
                  onChange={(e) => setBudget({ ...budget, monthly_limit_usd: parseFloat(e.target.value) || 0 })}
                />
                <p className="text-xs text-muted-foreground">
                  Presupuesto total para el mes
                </p>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="alert-threshold">Umbral de Alerta (%)</Label>
                <Input
                  id="alert-threshold"
                  type="number"
                  min="50"
                  max="100"
                  value={budget.alert_threshold_percent}
                  onChange={(e) => setBudget({ ...budget, alert_threshold_percent: parseInt(e.target.value) || 80 })}
                />
                <p className="text-xs text-muted-foreground">
                  Mostrar advertencia al superar este porcentaje
                </p>
              </div>

              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <Label>Pausar al Exceder</Label>
                  <p className="text-xs text-muted-foreground">
                    Pausar automáticamente las generaciones al exceder el presupuesto
                  </p>
                </div>
                <Switch
                  checked={budget.pause_on_exceed}
                  onCheckedChange={(checked) => setBudget({ ...budget, pause_on_exceed: checked })}
                />
              </div>

              <Button onClick={saveBudgetSettings} disabled={savingBudget}>
                {savingBudget ? 'Guardando...' : 'Guardar Configuración'}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

export default CostDashboard;