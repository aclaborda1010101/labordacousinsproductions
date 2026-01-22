import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  Plus, Box, Loader2, Trash2, Edit2, Save, X, Copy, 
  Search, ChevronDown, ChevronUp, Wand2, BookOpen, Play, PlayCircle
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import BibleProfileViewer from './BibleProfileViewer';
import { EntityQCBadge } from './QCStatusBadge';

interface PropsComponentProps {
  projectId: string;
}

interface Prop {
  id: string;
  name: string;
  description: string | null;
  prop_type: string | null;
  materials: unknown;
  condition: string | null;
  color_finish: string | null;
  dimensions: string | null;
  interaction_rules: string | null;
  placement_rules: string | null;
  continuity_notes: string | null;
  reference_urls: unknown;
  status: string | null;
  profile_json?: any;
}

const PROP_TYPES = [
  { value: 'Phone', label: 'Teléfono' },
  { value: 'Laptop', label: 'Portátil' },
  { value: 'Watch', label: 'Reloj' },
  { value: 'Car', label: 'Vehículo' },
  { value: 'Keycard', label: 'Tarjeta/Llave' },
  { value: 'Document', label: 'Documento' },
  { value: 'CoffeeCup', label: 'Taza/Vaso' },
  { value: 'DeskItem', label: 'Item de Escritorio' },
  { value: 'Bag', label: 'Bolsa/Maletín' },
  { value: 'Weapon', label: 'Arma' },
  { value: 'Food', label: 'Comida' },
  { value: 'Jewelry', label: 'Joyería' },
  { value: 'Book', label: 'Libro' },
  { value: 'Tool', label: 'Herramienta' },
  { value: 'Other', label: 'Otro' },
];

const CONDITIONS = [
  { value: 'BrandNew', label: 'Nuevo' },
  { value: 'LightlyUsed', label: 'Poco Uso' },
  { value: 'Worn', label: 'Desgastado' },
  { value: 'Weathered', label: 'Deteriorado' },
  { value: 'Damaged', label: 'Dañado' },
];

