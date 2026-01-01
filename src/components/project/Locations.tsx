import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Plus, MapPin, Loader2, Trash2, Edit2, Save, X, Sun, Moon } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';

interface LocationsProps { projectId: string; }

interface Location {
  id: string;
  name: string;
  description: string | null;
  token: string | null;
  variants: { day?: boolean; night?: boolean; weather?: string[] } | null;
}

export default function Locations({ projectId }: LocationsProps) {
  const [loading, setLoading] = useState(true);
  const [locations, setLocations] = useState<Location[]>([]);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    hasDay: true,
    hasNight: true,
  });

  const fetchLocations = async () => { 
    const { data } = await supabase
      .from('locations')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at'); 
    setLocations((data || []).map(l => ({
      ...l,
      variants: l.variants as Location['variants']
    }))); 
    setLoading(false); 
  };

  useEffect(() => { fetchLocations(); }, [projectId]);

  const resetForm = () => {
    setFormData({ name: '', description: '', hasDay: true, hasNight: true });
    setEditingId(null);
  };

  const handleAddLocation = async () => {
    if (!formData.name.trim()) {
      toast.error('El nombre es obligatorio');
      return;
    }
    
    setSaving(true);
    const { error } = await supabase
      .from('locations')
      .insert({ 
        project_id: projectId, 
        name: formData.name.trim(),
        description: formData.description || null,
        variants: { day: formData.hasDay, night: formData.hasNight, weather: ['clear'] },
      });
    
    if (error) {
      toast.error('Error al añadir localización');
    } else {
      toast.success('Localización añadida correctamente');
      resetForm();
      setShowAddDialog(false);
      fetchLocations();
    }
    setSaving(false);
  };

  const handleUpdateLocation = async () => {
    if (!editingId || !formData.name.trim()) return;
    
    setSaving(true);
    const { error } = await supabase
      .from('locations')
      .update({ 
        name: formData.name.trim(),
        description: formData.description || null,
        variants: { day: formData.hasDay, night: formData.hasNight, weather: ['clear'] },
      })
      .eq('id', editingId);
    
    if (error) {
      toast.error('Error al actualizar localización');
    } else {
      toast.success('Localización actualizada');
      resetForm();
      fetchLocations();
    }
    setSaving(false);
  };

  const handleDeleteLocation = async (id: string) => { 
    const { error } = await supabase.from('locations').delete().eq('id', id); 
    if (error) {
      toast.error('Error al eliminar localización');
    } else {
      toast.success('Localización eliminada');
      fetchLocations();
    }
  };

  const startEditing = (location: Location) => {
    setFormData({
      name: location.name,
      description: location.description || '',
      hasDay: location.variants?.day ?? true,
      hasNight: location.variants?.night ?? true,
    });
    setEditingId(location.id);
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
          <h2 className="text-2xl font-bold text-foreground">Localizaciones</h2>
          <p className="text-muted-foreground">Define los escenarios y ambientes de tu producción</p>
        </div>
        <Button variant="gold" onClick={() => setShowAddDialog(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Añadir Localización
        </Button>
      </div>
      
      <div className="grid gap-4 md:grid-cols-2">
        {locations.length === 0 ? (
          <Card className="md:col-span-2">
            <CardContent className="p-8 text-center">
              <MapPin className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-2">No hay localizaciones aún</h3>
              <p className="text-muted-foreground mb-4">
                Añade localizaciones para definir los escenarios de tu producción
              </p>
              <Button variant="gold" onClick={() => setShowAddDialog(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Añadir Primera Localización
              </Button>
            </CardContent>
          </Card>
        ) : (
          locations.map(location => (
            <Card key={location.id}>
              <CardContent className="p-4">
                {editingId === location.id ? (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Nombre *</Label>
                      <Input 
                        value={formData.name} 
                        onChange={e => setFormData({...formData, name: e.target.value})}
                        placeholder="Nombre de la localización"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Descripción</Label>
                      <Textarea 
                        value={formData.description}
                        onChange={e => setFormData({...formData, description: e.target.value})}
                        placeholder="Describe el escenario, ambiente, detalles importantes..."
                        rows={3}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Variantes de iluminación</Label>
                      <div className="flex gap-4">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <Checkbox 
                            checked={formData.hasDay}
                            onCheckedChange={(c) => setFormData({...formData, hasDay: !!c})}
                          />
                          <Sun className="w-4 h-4 text-yellow-500" />
                          <span className="text-sm">Día</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <Checkbox 
                            checked={formData.hasNight}
                            onCheckedChange={(c) => setFormData({...formData, hasNight: !!c})}
                          />
                          <Moon className="w-4 h-4 text-blue-400" />
                          <span className="text-sm">Noche</span>
                        </label>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="gold" onClick={handleUpdateLocation} disabled={saving}>
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
                    <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                      <MapPin className="w-6 h-6 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-foreground">{location.name}</h3>
                        <div className="flex gap-1">
                          {location.variants?.day && (
                            <Sun className="w-3.5 h-3.5 text-yellow-500" />
                          )}
                          {location.variants?.night && (
                            <Moon className="w-3.5 h-3.5 text-blue-400" />
                          )}
                        </div>
                      </div>
                      {location.description ? (
                        <p className="text-sm text-muted-foreground line-clamp-2">{location.description}</p>
                      ) : (
                        <p className="text-sm text-muted-foreground italic">Sin descripción</p>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => startEditing(location)}>
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDeleteLocation(location.id)}>
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

      {/* Add Location Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Añadir Localización</DialogTitle>
            <DialogDescription>
              Define un nuevo escenario para tu producción
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Nombre *</Label>
              <Input 
                value={formData.name} 
                onChange={e => setFormData({...formData, name: e.target.value})}
                placeholder="Ej: INT. CAFETERÍA - CENTRO"
              />
            </div>
            <div className="space-y-2">
              <Label>Descripción</Label>
              <Textarea 
                value={formData.description}
                onChange={e => setFormData({...formData, description: e.target.value})}
                placeholder="Describe el escenario, ambiente, elementos destacados..."
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label>Variantes de iluminación</Label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox 
                    checked={formData.hasDay}
                    onCheckedChange={(c) => setFormData({...formData, hasDay: !!c})}
                  />
                  <Sun className="w-4 h-4 text-yellow-500" />
                  <span className="text-sm">Día</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox 
                    checked={formData.hasNight}
                    onCheckedChange={(c) => setFormData({...formData, hasNight: !!c})}
                  />
                  <Moon className="w-4 h-4 text-blue-400" />
                  <span className="text-sm">Noche</span>
                </label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowAddDialog(false); resetForm(); }}>
              Cancelar
            </Button>
            <Button variant="gold" onClick={handleAddLocation} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Añadir Localización
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
