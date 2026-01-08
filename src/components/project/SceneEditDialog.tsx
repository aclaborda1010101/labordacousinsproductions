/**
 * SceneEditDialog - Full CRUD dialog for scene editing
 * Supports editing: slugline, summary, time_of_day, characters, location, quality, priority
 */

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, MapPin, Users, Clock, Star } from 'lucide-react';

interface Character {
  id: string;
  name: string;
}

interface Location {
  id: string;
  name: string;
}

interface SceneData {
  id: string;
  slugline: string;
  summary: string | null;
  time_of_day: string | null;
  character_ids: string[] | null;
  location_id: string | null;
  quality_mode: 'CINE' | 'ULTRA';
  priority: string;
  episode_no: number;
  scene_no: number;
}

interface SceneEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scene: SceneData | null;
  projectId: string;
  characters: Character[];
  locations: Location[];
  onSaved: () => void;
}

const TIME_OF_DAY_OPTIONS = [
  { value: 'DAY', label: 'Día' },
  { value: 'NIGHT', label: 'Noche' },
  { value: 'DAWN', label: 'Amanecer' },
  { value: 'DUSK', label: 'Atardecer' },
  { value: 'MORNING', label: 'Mañana' },
  { value: 'AFTERNOON', label: 'Tarde' },
  { value: 'CONTINUOUS', label: 'Continuo' },
];

const PRIORITY_OPTIONS = [
  { value: 'P0', label: 'P0 - Crítica', color: 'bg-red-500/20 text-red-600' },
  { value: 'P1', label: 'P1 - Alta', color: 'bg-amber-500/20 text-amber-600' },
  { value: 'P2', label: 'P2 - Normal', color: 'bg-blue-500/20 text-blue-600' },
];

export default function SceneEditDialog({
  open,
  onOpenChange,
  scene,
  projectId,
  characters,
  locations,
  onSaved,
}: SceneEditDialogProps) {
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    slugline: '',
    summary: '',
    time_of_day: '' as string,
    character_ids: [] as string[],
    location_id: '' as string,
    quality_mode: 'CINE' as 'CINE' | 'ULTRA',
    priority: 'P1',
  });

  // Initialize form when scene changes
  useEffect(() => {
    if (scene) {
      setFormData({
        slugline: scene.slugline || '',
        summary: scene.summary || '',
        time_of_day: scene.time_of_day || '',
        character_ids: scene.character_ids || [],
        location_id: scene.location_id || '',
        quality_mode: scene.quality_mode || 'CINE',
        priority: scene.priority || 'P1',
      });
    }
  }, [scene]);

  const handleCharacterToggle = (characterId: string) => {
    setFormData(prev => ({
      ...prev,
      character_ids: prev.character_ids.includes(characterId)
        ? prev.character_ids.filter(id => id !== characterId)
        : [...prev.character_ids, characterId],
    }));
  };

  const handleSave = async () => {
    if (!scene) return;
    if (!formData.slugline.trim()) {
      toast.error('El slugline es obligatorio');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('scenes')
        .update({
          slugline: formData.slugline.trim(),
          summary: formData.summary || null,
          time_of_day: formData.time_of_day || null,
          character_ids: formData.character_ids.length > 0 ? formData.character_ids : null,
          location_id: formData.location_id || null,
          quality_mode: formData.quality_mode,
          priority: formData.priority as 'P0' | 'P1' | 'P2',
        })
        .eq('id', scene.id);

      if (error) throw error;

      toast.success('Escena actualizada');
      onSaved();
      onOpenChange(false);
    } catch (err) {
      console.error('Error saving scene:', err);
      toast.error('Error al guardar la escena');
    } finally {
      setSaving(false);
    }
  };

  if (!scene) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Escena {scene.scene_no}</DialogTitle>
          <DialogDescription>
            Episodio {scene.episode_no} • Escena {scene.scene_no}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Slugline */}
          <div className="space-y-2">
            <Label htmlFor="slugline">Slugline *</Label>
            <Input
              id="slugline"
              value={formData.slugline}
              onChange={(e) => setFormData({ ...formData, slugline: e.target.value })}
              placeholder="INT. LOCATION - TIME"
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">
              Formato: INT./EXT. LOCACIÓN - MOMENTO
            </p>
          </div>

          {/* Summary */}
          <div className="space-y-2">
            <Label htmlFor="summary">Resumen</Label>
            <Textarea
              id="summary"
              value={formData.summary}
              onChange={(e) => setFormData({ ...formData, summary: e.target.value })}
              placeholder="Describe la acción principal de la escena..."
              rows={3}
            />
          </div>

          {/* Time of Day */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Momento del día
            </Label>
            <Select
              value={formData.time_of_day}
              onValueChange={(v) => setFormData({ ...formData, time_of_day: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar momento" />
              </SelectTrigger>
              <SelectContent>
                {TIME_OF_DAY_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Location */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <MapPin className="w-4 h-4" />
              Localización
            </Label>
            <Select
              value={formData.location_id}
              onValueChange={(v) => setFormData({ ...formData, location_id: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar localización" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Sin asignar</SelectItem>
                {locations.map((loc) => (
                  <SelectItem key={loc.id} value={loc.id}>
                    {loc.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Characters */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Users className="w-4 h-4" />
              Personajes en escena
            </Label>
            <div className="border rounded-lg p-3 max-h-40 overflow-y-auto space-y-2">
              {characters.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-2">
                  No hay personajes definidos
                </p>
              ) : (
                characters.map((char) => (
                  <div key={char.id} className="flex items-center gap-2">
                    <Checkbox
                      id={`char-${char.id}`}
                      checked={formData.character_ids.includes(char.id)}
                      onCheckedChange={() => handleCharacterToggle(char.id)}
                    />
                    <label
                      htmlFor={`char-${char.id}`}
                      className="text-sm cursor-pointer flex-1"
                    >
                      {char.name}
                    </label>
                  </div>
                ))
              )}
            </div>
            {formData.character_ids.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {formData.character_ids.length} personaje{formData.character_ids.length > 1 ? 's' : ''} seleccionado{formData.character_ids.length > 1 ? 's' : ''}
              </p>
            )}
          </div>

          {/* Quality Mode */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Star className="w-4 h-4" />
              Modo de calidad
            </Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={formData.quality_mode === 'CINE' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFormData({ ...formData, quality_mode: 'CINE' })}
              >
                CINE
              </Button>
              <Button
                type="button"
                variant={formData.quality_mode === 'ULTRA' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFormData({ ...formData, quality_mode: 'ULTRA' })}
                className={formData.quality_mode === 'ULTRA' ? 'bg-gradient-to-r from-primary to-amber-500' : ''}
              >
                ULTRA
              </Button>
            </div>
          </div>

          {/* Priority */}
          <div className="space-y-2">
            <Label>Prioridad</Label>
            <div className="flex gap-2">
              {PRIORITY_OPTIONS.map((opt) => (
                <Badge
                  key={opt.value}
                  variant="outline"
                  className={`cursor-pointer transition-all ${
                    formData.priority === opt.value ? opt.color + ' border-2' : 'hover:bg-muted'
                  }`}
                  onClick={() => setFormData({ ...formData, priority: opt.value })}
                >
                  {opt.label}
                </Badge>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
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
