import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Wand2, Save, Video, Camera, Sparkles, Settings } from 'lucide-react';

interface Shot {
  id: string;
  shot_no: number;
  shot_type: string;
  duration_target: number;
  hero: boolean;
  effective_mode: 'CINE' | 'ULTRA';
  dialogue_text: string | null;
  camera?: any;
  blocking?: any;
}

interface Scene {
  id: string;
  scene_no: number;
  episode_no: number;
  slugline: string;
  summary: string | null;
  quality_mode: 'CINE' | 'ULTRA';
  character_ids: string[] | null;
  location_id: string | null;
}

interface Character {
  id: string;
  name: string;
  token?: string;
  turnaround_urls?: any;
}

interface Location {
  id: string;
  name: string;
  token?: string;
  reference_urls?: any;
}

interface Render {
  id: string;
  shot_id: string;
  video_url: string | null;
  status: string;
  engine: string | null;
}

type VideoEngine = 'veo' | 'kling' | 'lovable';

interface ShotEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shot: Shot;
  scene: Scene;
  characters: Character[];
  locations: Location[];
  preferredEngine: string | null;
  render?: Render;
  onShotUpdated: () => void;
}

const SHOT_TYPES = [
  { value: 'extreme-wide', label: 'Extreme Wide' },
  { value: 'wide', label: 'Wide' },
  { value: 'full', label: 'Full' },
  { value: 'medium-wide', label: 'Medium Wide' },
  { value: 'medium', label: 'Medium' },
  { value: 'medium-close', label: 'Medium Close-up' },
  { value: 'close-up', label: 'Close-up' },
  { value: 'extreme-close', label: 'Extreme Close-up' },
  { value: 'over-shoulder', label: 'Over the Shoulder' },
  { value: 'pov', label: 'POV' },
  { value: 'insert', label: 'Insert' },
];

const CAMERA_MOVEMENTS = [
  { value: 'static', label: 'Estático' },
  { value: 'pan-left', label: 'Pan Izquierda' },
  { value: 'pan-right', label: 'Pan Derecha' },
  { value: 'tilt-up', label: 'Tilt Arriba' },
  { value: 'tilt-down', label: 'Tilt Abajo' },
  { value: 'dolly-in', label: 'Dolly In' },
  { value: 'dolly-out', label: 'Dolly Out' },
  { value: 'tracking', label: 'Tracking' },
  { value: 'crane-up', label: 'Crane Up' },
  { value: 'crane-down', label: 'Crane Down' },
  { value: 'handheld', label: 'Handheld' },
  { value: 'steadicam', label: 'Steadicam' },
];

