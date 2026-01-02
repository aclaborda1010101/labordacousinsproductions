import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Plus, Music, Edit2, Trash2 } from 'lucide-react';

interface SoundMusic {
  id: string;
  name: string;
  sound_type: string | null;
  category: string | null;
  description: string | null;
  mood: string | null;
  bpm: number | null;
  key_signature: string | null;
  character_id: string | null;
  location_id: string | null;
  status: string | null;
  created_at: string;
}

interface SoundMusicManagerProps {
  projectId: string;
}

const SOUND_TYPES = ['theme', 'motif', 'underscore', 'stinger', 'ambience', 'diegetic', 'source_music'];
const CATEGORIES = ['main_theme', 'character_theme', 'location_theme', 'action', 'romantic', 'suspense', 'comedy', 'dramatic', 'other'];
const MOODS = ['triumphant', 'melancholic', 'tense', 'playful', 'romantic', 'mysterious', 'energetic', 'peaceful', 'dark', 'hopeful'];

export default function SoundMusicManager({ projectId }: SoundMusicManagerProps) {
  const [items, setItems] = useState<SoundMusic[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    sound_type: 'theme',
    category: 'main_theme',
    description: '',
    mood: 'triumphant',
    bpm: 120,
    key_signature: ''
  });

  useEffect(() => {
    loadItems();
  }, [projectId]);

  const loadItems = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('sound_music')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setItems(data || []);
    } catch (error) {
      console.error('Error loading sound/music:', error);
      toast.error('Error loading sound/music');
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setEditingId(null);
    setForm({
      name: '',
      sound_type: 'theme',
      category: 'main_theme',
      description: '',
      mood: 'triumphant',
      bpm: 120,
      key_signature: ''
    });
    setDialogOpen(true);
  };

  const openEdit = (item: SoundMusic) => {
    setEditingId(item.id);
    setForm({
      name: item.name,
      sound_type: item.sound_type || 'theme',
      category: item.category || 'main_theme',
      description: item.description || '',
      mood: item.mood || 'triumphant',
      bpm: item.bpm || 120,
      key_signature: item.key_signature || ''
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('Name is required');
      return;
    }

    setSaving(true);
    try {
      if (editingId) {
        const { error } = await supabase
          .from('sound_music')
          .update({
            name: form.name,
            sound_type: form.sound_type,
            category: form.category,
            description: form.description,
            mood: form.mood,
            bpm: form.bpm,
            key_signature: form.key_signature
          })
          .eq('id', editingId);

        if (error) throw error;
        toast.success('Sound/Music updated');
      } else {
        const { error } = await supabase
          .from('sound_music')
          .insert({
            project_id: projectId,
            name: form.name,
            sound_type: form.sound_type,
            category: form.category,
            description: form.description,
            mood: form.mood,
            bpm: form.bpm,
            key_signature: form.key_signature,
            status: 'draft'
          });

        if (error) throw error;
        toast.success('Sound/Music created');
      }

      setDialogOpen(false);
      loadItems();
    } catch (error) {
      console.error('Error saving:', error);
      toast.error('Error saving');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this item?')) return;

    try {
      const { error } = await supabase
        .from('sound_music')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast.success('Deleted');
      loadItems();
    } catch (error) {
      console.error('Error deleting:', error);
      toast.error('Error deleting');
    }
  };

  const getTypeColor = (type: string | null) => {
    switch (type) {
      case 'theme': return 'bg-purple-500/20 text-purple-400';
      case 'motif': return 'bg-blue-500/20 text-blue-400';
      case 'underscore': return 'bg-green-500/20 text-green-400';
      case 'stinger': return 'bg-red-500/20 text-red-400';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Music className="w-5 h-5 text-primary" />
            Sound & Music
          </h2>
          <p className="text-sm text-muted-foreground">
            Themes, motifs, and recurring audio elements
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="w-4 h-4 mr-2" />
          Add Sound/Music
        </Button>
      </div>

      {items.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="text-center py-12">
            <Music className="w-12 h-12 mx-auto mb-4 text-muted-foreground/40" />
            <p className="text-muted-foreground">No sound/music defined yet</p>
            <Button className="mt-4" onClick={openCreate}>
              <Plus className="w-4 h-4 mr-2" />
              Create First Entry
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <Card key={item.id} className="hover:bg-card/80 transition-colors">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-base">{item.name}</CardTitle>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(item)}>
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => handleDelete(item.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2 mb-3">
                  <Badge className={getTypeColor(item.sound_type)}>
                    {item.sound_type?.replace('_', ' ')}
                  </Badge>
                  <Badge variant="outline">{item.category?.replace('_', ' ')}</Badge>
                  {item.mood && (
                    <Badge variant="secondary" className="text-xs">
                      {item.mood}
                    </Badge>
                  )}
                </div>
                {item.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2">{item.description}</p>
                )}
                <div className="flex gap-3 mt-2 text-xs text-muted-foreground">
                  {item.bpm && <span>{item.bpm} BPM</span>}
                  {item.key_signature && <span>{item.key_signature}</span>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Sound/Music' : 'New Sound/Music'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Name</label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g., Main Theme"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Type</label>
                <Select value={form.sound_type} onValueChange={(v) => setForm({ ...form, sound_type: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SOUND_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type.replace('_', ' ')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Category</label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat.replace('_', ' ')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="text-sm font-medium">Mood</label>
                <Select value={form.mood} onValueChange={(v) => setForm({ ...form, mood: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MOODS.map((mood) => (
                      <SelectItem key={mood} value={mood}>
                        {mood}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">BPM</label>
                <Input
                  type="number"
                  value={form.bpm}
                  onChange={(e) => setForm({ ...form, bpm: parseInt(e.target.value) || 0 })}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Key</label>
                <Input
                  value={form.key_signature}
                  onChange={(e) => setForm({ ...form, key_signature: e.target.value })}
                  placeholder="e.g., C Major"
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Description</label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Describe the sound/music..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              {editingId ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
