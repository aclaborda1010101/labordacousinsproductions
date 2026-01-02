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
  Zap
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

  useEffect(() => {
    loadData();
  }, []);

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
        .select('cost_usd')
        .eq('user_id', user.id)
        .gte('created_at', today);

      if (todayLogs) {
        const total = todayLogs.reduce((sum, log) => sum + (Number(log.cost_usd) || 0), 0);
        setTodayCost(total);
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
      toast.success('Budget settings saved');
    } catch (error) {
      console.error('Error saving budget:', error);
      toast.error('Failed to save budget settings');
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
              Cost Dashboard
            </CardTitle>
            <CardDescription>
              Track generation costs and set budget limits
            </CardDescription>
          </div>
          {isNearLimit && (
            <Badge variant={isOverLimit ? "destructive" : "secondary"} className="flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              {isOverLimit ? 'Over Budget' : 'Near Limit'}
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent>
        <Tabs defaultValue="overview">
          <TabsList className="mb-4">
            <TabsTrigger value="overview">
              <BarChart3 className="h-4 w-4 mr-1" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="settings">
              <Settings className="h-4 w-4 mr-1" />
              Budget Settings
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            {/* Quick Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 text-muted-foreground text-sm">
                    <Calendar className="h-4 w-4" />
                    Today
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
                    This Month
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
                    Generations
                  </div>
                  <div className="text-2xl font-bold mt-1">
                    {usage?.generations_count || 0}
                  </div>
                  <div className="text-xs text-muted-foreground mt-2">
                    This month
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 text-muted-foreground text-sm">
                    <DollarSign className="h-4 w-4" />
                    Avg Cost
                  </div>
                  <div className="text-2xl font-bold mt-1">
                    ${usage?.generations_count 
                      ? ((usage.generations_cost_usd || 0) / usage.generations_count).toFixed(3) 
                      : '0.00'}
                  </div>
                  <div className="text-xs text-muted-foreground mt-2">
                    Per generation
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Monthly Progress */}
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Monthly Budget Usage</span>
                  <span className="text-sm text-muted-foreground">
                    ${(usage?.total_cost_usd || 0).toFixed(2)} / ${budget.monthly_limit_usd.toFixed(2)}
                  </span>
                </div>
                <Progress 
                  value={Math.min(monthlyUsagePercent, 100)} 
                  className={`h-3 ${isOverLimit ? '[&>div]:bg-destructive' : isNearLimit ? '[&>div]:bg-yellow-500' : ''}`}
                />
                <div className="flex justify-between mt-2 text-xs text-muted-foreground">
                  <span>{monthlyUsagePercent.toFixed(1)}% used</span>
                  <span>${(budget.monthly_limit_usd - (usage?.total_cost_usd || 0)).toFixed(2)} remaining</span>
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
                        ? 'You have exceeded your monthly budget!' 
                        : `You've used ${monthlyUsagePercent.toFixed(0)}% of your monthly budget`}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {budget.pause_on_exceed 
                        ? 'New generations are paused until next month.' 
                        : 'Consider adjusting your budget in settings.'}
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="settings" className="space-y-4">
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="daily-limit">Daily Limit (USD)</Label>
                <Input
                  id="daily-limit"
                  type="number"
                  step="0.01"
                  value={budget.daily_limit_usd}
                  onChange={(e) => setBudget({ ...budget, daily_limit_usd: parseFloat(e.target.value) || 0 })}
                />
                <p className="text-xs text-muted-foreground">
                  Maximum spend per day before alerts trigger
                </p>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="monthly-limit">Monthly Limit (USD)</Label>
                <Input
                  id="monthly-limit"
                  type="number"
                  step="1"
                  value={budget.monthly_limit_usd}
                  onChange={(e) => setBudget({ ...budget, monthly_limit_usd: parseFloat(e.target.value) || 0 })}
                />
                <p className="text-xs text-muted-foreground">
                  Total budget for the calendar month
                </p>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="alert-threshold">Alert Threshold (%)</Label>
                <Input
                  id="alert-threshold"
                  type="number"
                  min="50"
                  max="100"
                  value={budget.alert_threshold_percent}
                  onChange={(e) => setBudget({ ...budget, alert_threshold_percent: parseInt(e.target.value) || 80 })}
                />
                <p className="text-xs text-muted-foreground">
                  Show warning when usage exceeds this percentage
                </p>
              </div>

              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <Label>Pause on Exceed</Label>
                  <p className="text-xs text-muted-foreground">
                    Automatically pause generations when budget is exceeded
                  </p>
                </div>
                <Switch
                  checked={budget.pause_on_exceed}
                  onCheckedChange={(checked) => setBudget({ ...budget, pause_on_exceed: checked })}
                />
              </div>

              <Button onClick={saveBudgetSettings} disabled={savingBudget}>
                {savingBudget ? 'Saving...' : 'Save Budget Settings'}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

export default CostDashboard;