export default function ShotEditor({
  open,
  onOpenChange,
  shot,
  scene,
  characters,
  locations,
  preferredEngine,
  render,
  onShotUpdated
}: ShotEditorProps) {
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generatingDetails, setGeneratingDetails] = useState(false);
  
  const [form, setForm] = useState({
    shot_type: shot.shot_type,
    duration_target: shot.duration_target,
    dialogue_text: shot.dialogue_text || '',
    camera_movement: (shot.camera as any)?.movement || 'static',
    camera_angle: (shot.camera as any)?.angle || '',
    camera_lens: (shot.camera as any)?.lens || '',
    blocking_description: (shot.blocking as any)?.description || '',
    blocking_action: (shot.blocking as any)?.action || '',
  });
  
  const [selectedEngine, setSelectedEngine] = useState<VideoEngine>(
    (preferredEngine as VideoEngine) || 'lovable'
  );

  const sceneCharacters = scene.character_ids 
    ? characters.filter(c => scene.character_ids?.includes(c.id))
    : [];
  
  const sceneLocation = scene.location_id 
    ? locations.find(l => l.id === scene.location_id)
    : null;

  const saveShot = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.from('shots').update({
        shot_type: form.shot_type,
        duration_target: form.duration_target,
        dialogue_text: form.dialogue_text || null,
        camera: {
          movement: form.camera_movement,
          angle: form.camera_angle,
          lens: form.camera_lens
        },
        blocking: {
          description: form.blocking_description,
          action: form.blocking_action
        }
      }).eq('id', shot.id);

      if (error) throw error;
      toast.success('Shot guardado');
      onShotUpdated();
    } catch (error) {
      console.error('Error saving shot:', error);
      toast.error('Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const generateWithAI = async () => {
    setGeneratingDetails(true);
    try {
      const response = await supabase.functions.invoke('generate-shot-details', {
        body: {
          sceneDescription: `${scene.slugline}. ${scene.summary || ''}`,
          shotNo: shot.shot_no,
          totalShots: 1, // We'd need to pass this properly
          characters: sceneCharacters.map(c => c.name),
          location: sceneLocation?.name,
          dialogue: form.dialogue_text,
        }
      });

      if (response.error) throw response.error;

      const details = response.data;
      setForm(prev => ({
        ...prev,
        shot_type: details.shotType || prev.shot_type,
        camera_movement: details.cameraMovement || prev.camera_movement,
        camera_angle: details.cameraAngle || prev.camera_angle,
        blocking_description: details.blockingDescription || prev.blocking_description,
        blocking_action: details.blockingAction || prev.blocking_action,
        duration_target: details.duration || prev.duration_target,
      }));

      toast.success('Detalles generados con IA');
    } catch (error) {
      console.error('Error generating details:', error);
      toast.error('Error al generar detalles. Usando valores por defecto.');
      
      // Provide sensible defaults based on scene context
      setForm(prev => ({
        ...prev,
        camera_movement: 'static',
        camera_angle: 'eye-level',
        blocking_description: `${sceneCharacters.map(c => c.name).join(' y ')} en ${sceneLocation?.name || 'la escena'}`,
      }));
    } finally {
      setGeneratingDetails(false);
    }
  };

  const generateVideo = async () => {
    // Save first
    await saveShot();
    
    setGenerating(true);
    toast.info(`Generando shot con ${selectedEngine.toUpperCase()}...`);

    try {
      const { data, error } = await supabase.functions.invoke('generate-shot', {
        body: {
          shotId: shot.id,
          sceneDescription: `${scene.slugline}. ${scene.summary || ''}`,
          shotType: form.shot_type,
          duration: form.duration_target,
          engine: selectedEngine,
          dialogueText: form.dialogue_text,
          cameraMovement: form.camera_movement,
          blocking: form.blocking_description,
          characterRefs: sceneCharacters.map(c => ({
            name: c.name,
            token: c.token,
            referenceUrl: (c.turnaround_urls as string[])?.[0]
          })),
          locationRef: sceneLocation ? {
            name: sceneLocation.name,
            token: sceneLocation.token,
            referenceUrl: (sceneLocation.reference_urls as string[])?.[0]
          } : undefined
        }
      });

      if (error) throw error;

      if (data?.success) {
        // Create render record
        await supabase.from('renders').insert([{
          shot_id: shot.id,
          engine: selectedEngine,
          video_url: data.videoUrl || data.imageUrl,
          status: data.fallback ? 'failed' : 'succeeded',
          prompt_text: `${scene.slugline} - ${form.shot_type}`,
          params: data.metadata
        }]);

        if (data.fallback) {
          toast.warning('Keyframe generado (video no disponible)');
        } else {
          toast.success('Shot generado correctamente');
        }

        onShotUpdated();
        onOpenChange(false);
      } else {
        throw new Error(data?.error || 'Generation failed');
      }
    } catch (error) {
      console.error('Error generating shot:', error);
      toast.error('Error al generar. Inténtalo de nuevo.');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="w-5 h-5 text-primary" />
            Shot {shot.shot_no} - {scene.slugline}
          </DialogTitle>
          <DialogDescription>
            Configura los detalles del plano manualmente o genera con IA
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="details" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="details">
              <Settings className="w-4 h-4 mr-2" />
              Detalles
            </TabsTrigger>
            <TabsTrigger value="generate">
              <Video className="w-4 h-4 mr-2" />
              Generar
            </TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="space-y-4 mt-4">
            {/* AI Generate Button */}
            <div className="flex justify-end">
              <Button 
                variant="outline" 
                size="sm"
                onClick={generateWithAI}
                disabled={generatingDetails}
              >
                {generatingDetails ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Wand2 className="w-4 h-4 mr-2" />
                )}
                Sugerir con IA
              </Button>
            </div>

            {/* Shot Type & Duration */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tipo de Plano</Label>
                <Select value={form.shot_type} onValueChange={v => setForm({...form, shot_type: v})}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SHOT_TYPES.map(type => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Duración (segundos)</Label>
                <Input 
                  type="number" 
                  min={1} 
                  max={30}
                  value={form.duration_target}
                  onChange={e => setForm({...form, duration_target: parseFloat(e.target.value) || 3})}
                />
              </div>
            </div>

            {/* Camera Settings */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Camera className="w-4 h-4" />
                Cámara
              </Label>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Movimiento</Label>
                  <Select value={form.camera_movement} onValueChange={v => setForm({...form, camera_movement: v})}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CAMERA_MOVEMENTS.map(mov => (
                        <SelectItem key={mov.value} value={mov.value}>
                          {mov.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Ángulo/Lente</Label>
                  <Input 
                    placeholder="ej: 35mm, eye-level"
                    value={form.camera_lens}
                    onChange={e => setForm({...form, camera_lens: e.target.value})}
                  />
                </div>
              </div>
            </div>

            {/* Blocking */}
            <div className="space-y-2">
              <Label>Blocking / Acción</Label>
              <Textarea 
                placeholder="Describe la posición y movimiento de los personajes en el plano..."
                value={form.blocking_description}
                onChange={e => setForm({...form, blocking_description: e.target.value})}
                rows={2}
              />
            </div>

            {/* Dialogue */}
            <div className="space-y-2">
              <Label>Diálogo (si aplica)</Label>
              <Textarea 
                placeholder="Línea de diálogo durante este plano..."
                value={form.dialogue_text}
                onChange={e => setForm({...form, dialogue_text: e.target.value})}
                rows={2}
              />
            </div>

            {/* Scene Context */}
            <div className="p-3 bg-muted/50 rounded-lg space-y-2">
              <p className="text-sm font-medium">Contexto de Escena</p>
              <div className="flex flex-wrap gap-2 text-xs">
                {sceneCharacters.length > 0 && (
                  <Badge variant="outline">
                    Personajes: {sceneCharacters.map(c => c.name).join(', ')}
                  </Badge>
                )}
                {sceneLocation && (
                  <Badge variant="outline">
                    Localización: {sceneLocation.name}
                  </Badge>
                )}
                <Badge variant={shot.effective_mode === 'ULTRA' ? 'ultra' : 'cine'}>
                  {shot.effective_mode}
                </Badge>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="generate" className="space-y-4 mt-4">
            {/* Engine Selection */}
            <div className="space-y-2">
              <Label>Motor de Generación</Label>
              <Select value={selectedEngine} onValueChange={v => setSelectedEngine(v as VideoEngine)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="lovable">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-primary" />
                      <span className="font-bold">Lovable AI</span>
                      <Badge variant="default" className="text-xs bg-green-600">Recomendado</Badge>
                    </div>
                  </SelectItem>
                  <SelectItem value="veo">
                    <div className="flex items-center gap-2">
                      <Video className="w-4 h-4" />
                      <span className="font-bold">Veo 3.1</span>
                      {preferredEngine === 'veo' && <Badge variant="outline" className="text-xs">Tu preferido</Badge>}
                    </div>
                  </SelectItem>
                  <SelectItem value="kling">
                    <div className="flex items-center gap-2">
                      <Video className="w-4 h-4" />
                      <span className="font-bold">Kling 2.0</span>
                      {preferredEngine === 'kling' && <Badge variant="outline" className="text-xs">Tu preferido</Badge>}
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {selectedEngine === 'lovable' && 'Genera keyframes de alta calidad. Siempre disponible.'}
                {selectedEngine === 'veo' && 'Video con movimiento suave. Requiere API externa.'}
                {selectedEngine === 'kling' && 'Video con expresiones detalladas. Requiere API externa.'}
              </p>
            </div>

            {/* Preview of what will be generated */}
            <div className="p-4 bg-muted/50 rounded-lg space-y-3">
              <p className="text-sm font-medium">Resumen del Shot</p>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-muted-foreground">Tipo:</span> {form.shot_type}</div>
                <div><span className="text-muted-foreground">Duración:</span> {form.duration_target}s</div>
                <div><span className="text-muted-foreground">Cámara:</span> {form.camera_movement}</div>
                <div><span className="text-muted-foreground">Modo:</span> {shot.effective_mode}</div>
              </div>
              {form.blocking_description && (
                <p className="text-sm"><span className="text-muted-foreground">Blocking:</span> {form.blocking_description}</p>
              )}
            </div>

            {/* Existing render */}
            {render && (
              <div className="p-3 border border-border rounded-lg">
                <p className="text-sm text-muted-foreground mb-2">
                  Render existente: {render.engine?.toUpperCase()} - {render.status}
                </p>
                {render.video_url && (
                  <video
                    src={render.video_url}
                    controls
                    className="w-full max-h-32 rounded object-contain bg-black"
                    preload="metadata"
                  />
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button variant="secondary" onClick={saveShot} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
            Guardar
          </Button>
          <Button variant="gold" onClick={generateVideo} disabled={generating || saving}>
            {generating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Generando...
              </>
            ) : (
              <>
                <Video className="w-4 h-4 mr-2" />
                Generar Shot
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
