import { useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  Loader2, 
  Upload, 
  Check, 
  Camera, 
  Aperture, 
  Film,
  Palette,
  Sparkles,
  Image as ImageIcon,
  X
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { VISUAL_PRESETS, getPresetsByCategory, type VisualPreset } from '@/lib/visualPresets';
import NextStepNavigator from './NextStepNavigator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface VisualBibleSetupProps {
  projectId: string;
  onComplete?: (styleConfig: StyleConfig) => void;
}

interface StyleConfig {
  presetId: string | null;
  customAnalysis: any | null;
  camera: {
    body: string;
    lens: string;
    focalLength: string;
    aperture: string;
  };
  style: {
    lighting: string;
    colorPalette: string[];
    mood: string;
    contrast: string;
    saturation: string;
    grain: string;
  };
  promptModifiers: string[];
  negativeModifiers: string[];
  referenceImageUrl?: string;
}

export default function VisualBibleSetup({ projectId, onComplete }: VisualBibleSetupProps) {
  const [step, setStep] = useState<'preset' | 'customize' | 'complete'>('preset');
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [referenceImage, setReferenceImage] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [customAnalysis, setCustomAnalysis] = useState<any>(null);
  const [styleDescription, setStyleDescription] = useState('');
  const [hasExistingStyle, setHasExistingStyle] = useState(false);

  // Load existing style on mount
  useEffect(() => {
    const fetchExistingStyle = async () => {
      setIsLoading(true);
      try {
        const { data: stylePack, error } = await supabase
          .from('style_packs')
          .select('*')
          .eq('project_id', projectId)
          .maybeSingle();

        if (error) throw error;

        if (stylePack?.style_config) {
          const config = stylePack.style_config as any;
          setHasExistingStyle(true);
          
          // Hydrate preset
          if (config.presetId) {
            setSelectedPreset(config.presetId);
          }
          
          // Hydrate custom analysis
          if (config.customAnalysis) {
            setCustomAnalysis(config.customAnalysis);
          }
          
          // Hydrate reference image
          if (config.referenceImageUrl) {
            setReferenceImage(config.referenceImageUrl);
          }
          
          // Hydrate description
          if (stylePack.description) {
            setStyleDescription(stylePack.description);
          }
        }
      } catch (err) {
        console.error('Error loading existing style:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchExistingStyle();
  }, [projectId]);

  // Current style config based on preset or analysis
  const currentConfig = selectedPreset 
    ? VISUAL_PRESETS[selectedPreset] 
    : customAnalysis;

  const handlePresetSelect = (presetId: string) => {
    setSelectedPreset(presetId);
    setCustomAnalysis(null);
    setReferenceImage(null);
  };

  const handleImageUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Convert to base64
    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target?.result as string;
      setReferenceImage(base64);
      setSelectedPreset(null);
      
      // Analyze the image
      setIsAnalyzing(true);
      try {
        const { data, error } = await supabase.functions.invoke('analyze-style-reference', {
          body: { imageBase64: base64 }
        });

        if (error) throw error;

        if (data?.analysis) {
          setCustomAnalysis(data.analysis);
          if (data.analysis.preset_match) {
            setSelectedPreset(data.analysis.preset_match);
          }
          toast.success('Estilo analizado correctamente');
        }
      } catch (err) {
        console.error('Error analyzing image:', err);
        toast.error('Error al analizar la imagen');
      } finally {
        setIsAnalyzing(false);
      }
    };
    reader.readAsDataURL(file);
  }, []);

  const handleSave = async () => {
    if (!currentConfig && !selectedPreset) {
      toast.error('Selecciona un preset o sube una imagen de referencia');
      return;
    }

    setIsSaving(true);
    try {
      const preset = selectedPreset ? VISUAL_PRESETS[selectedPreset] : null;
      const analysis = customAnalysis;

      const styleConfig: StyleConfig = {
        presetId: selectedPreset,
        customAnalysis: analysis,
        camera: preset?.camera || analysis?.camera || {
          body: 'ARRI Alexa Mini',
          lens: 'Zeiss Supreme Prime',
          focalLength: '35mm',
          aperture: 'f/2.8',
        },
        style: {
          lighting: preset?.style.lighting || analysis?.style?.lighting || 'natural',
          colorPalette: preset?.style.colorPalette || analysis?.style?.color_palette || [],
          mood: preset?.style.mood || analysis?.style?.mood || 'neutral',
          contrast: preset?.style.contrast || analysis?.style?.contrast || 'medium',
          saturation: preset?.style.saturation || analysis?.style?.saturation || 'natural',
          grain: preset?.style.grain || analysis?.style?.grain || 'subtle',
        },
        promptModifiers: preset?.promptModifiers || analysis?.prompt_modifiers || [],
        negativeModifiers: preset?.negativePromptModifiers || analysis?.negative_modifiers || [],
        referenceImageUrl: referenceImage || undefined,
      };

      // Save to style_packs table
      const { data: existing } = await supabase
        .from('style_packs')
        .select('id')
        .eq('project_id', projectId)
        .maybeSingle();

      const payload: any = {
        project_id: projectId,
        description: styleDescription || `${preset?.name || 'Custom'} style`,
        aspect_ratio: analysis?.composition?.aspect_ratio_suggestion || '16:9',
        fps: 24,
        lens_style: preset?.camera.lens || analysis?.camera?.recommended_lens || null,
        grain_level: styleConfig.style.grain,
        visual_preset: selectedPreset,
        style_config: JSON.parse(JSON.stringify(styleConfig)),
      };

      if (existing) {
        await supabase.from('style_packs').update(payload).eq('id', existing.id);
      } else {
        await supabase.from('style_packs').insert(payload);
      }

      // Update project bible score
      await supabase.from('projects')
        .update({ bible_completeness_score: 30 })
        .eq('id', projectId)
        .lt('bible_completeness_score', 30);

      toast.success('Estilo visual configurado');
      setStep('complete');
      onComplete?.(styleConfig);

    } catch (err) {
      console.error('Error saving style:', err);
      toast.error('Error al guardar el estilo');
    } finally {
      setIsSaving(false);
    }
  };

  const clearReference = () => {
    setReferenceImage(null);
    setCustomAnalysis(null);
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[300px] gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <span className="text-muted-foreground">Cargando estilo visual...</span>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-6">
      {/* Existing style banner */}
      {hasExistingStyle && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/30">
          <Check className="w-4 h-4 text-green-500" />
          <span className="text-sm text-green-700 dark:text-green-300">
            Tienes un estilo visual configurado. Puedes modificarlo si lo deseas.
          </span>
        </div>
      )}

      {/* Header */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm">
          <Sparkles className="w-4 h-4" />
          {hasExistingStyle ? 'Editar Estilo Visual' : 'Paso 1: Define tu Estilo Visual'}
        </div>
        <h2 className="text-2xl font-bold">Biblia Visual</h2>
        <p className="text-muted-foreground max-w-xl mx-auto">
          Elige un preset cinematográfico o sube una imagen de referencia. 
          El sistema configurará automáticamente cámara, lente y parámetros.
        </p>
      </div>

      {/* Reference Image Upload */}
      <Card className="border-2 border-dashed border-primary/30 bg-primary/5">
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row items-center gap-4">
            {referenceImage ? (
              <div className="relative w-32 h-32 rounded-lg overflow-hidden bg-muted">
                <img 
                  src={referenceImage} 
                  alt="Reference" 
                  className="w-full h-full object-cover"
                />
                <Button
                  variant="destructive"
                  size="icon"
                  className="absolute top-1 right-1 w-6 h-6"
                  onClick={clearReference}
                >
                  <X className="w-3 h-3" />
                </Button>
                {isAnalyzing && (
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                    <Loader2 className="w-6 h-6 animate-spin text-white" />
                  </div>
                )}
              </div>
            ) : (
              <div className="w-32 h-32 rounded-lg border-2 border-dashed border-muted-foreground/30 flex items-center justify-center">
                <ImageIcon className="w-8 h-8 text-muted-foreground/50" />
              </div>
            )}
            
            <div className="flex-1 text-center sm:text-left">
              <h3 className="font-semibold">Imagen de Referencia (Opcional)</h3>
              <p className="text-sm text-muted-foreground mb-3">
                Sube una imagen y el sistema extraerá automáticamente el estilo visual
              </p>
              <Label htmlFor="reference-upload" className="cursor-pointer">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
                  <Upload className="w-4 h-4" />
                  {referenceImage ? 'Cambiar imagen' : 'Subir imagen'}
                </div>
                <Input
                  id="reference-upload"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleImageUpload}
                  disabled={isAnalyzing}
                />
              </Label>
            </div>

            {customAnalysis && (
              <div className="text-center sm:text-right">
                <Badge variant="pass" className="mb-1">
                  <Check className="w-3 h-3 mr-1" />
                  Analizado
                </Badge>
                <p className="text-xs text-muted-foreground">
                  {customAnalysis.preset_match 
                    ? `Detectado: ${VISUAL_PRESETS[customAnalysis.preset_match]?.name}`
                    : 'Estilo personalizado'}
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Preset Grid with Tabs */}
      <Tabs defaultValue="live-action" className="w-full">
        <TabsList className="grid w-full grid-cols-2 mb-4">
          <TabsTrigger value="live-action" className="flex items-center gap-2">
            <Film className="w-4 h-4" />
            Live-Action
          </TabsTrigger>
          <TabsTrigger value="animation" className="flex items-center gap-2">
            <Sparkles className="w-4 h-4" />
            Animación
          </TabsTrigger>
        </TabsList>

        <TabsContent value="live-action">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {getPresetsByCategory('live-action').map((preset) => (
              <button
                key={preset.id}
                onClick={() => handlePresetSelect(preset.id)}
                className={cn(
                  "relative p-4 rounded-xl border-2 transition-all text-left group",
                  selectedPreset === preset.id
                    ? "border-primary bg-primary/10 ring-2 ring-primary/30"
                    : "border-border hover:border-primary/50 hover:bg-muted/50"
                )}
              >
                <div className="text-2xl mb-2">{preset.icon}</div>
                <h4 className="font-semibold text-sm">{preset.name}</h4>
                <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                  {preset.description}
                </p>
                <div className="mt-2 pt-2 border-t border-border/50">
                  <p className="text-[10px] text-muted-foreground/70 flex items-center gap-1">
                    <span className="opacity-70">📽</span>
                    {preset.examples.slice(0, 2).join(', ')}
                  </p>
                </div>
                {selectedPreset === preset.id && (
                  <div className="absolute top-2 right-2">
                    <Check className="w-4 h-4 text-primary" />
                  </div>
                )}
              </button>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="animation">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {getPresetsByCategory('animation').map((preset) => (
              <button
                key={preset.id}
                onClick={() => handlePresetSelect(preset.id)}
                className={cn(
                  "relative p-4 rounded-xl border-2 transition-all text-left group",
                  selectedPreset === preset.id
                    ? "border-primary bg-primary/10 ring-2 ring-primary/30"
                    : "border-border hover:border-primary/50 hover:bg-muted/50"
                )}
              >
                <div className="text-2xl mb-2">{preset.icon}</div>
                <h4 className="font-semibold text-sm">{preset.name}</h4>
                <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                  {preset.description}
                </p>
                <div className="mt-2 pt-2 border-t border-border/50">
                  <p className="text-[10px] text-muted-foreground/70 flex items-center gap-1">
                    <span className="opacity-70">📽</span>
                    {preset.examples.slice(0, 2).join(', ')}
                  </p>
                </div>
                {selectedPreset === preset.id && (
                  <div className="absolute top-2 right-2">
                    <Check className="w-4 h-4 text-primary" />
                  </div>
                )}
              </button>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {/* Technical Details Preview */}
      {(selectedPreset || customAnalysis) && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Film className="w-4 h-4" />
              Configuración Técnica
            </CardTitle>
            <CardDescription>
              Estos valores se aplicarán automáticamente a todas las generaciones
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Camera */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 rounded-lg bg-muted/50">
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                  <Camera className="w-3 h-3" />
                  Cámara
                </div>
                <p className="text-sm font-medium">
                  {currentConfig?.camera?.body || currentConfig?.camera?.recommended_body || 'Auto'}
                </p>
              </div>
              <div className="p-3 rounded-lg bg-muted/50">
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                  <Aperture className="w-3 h-3" />
                  Lente
                </div>
                <p className="text-sm font-medium">
                  {currentConfig?.camera?.lens || currentConfig?.camera?.recommended_lens || 'Auto'}
                </p>
              </div>
              <div className="p-3 rounded-lg bg-muted/50">
                <div className="text-xs text-muted-foreground mb-1">Focal</div>
                <p className="text-sm font-medium">
                  {currentConfig?.camera?.focalLength || currentConfig?.camera?.focal_length || 'Auto'}
                </p>
              </div>
              <div className="p-3 rounded-lg bg-muted/50">
                <div className="text-xs text-muted-foreground mb-1">Apertura</div>
                <p className="text-sm font-medium">
                  {currentConfig?.camera?.aperture || 'Auto'}
                </p>
              </div>
            </div>

            {/* Color Palette */}
            {(currentConfig?.style?.colorPalette || currentConfig?.style?.color_palette) && (
              <div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                  <Palette className="w-3 h-3" />
                  Paleta de Color
                </div>
                <div className="flex gap-2">
                  {(currentConfig?.style?.colorPalette || currentConfig?.style?.color_palette || []).map((color: string, i: number) => (
                    <div
                      key={i}
                      className="w-8 h-8 rounded-lg border border-border"
                      style={{ backgroundColor: color }}
                      title={color}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Style Description */}
            <div className="space-y-2">
              <Label>Notas adicionales (opcional)</Label>
              <Textarea
                value={styleDescription}
                onChange={(e) => setStyleDescription(e.target.value)}
                placeholder="Añade detalles específicos sobre el look que buscas..."
                rows={2}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Action Button */}
      {step !== 'complete' ? (
        <div className="flex justify-center">
          <Button
            size="lg"
            variant="gold"
            onClick={handleSave}
            disabled={(!selectedPreset && !customAnalysis) || isSaving}
            className="min-w-[200px]"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Guardando...
              </>
            ) : (
              <>
                <Check className="w-4 h-4 mr-2" />
                Confirmar Estilo Visual
              </>
            )}
          </Button>
        </div>
      ) : (
        <NextStepNavigator
          projectId={projectId}
          currentStep="style"
          completionMessage="¡Estilo visual configurado!"
          stats={selectedPreset ? VISUAL_PRESETS[selectedPreset]?.name : 'Estilo personalizado'}
        />
      )}
    </div>
  );
}
