/**
 * LocationsList - MVP Clean UX for Locations
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
import { Checkbox } from '@/components/ui/checkbox';
import { EntityCard, getEntityStatus, EntityStatus } from './EntityCard';
import { useEditorialKnowledgeBase } from '@/hooks/useEditorialKnowledgeBase';
import {
  Plus,
  MapPin,
  Loader2,
  Search,
  PlayCircle,
  Trash2,
  Sun,
  Moon,
  Image,
  History,
} from 'lucide-react';

interface LocationsListProps {
  projectId: string;
}

interface Location {
  id: string;
  name: string;
  description: string | null;
  variants: { day?: boolean; night?: boolean } | null;
  reference_urls: Record<string, string> | null;
  current_run_id?: string | null;
  accepted_run_id?: string | null;
  canon_asset_id?: string | null;
}

export default function LocationsList({ projectId }: LocationsListProps) {
  const { userLevel } = useEditorialKnowledgeBase({ projectId, assetType: 'location' });
  const isPro = userLevel === 'pro';

  const [loading, setLoading] = useState(true);
  const [locations, setLocations] = useState<Location[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [generatingAll, setGeneratingAll] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    hasDay: true,
    hasNight: true,
  });

  const fetchLocations = async () => {
    const { data } = await supabase
      .from('locations')
      .select('id, name, description, variants, reference_urls, current_run_id, accepted_run_id, canon_asset_id')
      .eq('project_id', projectId)
      .order('created_at');

    if (data) {
      setLocations(data.map(l => ({
        ...l,
        variants: l.variants as Location['variants'],
        reference_urls: l.reference_urls as Record<string, string> | null,
      })));
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchLocations();
  }, [projectId]);

  const resetForm = () => {
    setFormData({ name: '', description: '', hasDay: true, hasNight: true });
  };

  const handleAddLocation = async () => {
    if (!formData.name.trim()) {
      toast.error('El nombre es obligatorio');
      return;
    }

    setSaving(true);
    const { error } = await supabase.from('locations').insert({
      project_id: projectId,
      name: formData.name.trim(),
      description: formData.description || null,
      variants: { day: formData.hasDay, night: formData.hasNight },
    });

    if (error) {
      toast.error('Error al añadir localización');
    } else {
      toast.success('Localización añadida');
      resetForm();
      setShowAddDialog(false);
      fetchLocations();
    }
    setSaving(false);
  };

  const handleDeleteLocation = async (id: string) => {
    if (!confirm('¿Eliminar esta localización?')) return;
    const { error } = await supabase.from('locations').delete().eq('id', id);
    if (error) {
      toast.error('Error al eliminar');
    } else {
      toast.success('Localización eliminada');
      fetchLocations();
    }
  };

  // Primary action handler based on status
  const handlePrimaryAction = async (location: Location) => {
    const status = getEntityStatus(location.current_run_id, location.accepted_run_id, location.canon_asset_id);

    switch (status) {
      case 'not_generated':
        await handleGenerate(location);
        break;
      case 'generated':
        await handleAccept(location);
        break;
      case 'accepted':
        await handleSetCanon(location);
        break;
      case 'canon':
        await handleRegenerate(location);
        break;
    }
  };

  const handleGenerate = async (location: Location) => {
    setGeneratingId(location.id);
    toast.info(`Generando ${location.name}...`);

    try {
      const prompt = (location.description || '').trim() || location.name;

      const { data, error } = await supabase.functions.invoke('generate-run', {
        body: {
          projectId,
          type: 'location',
          phase: 'exploration',
          engine: 'fal-ai/flux-pro/v1.1-ultra',
          engineSelectedBy: 'auto',
          prompt,
          context: `Location: ${location.name}`,
          params: {
            locationName: location.name,
            viewAngle: 'establishing',
            timeOfDay: 'day',
            weather: 'clear',
          },
        },
      });

      if (error) throw error;

      if (data?.runId) {
        await supabase.from('locations').update({ current_run_id: data.runId }).eq('id', location.id);
      }

      toast.success('Localización generada');
      fetchLocations();
    } catch (err) {
      console.error('Generation error:', err);
      toast.error('Error al generar');
    } finally {
      setGeneratingId(null);
    }
  };
  const handleAccept = async (location: Location) => {
    if (!location.current_run_id) return;

    try {
      await supabase.from('locations').update({ accepted_run_id: location.current_run_id }).eq('id', location.id);
      await supabase.from('generation_runs').update({ verdict: 'approved' }).eq('id', location.current_run_id);
      toast.success('Localización aceptada');
      fetchLocations();
    } catch (err) {
      toast.error('Error al aceptar');
    }
  };

  const handleSetCanon = async (location: Location) => {
    if (!location.accepted_run_id) return;

    try {
      const { data: run } = await supabase
        .from('generation_runs')
        .select('output_url')
        .eq('id', location.accepted_run_id)
        .single();

      if (!run?.output_url) {
        toast.error('No hay imagen para fijar como canon');
        return;
      }

      const { data: canonAsset, error: canonError } = await supabase
        .from('canon_assets')
        .insert({
          project_id: projectId,
          asset_type: 'location',
          name: location.name,
          image_url: run.output_url,
          run_id: location.accepted_run_id,
          is_active: true,
        })
        .select()
        .single();

      if (canonError) throw canonError;

      await supabase.from('locations').update({ canon_asset_id: canonAsset.id }).eq('id', location.id);
      await supabase.from('generation_runs').update({ is_canon: true }).eq('id', location.accepted_run_id);

      toast.success('⭐ Fijado como referencia oficial');
      fetchLocations();
    } catch (err) {
      console.error('Canon error:', err);
      toast.error('Error al fijar como canon');
    }
  };

  const handleRegenerate = async (location: Location) => {
    setGeneratingId(location.id);
    toast.info(`Generando nueva variante de ${location.name}...`);

    try {
      const prompt = (location.description || '').trim() || location.name;

      const { data, error } = await supabase.functions.invoke('generate-run', {
        body: {
          projectId,
          type: 'location',
          phase: 'exploration',
          engine: 'fal-ai/flux-pro/v1.1-ultra',
          engineSelectedBy: 'auto',
          prompt,
          context: `Location: ${location.name}`,
          parentRunId: location.accepted_run_id,
          params: {
            locationName: location.name,
            viewAngle: 'establishing',
            timeOfDay: 'day',
            weather: 'clear',
          },
        },
      });

      if (error) throw error;

      if (data?.runId) {
        await supabase.from('locations').update({ current_run_id: data.runId }).eq('id', location.id);
      }

      toast.success('Nueva variante generada');
      fetchLocations();
    } catch (err) {
      toast.error('Error al regenerar');
    } finally {
      setGeneratingId(null);
    }
  };
  const handleGenerateAll = async () => {
    const toGenerate = locations.filter(l => !l.current_run_id);
    if (toGenerate.length === 0) {
      toast.info('Todas las localizaciones ya tienen generación');
      return;
    }

    if (!confirm(`¿Generar ${toGenerate.length} localizaciones?`)) return;

    setGeneratingAll(true);
    for (const loc of toGenerate) {
      await handleGenerate(loc);
    }
    setGeneratingAll(false);
    toast.success('Generación completada');
  };

  // Get first image URL from reference_urls
  const getLocationImage = (location: Location): string | null => {
    if (location.reference_urls) {
      const urls = Object.values(location.reference_urls);
      return urls.length > 0 ? urls[0] : null;
    }
    return null;
  };

  const filteredLocations = locations.filter(l =>
    l.name.toLowerCase().includes(searchQuery.toLowerCase())
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
          <h2 className="text-2xl font-bold">Localizaciones</h2>
          <p className="text-muted-foreground">Define los escenarios de tu producción</p>
        </div>
        <div className="flex gap-2">
          {locations.length > 0 && (
            <Button variant="outline" onClick={handleGenerateAll} disabled={generatingAll}>
              {generatingAll ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <PlayCircle className="w-4 h-4 mr-2" />}
              Generar Todas
            </Button>
          )}
          <Button variant="gold" onClick={() => setShowAddDialog(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Añadir Localización
          </Button>
        </div>
      </div>

      {/* Search */}
      {locations.length > 0 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar localizaciones..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      )}

      {/* Location list */}
      <div className="space-y-3">
        {locations.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <MapPin className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No hay localizaciones aún</h3>
              <p className="text-muted-foreground mb-4">
                Añade localizaciones para definir los escenarios
              </p>
              <Button variant="gold" onClick={() => setShowAddDialog(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Añadir Primera Localización
              </Button>
            </CardContent>
          </Card>
        ) : filteredLocations.length === 0 ? (
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
          filteredLocations.map(location => (
            <EntityCard
              key={location.id}
              id={location.id}
              name={location.name}
              description={location.description}
              imageUrl={getLocationImage(location)}
              placeholderIcon={<MapPin className="w-6 h-6" />}
              status={getEntityStatus(location.current_run_id, location.accepted_run_id, location.canon_asset_id)}
              isExpanded={expandedId === location.id}
              isGenerating={generatingId === location.id}
              isPro={isPro}
              onToggleExpand={() => setExpandedId(expandedId === location.id ? null : location.id)}
              onPrimaryAction={() => handlePrimaryAction(location)}
              badges={
                <div className="flex gap-1">
                  {location.variants?.day && <Sun className="w-3 h-3 text-yellow-500" />}
                  {location.variants?.night && <Moon className="w-3 h-3 text-blue-400" />}
                </div>
              }
              expandedContent={
                <div className="space-y-4">
                  {/* Visual preview */}
                  {getLocationImage(location) && (
                    <div className="flex justify-center">
                      <img
                        src={getLocationImage(location)!}
                        alt={location.name}
                        className="max-w-[300px] rounded-lg border"
                      />
                    </div>
                  )}

                  {/* Description */}
                  <div>
                    <Label className="text-xs text-muted-foreground">Descripción</Label>
                    <p className="text-sm">{location.description || 'Sin descripción'}</p>
                  </div>

                  {/* Variants info */}
                  <div className="flex gap-4">
                    <div className="flex items-center gap-2">
                      <Sun className="w-4 h-4 text-yellow-500" />
                      <span className="text-sm">{location.variants?.day ? 'Día disponible' : 'Sin día'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Moon className="w-4 h-4 text-blue-400" />
                      <span className="text-sm">{location.variants?.night ? 'Noche disponible' : 'Sin noche'}</span>
                    </div>
                  </div>

                  {/* Quick actions */}
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => handleDeleteLocation(location.id)}>
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
                      <code className="text-xs bg-muted px-2 py-1 rounded">{location.id.slice(0, 8)}...</code>
                    </div>
                    {location.current_run_id && (
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Run ID</span>
                        <code className="text-xs bg-muted px-2 py-1 rounded">{location.current_run_id.slice(0, 8)}...</code>
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

      {/* Add Location Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Añadir Localización</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nombre *</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Nombre de la localización"
              />
            </div>
            <div className="space-y-2">
              <Label>Descripción</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Describe el escenario..."
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label>Variantes de iluminación</Label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={formData.hasDay}
                    onCheckedChange={(c) => setFormData({ ...formData, hasDay: !!c })}
                  />
                  <Sun className="w-4 h-4 text-yellow-500" />
                  <span className="text-sm">Día</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={formData.hasNight}
                    onCheckedChange={(c) => setFormData({ ...formData, hasNight: !!c })}
                  />
                  <Moon className="w-4 h-4 text-blue-400" />
                  <span className="text-sm">Noche</span>
                </label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
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
