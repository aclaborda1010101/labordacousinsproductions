import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { User, Sparkles, Settings2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { updateRunStatus } from '@/lib/generateRun';
import { runImageEngine, ImageEnginePayload } from '@/lib/engines/image';
import SetCanonModal from './SetCanonModal';
import { useRecommendations } from '@/hooks/useRecommendations';
import { useAutopilot } from '@/hooks/useAutopilot';
import { useEditorialKnowledgeBase } from '@/hooks/useEditorialKnowledgeBase';
import { ProjectRecommendationsBar } from './ProjectRecommendationsBar';
import { PresetSelector } from './PresetSelector';
import { GenerationActionBar, GenerationPreview, type GenerationStatus } from '@/components/generation';
import { ENGINES } from '@/lib/recommendations';

type PortraitType = 'frontal' | 'profile' | 'fullbody';

interface PortraitPreset {
  type: PortraitType;
  label: string;
  promptTemplate: string;
}

const PORTRAIT_PRESETS: PortraitPreset[] = [
  {
    type: 'frontal',
    label: 'Retrato Frontal',
    promptTemplate: 'Portrait photograph, head and shoulders, facing camera directly, neutral expression, soft studio lighting, clean background'
  },
  {
    type: 'profile',
    label: 'Perfil Lateral',
    promptTemplate: 'Side profile portrait, 90-degree angle, head and shoulders, looking left, soft rim lighting, clean background'
  },
  {
    type: 'fullbody',
    label: 'Cuerpo Entero',
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
  const [status, setStatus] = useState<GenerationStatus>('idle');
  const [selectedType, setSelectedType] = useState<PortraitType>('frontal');
  const [selectedEngine, setSelectedEngine] = useState<string>(ENGINES.NANO_BANANA);
  const [currentOutput, setCurrentOutput] = useState<{ url: string; runId: string } | null>(null);
  const [isAccepted, setIsAccepted] = useState(false);
  const [showCanonModal, setShowCanonModal] = useState(false);

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
    if (autopilotDecision?.shouldAutopilot && autopilotDecision.recommendation && status === 'idle') {
      const preset = PORTRAIT_PRESETS.find(p => p.type === autopilotDecision.recommendation!.recommendedPreset);
      if (preset) {
        setSelectedType(preset.type);
        setSelectedEngine(autopilotDecision.recommendation.recommendedEngine);
      }
    } else if (recommendation && recommendation.confidence === 'high' && status === 'idle') {
      const preset = PORTRAIT_PRESETS.find(p => p.type === recommendation.recommendedPreset);
      if (preset) {
        setSelectedType(preset.type);
        setSelectedEngine(recommendation.recommendedEngine);
      }
    }
  }, [autopilotDecision?.shouldAutopilot, autopilotDecision?.recommendation, recommendation?.recommendedPreset, recommendation?.recommendedEngine, recommendation?.confidence, status]);

  const buildPrompt = (preset: PortraitPreset) => {
    const characterDesc = [
      character.name,
      character.bio || '',
      character.role ? `Role: ${character.role}` : ''
    ].filter(Boolean).join('. ');
    return `${preset.promptTemplate}. Character: ${characterDesc}`;
  };

  const handleApplyRecommended = () => {
    if (recommendation) {
      const preset = PORTRAIT_PRESETS.find(p => p.type === recommendation.recommendedPreset);
      if (preset) {
        setSelectedType(preset.type);
        setSelectedEngine(recommendation.recommendedEngine);
        toast.success('Configuración recomendada aplicada');
      }
    }
  };

  const handleGenerate = async (parentRunId?: string) => {
    setStatus('generating');
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
        setStatus('error');
        toast.error(result.error || 'Error al generar');
        return;
      }

      // Update character with new run ID
      await supabase
        .from('characters')
        .update({ current_run_id: result.runId })
        .eq('id', character.id);

      setCurrentOutput({ url: result.outputUrl!, runId: result.runId! });
      setStatus('generated');
      setIsAccepted(false);
      toast.success('Imagen generada');
      refreshRecs();
      onUpdate();
    } catch (err) {
      console.error('[CharacterGeneration] error:', err);
      setStatus('error');
      toast.error('Error al generar');
    }
  };

  const handleAccept = async () => {
    if (!currentOutput?.runId) return;

    const success = await updateRunStatus(currentOutput.runId, 'accepted');
    if (success) {
      await supabase
        .from('characters')
        .update({ accepted_run_id: currentOutput.runId })
        .eq('id', character.id);

      setIsAccepted(true);
      setStatus('accepted');
      toast.success('Aceptado. Este será el resultado oficial.');
      onUpdate();
    } else {
      toast.error('Error al aceptar');
    }
  };

  const handleRegenerate = async () => {
    const parentId = currentOutput?.runId || character.accepted_run_id || character.current_run_id;
    await handleGenerate(parentId || undefined);
  };

  const handleCanonSaved = async (canonAssetId: string) => {
    await supabase
      .from('characters')
      .update({ canon_asset_id: canonAssetId })
      .eq('id', character.id);

    setShowCanonModal(false);
    toast.success('Fijado como referencia oficial ⭐');
    onUpdate();
  };

  const isCanon = !!character.canon_asset_id;
  const isPro = userLevel === 'pro';

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <User className="w-4 h-4" />
          Generar Personaje
          {isCanon && (
            <Badge className="bg-amber-500 text-xs">⭐ Referencia</Badge>
          )}
          {isPro && (
            <Badge variant="outline" className="ml-auto text-xs">Pro</Badge>
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

        {/* Normal mode: simplified view type selector */}
        {!isPro && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Tipo de plano
            </p>
            <div className="flex gap-2 flex-wrap">
              {PORTRAIT_PRESETS.map((preset) => (
                <button
                  key={preset.type}
                  onClick={() => setSelectedType(preset.type)}
                  disabled={status === 'generating'}
                  className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                    selectedType === preset.type
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted hover:bg-muted/80 text-muted-foreground'
                  } disabled:opacity-50`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Pro mode: Advanced controls in accordion */}
        {isPro && (
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="advanced" className="border-none">
              <AccordionTrigger className="py-2 text-xs text-muted-foreground hover:no-underline">
                <div className="flex items-center gap-2">
                  <Settings2 className="h-3 w-3" />
                  Opciones avanzadas
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-3 pt-2">
                {/* Recommendations Bar */}
                {visibility.showRecommendations && (
                  <ProjectRecommendationsBar
                    recommendation={recommendation}
                    loading={recsLoading || autopilotLoading}
                    onApply={handleApplyRecommended}
                    showEngineSelector={visibility.showEngineSelector}
                    autopilotDecision={autopilotDecision}
                  />
                )}

                {/* Preset Selector */}
                {visibility.showPresetSelector && (
                  <PresetSelector
                    presets={PORTRAIT_PRESETS.map(p => ({ type: p.type, label: p.label, icon: null }))}
                    selectedPreset={selectedType}
                    onSelect={(preset) => setSelectedType(preset as PortraitType)}
                    orderedPresets={orderedPresets}
                    disabled={status === 'generating'}
                  />
                )}

                {/* Style suggestions */}
                {styleDecision?.suggestions && styleDecision.suggestions.length > 0 && (
                  <div className="text-xs text-muted-foreground space-y-1">
                    {styleDecision.suggestions.map((s, i) => (
                      <p key={i} className="flex items-start gap-1">
                        <Sparkles className="h-3 w-3 mt-0.5 text-amber-500 shrink-0" />
                        {s}
                      </p>
                    ))}
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        )}

        {/* Preview */}
        <GenerationPreview
          imageUrl={currentOutput?.url || null}
          altText={`${character.name} portrait`}
          status={status}
          isAccepted={isAccepted}
          isCanon={isCanon}
          aspectRatio="square"
        />

        {/* Unified Action Bar */}
        <GenerationActionBar
          status={status}
          hasOutput={!!currentOutput}
          isAccepted={isAccepted}
          isCanon={isCanon}
          onGenerate={() => handleGenerate()}
          onAccept={handleAccept}
          onRegenerate={handleRegenerate}
          onSetCanon={() => setShowCanonModal(true)}
          runId={currentOutput?.runId}
          composedPrompt={currentOutput ? buildPrompt(PORTRAIT_PRESETS.find(p => p.type === selectedType)!) : undefined}
          mode={userLevel}
          showCanonButton={visibility.showCanonButton}
          viewTypeLabel={PORTRAIT_PRESETS.find(p => p.type === selectedType)?.label}
        />

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
