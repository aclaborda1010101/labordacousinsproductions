import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { Play, Pause, RotateCcw, CheckCircle, XCircle, Clock, Loader2, DollarSign, Clapperboard, AlertTriangle, Zap } from 'lucide-react';
import type { Database } from '@/integrations/supabase/types';

type JobStatus = Database['public']['Enums']['job_status'];
interface Job { id: string; type: string; status: JobStatus; payload: Record<string, any>; attempts: number; max_attempts: number; error: string | null; created_at: string; updated_at: string; }
interface Render { id: string; shot_id: string; status: JobStatus; cost_estimate: number | null; engine: string; take_label: string; created_at: string; }
interface RenderQueueProps { projectId: string; }

export default function RenderQueue({ projectId }: RenderQueueProps) {
  const { t } = useLanguage();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [renders, setRenders] = useState<Render[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCost, setTotalCost] = useState(0);

  const STATUS_CONFIG: Record<JobStatus, { label: string; icon: typeof Clock; color: string }> = {
    queued: { label: t.renderQueue.queued, icon: Clock, color: 'text-muted-foreground' },
    running: { label: t.renderQueue.running, icon: Loader2, color: 'text-blue-400' },
    succeeded: { label: t.renderQueue.succeeded, icon: CheckCircle, color: 'text-qc-pass' },
    failed: { label: t.renderQueue.failed, icon: XCircle, color: 'text-destructive' },
    blocked: { label: t.renderQueue.blocked, icon: AlertTriangle, color: 'text-warning' },
  };

  useEffect(() => {
    fetchData();
    const jobsChannel = supabase.channel('jobs-changes').on('postgres_changes', { event: '*', schema: 'public', table: 'jobs', filter: `project_id=eq.${projectId}` }, () => fetchData()).subscribe();
    const rendersChannel = supabase.channel('renders-changes').on('postgres_changes', { event: '*', schema: 'public', table: 'renders' }, () => fetchData()).subscribe();
    return () => { supabase.removeChannel(jobsChannel); supabase.removeChannel(rendersChannel); };
  }, [projectId]);

  async function fetchData() {
    const { data: jobsData } = await supabase.from('jobs').select('*').eq('project_id', projectId).order('created_at', { ascending: false });
    if (jobsData) setJobs(jobsData.map(j => ({ ...j, payload: (j.payload as Record<string, any>) || {}, attempts: j.attempts || 0, max_attempts: j.max_attempts || 3, status: j.status || 'queued' })));

    const { data: scenesData } = await supabase.from('scenes').select('id').eq('project_id', projectId);
    if (scenesData && scenesData.length > 0) {
      const { data: shotsData } = await supabase.from('shots').select('id').in('scene_id', scenesData.map(s => s.id));
      if (shotsData && shotsData.length > 0) {
        const { data: rendersData } = await supabase.from('renders').select('*').in('shot_id', shotsData.map(s => s.id)).order('created_at', { ascending: false });
        if (rendersData) {
          setRenders(rendersData.map(r => ({ ...r, status: r.status || 'queued', engine: r.engine || 'veo', take_label: r.take_label || 'A' })));
          setTotalCost(rendersData.reduce((sum, r) => sum + (r.cost_estimate || 0), 0));
        }
      }
    }
    setLoading(false);
  }

  async function retryJob(jobId: string) { await supabase.from('jobs').update({ status: 'queued', attempts: 0, error: null }).eq('id', jobId); toast.success(t.common.success); }
  async function cancelJob(jobId: string) { await supabase.from('jobs').update({ status: 'blocked' }).eq('id', jobId); toast.success(t.common.success); }

  const queuedCount = jobs.filter(j => j.status === 'queued').length + renders.filter(r => r.status === 'queued').length;
  const runningCount = jobs.filter(j => j.status === 'running').length + renders.filter(r => r.status === 'running').length;
  const completedCount = jobs.filter(j => j.status === 'succeeded').length + renders.filter(r => r.status === 'succeeded').length;
  const failedCount = jobs.filter(j => j.status === 'failed').length + renders.filter(r => r.status === 'failed').length;

  if (loading) return <div className="p-6"><div className="animate-pulse space-y-4"><div className="h-8 bg-muted rounded w-48" /><div className="h-24 bg-muted rounded" /></div></div>;

  return (
    <div className="p-6 space-y-6">
      <div><h2 className="text-xl font-semibold text-foreground">{t.renderQueue.title}</h2><p className="text-sm text-muted-foreground mt-1">{t.renderQueue.subtitle}</p></div>

      <div className="grid grid-cols-5 gap-4">
        <Card><CardContent className="p-4"><div className="flex items-center gap-2 text-muted-foreground mb-1"><Clock className="w-4 h-4" /><span className="text-xs">{t.renderQueue.queued}</span></div><p className="text-2xl font-bold text-foreground">{queuedCount}</p></CardContent></Card>
        <Card className={runningCount > 0 ? 'border-blue-500/50' : ''}><CardContent className="p-4"><div className="flex items-center gap-2 text-blue-400 mb-1"><Loader2 className={`w-4 h-4 ${runningCount > 0 ? 'animate-spin' : ''}`} /><span className="text-xs">{t.renderQueue.running}</span></div><p className="text-2xl font-bold text-foreground">{runningCount}</p></CardContent></Card>
        <Card><CardContent className="p-4"><div className="flex items-center gap-2 text-qc-pass mb-1"><CheckCircle className="w-4 h-4" /><span className="text-xs">{t.renderQueue.succeeded}</span></div><p className="text-2xl font-bold text-foreground">{completedCount}</p></CardContent></Card>
        <Card className={failedCount > 0 ? 'border-destructive/50' : ''}><CardContent className="p-4"><div className="flex items-center gap-2 text-destructive mb-1"><XCircle className="w-4 h-4" /><span className="text-xs">{t.renderQueue.failed}</span></div><p className="text-2xl font-bold text-foreground">{failedCount}</p></CardContent></Card>
        <Card className="border-primary/50 bg-primary/5"><CardContent className="p-4"><div className="flex items-center gap-2 text-primary mb-1"><DollarSign className="w-4 h-4" /><span className="text-xs">{t.renderQueue.totalCost}</span></div><p className="text-2xl font-bold text-foreground">€{totalCost.toFixed(2)}</p></CardContent></Card>
      </div>

      <Card><CardHeader><CardTitle className="text-base flex items-center gap-2"><Clapperboard className="w-5 h-5" />{t.renderQueue.activeRenders}</CardTitle></CardHeader><CardContent>
        {renders.length === 0 ? (<div className="text-center py-8"><Clapperboard className="w-10 h-10 text-muted-foreground mx-auto mb-2" /><p className="text-muted-foreground">{t.renderQueue.noRenders}</p></div>) : (
          <div className="space-y-3">{renders.slice(0, 10).map((render) => { const config = STATUS_CONFIG[render.status]; const Icon = config.icon; const isRunning = render.status === 'running'; return (<div key={render.id} className="p-4 rounded-lg border border-border bg-card"><div className="flex items-center justify-between mb-2"><div className="flex items-center gap-3"><div className={`w-8 h-8 rounded-lg flex items-center justify-center ${render.status === 'running' ? 'bg-blue-500/10' : 'bg-muted'}`}><Icon className={`w-4 h-4 ${config.color} ${isRunning ? 'animate-spin' : ''}`} /></div><div><p className="font-medium text-sm text-foreground">{t.renderQueue.take} {render.take_label}</p><p className="text-xs text-muted-foreground">{t.renderQueue.engine}: {render.engine}</p></div></div><div className="flex items-center gap-3">{render.cost_estimate && <Badge variant="outline" className="gap-1"><DollarSign className="w-3 h-3" />€{render.cost_estimate.toFixed(2)}</Badge>}<Badge variant={render.status === 'succeeded' ? 'pass' : render.status === 'failed' ? 'fail' : render.status === 'running' ? 'ultra' : 'outline'}>{config.label}</Badge></div></div>{isRunning && <Progress value={65} className="h-1.5" />}</div>); })}</div>
        )}
      </CardContent></Card>

      <Card><CardHeader><CardTitle className="text-base flex items-center gap-2"><Zap className="w-5 h-5" />{t.renderQueue.backgroundJobs}</CardTitle></CardHeader><CardContent>
        {jobs.length === 0 ? (<div className="text-center py-8"><Zap className="w-10 h-10 text-muted-foreground mx-auto mb-2" /><p className="text-muted-foreground">{t.renderQueue.noJobs}</p></div>) : (
          <div className="space-y-2">{jobs.map((job) => { const config = STATUS_CONFIG[job.status]; const Icon = config.icon; return (<div key={job.id} className="p-3 rounded-lg border border-border bg-card flex items-center justify-between"><div className="flex items-center gap-3"><Icon className={`w-4 h-4 ${config.color} ${job.status === 'running' ? 'animate-spin' : ''}`} /><div><p className="font-medium text-sm text-foreground">{job.type}</p><p className="text-xs text-muted-foreground">Attempt {job.attempts}/{job.max_attempts}</p></div></div><div className="flex items-center gap-2">{job.error && <span className="text-xs text-destructive max-w-[200px] truncate">{job.error}</span>}{job.status === 'failed' && <Button variant="ghost" size="sm" onClick={() => retryJob(job.id)}><RotateCcw className="w-4 h-4" /></Button>}{(job.status === 'queued' || job.status === 'running') && <Button variant="ghost" size="sm" onClick={() => cancelJob(job.id)}><Pause className="w-4 h-4" /></Button>}</div></div>); })}</div>
        )}
      </CardContent></Card>
    </div>
  );
}
