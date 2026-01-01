import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/contexts/LanguageContext';
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

interface Member { id: string; user_id: string; role: AppRole; created_at: string; profile?: { display_name: string | null; avatar_url: string | null; }; }
interface TeamMembersProps { projectId: string; ownerId: string; }

export default function TeamMembers({ projectId, ownerId }: TeamMembersProps) {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<AppRole>('reviewer');
  const [inviting, setInviting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const isOwner = user?.id === ownerId;

  const ROLE_CONFIG: Record<AppRole, { label: string; icon: typeof Crown; color: string; permissions: string[] }> = {
    owner: { label: t.team.roles.owner, icon: Crown, color: 'text-primary', permissions: t.team.rolePermissions.owner },
    producer: { label: t.team.roles.producer, icon: Shield, color: 'text-blue-400', permissions: t.team.rolePermissions.producer },
    director: { label: t.team.roles.director, icon: Camera, color: 'text-purple-400', permissions: t.team.rolePermissions.director },
    writer: { label: t.team.roles.writer, icon: Pencil, color: 'text-green-400', permissions: t.team.rolePermissions.writer },
    dp: { label: t.team.roles.dp, icon: Camera, color: 'text-orange-400', permissions: t.team.rolePermissions.dp },
    sound: { label: t.team.roles.sound, icon: Mic, color: 'text-cyan-400', permissions: t.team.rolePermissions.sound },
    reviewer: { label: t.team.roles.reviewer, icon: Eye, color: 'text-muted-foreground', permissions: t.team.rolePermissions.reviewer },
  };

  useEffect(() => { fetchMembers(); }, [projectId]);

  async function fetchMembers() {
    const { data, error } = await supabase.from('project_members').select('id, user_id, role, created_at').eq('project_id', projectId).order('created_at', { ascending: true });
    if (error) { toast.error(t.common.error); return; }
    if (data && data.length > 0) {
      const userIds = data.map(m => m.user_id);
      const { data: profiles } = await supabase.from('profiles').select('user_id, display_name, avatar_url').in('user_id', userIds);
      setMembers(data.map(member => ({ ...member, profile: profiles?.find(p => p.user_id === member.user_id) || undefined })));
    } else { setMembers([]); }
    setLoading(false);
  }

  async function inviteMember() {
    if (!inviteEmail.trim()) { toast.error(t.common.error); return; }
    setInviting(true);
    const { data: profile } = await supabase.from('profiles').select('user_id').eq('display_name', inviteEmail).maybeSingle();
    if (!profile) { toast.error(t.common.error); setInviting(false); return; }
    const { error } = await supabase.from('project_members').insert({ project_id: projectId, user_id: profile.user_id, role: inviteRole });
    if (error) { toast.error(t.team.inviteFailed); setInviting(false); return; }
    toast.success(t.team.invited);
    setInviteEmail(''); setInviteRole('reviewer'); setDialogOpen(false); setInviting(false);
    fetchMembers();
  }

  async function updateMemberRole(memberId: string, newRole: AppRole) {
    const { error } = await supabase.from('project_members').update({ role: newRole }).eq('id', memberId);
    if (error) { toast.error(t.common.error); return; }
    toast.success(t.team.roleUpdated);
    fetchMembers();
  }

  async function removeMember(memberId: string) {
    const { error } = await supabase.from('project_members').delete().eq('id', memberId);
    if (error) { toast.error(t.common.error); return; }
    toast.success(t.team.memberRemoved);
    fetchMembers();
  }

  if (loading) return <div className="p-6"><div className="animate-pulse space-y-4"><div className="h-8 bg-muted rounded w-48" /><div className="h-24 bg-muted rounded" /></div></div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div><h2 className="text-xl font-semibold text-foreground">{t.team.title}</h2><p className="text-sm text-muted-foreground mt-1">{t.team.subtitle}</p></div>
        {isOwner && (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild><Button variant="gold"><UserPlus className="w-4 h-4 mr-2" />{t.team.inviteMember}</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{t.team.inviteMember}</DialogTitle><DialogDescription>{t.team.inviteCollaborators}</DialogDescription></DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2"><label className="text-sm font-medium">{t.team.emailOrUsername}</label><Input placeholder={t.team.emailOrUsername} value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} /></div>
                <div className="space-y-2"><label className="text-sm font-medium">{t.team.role}</label>
                  <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as AppRole)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(ROLE_CONFIG).filter(([key]) => key !== 'owner').map(([key, config]) => (<SelectItem key={key} value={key}><div className="flex items-center gap-2"><config.icon className={`w-4 h-4 ${config.color}`} />{config.label}</div></SelectItem>))}</SelectContent></Select>
                  <div className="text-xs text-muted-foreground mt-2"><p className="font-medium mb-1">{t.team.permissions}:</p><ul className="list-disc list-inside space-y-0.5">{ROLE_CONFIG[inviteRole].permissions.map((perm, i) => <li key={i}>{perm}</li>)}</ul></div>
                </div>
              </div>
              <DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>{t.common.cancel}</Button><Button variant="gold" onClick={inviteMember} disabled={inviting}>{inviting ? t.team.inviting : t.team.sendInvite}</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Card className="border-primary/30 bg-primary/5"><CardContent className="p-4"><div className="flex items-center justify-between"><div className="flex items-center gap-4"><div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center"><Crown className="w-5 h-5 text-primary" /></div><div><p className="font-medium text-foreground">{t.team.projectOwner}</p><p className="text-sm text-muted-foreground">{t.team.fullControl}</p></div></div><Badge variant="default">{t.team.roles.owner}</Badge></div></CardContent></Card>

      <div className="space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">{t.team.title} ({members.length})</h3>
        {members.length === 0 ? (<Card><CardContent className="p-8 text-center"><Mail className="w-10 h-10 text-muted-foreground mx-auto mb-3" /><p className="text-muted-foreground">{t.team.noMembers}</p><p className="text-sm text-muted-foreground mt-1">{t.team.inviteCollaborators}</p></CardContent></Card>) : (
          <div className="space-y-2">{members.map((member) => { const config = ROLE_CONFIG[member.role]; const Icon = config.icon; return (<Card key={member.id}><CardContent className="p-4"><div className="flex items-center justify-between"><div className="flex items-center gap-4"><div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center"><Icon className={`w-5 h-5 ${config.color}`} /></div><div><p className="font-medium text-foreground">{member.profile?.display_name || 'Unknown User'}</p><p className="text-sm text-muted-foreground">{config.permissions.slice(0, 2).join(' • ')}</p></div></div><div className="flex items-center gap-3">{isOwner ? (<><Select value={member.role} onValueChange={(v) => updateMemberRole(member.id, v as AppRole)}><SelectTrigger className="w-32"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(ROLE_CONFIG).filter(([key]) => key !== 'owner').map(([key, cfg]) => <SelectItem key={key} value={key}>{cfg.label}</SelectItem>)}</SelectContent></Select><Button variant="ghost" size="icon" onClick={() => removeMember(member.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button></>) : (<Badge variant="outline">{config.label}</Badge>)}</div></div></CardContent></Card>); })}</div>
        )}
      </div>

      <Card><CardHeader><CardTitle className="text-base">{t.team.rolesReference}</CardTitle><CardDescription>{t.team.whatEachRoleCan}</CardDescription></CardHeader><CardContent><div className="grid grid-cols-2 md:grid-cols-3 gap-4">{Object.entries(ROLE_CONFIG).filter(([key]) => key !== 'owner').map(([key, config]) => { const Icon = config.icon; return (<div key={key} className="p-3 rounded-lg bg-muted/50"><div className="flex items-center gap-2 mb-2"><Icon className={`w-4 h-4 ${config.color}`} /><span className="font-medium text-sm">{config.label}</span></div><ul className="text-xs text-muted-foreground space-y-0.5">{config.permissions.map((perm, i) => <li key={i} className="flex items-center gap-1"><CheckCircle className="w-3 h-3 text-qc-pass" />{perm}</li>)}</ul></div>); })}</div></CardContent></Card>
    </div>
  );
}
