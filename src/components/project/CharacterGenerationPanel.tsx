import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Check, RotateCcw, Star, User, SidebarClose, Maximize } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { generateRun, updateRunStatus, GenerateRunPayload } from '@/lib/generateRun';
import SetCanonModal from './SetCanonModal';
import { EditorialAssistantPanel } from '@/components/editorial/EditorialAssistantPanel';

type PortraitType = 'frontal' | 'profile' | 'fullbody';

interface PortraitPreset {
  type: PortraitType;
  label: string;
  icon: React.ReactNode;
  promptTemplate: string;
}

const PORTRAIT_PRESETS: PortraitPreset[] = [
  {
    type: 'frontal',
    label: 'Retrato Frontal',
    icon: <User className="w-4 h-4" />,
    promptTemplate: 'Portrait photograph, head and shoulders, facing camera directly, neutral expression, soft studio lighting, clean background'
  },
  {
    type: 'profile',
    label: 'Perfil Lateral',
    icon: <SidebarClose className="w-4 h-4" />,
    promptTemplate: 'Side profile portrait, 90-degree angle, head and shoulders, looking left, soft rim lighting, clean background'
  },
  {
    type: 'fullbody',
    label: 'Cuerpo Entero',
    icon: <Maximize className="w-4 h-4" />,
    promptTemplate: 'Full body portrait, standing pose, facing camera, full length view from head to feet, correct human proportions, studio lighting, clean background'
  }
];

interface CharacterGenerationPanelProps {
  character: {
    id: string;
    name: string;
    bio: string | null;
    role: string | null;
    current_run_id?: string | null;
    accepted_run_id?: string | null;
    canon_asset_id?: string | null;
  };
  projectId: string;
  onUpdate: () => void;
}

export function CharacterGenerationPanel({ character, projectId, onUpdate }: CharacterGenerationPanelProps) {
  const [generating, setGenerating] = useState(false);
  const [selectedType, setSelectedType] = useState<PortraitType>('frontal');
  const [currentOutput, setCurrentOutput] = useState<{ url: string; runId: string } | null>(null);
  const [runStatus, setRunStatus] = useState<'generated' | 'accepted' | null>(null);
  const [showCanonModal, setShowCanonModal] = useState(false);
  const [promptPatch, setPromptPatch] = useState<string | null>(null);

  const buildPrompt = (preset: PortraitPreset) => {
    const characterDesc = [
      character.name,
      character.bio || '',
      character.role ? `Role: ${character.role}` : ''
    ].filter(Boolean).join('. ');

    // Apply editorial assistant patch if present
    const basePrompt = `${preset.promptTemplate}. Character: ${characterDesc}`;
    return promptPatch ? `${basePrompt}\n\n${promptPatch}` : basePrompt;
  };

  const handleGenerate = async (parentRunId?: string) => {
    setGenerating(true);
    const preset = PORTRAIT_PRESETS.find(p => p.type === selectedType)!;

    try {
      const payload: GenerateRunPayload = {
        projectId,
        type: 'character',
        phase: 'production',
        engine: 'flux-1.1-pro-ultra', // Production engine for characters
        engineSelectedBy: 'auto',
        engineReason: 'Production character generation uses FLUX for consistency',
        prompt: buildPrompt(preset),
        context: `Character portrait generation: ${preset.label}`,
        params: {
          characterId: character.id,
          portraitType: selectedType
        },
        parentRunId,
        presetId: selectedType
      };

      const result = await generateRun(payload);

      if (!result.ok) {
        toast.error(result.error || 'Error al generar retrato');
        return;
      }

      // Update character with new run ID
      await supabase
        .from('characters')
        .update({ current_run_id: result.runId })
        .eq('id', character.id);

      setCurrentOutput({ url: result.outputUrl!, runId: result.runId! });
      setRunStatus('generated');
      toast.success(`Retrato generado (Run: ${result.runId?.slice(0, 8)})`);
      onUpdate();
    } catch (err) {
      console.error('[CharacterGeneration] error:', err);
      toast.error('Error al generar retrato');
    } finally {
      setGenerating(false);
    }
  };

  const handleAccept = async () => {
    if (!currentOutput?.runId) return;

    const success = await updateRunStatus(currentOutput.runId, 'accepted');
    if (success) {
      // Update character with accepted run
      await supabase
        .from('characters')
        .update({ accepted_run_id: currentOutput.runId })
        .eq('id', character.id);

      setRunStatus('accepted');
      toast.success('Retrato aceptado');
      onUpdate();
    } else {
      toast.error('Error al aceptar retrato');
    }
  };

  const handleRegenerate = async () => {
    const parentId = currentOutput?.runId || character.accepted_run_id || character.current_run_id;
    await handleGenerate(parentId || undefined);
  };

  const handleCanonSaved = async (canonAssetId: string) => {
    // Update character with canon reference
    await supabase
      .from('characters')
      .update({ canon_asset_id: canonAssetId })
      .eq('id', character.id);

    setShowCanonModal(false);
    toast.success('Personaje marcado como Canon');
    onUpdate();
  };

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <User className="w-4 h-4" />
          Generación Unificada
          {character.canon_asset_id && (
            <Badge variant="default" className="bg-amber-500">
              <Star className="w-3 h-3 mr-1" />
              Canon
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Portrait Type Selector */}
        <div className="flex gap-2">
          {PORTRAIT_PRESETS.map(preset => (
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
            'Generar Retrato'
          )}
        </Button>

        {/* Output Preview */}
        {currentOutput && (
          <div className="space-y-3">
            <div className="relative aspect-square rounded-lg overflow-hidden bg-muted">
              <img 
                src={currentOutput.url} 
                alt={`${character.name} portrait`}
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
            assetType="character"
            currentRunId={currentOutput.runId}
            phase="production"
            presetId={selectedType}
            onApplyPromptPatch={(patch) => {
              setPromptPatch(patch);
              toast.success('Patch de canon aplicado al prompt');
            }}
            onSwitchPreset={(presetId) => {
              setSelectedType(presetId as PortraitType);
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
            defaultAssetType="character"
            defaultName={character.name}
            onSaved={handleCanonSaved}
          />
        )}
      </CardContent>
    </Card>
  );
}
