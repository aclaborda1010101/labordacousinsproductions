import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { 
  CheckCircle, 
  XCircle, 
  AlertTriangle,
  Gauge,
  Music,
  Eye,
  Clock,
  Lock,
  Unlock,
  RefreshCw,
  FileWarning
} from 'lucide-react';

interface QCScore {
  continuity: number;
  audio: number;
  rhythm: number;
  overall: number;
}

interface QCReport {
  id: string;
  module: string;
  score: number;
  status: string;
  issues: Array<{ type: string; description: string; severity: string }>;
  scene_id?: string;
  shot_id?: string;
  created_at: string;
}

interface QCEngineProps {
  projectId: string;
}

const QC_THRESHOLDS = {
  CINE: 75,
  ULTRA: 90,
  HERO: 95,
};

const MODULE_CONFIG = {
  continuity: { 
    label: 'Continuity', 
    icon: Eye, 
    description: 'Character consistency, location matching, props continuity',
    checks: ['Character appearance', 'Costume consistency', 'Prop placement', 'Location matching']
  },
  audio: { 
    label: 'Audio', 
    icon: Music, 
    description: 'Dialogue sync, ambient sound, music timing',
    checks: ['Lip sync accuracy', 'Ambient levels', 'Music cues', 'Sound effects']
  },
  rhythm: { 
    label: 'Rhythm', 
    icon: Clock, 
    description: 'Pacing, edit timing, scene flow',
    checks: ['Shot pacing', 'Cut timing', 'Scene transitions', 'Emotional beats']
  },
};

