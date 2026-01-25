import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Settings, Trash2, Palette, Wrench, Lock, Unlock, Database } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { useEditorialKnowledgeBase } from '@/hooks/useEditorialKnowledgeBase';
import { useDeveloperMode } from '@/contexts/DeveloperModeContext';
import { DeveloperModeModal } from '@/components/developer/DeveloperModeModal';
import { MigrationExport } from './MigrationExport';
import { DatabaseCloner } from './DatabaseCloner';
import {
  FormatProfile,
  AnimationType,
  VisualStyle,
  UserLevel,
  FORMAT_PROFILES,
  ANIMATION_STYLES,
  USER_LEVEL_CONFIG,
} from '@/lib/editorialKnowledgeBase';

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
  const [devModalOpen, setDevModalOpen] = useState(false);
  const { isDeveloperMode } = useDeveloperMode();
  const [formData, setFormData] = useState({
    title: project.title,
    format: project.format as 'series' | 'mini' | 'film',
    episodes_count: project.episodes_count,
    target_duration_min: project.target_duration_min,
  });

  // Editorial Knowledge Base
  const {
    formatProfile,
    animationType,
    visualStyle,
    userLevel,
    setFormatProfile,
    setAnimationType,
    setVisualStyle,
    setUserLevel,
    loading: ekbLoading,
  } = useEditorialKnowledgeBase({ projectId: project.id });

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
      <DialogContent className="max-w-md max-h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Configuración del Proyecto
          </DialogTitle>
          <DialogDescription>
            Edita los detalles de tu proyecto o elimínalo
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="flex-1 pr-4">
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

          {/* EKB Style Settings */}
          <Separator />
          <div className="space-y-4">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <Palette className="w-4 h-4" />
              Configuración Visual (EKB)
            </h4>
            
            <div className="grid grid-cols-2 gap-4">
              {/* Format Profile */}
              <div className="space-y-2">
                <Label>Tipo de Obra</Label>
                <Select
                  value={formatProfile}
                  onValueChange={(v) => setFormatProfile(v as FormatProfile)}
                  disabled={ekbLoading}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(FORMAT_PROFILES).map(([key, profile]) => (
                      <SelectItem key={key} value={key}>
                        {profile.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Animation Type */}
              <div className="space-y-2">
                <Label>Tipo Animación</Label>
                <Select
                  value={animationType}
                  onValueChange={(v) => setAnimationType(v as AnimationType)}
                  disabled={ekbLoading}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="2D">2D</SelectItem>
                    <SelectItem value="3D">3D</SelectItem>
                    <SelectItem value="mixed">Mixta</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Visual Style */}
              <div className="space-y-2">
                <Label>Estilo Visual</Label>
                <Select
                  value={visualStyle}
                  onValueChange={(v) => setVisualStyle(v as VisualStyle)}
                  disabled={ekbLoading}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(ANIMATION_STYLES).map(([key, style]) => (
                      <SelectItem key={key} value={key}>
                        {style.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* User Level */}
              <div className="space-y-2">
                <Label>Nivel UI</Label>
                <Select
                  value={userLevel}
                  onValueChange={(v) => setUserLevel(v as UserLevel)}
                  disabled={ekbLoading}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(USER_LEVEL_CONFIG).map(([key, config]) => (
                      <SelectItem key={key} value={key}>
                        {config.icon} {config.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Developer Mode */}
          <Separator />
          <div className="space-y-3">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <Wrench className="w-4 h-4" />
              Developer Mode
            </h4>
            <Button
              variant="outline"
              className="w-full justify-between"
              onClick={() => setDevModalOpen(true)}
            >
              <div className="flex items-center gap-2">
                {isDeveloperMode ? (
                  <Unlock className="w-4 h-4 text-green-500" />
                ) : (
                  <Lock className="w-4 h-4 text-muted-foreground" />
                )}
                <span>Developer Mode</span>
              </div>
              <Badge variant={isDeveloperMode ? 'default' : 'secondary'}>
                {isDeveloperMode ? 'Activo' : 'Bloqueado'}
              </Badge>
            </Button>
          </div>

          {/* Migration Export */}
          <Separator />
          <div className="space-y-3">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <Database className="w-4 h-4" />
              Backup / Migración
            </h4>
            <MigrationExport projectTitle={project.title.replace(/\s+/g, '-').toLowerCase()} />
            <DatabaseCloner />
          </div>
          
          {/* Danger Zone */}
          <Separator />
          <div className="pt-4">
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
        </ScrollArea>
        <DialogFooter className="flex-shrink-0 border-t pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button variant="lime" onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            Guardar Cambios
          </Button>
        </DialogFooter>
      </DialogContent>

      <DeveloperModeModal open={devModalOpen} onOpenChange={setDevModalOpen} />
    </Dialog>
  );
}
