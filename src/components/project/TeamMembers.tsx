import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { UserPlus, Trash2, Mail, Crown, Shield, Eye, Camera, Mic, Pencil, CheckCircle } from 'lucide-react';
import type { Database } from '@/integrations/supabase/types';

type AppRole = Database['public']['Enums']['app_role'];

interface Member {
  id: string;
  user_id: string;
  role: AppRole;
  created_at: string;
  profile?: {
    display_name: string | null;
    avatar_url: string | null;
  };
}

interface TeamMembersProps {
  projectId: string;
  ownerId: string;
}

const ROLE_CONFIG: Record<AppRole, { label: string; icon: typeof Crown; color: string; permissions: string[] }> = {
  owner: { 
    label: 'Owner', 
    icon: Crown, 
    color: 'text-primary',
    permissions: ['All permissions', 'Delete project', 'Manage members']
  },
  producer: { 
    label: 'Producer', 
    icon: Shield, 
    color: 'text-blue-400',
    permissions: ['Manage budget', 'Approve scenes', 'Manage schedules']
  },
  director: { 
    label: 'Director', 
    icon: Camera, 
    color: 'text-purple-400',
    permissions: ['Approve shots', 'Manage scenes', 'Review dailies']
  },
  writer: { 
    label: 'Writer', 
    icon: Pencil, 
    color: 'text-green-400',
    permissions: ['Edit scripts', 'Manage characters', 'Edit dialogue']
  },
  dp: { 
    label: 'DP', 
    icon: Camera, 
    color: 'text-orange-400',
    permissions: ['Manage camera', 'Lighting setup', 'Shot composition']
  },
  sound: { 
    label: 'Sound', 
    icon: Mic, 
    color: 'text-cyan-400',
    permissions: ['Audio review', 'Sound design', 'Music cues']
  },
  reviewer: { 
    label: 'Reviewer', 
    icon: Eye, 
    color: 'text-muted-foreground',
    permissions: ['View project', 'Add comments', 'Review dailies']
  },
};