export default function QCEngine({ projectId }: QCEngineProps) {
  const [scores, setScores] = useState<QCScore>({ continuity: 0, audio: 0, rhythm: 0, overall: 0 });
  const [reports, setReports] = useState<QCReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [exportBlocked, setExportBlocked] = useState(false);

  useEffect(() => {
    fetchQCData();
  }, [projectId]);

  async function fetchQCData() {
    const { data, error } = await supabase
      .from('qc_reports')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching QC reports:', error);
      toast.error('Failed to load QC data');
      return;
    }

    if (data && data.length > 0) {
      // Calculate aggregate scores by module
      const moduleScores: Record<string, number[]> = { continuity: [], audio: [], rhythm: [] };
      
      data.forEach(report => {
        if (moduleScores[report.module]) {
          moduleScores[report.module].push(report.score || 0);
        }
      });

      const avgScores = {
        continuity: moduleScores.continuity.length > 0 
          ? Math.round(moduleScores.continuity.reduce((a, b) => a + b, 0) / moduleScores.continuity.length)
          : 0,
        audio: moduleScores.audio.length > 0
          ? Math.round(moduleScores.audio.reduce((a, b) => a + b, 0) / moduleScores.audio.length)
          : 0,
        rhythm: moduleScores.rhythm.length > 0
          ? Math.round(moduleScores.rhythm.reduce((a, b) => a + b, 0) / moduleScores.rhythm.length)
          : 0,
        overall: 0,
      };

      avgScores.overall = Math.round((avgScores.continuity + avgScores.audio + avgScores.rhythm) / 3);
      
      setScores(avgScores);
      setReports(data.map(r => ({
        ...r,
        issues: (r.issues as any) || []
      })));
      
      // Block export if below CINE threshold
      setExportBlocked(avgScores.overall < QC_THRESHOLDS.CINE);
    }
    
    setLoading(false);
  }

  async function runQCCheck() {
    setRunning(true);
    
    // Simulate QC analysis
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Generate mock QC results
    const modules = ['continuity', 'audio', 'rhythm'];
    const newReports: Partial<QCReport>[] = [];
    
    for (const module of modules) {
      const score = Math.floor(Math.random() * 30) + 70; // 70-100
      const issues: Array<{ type: string; description: string; severity: string }> = [];
      
      if (score < 90) {
        issues.push({
          type: 'warning',
          description: `Minor ${module} inconsistency detected`,
          severity: 'medium'
        });
      }
      if (score < 80) {
        issues.push({
          type: 'error',
          description: `${module.charAt(0).toUpperCase() + module.slice(1)} issue needs attention`,
          severity: 'high'
        });
      }
      
      const { error } = await supabase.from('qc_reports').insert({
        project_id: projectId,
        module,
        score,
        status: score >= QC_THRESHOLDS.CINE ? 'pass' : 'fail',
        issues: issues as any,
      });
      
      if (error) {
        console.error('Error creating QC report:', error);
      }
    }
    
    toast.success('QC analysis complete');
    setRunning(false);
    fetchQCData();
  }

  function getScoreColor(score: number) {
    if (score >= QC_THRESHOLDS.HERO) return 'text-qc-pass';
    if (score >= QC_THRESHOLDS.ULTRA) return 'text-blue-400';
    if (score >= QC_THRESHOLDS.CINE) return 'text-primary';
    return 'text-destructive';
  }

  function getScoreBadge(score: number) {
    if (score >= QC_THRESHOLDS.HERO) return { label: 'HERO Ready', variant: 'pass' as const };
    if (score >= QC_THRESHOLDS.ULTRA) return { label: 'ULTRA Ready', variant: 'ultra' as const };
    if (score >= QC_THRESHOLDS.CINE) return { label: 'CINE Ready', variant: 'cine' as const };
    return { label: 'Below Threshold', variant: 'fail' as const };
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-48" />
          <div className="h-24 bg-muted rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground">QC Engine</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Automated quality control for continuity, audio, and rhythm
          </p>
        </div>
        <Button variant="gold" onClick={runQCCheck} disabled={running}>
          <RefreshCw className={`w-4 h-4 mr-2 ${running ? 'animate-spin' : ''}`} />
          {running ? 'Analyzing...' : 'Run QC Check'}
        </Button>
      </div>

      {/* Export gate */}
      <Card className={exportBlocked ? 'border-destructive bg-destructive/5' : 'border-qc-pass bg-qc-pass/5'}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {exportBlocked ? (
                <Lock className="w-8 h-8 text-destructive" />
              ) : (
                <Unlock className="w-8 h-8 text-qc-pass" />
              )}
              <div>
                <p className="font-medium text-foreground">
                  {exportBlocked ? 'Export Blocked' : 'Export Ready'}
                </p>
                <p className="text-sm text-muted-foreground">
                  {exportBlocked 
                    ? `Overall score ${scores.overall}% is below CINE threshold (${QC_THRESHOLDS.CINE}%)`
                    : `Quality standards met - ready for export`
                  }
                </p>
              </div>
            </div>
            <Button 
              variant={exportBlocked ? 'outline' : 'gold'}
              disabled={exportBlocked}
            >
              Export Project
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Overall score */}
      <Card>
        <CardContent className="p-6">
          <div className="text-center mb-6">
            <Gauge className={`w-16 h-16 mx-auto mb-2 ${getScoreColor(scores.overall)}`} />
            <div className={`text-5xl font-bold ${getScoreColor(scores.overall)}`}>
              {scores.overall}%
            </div>
            <p className="text-muted-foreground mt-1">Overall QC Score</p>
            <Badge variant={getScoreBadge(scores.overall).variant} className="mt-2">
              {getScoreBadge(scores.overall).label}
            </Badge>
          </div>

          {/* Threshold markers */}
          <div className="relative h-4 bg-muted rounded-full overflow-hidden mb-2">
            <div 
              className={`absolute left-0 top-0 h-full transition-all ${getScoreColor(scores.overall)} bg-current opacity-30`}
              style={{ width: `${scores.overall}%` }}
            />
            <div 
              className={`absolute left-0 top-0 h-full bg-current ${getScoreColor(scores.overall)}`}
              style={{ width: `${Math.min(scores.overall, 100)}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>0%</span>
            <span className="text-destructive">CINE {QC_THRESHOLDS.CINE}%</span>
            <span className="text-blue-400">ULTRA {QC_THRESHOLDS.ULTRA}%</span>
            <span className="text-qc-pass">HERO {QC_THRESHOLDS.HERO}%</span>
            <span>100%</span>
          </div>
        </CardContent>
      </Card>

      {/* Module scores */}
      <div className="grid grid-cols-3 gap-4">
        {Object.entries(MODULE_CONFIG).map(([key, config]) => {
          const score = scores[key as keyof typeof scores] || 0;
          const Icon = config.icon;
          
          return (
            <Card key={key}>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <Icon className="w-5 h-5 text-muted-foreground" />
                  <CardTitle className="text-base">{config.label}</CardTitle>
                </div>
                <CardDescription>{config.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-end gap-2 mb-3">
                  <span className={`text-3xl font-bold ${getScoreColor(score)}`}>{score}%</span>
                  {score >= QC_THRESHOLDS.CINE ? (
                    <CheckCircle className="w-5 h-5 text-qc-pass mb-1" />
                  ) : (
                    <XCircle className="w-5 h-5 text-destructive mb-1" />
                  )}
                </div>
                <Progress value={score} className="h-2 mb-3" />
                <div className="space-y-1">
                  {config.checks.map((check, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <CheckCircle className="w-3 h-3 text-muted-foreground" />
                      <span className="text-muted-foreground">{check}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Recent issues */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileWarning className="w-5 h-5" />
            Recent Issues
          </CardTitle>
          <CardDescription>Issues detected in the latest QC analysis</CardDescription>
        </CardHeader>
        <CardContent>
          {reports.filter(r => r.issues && r.issues.length > 0).length === 0 ? (
            <div className="text-center py-6">
              <CheckCircle className="w-10 h-10 text-qc-pass mx-auto mb-2" />
              <p className="text-muted-foreground">No issues detected</p>
            </div>
          ) : (
            <div className="space-y-2">
              {reports.flatMap(report => 
                report.issues.map((issue, i) => (
                  <div 
                    key={`${report.id}-${i}`}
                    className={`p-3 rounded-lg flex items-start gap-3 ${
                      issue.severity === 'high' 
                        ? 'bg-destructive/10 border border-destructive/20' 
                        : 'bg-warning/10 border border-warning/20'
                    }`}
                  >
                    {issue.severity === 'high' ? (
                      <XCircle className="w-4 h-4 text-destructive mt-0.5" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-warning mt-0.5" />
                    )}
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {MODULE_CONFIG[report.module as keyof typeof MODULE_CONFIG]?.label || report.module}
                      </p>
                      <p className="text-sm text-muted-foreground">{issue.description}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Threshold reference */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Quality Mode Thresholds</CardTitle>
          <CardDescription>Minimum scores required for each quality tier</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="p-4 rounded-lg bg-primary/10 border border-primary/20">
              <Badge variant="cine" className="mb-2">CINE</Badge>
              <p className="text-2xl font-bold text-primary">{QC_THRESHOLDS.CINE}%</p>
              <p className="text-xs text-muted-foreground mt-1">Standard production</p>
            </div>
            <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
              <Badge variant="ultra" className="mb-2">ULTRA</Badge>
              <p className="text-2xl font-bold text-blue-400">{QC_THRESHOLDS.ULTRA}%</p>
              <p className="text-xs text-muted-foreground mt-1">Premium quality</p>
            </div>
            <div className="p-4 rounded-lg bg-qc-pass/10 border border-qc-pass/20">
              <Badge variant="hero" className="mb-2">HERO</Badge>
              <p className="text-2xl font-bold text-qc-pass">{QC_THRESHOLDS.HERO}%</p>
              <p className="text-xs text-muted-foreground mt-1">Trailer-ready</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
