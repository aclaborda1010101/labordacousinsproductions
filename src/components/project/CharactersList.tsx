/**
 * CharactersList - MVP Clean UX for Characters
 * Single action per state, adapted by user level (Normal/Pro)
 */

import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { EntityCard, getEntityStatus, EntityStatus } from './EntityCard';
import { useEditorialKnowledgeBase } from '@/hooks/useEditorialKnowledgeBase';
import {
  Plus,
  Users,
  Loader2,
  Search,
  PlayCircle,
  Trash2,
  Settings2,
  Image,
  History,
} from 'lucide-react';

interface CharactersListProps {
  projectId: string;
}

interface Character {
  id: string;
  name: string;
  role: string | null;
  character_role?: 'protagonist' | 'recurring' | 'episodic' | 'extra' | null;
  bio: string | null;
  arc: string | null;
  turnaround_urls: Record<string, string> | null;
  current_run_id?: string | null;
  accepted_run_id?: string | null;
  canon_asset_id?: string | null;
  pack_completeness_score?: number | null;
}

const ROLE_LABELS: Record<string, string> = {
  protagonist: 'Protagonista',
  recurring: 'Recurrente',
  episodic: 'Episódico',
  extra: 'Extra',
};

export default function CharactersList({ projectId }: CharactersListProps) {
  const { userLevel } = useEditorialKnowledgeBase({ projectId, assetType: 'character' });
  const isPro = userLevel === 'pro';

  const [loading, setLoading] = useState(true);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [generatingAll, setGeneratingAll] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    role: '',
    character_role: '' as 'protagonist' | 'recurring' | 'episodic' | 'extra' | '',
    bio: '',
  });

  const fetchCharacters = async () => {
    const { data } = await supabase
      .from('characters')
      .select('id, name, role, character_role, bio, arc, turnaround_urls, current_run_id, accepted_run_id, canon_asset_id, pack_completeness_score')
      .eq('project_id', projectId)
      .order('created_at');

    if (data) {
      setCharacters(data.map(c => ({
        ...c,
        turnaround_urls: c.turnaround_urls as Record<string, string> | null,
      })));
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchCharacters();
  }, [projectId]);

  const resetForm = () => {
    setFormData({ name: '', role: '', character_role: '', bio: '' });
  };

  const handleAddCharacter = async () => {
    if (!formData.name.trim()) {
      toast.error('El nombre es obligatorio');
      return;
    }
    if (!formData.character_role) {
      toast.error('El rol es obligatorio');
      return;
    }

    setSaving(true);
    const { error } = await supabase.from('characters').insert({
      project_id: projectId,
      name: formData.name.trim(),
      role: formData.role || null,
      character_role: formData.character_role,
      bio: formData.bio || null,
    });

    if (error) {
      toast.error('Error al añadir personaje');
    } else {
      toast.success('Personaje añadido');
      resetForm();
      setShowAddDialog(false);
      fetchCharacters();
    }
    setSaving(false);
  };

  const handleDeleteCharacter = async (id: string) => {
    if (!confirm('¿Eliminar este personaje?')) return;
    const { error } = await supabase.from('characters').delete().eq('id', id);
    if (error) {
      toast.error('Error al eliminar');
    } else {
      toast.success('Personaje eliminado');
      fetchCharacters();
    }
  };

  // Primary action handler based on status
  const handlePrimaryAction = async (character: Character) => {
    const status = getEntityStatus(character.current_run_id, character.accepted_run_id, character.canon_asset_id);

    switch (status) {
      case 'not_generated':
        await handleGenerate(character);
        break;
      case 'generated':
        await handleAccept(character);
        break;
      case 'accepted':
        await handleSetCanon(character);
        break;
      case 'canon':
        await handleRegenerate(character);
        break;
    }
  };

  const handleGenerate = async (character: Character) => {
    setGeneratingId(character.id);
    toast.info(`Generando ${character.name}...`);

    try {
      // Build prompt from character data
      const prompt = [
        character.name,
        character.bio || '',
        character.role || '',
      ].filter(Boolean).join('. ');

      const { data, error } = await supabase.functions.invoke('generate-run', {
        body: {
          projectId,
          type: 'character',
          phase: 'exploration',
          engine: 'fal-ai/nano-banana-pro',
          engineSelectedBy: 'auto',
          prompt,
          context: `Character: ${character.name}`,
          params: {
            characterId: character.id,
            characterName: character.name,
            slotType: 'base_look',
            allowTextToImage: true, // Generate without reference image
          },
        },
      });

      if (error) throw error;

      // Update character with run ID
      if (data?.runId) {
        await supabase.from('characters').update({ current_run_id: data.runId }).eq('id', character.id);
      }

      toast.success('Personaje generado');
      fetchCharacters();
    } catch (err) {
      console.error('Generation error:', err);
      toast.error('Error al generar');
    } finally {
      setGeneratingId(null);
    }
  };

  const handleAccept = async (character: Character) => {
    if (!character.current_run_id) return;

    try {
      await supabase.from('characters').update({ accepted_run_id: character.current_run_id }).eq('id', character.id);
      await supabase.from('generation_runs').update({ verdict: 'approved' }).eq('id', character.current_run_id);
      toast.success('Personaje aceptado');
      fetchCharacters();
    } catch (err) {
      toast.error('Error al aceptar');
    }
  };

  const handleSetCanon = async (character: Character) => {
    if (!character.accepted_run_id) return;

    try {
      // Get the run to get the output URL
      const { data: run } = await supabase
        .from('generation_runs')
        .select('output_url')
        .eq('id', character.accepted_run_id)
        .single();

      if (!run?.output_url) {
        toast.error('No hay imagen para fijar como canon');
        return;
      }

      // Create canon asset
      const { data: canonAsset, error: canonError } = await supabase
        .from('canon_assets')
        .insert({
          project_id: projectId,
          asset_type: 'character',
          name: character.name,
          image_url: run.output_url,
          run_id: character.accepted_run_id,
          is_active: true,
        })
        .select()
        .single();

      if (canonError) throw canonError;

      // Update character
      await supabase.from('characters').update({ canon_asset_id: canonAsset.id }).eq('id', character.id);
      await supabase.from('generation_runs').update({ is_canon: true }).eq('id', character.accepted_run_id);

      toast.success('⭐ Fijado como referencia oficial');
      fetchCharacters();
    } catch (err) {
      console.error('Canon error:', err);
      toast.error('Error al fijar como canon');
    }
  };

  const handleRegenerate = async (character: Character) => {
    // For canon items, regenerate creates a new variant
    setGeneratingId(character.id);
    toast.info(`Generando nueva variante de ${character.name}...`);

    try {
      const prompt = [
        character.name,
        character.bio || '',
        character.role || '',
      ].filter(Boolean).join('. ');

      const { data, error } = await supabase.functions.invoke('generate-run', {
        body: {
          projectId,
          type: 'character',
          phase: 'exploration',
          engine: 'fal-ai/nano-banana-pro',
          engineSelectedBy: 'auto',
          prompt,
          context: `Character: ${character.name}`,
          parentRunId: character.accepted_run_id,
          params: {
            characterId: character.id,
            characterName: character.name,
            slotType: 'base_look',
            allowTextToImage: true,
          },
        },
      });

      if (error) throw error;

      if (data?.runId) {
        await supabase.from('characters').update({ current_run_id: data.runId }).eq('id', character.id);
      }

      toast.success('Nueva variante generada');
      fetchCharacters();
    } catch (err) {
      toast.error('Error al regenerar');
    } finally {
      setGeneratingId(null);
    }
  };

  const handleGenerateAll = async () => {
    const toGenerate = characters.filter(c => !c.current_run_id);
    if (toGenerate.length === 0) {
      toast.info('Todos los personajes ya tienen generación');
      return;
    }

    if (!confirm(`¿Generar ${toGenerate.length} personajes?`)) return;

    setGeneratingAll(true);
    for (const char of toGenerate) {
      await handleGenerate(char);
    }
    setGeneratingAll(false);
    toast.success('Generación completada');
  };

  const filteredCharacters = characters.filter(c =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="p-6 flex justify-center">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Personajes</h2>
          <p className="text-muted-foreground">Define los personajes de tu producción</p>
        </div>
        <div className="flex gap-2">
          {characters.length > 0 && (
            <Button variant="outline" onClick={handleGenerateAll} disabled={generatingAll}>
              {generatingAll ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <PlayCircle className="w-4 h-4 mr-2" />}
              Generar Todos
            </Button>
          )}
          <Button variant="gold" onClick={() => setShowAddDialog(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Crear Personaje
          </Button>
        </div>
      </div>

      {/* Search */}
      {characters.length > 0 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar personajes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      )}

      {/* Character list */}
      <div className="space-y-3">
        {characters.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <Users className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No hay personajes aún</h3>
              <p className="text-muted-foreground mb-4">
                Añade personajes para mantener la consistencia visual
              </p>
              <Button variant="gold" onClick={() => setShowAddDialog(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Crear Primer Personaje
              </Button>
            </CardContent>
          </Card>
        ) : filteredCharacters.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <Search className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">Sin resultados</h3>
              <Button variant="outline" onClick={() => setSearchQuery('')}>
                Limpiar búsqueda
              </Button>
            </CardContent>
          </Card>
        ) : (
          filteredCharacters.map(character => (
            <EntityCard
              key={character.id}
              id={character.id}
              name={character.name}
              description={character.bio}
              imageUrl={character.turnaround_urls?.front}
              placeholderIcon={<Users className="w-6 h-6" />}
              status={getEntityStatus(character.current_run_id, character.accepted_run_id, character.canon_asset_id)}
              isExpanded={expandedId === character.id}
              isGenerating={generatingId === character.id}
              isPro={isPro}
              onToggleExpand={() => setExpandedId(expandedId === character.id ? null : character.id)}
              onPrimaryAction={() => handlePrimaryAction(character)}
              badges={
                character.character_role && (
                  <Badge variant="secondary" className="text-xs">
                    {ROLE_LABELS[character.character_role] || character.character_role}
                  </Badge>
                )
              }
              expandedContent={
                <div className="space-y-4">
                  {/* Visual preview */}
                  {character.turnaround_urls?.front && (
                    <div className="flex justify-center">
                      <img
                        src={character.turnaround_urls.front}
                        alt={character.name}
                        className="max-w-[200px] rounded-lg border"
                      />
                    </div>
                  )}

                  {/* Editable fields */}
                  <div className="grid gap-3">
                    <div>
                      <Label className="text-xs text-muted-foreground">Biografía</Label>
                      <p className="text-sm">{character.bio || 'Sin descripción'}</p>
                    </div>
                    {character.arc && (
                      <div>
                        <Label className="text-xs text-muted-foreground">Arco narrativo</Label>
                        <p className="text-sm">{character.arc}</p>
                      </div>
                    )}
                  </div>

                  {/* Quick actions */}
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => handleDeleteCharacter(character.id)}>
                      <Trash2 className="w-4 h-4 mr-2" />
                      Eliminar
                    </Button>
                  </div>
                </div>
              }
              advancedContent={
                <div className="space-y-4">
                  <div className="grid gap-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">ID</span>
                      <code className="text-xs bg-muted px-2 py-1 rounded">{character.id.slice(0, 8)}...</code>
                    </div>
                    {character.current_run_id && (
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Run ID</span>
                        <code className="text-xs bg-muted px-2 py-1 rounded">{character.current_run_id.slice(0, 8)}...</code>
                      </div>
                    )}
                    {character.pack_completeness_score !== null && (
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Pack completeness</span>
                        <span>{character.pack_completeness_score}%</span>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" disabled>
                      <Image className="w-4 h-4 mr-2" />
                      Ver pack completo
                    </Button>
                    <Button variant="outline" size="sm" disabled>
                      <History className="w-4 h-4 mr-2" />
                      Historial
                    </Button>
                  </div>
                </div>
              }
            />
          ))
        )}
      </div>

      {/* Add Character Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Crear Personaje</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nombre *</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Nombre del personaje"
              />
            </div>
            <div className="space-y-2">
              <Label>Tipo de personaje *</Label>
              <Select
                value={formData.character_role}
                onValueChange={(v) => setFormData({ ...formData, character_role: v as any })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona un tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="protagonist">Protagonista</SelectItem>
                  <SelectItem value="recurring">Recurrente</SelectItem>
                  <SelectItem value="episodic">Episódico</SelectItem>
                  <SelectItem value="extra">Extra</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Descripción</Label>
              <Textarea
                value={formData.bio}
                onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                placeholder="Describe al personaje..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              Cancelar
            </Button>
            <Button variant="gold" onClick={handleAddCharacter} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Crear Personaje
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
