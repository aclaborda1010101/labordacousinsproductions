import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Settings, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';

interface Project {
  id: string;
  title: string;
  format: 'series' | 'mini' | 'film';
  episodes_count: number;
  target_duration_min: number;
}

interface ProjectSettingsProps {
  project: Project;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate: (project: Project) => void;
}

export function ProjectSettings({ project, open, onOpenChange, onUpdate }: ProjectSettingsProps) {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [formData, setFormData] = useState({
    title: project.title,
    format: project.format as 'series' | 'mini' | 'film',
    episodes_count: project.episodes_count,
    target_duration_min: project.target_duration_min,
  });

  const handleSave = async () => {
    if (!formData.title.trim()) {
      toast.error('El título es obligatorio');
      return;
    }

    setSaving(true);
    const { error } = await supabase
      .from('projects')
      .update({
        title: formData.title.trim(),
        format: formData.format,
        episodes_count: formData.episodes_count,
        target_duration_min: formData.target_duration_min,
      })
      .eq('id', project.id);

    if (error) {
      toast.error('Error al guardar cambios');
    } else {
      toast.success('Proyecto actualizado');
      onUpdate({ ...project, ...formData });
      onOpenChange(false);
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    setDeleting(true);
    const { error } = await supabase
      .from('projects')
      .delete()
      .eq('id', project.id);

    if (error) {
      toast.error('Error al eliminar proyecto');
      setDeleting(false);
    } else {
      toast.success('Proyecto eliminado');
      navigate('/projects');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Configuración del Proyecto
          </DialogTitle>
          <DialogDescription>
            Edita los detalles de tu proyecto o elimínalo
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Título *</Label>
            <Input
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="Título del proyecto"
            />
          </div>
          <div className="space-y-2">
            <Label>Formato</Label>
            <Select
              value={formData.format}
              onValueChange={(v: 'series' | 'mini' | 'film') => setFormData({ ...formData, format: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="series">Serie</SelectItem>
                <SelectItem value="mini">Miniserie</SelectItem>
                <SelectItem value="film">Película</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Episodios</Label>
              <Input
                type="number"
                min={1}
                value={formData.episodes_count}
                onChange={(e) => setFormData({ ...formData, episodes_count: parseInt(e.target.value) || 1 })}
              />
            </div>
            <div className="space-y-2">
              <Label>Duración (min)</Label>
              <Input
                type="number"
                min={1}
                value={formData.target_duration_min}
                onChange={(e) => setFormData({ ...formData, target_duration_min: parseInt(e.target.value) || 1 })}
              />
            </div>
          </div>
          
          {/* Danger Zone */}
          <div className="pt-4 border-t border-destructive/20">
            <h4 className="text-sm font-semibold text-destructive mb-3">Zona de Peligro</h4>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" className="w-full">
                  <Trash2 className="w-4 h-4 mr-2" />
                  Eliminar Proyecto
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>¿Eliminar proyecto?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Esta acción no se puede deshacer. Se eliminarán todos los personajes, escenas, renders y datos asociados al proyecto "{project.title}".
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
                    {deleting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                    Eliminar
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button variant="gold" onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            Guardar Cambios
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