export default function TeamMembers({ projectId, ownerId }: TeamMembersProps) {
  const { user } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<AppRole>('reviewer');
  const [inviting, setInviting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const isOwner = user?.id === ownerId;

  useEffect(() => {
    fetchMembers();
  }, [projectId]);

  async function fetchMembers() {
    const { data, error } = await supabase
      .from('project_members')
      .select(`
        id,
        user_id,
        role,
        created_at
      `)
      .eq('project_id', projectId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching members:', error);
      toast.error('Failed to load team members');
      return;
    }

    // Fetch profiles separately
    if (data && data.length > 0) {
      const userIds = data.map(m => m.user_id);
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, display_name, avatar_url')
        .in('user_id', userIds);

      const membersWithProfiles = data.map(member => ({
        ...member,
        profile: profiles?.find(p => p.user_id === member.user_id) || undefined
      }));

      setMembers(membersWithProfiles);
    } else {
      setMembers([]);
    }
    
    setLoading(false);
  }

  async function inviteMember() {
    if (!inviteEmail.trim()) {
      toast.error('Please enter an email address');
      return;
    }

    setInviting(true);

    // For now, we'll add member by email lookup
    // In production, you'd send an email invitation
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('user_id')
      .eq('display_name', inviteEmail) // This is a simplification
      .maybeSingle();

    if (profileError || !profile) {
      toast.error('User not found. They must have an account first.');
      setInviting(false);
      return;
    }

    const { error } = await supabase
      .from('project_members')
      .insert({
        project_id: projectId,
        user_id: profile.user_id,
        role: inviteRole
      });

    if (error) {
      if (error.code === '23505') {
        toast.error('User is already a member of this project');
      } else {
        console.error('Error inviting member:', error);
        toast.error('Failed to invite member');
      }
      setInviting(false);
      return;
    }

    toast.success('Member invited successfully');
    setInviteEmail('');
    setInviteRole('reviewer');
    setDialogOpen(false);
    setInviting(false);
    fetchMembers();
  }

  async function updateMemberRole(memberId: string, newRole: AppRole) {
    const { error } = await supabase
      .from('project_members')
      .update({ role: newRole })
      .eq('id', memberId);

    if (error) {
      console.error('Error updating role:', error);
      toast.error('Failed to update role');
      return;
    }

    toast.success('Role updated');
    fetchMembers();
  }

  async function removeMember(memberId: string) {
    const { error } = await supabase
      .from('project_members')
      .delete()
      .eq('id', memberId);

    if (error) {
      console.error('Error removing member:', error);
      toast.error('Failed to remove member');
      return;
    }

    toast.success('Member removed');
    fetchMembers();
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
          <h2 className="text-xl font-semibold text-foreground">Team Members</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Manage who has access to this project and their permissions
          </p>
        </div>
        {isOwner && (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="gold">
                <UserPlus className="w-4 h-4 mr-2" />
                Invite Member
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Invite Team Member</DialogTitle>
                <DialogDescription>
                  Add a collaborator to your project with specific permissions
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Email or Username</label>
                  <Input
                    placeholder="Enter email or username"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Role</label>
                  <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as AppRole)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(ROLE_CONFIG).filter(([key]) => key !== 'owner').map(([key, config]) => (
                        <SelectItem key={key} value={key}>
                          <div className="flex items-center gap-2">
                            <config.icon className={`w-4 h-4 ${config.color}`} />
                            {config.label}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="text-xs text-muted-foreground mt-2">
                    <p className="font-medium mb-1">Permissions:</p>
                    <ul className="list-disc list-inside space-y-0.5">
                      {ROLE_CONFIG[inviteRole].permissions.map((perm, i) => (
                        <li key={i}>{perm}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button variant="gold" onClick={inviteMember} disabled={inviting}>
                  {inviting ? 'Inviting...' : 'Send Invite'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Owner card */}
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                <Crown className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="font-medium text-foreground">Project Owner</p>
                <p className="text-sm text-muted-foreground">Full control over all project settings</p>
              </div>
            </div>
            <Badge variant="default">Owner</Badge>
          </div>
        </CardContent>
      </Card>

      {/* Members list */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          Team ({members.length})
        </h3>
        {members.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <Mail className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">No team members yet</p>
              <p className="text-sm text-muted-foreground mt-1">
                Invite collaborators to work on this project
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {members.map((member) => {
              const config = ROLE_CONFIG[member.role];
              const Icon = config.icon;
              
              return (
                <Card key={member.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-full bg-muted flex items-center justify-center`}>
                          <Icon className={`w-5 h-5 ${config.color}`} />
                        </div>
                        <div>
                          <p className="font-medium text-foreground">
                            {member.profile?.display_name || 'Unknown User'}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {config.permissions.slice(0, 2).join(' • ')}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {isOwner ? (
                          <>
                            <Select 
                              value={member.role} 
                              onValueChange={(v) => updateMemberRole(member.id, v as AppRole)}
                            >
                              <SelectTrigger className="w-32">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {Object.entries(ROLE_CONFIG).filter(([key]) => key !== 'owner').map(([key, cfg]) => (
                                  <SelectItem key={key} value={key}>
                                    {cfg.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Button 
                              variant="ghost" 
                              size="icon"
                              onClick={() => removeMember(member.id)}
                            >
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          </>
                        ) : (
                          <Badge variant="outline">{config.label}</Badge>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Role reference */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Role Permissions Reference</CardTitle>
          <CardDescription>What each role can do in your project</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {Object.entries(ROLE_CONFIG).filter(([key]) => key !== 'owner').map(([key, config]) => {
              const Icon = config.icon;
              return (
                <div key={key} className="p-3 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-2 mb-2">
                    <Icon className={`w-4 h-4 ${config.color}`} />
                    <span className="font-medium text-sm">{config.label}</span>
                  </div>
                  <ul className="text-xs text-muted-foreground space-y-0.5">
                    {config.permissions.map((perm, i) => (
                      <li key={i} className="flex items-center gap-1">
                        <CheckCircle className="w-3 h-3 text-qc-pass" />
                        {perm}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
