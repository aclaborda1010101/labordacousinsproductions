import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Plus, Users, Loader2, Trash2, Edit2, Save, X, Sparkles, Eye, Shirt, ChevronDown, ChevronUp, Upload } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useLanguage } from '@/contexts/LanguageContext';
import { ImageGallery } from '@/components/project/ImageGallery';

interface CharactersProps { projectId: string; }

interface CharacterOutfit {
  id: string;
  name: string;
  description: string | null;
  reference_urls: unknown;
}

interface Character {
  id: string;
  name: string;
  role: string | null;
  bio: string | null;
  arc: string | null;
  token: string | null;
  turnaround_urls: Record<string, string> | null;
  expressions: Record<string, string> | null;
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
  
  const [formData, setFormData] = useState({
    name: '',
    role: '',
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
      // Fetch outfits for each character
      const charsWithOutfits = await Promise.all(charsData.map(async (char) => {
        const { data: outfits } = await supabase
          .from('character_outfits')
          .select('*')
          .eq('character_id', char.id);
        return { 
          ...char, 
          turnaround_urls: char.turnaround_urls as Record<string, string> | null,
          expressions: char.expressions as Record<string, string> | null,
          outfits: outfits || [] 
        };
      }));
      setCharacters(charsWithOutfits);
    }
    setLoading(false); 
  };

  useEffect(() => { fetchCharacters(); }, [projectId]);

  const resetForm = () => {
    setFormData({ name: '', role: '', bio: '', arc: '' });
    setEditingId(null);
  };

  const handleAddCharacter = async () => {
    if (!formData.name.trim()) {
      toast.error('El nombre es obligatorio');
      return;
    }
    
    setSaving(true);
    const { error } = await supabase
      .from('characters')
      .insert({ 
        project_id: projectId, 
        name: formData.name.trim(),
        role: formData.role || null,
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
        setOutfitForm({ name: '', description: '' });
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
          <h2 className="text-2xl font-bold text-foreground">{t.characters.title}</h2>
          <p className="text-muted-foreground">{t.characters.subtitle}</p>
        </div>
        <Button variant="gold" onClick={() => setShowAddDialog(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Añadir Personaje
        </Button>
      </div>
      
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
        ) : (
          characters.map(character => (
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
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-foreground text-lg">{character.name}</h3>
                          {character.role && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                              {getRoleLabel(character.role)}
                            </span>
                          )}
                          {character.turnaround_urls && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/10 text-green-500">
                              IA Generado
                            </span>
                          )}
                        </div>
                        {character.bio && (
                          <p className="text-sm text-muted-foreground line-clamp-2">{character.bio}</p>
                        )}
                      </div>
                      <div className="flex gap-1">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => generateCharacterAI(character)}
                          disabled={generating === character.id}
                          title="Generar con IA"
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
                        <Button variant="ghost" size="icon" onClick={() => startEditing(character)}>
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDeleteCharacter(character.id)}>
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
                                character.outfits.map(outfit => (
                                  <div key={outfit.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                                    <Shirt className="w-5 h-5 text-muted-foreground" />
                                    <div className="flex-1">
                                      <p className="font-medium text-sm">{outfit.name}</p>
                                      {outfit.description && (
                                        <p className="text-xs text-muted-foreground">{outfit.description}</p>
                                      )}
                                    </div>
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
              Define un nuevo personaje. Podrás generar sus vistas con IA después.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
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
              <p className="text-xs text-muted-foreground">
                El rol determina la cantidad de variaciones generadas
              </p>
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
    </div>
  );
}