export default function Props({ projectId }: PropsComponentProps) {
  const [loading, setLoading] = useState(true);
  const [props, setProps] = useState<Prop[]>([]);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState<string | null>(null);
  const [duplicating, setDuplicating] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [generatingBible, setGeneratingBible] = useState<string | null>(null);
  const [autoGeneratingAll, setAutoGeneratingAll] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    prop_type: '',
    condition: 'LightlyUsed',
    color_finish: '',
    dimensions: '',
    interaction_rules: '',
    placement_rules: '',
    continuity_notes: '',
  });

  const fetchProps = async () => {
    const { data } = await supabase
      .from('props')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at');
    setProps((data || []) as Prop[]);
    setLoading(false);
  };

  const generateBibleProfile = async (prop: Prop) => {
    setGeneratingBible(prop.id);
    toast.info('Generando perfil Bible con IA...');

    try {
      const response = await supabase.functions.invoke('entity-builder', {
        body: {
          entityType: 'prop',
          name: prop.name,
          description: prop.description || '',
          existingData: {
            prop_type: prop.prop_type,
            condition: prop.condition,
            color_finish: prop.color_finish,
            dimensions: prop.dimensions,
            interaction_rules: prop.interaction_rules,
            materials: prop.materials
          },
          language: 'es-ES',
        }
      });

      if (response.error) throw new Error(response.error.message);

      const profileData = response.data?.entity || response.data;
      
      await supabase.from('props').update({
        profile_json: profileData,
        prop_type: profileData?.profile?.prop_type || prop.prop_type,
        condition: profileData?.profile?.condition || prop.condition,
        color_finish: profileData?.profile?.color_finish || prop.color_finish,
        dimensions: profileData?.profile?.dimensions_approx || prop.dimensions,
        materials: profileData?.profile?.materials || prop.materials,
      }).eq('id', prop.id);

      toast.success('Perfil Bible generado correctamente');
      fetchProps();
    } catch (error) {
      console.error('Error generating bible:', error);
      toast.error('Error al generar perfil Bible');
    } finally {
      setGeneratingBible(null);
    }
  };

  useEffect(() => { fetchProps(); }, [projectId]);

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      prop_type: '',
      condition: 'LightlyUsed',
      color_finish: '',
      dimensions: '',
      interaction_rules: '',
      placement_rules: '',
      continuity_notes: '',
    });
    setEditingId(null);
  };

  const handleAddProp = async () => {
    if (!formData.name.trim()) {
      toast.error('El nombre es obligatorio');
      return;
    }

    setSaving(true);
    const { error } = await supabase
      .from('props')
      .insert({
        project_id: projectId,
        name: formData.name.trim(),
        description: formData.description || null,
        prop_type: formData.prop_type || null,
        condition: formData.condition || null,
        color_finish: formData.color_finish || null,
        dimensions: formData.dimensions || null,
        interaction_rules: formData.interaction_rules || null,
        placement_rules: formData.placement_rules || null,
        continuity_notes: formData.continuity_notes || null,
      });

    if (error) {
      toast.error('Error al añadir prop');
    } else {
      toast.success('Prop añadido correctamente');
      resetForm();
      setShowAddDialog(false);
      fetchProps();
    }
    setSaving(false);
  };

  const handleUpdateProp = async () => {
    if (!editingId || !formData.name.trim()) return;

    setSaving(true);
    const { error } = await supabase
      .from('props')
      .update({
        name: formData.name.trim(),
        description: formData.description || null,
        prop_type: formData.prop_type || null,
        condition: formData.condition || null,
        color_finish: formData.color_finish || null,
        dimensions: formData.dimensions || null,
        interaction_rules: formData.interaction_rules || null,
        placement_rules: formData.placement_rules || null,
        continuity_notes: formData.continuity_notes || null,
      })
      .eq('id', editingId);

    if (error) {
      toast.error('Error al actualizar prop');
    } else {
      toast.success('Prop actualizado');
      resetForm();
      fetchProps();
    }
    setSaving(false);
  };

  const handleDeleteProp = async (id: string) => {
    const { error } = await supabase.from('props').delete().eq('id', id);
    if (error) {
      toast.error('Error al eliminar prop');
    } else {
      toast.success('Prop eliminado');
      fetchProps();
    }
  };

  const startEditing = (prop: Prop) => {
    setFormData({
      name: prop.name,
      description: prop.description || '',
      prop_type: prop.prop_type || '',
      condition: prop.condition || 'LightlyUsed',
      color_finish: prop.color_finish || '',
      dimensions: prop.dimensions || '',
      interaction_rules: prop.interaction_rules || '',
      placement_rules: prop.placement_rules || '',
      continuity_notes: prop.continuity_notes || '',
    });
    setEditingId(prop.id);
    setExpandedId(prop.id);
  };

  const generateProfileAI = async (prop: Prop) => {
    setGenerating(prop.id);
    toast.info('Generando perfil con IA...');

    try {
      const response = await supabase.functions.invoke('entity-builder', {
        body: {
          entityType: 'prop',
          name: prop.name,
          description: prop.description || '',
          language: 'es-ES',
        }
      });

      if (response.error) throw new Error(response.error.message);

      const entity = response.data.entity;
      if (entity?.profile) {
        const profile = entity.profile;
        await supabase.from('props').update({
          prop_type: profile.prop_type || prop.prop_type,
          condition: profile.condition || prop.condition,
          color_finish: profile.color_finish || prop.color_finish,
          dimensions: profile.dimensions_approx || prop.dimensions,
          interaction_rules: profile.interaction_rules || prop.interaction_rules,
          placement_rules: profile.placement_rules || prop.placement_rules,
          materials: profile.materials || null,
        }).eq('id', prop.id);

        toast.success('Perfil generado correctamente');
        fetchProps();
      }
    } catch (error) {
      console.error('Error generating profile:', error);
      toast.error('Error al generar perfil');
    } finally {
      setGenerating(null);
    }
  };

  const duplicateProp = async (prop: Prop) => {
    setDuplicating(prop.id);
    try {
      const { error } = await supabase.from('props').insert({
        project_id: projectId,
        name: `${prop.name} (copia)`,
        description: prop.description,
        prop_type: prop.prop_type,
        condition: prop.condition,
        color_finish: prop.color_finish,
        dimensions: prop.dimensions,
        interaction_rules: prop.interaction_rules,
        placement_rules: prop.placement_rules,
        continuity_notes: prop.continuity_notes,
        materials: prop.materials as any,
        reference_urls: prop.reference_urls as any,
      });

      if (error) throw error;
      toast.success('Prop duplicado');
      fetchProps();
    } catch (error) {
      toast.error('Error al duplicar');
    } finally {
      setDuplicating(null);
    }
  };

  // Auto-generate ALL props
  const autoGenerateAllProps = async () => {
    const propsToGenerate = props.filter(p => !p.profile_json);
    
    if (propsToGenerate.length === 0) {
      toast.info('Todos los props ya tienen perfil Bible');
      return;
    }

    if (!confirm(`¿Generar perfiles Bible para ${propsToGenerate.length} props? Esto puede tardar varios minutos.`)) {
      return;
    }

    setAutoGeneratingAll(true);
    
    for (let i = 0; i < propsToGenerate.length; i++) {
      const prop = propsToGenerate[i];
      toast.info(`Generando ${i + 1}/${propsToGenerate.length}: ${prop.name}`);
      await generateBibleProfile(prop);
    }
    
    setAutoGeneratingAll(false);
    toast.success(`${propsToGenerate.length} props generados`);
    fetchProps();
  };

  const filteredProps = props.filter(p => {
    if (searchQuery && !p.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    if (typeFilter !== 'all' && p.prop_type !== typeFilter) return false;
    return true;
  });

  const getTypeLabel = (type: string) => PROP_TYPES.find(t => t.value === type)?.label || type;
  const getConditionLabel = (condition: string) => CONDITIONS.find(c => c.value === condition)?.label || condition;

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
          <h2 className="text-2xl font-bold text-foreground">Props</h2>
          <p className="text-muted-foreground">Gestiona los objetos y accesorios de tu producción</p>
        </div>
        <div className="flex gap-2">
          {props.length > 0 && (
            <Button 
              variant="outline" 
              onClick={autoGenerateAllProps}
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
          <Button variant="lime" onClick={() => setShowAddDialog(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Añadir Prop
          </Button>
        </div>
      </div>

      {/* Search and Filters */}
      {props.length > 0 && (
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar props..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {PROP_TYPES.map(t => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Props List */}
      <div className="grid gap-4">
        {props.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <Box className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-2">No hay props aún</h3>
              <p className="text-muted-foreground mb-4">
                Añade objetos y accesorios para mantener la continuidad
              </p>
              <Button variant="gold" onClick={() => setShowAddDialog(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Añadir Primer Prop
              </Button>
            </CardContent>
          </Card>
        ) : filteredProps.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <Search className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-2">Sin resultados</h3>
              <Button variant="outline" onClick={() => { setSearchQuery(''); setTypeFilter('all'); }}>
                Limpiar filtros
              </Button>
            </CardContent>
          </Card>
        ) : (
          filteredProps.map(prop => (
            <Card key={prop.id}>
              <CardContent className="p-4">
                <Collapsible 
                  open={expandedId === prop.id}
                  onOpenChange={(open) => setExpandedId(open ? prop.id : null)}
                >
                    <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Box className="w-6 h-6 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h3 className="font-semibold text-foreground">{prop.name}</h3>
                        {prop.prop_type && (
                          <Badge variant="outline">{getTypeLabel(prop.prop_type)}</Badge>
                        )}
                        {prop.condition && (
                          <Badge variant="secondary">{getConditionLabel(prop.condition)}</Badge>
                        )}
                        <EntityQCBadge 
                          entityType="prop" 
                          hasProfile={!!prop.profile_json}
                          hasContinuityLock={!!prop.profile_json?.continuity_lock}
                        />
                      </div>
                      {prop.description && (
                        <p className="text-sm text-muted-foreground line-clamp-2">{prop.description}</p>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="icon">
                          {expandedId === prop.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </Button>
                      </CollapsibleTrigger>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => generateBibleProfile(prop)}
                        disabled={generatingBible === prop.id}
                        title="Generar perfil Bible con IA"
                      >
                        {generatingBible === prop.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <BookOpen className="w-4 h-4 text-primary" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => generateProfileAI(prop)}
                        disabled={generating === prop.id}
                        title="Generar perfil rápido"
                      >
                        {generating === prop.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => duplicateProp(prop)} disabled={duplicating === prop.id}>
                        {duplicating === prop.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Copy className="w-4 h-4" />}
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => startEditing(prop)}>
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDeleteProp(prop.id)}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </div>

                  <CollapsibleContent className="mt-4 pt-4 border-t">
                    <Tabs defaultValue={prop.profile_json ? "bible" : "details"} className="w-full">
                      <TabsList className="mb-4">
                        <TabsTrigger value="details">Detalles</TabsTrigger>
                        <TabsTrigger value="bible" disabled={!prop.profile_json}>
                          <BookOpen className="w-3 h-3 mr-1" />
                          Bible
                        </TabsTrigger>
                      </TabsList>

                      <TabsContent value="bible">
                        {prop.profile_json && (
                          <BibleProfileViewer profile={prop.profile_json} entityType="prop" />
                        )}
                      </TabsContent>

                      <TabsContent value="details">
                    {editingId === prop.id ? (
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label>Nombre *</Label>
                            <Input 
                              value={formData.name}
                              onChange={e => setFormData({...formData, name: e.target.value})}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Tipo</Label>
                            <Select value={formData.prop_type} onValueChange={v => setFormData({...formData, prop_type: v})}>
                              <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                              <SelectContent>
                                {PROP_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label>Descripción</Label>
                          <Textarea 
                            value={formData.description}
                            onChange={e => setFormData({...formData, description: e.target.value})}
                            rows={2}
                          />
                        </div>
                        <div className="grid grid-cols-3 gap-4">
                          <div className="space-y-2">
                            <Label>Condición</Label>
                            <Select value={formData.condition} onValueChange={v => setFormData({...formData, condition: v})}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {CONDITIONS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label>Color/Acabado</Label>
                            <Input 
                              value={formData.color_finish}
                              onChange={e => setFormData({...formData, color_finish: e.target.value})}
                              placeholder="Negro mate, plateado..."
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Dimensiones</Label>
                            <Input 
                              value={formData.dimensions}
                              onChange={e => setFormData({...formData, dimensions: e.target.value})}
                              placeholder="15x8x2 cm"
                            />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label>Reglas de Interacción</Label>
                          <Textarea 
                            value={formData.interaction_rules}
                            onChange={e => setFormData({...formData, interaction_rules: e.target.value})}
                            placeholder="Cómo se manipula, evitar deformación de manos..."
                            rows={2}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Notas de Continuidad</Label>
                          <Textarea 
                            value={formData.continuity_notes}
                            onChange={e => setFormData({...formData, continuity_notes: e.target.value})}
                            rows={2}
                          />
                        </div>
                        <div className="flex gap-2">
                          <Button variant="gold" onClick={handleUpdateProp} disabled={saving}>
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
                      <div className="grid gap-4 text-sm">
                        {prop.color_finish && (
                          <div><span className="text-muted-foreground">Color/Acabado:</span> {prop.color_finish}</div>
                        )}
                        {prop.dimensions && (
                          <div><span className="text-muted-foreground">Dimensiones:</span> {prop.dimensions}</div>
                        )}
                        {prop.interaction_rules && (
                          <div><span className="text-muted-foreground">Interacción:</span> {prop.interaction_rules}</div>
                        )}
                        {prop.placement_rules && (
                          <div><span className="text-muted-foreground">Colocación:</span> {prop.placement_rules}</div>
                        )}
                        {prop.continuity_notes && (
                          <div><span className="text-muted-foreground">Continuidad:</span> {prop.continuity_notes}</div>
                        )}
                        {(prop.materials as string[])?.length > 0 && (
                          <div className="flex gap-1 flex-wrap">
                            <span className="text-muted-foreground">Materiales:</span>
                            {(prop.materials as string[]).map((m, i) => (
                              <Badge key={i} variant="outline" className="text-xs">{m}</Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                      </TabsContent>
                    </Tabs>
                  </CollapsibleContent>
                </Collapsible>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Add Prop Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Añadir Prop</DialogTitle>
            <DialogDescription>Define un nuevo objeto para tu producción</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nombre *</Label>
                <Input 
                  value={formData.name}
                  onChange={e => setFormData({...formData, name: e.target.value})}
                  placeholder="Ej: Teléfono de Sarah"
                />
              </div>
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select value={formData.prop_type} onValueChange={v => setFormData({...formData, prop_type: v})}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                  <SelectContent>
                    {PROP_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Descripción</Label>
              <Textarea 
                value={formData.description}
                onChange={e => setFormData({...formData, description: e.target.value})}
                placeholder="Describe el objeto..."
                rows={2}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Condición</Label>
                <Select value={formData.condition} onValueChange={v => setFormData({...formData, condition: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CONDITIONS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Color/Acabado</Label>
                <Input 
                  value={formData.color_finish}
                  onChange={e => setFormData({...formData, color_finish: e.target.value})}
                  placeholder="Negro mate..."
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowAddDialog(false); resetForm(); }}>
              Cancelar
            </Button>
            <Button variant="gold" onClick={handleAddProp} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Añadir Prop
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
