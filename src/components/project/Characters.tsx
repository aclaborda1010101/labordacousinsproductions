import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Plus, Users, Loader2, Trash2 } from 'lucide-react';

interface CharactersProps { projectId: string; }

export default function Characters({ projectId }: CharactersProps) {
  const [loading, setLoading] = useState(true);
  const [characters, setCharacters] = useState<any[]>([]);
  const [newName, setNewName] = useState('');

  const fetch = async () => { const { data } = await supabase.from('characters').select('*').eq('project_id', projectId).order('created_at'); setCharacters(data || []); setLoading(false); };
  useEffect(() => { fetch(); }, [projectId]);

  const addCharacter = async () => {
    if (!newName.trim()) return;
    const { error } = await supabase.from('characters').insert({ project_id: projectId, name: newName.trim() });
    if (error) toast.error('Failed to add'); else { toast.success('Character added'); setNewName(''); fetch(); }
  };

  const deleteCharacter = async (id: string) => { await supabase.from('characters').delete().eq('id', id); fetch(); };

  if (loading) return <div className="p-6 flex justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>;

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div><h2 className="text-2xl font-bold text-foreground">Characters</h2><p className="text-muted-foreground">Define your cast for continuity</p></div>
      <div className="flex gap-2"><Input placeholder="Character name" value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addCharacter()} /><Button variant="gold" onClick={addCharacter}><Plus className="w-4 h-4" />Add</Button></div>
      <div className="space-y-3">
        {characters.length === 0 ? <div className="panel p-8 text-center"><Users className="w-10 h-10 mx-auto text-muted-foreground mb-3" /><p className="text-muted-foreground">No characters yet</p></div> : characters.map(c => (
          <div key={c.id} className="panel p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold">{c.name[0]}</div>
            <div className="flex-1"><p className="font-medium text-foreground">{c.name}</p><p className="text-sm text-muted-foreground">{c.role || 'No role defined'}</p></div>
            <Button variant="ghost" size="icon" onClick={() => deleteCharacter(c.id)}><Trash2 className="w-4 h-4" /></Button>
          </div>
        ))}
      </div>
    </div>
  );
}
