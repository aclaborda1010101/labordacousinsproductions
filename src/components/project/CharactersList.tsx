/**
 * CharactersList - MVP Clean UX for Characters
 * Single action per state, adapted by user level (Normal/Pro)
 * Now with Iceberg Architecture: unified pack backend, adaptive UX
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
import { EntityCard, getEntityStatus } from './EntityCard';
import { useEditorialKnowledgeBase } from '@/hooks/useEditorialKnowledgeBase';
import CharacterPackMVP from './CharacterPackMVP';
import {
  Plus,
  Users,
  Loader2,
  Search,
  PlayCircle,
  Trash2,
  Video,
  RefreshCw,
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
  pack_status?: string | null;
  is_ready_for_video?: boolean | null;
  // Generated image URLs from generation_runs
  current_run_image?: string | null;
  accepted_run_image?: string | null;
  canon_image?: string | null;
  // Hero slot image (primary display)
  hero_image?: string | null;
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
  const [importingFromScript, setImportingFromScript] = useState(false);
  const [scriptCharacters, setScriptCharacters] = useState<any[]>([]);

  const [formData, setFormData] = useState({
    name: '',
    role: '',
    character_role: '' as 'protagonist' | 'recurring' | 'episodic' | 'extra' | '',
    bio: '',
  });

  const fetchCharacters = async () => {
    const { data } = await supabase
      .from('characters')
      .select(`
        id, name, role, character_role, bio, arc, turnaround_urls, 
        current_run_id, accepted_run_id, canon_asset_id, pack_completeness_score,
        pack_status, is_ready_for_video
      `)
      .eq('project_id', projectId)
      .order('created_at');

    if (data) {
      // Fetch hero_front slots for each character
      const charIds = data.map(c => c.id);
      let heroImages: Record<string, string> = {};
      
      if (charIds.length > 0) {
        const { data: heroSlots } = await supabase
          .from('character_pack_slots')
          .select('character_id, image_url')
          .in('character_id', charIds)
          .eq('slot_type', 'hero_front')
          .not('image_url', 'is', null);
        
        if (heroSlots) {
          heroImages = Object.fromEntries(heroSlots.map(s => [s.character_id, s.image_url!]));
        }
      }

      // Fetch generated images from runs (fallback)
      const runIds = data.flatMap(c => [c.current_run_id, c.accepted_run_id].filter(Boolean)) as string[];
      const canonIds = data.map(c => c.canon_asset_id).filter(Boolean) as string[];
      
      let runImages: Record<string, string> = {};
      let canonImages: Record<string, string> = {};

      if (runIds.length > 0) {
        const { data: runs } = await supabase
          .from('generation_runs')
          .select('id, output_url')
          .in('id', runIds);
        if (runs) {
          runImages = Object.fromEntries(runs.filter(r => r.output_url).map(r => [r.id, r.output_url!]));
        }
      }

      if (canonIds.length > 0) {
        const { data: canons } = await supabase
          .from('canon_assets')
          .select('id, image_url')
          .in('id', canonIds);
        if (canons) {
          canonImages = Object.fromEntries(canons.filter(c => c.image_url).map(c => [c.id, c.image_url]));
        }
      }

      setCharacters(data.map(c => ({
        ...c,
        turnaround_urls: c.turnaround_urls as Record<string, string> | null,
        current_run_image: c.current_run_id ? runImages[c.current_run_id] : null,
        accepted_run_image: c.accepted_run_id ? runImages[c.accepted_run_id] : null,
        canon_image: c.canon_asset_id ? canonImages[c.canon_asset_id] : null,
        hero_image: heroImages[c.id] || null,
      })));
    }
    setLoading(false);
  };

  // Load characters and check for script characters
  useEffect(() => {
    fetchCharacters();
    fetchScriptCharacters();
  }, [projectId]);

  const fetchScriptCharacters = async () => {
    const { data: script } = await supabase
      .from('scripts')
      .select('parsed_json')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    
    if (script?.parsed_json) {
      const parsed = script.parsed_json as any;
      setScriptCharacters(parsed.characters || parsed.main_characters || []);
    }
  };

  const handleImportFromScript = async () => {
    if (!scriptCharacters.length) {
      toast.error('No hay personajes en el guion para importar');
      return;
    }

    setImportingFromScript(true);
    let insertedCount = 0;
    
    try {
      // Get existing characters to avoid duplicates
      const { data: existingChars } = await supabase
        .from('characters')
        .select('name')
        .eq('project_id', projectId);
      const existingNames = new Set((existingChars || []).map(c => c.name.toLowerCase()));

      for (const char of scriptCharacters) {
        if (!char.name || existingNames.has(char.name.toLowerCase())) continue;
        
        // Map script role to character_role enum
        const roleMapping: Record<string, 'protagonist' | 'recurring' | 'episodic' | 'extra'> = {
          'protagonist': 'protagonist',
          'supporting': 'recurring',
          'recurring': 'recurring',
          'episodic': 'episodic',
          'extra': 'extra',
          'collective_entity': 'recurring',
        };
        const mappedRole = roleMapping[char.role] || 'recurring';
        
        const { error } = await supabase.from('characters').insert({
          project_id: projectId,
          name: char.name,
          role: char.role_detail || char.role || char.description || null,
          character_role: mappedRole,
          bio: char.description || null,
          arc: char.arc || null,
        });
        
        if (!error) {
          insertedCount++;
          existingNames.add(char.name.toLowerCase());
        }
      }

      if (insertedCount > 0) {
        toast.success(`${insertedCount} personajes importados del guion`);
        fetchCharacters();
      } else {
        toast.info('Todos los personajes del guion ya estaban importados');
      }
    } catch (err) {
      console.error('Error importing characters:', err);
      toast.error('Error al importar personajes');
    } finally {
      setImportingFromScript(false);
    }
  };

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
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold">Personajes</h2>
          <p className="text-sm text-muted-foreground">Define los personajes de tu producción</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {scriptCharacters.length > 0 && (
            <Button variant="outline" size="sm" onClick={handleImportFromScript} disabled={importingFromScript}>
              {importingFromScript ? <Loader2 className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />}
              <span className="ml-2 hidden sm:inline">Importar del Guion ({scriptCharacters.length})</span>
              <span className="ml-2 sm:hidden">Importar ({scriptCharacters.length})</span>
            </Button>
          )}
          {characters.length > 0 && (
            <Button variant="outline" size="sm" onClick={handleGenerateAll} disabled={generatingAll}>
              {generatingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4" />}
              <span className="ml-2 hidden sm:inline">Generar Todos</span>
              <span className="ml-2 sm:hidden">Todos</span>
            </Button>
          )}
          <Button variant="gold" size="sm" onClick={() => setShowAddDialog(true)}>
            <Plus className="w-4 h-4" />
            <span className="ml-2 hidden sm:inline">Crear Personaje</span>
            <span className="ml-2 sm:hidden">Crear</span>
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
                {scriptCharacters.length > 0 
                  ? `Hay ${scriptCharacters.length} personajes detectados en tu guion. Impórtalos para comenzar.`
                  : 'Añade personajes para mantener la consistencia visual'}
              </p>
              <div className="flex gap-2 justify-center">
                {scriptCharacters.length > 0 && (
                  <Button variant="gold" onClick={handleImportFromScript} disabled={importingFromScript}>
                    {importingFromScript ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Users className="w-4 h-4 mr-2" />}
                    Importar del Guion
                  </Button>
                )}
                <Button variant={scriptCharacters.length > 0 ? "outline" : "gold"} onClick={() => setShowAddDialog(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Crear Manualmente
                </Button>
              </div>
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
          filteredCharacters.map(character => {
            // Get best available image: hero > canon > accepted > current > turnaround
            const displayImage = character.hero_image || character.canon_image || character.accepted_run_image || character.current_run_image || character.turnaround_urls?.front;
            
            return (
            <EntityCard
              key={character.id}
              id={character.id}
              name={character.name}
              description={character.bio}
              imageUrl={displayImage}
              placeholderIcon={<Users className="w-6 h-6" />}
              status={getEntityStatus(character.current_run_id, character.accepted_run_id, character.canon_asset_id)}
              isExpanded={expandedId === character.id}
              isGenerating={generatingId === character.id}
              isPro={isPro}
              onToggleExpand={() => setExpandedId(expandedId === character.id ? null : character.id)}
              onPrimaryAction={() => handlePrimaryAction(character)}
              badges={
                <>
                  {character.character_role && (
                    <Badge variant="secondary" className="text-xs">
                      {ROLE_LABELS[character.character_role] || character.character_role}
                    </Badge>
                  )}
                  {character.is_ready_for_video && (
                    <Badge variant="pass" className="text-xs">
                      <Video className="w-3 h-3 mr-1" />
                      Video
                    </Badge>
                  )}
                </>
              }
              expandedContent={
                <div className="space-y-4">
                  {/* Character Pack MVP - Iceberg Architecture */}
                  <CharacterPackMVP
                    characterId={character.id}
                    characterName={character.name}
                    characterBio={character.bio}
                    projectId={projectId}
                    isPro={isPro}
                    onPackComplete={() => fetchCharacters()}
                  />

                  {/* Bio/Arc info */}
                  <div className="grid gap-3 pt-2 border-t">
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
                  <div className="flex gap-2 flex-wrap">
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
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Pack status</span>
                      <Badge variant={character.pack_status === 'ready' ? 'pass' : 'secondary'}>
                        {character.pack_status || 'hero_only'}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Completeness</span>
                      <span>{character.pack_completeness_score || 0}%</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Video ready</span>
                      <Badge variant={character.is_ready_for_video ? 'pass' : 'outline'}>
                        {character.is_ready_for_video ? 'Sí' : 'No'}
                      </Badge>
                    </div>
                  </div>
                </div>
              }
            />
          );
          })
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
