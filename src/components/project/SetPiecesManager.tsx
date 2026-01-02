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
import { Loader2, Plus, Clapperboard, Edit2, Trash2, Clock, AlertTriangle } from 'lucide-react';

interface SetPiece {
  id: string;
  name: string;
  set_piece_type: string | null;
  description: string | null;
  complexity_level: string | null;
  duration_estimate_sec: number | null;
  safety_notes: string | null;
  status: string | null;
  created_at: string;
}

interface SetPiecesManagerProps {
  projectId: string;
}

const SET_PIECE_TYPES = [
  'action_sequence',
  'chase_scene',
  'fight_choreography',
  'stunt_work',
  'crowd_scene',
  'visual_spectacle',
  'practical_effect',
  'other'
];

const COMPLEXITY_LEVELS = ['low', 'medium', 'high', 'extreme'];

export default function SetPiecesManager({ projectId }: SetPiecesManagerProps) {
  const [setPieces, setSetPieces] = useState<SetPiece[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    set_piece_type: 'action_sequence',
    description: '',
    complexity_level: 'medium',
    duration_estimate_sec: 30,
    safety_notes: ''
  });

  useEffect(() => {
    loadSetPieces();
  }, [projectId]);

  const loadSetPieces = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('set_pieces')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setSetPieces(data || []);
    } catch (error) {
      console.error('Error loading set pieces:', error);
      toast.error('Error loading set pieces');
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setEditingId(null);
    setForm({
      name: '',
      set_piece_type: 'action_sequence',
      description: '',
      complexity_level: 'medium',
      duration_estimate_sec: 30,
      safety_notes: ''
    });
    setDialogOpen(true);
  };

  const openEdit = (piece: SetPiece) => {
    setEditingId(piece.id);
    setForm({
      name: piece.name,
      set_piece_type: piece.set_piece_type || 'action_sequence',
      description: piece.description || '',
      complexity_level: piece.complexity_level || 'medium',
      duration_estimate_sec: piece.duration_estimate_sec || 30,
      safety_notes: piece.safety_notes || ''
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
          .from('set_pieces')
          .update({
            name: form.name,
            set_piece_type: form.set_piece_type,
            description: form.description,
            complexity_level: form.complexity_level,
            duration_estimate_sec: form.duration_estimate_sec,
            safety_notes: form.safety_notes
          })
          .eq('id', editingId);

        if (error) throw error;
        toast.success('Set piece updated');
      } else {
        const { error } = await supabase
          .from('set_pieces')
          .insert({
            project_id: projectId,
            name: form.name,
            set_piece_type: form.set_piece_type,
            description: form.description,
            complexity_level: form.complexity_level,
            duration_estimate_sec: form.duration_estimate_sec,
            safety_notes: form.safety_notes,
            status: 'draft'
          });

        if (error) throw error;
        toast.success('Set piece created');
      }

      setDialogOpen(false);
      loadSetPieces();
    } catch (error) {
      console.error('Error saving set piece:', error);
      toast.error('Error saving set piece');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this set piece?')) return;

    try {
      const { error } = await supabase
        .from('set_pieces')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast.success('Set piece deleted');
      loadSetPieces();
    } catch (error) {
      console.error('Error deleting:', error);
      toast.error('Error deleting set piece');
    }
  };

  const getComplexityColor = (level: string | null) => {
    switch (level) {
      case 'low': return 'bg-green-500/20 text-green-400';
      case 'medium': return 'bg-amber-500/20 text-amber-400';
      case 'high': return 'bg-orange-500/20 text-orange-400';
      case 'extreme': return 'bg-red-500/20 text-red-400';
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
            <Clapperboard className="w-5 h-5 text-primary" />
            Set Pieces
          </h2>
          <p className="text-sm text-muted-foreground">
            Large action sequences and complex shots
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="w-4 h-4 mr-2" />
          Add Set Piece
        </Button>
      </div>

      {setPieces.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="text-center py-12">
            <Clapperboard className="w-12 h-12 mx-auto mb-4 text-muted-foreground/40" />
            <p className="text-muted-foreground">No set pieces defined yet</p>
            <Button className="mt-4" onClick={openCreate}>
              <Plus className="w-4 h-4 mr-2" />
              Create First Set Piece
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {setPieces.map((piece) => (
            <Card key={piece.id} className="hover:bg-card/80 transition-colors">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-base">{piece.name}</CardTitle>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(piece)}>
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => handleDelete(piece.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2 mb-3">
                  <Badge variant="outline">{piece.set_piece_type?.replace('_', ' ')}</Badge>
                  <Badge className={getComplexityColor(piece.complexity_level)}>
                    {piece.complexity_level}
                  </Badge>
                  {piece.duration_estimate_sec && (
                    <Badge variant="secondary" className="text-xs">
                      <Clock className="w-3 h-3 mr-1" />
                      {piece.duration_estimate_sec}s
                    </Badge>
                  )}
                </div>
                {piece.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2">{piece.description}</p>
                )}
                {piece.safety_notes && (
                  <div className="mt-2 p-2 bg-amber-500/10 rounded flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-400">{piece.safety_notes}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Set Piece' : 'New Set Piece'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Name</label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g., Car Chase Sequence"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Type</label>
                <Select value={form.set_piece_type} onValueChange={(v) => setForm({ ...form, set_piece_type: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SET_PIECE_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type.replace('_', ' ')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Complexity</label>
                <Select value={form.complexity_level} onValueChange={(v) => setForm({ ...form, complexity_level: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COMPLEXITY_LEVELS.map((level) => (
                      <SelectItem key={level} value={level}>
                        {level}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Duration (seconds)</label>
              <Input
                type="number"
                value={form.duration_estimate_sec}
                onChange={(e) => setForm({ ...form, duration_estimate_sec: parseInt(e.target.value) || 0 })}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Description</label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Describe the sequence..."
                rows={3}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Safety Notes</label>
              <Textarea
                value={form.safety_notes}
                onChange={(e) => setForm({ ...form, safety_notes: e.target.value })}
                placeholder="Any safety considerations..."
                rows={2}
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
