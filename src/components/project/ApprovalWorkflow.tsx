import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { 
  CheckCircle, 
  XCircle, 
  Clock, 
  AlertCircle,
  Clapperboard,
  Film,
  GitBranch
} from 'lucide-react';
import type { Database } from '@/integrations/supabase/types';

type ApprovalStatus = Database['public']['Enums']['approval_status'];

interface ApprovalItem {
  id: string;
  type: 'scene' | 'shot';
  name: string;
  status: ApprovalStatus;
  updated_at: string;
  episode_no?: number;
  scene_no?: number;
  shot_no?: number;
}

interface ApprovalWorkflowProps {
  projectId: string;
}

const STATUS_CONFIG: Record<ApprovalStatus, { label: string; icon: typeof Clock; color: string }> = {
  pending: { label: 'Pending Review', icon: Clock, color: 'text-warning' },
  approved: { label: 'Approved', icon: CheckCircle, color: 'text-qc-pass' },
  rejected: { label: 'Needs Revision', icon: XCircle, color: 'text-destructive' },
};

export default function ApprovalWorkflow({ projectId }: ApprovalWorkflowProps) {
  const { user } = useAuth();
  const [items, setItems] = useState<ApprovalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | ApprovalStatus>('all');

  useEffect(() => {
    fetchApprovalItems();
  }, [projectId]);

  async function fetchApprovalItems() {
    // Fetch scenes
    const { data: scenes, error: scenesError } = await supabase
      .from('scenes')
      .select('id, slugline, approval_status, updated_at, episode_no, scene_no')
      .eq('project_id', projectId)
      .order('episode_no', { ascending: true })
      .order('scene_no', { ascending: true });

    if (scenesError) {
      console.error('Error fetching scenes:', scenesError);
      toast.error('Failed to load approval items');
      return;
    }

    // Fetch shots
    const { data: shots, error: shotsError } = await supabase
      .from('shots')
      .select(`
        id, 
        shot_no, 
        approval_status, 
        updated_at,
        scene:scenes!inner(id, episode_no, scene_no, project_id, slugline)
      `)
      .eq('scene.project_id', projectId)
      .order('shot_no', { ascending: true });

    if (shotsError) {
      console.error('Error fetching shots:', shotsError);
    }

    const approvalItems: ApprovalItem[] = [
      ...(scenes?.map(s => ({
        id: s.id,
        type: 'scene' as const,
        name: s.slugline,
        status: s.approval_status || 'pending',
        updated_at: s.updated_at,
        episode_no: s.episode_no,
        scene_no: s.scene_no,
      })) || []),
      ...(shots?.map(s => ({
        id: s.id,
        type: 'shot' as const,
        name: `Shot ${s.shot_no}`,
        status: s.approval_status || 'pending',
        updated_at: s.updated_at,
        episode_no: (s.scene as any)?.episode_no,
        scene_no: (s.scene as any)?.scene_no,
        shot_no: s.shot_no,
      })) || []),
    ];

    setItems(approvalItems);
    setLoading(false);
  }

  async function updateApprovalStatus(itemId: string, type: 'scene' | 'shot', status: ApprovalStatus) {
    const table = type === 'scene' ? 'scenes' : 'shots';
    
    const { error } = await supabase
      .from(table)
      .update({ approval_status: status })
      .eq('id', itemId);

    if (error) {
      console.error('Error updating approval status:', error);
      toast.error('Failed to update status');
      return;
    }

    toast.success(`Status updated to ${STATUS_CONFIG[status].label}`);
    fetchApprovalItems();

    // Log decision
    await supabase.from('decisions_log').insert({
      project_id: projectId,
      entity_type: type,
      entity_id: itemId,
      action: `approval_${status}`,
      user_id: user?.id,
      data: { status }
    });
  }

  const filteredItems = filter === 'all' 
    ? items 
    : items.filter(i => i.status === filter);

  const counts = {
    all: items.length,
    pending: items.filter(i => i.status === 'pending').length,
    approved: items.filter(i => i.status === 'approved').length,
    rejected: items.filter(i => i.status === 'rejected').length,
  };

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
      <div>
        <h2 className="text-xl font-semibold text-foreground">Approval Workflow</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Review and approve scenes and shots before rendering
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {(['all', 'pending', 'approved', 'rejected'] as const).map((status) => {
          const config = status === 'all' 
            ? { label: 'Total Items', icon: GitBranch, color: 'text-foreground' }
            : STATUS_CONFIG[status];
          const Icon = config.icon;
          
          return (
            <button
              key={status}
              onClick={() => setFilter(status)}
              className={`p-4 rounded-lg border transition-all ${
                filter === status 
                  ? 'border-primary bg-primary/5' 
                  : 'border-border bg-card hover:border-primary/50'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <Icon className={`w-4 h-4 ${config.color}`} />
                <span className="text-sm text-muted-foreground">{config.label}</span>
              </div>
              <p className="text-2xl font-bold text-foreground">{counts[status]}</p>
            </button>
          );
        })}
      </div>

      {/* Items list */}
      <Tabs defaultValue="scenes" className="space-y-4">
        <TabsList>
          <TabsTrigger value="scenes" className="gap-2">
            <Film className="w-4 h-4" />
            Scenes
          </TabsTrigger>
          <TabsTrigger value="shots" className="gap-2">
            <Clapperboard className="w-4 h-4" />
            Shots
          </TabsTrigger>
        </TabsList>

        <TabsContent value="scenes" className="space-y-3">
          {filteredItems.filter(i => i.type === 'scene').length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <Film className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">No scenes to review</p>
              </CardContent>
            </Card>
          ) : (
            filteredItems.filter(i => i.type === 'scene').map((item) => {
              const config = STATUS_CONFIG[item.status];
              const Icon = config.icon;
              
              return (
                <Card key={item.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                          <Film className="w-5 h-5 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="font-medium text-foreground">
                            E{item.episode_no} S{item.scene_no}: {item.name}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <Icon className={`w-3.5 h-3.5 ${config.color}`} />
                            <span className={`text-sm ${config.color}`}>{config.label}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => updateApprovalStatus(item.id, 'scene', 'rejected')}
                          className={item.status === 'rejected' ? 'bg-destructive/10' : ''}
                        >
                          <XCircle className="w-4 h-4 text-destructive" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => updateApprovalStatus(item.id, 'scene', 'pending')}
                          className={item.status === 'pending' ? 'bg-warning/10' : ''}
                        >
                          <Clock className="w-4 h-4 text-warning" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => updateApprovalStatus(item.id, 'scene', 'approved')}
                          className={item.status === 'approved' ? 'bg-qc-pass/10' : ''}
                        >
                          <CheckCircle className="w-4 h-4 text-qc-pass" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </TabsContent>

        <TabsContent value="shots" className="space-y-3">
          {filteredItems.filter(i => i.type === 'shot').length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <Clapperboard className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">No shots to review</p>
              </CardContent>
            </Card>
          ) : (
            filteredItems.filter(i => i.type === 'shot').map((item) => {
              const config = STATUS_CONFIG[item.status];
              const Icon = config.icon;
              
              return (
                <Card key={item.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                          <Clapperboard className="w-5 h-5 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="font-medium text-foreground">
                            E{item.episode_no} S{item.scene_no} - {item.name}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <Icon className={`w-3.5 h-3.5 ${config.color}`} />
                            <span className={`text-sm ${config.color}`}>{config.label}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => updateApprovalStatus(item.id, 'shot', 'rejected')}
                          className={item.status === 'rejected' ? 'bg-destructive/10' : ''}
                        >
                          <XCircle className="w-4 h-4 text-destructive" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => updateApprovalStatus(item.id, 'shot', 'pending')}
                          className={item.status === 'pending' ? 'bg-warning/10' : ''}
                        >
                          <Clock className="w-4 h-4 text-warning" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => updateApprovalStatus(item.id, 'shot', 'approved')}
                          className={item.status === 'approved' ? 'bg-qc-pass/10' : ''}
                        >
                          <CheckCircle className="w-4 h-4 text-qc-pass" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </TabsContent>
      </Tabs>

      {/* Workflow info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Approval Workflow</CardTitle>
          <CardDescription>How content moves through review</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center gap-4">
            {[
              { icon: Clock, label: 'Pending', desc: 'Awaiting review', color: 'text-warning' },
              { icon: CheckCircle, label: 'Approved', desc: 'Ready for render', color: 'text-qc-pass' },
              { icon: XCircle, label: 'Rejected', desc: 'Needs revision', color: 'text-destructive' },
            ].map((step, i, arr) => (
              <div key={step.label} className="flex items-center gap-4">
                <div className="text-center">
                  <div className={`w-12 h-12 rounded-full border-2 flex items-center justify-center mx-auto mb-2 ${step.color} border-current bg-current/10`}>
                    <step.icon className="w-6 h-6" />
                  </div>
                  <p className="font-medium text-sm">{step.label}</p>
                  <p className="text-xs text-muted-foreground">{step.desc}</p>
                </div>
                {i < arr.length - 1 && (
                  <div className="w-8 h-0.5 bg-border" />
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
