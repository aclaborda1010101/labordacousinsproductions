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
import { Loader2, Plus, Sparkles, Edit2, Trash2, Zap } from 'lucide-react';

interface VFXSFX {
  id: string;
  name: string;
  effect_type: string | null;
  category: string | null;
  description: string | null;
  duration_sec: number | null;
  intensity_level: string | null;
  trigger_cue: string | null;
  status: string | null;
  created_at: string;
}

interface VFXSFXManagerProps {
  projectId: string;
}

const EFFECT_TYPES = ['vfx', 'sfx', 'practical', 'hybrid'];
const CATEGORIES = ['explosion', 'weather', 'magic', 'sci-fi', 'horror', 'enhancement', 'transition', 'other'];
const INTENSITY_LEVELS = ['subtle', 'moderate', 'intense', 'overwhelming'];

export default function VFXSFXManager({ projectId }: VFXSFXManagerProps) {
  const [effects, setEffects] = useState<VFXSFX[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    effect_type: 'vfx',
    category: 'enhancement',
    description: '',
    duration_sec: 3,
    intensity_level: 'moderate',
    trigger_cue: ''
  });

  useEffect(() => {
    loadEffects();
  }, [projectId]);

  const loadEffects = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('vfx_sfx')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setEffects(data || []);
    } catch (error) {
      console.error('Error loading effects:', error);
      toast.error('Error loading effects');
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setEditingId(null);
    setForm({
      name: '',
      effect_type: 'vfx',
      category: 'enhancement',
      description: '',
      duration_sec: 3,
      intensity_level: 'moderate',
      trigger_cue: ''
    });
    setDialogOpen(true);
  };

  const openEdit = (effect: VFXSFX) => {
    setEditingId(effect.id);
    setForm({
      name: effect.name,
      effect_type: effect.effect_type || 'vfx',
      category: effect.category || 'enhancement',
      description: effect.description || '',
      duration_sec: effect.duration_sec || 3,
      intensity_level: effect.intensity_level || 'moderate',
      trigger_cue: effect.trigger_cue || ''
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
          .from('vfx_sfx')
          .update({
            name: form.name,
            effect_type: form.effect_type,
            category: form.category,
            description: form.description,
            duration_sec: form.duration_sec,
            intensity_level: form.intensity_level,
            trigger_cue: form.trigger_cue
          })
          .eq('id', editingId);

        if (error) throw error;
        toast.success('Effect updated');
      } else {
        const { error } = await supabase
          .from('vfx_sfx')
          .insert({
            project_id: projectId,
            name: form.name,
            effect_type: form.effect_type,
            category: form.category,
            description: form.description,
            duration_sec: form.duration_sec,
            intensity_level: form.intensity_level,
            trigger_cue: form.trigger_cue,
            status: 'draft'
          });

        if (error) throw error;
        toast.success('Effect created');
      }

      setDialogOpen(false);
      loadEffects();
    } catch (error) {
      console.error('Error saving effect:', error);
      toast.error('Error saving effect');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this effect?')) return;

    try {
      const { error } = await supabase
        .from('vfx_sfx')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast.success('Effect deleted');
      loadEffects();
    } catch (error) {
      console.error('Error deleting:', error);
      toast.error('Error deleting effect');
    }
  };

  const getTypeColor = (type: string | null) => {
    switch (type) {
      case 'vfx': return 'bg-blue-500/20 text-blue-400';
      case 'sfx': return 'bg-purple-500/20 text-purple-400';
      case 'practical': return 'bg-amber-500/20 text-amber-400';
      case 'hybrid': return 'bg-green-500/20 text-green-400';
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
            <Sparkles className="w-5 h-5 text-primary" />
            VFX & SFX
          </h2>
          <p className="text-sm text-muted-foreground">
            Visual and special effects library
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="w-4 h-4 mr-2" />
          Add Effect
        </Button>
      </div>

      {effects.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="text-center py-12">
            <Sparkles className="w-12 h-12 mx-auto mb-4 text-muted-foreground/40" />
            <p className="text-muted-foreground">No effects defined yet</p>
            <Button className="mt-4" onClick={openCreate}>
              <Plus className="w-4 h-4 mr-2" />
              Create First Effect
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {effects.map((effect) => (
            <Card key={effect.id} className="hover:bg-card/80 transition-colors">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-base">{effect.name}</CardTitle>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(effect)}>
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => handleDelete(effect.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2 mb-3">
                  <Badge className={getTypeColor(effect.effect_type)}>
                    {effect.effect_type?.toUpperCase()}
                  </Badge>
                  <Badge variant="outline">{effect.category}</Badge>
                  {effect.intensity_level && (
                    <Badge variant="secondary" className="text-xs">
                      <Zap className="w-3 h-3 mr-1" />
                      {effect.intensity_level}
                    </Badge>
                  )}
                </div>
                {effect.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2">{effect.description}</p>
                )}
                {effect.trigger_cue && (
                  <p className="text-xs text-muted-foreground mt-2">
                    <span className="font-medium">Trigger:</span> {effect.trigger_cue}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Effect' : 'New Effect'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Name</label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g., Explosion - Large"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Type</label>
                <Select value={form.effect_type} onValueChange={(v) => setForm({ ...form, effect_type: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EFFECT_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type.toUpperCase()}
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
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Intensity</label>
                <Select value={form.intensity_level} onValueChange={(v) => setForm({ ...form, intensity_level: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INTENSITY_LEVELS.map((level) => (
                      <SelectItem key={level} value={level}>
                        {level}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Duration (sec)</label>
                <Input
                  type="number"
                  value={form.duration_sec}
                  onChange={(e) => setForm({ ...form, duration_sec: parseFloat(e.target.value) || 0 })}
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Description</label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Describe the effect..."
                rows={3}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Trigger Cue</label>
              <Input
                value={form.trigger_cue}
                onChange={(e) => setForm({ ...form, trigger_cue: e.target.value })}
                placeholder="e.g., On character impact"
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
