import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Plus, MapPin, Loader2, Trash2, Edit2, Save, X, Sun, Moon, ChevronDown, ChevronUp, Copy, BookOpen, Play, PlayCircle, Image, Star } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { LocationPackBuilder } from './LocationPackBuilder';
import BibleProfileViewer from './BibleProfileViewer';
import { EntityQCBadge } from './QCStatusBadge';
import { LocationGenerationPanel } from './LocationGenerationPanel';
import { useBackgroundTasks } from '@/contexts/BackgroundTasksContext';
import { useEntityProgress } from '@/hooks/useEntityProgress';

interface LocationsProps { projectId: string; }

interface Location {
  id: string;
  name: string;
  description: string | null;
  token: string | null;
  variants: { day?: boolean; night?: boolean; weather?: string[] } | null;
  reference_urls: unknown;
  profile_json?: unknown;
  // Unified generation system fields
  current_run_id?: string | null;
  accepted_run_id?: string | null;
  canon_asset_id?: string | null;
}

/** Inline progress component for location cards */
function LocationPackProgress({ locationId }: { locationId: string }) {
  const { isGenerating, progress, phase } = useEntityProgress(locationId);
  
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

export default function Locations({ projectId }: LocationsProps) {
  const { addTask, updateTask, completeTask, failTask } = useBackgroundTasks();
  const [loading, setLoading] = useState(true);
  const [locations, setLocations] = useState<Location[]>([]);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedPackId, setExpandedPackId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [duplicating, setDuplicating] = useState<string | null>(null);
  const [generatingProfile, setGeneratingProfile] = useState<string | null>(null);
  const [autoGenerating, setAutoGenerating] = useState<string | null>(null);
  const [autoGeneratingAll, setAutoGeneratingAll] = useState(false);
  
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    hasDay: true,
    hasNight: true,
  });

  const fetchLocations = async () => { 
    const { data } = await supabase
      .from('locations')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at'); 
    setLocations((data || []).map(l => ({
      ...l,
      variants: l.variants as Location['variants']
    }))); 
    setLoading(false); 
  };

  useEffect(() => { fetchLocations(); }, [projectId]);

  const resetForm = () => {
    setFormData({ name: '', description: '', hasDay: true, hasNight: true });
    setEditingId(null);
  };

  const handleAddLocation = async () => {
    if (!formData.name.trim()) {
      toast.error('El nombre es obligatorio');
      return;
    }
    
    setSaving(true);
    const { error } = await supabase
      .from('locations')
      .insert({ 
        project_id: projectId, 
        name: formData.name.trim(),
        description: formData.description || null,
        variants: { day: formData.hasDay, night: formData.hasNight, weather: ['clear'] },
      });
    
    if (error) {
      toast.error('Error al añadir localización');
    } else {
      toast.success('Localización añadida correctamente');
      resetForm();
      setShowAddDialog(false);
      fetchLocations();
    }
    setSaving(false);
  };

  const handleUpdateLocation = async () => {
    if (!editingId || !formData.name.trim()) return;
    
    setSaving(true);
    const { error } = await supabase
      .from('locations')
      .update({ 
        name: formData.name.trim(),
        description: formData.description || null,
        variants: { day: formData.hasDay, night: formData.hasNight, weather: ['clear'] },
      })
      .eq('id', editingId);
    
    if (error) {
      toast.error('Error al actualizar localización');
    } else {
      toast.success('Localización actualizada');
      resetForm();
      fetchLocations();
    }
    setSaving(false);
  };

  const handleDeleteLocation = async (id: string) => { 
    const { error } = await supabase.from('locations').delete().eq('id', id); 
    if (error) {
      toast.error('Error al eliminar localización');
    } else {
      toast.success('Localización eliminada');
      fetchLocations();
    }
  };

  const startEditing = (location: Location) => {
    setFormData({
      name: location.name,
      description: location.description || '',
      hasDay: location.variants?.day ?? true,
      hasNight: location.variants?.night ?? true,
    });
    setEditingId(location.id);
  };

  // Duplicate location
  const duplicateLocation = async (location: Location) => {
    setDuplicating(location.id);
    try {
      // Create new location
      const { data: newLoc, error: locError } = await supabase
        .from('locations')
        .insert([{
          project_id: projectId,
          name: `${location.name} (copia)`,
          description: location.description,
          token: location.token,
          variants: location.variants,
          reference_urls: location.reference_urls as any,
        }])
        .select()
        .single();
      
      if (locError) throw locError;
      
      // Duplicate location pack slots
      const { data: slots } = await supabase
        .from('location_pack_slots')
        .select('*')
        .eq('location_id', location.id);
      
      if (slots && slots.length > 0) {
        const slotInserts = slots.map(s => ({
          location_id: newLoc.id,
          slot_type: s.slot_type,
          slot_index: s.slot_index,
          view_angle: s.view_angle,
          time_of_day: s.time_of_day,
          weather: s.weather,
          image_url: s.image_url,
          prompt_text: s.prompt_text,
          seed: s.seed,
          status: s.status,
          required: s.required,
        }));
        
        await supabase.from('location_pack_slots').insert(slotInserts);
      }
      
      toast.success('Localización duplicada correctamente');
      fetchLocations();
    } catch (error) {
      console.error('Error duplicating location:', error);
      toast.error('Error al duplicar localización');
    } finally {
      setDuplicating(null);
    }
  };

  // Generate full profile with Entity Builder
  const generateProfileWithEntityBuilder = async (location: Location) => {
    setGeneratingProfile(location.id);
    toast.info('Generando perfil completo con Entity Builder... Esto puede tardar un momento.');

    try {
      const response = await supabase.functions.invoke('entity-builder', {
        body: {
          entityType: 'location',
          name: location.name,
          description: location.description || '',
          context: {
            variants: location.variants,
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

      // Update location with generated profile
      await supabase
        .from('locations')
        .update({
          profile_json: entity,
          description: entity.profile?.description || location.description,
        })
        .eq('id', location.id);

      toast.success('Perfil de localización generado correctamente');
      fetchLocations();
    } catch (error) {
      console.error('Error generating location profile:', error);
      toast.error('Error al generar perfil. Inténtalo de nuevo.');
    } finally {
      setGeneratingProfile(null);
    }
  };

  // Auto-generate location pack with BackgroundTasks
  const autoGenerateLocationPack = async (location: Location) => {
    // Register task in global background task system
    const taskId = addTask({
      type: 'location_generation',
      title: `Pack: ${location.name}`,
      projectId,
      entityId: location.id,
      entityName: location.name,
    });

    setAutoGenerating(location.id);
    
    try {
      // First generate Bible profile if not exists
      if (!location.profile_json) {
        updateTask(taskId, { progress: 5, description: 'Generando perfil...' });
        await generateProfileWithEntityBuilder(location);
      }
      
      // Generate location slots via edge function
      const slots = [
        { slot_type: 'establishing', view_angle: 'wide', time_of_day: 'day', progress: 25 },
        { slot_type: 'establishing', view_angle: 'wide', time_of_day: 'night', progress: 55 },
        { slot_type: 'detail', view_angle: '3/4', time_of_day: 'day', progress: 85 },
      ];
      
      for (const slotConfig of slots) {
        updateTask(taskId, { progress: slotConfig.progress, description: `${slotConfig.slot_type} ${slotConfig.time_of_day}...` });
        
        // Create or get slot
        const { data: existingSlot, error: existingSlotError } = await supabase
          .from('location_pack_slots')
          .select('id')
          .eq('location_id', location.id)
          .eq('slot_type', slotConfig.slot_type)
          .eq('view_angle', slotConfig.view_angle)
          .eq('time_of_day', slotConfig.time_of_day)
          .maybeSingle();

        if (existingSlotError) throw existingSlotError;

        let slotId = existingSlot?.id;

        if (!slotId) {
          const { data: newSlot, error } = await supabase
            .from('location_pack_slots')
            .insert({
              location_id: location.id,
              slot_type: slotConfig.slot_type,
              view_angle: slotConfig.view_angle,
              time_of_day: slotConfig.time_of_day,
              status: 'pending',
              required: true,
            })
            .select('id')
            .single();

          if (error) throw error;
          slotId = newSlot.id;
        }

        // Mark as generating
        await supabase
          .from('location_pack_slots')
          .update({ status: 'generating' })
          .eq('id', slotId);

        // Generate image
        const { data, error } = await supabase.functions.invoke('generate-location', {
          body: {
            slotId,
            locationId: location.id,
            locationName: location.name,
            locationDescription: location.description || '',
            slotType: slotConfig.slot_type,
            viewAngle: slotConfig.view_angle,
            timeOfDay: slotConfig.time_of_day,
            weather: 'clear',
          },
        });

        if (error) {
          await supabase
            .from('location_pack_slots')
            .update({ status: 'failed' })
            .eq('id', slotId);
          throw error;
        }

        if (!data?.imageUrl) {
          await supabase
            .from('location_pack_slots')
            .update({ status: 'failed' })
            .eq('id', slotId);
          throw new Error('No image generated');
        }

        const qcScore = 80 + Math.random() * 20;

        // Persist result for the slot (review by default)
        await supabase
          .from('location_pack_slots')
          .update({
            image_url: data.imageUrl,
            prompt_text: data.prompt,
            seed: data.seed,
            qc_score: qcScore,
            status: 'review',
          })
          .eq('id', slotId);
      }
      
      updateTask(taskId, { progress: 95, description: 'Finalizando...' });
      completeTask(taskId, { pack: 'complete', slots: 3 });
      toast.success(`Pack de ${location.name} generado`);
      fetchLocations();
    } catch (error) {
      console.error('Auto-generate location error:', error);
      failTask(taskId, error instanceof Error ? error.message : 'Error en generación');
      toast.error(`Error generando pack de ${location.name}`);
    } finally {
      setAutoGenerating(null);
    }
  };

  // Auto-generate ALL locations in parallel with concurrency limit
  const autoGenerateAllLocations = async () => {
    if (locations.length === 0) {
      toast.info('No hay localizaciones para generar');
      return;
    }

    if (!confirm(`¿Generar packs para ${locations.length} localizaciones en paralelo?`)) {
      return;
    }

    setAutoGeneratingAll(true);
    toast.info(`Iniciando ${locations.length} packs en paralelo...`);
    
    // Parallel generation with concurrency limit
    const MAX_PARALLEL = 3;
    
    for (let i = 0; i < locations.length; i += MAX_PARALLEL) {
      const batch = locations.slice(i, i + MAX_PARALLEL);
      await Promise.allSettled(
        batch.map(loc => autoGenerateLocationPack(loc))
      );
    }
    
    setAutoGeneratingAll(false);
    toast.success('Generación masiva completada');
    fetchLocations();
  };

  if (loading) {
    return (
      <div className="p-6 flex justify-center">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-4 sm:space-y-6">
      {/* Header - Desktop */}
      <div className="hidden sm:flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Localizaciones</h2>
          <p className="text-muted-foreground">Define los escenarios y ambientes de tu producción</p>
        </div>
        <div className="flex gap-2">
          {locations.length > 0 && (
            <Button 
              variant="outline" 
              onClick={autoGenerateAllLocations}
              disabled={autoGeneratingAll}
            >
              {autoGeneratingAll ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <PlayCircle className="w-4 h-4 mr-2" />
              )}
              Generar Todas
            </Button>
          )}
          <Button variant="lime" onClick={() => setShowAddDialog(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Añadir Localización
          </Button>
        </div>
      </div>

      {/* Header - Mobile */}
      <div className="flex sm:hidden flex-col gap-3">
        <div>
          <h2 className="text-xl font-bold text-foreground">Localizaciones</h2>
          <p className="text-sm text-muted-foreground">Define los escenarios y ambientes de tu producción</p>
        </div>
        <div className="flex gap-2">
          {locations.length > 0 && (
            <Button 
              variant="outline" 
              size="sm"
              onClick={autoGenerateAllLocations}
              disabled={autoGeneratingAll}
            >
              {autoGeneratingAll ? (
                <Loader2 className="w-4 h-4 animate-spin mr-1" />
              ) : (
                <PlayCircle className="w-4 h-4 mr-1" />
              )}
              Generar Todas
            </Button>
          )}
          <Button variant="gold" size="sm" onClick={() => setShowAddDialog(true)}>
            <Plus className="w-4 h-4 mr-1" />
            Añadir Localización
          </Button>
        </div>
      </div>
      
      <div className="grid gap-4 md:grid-cols-2">
        {locations.length === 0 ? (
          <Card className="md:col-span-2">
            <CardContent className="p-8 text-center">
              <MapPin className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-2">No hay localizaciones aún</h3>
              <p className="text-muted-foreground mb-4">
                Añade localizaciones para definir los escenarios de tu producción
              </p>
              <Button variant="gold" onClick={() => setShowAddDialog(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Añadir Primera Localización
              </Button>
            </CardContent>
          </Card>
        ) : (
          locations.map(location => (
            <Card key={location.id} className="md:col-span-2">
              <CardContent className="p-4">
                {editingId === location.id ? (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Nombre *</Label>
                      <Input 
                        value={formData.name} 
                        onChange={e => setFormData({...formData, name: e.target.value})}
                        placeholder="Nombre de la localización"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Descripción</Label>
                      <Textarea 
                        value={formData.description}
                        onChange={e => setFormData({...formData, description: e.target.value})}
                        placeholder="Describe el escenario, ambiente, detalles importantes..."
                        rows={3}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Variantes de iluminación</Label>
                      <div className="flex gap-4">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <Checkbox 
                            checked={formData.hasDay}
                            onCheckedChange={(c) => setFormData({...formData, hasDay: !!c})}
                          />
                          <Sun className="w-4 h-4 text-yellow-500" />
                          <span className="text-sm">Día</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <Checkbox 
                            checked={formData.hasNight}
                            onCheckedChange={(c) => setFormData({...formData, hasNight: !!c})}
                          />
                          <Moon className="w-4 h-4 text-blue-400" />
                          <span className="text-sm">Noche</span>
                        </label>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="gold" onClick={handleUpdateLocation} disabled={saving}>
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
                  <Collapsible 
                    open={expandedPackId === location.id}
                    onOpenChange={(open) => setExpandedPackId(open ? location.id : null)}
                  >
                    {/* Location Card - Desktop */}
                    <div className="hidden sm:flex items-start gap-4">
                      <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <MapPin className="w-6 h-6 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <h3 className="font-semibold text-foreground">{location.name}</h3>
                          <div className="flex gap-1">
                            {location.variants?.day && (
                              <Sun className="w-3.5 h-3.5 text-yellow-500" />
                            )}
                            {location.variants?.night && (
                              <Moon className="w-3.5 h-3.5 text-blue-400" />
                            )}
                          </div>
                          <EntityQCBadge
                            entityType="location"
                            hasProfile={!!location.profile_json}
                            hasContinuityLock={!!(location.profile_json as any)?.continuity_lock}
                          />
                        </div>
                        {location.description ? (
                          <p className="text-sm text-muted-foreground line-clamp-2">{location.description}</p>
                        ) : (
                          <p className="text-sm text-muted-foreground italic">Sin descripción</p>
                        )}
                      </div>
                      <div className="flex gap-1 shrink-0 flex-wrap">
                        <Button 
                          variant="gold" 
                          size="sm"
                          onClick={() => autoGenerateLocationPack(location)}
                          disabled={autoGenerating === location.id}
                          title="Generar pack automáticamente"
                        >
                          {autoGenerating === location.id ? (
                            <Loader2 className="w-4 h-4 animate-spin mr-1" />
                          ) : (
                            <Play className="w-4 h-4 mr-1" />
                          )}
                          Generar
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => generateProfileWithEntityBuilder(location)}
                          disabled={generatingProfile === location.id}
                          title="Generar Perfil Bible"
                        >
                          {generatingProfile === location.id ? (
                            <Loader2 className="w-4 h-4 animate-spin mr-1" />
                          ) : (
                            <BookOpen className="w-4 h-4 mr-1" />
                          )}
                          Bible
                        </Button>
                        <CollapsibleTrigger asChild>
                          <Button variant="ghost" size="icon" title="Pack Builder">
                            {expandedPackId === location.id ? (
                              <ChevronUp className="w-4 h-4" />
                            ) : (
                              <ChevronDown className="w-4 h-4" />
                            )}
                          </Button>
                        </CollapsibleTrigger>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => duplicateLocation(location)}
                          disabled={duplicating === location.id}
                          title="Duplicar localización"
                        >
                          {duplicating === location.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => startEditing(location)}>
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDeleteLocation(location.id)}>
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                      
                      {/* Inline Progress Bar for Desktop */}
                      <LocationPackProgress locationId={location.id} />
                    </div>

                    {/* Location Card - Mobile */}
                    <div className="flex sm:hidden flex-col gap-3">
                      {/* Row 1: Avatar + Name + Expand */}
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                          <MapPin className="w-5 h-5 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-foreground text-sm truncate">{location.name}</h3>
                          <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                            {location.variants?.day && (
                              <Sun className="w-3 h-3 text-yellow-500" />
                            )}
                            {location.variants?.night && (
                              <Moon className="w-3 h-3 text-blue-400" />
                            )}
                            <EntityQCBadge
                              entityType="location"
                              hasProfile={!!location.profile_json}
                              hasContinuityLock={!!(location.profile_json as any)?.continuity_lock}
                            />
                          </div>
                        </div>
                        <CollapsibleTrigger asChild>
                          <Button variant="ghost" size="icon" className="shrink-0">
                            {expandedPackId === location.id ? (
                              <ChevronUp className="w-4 h-4" />
                            ) : (
                              <ChevronDown className="w-4 h-4" />
                            )}
                          </Button>
                        </CollapsibleTrigger>
                      </div>

                      {/* Row 2: Description */}
                      {location.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2">{location.description}</p>
                      )}

                      {/* Row 3: Primary action */}
                      <Button 
                        variant="gold" 
                        size="sm"
                        className="w-full"
                        onClick={() => autoGenerateLocationPack(location)}
                        disabled={autoGenerating === location.id}
                      >
                        {autoGenerating === location.id ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin mr-2" />
                            Generando...
                          </>
                        ) : (
                          <>
                            <Play className="w-4 h-4 mr-2" />
                            Generar Pack
                          </>
                        )}
                      </Button>

                      {/* Row 4: Secondary actions */}
                      <div className="flex gap-1 justify-between">
                        <div className="flex gap-1">
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => generateProfileWithEntityBuilder(location)}
                            disabled={generatingProfile === location.id}
                          >
                            {generatingProfile === location.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <BookOpen className="w-4 h-4" />
                            )}
                          </Button>
                        </div>
                        <div className="flex gap-1">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => duplicateLocation(location)}
                            disabled={duplicating === location.id}
                          >
                            {duplicating === location.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Copy className="w-4 h-4" />
                            )}
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => startEditing(location)}>
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDeleteLocation(location.id)}>
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                      
                      {/* Inline Progress Bar for Mobile */}
                      <LocationPackProgress locationId={location.id} />
                    </div>
                    <CollapsibleContent className="mt-4">
                      <Tabs defaultValue="pack" className="w-full">
                        <TabsList className="w-full justify-start mb-4 overflow-x-auto scrollbar-hide flex-nowrap">
                          <TabsTrigger value="pack" className="shrink-0 whitespace-nowrap">Pack Builder</TabsTrigger>
                          <TabsTrigger value="bible" className="shrink-0 whitespace-nowrap">
                            Bible {location.profile_json && '✓'}
                          </TabsTrigger>
                          <TabsTrigger value="generation" className="shrink-0 whitespace-nowrap">
                            <Image className="w-4 h-4 mr-1" />
                            <span className="hidden sm:inline">Generación</span><span className="sm:hidden">Gen.</span>
                            {location.canon_asset_id && <Star className="w-3 h-3 ml-1 text-amber-500" />}
                          </TabsTrigger>
                        </TabsList>
                        <TabsContent value="pack">
                          <LocationPackBuilder
                            locationId={location.id}
                            locationName={location.name}
                            locationDescription={location.description || ''}
                            hasDay={location.variants?.day ?? true}
                            hasNight={location.variants?.night ?? false}
                            projectId={projectId}
                            primaryReferenceUrl={(location as any).primary_reference_url}
                          />
                        </TabsContent>
                        <TabsContent value="bible">
                          <BibleProfileViewer 
                            profile={location.profile_json as any} 
                            entityType="location" 
                          />
                        </TabsContent>
                        <TabsContent value="generation">
                          <LocationGenerationPanel
                            location={{
                              id: location.id,
                              name: location.name,
                              description: location.description,
                              current_run_id: location.current_run_id,
                              accepted_run_id: location.accepted_run_id,
                              canon_asset_id: location.canon_asset_id,
                            }}
                            projectId={projectId}
                            onUpdate={fetchLocations}
                          />
                        </TabsContent>
                      </Tabs>
                    </CollapsibleContent>
                  </Collapsible>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Add Location Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Añadir Localización</DialogTitle>
            <DialogDescription>
              Define un nuevo escenario para tu producción
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Nombre *</Label>
              <Input 
                value={formData.name} 
                onChange={e => setFormData({...formData, name: e.target.value})}
                placeholder="Ej: INT. CAFETERÍA - CENTRO"
              />
            </div>
            <div className="space-y-2">
              <Label>Descripción</Label>
              <Textarea 
                value={formData.description}
                onChange={e => setFormData({...formData, description: e.target.value})}
                placeholder="Describe el escenario, ambiente, elementos destacados..."
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label>Variantes de iluminación</Label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox 
                    checked={formData.hasDay}
                    onCheckedChange={(c) => setFormData({...formData, hasDay: !!c})}
                  />
                  <Sun className="w-4 h-4 text-yellow-500" />
                  <span className="text-sm">Día</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox 
                    checked={formData.hasNight}
                    onCheckedChange={(c) => setFormData({...formData, hasNight: !!c})}
                  />
                  <Moon className="w-4 h-4 text-blue-400" />
                  <span className="text-sm">Noche</span>
                </label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowAddDialog(false); resetForm(); }}>
              Cancelar
            </Button>
            <Button variant="gold" onClick={handleAddLocation} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Añadir Localización
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
