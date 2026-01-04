import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Check, RotateCcw, Star, User, SidebarClose, Maximize, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { updateRunStatus } from '@/lib/generateRun';
import { runImageEngine, ImageEnginePayload } from '@/lib/engines/image';
import SetCanonModal from './SetCanonModal';
import { EditorialAssistantPanel } from '@/components/editorial/EditorialAssistantPanel';
import { useRecommendations } from '@/hooks/useRecommendations';
import { useAutopilot } from '@/hooks/useAutopilot';
import { useEditorialKnowledgeBase } from '@/hooks/useEditorialKnowledgeBase';
import { ProjectRecommendationsBar } from './ProjectRecommendationsBar';
import { PresetSelector } from './PresetSelector';
import { AdaptiveGenerationPanel } from './AdaptiveGenerationPanel';
import { ENGINES } from '@/lib/recommendations';

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

const AVAILABLE_PRESETS = PORTRAIT_PRESETS.map(p => p.type);

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
  const [selectedEngine, setSelectedEngine] = useState<string>(ENGINES.NANO_BANANA);
  const [currentOutput, setCurrentOutput] = useState<{ url: string; runId: string } | null>(null);
  const [runStatus, setRunStatus] = useState<'generated' | 'accepted' | null>(null);
  const [showCanonModal, setShowCanonModal] = useState(false);
  const [promptPatch, setPromptPatch] = useState<string | null>(null);

  // Editorial Knowledge Base v1
  const {
    userLevel,
    visibility,
    styleDecision,
    getStyleName,
    getFormatName,
  } = useEditorialKnowledgeBase({
    projectId,
    assetType: 'character',
  });

  // Compute style bias for recommendations
  const styleBias = useMemo(() => ({
    presetBias: styleDecision?.presetBias,
    engineBias: styleDecision?.engineBias,
  }), [styleDecision?.presetBias, styleDecision?.engineBias]);

  // Recommendations v1 with style bias
  const { 
    recommendation, 
    orderedPresets,
    loading: recsLoading, 
    checkOverride, 
    logShown, 
    logOverride,
    logFollowed,
    refresh: refreshRecs
  } = useRecommendations({ 
    projectId, 
    assetType: 'character',
    availablePresets: AVAILABLE_PRESETS,
    phase: 'production',
    styleBias
  });

  // Autopilot v1
  const {
    decision: autopilotDecision,
    loading: autopilotLoading,
    logShown: logAutopilotShown,
    logFollowed: logAutopilotFollowed,
    logOverridden: logAutopilotOverridden
  } = useAutopilot({
    projectId,
    assetType: 'character',
    availablePresets: AVAILABLE_PRESETS,
    phase: 'production'
  });

  // Log recommendation/autopilot shown
  useEffect(() => {
    if (recommendation && !recsLoading && !autopilotLoading) {
      if (autopilotDecision?.shouldAutopilot) {
        logAutopilotShown();
      } else {
        logShown();
      }
    }
  }, [recommendation, recsLoading, autopilotLoading, autopilotDecision?.shouldAutopilot, logShown, logAutopilotShown]);

  // Apply autopilot or recommended preset on first load
  useEffect(() => {
    if (autopilotDecision?.shouldAutopilot && autopilotDecision.recommendation && !generating) {
      const preset = PORTRAIT_PRESETS.find(p => p.type === autopilotDecision.recommendation!.recommendedPreset);
      if (preset) {
        setSelectedType(preset.type);
        setSelectedEngine(autopilotDecision.recommendation.recommendedEngine);
      }
    } else if (recommendation && recommendation.confidence === 'high' && !generating) {
      const preset = PORTRAIT_PRESETS.find(p => p.type === recommendation.recommendedPreset);
      if (preset) {
        setSelectedType(preset.type);
        setSelectedEngine(recommendation.recommendedEngine);
      }
    }
  }, [autopilotDecision?.shouldAutopilot, autopilotDecision?.recommendation, recommendation?.recommendedPreset, recommendation?.recommendedEngine, recommendation?.confidence]);


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

  const handleApplyRecommended = () => {
    if (recommendation) {
      const preset = PORTRAIT_PRESETS.find(p => p.type === recommendation.recommendedPreset);
      if (preset) {
        setSelectedType(preset.type);
        setSelectedEngine(recommendation.recommendedEngine);
        toast.success('Recomendación aplicada');
      }
    }
  };

  const handleGenerate = async (parentRunId?: string) => {
    setGenerating(true);
    const preset = PORTRAIT_PRESETS.find(p => p.type === selectedType)!;

    // Check if user is overriding recommendation/autopilot
    const isUserOverride = checkOverride(selectedEngine, selectedType);
    const isAutopilotActive = autopilotDecision?.shouldAutopilot ?? false;
    
    // Log appropriate event
    if (isAutopilotActive) {
      if (isUserOverride) {
        await logAutopilotOverridden(selectedEngine, selectedType);
      } else {
        await logAutopilotFollowed(selectedEngine, selectedType);
      }
    } else {
      if (isUserOverride) {
        await logOverride(selectedEngine, selectedType);
      } else if (recommendation && recommendation.confidence !== 'low') {
        await logFollowed(selectedEngine, selectedType);
      }
    }

    try {
      const payload: ImageEnginePayload = {
        projectId,
        type: 'character',
        phase: 'production',
        engine: selectedEngine as 'nano-banana' | 'flux-1.1-pro-ultra',
        engineSelectedBy: isAutopilotActive && !isUserOverride ? 'autopilot' : (isUserOverride ? 'user' : 'recommendation'),
        engineReason: isAutopilotActive 
          ? `Autopilot: ${autopilotDecision?.reason || 'default'}`
          : (isUserOverride 
            ? 'User override of recommendation' 
            : `Recommendation: ${recommendation?.reason || 'default'}`),
        prompt: buildPrompt(preset),
        context: `Character portrait generation: ${preset.label}`,
        params: {
          characterId: character.id,
          portraitType: selectedType
        },
        parentRunId,
        presetId: selectedType,
        userOverride: isUserOverride,
        autopilotUsed: isAutopilotActive && !isUserOverride,
        autopilotConfidence: autopilotDecision?.confidence
      };

      const result = await runImageEngine(payload);

      if (!result.ok) {
        toast.error(result.error || 'Error al generar retrato');
        return;
      }

      // Show auto-retry feedback
      if (result.autoRetried) {
        toast.info('He reintentado automáticamente 1 vez por un error técnico. Si persiste, cambia preset o engine.');
      }

      // Update character with new run ID
      await supabase
        .from('characters')
        .update({ current_run_id: result.runId })
        .eq('id', character.id);

      setCurrentOutput({ url: result.outputUrl!, runId: result.runId! });
      setRunStatus('generated');
      toast.success(`Retrato generado (Run: ${result.runId?.slice(0, 8)})`);
      refreshRecs();
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

  // Explorer mode: use AdaptiveGenerationPanel
  if (userLevel === 'explorer') {
    return (
      <Card className="border-primary/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <User className="w-4 h-4" />
            Generar Personaje
            {character.canon_asset_id && (
              <Badge variant="default" className="bg-amber-500">
                <Star className="w-3 h-3 mr-1" />
                Canon
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Style context */}
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="gap-1">
              <Sparkles className="h-3 w-3" />
              {getStyleName()}
            </Badge>
            <Badge variant="secondary">{getFormatName()}</Badge>
          </div>

          {/* Simple generate button */}
          <Button 
            onClick={() => handleGenerate()}
            disabled={generating}
            className="w-full"
            variant="gold"
            size="lg"
          >
            {generating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Generando...
              </>
            ) : (
              <>
                <User className="w-4 h-4 mr-2" />
                Generar con estilo {getStyleName()}
              </>
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

              {/* Simple action buttons */}
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
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  // Creator/Pro mode: full interface
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
          <Badge variant="outline" className="ml-auto text-xs">
            {userLevel === 'pro' ? '🎬 Pro' : '✨ Creador'}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Style context */}
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className="gap-1">
            <Sparkles className="h-3 w-3" />
            {getStyleName()}
          </Badge>
          <Badge variant="secondary">{getFormatName()}</Badge>
        </div>

        {/* Recommendations Bar with Autopilot (hidden for explorer) */}
        {visibility.showRecommendations && (
          <ProjectRecommendationsBar
            recommendation={recommendation}
            loading={recsLoading || autopilotLoading}
            onApply={handleApplyRecommended}
            showEngineSelector={visibility.showEngineSelector}
            autopilotDecision={autopilotDecision}
          />
        )}

        {/* Portrait Type Selector (visible for creator/pro) */}
        {visibility.showPresetSelector && (
          <PresetSelector
            presets={PORTRAIT_PRESETS}
            selectedPreset={selectedType}
            onSelect={(preset) => setSelectedType(preset as PortraitType)}
            orderedPresets={orderedPresets}
            disabled={generating}
          />
        )}

        {/* Style suggestions */}
        {styleDecision?.suggestions && styleDecision.suggestions.length > 0 && userLevel === 'pro' && (
          <div className="text-xs text-muted-foreground space-y-1">
            {styleDecision.suggestions.map((s, i) => (
              <p key={i} className="flex items-start gap-1">
                <Sparkles className="h-3 w-3 mt-0.5 text-amber-500 shrink-0" />
                {s}
              </p>
            ))}
          </div>
        )}

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
              {runStatus === 'accepted' && visibility.showCanonButton && (
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
