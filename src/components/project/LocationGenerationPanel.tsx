import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Check, RotateCcw, Star, MapPin, Maximize, Grid3X3, Focus } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { generateRun, updateRunStatus, GenerateRunPayload } from '@/lib/generateRun';
import SetCanonModal from './SetCanonModal';
import { EditorialAssistantPanel } from '@/components/editorial/EditorialAssistantPanel';

type ViewType = 'establishing' | 'keyarea' | 'detail';

interface ViewPreset {
  type: ViewType;
  label: string;
  icon: React.ReactNode;
  promptTemplate: string;
}

const VIEW_PRESETS: ViewPreset[] = [
  {
    type: 'establishing',
    label: 'Establishing',
    icon: <Maximize className="w-4 h-4" />,
    promptTemplate: 'Wide establishing shot, full location view, architectural details, atmospheric perspective, cinematic composition, natural lighting'
  },
  {
    type: 'keyarea',
    label: 'Key Area',
    icon: <Grid3X3 className="w-4 h-4" />,
    promptTemplate: 'Medium shot, main action area, clear spatial layout, functional zones visible, balanced composition, ambient lighting'
  },
  {
    type: 'detail',
    label: 'Detail',
    icon: <Focus className="w-4 h-4" />,
    promptTemplate: 'Close-up detail shot, iconic element, texture and material focus, shallow depth of field, dramatic lighting'
  }
];

interface LocationGenerationPanelProps {
  location: {
    id: string;
    name: string;
    description: string | null;
    current_run_id?: string | null;
    accepted_run_id?: string | null;
    canon_asset_id?: string | null;
  };
  projectId: string;
  onUpdate: () => void;
}

