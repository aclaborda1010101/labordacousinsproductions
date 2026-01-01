import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Plus, MapPin, Loader2, Trash2 } from 'lucide-react';

interface LocationsProps { projectId: string; }

export default function Locations({ projectId }: LocationsProps) {
  const [loading, setLoading] = useState(true);
  const [locations, setLocations] = useState<any[]>([]);
  const [newName, setNewName] = useState('');

  const fetch = async () => { const { data } = await supabase.from('locations').select('*').eq('project_id', projectId).order('created_at'); setLocations(data || []); setLoading(false); };
  useEffect(() => { fetch(); }, [projectId]);

  const addLocation = async () => {
    if (!newName.trim()) return;
    const { error } = await supabase.from('locations').insert({ project_id: projectId, name: newName.trim() });
    if (error) toast.error('Failed to add'); else { toast.success('Location added'); setNewName(''); fetch(); }
  };

  const deleteLocation = async (id: string) => { await supabase.from('locations').delete().eq('id', id); fetch(); };

  if (loading) return <div className="p-6 flex justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>;

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div><h2 className="text-2xl font-bold text-foreground">Locations</h2><p className="text-muted-foreground">Define sets and environments</p></div>
      <div className="flex gap-2"><Input placeholder="Location name" value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addLocation()} /><Button variant="gold" onClick={addLocation}><Plus className="w-4 h-4" />Add</Button></div>
      <div className="space-y-3">
        {locations.length === 0 ? <div className="panel p-8 text-center"><MapPin className="w-10 h-10 mx-auto text-muted-foreground mb-3" /><p className="text-muted-foreground">No locations yet</p></div> : locations.map(l => (
          <div key={l.id} className="panel p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center"><MapPin className="w-5 h-5 text-primary" /></div>
            <div className="flex-1"><p className="font-medium text-foreground">{l.name}</p><p className="text-sm text-muted-foreground">{l.description || 'No description'}</p></div>
            <Button variant="ghost" size="icon" onClick={() => deleteLocation(l.id)}><Trash2 className="w-4 h-4" /></Button>
          </div>
        ))}
      </div>
    </div>
  );
}
