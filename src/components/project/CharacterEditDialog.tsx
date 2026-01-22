/**
 * CharacterEditDialog - Full CRUD dialog for character editing
 * Supports editing: name, character_role, bio, arc, role
 * Used by both Characters.tsx (PRO) and CharactersList.tsx (ASSISTED)
 */

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, User, BookOpen, TrendingUp } from 'lucide-react';

type CharacterRole = 'protagonist' | 'recurring' | 'episodic' | 'extra';
type EntitySubtype = 'human' | 'animal' | 'creature' | 'robot' | 'other';

interface CharacterData {
  id: string;
  name: string;
  role?: string | null;
  character_role?: CharacterRole | null;
  entity_subtype?: EntitySubtype | null;
  bio?: string | null;
  arc?: string | null;
}

interface CharacterEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  character: CharacterData | null;
  onSaved: () => void;
}

const ROLE_OPTIONS: { value: CharacterRole; label: string; description: string }[] = [
  { value: 'protagonist', label: 'Protagonista', description: 'Personaje principal de la historia' },
  { value: 'recurring', label: 'Recurrente', description: 'Aparece en múltiples episodios' },
  { value: 'episodic', label: 'Episódico', description: 'Aparece en un episodio específico' },
  { value: 'extra', label: 'Extra', description: 'Personaje de fondo o secundario' },
];

const ENTITY_SUBTYPE_OPTIONS: { value: EntitySubtype; label: string; icon: string }[] = [
  { value: 'human', label: 'Humano', icon: '👤' },
  { value: 'animal', label: 'Animal', icon: '🐕' },
  { value: 'creature', label: 'Criatura fantástica', icon: '🐉' },
  { value: 'robot', label: 'Robot / IA', icon: '🤖' },
  { value: 'other', label: 'Otro', icon: '❓' },
];

export default function CharacterEditDialog({
  open,
  onOpenChange,
  character,
  onSaved,
}: CharacterEditDialogProps) {
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    role: '',
    character_role: '' as CharacterRole | '',
    entity_subtype: 'human' as EntitySubtype,
    bio: '',
    arc: '',
  });

  // Initialize form when character changes
  useEffect(() => {
    if (character) {
      setFormData({
        name: character.name || '',
        role: character.role || '',
        character_role: character.character_role || '',
        entity_subtype: (character.entity_subtype as EntitySubtype) || 'human',
        bio: character.bio || '',
        arc: character.arc || '',
      });
    }
  }, [character]);

  const handleSave = async () => {
    if (!character) return;
    if (!formData.name.trim()) {
      toast.error('El nombre es obligatorio');
      return;
    }

    setSaving(true);
    try {
      const updateData: Record<string, unknown> = {
        name: formData.name.trim(),
        role: formData.role || null,
        bio: formData.bio || null,
        arc: formData.arc || null,
        entity_subtype: formData.entity_subtype || 'human',
      };

      // Only update character_role if it's set (don't clear it if empty)
      if (formData.character_role) {
        updateData.character_role = formData.character_role;
      }

      const { error } = await supabase
        .from('characters')
        .update(updateData)
        .eq('id', character.id);

      if (error) throw error;

      toast.success('Personaje actualizado');
      onSaved();
      onOpenChange(false);
    } catch (err) {
      console.error('Error saving character:', err);
      toast.error('Error al guardar el personaje');
    } finally {
      setSaving(false);
    }
  };

  if (!character) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="w-5 h-5" />
            Editar Personaje
          </DialogTitle>
          <DialogDescription>
            Modifica los datos de {character.name}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="name">Nombre *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Nombre del personaje"
            />
          </div>

          {/* Entity Subtype - IMPORTANT for animals */}
          <div className="space-y-2">
            <Label>Tipo de entidad</Label>
            <Select
              value={formData.entity_subtype}
              onValueChange={(v) => setFormData({ ...formData, entity_subtype: v as EntitySubtype })}
            >
              <SelectTrigger>
                <SelectValue placeholder="¿Humano, animal...?" />
              </SelectTrigger>
              <SelectContent>
                {ENTITY_SUBTYPE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    <span className="flex items-center gap-2">
                      <span>{opt.icon}</span>
                      <span>{opt.label}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Los animales y criaturas usan prompts especializados
            </p>
          </div>

          {/* Character Role */}
          <div className="space-y-2">
            <Label>Rol narrativo</Label>
            <Select
              value={formData.character_role}
              onValueChange={(v) => setFormData({ ...formData, character_role: v as CharacterRole })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar tipo" />
              </SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    <div className="flex flex-col">
                      <span>{opt.label}</span>
                      <span className="text-xs text-muted-foreground">{opt.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Role (free text) */}
          <div className="space-y-2">
            <Label htmlFor="role">Rol en la historia</Label>
            <Input
              id="role"
              value={formData.role}
              onChange={(e) => setFormData({ ...formData, role: e.target.value })}
              placeholder="Ej: Detective, Mentora, Antagonista..."
            />
            <p className="text-xs text-muted-foreground">
              Describe brevemente su función en la narrativa
            </p>
          </div>

          {/* Bio */}
          <div className="space-y-2">
            <Label htmlFor="bio" className="flex items-center gap-2">
              <BookOpen className="w-4 h-4" />
              Biografía / Descripción
            </Label>
            <Textarea
              id="bio"
              value={formData.bio}
              onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
              placeholder="Describe la apariencia física, personalidad y contexto del personaje..."
              rows={4}
            />
            <p className="text-xs text-muted-foreground">
              Esta descripción se usará para generar imágenes consistentes del personaje
            </p>
          </div>

          {/* Arc */}
          <div className="space-y-2">
            <Label htmlFor="arc" className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Arco narrativo
            </Label>
            <Textarea
              id="arc"
              value={formData.arc}
              onChange={(e) => setFormData({ ...formData, arc: e.target.value })}
              placeholder="Describe la evolución del personaje a lo largo de la historia..."
              rows={3}
            />
            <p className="text-xs text-muted-foreground">
              Cómo cambia el personaje desde el principio hasta el final
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button variant="lime" onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            Guardar Cambios
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
