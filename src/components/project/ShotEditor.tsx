import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Wand2, Save, Video, Camera, Sparkles, Settings, Clock, Upload, CheckCircle2, XCircle, Image as ImageIcon } from 'lucide-react';
import KeyframeManager from './KeyframeManager';

interface VeoProgress {
  status: 'idle' | 'starting' | 'generating' | 'uploading' | 'done' | 'error';
  elapsedSeconds: number;
  estimatedTotalSeconds: number;
  message: string;
}

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
  const [veoProgress, setVeoProgress] = useState<VeoProgress>({
    status: 'idle',
    elapsedSeconds: 0,
    estimatedTotalSeconds: 120, // Veo typically takes 1-2 minutes
    message: ''
  });

  // Timer for elapsed time during generation
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (veoProgress.status === 'generating' || veoProgress.status === 'starting') {
      interval = setInterval(() => {
        setVeoProgress(prev => ({
          ...prev,
          elapsedSeconds: prev.elapsedSeconds + 1
        }));
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [veoProgress.status]);
  
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

  // Build prompt for video generation
  const buildVideoPrompt = () => {
    const parts: string[] = [];
    
    parts.push(`${form.shot_type} shot`);
    parts.push(`Scene: ${scene.slugline}`);
    
    if (scene.summary) {
      parts.push(scene.summary);
    }
    
    if (form.blocking_description) {
      parts.push(`Action: ${form.blocking_description}`);
    }
    
    if (form.camera_movement && form.camera_movement !== 'static') {
      parts.push(`Camera: ${form.camera_movement}`);
    }
    
    if (sceneCharacters.length > 0) {
      parts.push(`Characters: ${sceneCharacters.map(c => c.name).join(', ')}`);
    }
    
    if (sceneLocation) {
      parts.push(`Location: ${sceneLocation.name}`);
    }
    
    if (form.dialogue_text) {
      parts.push(`Dialogue: "${form.dialogue_text}"`);
    }
    
    return parts.join('. ') + '.';
  };

  // Helper: Convert base64 to Blob
  const base64ToBlob = (base64: string, mimeType: string = 'video/mp4'): Blob => {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: mimeType });
  };

  // Helper: Upload video to storage and return public URL
  const uploadVideoToStorage = async (base64Video: string, shotId: string): Promise<string> => {
    const blob = base64ToBlob(base64Video);
    const fileName = `${shotId}/${Date.now()}.mp4`;
    
    const { data, error } = await supabase.storage
      .from('renders')
      .upload(fileName, blob, {
        contentType: 'video/mp4',
        upsert: false
      });
    
    if (error) {
      console.error('Storage upload error:', error);
      throw new Error(`Failed to upload video: ${error.message}`);
    }
    
    // Get public URL
    const { data: urlData } = supabase.storage
      .from('renders')
      .getPublicUrl(data.path);
    
    return urlData.publicUrl;
  };

  // Poll Veo operation until complete
  // IMPORTANTE: operationName debe ser el nombre completo de la operación (projects/...)
  const pollVeoOperation = async (operationName: string): Promise<{ done: boolean; videoUrl?: string; error?: string }> => {
    const maxAttempts = 60; // 5 minutes max
    let attempts = 0;
    
    setVeoProgress({
      status: 'generating',
      elapsedSeconds: 0,
      estimatedTotalSeconds: 120,
      message: 'Generando video con Veo 3.1...'
    });
    
    while (attempts < maxAttempts) {
      await new Promise(r => setTimeout(r, 5000)); // Poll every 5 seconds
      attempts++;
      
      setVeoProgress(prev => ({
        ...prev,
        message: `Renderizando video... (intento ${attempts})`
      }));
      
      const { data, error } = await supabase.functions.invoke('veo_poll', {
        body: { operationName }
      });
      
      if (error) {
        console.error('Poll error:', error);
        continue;
      }
      
      console.log('Poll result:', data);
      
      if (data?.done) {
        // Check for error first
        if (data.error) {
          setVeoProgress(prev => ({ ...prev, status: 'error', message: data.error.message || 'Veo generation failed' }));
          return { done: true, error: data.error.message || 'Veo generation failed' };
        }
        
        // Extract video from response - structure is response.videos[0].bytesBase64Encoded
        const result = data.result;
        
        // Check bytesBase64Encoded (inline video data)
        if (result?.videos?.[0]?.bytesBase64Encoded) {
          try {
            setVeoProgress(prev => ({ ...prev, status: 'uploading', message: 'Subiendo video a storage...' }));
            const base64 = result.videos[0].bytesBase64Encoded;
            const videoUrl = await uploadVideoToStorage(base64, shot.id);
            setVeoProgress(prev => ({ ...prev, status: 'done', message: '¡Video generado!' }));
            return { done: true, videoUrl };
          } catch (uploadError) {
            console.error('Upload error:', uploadError);
            setVeoProgress(prev => ({ ...prev, status: 'error', message: `Error subiendo: ${(uploadError as Error).message}` }));
            return { done: true, error: `Video generado pero falló upload: ${(uploadError as Error).message}` };
          }
        }
        
        // Check gcsUri (Google Cloud Storage URI)
        if (result?.videos?.[0]?.gcsUri) {
          setVeoProgress(prev => ({ ...prev, status: 'done', message: '¡Video generado!' }));
          return { done: true, videoUrl: result.videos[0].gcsUri };
        }
        
        // Legacy formats
        if (result?.predictions?.[0]?.bytesBase64Encoded) {
          try {
            setVeoProgress(prev => ({ ...prev, status: 'uploading', message: 'Subiendo video a storage...' }));
            const base64 = result.predictions[0].bytesBase64Encoded;
            const videoUrl = await uploadVideoToStorage(base64, shot.id);
            setVeoProgress(prev => ({ ...prev, status: 'done', message: '¡Video generado!' }));
            return { done: true, videoUrl };
          } catch (uploadError) {
            setVeoProgress(prev => ({ ...prev, status: 'error', message: `Error subiendo video` }));
            return { done: true, error: `Video generado pero falló upload: ${(uploadError as Error).message}` };
          }
        }
        
        if (result?.predictions?.[0]?.gcsUri) {
          setVeoProgress(prev => ({ ...prev, status: 'done', message: '¡Video generado!' }));
          return { done: true, videoUrl: result.predictions[0].gcsUri };
        }
        
        if (result?.video) {
          setVeoProgress(prev => ({ ...prev, status: 'done', message: '¡Video generado!' }));
          return { done: true, videoUrl: result.video };
        }
        
        // No video found in response
        console.error('No video in response:', data);
        setVeoProgress(prev => ({ ...prev, status: 'error', message: 'No se encontró video en la respuesta' }));
        return { done: true, error: 'No video URL in response' };
      }
    }
    
    setVeoProgress(prev => ({ ...prev, status: 'error', message: 'Timeout - generación muy lenta' }));
    return { done: false, error: 'Timeout waiting for video generation' };
  };

  const generateWithVeo = async (): Promise<{ success: boolean; videoUrl?: string; error?: string }> => {
    const prompt = buildVideoPrompt();
    console.log('Starting Veo generation with prompt:', prompt);
    
    // Reset and start progress
    setVeoProgress({
      status: 'starting',
      elapsedSeconds: 0,
      estimatedTotalSeconds: 120,
      message: 'Iniciando generación con Veo 3.1...'
    });
    
    // Start the operation
    const { data: startData, error: startError } = await supabase.functions.invoke('veo_start', {
      body: {
        prompt,
        seconds: form.duration_target,
        aspectRatio: '16:9',
        sampleCount: 1
      }
    });
    
    if (startError) {
      console.error('Veo start error:', startError);
      setVeoProgress(prev => ({ ...prev, status: 'error', message: startError.message }));
      return { success: false, error: startError.message };
    }
    
    // Usar operationName (nombre completo) en lugar de operation (UUID)
    if (!startData?.ok || !startData?.operationName) {
      console.error('Veo start failed:', startData);
      setVeoProgress(prev => ({ ...prev, status: 'error', message: startData?.error || 'Failed to start' }));
      return { success: false, error: startData?.error || 'Failed to start Veo operation' };
    }
    
    console.log('Veo operation started (full name):', startData.operationName);
    
    // Poll for completion usando el operationName completo
    const pollResult = await pollVeoOperation(startData.operationName);
    
    if (pollResult.done && pollResult.videoUrl) {
      return { success: true, videoUrl: pollResult.videoUrl };
    }
    
    return { success: false, error: pollResult.error || 'Video generation failed' };
  };

  const generateVideo = async () => {
    // Save first
    await saveShot();
    
    setGenerating(true);
    toast.info(`Generando shot con ${selectedEngine.toUpperCase()}...`);

    try {
      let videoUrl: string | null = null;
      let fallback = false;
      let engineUsed = selectedEngine;
      let metadata: Record<string, unknown> = {};

      if (selectedEngine === 'veo') {
        // Use new veo_start/veo_poll flow with OAuth2
        const veoResult = await generateWithVeo();
        
        if (veoResult.success && veoResult.videoUrl) {
          videoUrl = veoResult.videoUrl;
          metadata = { engine: 'veo', model: 'veo-3.1-generate-001' };
        } else {
          // Fallback to Lovable AI for keyframe
          console.log('Veo failed, falling back to Lovable AI:', veoResult.error);
          toast.warning('Veo no disponible, generando keyframe...');
          fallback = true;
          engineUsed = 'lovable';
        }
      }

      // Use original generate-shot for kling and lovable (and as fallback)
      if (selectedEngine !== 'veo' || fallback) {
        const { data, error } = await supabase.functions.invoke('generate-shot', {
          body: {
            shotId: shot.id,
            sceneDescription: `${scene.slugline}. ${scene.summary || ''}`,
            shotType: form.shot_type,
            duration: form.duration_target,
            engine: fallback ? 'lovable' : selectedEngine,
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
          videoUrl = data.videoUrl || data.imageUrl;
          fallback = data.fallback || fallback;
          metadata = data.metadata || {};
        } else {
          throw new Error(data?.error || 'Generation failed');
        }
      }

      // Create render record
      await supabase.from('renders').insert([{
        shot_id: shot.id,
        engine: engineUsed,
        video_url: videoUrl,
        status: fallback ? 'failed' : 'succeeded',
        prompt_text: `${scene.slugline} - ${form.shot_type}`,
        params: metadata as Record<string, string | number | boolean | null>
      }]);

      if (fallback) {
        toast.warning('Keyframe generado (video no disponible)');
      } else {
        toast.success('Shot generado correctamente');
      }

      onShotUpdated();
      onOpenChange(false);
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
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="details">
              <Settings className="w-4 h-4 mr-2" />
              Detalles
            </TabsTrigger>
            <TabsTrigger value="keyframes">
              <Camera className="w-4 h-4 mr-2" />
              Keyframes
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

          <TabsContent value="keyframes" className="space-y-4 mt-4">
            <KeyframeManager
              shotId={shot.id}
              duration={form.duration_target}
              sceneDescription={`${scene.slugline}. ${scene.summary || ''}`}
              shotType={form.shot_type}
              cameraMovement={form.camera_movement}
              blocking={form.blocking_description}
              characters={sceneCharacters.map(c => ({
                id: c.id,
                name: c.name,
                token: c.token,
                turnaround_urls: c.turnaround_urls as string[] | undefined
              }))}
              location={sceneLocation ? {
                id: sceneLocation.id,
                name: sceneLocation.name,
                token: sceneLocation.token,
                reference_urls: sceneLocation.reference_urls as string[] | undefined
              } : undefined}
            />
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

            {/* Veo Progress Indicator */}
            {generating && selectedEngine === 'veo' && veoProgress.status !== 'idle' && (
              <div className="p-4 border border-primary/30 bg-primary/5 rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {veoProgress.status === 'generating' && (
                      <Loader2 className="w-5 h-5 animate-spin text-primary" />
                    )}
                    {veoProgress.status === 'starting' && (
                      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                    )}
                    {veoProgress.status === 'uploading' && (
                      <Upload className="w-5 h-5 text-blue-500 animate-pulse" />
                    )}
                    {veoProgress.status === 'done' && (
                      <CheckCircle2 className="w-5 h-5 text-green-500" />
                    )}
                    {veoProgress.status === 'error' && (
                      <XCircle className="w-5 h-5 text-destructive" />
                    )}
                    <span className="font-medium text-sm">{veoProgress.message}</span>
                  </div>
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <Clock className="w-4 h-4" />
                    <span>
                      {Math.floor(veoProgress.elapsedSeconds / 60)}:{(veoProgress.elapsedSeconds % 60).toString().padStart(2, '0')}
                    </span>
                  </div>
                </div>
                
                {(veoProgress.status === 'generating' || veoProgress.status === 'starting') && (
                  <>
                    <Progress 
                      value={Math.min((veoProgress.elapsedSeconds / veoProgress.estimatedTotalSeconds) * 100, 95)} 
                      className="h-2"
                    />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>
                        {Math.round(Math.min((veoProgress.elapsedSeconds / veoProgress.estimatedTotalSeconds) * 100, 95))}% estimado
                      </span>
                      <span>
                        ~{Math.max(0, Math.ceil((veoProgress.estimatedTotalSeconds - veoProgress.elapsedSeconds) / 60))} min restantes
                      </span>
                    </div>
                  </>
                )}
                
                {veoProgress.status === 'uploading' && (
                  <Progress value={100} className="h-2 animate-pulse" />
                )}
              </div>
            )}

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
