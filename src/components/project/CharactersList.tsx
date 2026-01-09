/**
 * CharactersList - MVP Clean UX for Characters
 * Single action per state, adapted by user level (Normal/Pro)
 * Unified image resolution and workflow guide for both modes
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
import { useEntityProgress } from '@/hooks/useEntityProgress';
import CharacterPackMVP from './CharacterPackMVP';
import NextStepNavigator from './NextStepNavigator';
import { resolveImageModel } from '@/config/models';
import { fetchCharacterImages, CharacterImageData } from '@/lib/resolveCharacterImage';
import { CharacterWorkflowGuide, getWorkflowStep } from './CharacterWorkflowGuide';
import CharacterEditDialog from './CharacterEditDialog';
import {
  Plus,
  Users,
  Loader2,
  Search,
  PlayCircle,
  Trash2,
  Video,
  RefreshCw,
  Edit2,
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
}

const ROLE_LABELS: Record<string, string> = {
  protagonist: 'Protagonista',
  recurring: 'Recurrente',
  episodic: 'Episódico',
  extra: 'Extra',
};

/** Wrapper component to use hooks for each character */
interface CharacterCardWithProgressProps {
  character: Character;
  characterImages: Map<string, CharacterImageData>;
  isPro: boolean;
  projectId: string;
  expandedId: string | null;
  generatingIds: Set<string>;
  onToggleExpand: () => void;
  onPrimaryAction: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onPackComplete: () => void;
}

