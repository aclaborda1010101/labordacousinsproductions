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
import TakesManager from './TakesManager';

interface GenerationProgress {
  status: 'idle' | 'starting' | 'generating' | 'uploading' | 'done' | 'error';
  elapsedSeconds: number;
  estimatedTotalSeconds: number;
  message: string;
  engine?: 'veo' | 'kling';
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
  time_of_day?: string | null;
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

type VideoEngine = 'veo' | 'kling' | 'lovable' | 'runway';

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

// ============= SHOT_ASSISTANT OPTION SETS =============
const SHOT_TYPES = [
  { value: 'ExtremeWide', label: 'Extreme Wide' },
  { value: 'Wide', label: 'Wide' },
  { value: 'Full', label: 'Full' },
  { value: 'MediumWide', label: 'Medium Wide' },
  { value: 'Medium', label: 'Medium' },
  { value: 'MediumClose', label: 'Medium Close-up' },
  { value: 'CloseUp', label: 'Close-up' },
  { value: 'ExtremeCloseUp', label: 'Extreme Close-up' },
  { value: 'OverShoulder', label: 'Over the Shoulder' },
  { value: 'POV', label: 'POV' },
  { value: 'Insert', label: 'Insert' },
  { value: 'Cutaway', label: 'Cutaway' },
  { value: 'Establishing', label: 'Establishing' },
  { value: 'TwoShot', label: 'Two Shot' },
  { value: 'GroupShot', label: 'Group Shot' },
  { value: 'ReactionShot', label: 'Reaction Shot' },
  { value: 'DetailMacro', label: 'Detail/Macro' },
];

const CAMERA_MOVEMENTS = [
  { value: 'Static', label: 'Estático' },
  { value: 'Handheld_Controlled', label: 'Handheld Controlado' },
  { value: 'Handheld_Raw', label: 'Handheld Raw' },
  { value: 'Steadicam', label: 'Steadicam' },
  { value: 'Gimbal', label: 'Gimbal' },
  { value: 'Tripod_Pan_Left', label: 'Pan Izquierda' },
  { value: 'Tripod_Pan_Right', label: 'Pan Derecha' },
  { value: 'Tripod_Tilt_Up', label: 'Tilt Arriba' },
  { value: 'Tripod_Tilt_Down', label: 'Tilt Abajo' },
  { value: 'Slider_Left', label: 'Slider Izq' },
  { value: 'Slider_Right', label: 'Slider Der' },
  { value: 'Dolly_In', label: 'Dolly In' },
  { value: 'Dolly_Out', label: 'Dolly Out' },
  { value: 'PushIn_Slow', label: 'Push In Lento' },
  { value: 'PullOut_Slow', label: 'Pull Out Lento' },
  { value: 'Tracking_Follow', label: 'Tracking Follow' },
  { value: 'Tracking_Lead', label: 'Tracking Lead' },
  { value: 'Arc_Orbit_Left', label: 'Arco Izq' },
  { value: 'Arc_Orbit_Right', label: 'Arco Der' },
  { value: 'Crane_Up', label: 'Crane Up' },
  { value: 'Crane_Down', label: 'Crane Down' },
  { value: 'Jib_Arc', label: 'Jib Arc' },
  { value: 'Zoom_In', label: 'Zoom In' },
  { value: 'Zoom_Out', label: 'Zoom Out' },
  { value: 'Snap_Zoom', label: 'Snap Zoom' },
  { value: 'Whip_Pan', label: 'Whip Pan' },
  { value: 'Dolly_Zoom', label: 'Dolly Zoom' },
  { value: 'Rack_Focus', label: 'Rack Focus' },
  { value: 'Micro_Drift', label: 'Micro Drift' },
];

const FOCAL_LENGTHS = [
  { value: 18, label: '18mm' },
  { value: 24, label: '24mm' },
  { value: 28, label: '28mm' },
  { value: 35, label: '35mm' },
  { value: 40, label: '40mm' },
  { value: 50, label: '50mm' },
  { value: 65, label: '65mm' },
  { value: 85, label: '85mm' },
  { value: 100, label: '100mm' },
  { value: 135, label: '135mm' },
];

const CAMERA_HEIGHTS = [
  { value: 'EyeLevel', label: 'Eye Level' },
  { value: 'LowAngle', label: 'Low Angle' },
  { value: 'HighAngle', label: 'High Angle' },
  { value: 'WaistLevel', label: 'Waist Level' },
  { value: 'ShoulderLevel', label: 'Shoulder Level' },
  { value: 'Overhead', label: 'Overhead' },
  { value: 'GroundLevel', label: 'Ground Level' },
];

const LIGHTING_STYLES = [
  { value: 'Naturalistic_Daylight', label: 'Luz Natural Día' },
  { value: 'Naturalistic_Tungsten', label: 'Tungsteno Natural' },
  { value: 'Soft_Key_LowContrast', label: 'Key Suave' },
  { value: 'Hard_Key_HighContrast', label: 'Key Dura' },
  { value: 'Motivated_Practicals', label: 'Prácticas Motivadas' },
  { value: 'WindowKey_SideLight', label: 'Luz de Ventana' },
  { value: 'TopLight_Dramatic', label: 'Top Light Dramática' },
  { value: 'Backlight_Rim', label: 'Contra/Rim' },
  { value: 'Neon_Mixed', label: 'Neón Mixto' },
  { value: 'Corporate_Clean', label: 'Corporativa Limpia' },
  { value: 'Noir_Contrast', label: 'Noir' },
];

// ============= INDUSTRY CAMERA BODIES =============
const CAMERA_BODIES = [
  { value: 'ARRI_ALEXA_35', label: 'ARRI ALEXA 35' },
  { value: 'ARRI_ALEXA_LF', label: 'ARRI ALEXA LF' },
  { value: 'ARRI_ALEXA_MINI_LF', label: 'ARRI ALEXA Mini LF' },
  { value: 'ARRI_ALEXA_MINI', label: 'ARRI ALEXA Mini' },
  { value: 'ARRI_AMIRA', label: 'ARRI AMIRA' },
  { value: 'RED_V_RAPTOR_XL', label: 'RED V-RAPTOR XL 8K VV' },
  { value: 'RED_V_RAPTOR', label: 'RED V-RAPTOR 8K' },
  { value: 'RED_KOMODO_X', label: 'RED KOMODO-X 6K' },
  { value: 'RED_KOMODO', label: 'RED KOMODO 6K' },
  { value: 'SONY_VENICE_2', label: 'Sony VENICE 2 8K' },
  { value: 'SONY_VENICE', label: 'Sony VENICE' },
  { value: 'SONY_FX9', label: 'Sony FX9' },
  { value: 'SONY_FX6', label: 'Sony FX6' },
  { value: 'SONY_FX3', label: 'Sony FX3' },
  { value: 'SONY_A7S_III', label: 'Sony A7S III' },
  { value: 'BLACKMAGIC_URSA_12K', label: 'Blackmagic URSA Mini Pro 12K' },
  { value: 'BLACKMAGIC_URSA_G2', label: 'Blackmagic URSA Mini Pro G2' },
  { value: 'BLACKMAGIC_POCKET_6K', label: 'Blackmagic Pocket 6K Pro' },
  { value: 'CANON_C500_II', label: 'Canon EOS C500 Mark II' },
  { value: 'CANON_C300_III', label: 'Canon EOS C300 Mark III' },
  { value: 'CANON_C70', label: 'Canon EOS C70' },
  { value: 'CANON_R5C', label: 'Canon EOS R5 C' },
  { value: 'PANAVISION_DXL2', label: 'Panavision DXL2' },
  { value: 'PANAVISION_MILLENNIUM', label: 'Panavision Millennium' },
];

// ============= PROFESSIONAL LENSES =============
const PROFESSIONAL_LENSES = [
  // ARRI/ZEISS
  { value: 'ARRI_SIGNATURE_PRIME', label: 'ARRI Signature Prime' },
  { value: 'ARRI_MASTER_PRIME', label: 'ARRI Master Prime' },
  { value: 'ARRI_ULTRA_PRIME', label: 'ARRI Ultra Prime' },
  { value: 'ZEISS_SUPREME_PRIME', label: 'ZEISS Supreme Prime' },
  { value: 'ZEISS_SUPREME_RADIANCE', label: 'ZEISS Supreme Prime Radiance' },
  { value: 'ZEISS_CP3_XD', label: 'ZEISS CP.3 XD' },
  // Cooke
  { value: 'COOKE_S7I', label: 'Cooke S7/i Full Frame' },
  { value: 'COOKE_S5I', label: 'Cooke S5/i' },
  { value: 'COOKE_ANAMORPHIC', label: 'Cooke Anamorphic/i SF' },
  { value: 'COOKE_PANCHRO', label: 'Cooke Panchro/i Classic' },
  // Panavision
  { value: 'PANAVISION_PRIMO', label: 'Panavision Primo 70' },
  { value: 'PANAVISION_SPHERO', label: 'Panavision Sphero 65' },
  { value: 'PANAVISION_ULTRA_VISTA', label: 'Panavision Ultra Vista' },
  { value: 'PANAVISION_T_SERIES', label: 'Panavision T Series' },
  // Canon
  { value: 'CANON_SUMIRE', label: 'Canon Sumire Prime' },
  { value: 'CANON_K35', label: 'Canon K35' },
  { value: 'CANON_CN_E', label: 'Canon CN-E Prime' },
  // Sony
  { value: 'SONY_CineAlta', label: 'Sony CineAlta 4K' },
  // Sigma
  { value: 'SIGMA_FF_HIGH_SPEED', label: 'Sigma FF High Speed Prime' },
  { value: 'SIGMA_FF_CLASSIC', label: 'Sigma FF Classic' },
  // Vintage / Specialty
  { value: 'LOMO_ANAMORPHIC', label: 'LOMO Anamorphic' },
  { value: 'KOWA_ANAMORPHIC', label: 'Kowa Anamorphic' },
  { value: 'ATLAS_ORION', label: 'Atlas Orion Anamorphic' },
  { value: 'LEITZ_SUMMILUX', label: 'Leitz Summilux-C' },
  { value: 'LEITZ_SUMMICRON', label: 'Leitz Summicron-C' },
  // Zoom
  { value: 'ANGENIEUX_EZ_ZOOM', label: 'Angénieux EZ Zoom' },
  { value: 'ANGENIEUX_OPTIMO', label: 'Angénieux Optimo' },
  { value: 'FUJINON_PREMISTA', label: 'Fujinon Premista' },
  { value: 'FUJINON_CABRIO', label: 'Fujinon Cabrio' },
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
  const [generationProgress, setGenerationProgress] = useState<GenerationProgress>({
    status: 'idle',
    elapsedSeconds: 0,
    estimatedTotalSeconds: 120,
    message: ''
  });

  // Timer for elapsed time during generation
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (generationProgress.status === 'generating' || generationProgress.status === 'starting') {
      interval = setInterval(() => {
        setGenerationProgress(prev => ({
          ...prev,
          elapsedSeconds: prev.elapsedSeconds + 1
        }));
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [generationProgress.status]);
  
  const [form, setForm] = useState({
    shot_type: shot.shot_type,
    duration_target: shot.duration_target,
    dialogue_text: shot.dialogue_text || '',
    camera_movement: (shot.camera as any)?.movement || 'Static',
    camera_height: (shot.camera as any)?.height || 'EyeLevel',
    camera_angle: (shot.camera as any)?.angle || '',
    focal_mm: (shot.camera as any)?.focal_mm || 35,
    camera_body: (shot.camera as any)?.camera_body || 'ARRI_ALEXA_35',
    lens_model: (shot.camera as any)?.lens_model || 'ARRI_SIGNATURE_PRIME',
    blocking_description: (shot.blocking as any)?.description || '',
    blocking_action: (shot.blocking as any)?.action || '',
    effective_mode: shot.effective_mode,
    hero: shot.hero || false,
    // SHOT_ASSISTANT extra fields
    viewer_notice: (shot.blocking as any)?.viewer_notice || '',
    ai_risk: (shot.blocking as any)?.ai_risk || '',
    lighting_style: (shot.camera as any)?.lighting_style || 'Naturalistic_Daylight',
    intention: (shot.blocking as any)?.intention || '',
    prev_shot_context: '',
    next_shot_context: '',
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
        effective_mode: form.effective_mode,
        hero: form.hero,
        camera: {
          movement: form.camera_movement,
          height: form.camera_height,
          angle: form.camera_angle,
          focal_mm: form.focal_mm,
          camera_body: form.camera_body,
          lens_model: form.lens_model,
          lighting_style: form.lighting_style
        },
        blocking: {
          description: form.blocking_description,
          action: form.blocking_action,
          viewer_notice: form.viewer_notice,
          ai_risk: form.ai_risk,
          intention: form.intention
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
          project: {
            quality_mode_default: scene.quality_mode,
            fps: 24,
            aspect_ratio: '16:9',
            language: 'es-ES'
          },
          scene: {
            slugline: scene.slugline,
            scene_summary: scene.summary || '',
            previous_shot_context: form.prev_shot_context,
            next_shot_context: form.next_shot_context
          },
          shot: {
            shot_index: shot.shot_no,
            effective_mode: form.effective_mode,
            duration_sec: form.duration_target,
            current_fields: {
              shot_type: form.shot_type,
              camera_movement: form.camera_movement,
              dialogue: form.dialogue_text
            }
          },
          location: sceneLocation ? {
            name: sceneLocation.name,
            time_of_day: scene.time_of_day
          } : undefined,
          characters: sceneCharacters.map(c => ({
            name: c.name,
            reference_images_available: !!(c.turnaround_urls as string[])?.length
          }))
        }
      });

      if (response.error) throw response.error;

      const data = response.data;
      const fills = data.fills || data;
      
      setForm(prev => ({
        ...prev,
        shot_type: fills.shot_type || prev.shot_type,
        camera_movement: fills.camera_movement || prev.camera_movement,
        camera_height: fills.camera_details?.camera_height || prev.camera_height,
        camera_angle: fills.camera_details?.camera_angle || prev.camera_angle,
        focal_mm: fills.lens?.focal_mm || prev.focal_mm,
        lighting_style: fills.lighting?.lighting_style || prev.lighting_style,
        blocking_description: fills.blocking_action || prev.blocking_description,
        blocking_action: fills.blocking_action || prev.blocking_action,
        duration_target: fills.duration_sec || prev.duration_target,
        viewer_notice: fills.viewer_notice || prev.viewer_notice,
        ai_risk: fills.ai_risk?.primary_risk || prev.ai_risk,
        intention: fills.intention || prev.intention,
      }));

      // Show missing info if any
      if (data.missing_info?.length > 0) {
        toast.info(`Faltan datos: ${data.missing_info.map((m: any) => m.field).join(', ')}`);
      }

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
    
    setGenerationProgress({
      status: 'generating',
      elapsedSeconds: 0,
      estimatedTotalSeconds: 120,
      message: 'Generando video con Veo 3.1...',
      engine: 'veo'
    });
    
    while (attempts < maxAttempts) {
      await new Promise(r => setTimeout(r, 5000)); // Poll every 5 seconds
      attempts++;
      
      setGenerationProgress(prev => ({
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
          setGenerationProgress(prev => ({ ...prev, status: 'error', message: data.error.message || 'Veo generation failed' }));
          return { done: true, error: data.error.message || 'Veo generation failed' };
        }
        
        // Extract video from response - structure is response.videos[0].bytesBase64Encoded
        const result = data.result;
        
        // Check bytesBase64Encoded (inline video data)
        if (result?.videos?.[0]?.bytesBase64Encoded) {
          try {
            setGenerationProgress(prev => ({ ...prev, status: 'uploading', message: 'Subiendo video a storage...' }));
            const base64 = result.videos[0].bytesBase64Encoded;
            const videoUrl = await uploadVideoToStorage(base64, shot.id);
            setGenerationProgress(prev => ({ ...prev, status: 'done', message: '¡Video generado!' }));
            return { done: true, videoUrl };
          } catch (uploadError) {
            console.error('Upload error:', uploadError);
            setGenerationProgress(prev => ({ ...prev, status: 'error', message: `Error subiendo: ${(uploadError as Error).message}` }));
            return { done: true, error: `Video generado pero falló upload: ${(uploadError as Error).message}` };
          }
        }
        
        // Check gcsUri (Google Cloud Storage URI)
        if (result?.videos?.[0]?.gcsUri) {
          setGenerationProgress(prev => ({ ...prev, status: 'done', message: '¡Video generado!' }));
          return { done: true, videoUrl: result.videos[0].gcsUri };
        }
        
        // Legacy formats
        if (result?.predictions?.[0]?.bytesBase64Encoded) {
          try {
            setGenerationProgress(prev => ({ ...prev, status: 'uploading', message: 'Subiendo video a storage...' }));
            const base64 = result.predictions[0].bytesBase64Encoded;
            const videoUrl = await uploadVideoToStorage(base64, shot.id);
            setGenerationProgress(prev => ({ ...prev, status: 'done', message: '¡Video generado!' }));
            return { done: true, videoUrl };
          } catch (uploadError) {
            setGenerationProgress(prev => ({ ...prev, status: 'error', message: `Error subiendo video` }));
            return { done: true, error: `Video generado pero falló upload: ${(uploadError as Error).message}` };
          }
        }
        
        if (result?.predictions?.[0]?.gcsUri) {
          setGenerationProgress(prev => ({ ...prev, status: 'done', message: '¡Video generado!' }));
          return { done: true, videoUrl: result.predictions[0].gcsUri };
        }
        
        if (result?.video) {
          setGenerationProgress(prev => ({ ...prev, status: 'done', message: '¡Video generado!' }));
          return { done: true, videoUrl: result.video };
        }
        
        // No video found in response
        console.error('No video in response:', data);
        setGenerationProgress(prev => ({ ...prev, status: 'error', message: 'No se encontró video en la respuesta' }));
        return { done: true, error: 'No video URL in response' };
      }
    }
    
    setGenerationProgress(prev => ({ ...prev, status: 'error', message: 'Timeout - generación muy lenta' }));
    return { done: false, error: 'Timeout waiting for video generation' };
  };

  // Poll Kling operation until complete
  const pollKlingOperation = async (
    taskId: string,
    endpoint: 'image2video' | 'text2video'
  ): Promise<{ done: boolean; videoUrl?: string; error?: string }> => {
    const maxAttempts = 60; // 5 minutes max
    let attempts = 0;

    setGenerationProgress({
      status: 'generating',
      elapsedSeconds: 0,
      estimatedTotalSeconds: 90,
      message: 'Generando video con Kling 2.0...',
      engine: 'kling'
    });

    while (attempts < maxAttempts) {
      await new Promise(r => setTimeout(r, 5000)); // Poll every 5 seconds
      attempts++;

      setGenerationProgress(prev => ({
        ...prev,
        message: `Renderizando video... (intento ${attempts})`
      }));

      const { data, error } = await supabase.functions.invoke('kling_poll', {
        body: {
          taskId: String(taskId),
          endpoint
        }
      });

      if (error) {
        console.error('Kling poll invoke error:', error);
        continue;
      }

      console.log('Kling poll result:', data);

      // kling_poll contract: { ok, done, videoUrl?, error?, status?, statusMsg? }
      if (data?.done && data?.videoUrl) {
        setGenerationProgress(prev => ({ ...prev, status: 'done', message: '¡Video generado con Kling!' }));
        return { done: true, videoUrl: data.videoUrl };
      }

      if (data?.done && data?.error) {
        setGenerationProgress(prev => ({ ...prev, status: 'error', message: data.error }));
        return { done: true, error: data.error };
      }

      // If the poll endpoint itself errored (e.g. 404/429), keep trying until timeout
      if (data?.ok === false) {
        continue;
      }

      // Still processing
      if (data?.done === false) {
        continue;
      }
    }

    setGenerationProgress(prev => ({ ...prev, status: 'error', message: 'Timeout - generación muy lenta' }));
    return { done: false, error: 'Timeout waiting for Kling video generation' };
  };
  const generateWithKling = async (): Promise<{ success: boolean; videoUrl?: string; error?: string }> => {
    const prompt = buildVideoPrompt();
    console.log('Starting Kling generation with prompt:', prompt);

    // Reset and start progress
    setGenerationProgress({
      status: 'starting',
      elapsedSeconds: 0,
      estimatedTotalSeconds: 90,
      message: 'Iniciando generación con Kling 2.0...',
      engine: 'kling'
    });

    // Kling v2: require a keyframe for consistent image2video quality
    let keyframeUrl: string | undefined;
    try {
      const { data: approvedKf, error: approvedErr } = await supabase
        .from('keyframes')
        .select('image_url')
        .eq('shot_id', shot.id)
        .eq('approved', true)
        .not('image_url', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (approvedErr) {
        console.warn('Error fetching approved keyframe:', approvedErr);
      }

      keyframeUrl = approvedKf?.image_url ?? undefined;

      if (!keyframeUrl) {
        const { data: anyKf, error: anyErr } = await supabase
          .from('keyframes')
          .select('image_url')
          .eq('shot_id', shot.id)
          .not('image_url', 'is', null)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (anyErr) {
          console.warn('Error fetching keyframe:', anyErr);
        }

        keyframeUrl = anyKf?.image_url ?? undefined;
      }
    } catch (e) {
      console.warn('Keyframe lookup failed:', e);
    }

    if (!keyframeUrl) {
      const msg = 'Kling v2 requiere un keyframe. Ve a “Keyframes” y genera uno primero.';
      toast.error(msg);
      setGenerationProgress(prev => ({ ...prev, status: 'error', message: msg }));
      return { success: false, error: msg };
    }

    // Start the operation (kling_start contract: { prompt, duration, keyframeUrl?, qualityMode? })
    const { data: startData, error: startError } = await supabase.functions.invoke('kling_start', {
      body: {
        prompt,
        duration: form.duration_target <= 5 ? 5 : 10,
        keyframeUrl,
        qualityMode: form.effective_mode
      }
    });

    if (startError) {
      console.error('Kling start error:', startError);
      setGenerationProgress(prev => ({ ...prev, status: 'error', message: startError.message }));
      return { success: false, error: startError.message };
    }

    if (!startData?.ok || !startData?.taskId) {
      console.error('Kling start failed:', startData);
      setGenerationProgress(prev => ({ ...prev, status: 'error', message: startData?.error || 'Failed to start' }));
      return { success: false, error: startData?.error || 'Failed to start Kling operation' };
    }

    console.log('Kling task started:', startData.taskId, 'endpoint:', startData.endpoint);

    const endpoint = (startData.endpoint as ('image2video' | 'text2video') | undefined) ?? 'image2video';

    // Poll for completion
    const pollResult = await pollKlingOperation(String(startData.taskId), endpoint);

    if (pollResult.done && pollResult.videoUrl) {
      return { success: true, videoUrl: pollResult.videoUrl };
    }

    return { success: false, error: pollResult.error || 'Video generation failed' };
  };

  const generateWithVeo = async (): Promise<{ success: boolean; videoUrl?: string; error?: string }> => {
    const prompt = buildVideoPrompt();
    console.log('Starting Veo generation with prompt:', prompt);
    
    // Reset and start progress
    setGenerationProgress({
      status: 'starting',
      elapsedSeconds: 0,
      estimatedTotalSeconds: 120,
      message: 'Iniciando generación con Veo 3.1...',
      engine: 'veo'
    });
    
    // Veo: try to find a keyframe for image-to-video (like Kling)
    let keyframeUrl: string | undefined;
    try {
      // First try approved keyframes
      const { data: approvedKf, error: approvedErr } = await supabase
        .from('keyframes')
        .select('image_url')
        .eq('shot_id', shot.id)
        .eq('approved', true)
        .not('image_url', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (approvedErr) {
        console.warn('Error fetching approved keyframe:', approvedErr);
      }

      keyframeUrl = approvedKf?.image_url ?? undefined;

      // If no approved, try any keyframe
      if (!keyframeUrl) {
        const { data: anyKf, error: anyErr } = await supabase
          .from('keyframes')
          .select('image_url')
          .eq('shot_id', shot.id)
          .not('image_url', 'is', null)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (anyErr) {
          console.warn('Error fetching keyframe:', anyErr);
        }

        keyframeUrl = anyKf?.image_url ?? undefined;
      }
    } catch (e) {
      console.warn('Keyframe lookup failed:', e);
    }

    const mode = keyframeUrl ? 'image-to-video' : 'text-to-video';
    console.log(`Veo mode: ${mode}`, keyframeUrl ? `with keyframe: ${keyframeUrl.substring(0, 50)}...` : '');
    
    setGenerationProgress(prev => ({
      ...prev,
      message: keyframeUrl 
        ? 'Iniciando Veo 3.1 (image-to-video)...' 
        : 'Iniciando Veo 3.1 (text-to-video)...'
    }));
    
    // Start the operation - now with optional keyframeUrl
    const { data: startData, error: startError } = await supabase.functions.invoke('veo_start', {
      body: {
        prompt,
        seconds: form.duration_target,
        aspectRatio: '16:9',
        sampleCount: 1,
        keyframeUrl, // Pass keyframe if available
      }
    });
    
    if (startError) {
      console.error('Veo start error:', startError);
      setGenerationProgress(prev => ({ ...prev, status: 'error', message: startError.message }));
      return { success: false, error: startError.message };
    }
    
    // Usar operationName (nombre completo) en lugar de operation (UUID)
    if (!startData?.ok || !startData?.operationName) {
      console.error('Veo start failed:', startData);
      setGenerationProgress(prev => ({ ...prev, status: 'error', message: startData?.error || 'Failed to start' }));
      return { success: false, error: startData?.error || 'Failed to start Veo operation' };
    }
    
    console.log('Veo operation started (full name):', startData.operationName, 'Mode:', startData.mode);
    
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

      // Use new kling_start/kling_poll flow for Kling
      if (selectedEngine === 'kling' && !fallback) {
        const klingResult = await generateWithKling();
        
        if (klingResult.success && klingResult.videoUrl) {
          videoUrl = klingResult.videoUrl;
          metadata = { engine: 'kling', model: 'kling-v2' };
        } else {
          // Fallback to Lovable AI for keyframe
          console.log('Kling failed, falling back to Lovable AI:', klingResult.error);
          toast.warning('Kling no disponible, generando keyframe...');
          fallback = true;
          engineUsed = 'lovable';
        }
      }

      // Runway: Manual selection only - no auto integration yet
      if (selectedEngine === 'runway' && !fallback) {
        // Runway is not yet integrated with edge functions
        // For now, show a placeholder message and fall back to Lovable
        toast.warning('Runway Gen-3 requiere configuración adicional. Generando keyframe...');
        console.log('Runway selected but not yet integrated, falling back to Lovable AI');
        fallback = true;
        engineUsed = 'lovable';
        metadata = { engine: 'runway', model: 'gen-3-alpha', status: 'pending_integration' };
      }

      // Use generate-shot for lovable only (and as fallback)
      if (selectedEngine === 'lovable' || fallback) {
        const { data, error } = await supabase.functions.invoke('generate-shot', {
          body: {
            shotId: shot.id,
            sceneDescription: `${scene.slugline}. ${scene.summary || ''}`,
            shotType: form.shot_type,
            duration: form.duration_target,
            engine: 'lovable',
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
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="details">
              <Settings className="w-4 h-4 mr-2" />
              Detalles
            </TabsTrigger>
            <TabsTrigger value="keyframes">
              <ImageIcon className="w-4 h-4 mr-2" />
              Keyframes
            </TabsTrigger>
            <TabsTrigger value="takes">
              <Video className="w-4 h-4 mr-2" />
              Takes
            </TabsTrigger>
            <TabsTrigger value="generate">
              <Sparkles className="w-4 h-4 mr-2" />
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

            {/* Quality Mode Selector */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Sparkles className="w-4 h-4" />
                Modo de Calidad
              </Label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setForm({...form, effective_mode: 'CINE', hero: false})}
                  className={`p-3 rounded-lg border-2 transition-all text-left ${
                    form.effective_mode === 'CINE' && !form.hero
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Badge variant="cine" className="text-xs">CINE</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    3 takes, 1 keyframe, balance calidad/coste
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setForm({...form, effective_mode: 'ULTRA', hero: false})}
                  className={`p-3 rounded-lg border-2 transition-all text-left ${
                    form.effective_mode === 'ULTRA' && !form.hero
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Badge variant="ultra" className="text-xs">ULTRA</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    5 takes, 2 keyframes, máxima calidad
                  </p>
                </button>
              </div>
              {scene.quality_mode === 'CINE' && (
                <div className="flex items-center gap-2 mt-2">
                  <input
                    type="checkbox"
                    id="hero-shot"
                    checked={form.hero}
                    onChange={e => setForm({
                      ...form, 
                      hero: e.target.checked,
                      effective_mode: e.target.checked ? 'ULTRA' : scene.quality_mode
                    })}
                    className="rounded border-border"
                  />
                  <Label htmlFor="hero-shot" className="text-sm cursor-pointer flex items-center gap-1">
                    <Badge variant="hero" className="text-[10px]">HERO</Badge>
                    Forzar ULTRA en este plano (escena CINE)
                  </Label>
                </div>
              )}
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
                  <Label className="text-xs text-muted-foreground">Focal</Label>
                  <Select value={String(form.focal_mm)} onValueChange={v => setForm({...form, focal_mm: parseInt(v)})}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FOCAL_LENGTHS.map(f => (
                        <SelectItem key={f.value} value={String(f.value)}>
                          {f.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Altura</Label>
                  <Select value={form.camera_height} onValueChange={v => setForm({...form, camera_height: v})}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CAMERA_HEIGHTS.map(h => (
                        <SelectItem key={h.value} value={h.value}>
                          {h.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 mt-2">
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Cuerpo de Cámara</Label>
                  <Select value={form.camera_body} onValueChange={v => setForm({...form, camera_body: v})}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-60">
                      {CAMERA_BODIES.map(cam => (
                        <SelectItem key={cam.value} value={cam.value}>
                          {cam.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Objetivo / Lente</Label>
                  <Select value={form.lens_model} onValueChange={v => setForm({...form, lens_model: v})}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-60">
                      {PROFESSIONAL_LENSES.map(lens => (
                        <SelectItem key={lens.value} value={lens.value}>
                          {lens.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 mt-2">
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Iluminación</Label>
                  <Select value={form.lighting_style} onValueChange={v => setForm({...form, lighting_style: v})}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LIGHTING_STYLES.map(l => (
                        <SelectItem key={l.value} value={l.value}>
                          {l.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* SHOT_ASSISTANT Extra Fields */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Sparkles className="w-4 h-4" />
                Campos SHOT_ASSISTANT
              </Label>
              <div className="space-y-3 p-3 bg-muted/30 rounded-lg">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">¿Qué debe notar el espectador?</Label>
                  <Input 
                    placeholder="Ej: El nerviosismo en sus manos"
                    value={form.viewer_notice}
                    onChange={e => setForm({...form, viewer_notice: e.target.value})}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Riesgo IA a vigilar</Label>
                  <Input 
                    placeholder="Ej: hands, face, lighting, morphing"
                    value={form.ai_risk}
                    onChange={e => setForm({...form, ai_risk: e.target.value})}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Intención del plano</Label>
                  <Input 
                    placeholder="Ej: Revelar la duda del personaje"
                    value={form.intention}
                    onChange={e => setForm({...form, intention: e.target.value})}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Plano anterior</Label>
                    <Input 
                      placeholder="Contexto del plano anterior"
                      value={form.prev_shot_context}
                      onChange={e => setForm({...form, prev_shot_context: e.target.value})}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Plano siguiente</Label>
                    <Input 
                      placeholder="Lo que viene después"
                      value={form.next_shot_context}
                      onChange={e => setForm({...form, next_shot_context: e.target.value})}
                    />
                  </div>
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
              shotDetails={{
                focalMm: form.focal_mm,
                cameraHeight: form.camera_height,
                lightingStyle: form.lighting_style,
                viewerNotice: form.viewer_notice,
                aiRisk: form.ai_risk,
                intention: form.intention,
                dialogueText: form.dialogue_text,
                effectiveMode: form.effective_mode
              }}
            />
          </TabsContent>

          <TabsContent value="takes" className="space-y-4 mt-4">
            <TakesManager shotId={shot.id} />
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
                  <SelectItem value="runway">
                    <div className="flex items-center gap-2">
                      <Video className="w-4 h-4 text-purple-500" />
                      <span className="font-bold">Runway Gen-3</span>
                      {preferredEngine === 'runway' && <Badge variant="outline" className="text-xs">Tu preferido</Badge>}
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {selectedEngine === 'lovable' && 'Genera keyframes de alta calidad. Siempre disponible.'}
                {selectedEngine === 'veo' && 'Video con movimiento suave. Requiere API externa.'}
                {selectedEngine === 'kling' && 'Video con expresiones detalladas. Requiere API externa.'}
                {selectedEngine === 'runway' && 'Video cinematográfico con control avanzado. Requiere API externa.'}
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

            {/* Generation Progress Indicator */}
            {generating && (selectedEngine === 'veo' || selectedEngine === 'kling') && generationProgress.status !== 'idle' && (
              <div className="p-4 border border-primary/30 bg-primary/5 rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {generationProgress.status === 'generating' && (
                      <Loader2 className="w-5 h-5 animate-spin text-primary" />
                    )}
                    {generationProgress.status === 'starting' && (
                      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                    )}
                    {generationProgress.status === 'uploading' && (
                      <Upload className="w-5 h-5 text-blue-500 animate-pulse" />
                    )}
                    {generationProgress.status === 'done' && (
                      <CheckCircle2 className="w-5 h-5 text-green-500" />
                    )}
                    {generationProgress.status === 'error' && (
                      <XCircle className="w-5 h-5 text-destructive" />
                    )}
                    <span className="font-medium text-sm">{generationProgress.message}</span>
                  </div>
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <Clock className="w-4 h-4" />
                    <span>
                      {Math.floor(generationProgress.elapsedSeconds / 60)}:{(generationProgress.elapsedSeconds % 60).toString().padStart(2, '0')}
                    </span>
                  </div>
                </div>
                
                {(generationProgress.status === 'generating' || generationProgress.status === 'starting') && (
                  <>
                    <Progress 
                      value={Math.min((generationProgress.elapsedSeconds / generationProgress.estimatedTotalSeconds) * 100, 95)} 
                      className="h-2"
                    />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>
                        {Math.round(Math.min((generationProgress.elapsedSeconds / generationProgress.estimatedTotalSeconds) * 100, 95))}% estimado
                      </span>
                      <span>
                        ~{Math.max(0, Math.ceil((generationProgress.estimatedTotalSeconds - generationProgress.elapsedSeconds) / 60))} min restantes
                      </span>
                    </div>
                  </>
                )}
                
                {generationProgress.status === 'uploading' && (
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
