/**
 * SceneCoverageGenerator - Multi-Angle Production Coverage
 * 
 * Uses the generate-angle-variants edge function with Hollywood coverage patterns
 * to generate complete scene coverage from a single approved keyframe.
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Loader2,
  Camera,
  Layers,
  Wand2,
  Check,
  Edit2,
  Film,
} from 'lucide-react';
import { 
  COVERAGE_PATTERNS, 
  CoveragePattern, 
  CoverageShot,
  mapCoverageToAngleRequests 
} from '@/lib/coveragePatterns';

interface CoverageVariant {
  id: string;
  shotType: string;
  shotName: string;
  shotSize: string;
  requestedAngle: string;
  description: string;
  purpose: string;
  duration: number;
  selected: boolean;
  editing: boolean;
  editedDescription?: string;
}

interface SceneCoverageGeneratorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  referenceKeyframe: {
    id: string;
    image_url: string;
    shot_id: string;
  };
  sceneId: string;
  sceneSlugline: string;
  sceneType?: string;
  characters: Array<{ id: string; name: string; token?: string }>;
  location?: { id: string; name: string; token?: string };
  projectId: string;
  projectStyle?: {
    visualStyle?: string;
    animationType?: string;
  };
  onCoverageGenerated?: (keyframeIds: string[]) => void;
}

export default function SceneCoverageGenerator({
  open,
  onOpenChange,
  referenceKeyframe,
  sceneId,
  sceneSlugline,
  sceneType = 'dialogue',
  characters,
  location,
  projectId,
  projectStyle,
  onCoverageGenerated,
}: SceneCoverageGeneratorProps) {
  const [selectedPattern, setSelectedPattern] = useState<string>('dialogue_2_characters');
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [variants, setVariants] = useState<CoverageVariant[]>([]);
  const [step, setStep] = useState<'select' | 'preview' | 'generating'>('select');

  // Get available patterns
  const patternOptions = Object.entries(COVERAGE_PATTERNS).map(([id, pattern]) => ({
    id,
    name: pattern.name,
    description: pattern.description,
    shotCount: pattern.shots.length,
  }));

  // Auto-detect pattern based on scene type and characters
  const detectBestPattern = (): string => {
    const charCount = characters.length;
    
    if (sceneType?.toLowerCase().includes('action') || sceneType?.toLowerCase().includes('chase')) {
      return 'action_sequence';
    }
    if (sceneType?.toLowerCase().includes('suspense') || sceneType?.toLowerCase().includes('horror')) {
      return 'suspense';
    }
    if (sceneType?.toLowerCase().includes('emotion') || sceneType?.toLowerCase().includes('intimate')) {
      return 'emotional_intimate';
    }
    if (sceneType?.toLowerCase().includes('establish')) {
      return 'establishing';
    }
    if (charCount >= 3) {
      return 'dialogue_group';
    }
    return 'dialogue_2_characters';
  };

  // Generate angle descriptions using the edge function
  const handleGenerateVariants = async () => {
    setLoading(true);
    try {
      const pattern = COVERAGE_PATTERNS[selectedPattern];
      if (!pattern) throw new Error('Pattern not found');

      // Map coverage shots to angle requests
      const angleRequests = mapCoverageToAngleRequests(pattern);

      const response = await supabase.functions.invoke('generate-angle-variants', {
        body: {
          referenceImageUrl: referenceKeyframe.image_url,
          entityType: 'scene',
          entityName: sceneSlugline,
          description: `Scene coverage for ${sceneSlugline}. Characters: ${characters.map(c => c.name).join(', ')}. Location: ${location?.name || 'Unknown'}.`,
          projectStyle,
          presetType: 'scene_coverage',
          customAngles: angleRequests.map(a => a.promptHints),
          coveragePattern: selectedPattern,
          projectId,
        },
      });

      if (response.error) throw new Error(response.error.message);

      // Map response to variants
      const generatedVariants: CoverageVariant[] = pattern.shots.map((shot, index) => {
        const variant = response.data.variants?.[index];
        return {
          id: `coverage_${index}`,
          shotType: shot.type,
          shotName: shot.name,
          shotSize: shot.shotSize,
          requestedAngle: shot.promptHints,
          description: variant?.description || shot.promptHints,
          purpose: shot.purpose,
          duration: shot.duration,
          selected: true,
          editing: false,
        };
      });

      setVariants(generatedVariants);
      setStep('preview');
      toast.success(`${generatedVariants.length} ángulos de cobertura generados`);
    } catch (error) {
      console.error('Error generating coverage variants:', error);
      toast.error('Error al generar variantes de cobertura');
    } finally {
      setLoading(false);
    }
  };

  // Toggle variant selection
  const toggleVariant = (id: string) => {
    setVariants(prev =>
      prev.map(v => (v.id === id ? { ...v, selected: !v.selected } : v))
    );
  };

  // Toggle editing mode
  const toggleEditing = (id: string) => {
    setVariants(prev =>
      prev.map(v => (v.id === id ? { ...v, editing: !v.editing } : v))
    );
  };

  // Update description
  const updateDescription = (id: string, newDescription: string) => {
    setVariants(prev =>
      prev.map(v => (v.id === id ? { ...v, editedDescription: newDescription } : v))
    );
  };

  // Generate keyframes for selected variants
  const handleGenerateKeyframes = async () => {
    const selectedVariants = variants.filter(v => v.selected);
    if (selectedVariants.length === 0) {
      toast.error('Selecciona al menos un ángulo');
      return;
    }

    setGenerating(true);
    setStep('generating');
    const generatedIds: string[] = [];

    try {
      // Get shots for this scene to assign keyframes
      const { data: sceneShots } = await supabase
        .from('shots')
        .select('id, shot_no, shot_type')
        .eq('scene_id', sceneId)
        .order('shot_no');

      for (let i = 0; i < selectedVariants.length; i++) {
        const variant = selectedVariants[i];
        const description = variant.editedDescription || variant.description;

        toast.info(`Generando ${i + 1}/${selectedVariants.length}: ${variant.shotName}...`);

        // Find matching shot or create new one
        let shotId = referenceKeyframe.shot_id;
        const matchingShot = sceneShots?.find(s => 
          s.shot_type?.toLowerCase().includes(variant.shotType.toLowerCase())
        );
        
        if (matchingShot) {
          shotId = matchingShot.id;
        }

        // Generate keyframe using generate-keyframe function
        const { data, error } = await supabase.functions.invoke('generate-keyframe', {
          body: {
            shotId,
            projectId,
            prompt: description,
            frameType: 'initial',
            timestampSec: 0,
            referenceImageUrl: referenceKeyframe.image_url,
            characters: characters.map(c => ({
              name: c.name,
              token: c.token,
            })),
            location: location ? {
              name: location.name,
              token: location.token,
            } : undefined,
            coverageShot: {
              type: variant.shotType,
              name: variant.shotName,
              size: variant.shotSize,
              purpose: variant.purpose,
            },
          },
        });

        if (error) {
          console.error(`Error generating keyframe for ${variant.shotName}:`, error);
          continue;
        }

        if (data?.keyframeId) {
          generatedIds.push(data.keyframeId);
        }

        // Small delay between generations
        await new Promise(r => setTimeout(r, 500));
      }

      toast.success(`${generatedIds.length} keyframes de cobertura generados`);
      onCoverageGenerated?.(generatedIds);
      onOpenChange(false);
    } catch (error) {
      console.error('Error generating coverage keyframes:', error);
      toast.error('Error al generar keyframes de cobertura');
    } finally {
      setGenerating(false);
    }
  };

  // Select all / none
  const selectAll = () => setVariants(prev => prev.map(v => ({ ...v, selected: true })));
  const selectNone = () => setVariants(prev => prev.map(v => ({ ...v, selected: false })));

  const selectedCount = variants.filter(v => v.selected).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-primary" />
            Generar Cobertura de Escena
          </DialogTitle>
          <DialogDescription>
            Genera automáticamente keyframes para todos los ángulos de cobertura cinematográfica
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden">
          {step === 'select' && (
            <div className="space-y-4">
              {/* Reference image preview */}
              <div className="flex gap-4">
                <div className="w-40 aspect-video rounded-lg overflow-hidden border">
                  <img
                    src={referenceKeyframe.image_url}
                    alt="Reference"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="flex-1 space-y-2">
                  <p className="text-sm font-medium">{sceneSlugline}</p>
                  <p className="text-xs text-muted-foreground">
                    {characters.length} personajes • {location?.name || 'Sin localización'}
                  </p>
                  <Badge variant="outline" className="text-xs">
                    Auto-detectado: {detectBestPattern()}
                  </Badge>
                </div>
              </div>

              {/* Pattern selector */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Patrón de Cobertura</label>
                <Select value={selectedPattern} onValueChange={setSelectedPattern}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {patternOptions.map(option => (
                      <SelectItem key={option.id} value={option.id}>
                        <div className="flex items-center gap-2">
                          <Film className="w-4 h-4" />
                          <span>{option.name}</span>
                          <Badge variant="secondary" className="text-xs ml-2">
                            {option.shotCount} shots
                          </Badge>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {COVERAGE_PATTERNS[selectedPattern]?.description}
                </p>
              </div>

              {/* Pattern shots preview */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Shots incluidos:</label>
                <div className="grid grid-cols-2 gap-2">
                  {COVERAGE_PATTERNS[selectedPattern]?.shots.map((shot, i) => (
                    <div key={i} className="p-2 bg-muted/30 rounded text-xs flex items-center gap-2">
                      <Camera className="w-3 h-3 text-primary" />
                      <span className="font-medium">{shot.name}</span>
                      <span className="text-muted-foreground">({shot.duration}s)</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 'preview' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  {selectedCount} de {variants.length} seleccionados
                </span>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={selectAll}>
                    Todos
                  </Button>
                  <Button variant="ghost" size="sm" onClick={selectNone}>
                    Ninguno
                  </Button>
                </div>
              </div>

              <ScrollArea className="h-[350px]">
                <div className="space-y-2 pr-4">
                  {variants.map(variant => (
                    <div
                      key={variant.id}
                      className={`p-3 rounded-lg border transition-all ${
                        variant.selected
                          ? 'border-primary bg-primary/5'
                          : 'border-border bg-muted/20'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <Checkbox
                          checked={variant.selected}
                          onCheckedChange={() => toggleVariant(variant.id)}
                        />
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="outline" className="text-xs">
                              <Camera className="w-3 h-3 mr-1" />
                              {variant.shotName}
                            </Badge>
                            <Badge variant="secondary" className="text-xs">
                              {variant.shotSize}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {variant.duration}s
                            </span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 ml-auto"
                              onClick={() => toggleEditing(variant.id)}
                            >
                              <Edit2 className="w-3 h-3" />
                            </Button>
                          </div>
                          
                          <p className="text-xs text-muted-foreground">
                            {variant.purpose}
                          </p>

                          {variant.editing ? (
                            <Textarea
                              value={variant.editedDescription || variant.description}
                              onChange={e => updateDescription(variant.id, e.target.value)}
                              className="text-xs mt-2"
                              rows={3}
                            />
                          ) : (
                            <p className="text-sm">
                              {(variant.editedDescription || variant.description).slice(0, 150)}...
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}

          {step === 'generating' && (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <Loader2 className="w-12 h-12 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">
                Generando keyframes de cobertura...
              </p>
              <p className="text-xs text-muted-foreground">
                {selectedCount} ángulos en proceso
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          {step === 'select' && (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button onClick={handleGenerateVariants} disabled={loading}>
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Wand2 className="w-4 h-4 mr-2" />
                )}
                Generar Descripciones
              </Button>
            </>
          )}

          {step === 'preview' && (
            <>
              <Button variant="outline" onClick={() => setStep('select')}>
                Volver
              </Button>
              <Button
                onClick={handleGenerateKeyframes}
                disabled={generating || selectedCount === 0}
              >
                {generating ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Check className="w-4 h-4 mr-2" />
                )}
                Generar {selectedCount} Keyframes
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
