import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Plus, Users, Loader2, Trash2, Edit2, Save, X, Sparkles, Eye, Shirt, ChevronDown, ChevronUp, Upload, Package, CheckCircle2, Star, ArrowUp, ArrowDown, Copy, Download, Search, Filter, BookOpen, Dna } from 'lucide-react';
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
}

export default function Characters({ projectId }: CharactersProps) {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showOutfitDialog, setShowOutfitDialog] = useState<string | null>(null);
  const [showPackBuilder, setShowPackBuilder] = useState<string | null>(null);
  const [duplicating, setDuplicating] = useState<string | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);
  const [generatingProfile, setGeneratingProfile] = useState<string | null>(null);
  
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
    }
    setLoading(false); 
  };

  useEffect(() => { fetchCharacters(); }, [projectId]);

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

  // Generate full profile with Entity Builder
  const generateProfileWithEntityBuilder = async (character: Character) => {
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
        return;
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
    } catch (error) {
      console.error('Error generating character profile:', error);
      toast.error('Error al generar perfil. Inténtalo de nuevo.');
    } finally {
      setGeneratingProfile(null);
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
        <Button variant="gold" onClick={() => setShowAddDialog(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Añadir Personaje
        </Button>
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
              <Button variant="gold" onClick={() => setShowAddDialog(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Añadir Primer Personaje
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
                    {/* Character Header */}
                    <div className="p-4 flex items-start gap-4">
                      <div className="w-16 h-16 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold text-2xl overflow-hidden">
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
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <h3 className="font-semibold text-foreground text-lg">{character.name}</h3>
                          {character.character_role && (
                            <Badge variant="outline" className={getCharacterRoleBadgeColor(character.character_role)}>
                              {getCharacterRoleLabel(character.character_role)}
                            </Badge>
                          )}
                          {character.pack_completeness_score !== null && character.pack_completeness_score !== undefined && (
                            <Badge 
                              variant={character.pack_completeness_score >= 90 ? "default" : "secondary"}
                              className={character.pack_completeness_score >= 90 ? "bg-green-600" : ""}
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
                          {character.role && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                              {getRoleLabel(character.role)}
                            </span>
                          )}
                        </div>
                        {character.bio && (
                          <p className="text-sm text-muted-foreground line-clamp-2">{character.bio}</p>
                        )}
                      </div>
                      <div className="flex gap-1">
                        {character.character_role && (
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => setShowPackBuilder(character.id)}
                            className="mr-2"
                          >
                            <Package className="w-4 h-4 mr-1" />
                            Pack Builder
                          </Button>
                        )}
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => generateProfileWithEntityBuilder(character)}
                          disabled={generatingProfile === character.id}
                          title="Generar Perfil Bible"
                          className="mr-1"
                        >
                          {generatingProfile === character.id ? (
                            <Loader2 className="w-4 h-4 animate-spin mr-1" />
                          ) : (
                            <BookOpen className="w-4 h-4 mr-1" />
                          )}
                          Bible
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => generateCharacterAI(character)}
                          disabled={generating === character.id}
                          title="Generar imágenes con IA"
                        >
                          {generating === character.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Sparkles className="w-4 h-4 text-primary" />
                          )}
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => setExpandedId(expandedId === character.id ? null : character.id)}
                        >
                          {expandedId === character.id ? (
                            <ChevronUp className="w-4 h-4" />
                          ) : (
                            <ChevronDown className="w-4 h-4" />
                          )}
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => startEditing(character)} title="Editar">
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => duplicateCharacter(character)}
                          disabled={duplicating === character.id}
                          title="Duplicar"
                        >
                          {duplicating === character.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Copy className="w-4 h-4" />}
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => handleExportPack(character)}
                          disabled={exporting === character.id || !character.pack_completeness_score}
                          title="Exportar Pack ZIP"
                        >
                          {exporting === character.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDeleteCharacter(character.id)} title="Eliminar">
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </div>

                    {/* Expanded Content */}
                    {expandedId === character.id && (
                      <div className="border-t border-border">
                        <Tabs defaultValue="turnarounds" className="w-full">
                          <TabsList className="w-full justify-start rounded-none border-b bg-transparent h-auto p-0">
                            <TabsTrigger 
                              value="turnarounds" 
                              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary"
                            >
                              <Eye className="w-4 h-4 mr-2" />
                              Vistas ({Object.keys(character.turnaround_urls || {}).length})
                            </TabsTrigger>
                            <TabsTrigger 
                              value="outfits"
                              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary"
                            >
                              <Shirt className="w-4 h-4 mr-2" />
                              Vestuarios ({character.outfits?.length || 0})
                            </TabsTrigger>
                            <TabsTrigger 
                              value="bible"
                              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary"
                            >
                              <BookOpen className="w-4 h-4 mr-2" />
                              Bible {character.profile_json && '✓'}
                            </TabsTrigger>
                            <TabsTrigger 
                              value="visual-dna"
                              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary"
                            >
                              <Dna className="w-4 h-4 mr-2" />
                              Visual DNA
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
                            {!character.profile_json && (
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
                                  Generar Perfil Bible con IA
                                </Button>
                              </div>
                            )}
                          </TabsContent>

                          <TabsContent value="visual-dna" className="p-4 m-0">
                            <CharacterVisualDNAEditor
                              characterId={character.id}
                              characterName={character.name}
                              characterBio={character.bio || ''}
                              onSave={() => fetchCharacters()}
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
                onPackComplete={() => {
                  fetchCharacters();
                  toast.success('Character Pack completado');
                }}
              />
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
