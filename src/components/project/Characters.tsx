import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Plus, Users, Loader2, Trash2, Edit2, Save, X, Sparkles, Eye, Shirt, ChevronDown, ChevronUp, Upload, Package, CheckCircle2, Star, ArrowUp, ArrowDown, Copy, Download, Search, Filter, BookOpen, Dna, Book, Wand2, Zap, Play, PlayCircle, Image, Check } from 'lucide-react';
import { useBackgroundTasks } from '@/contexts/BackgroundTasksContext';
import { useEntityProgress } from '@/hooks/useEntityProgress';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { useLanguage } from '@/contexts/LanguageContext';
import { ImageGallery } from '@/components/project/ImageGallery';
import { CharacterPackBuilder } from '@/components/project/CharacterPackBuilder';
import { exportCharacterPackZip } from '@/lib/exportCharacterPackZip';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuCheckboxItem, DropdownMenuLabel } from '@/components/ui/dropdown-menu';
import BibleProfileViewer from './BibleProfileViewer';
import { EntityQCBadge } from './QCStatusBadge';
import CharacterVisualDNAEditor from './CharacterVisualDNAEditor';
import { CharacterNarrativeEditor } from './CharacterNarrativeEditor';
import { TechnicalPromptGenerator } from './TechnicalPromptGenerator';
import { CharacterQuickStart } from './CharacterQuickStart';
import { CharacterCreationWizard } from './CharacterCreationWizard';
import { CharacterCreationWizardPro } from './CharacterCreationWizardPro';
import { ProductionModePanel } from './ProductionModePanel';
import { CharacterGenerationPanel } from './CharacterGenerationPanel';
import { fetchCharacterImages, CharacterImageData } from '@/lib/resolveCharacterImage';
import { CharacterWorkflowGuide, getWorkflowStep } from './CharacterWorkflowGuide';
import CharacterEditDialog from './CharacterEditDialog';

interface CharactersProps { projectId: string; }

interface CharacterOutfit {
  id: string;
  name: string;
  description: string | null;
  reference_urls: unknown;
  sort_order?: number;
  is_default?: boolean;
}

interface Character {
  id: string;
  name: string;
  role: string | null;
  character_role?: 'protagonist' | 'recurring' | 'episodic' | 'extra' | null;
  bio: string | null;
  arc: string | null;
  token: string | null;
  turnaround_urls: Record<string, string> | null;
  expressions: Record<string, string> | null;
  pack_completeness_score?: number | null;
  profile_json?: unknown;
  outfits?: CharacterOutfit[];
  // Unified generation system fields
  current_run_id?: string | null;
  accepted_run_id?: string | null;
  canon_asset_id?: string | null;
}

/** Inline progress component for PRO character cards */
function CharacterPackProgress({ characterId }: { characterId: string }) {
  const { isGenerating, progress, phase } = useEntityProgress(characterId);
  
  if (!isGenerating) return null;
  
  return (
    <div className="mt-2 space-y-1 px-2">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="w-3 h-3 animate-spin" />
        <span className="flex-1 truncate">{phase || 'Generando...'}</span>
        <span className="font-mono">{progress}%</span>
      </div>
      <Progress value={progress} className="h-1" />
    </div>
  );
}