function CharacterCardWithProgress({
  character,
  characterImages,
  isPro,
  projectId,
  expandedId,
  generatingIds,
  onToggleExpand,
  onPrimaryAction,
  onEdit,
  onDelete,
  onPackComplete,
}: CharacterCardWithProgressProps) {
  // Use hook to get real-time progress for this character
  const { isGenerating: taskIsGenerating, progress, phase } = useEntityProgress(character.id);
  
  // Combine local generatingIds with task system
  const isGenerating = generatingIds.has(character.id) || taskIsGenerating;
  
  const imageData = characterImages.get(character.id);
  const displayImage = imageData?.imageUrl || null;
  const hasImage = !!displayImage;
  
  const workflowStep = getWorkflowStep({
    hasBio: !!character.bio,
    hasImage,
    isAccepted: !!character.accepted_run_id,
    isCanon: !!character.canon_asset_id,
  });

  return (
    <EntityCard
      id={character.id}
      name={character.name}
      description={character.bio}
      imageUrl={displayImage}
      placeholderIcon={<Users className="w-6 h-6" />}
      status={getEntityStatus(character.current_run_id, character.accepted_run_id, character.canon_asset_id)}
      isExpanded={expandedId === character.id}
      isGenerating={isGenerating}
      generationProgress={progress}
      generationPhase={phase}
      isPro={isPro}
      onToggleExpand={onToggleExpand}
      onPrimaryAction={onPrimaryAction}
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
          <CharacterWorkflowGuide currentStep={workflowStep} compact className="ml-1" />
        </>
      }
      expandedContent={
        <div className="space-y-4">
          <CharacterWorkflowGuide currentStep={workflowStep} isPro={isPro} />
          
          <CharacterPackMVP
            characterId={character.id}
            characterName={character.name}
            characterBio={character.bio}
            projectId={projectId}
            isPro={isPro}
            onPackComplete={onPackComplete}
          />

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

          <div className="flex gap-2 flex-wrap">
            <Button variant="ghost" size="sm" onClick={onEdit}>
              <Edit2 className="w-4 h-4 mr-2" />
              Editar
            </Button>
            <Button variant="ghost" size="sm" onClick={onDelete}>
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
              <span className="text-muted-foreground">Fuente imagen</span>
              <Badge variant="outline" className="text-xs">
                {imageData?.source || 'none'}
              </Badge>
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
}

export default function CharactersList({ projectId }: CharactersListProps) {
  const { userLevel } = useEditorialKnowledgeBase({ projectId, assetType: 'character' });
  const isPro = userLevel === 'pro';

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [generatingIds, setGeneratingIds] = useState<Set<string>>(new Set());
  
  // Helpers for parallel generation
  const startGenerating = (id: string) => {
    setGeneratingIds(prev => new Set([...prev, id]));
  };
  const stopGenerating = (id: string) => {
    setGeneratingIds(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };
  const [generatingAll, setGeneratingAll] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [saving, setSaving] = useState(false);
  const [importingFromScript, setImportingFromScript] = useState(false);
  const [scriptCharacters, setScriptCharacters] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingCharacter, setEditingCharacter] = useState<Character | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    role: '',
    character_role: '' as 'protagonist' | 'recurring' | 'episodic' | 'extra' | '',
    bio: '',
  });

  // Map to store resolved images for each character
  const [characterImages, setCharacterImages] = useState<Map<string, CharacterImageData>>(new Map());

  const fetchCharacters = async () => {
    setLoadError(null);
    const { data, error } = await supabase
      .from('characters')
      .select(`
        id, name, role, character_role, bio, arc, turnaround_urls, 
        current_run_id, accepted_run_id, canon_asset_id, pack_completeness_score,
        pack_status, is_ready_for_video
      `)
      .eq('project_id', projectId)
      .order('created_at');

    if (error) {
      console.error('Error fetching characters:', error);
      setLoadError(`Error al cargar personajes: ${error.message}`);
      setLoading(false);
      return;
    }

    if (data) {
      // Use unified image resolver
      const imageMap = await fetchCharacterImages(data.map(c => ({
        id: c.id,
        current_run_id: c.current_run_id,
        accepted_run_id: c.accepted_run_id,
        canon_asset_id: c.canon_asset_id,
        turnaround_urls: c.turnaround_urls as Record<string, string> | null,
      })));
      
      setCharacterImages(imageMap);
      setCharacters(data.map(c => ({
        ...c,
        turnaround_urls: c.turnaround_urls as Record<string, string> | null,
      })));
    }
    setLoading(false);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchCharacters();
    setRefreshing(false);
    toast.success('Lista actualizada');
  };

  // Load characters and check for script characters
  useEffect(() => {
    fetchCharacters();
    fetchScriptCharacters();
    
    // Realtime subscription for character changes
    const channel = supabase
      .channel(`characters-${projectId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'characters',
          filter: `project_id=eq.${projectId}`,
        },
        () => {
          fetchCharacters();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
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
    startGenerating(character.id);
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
          engine: resolveImageModel(),
          engineSelectedBy: 'auto',
          prompt,
          context: `Character: ${character.name}`,
          params: {
            characterId: character.id,
            characterName: character.name,
            slotType: 'base_look',
            allowTextToImage: true,
          },
        },
      });

      if (error) throw error;

      // Update character with run ID
      if (data?.runId) {
        await supabase.from('characters').update({ current_run_id: data.runId }).eq('id', character.id);
      }

      toast.success(`${character.name} generado`);
      fetchCharacters();
    } catch (err) {
      console.error('Generation error:', err);
      toast.error(`Error al generar ${character.name}`);
    } finally {
      stopGenerating(character.id);
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
    startGenerating(character.id);
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
          engine: resolveImageModel(),
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

      toast.success(`Nueva variante de ${character.name} generada`);
      fetchCharacters();
    } catch (err) {
      toast.error(`Error al regenerar ${character.name}`);
    } finally {
      stopGenerating(character.id);
    }
  };

  const handleGenerateAll = async () => {
    const toGenerate = characters.filter(c => !c.current_run_id);
    if (toGenerate.length === 0) {
      toast.info('Todos los personajes ya tienen generación');
      return;
    }

    if (!confirm(`¿Generar ${toGenerate.length} personajes en paralelo?`)) return;

    setGeneratingAll(true);
    toast.info(`Iniciando generación de ${toGenerate.length} personajes...`);
    
    // Parallel generation with Promise.allSettled
    await Promise.allSettled(
      toGenerate.map(char => handleGenerate(char))
    );
    
    setGeneratingAll(false);
    toast.success('Generación masiva completada');
  };

  const filteredCharacters = characters.filter(c =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="p-6 flex flex-col items-center justify-center gap-2">
        <Loader2 className="w-6 h-6 animate-spin" />
        <span className="text-sm text-muted-foreground">Cargando personajes...</span>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-4 sm:space-y-6">
      {/* Error banner */}
      {loadError && (
        <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg flex items-center gap-3">
          <div className="flex-1">
            <p className="text-sm text-destructive font-medium">Error de carga</p>
            <p className="text-xs text-muted-foreground">{loadError}</p>
          </div>
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
            {refreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            <span className="ml-2">Reintentar</span>
          </Button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold">Personajes</h2>
          <p className="text-sm text-muted-foreground">
            {characters.length > 0 
              ? `${characters.length} personajes cargados` 
              : 'Define los personajes de tu producción'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {scriptCharacters.length > 0 && (
            <Button variant="outline" size="sm" onClick={handleImportFromScript} disabled={importingFromScript}>
              {importingFromScript ? <Loader2 className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />}
              <span className="ml-2 hidden sm:inline">Importar del Guion ({scriptCharacters.length})</span>
              <span className="ml-2 sm:hidden">Importar ({scriptCharacters.length})</span>
            </Button>
          )}
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleRefresh} 
            disabled={refreshing}
            title="Refrescar lista"
          >
            {refreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          </Button>
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
          filteredCharacters.map(character => (
            <CharacterCardWithProgress
              key={character.id}
              character={character}
              characterImages={characterImages}
              isPro={isPro}
              projectId={projectId}
              expandedId={expandedId}
              generatingIds={generatingIds}
              onToggleExpand={() => setExpandedId(expandedId === character.id ? null : character.id)}
              onPrimaryAction={() => handlePrimaryAction(character)}
              onEdit={() => { setEditingCharacter(character); setShowEditDialog(true); }}
              onDelete={() => handleDeleteCharacter(character.id)}
              onPackComplete={fetchCharacters}
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

      {/* Next Step Navigator - show when there are characters with canon status */}
      {characters.length > 0 && characters.some(c => c.canon_asset_id || c.accepted_run_id) && (
        <NextStepNavigator
          projectId={projectId}
          currentStep="characters"
          completionMessage="¡Personajes definidos!"
          stats={`${characters.filter(c => c.canon_asset_id || c.accepted_run_id).length}/${characters.length} listos`}
        />
      )}

      {/* Character Edit Dialog */}
      <CharacterEditDialog
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
        character={editingCharacter}
        onSaved={() => {
          fetchCharacters();
          setEditingCharacter(null);
        }}
      />
    </div>
  );
}
