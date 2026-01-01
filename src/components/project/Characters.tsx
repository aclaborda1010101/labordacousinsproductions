import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Plus, Users, Loader2, Trash2, Edit2, Save, X, User } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface CharactersProps { projectId: string; }

interface Character {
  id: string;
  name: string;
  role: string | null;
  bio: string | null;
  arc: string | null;
  token: string | null;
}

export default function Characters({ projectId }: CharactersProps) {
  const [loading, setLoading] = useState(true);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  
  const [formData, setFormData] = useState({
    name: '',
    role: '',
    bio: '',
    arc: '',
  });

  const fetchCharacters = async () => { 
    const { data } = await supabase
      .from('characters')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at'); 
    setCharacters(data || []); 
    setLoading(false); 
  };

  useEffect(() => { fetchCharacters(); }, [projectId]);

  const resetForm = () => {
    setFormData({ name: '', role: '', bio: '', arc: '' });
    setEditingId(null);
  };

  const handleAddCharacter = async () => {
    if (!formData.name.trim()) {
      toast.error('El nombre es obligatorio');
      return;
    }
    
    setSaving(true);
    const { error } = await supabase
      .from('characters')
      .insert({ 
        project_id: projectId, 
        name: formData.name.trim(),
        role: formData.role || null,
        bio: formData.bio || null,
        arc: formData.arc || null,
      });
    
    if (error) {
      toast.error('Error al añadir personaje');
    } else {
      toast.success('Personaje añadido correctamente');
      resetForm();
      setShowAddDialog(false);
      fetchCharacters();
    }
    setSaving(false);
  };

  const handleUpdateCharacter = async () => {
    if (!editingId || !formData.name.trim()) return;
    
    setSaving(true);
    const { error } = await supabase
      .from('characters')
      .update({ 
        name: formData.name.trim(),
        role: formData.role || null,
        bio: formData.bio || null,
        arc: formData.arc || null,
      })
      .eq('id', editingId);
    
    if (error) {
      toast.error('Error al actualizar personaje');
    } else {
      toast.success('Personaje actualizado');
      resetForm();
      fetchCharacters();
    }
    setSaving(false);
  };

  const handleDeleteCharacter = async (id: string) => { 
    const { error } = await supabase.from('characters').delete().eq('id', id); 
    if (error) {
      toast.error('Error al eliminar personaje');
    } else {
      toast.success('Personaje eliminado');
      fetchCharacters();
    }
  };

  const startEditing = (character: Character) => {
    setFormData({
      name: character.name,
      role: character.role || '',
      bio: character.bio || '',
      arc: character.arc || '',
    });
    setEditingId(character.id);
  };

  if (loading) {
    return (
      <div className="p-6 flex justify-center">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Personajes</h2>
          <p className="text-muted-foreground">Define tu reparto para mantener la continuidad visual</p>
        </div>
        <Button variant="gold" onClick={() => setShowAddDialog(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Añadir Personaje
        </Button>
      </div>
      
      <div className="grid gap-4">
        {characters.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <Users className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-2">No hay personajes aún</h3>
              <p className="text-muted-foreground mb-4">
                Añade personajes para mantener la consistencia visual en tu producción
              </p>
              <Button variant="gold" onClick={() => setShowAddDialog(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Añadir Primer Personaje
              </Button>
            </CardContent>
          </Card>
        ) : (
          characters.map(character => (
            <Card key={character.id}>
              <CardContent className="p-4">
                {editingId === character.id ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Nombre *</Label>
                        <Input 
                          value={formData.name} 
                          onChange={e => setFormData({...formData, name: e.target.value})}
                          placeholder="Nombre del personaje"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Rol</Label>
                        <Select 
                          value={formData.role} 
                          onValueChange={v => setFormData({...formData, role: v})}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selecciona un rol" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="protagonist">Protagonista</SelectItem>
                            <SelectItem value="antagonist">Antagonista</SelectItem>
                            <SelectItem value="supporting">Secundario</SelectItem>
                            <SelectItem value="recurring">Recurrente</SelectItem>
                            <SelectItem value="cameo">Cameo</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Biografía</Label>
                      <Textarea 
                        value={formData.bio}
                        onChange={e => setFormData({...formData, bio: e.target.value})}
                        placeholder="Describe al personaje, su historia y motivaciones..."
                        rows={3}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Arco del Personaje</Label>
                      <Textarea 
                        value={formData.arc}
                        onChange={e => setFormData({...formData, arc: e.target.value})}
                        placeholder="¿Cómo evoluciona el personaje a lo largo de la historia?"
                        rows={2}
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button variant="gold" onClick={handleUpdateCharacter} disabled={saving}>
                        {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                        <Save className="w-4 h-4 mr-2" />
                        Guardar
                      </Button>
                      <Button variant="outline" onClick={resetForm}>
                        <X className="w-4 h-4 mr-2" />
                        Cancelar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-lg">
                      {character.name[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-foreground">{character.name}</h3>
                        {character.role && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary capitalize">
                            {character.role === 'protagonist' ? 'Protagonista' :
                             character.role === 'antagonist' ? 'Antagonista' :
                             character.role === 'supporting' ? 'Secundario' :
                             character.role === 'recurring' ? 'Recurrente' :
                             character.role === 'cameo' ? 'Cameo' : character.role}
                          </span>
                        )}
                      </div>
                      {character.bio && (
                        <p className="text-sm text-muted-foreground line-clamp-2">{character.bio}</p>
                      )}
                      {!character.bio && !character.role && (
                        <p className="text-sm text-muted-foreground italic">Sin información adicional</p>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => startEditing(character)}>
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDeleteCharacter(character.id)}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Add Character Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Añadir Personaje</DialogTitle>
            <DialogDescription>
              Define un nuevo personaje para tu producción
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Nombre *</Label>
              <Input 
                value={formData.name} 
                onChange={e => setFormData({...formData, name: e.target.value})}
                placeholder="Nombre del personaje"
              />
            </div>
            <div className="space-y-2">
              <Label>Rol</Label>
              <Select 
                value={formData.role} 
                onValueChange={v => setFormData({...formData, role: v})}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona un rol" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="protagonist">Protagonista</SelectItem>
                  <SelectItem value="antagonist">Antagonista</SelectItem>
                  <SelectItem value="supporting">Secundario</SelectItem>
                  <SelectItem value="recurring">Recurrente</SelectItem>
                  <SelectItem value="cameo">Cameo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Biografía</Label>
              <Textarea 
                value={formData.bio}
                onChange={e => setFormData({...formData, bio: e.target.value})}
                placeholder="Describe al personaje..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowAddDialog(false); resetForm(); }}>
              Cancelar
            </Button>
            <Button variant="gold" onClick={handleAddCharacter} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Añadir Personaje
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