export function LocationGenerationPanel({ location, projectId, onUpdate }: LocationGenerationPanelProps) {
  const [generating, setGenerating] = useState(false);
  const [selectedType, setSelectedType] = useState<ViewType>('establishing');
  const [currentOutput, setCurrentOutput] = useState<{ url: string; runId: string } | null>(null);
  const [runStatus, setRunStatus] = useState<'generated' | 'accepted' | null>(null);
  const [showCanonModal, setShowCanonModal] = useState(false);
  const [promptPatch, setPromptPatch] = useState<string | null>(null);

  const buildPrompt = (preset: ViewPreset) => {
    const locationDesc = [
      location.name,
      location.description || ''
    ].filter(Boolean).join('. ');

    // Apply editorial assistant patch if present
    const basePrompt = `${preset.promptTemplate}. Location: ${locationDesc}`;
    return promptPatch ? `${basePrompt}\n\n${promptPatch}` : basePrompt;
  };

  const handleGenerate = async (parentRunId?: string) => {
    setGenerating(true);
    const preset = VIEW_PRESETS.find(p => p.type === selectedType)!;

    try {
      const payload: GenerateRunPayload = {
        projectId,
        type: 'location',
        phase: 'production',
        engine: 'flux-1.1-pro-ultra', // Production engine for locations
        engineSelectedBy: 'auto',
        engineReason: 'Production location generation uses FLUX for high-quality environments',
        prompt: buildPrompt(preset),
        context: `Location generation: ${preset.label}`,
        params: {
          locationId: location.id,
          viewType: selectedType
        },
        parentRunId,
        presetId: selectedType
      };

      const result = await generateRun(payload);

      if (!result.ok) {
        toast.error(result.error || 'Error al generar localización');
        return;
      }

      // Update location with new run ID
      await supabase
        .from('locations')
        .update({ current_run_id: result.runId })
        .eq('id', location.id);

      setCurrentOutput({ url: result.outputUrl!, runId: result.runId! });
      setRunStatus('generated');
      toast.success(`Vista generada (Run: ${result.runId?.slice(0, 8)})`);
      onUpdate();
    } catch (err) {
      console.error('[LocationGeneration] error:', err);
      toast.error('Error al generar localización');
    } finally {
      setGenerating(false);
    }
  };

  const handleAccept = async () => {
    if (!currentOutput?.runId) return;

    const success = await updateRunStatus(currentOutput.runId, 'accepted');
    if (success) {
      // Update location with accepted run
      await supabase
        .from('locations')
        .update({ accepted_run_id: currentOutput.runId })
        .eq('id', location.id);

      setRunStatus('accepted');
      toast.success('Vista aceptada');
      onUpdate();
    } else {
      toast.error('Error al aceptar vista');
    }
  };

  const handleRegenerate = async () => {
    const parentId = currentOutput?.runId || location.accepted_run_id || location.current_run_id;
    await handleGenerate(parentId || undefined);
  };

  const handleCanonSaved = async (canonAssetId: string) => {
    // Update location with canon reference
    await supabase
      .from('locations')
      .update({ canon_asset_id: canonAssetId })
      .eq('id', location.id);

    setShowCanonModal(false);
    toast.success('Localización marcada como Canon');
    onUpdate();
  };

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <MapPin className="w-4 h-4" />
          Generación Unificada
          {location.canon_asset_id && (
            <Badge variant="default" className="bg-amber-500">
              <Star className="w-3 h-3 mr-1" />
              Canon
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* View Type Selector */}
        <div className="flex gap-2">
          {VIEW_PRESETS.map(preset => (
            <Button
              key={preset.type}
              variant={selectedType === preset.type ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedType(preset.type)}
              disabled={generating}
            >
              {preset.icon}
              <span className="ml-2">{preset.label}</span>
            </Button>
          ))}
        </div>

        {/* Generate Button */}
        <Button 
          onClick={() => handleGenerate()}
          disabled={generating}
          className="w-full"
          variant="gold"
        >
          {generating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              Generando...
            </>
          ) : (
            'Generar Vista'
          )}
        </Button>

        {/* Output Preview */}
        {currentOutput && (
          <div className="space-y-3">
            <div className="relative aspect-video rounded-lg overflow-hidden bg-muted">
              <img 
                src={currentOutput.url} 
                alt={`${location.name} view`}
                className="w-full h-full object-cover"
              />
              {runStatus === 'accepted' && (
                <div className="absolute top-2 right-2">
                  <Badge className="bg-green-600">
                    <Check className="w-3 h-3 mr-1" />
                    Aceptado
                  </Badge>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleAccept}
                disabled={runStatus === 'accepted'}
                className="flex-1"
              >
                <Check className="w-4 h-4 mr-2 text-green-600" />
                Aceptar
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRegenerate}
                disabled={generating}
                className="flex-1"
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Regenerar
              </Button>
              {runStatus === 'accepted' && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowCanonModal(true)}
                  className="flex-1 border-amber-500 text-amber-600 hover:bg-amber-50"
                >
                  <Star className="w-4 h-4 mr-2" />
                  Set Canon
                </Button>
              )}
            </div>

            <p className="text-xs text-muted-foreground text-center">
              Run ID: {currentOutput.runId.slice(0, 8)}...
            </p>
          </div>
        )}

        {/* Editorial Assistant Panel */}
        {currentOutput && (
          <EditorialAssistantPanel
            projectId={projectId}
            assetType="location"
            currentRunId={currentOutput.runId}
            phase="production"
            presetId={selectedType}
            onApplyPromptPatch={(patch) => {
              setPromptPatch(patch);
              toast.success('Patch de canon aplicado al prompt');
            }}
            onSwitchPreset={(presetId) => {
              setSelectedType(presetId as ViewType);
              toast.success(`Preset cambiado a ${presetId}`);
            }}
            onOpenCanonModal={() => setShowCanonModal(true)}
          />
        )}

        {/* Canon Modal */}
        {showCanonModal && currentOutput && (
          <SetCanonModal
            open={showCanonModal}
            onOpenChange={setShowCanonModal}
            runId={currentOutput.runId}
            outputUrl={currentOutput.url}
            projectId={projectId}
            defaultAssetType="location"
            defaultName={location.name}
            onSaved={handleCanonSaved}
          />
        )}
      </CardContent>
    </Card>
  );
}