export default function Characters({ projectId }: CharactersProps) {
  const { t } = useLanguage();
  const { addTask, updateTask, completeTask, failTask } = useBackgroundTasks();
  const [loading, setLoading] = useState(true);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showOutfitDialog, setShowOutfitDialog] = useState<string | null>(null);
  const [showPackBuilder, setShowPackBuilder] = useState<string | null>(null);
  const [showQuickStart, setShowQuickStart] = useState<string | null>(null);
  const [showCreationWizard, setShowCreationWizard] = useState(false);
  const [duplicating, setDuplicating] = useState<string | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);
  const [generatingProfile, setGeneratingProfile] = useState<string | null>(null);
  const [approvingCharacter, setApprovingCharacter] = useState<string | null>(null);
  const [autoGenerating, setAutoGenerating] = useState<string | null>(null);
  const [autoGeneratingAll, setAutoGeneratingAll] = useState(false);
  const [autoGenProgress, setAutoGenProgress] = useState<{current: number; total: number; phase: string} | null>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingCharacter, setEditingCharacter] = useState<Character | null>(null);
  
  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string[]>([]);
  const [packStatusFilter, setPackStatusFilter] = useState<'all' | 'complete' | 'incomplete'>('all');
  
  const [formData, setFormData] = useState({
    name: '',
    role: '',
    character_role: '' as 'protagonist' | 'recurring' | 'episodic' | 'extra' | '',
    bio: '',
    arc: '',
  });

  const [outfitForm, setOutfitForm] = useState({
    name: '',
    description: '',
    referenceImage: null as string | null,
  });

  // State for pack slot thumbnails (fallback when turnaround_urls is empty)
  const [packThumbnails, setPackThumbnails] = useState<Map<string, string>>(new Map());
  
  // Unified image resolution
  const [characterImages, setCharacterImages] = useState<Map<string, CharacterImageData>>(new Map());

  const fetchCharacters = async () => { 
    const { data: charsData } = await supabase
      .from('characters')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at'); 
    
    if (charsData) {
      // Fetch outfits for each character, sorted by sort_order
      const charsWithOutfits = await Promise.all(charsData.map(async (char) => {
        const { data: outfits } = await supabase
          .from('character_outfits')
          .select('*')
          .eq('character_id', char.id)
          .order('sort_order');
        return { 
          ...char, 
          turnaround_urls: char.turnaround_urls as Record<string, string> | null,
          expressions: char.expressions as Record<string, string> | null,
          outfits: (outfits || []) as CharacterOutfit[]
        };
      }));
      setCharacters(charsWithOutfits);

      // Unified image resolution for consistent display
      const imageMap = await fetchCharacterImages(charsWithOutfits.map(c => ({
        id: c.id,
        current_run_id: c.current_run_id,
        accepted_run_id: c.accepted_run_id,
        canon_asset_id: c.canon_asset_id,
        turnaround_urls: c.turnaround_urls,
      })));
      setCharacterImages(imageMap);

      // Keep legacy packThumbnails for fallback
      const charIds = charsWithOutfits.filter(c => !c.turnaround_urls?.front).map(c => c.id);
      if (charIds.length > 0) {
        const { data: slots } = await supabase
          .from('character_pack_slots')
          .select('character_id, image_url, slot_type')
          .in('character_id', charIds)
          .in('slot_type', ['closeup', 'anchor_closeup', 'hero_front', 'turnaround'])
          .not('image_url', 'is', null)
          .order('slot_type');

        if (slots && slots.length > 0) {
          const thumbMap = new Map<string, string>();
          slots.forEach(slot => {
            if (!thumbMap.has(slot.character_id) && slot.image_url) {
              thumbMap.set(slot.character_id, slot.image_url);
            }
          });
          setPackThumbnails(thumbMap);
        }
      }
    }
    setLoading(false); 
  };

  useEffect(() => {
    fetchCharacters();
    
    // Realtime subscription for character changes
    const channel = supabase
      .channel(`characters-pro-${projectId}`)
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

  const resetForm = () => {
    setFormData({ name: '', role: '', character_role: '', bio: '', arc: '' });
    setEditingId(null);
  };

  const handleAddCharacter = async () => {
    if (!formData.name.trim()) {
      toast.error('El nombre es obligatorio');
      return;
    }
    if (!formData.character_role) {
      toast.error('El rol del personaje es obligatorio');
      return;
    }
    
    setSaving(true);
    const { error } = await supabase
      .from('characters')
      .insert({ 
        project_id: projectId, 
        name: formData.name.trim(),
        role: formData.role || null,
        character_role: formData.character_role,
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
      character_role: character.character_role || '',
      bio: character.bio || '',
      arc: character.arc || '',
    });
    setEditingId(character.id);
  };

  const generateCharacterAI = async (character: Character) => {
    setGenerating(character.id);
    toast.info('Generando personaje con IA... Esto puede tardar un momento.');

    try {
      const response = await supabase.functions.invoke('generate-character', {
        body: {
          name: character.name,
          role: character.role || 'main character',
          bio: character.bio || 'A compelling character',
        }
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      const { description, turnarounds, expressionSheet } = response.data;

      // Update character with generated content
      await supabase
        .from('characters')
        .update({
          bio: description || character.bio,
          turnaround_urls: turnarounds || null,
          expressions: expressionSheet ? { sheet: expressionSheet } : null,
        })
        .eq('id', character.id);

      toast.success('Personaje generado correctamente');
      fetchCharacters();
    } catch (error) {
      console.error('Error generating character:', error);
      toast.error('Error al generar personaje. Inténtalo de nuevo.');
    } finally {
      setGenerating(null);
    }
  };

  // Auto-generate full character pack from script data
  const autoGenerateCharacterPack = async (character: Character) => {
    // Register task in global background task system
    const taskId = addTask({
      type: 'character_generation',
      title: `Pack: ${character.name}`,
      projectId,
      entityId: character.id,
      entityName: character.name,
    });

    setAutoGenerating(character.id);
    
    try {
      // Phase 1: Generate Visual DNA if not exists
      updateTask(taskId, { progress: 5, description: 'Generando Visual DNA...' });
      
      const visualDNAResponse = await supabase.functions.invoke('generate-visual-dna', {
        body: {
          characterId: character.id,
          characterName: character.name,
        }
      });
      
      if (visualDNAResponse.error) {
        console.warn('Visual DNA generation error:', visualDNAResponse.error);
      } else if (visualDNAResponse.data?.visualDNA) {
        // Save Visual DNA
        await supabase
          .from('character_visual_dna')
          .upsert({
            character_id: character.id,
            visual_dna: visualDNAResponse.data.visualDNA,
            version: 1,
            version_name: 'Auto-Generated',
            is_active: true,
            continuity_lock: {
              never_change: [],
              allowed_variants: [],
              must_avoid: [],
              version_notes: 'Generated via auto-generate'
            }
          }, { 
            onConflict: 'character_id,version',
            ignoreDuplicates: false 
          });
      }
      
      // Phase 2: Generate Identity Closeup
      updateTask(taskId, { progress: 15, description: 'Identity Closeup...' });
      await generateSlotForCharacter(character.id, character.name, character.bio || '', 'anchor_closeup', null, null, 0);
      
      // Phase 3: Generate Front View
      updateTask(taskId, { progress: 30, description: 'Vista Frontal...' });
      await generateSlotForCharacter(character.id, character.name, character.bio || '', 'turnaround', 'front', null, 1);
      
      // Phase 4: Generate Side View
      updateTask(taskId, { progress: 50, description: 'Vista Lateral...' });
      await generateSlotForCharacter(character.id, character.name, character.bio || '', 'turnaround', 'side', null, 2);
      
      // Phase 5: Generate Back View
      updateTask(taskId, { progress: 65, description: 'Vista Trasera...' });
      await generateSlotForCharacter(character.id, character.name, character.bio || '', 'turnaround', 'back', null, 3);
      
      // Phase 6: Generate Neutral Expression
      updateTask(taskId, { progress: 80, description: 'Expresión Neutral...' });
      await generateSlotForCharacter(character.id, character.name, character.bio || '', 'expression', null, 'neutral', 4);
      
      // Phase 7: Update completeness
      updateTask(taskId, { progress: 95, description: 'Finalizando...' });
      await supabase.rpc('calculate_pack_completeness', { p_character_id: character.id });
      
      completeTask(taskId, { pack: 'complete', slots: 5 });
      toast.success(`Pack de ${character.name} generado`);
      fetchCharacters();
    } catch (error) {
      console.error('Auto-generate error:', error);
      failTask(taskId, error instanceof Error ? error.message : 'Error en generación');
      toast.error(`Error generando pack de ${character.name}`);
    } finally {
      setAutoGenerating(null);
      setAutoGenProgress(null);
    }
  };

  const generateSlotForCharacter = async (
    charId: string, 
    charName: string, 
    charBio: string, 
    slotType: string, 
    viewAngle: string | null, 
    expressionName: string | null,
    slotIndex: number
  ) => {
    // Create or get slot - handle null values properly (SQL null = null is false)
    let query = supabase
      .from('character_pack_slots')
      .select('id')
      .eq('character_id', charId)
      .eq('slot_type', slotType);
    
    // Use .is() for null comparisons instead of .eq()
    if (viewAngle === null) {
      query = query.is('view_angle', null);
    } else {
      query = query.eq('view_angle', viewAngle);
    }
    
    if (expressionName === null) {
      query = query.is('expression_name', null);
    } else {
      query = query.eq('expression_name', expressionName);
    }

    const { data: existingSlot } = await query.maybeSingle();

    let slotId = existingSlot?.id;

    if (!slotId) {
      const { data: newSlot, error } = await supabase
        .from('character_pack_slots')
        .insert({
          character_id: charId,
          slot_type: slotType,
          slot_index: slotIndex,
          view_angle: viewAngle,
          expression_name: expressionName,
          status: 'pending',
          required: true
        })
        .select('id')
        .single();

      if (error) throw error;
      slotId = newSlot.id;
    }

    // Generate image - allowTextToImage enables generation without pre-uploaded photos
    const { data, error } = await supabase.functions.invoke('generate-character', {
      body: {
        slotId,
        characterId: charId,
        characterName: charName,
        characterBio: charBio,
        slotType,
        viewAngle,
        expressionName,
        useReferenceAnchoring: true,
        referenceWeight: 0.75,
        allowTextToImage: true // Generate from text if no reference photos exist
      }
    });

    if (error) throw error;
    return data;
  };

  // Auto-generate ALL characters in parallel with concurrency limit
  const autoGenerateAllCharacters = async () => {
    const charactersToGenerate = characters.filter(c => 
      c.character_role && (!c.pack_completeness_score || c.pack_completeness_score < 50)
    );
    
    if (charactersToGenerate.length === 0) {
      toast.info('No hay personajes pendientes de generar');
      return;
    }

    if (!confirm(`¿Generar packs para ${charactersToGenerate.length} personajes en paralelo?`)) {
      return;
    }

    setAutoGeneratingAll(true);
    toast.info(`Iniciando ${charactersToGenerate.length} packs en paralelo...`);
    
    // Parallel generation with concurrency limit
    const MAX_PARALLEL = 3;
    
    for (let i = 0; i < charactersToGenerate.length; i += MAX_PARALLEL) {
      const batch = charactersToGenerate.slice(i, i + MAX_PARALLEL);
      await Promise.allSettled(
        batch.map(char => autoGenerateCharacterPack(char))
      );
    }
    
    setAutoGeneratingAll(false);
    toast.success('Generación masiva completada');
    fetchCharacters();
  };

  // Generate full profile with Entity Builder
  const generateProfileWithEntityBuilder = async (character: Character): Promise<boolean> => {
    setGeneratingProfile(character.id);
    toast.info('Generando perfil completo con Entity Builder... Esto puede tardar un momento.');

    try {
      const response = await supabase.functions.invoke('entity-builder', {
        body: {
          entityType: 'character',
          name: character.name,
          description: character.bio || '',
          context: {
            role: character.role,
            characterRole: character.character_role,
            arc: character.arc,
          },
          language: 'es',
        }
      });

      if (response.error) {
        if (response.error.message?.includes('429')) {
          toast.error('Límite de solicitudes excedido. Intenta de nuevo en unos minutos.');
        } else if (response.error.message?.includes('402')) {
          toast.error('Créditos insuficientes. Por favor añade fondos a tu cuenta.');
        } else {
          throw new Error(response.error.message);
        }
        return false;
      }

      const { entity } = response.data;

      // Update character with generated profile
      await supabase
        .from('characters')
        .update({
          profile_json: entity,
          bio: entity.profile?.description || character.bio,
        })
        .eq('id', character.id);

      toast.success('Perfil de personaje generado correctamente');
      fetchCharacters();
      return true;
    } catch (error) {
      console.error('Error generating character profile:', error);
      toast.error('Error al generar perfil. Inténtalo de nuevo.');
      return false;
    } finally {
      setGeneratingProfile(null);
    }
  };

  // Unified approval: generates profile + sets canon asset
  const approveCharacter = async (character: Character) => {
    setApprovingCharacter(character.id);
    
    try {
      // 1. Generate profile if it doesn't exist
      if (!character.profile_json) {
        toast.info('Generando perfil técnico...');
        const profileSuccess = await generateProfileWithEntityBuilder(character);
        if (!profileSuccess) {
          setApprovingCharacter(null);
          return;
        }
      }
      
      // 2. Find main image (closeup_front from pack)
      const { data: slot } = await supabase
        .from('character_pack_slots')
        .select('image_url, run_id')
        .eq('character_id', character.id)
        .eq('slot_type', 'closeup_front')
        .not('image_url', 'is', null)
        .maybeSingle();
      
      if (!slot?.image_url) {
        toast.warning('Genera primero una imagen principal (closeup frontal) para aprobar');
        setApprovingCharacter(null);
        return;
      }
      
      // 3. Create canon asset
      const { data: canonAsset, error: canonError } = await supabase
        .from('canon_assets')
        .insert({
          project_id: projectId,
          asset_type: 'character',
          name: character.name,
          image_url: slot.image_url,
          run_id: slot.run_id || crypto.randomUUID(),
          is_active: true
        })
        .select()
        .single();
      
      if (canonError) throw canonError;
      
      // 4. Update character with canon_asset_id
      await supabase
        .from('characters')
        .update({ canon_asset_id: canonAsset.id })
        .eq('id', character.id);
      
      toast.success(`${character.name} aprobado para producción ✓`);
      fetchCharacters();
      
    } catch (error) {
      console.error('Error approving character:', error);
      toast.error('Error al aprobar personaje');
    } finally {
      setApprovingCharacter(null);
    }
  };

  const addOutfit = async (characterId: string, generateWithAI: boolean = false) => {
    if (!outfitForm.name.trim()) {
      toast.error('El nombre del vestuario es obligatorio');
      return;
    }

    setSaving(true);

    if (generateWithAI) {
      // Find the character
      const character = characters.find(c => c.id === characterId);
      if (!character) {
        toast.error('Personaje no encontrado');
        setSaving(false);
        return;
      }

      toast.info('Generando vestuario con IA... Esto puede tardar un momento.');

      try {
        const response = await supabase.functions.invoke('generate-outfit', {
          body: {
            characterId,
            characterName: character.name,
            characterDescription: character.bio || 'A character',
            outfitName: outfitForm.name.trim(),
            outfitDescription: outfitForm.description || '',
            referenceImageBase64: outfitForm.referenceImage || undefined,
          }
        });

        if (response.error) {
          throw new Error(response.error.message);
        }

        toast.success('Vestuario generado correctamente');
        setOutfitForm({ name: '', description: '', referenceImage: null });
        setShowOutfitDialog(null);
        fetchCharacters();
      } catch (error) {
        console.error('Error generating outfit:', error);
        toast.error('Error al generar vestuario. Inténtalo de nuevo.');
      }
    } else {
      const { error } = await supabase
        .from('character_outfits')
        .insert({
          character_id: characterId,
          name: outfitForm.name.trim(),
          description: outfitForm.description || null,
        });

      if (error) {
        toast.error('Error al añadir vestuario');
      } else {
        toast.success('Vestuario añadido');
        setOutfitForm({ name: '', description: '', referenceImage: null });
        setShowOutfitDialog(null);
        fetchCharacters();
      }
    }
    setSaving(false);
  };

  const deleteOutfit = async (outfitId: string) => {
    const { error } = await supabase.from('character_outfits').delete().eq('id', outfitId);
    if (error) {
      toast.error('Error al eliminar vestuario');
    } else {
      toast.success('Vestuario eliminado');
      fetchCharacters();
    }
  };

  const setDefaultOutfit = async (outfitId: string) => {
    const { error } = await supabase.from('character_outfits').update({ is_default: true }).eq('id', outfitId);
    if (error) {
      toast.error('Error al establecer outfit por defecto');
    } else {
      toast.success('Outfit establecido como principal');
      fetchCharacters();
    }
  };

  const moveOutfit = async (characterId: string, outfitId: string, direction: 'up' | 'down') => {
    const character = characters.find(c => c.id === characterId);
    if (!character?.outfits) return;

    const currentIndex = character.outfits.findIndex(o => o.id === outfitId);
    if (currentIndex === -1) return;

    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (newIndex < 0 || newIndex >= character.outfits.length) return;

    // Swap sort orders
    const currentOutfit = character.outfits[currentIndex];
    const swapOutfit = character.outfits[newIndex];

    await supabase.from('character_outfits').update({ sort_order: newIndex }).eq('id', currentOutfit.id);
    await supabase.from('character_outfits').update({ sort_order: currentIndex }).eq('id', swapOutfit.id);
    
    fetchCharacters();
  };

  const getRoleLabel = (role: string) => {
    const labels: Record<string, string> = {
      protagonist: 'Protagonista',
      antagonist: 'Antagonista',
      supporting: 'Secundario',
      recurring: 'Recurrente',
      cameo: 'Cameo',
    };
    return labels[role] || role;
  };

  const getCharacterRoleLabel = (role: string) => {
    const labels: Record<string, string> = {
      protagonist: 'Protagonista',
      recurring: 'Recurrente',
      episodic: 'Episódico',
      extra: 'Extra',
    };
    return labels[role] || role;
  };

  const getCharacterRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'protagonist': return 'bg-amber-500/20 text-amber-600 border-amber-500/30';
      case 'recurring': return 'bg-blue-500/20 text-blue-600 border-blue-500/30';
      case 'episodic': return 'bg-purple-500/20 text-purple-600 border-purple-500/30';
      case 'extra': return 'bg-gray-500/20 text-gray-600 border-gray-500/30';
      default: return '';
    }
  };

  // Duplicate character
  const duplicateCharacter = async (character: Character) => {
    setDuplicating(character.id);
    try {
      // Create new character
      const { data: newChar, error: charError } = await supabase
        .from('characters')
        .insert({
          project_id: projectId,
          name: `${character.name} (copia)`,
          role: character.role,
          character_role: character.character_role,
          bio: character.bio,
          arc: character.arc,
          token: character.token,
          turnaround_urls: character.turnaround_urls,
          expressions: character.expressions,
        })
        .select()
        .single();
      
      if (charError) throw charError;
      
      // Duplicate outfits
      if (character.outfits && character.outfits.length > 0) {
        const outfitInserts = character.outfits.map(o => ({
          character_id: newChar.id,
          name: o.name,
          description: o.description,
          sort_order: o.sort_order,
          is_default: o.is_default,
        }));
        
        await supabase.from('character_outfits').insert(outfitInserts);
      }
      
      toast.success('Personaje duplicado correctamente');
      fetchCharacters();
    } catch (error) {
      console.error('Error duplicating character:', error);
      toast.error('Error al duplicar personaje');
    } finally {
      setDuplicating(null);
    }
  };

  // Export character pack as ZIP
  const handleExportPack = async (character: Character) => {
    setExporting(character.id);
    try {
      const blob = await exportCharacterPackZip(character.id, character.name);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${character.name.replace(/[^a-z0-9]/gi, '_')}_pack.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Character Pack exportado');
    } catch (error) {
      console.error('Error exporting pack:', error);
      toast.error('Error al exportar pack');
    } finally {
      setExporting(null);
    }
  };

  // Filter characters
  const filteredCharacters = characters.filter(char => {
    // Search filter
    if (searchQuery && !char.name.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }
    // Role filter
    if (roleFilter.length > 0 && char.character_role && !roleFilter.includes(char.character_role)) {
      return false;
    }
    // Pack status filter
    if (packStatusFilter === 'complete' && (char.pack_completeness_score || 0) < 90) {
      return false;
    }
    if (packStatusFilter === 'incomplete' && (char.pack_completeness_score || 0) >= 90) {
      return false;
    }
    return true;
  });

  if (loading) {
    return (
      <div className="p-6 flex justify-center">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground">{t.characters.title}</h2>
          <p className="text-muted-foreground">{t.characters.subtitle}</p>
        </div>
        <div className="flex gap-2">
          {characters.length > 0 && (
            <Button 
              variant="outline" 
              onClick={autoGenerateAllCharacters}
              disabled={autoGeneratingAll}
            >
              {autoGeneratingAll ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <PlayCircle className="w-4 h-4 mr-2" />
              )}
              Generar Todos
            </Button>
          )}
          <Button variant="gold" onClick={() => setShowCreationWizard(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Crear Personaje
          </Button>
        </div>
      </div>

      {/* Search and Filters */}
      {characters.length > 0 && (
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar personajes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="flex gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Filter className="w-4 h-4 mr-2" />
                  Rol {roleFilter.length > 0 && `(${roleFilter.length})`}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuLabel>Filtrar por rol</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuCheckboxItem 
                  checked={roleFilter.includes('protagonist')}
                  onCheckedChange={(checked) => setRoleFilter(checked ? [...roleFilter, 'protagonist'] : roleFilter.filter(r => r !== 'protagonist'))}
                >
                  Protagonista
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem 
                  checked={roleFilter.includes('recurring')}
                  onCheckedChange={(checked) => setRoleFilter(checked ? [...roleFilter, 'recurring'] : roleFilter.filter(r => r !== 'recurring'))}
                >
                  Recurrente
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem 
                  checked={roleFilter.includes('episodic')}
                  onCheckedChange={(checked) => setRoleFilter(checked ? [...roleFilter, 'episodic'] : roleFilter.filter(r => r !== 'episodic'))}
                >
                  Episódico
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem 
                  checked={roleFilter.includes('extra')}
                  onCheckedChange={(checked) => setRoleFilter(checked ? [...roleFilter, 'extra'] : roleFilter.filter(r => r !== 'extra'))}
                >
                  Extra
                </DropdownMenuCheckboxItem>
                {roleFilter.length > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setRoleFilter([])}>
                      Limpiar filtros
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            <Select value={packStatusFilter} onValueChange={(v: 'all' | 'complete' | 'incomplete') => setPackStatusFilter(v)}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Pack status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="complete">Pack ≥90%</SelectItem>
                <SelectItem value="incomplete">Pack &lt;90%</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}
      
      <div className="grid gap-4">
        {characters.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <Users className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-2">{t.characters.noCharacters}</h3>
              <p className="text-muted-foreground mb-4">
                Añade personajes para mantener la consistencia visual en tu producción
              </p>
              <Button variant="gold" onClick={() => setShowCreationWizard(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Crear Primer Personaje
              </Button>
            </CardContent>
          </Card>
        ) : filteredCharacters.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <Search className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-2">Sin resultados</h3>
              <p className="text-muted-foreground mb-4">
                No se encontraron personajes con los filtros aplicados
              </p>
              <Button variant="outline" onClick={() => { setSearchQuery(''); setRoleFilter([]); setPackStatusFilter('all'); }}>
                Limpiar filtros
              </Button>
            </CardContent>
          </Card>
        ) : (
          filteredCharacters.map(character => (
            <Card key={character.id} className="overflow-hidden">
              <CardContent className="p-0">
                {editingId === character.id ? (
                  <div className="p-4 space-y-4">
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
                  <>
                    {/* Character Header - Desktop */}
                    {/* Character Card - Desktop */}
                    <div className="hidden sm:flex flex-col p-4 gap-3">
                      {/* Row 1: Avatar + Name + Actions */}
                      <div className="flex items-start gap-4">
                        <div className="w-16 h-16 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold text-2xl overflow-hidden shrink-0">
                          {(characterImages.get(character.id)?.imageUrl || character.turnaround_urls?.front || packThumbnails.get(character.id)) ? (
                            <img 
                              src={characterImages.get(character.id)?.imageUrl || character.turnaround_urls?.front || packThumbnails.get(character.id)} 
                              alt={character.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            character.name[0].toUpperCase()
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-foreground text-lg">{character.name}</h3>
                          {character.bio && (
                            <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{character.bio}</p>
                          )}
                        </div>
                        {/* Top Row: Production Actions */}
                        <div className="flex gap-2 items-center shrink-0">
                          {character.character_role && (
                            <>
                              <Button 
                                variant="gold" 
                                size="sm"
                                className="h-9"
                                onClick={() => autoGenerateCharacterPack(character)}
                                disabled={autoGenerating === character.id}
                                title="Generar pack automáticamente con IA"
                              >
                                {autoGenerating === character.id ? (
                                  <>
                                    <Loader2 className="w-4 h-4 animate-spin mr-1" />
                                    {autoGenProgress?.phase?.slice(0, 15) || 'Generando...'}
                                  </>
                                ) : (
                                  <>
                                    <Play className="w-4 h-4 mr-1" />
                                    Generar
                                  </>
                                )}
                              </Button>
                              <Button 
                                variant="outline" 
                                size="sm"
                                className="h-9"
                                onClick={() => setShowPackBuilder(character.id)}
                              >
                                <Package className="w-4 h-4 mr-1" />
                                Pack
                              </Button>
                              {(character.pack_completeness_score || 0) >= 90 && (
                                <Button 
                                  variant="outline" 
                                  size="sm"
                                  className="h-9 border-amber-500/50 text-amber-600 hover:bg-amber-50"
                                  onClick={() => setShowQuickStart(character.id)}
                                  title="Modo Producción: Entrenar LoRA para máxima consistencia"
                                >
                                  <Zap className="w-4 h-4 mr-1" />
                                  LoRA
                                </Button>
                              )}
                            </>
                          )}
                          {character.canon_asset_id ? (
                            <Badge className="h-9 px-3 flex items-center bg-amber-500 gap-1">
                              <Star className="w-3 h-3" />
                              Aprobado
                            </Badge>
                          ) : (
                            <Button 
                              variant="outline" 
                              size="sm"
                              className="h-9 border-green-500/50 text-green-600 hover:bg-green-50"
                              onClick={() => approveCharacter(character)}
                              disabled={approvingCharacter === character.id || generatingProfile === character.id}
                              title="Aprobar personaje para producción (genera perfil + establece imagen oficial)"
                            >
                              {approvingCharacter === character.id || generatingProfile === character.id ? (
                                <Loader2 className="w-4 h-4 animate-spin mr-1" />
                              ) : (
                                <Check className="w-4 h-4 mr-1" />
                              )}
                              Aprobar
                            </Button>
                          )}
                          {character.pack_completeness_score && character.pack_completeness_score > 0 && (
                            <Button 
                              variant="outline" 
                              size="sm"
                              className="h-9 border-purple-500/50 text-purple-400 hover:bg-purple-500/20 hover:text-purple-300 hover:border-purple-400"
                              onClick={() => setShowPackBuilder(character.id)}
                              title="Mejorar coherencia visual del personaje"
                            >
                              <Wand2 className="w-4 h-4 mr-1" />
                              Coherencia
                            </Button>
                          )}
                          <Button 
                            variant="ghost" 
                            size="icon"
                            className="h-9 w-9"
                            onClick={() => setExpandedId(expandedId === character.id ? null : character.id)}
                          >
                            {expandedId === character.id ? (
                              <ChevronUp className="w-4 h-4" />
                            ) : (
                              <ChevronDown className="w-4 h-4" />
                            )}
                          </Button>
                        </div>
                      </div>
                      
                      {/* Bottom Row: Management Actions */}
                      <div className="flex items-center justify-between pt-2 border-t border-border/30">
                        <div className="flex items-center gap-2">
                          {character.character_role && (
                            <Badge variant="outline" className={`min-w-[80px] justify-center ${getCharacterRoleBadgeColor(character.character_role)}`}>
                              {getCharacterRoleLabel(character.character_role)}
                            </Badge>
                          )}
                          {character.role && (
                            <Badge variant="secondary" className="min-w-[70px] justify-center">
                              {getRoleLabel(character.role)}
                            </Badge>
                          )}
                          {character.pack_completeness_score !== null && character.pack_completeness_score !== undefined && (
                            <Badge 
                              variant={character.pack_completeness_score >= 90 ? "default" : "secondary"}
                              className={`min-w-[75px] justify-center ${character.pack_completeness_score >= 90 ? "bg-green-600" : ""}`}
                            >
                              <Package className="w-3 h-3 mr-1" />
                              Pack {character.pack_completeness_score}%
                            </Badge>
                          )}
                          <EntityQCBadge
                            entityType="character"
                            hasProfile={!!character.profile_json}
                            packScore={character.pack_completeness_score || 0}
                            hasContinuityLock={!!(character.profile_json as any)?.continuity_lock}
                          />
                          <CharacterWorkflowGuide 
                            currentStep={getWorkflowStep({
                              hasBio: !!character.bio,
                              hasImage: !!(characterImages.get(character.id)?.imageUrl || character.turnaround_urls?.front),
                              isAccepted: !!character.accepted_run_id,
                              isCanon: !!character.canon_asset_id,
                            })} 
                            compact 
                          />
                        </div>
                        <div className="flex gap-1 items-center">
                          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => { setEditingCharacter(character); setShowEditDialog(true); }} title="Editar">
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon"
                            className="h-9 w-9"
                            onClick={() => duplicateCharacter(character)}
                            disabled={duplicating === character.id}
                            title="Duplicar"
                          >
                            {duplicating === character.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Copy className="w-4 h-4" />}
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon"
                            className="h-9 w-9"
                            onClick={() => handleExportPack(character)}
                            disabled={exporting === character.id || !character.pack_completeness_score}
                            title="Exportar Pack ZIP"
                          >
                            {exporting === character.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                          </Button>
                          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => handleDeleteCharacter(character.id)} title="Eliminar">
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                      
                      {/* Inline Progress Bar for Desktop */}
                      <CharacterPackProgress characterId={character.id} />

                    </div>

                    {/* Character Card - Mobile */}
                    <div className="flex sm:hidden flex-col p-3 gap-2">
                      {/* Row 1: Avatar + Name + Expand */}
                      <div className="flex items-start gap-3">
                        <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold text-xl overflow-hidden shrink-0">
                          {character.turnaround_urls?.front ? (
                            <img 
                              src={character.turnaround_urls.front} 
                              alt={character.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            character.name[0].toUpperCase()
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-foreground text-sm truncate">{character.name}</h3>
                          {character.bio && (
                            <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{character.bio}</p>
                          )}
                        </div>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="shrink-0"
                          onClick={() => setExpandedId(expandedId === character.id ? null : character.id)}
                        >
                          {expandedId === character.id ? (
                            <ChevronUp className="w-4 h-4" />
                          ) : (
                            <ChevronDown className="w-4 h-4" />
                          )}
                        </Button>
                      </div>

                      {/* Row 2: Badges - scrollable */}
                      <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide pt-2 border-t border-border/30">
                        {character.character_role && (
                          <Badge variant="outline" className={`text-xs shrink-0 min-w-[60px] justify-center ${getCharacterRoleBadgeColor(character.character_role)}`}>
                            {getCharacterRoleLabel(character.character_role)}
                          </Badge>
                        )}
                        {character.canon_asset_id && (
                          <Badge className="bg-amber-500 gap-1 text-xs shrink-0 min-w-[55px] justify-center">
                            <Star className="w-3 h-3" />
                            Aprobado
                          </Badge>
                        )}
                        {character.pack_completeness_score !== null && character.pack_completeness_score !== undefined && (
                          <Badge 
                            variant={character.pack_completeness_score >= 90 ? "default" : "secondary"}
                            className={`text-xs shrink-0 min-w-[55px] justify-center ${character.pack_completeness_score >= 90 ? "bg-green-600" : ""}`}
                          >
                            <Package className="w-3 h-3 mr-0.5" />
                            {character.pack_completeness_score}%
                          </Badge>
                        )}
                        <EntityQCBadge
                          entityType="character"
                          hasProfile={!!character.profile_json}
                          packScore={character.pack_completeness_score || 0}
                          hasContinuityLock={!!(character.profile_json as any)?.continuity_lock}
                        />
                        <CharacterWorkflowGuide 
                          currentStep={getWorkflowStep({
                            hasBio: !!character.bio,
                            hasImage: !!(characterImages.get(character.id)?.imageUrl || character.turnaround_urls?.front),
                            isAccepted: !!character.accepted_run_id,
                            isCanon: !!character.canon_asset_id,
                          })} 
                          compact 
                        />
                      </div>

                      {/* Row 3: Primary action button */}
                      {character.character_role && (
                        <Button 
                          variant="gold" 
                          size="sm"
                          className="w-full"
                          onClick={() => autoGenerateCharacterPack(character)}
                          disabled={autoGenerating === character.id}
                        >
                          {autoGenerating === character.id ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin mr-2" />
                              {autoGenProgress?.phase?.slice(0, 20) || 'Generando...'}
                            </>
                          ) : (
                            <>
                              <Play className="w-4 h-4 mr-2" />
                              Generar Pack
                            </>
                          )}
                        </Button>
                      )}

                      {/* Row 4: Secondary actions */}
                      <div className="flex gap-1 justify-between">
                        <div className="flex gap-1">
                          {character.character_role && (
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => setShowPackBuilder(character.id)}
                            >
                              <Package className="w-4 h-4" />
                            </Button>
                          )}
                          {!character.canon_asset_id && (
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => approveCharacter(character)}
                              disabled={approvingCharacter === character.id || generatingProfile === character.id}
                              className="border-green-500/50 text-green-600"
                            >
                              {approvingCharacter === character.id || generatingProfile === character.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Check className="w-4 h-4" />
                              )}
                            </Button>
                          )}
                          {(character.pack_completeness_score || 0) >= 90 && (
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => setShowQuickStart(character.id)}
                              className="border-amber-500/50 text-amber-600"
                            >
                              <Zap className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" onClick={() => { setEditingCharacter(character); setShowEditDialog(true); }}>
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => duplicateCharacter(character)}
                            disabled={duplicating === character.id}
                          >
                            {duplicating === character.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Copy className="w-4 h-4" />}
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => handleExportPack(character)}
                            disabled={exporting === character.id || !character.pack_completeness_score}
                          >
                            {exporting === character.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDeleteCharacter(character.id)}>
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                      
                      {/* Inline Progress Bar for Mobile */}
                      <CharacterPackProgress characterId={character.id} />
                    </div>

                    {/* Expanded Content */}
                    {expandedId === character.id && (
                      <div className="border-t border-border">
                        <Tabs defaultValue="turnarounds" className="w-full">
                          <TabsList className="w-full justify-start rounded-none border-b bg-transparent h-auto p-0 overflow-x-auto scrollbar-hide flex-nowrap">
                            <TabsTrigger 
                              value="turnarounds" 
                              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary shrink-0 whitespace-nowrap"
                            >
                              <Eye className="w-4 h-4 mr-1 sm:mr-2" />
                              <span className="hidden sm:inline">Vistas</span> ({Object.keys(character.turnaround_urls || {}).length})
                            </TabsTrigger>
                            <TabsTrigger 
                              value="outfits"
                              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary shrink-0 whitespace-nowrap"
                            >
                              <Shirt className="w-4 h-4 mr-1 sm:mr-2" />
                              <span className="hidden sm:inline">Vestuarios</span> ({character.outfits?.length || 0})
                            </TabsTrigger>
                            <TabsTrigger 
                              value="bible"
                              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary shrink-0 whitespace-nowrap"
                            >
                              <BookOpen className="w-4 h-4 mr-1 sm:mr-2" />
                              Bible {character.profile_json && '✓'}
                            </TabsTrigger>
                            <TabsTrigger 
                              value="visual-dna"
                              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary shrink-0 whitespace-nowrap"
                            >
                              <Dna className="w-4 h-4 mr-1 sm:mr-2" />
                              <span className="hidden sm:inline">Visual</span> DNA
                            </TabsTrigger>
                            <TabsTrigger 
                              value="narrative"
                              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary shrink-0 whitespace-nowrap"
                            >
                              <Book className="w-4 h-4 mr-1 sm:mr-2" />
                              <span className="hidden sm:inline">Narrativa</span><span className="sm:hidden">Narr.</span>
                            </TabsTrigger>
                            <TabsTrigger 
                              value="prompts"
                              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary shrink-0 whitespace-nowrap"
                            >
                              <Wand2 className="w-4 h-4 mr-1 sm:mr-2" />
                              Prompts
                            </TabsTrigger>
                            <TabsTrigger 
                              value="generation"
                              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary shrink-0 whitespace-nowrap"
                            >
                              <Image className="w-4 h-4 mr-1 sm:mr-2" />
                              <span className="hidden sm:inline">Generación</span><span className="sm:hidden">Gen.</span>
                              {character.canon_asset_id && <Star className="w-3 h-3 ml-1 text-amber-500" />}
                            </TabsTrigger>
                          </TabsList>

                          <TabsContent value="turnarounds" className="p-4 m-0">
                            {character.turnaround_urls ? (
                              <div className="grid grid-cols-4 gap-3">
                                {Object.entries(character.turnaround_urls).map(([view, url]) => (
                                  <div key={view} className="space-y-1">
                                    <div className="aspect-square rounded-lg overflow-hidden bg-muted">
                                      <img 
                                        src={url} 
                                        alt={`${character.name} - ${view}`}
                                        className="w-full h-full object-cover"
                                      />
                                    </div>
                                    <p className="text-xs text-center text-muted-foreground capitalize">{view}</p>
                                  </div>
                                ))}
                                {character.expressions?.sheet && (
                                  <div className="space-y-1">
                                    <div className="aspect-square rounded-lg overflow-hidden bg-muted">
                                      <img 
                                        src={character.expressions.sheet} 
                                        alt={`${character.name} - expressions`}
                                        className="w-full h-full object-cover"
                                      />
                                    </div>
                                    <p className="text-xs text-center text-muted-foreground">Expresiones</p>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="text-center py-8">
                                <Eye className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                                <p className="text-sm text-muted-foreground mb-3">
                                  No hay vistas generadas
                                </p>
                                <Button 
                                  variant="outline" 
                                  size="sm"
                                  onClick={() => generateCharacterAI(character)}
                                  disabled={generating === character.id}
                                >
                                  <Sparkles className="w-4 h-4 mr-2" />
                                  Generar con IA
                                </Button>
                              </div>
                            )}
                          </TabsContent>

                          <TabsContent value="outfits" className="p-4 m-0">
                            <div className="space-y-3">
                              {character.outfits && character.outfits.length > 0 ? (
                                character.outfits.map((outfit, index) => (
                                  <div 
                                    key={outfit.id} 
                                    className={`flex items-center gap-3 p-3 rounded-lg ${outfit.is_default ? 'bg-primary/10 border border-primary/30' : 'bg-muted/50'}`}
                                  >
                                    <div className="flex flex-col gap-1">
                                      <Button 
                                        variant="ghost" 
                                        size="icon"
                                        className="h-5 w-5"
                                        onClick={() => moveOutfit(character.id, outfit.id, 'up')}
                                        disabled={index === 0}
                                      >
                                        <ArrowUp className="w-3 h-3" />
                                      </Button>
                                      <Button 
                                        variant="ghost" 
                                        size="icon"
                                        className="h-5 w-5"
                                        onClick={() => moveOutfit(character.id, outfit.id, 'down')}
                                        disabled={index === (character.outfits?.length || 1) - 1}
                                      >
                                        <ArrowDown className="w-3 h-3" />
                                      </Button>
                                    </div>
                                    <Shirt className={`w-5 h-5 ${outfit.is_default ? 'text-primary' : 'text-muted-foreground'}`} />
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2">
                                        <p className="font-medium text-sm truncate">{outfit.name}</p>
                                        {outfit.is_default && (
                                          <Badge variant="default" className="text-xs bg-primary">Principal</Badge>
                                        )}
                                      </div>
                                      {outfit.description && (
                                        <p className="text-xs text-muted-foreground truncate">{outfit.description}</p>
                                      )}
                                    </div>
                                    <Button 
                                      variant={outfit.is_default ? "ghost" : "outline"}
                                      size="icon"
                                      onClick={() => setDefaultOutfit(outfit.id)}
                                      disabled={outfit.is_default}
                                      title="Establecer como principal"
                                    >
                                      <Star className={`w-4 h-4 ${outfit.is_default ? 'fill-primary text-primary' : ''}`} />
                                    </Button>
                                    <Button 
                                      variant="ghost" 
                                      size="icon"
                                      onClick={() => deleteOutfit(outfit.id)}
                                    >
                                      <Trash2 className="w-4 h-4 text-destructive" />
                                    </Button>
                                  </div>
                                ))
                              ) : (
                                <div className="text-center py-4">
                                  <p className="text-sm text-muted-foreground">No hay vestuarios definidos</p>
                                </div>
                              )}
                              <Button 
                                variant="outline" 
                                size="sm" 
                                className="w-full"
                                onClick={() => setShowOutfitDialog(character.id)}
                              >
                                <Plus className="w-4 h-4 mr-2" />
                                Añadir Vestuario
                              </Button>
                            </div>
                          </TabsContent>

                          <TabsContent value="bible" className="p-4 m-0">
                            <BibleProfileViewer 
                              profile={character.profile_json as any} 
                              entityType="character" 
                            />
                            {/* Always show button - regenerate if exists, generate if not */}
                            <div className="mt-4">
                              <Button 
                                variant="gold" 
                                size="sm"
                                onClick={() => generateProfileWithEntityBuilder(character)}
                                disabled={generatingProfile === character.id}
                              >
                                {generatingProfile === character.id ? (
                                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                ) : (
                                  <BookOpen className="w-4 h-4 mr-2" />
                                )}
                                {character.profile_json ? 'Regenerar Perfil Bible' : 'Generar Perfil Bible con IA'}
                              </Button>
                            </div>
                          </TabsContent>

                          <TabsContent value="visual-dna" className="p-4 m-0">
                            <CharacterVisualDNAEditor
                              characterId={character.id}
                              characterName={character.name}
                              characterBio={character.bio || ''}
                              onSave={() => fetchCharacters()}
                            />
                          </TabsContent>

                          <TabsContent value="narrative" className="p-4 m-0">
                            <CharacterNarrativeEditor
                              characterId={character.id}
                              characterName={character.name}
                              projectId={projectId}
                              otherCharacters={characters.filter(c => c.id !== character.id).map(c => ({ id: c.id, name: c.name }))}
                            />
                          </TabsContent>

                          <TabsContent value="prompts" className="p-4 m-0">
                            <TechnicalPromptGenerator
                              characterId={character.id}
                              characterName={character.name}
                            />
                          </TabsContent>

                          <TabsContent value="generation" className="p-4 m-0">
                            <CharacterGenerationPanel
                              character={{
                                id: character.id,
                                name: character.name,
                                bio: character.bio,
                                role: character.role,
                                current_run_id: character.current_run_id,
                                accepted_run_id: character.accepted_run_id,
                                canon_asset_id: character.canon_asset_id,
                              }}
                              projectId={projectId}
                              onUpdate={fetchCharacters}
                            />
                          </TabsContent>
                        </Tabs>
                      </div>
                    )}
                  </>
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
              Define un nuevo personaje. El tipo de rol determina los requisitos del Character Pack.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
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
                <Label>Tipo de Personaje *</Label>
                <Select 
                  value={formData.character_role} 
                  onValueChange={v => setFormData({...formData, character_role: v as typeof formData.character_role})}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="protagonist">
                      <div className="flex flex-col">
                        <span>Protagonista</span>
                        <span className="text-xs text-muted-foreground">Pack completo: 4 vistas, 8 expr., 5+ outfits</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="recurring">
                      <div className="flex flex-col">
                        <span>Recurrente</span>
                        <span className="text-xs text-muted-foreground">Pack medio: 3 vistas, 5 expr., 3+ outfits</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="episodic">
                      <div className="flex flex-col">
                        <span>Episódico</span>
                        <span className="text-xs text-muted-foreground">Pack básico: 2 vistas, 3 expr., 2 outfits</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="extra">
                      <div className="flex flex-col">
                        <span>Extra</span>
                        <span className="text-xs text-muted-foreground">Solo base look (1 imagen)</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Rol Narrativo (opcional)</Label>
              <Select 
                value={formData.role} 
                onValueChange={v => setFormData({...formData, role: v})}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona un rol narrativo" />
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
                placeholder="Describe al personaje: apariencia física, personalidad, vestimenta..."
                rows={4}
              />
              <p className="text-xs text-muted-foreground">
                Una descripción detallada mejora la generación con IA
              </p>
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

      {/* Add Outfit Dialog */}
      <Dialog open={!!showOutfitDialog} onOpenChange={() => setShowOutfitDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Añadir Vestuario</DialogTitle>
            <DialogDescription>
              Define una variación de vestuario para el personaje
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Nombre del Vestuario *</Label>
              <Input 
                value={outfitForm.name} 
                onChange={e => setOutfitForm({...outfitForm, name: e.target.value})}
                placeholder="Ej: Traje formal, Ropa casual, Uniforme..."
              />
            </div>
            <div className="space-y-2">
              <Label>Descripción</Label>
              <Textarea 
                value={outfitForm.description}
                onChange={e => setOutfitForm({...outfitForm, description: e.target.value})}
                placeholder="Describe el vestuario en detalle..."
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label>Imagen de Referencia (opcional)</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="file"
                  accept="image/*"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onload = (ev) => {
                        setOutfitForm({...outfitForm, referenceImage: ev.target?.result as string});
                      };
                      reader.readAsDataURL(file);
                    }
                  }}
                  className="flex-1"
                />
                {outfitForm.referenceImage && (
                  <Button variant="ghost" size="icon" onClick={() => setOutfitForm({...outfitForm, referenceImage: null})}>
                    <X className="w-4 h-4" />
                  </Button>
                )}
              </div>
              {outfitForm.referenceImage && (
                <img src={outfitForm.referenceImage} alt="Preview" className="w-20 h-20 object-cover rounded-lg" />
              )}
              <p className="text-xs text-muted-foreground">La IA generará variaciones basadas en esta imagen</p>
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => { setShowOutfitDialog(null); setOutfitForm({ name: '', description: '', referenceImage: null }); }}>
              Cancelar
            </Button>
            <Button variant="outline" onClick={() => showOutfitDialog && addOutfit(showOutfitDialog, false)} disabled={saving}>
              Solo Guardar
            </Button>
            <Button variant="gold" onClick={() => showOutfitDialog && addOutfit(showOutfitDialog, true)} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              <Sparkles className="w-4 h-4 mr-2" />
              Generar con IA
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pack Builder Dialog */}
      <Dialog open={!!showPackBuilder} onOpenChange={() => setShowPackBuilder(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          {showPackBuilder && (() => {
            const char = characters.find(c => c.id === showPackBuilder);
            if (!char || !char.character_role) return null;
            return (
              <CharacterPackBuilder
                characterId={char.id}
                characterName={char.name}
                characterBio={char.bio || ''}
                characterRole={char.character_role}
                styleToken={char.token || undefined}
                projectId={projectId}
                onPackComplete={() => {
                  fetchCharacters();
                  toast.success('Character Pack completado');
                }}
              />
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Quick Start Dialog - Reference-First Workflow */}
      <Dialog open={!!showQuickStart} onOpenChange={() => setShowQuickStart(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {showQuickStart && (() => {
            const char = characters.find(c => c.id === showQuickStart);
            if (!char) return null;
            return (
              <CharacterQuickStart
                characterId={char.id}
                characterName={char.name}
                projectId={projectId}
                onComplete={() => {
                  fetchCharacters();
                  setShowQuickStart(null);
                  toast.success('Character Pack generado con Reference-First Workflow');
                }}
              />
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Character Creation Wizard PRO - Step-by-step guided flow with optional steps */}
      <CharacterCreationWizardPro
        projectId={projectId}
        open={showCreationWizard}
        onOpenChange={setShowCreationWizard}
        onCharacterCreated={(characterId) => {
          fetchCharacters();
          toast.success('¡Personaje creado! Ahora puedes generar su pack visual.');
        }}
      />

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
