import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { MapPin, Sparkles, Settings2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { generateRun, updateRunStatus, GenerateRunPayload } from '@/lib/generateRun';
import SetCanonModal from './SetCanonModal';
import { useRecommendations } from '@/hooks/useRecommendations';
import { useEditorialKnowledgeBase } from '@/hooks/useEditorialKnowledgeBase';
import { ProjectRecommendationsBar } from './ProjectRecommendationsBar';
import { PresetSelector } from './PresetSelector';
import { GenerationActionBar, GenerationPreview, type GenerationStatus } from '@/components/generation';
import { ENGINES } from '@/lib/recommendations';

type ViewType = 'establishing' | 'keyarea' | 'detail';

interface ViewPreset {
  type: ViewType;
  label: string;
  promptTemplate: string;
}

const VIEW_PRESETS: ViewPreset[] = [
  {
    type: 'establishing',
    label: 'Vista General',
    promptTemplate: 'Wide establishing shot, full location view, architectural details, atmospheric perspective, cinematic composition, natural lighting'
  },
  {
    type: 'keyarea',
    label: 'Área Principal',
    promptTemplate: 'Medium shot, main action area, clear spatial layout, functional zones visible, balanced composition, ambient lighting'
  },
  {
    type: 'detail',
    label: 'Detalle',
    promptTemplate: 'Close-up detail shot, iconic element, texture and material focus, shallow depth of field, dramatic lighting'
  }
];

const AVAILABLE_PRESETS = VIEW_PRESETS.map(p => p.type);

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
  const [status, setStatus] = useState<GenerationStatus>('idle');
  const [selectedType, setSelectedType] = useState<ViewType>('establishing');
  const [selectedEngine, setSelectedEngine] = useState<string>(ENGINES.FLUX);
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
    assetType: 'location',
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
    assetType: 'location',
    availablePresets: AVAILABLE_PRESETS,
    phase: 'production',
    styleBias
  });

  // Log recommendation shown
  useEffect(() => {
    if (recommendation && !recsLoading) {
      logShown();
    }
  }, [recommendation, recsLoading, logShown]);

  // Apply recommended preset if high confidence on first load
  useEffect(() => {
    if (recommendation && recommendation.confidence === 'high' && status === 'idle') {
      const preset = VIEW_PRESETS.find(p => p.type === recommendation.recommendedPreset);
      if (preset) {
        setSelectedType(preset.type);
        setSelectedEngine(recommendation.recommendedEngine);
      }
    }
  }, [recommendation?.recommendedPreset, recommendation?.recommendedEngine, recommendation?.confidence, status]);

  const buildPrompt = (preset: ViewPreset) => {
    const locationDesc = [
      location.name,
      location.description || ''
    ].filter(Boolean).join('. ');
    return `${preset.promptTemplate}. Location: ${locationDesc}`;
  };

  const handleApplyRecommended = () => {
    if (recommendation) {
      const preset = VIEW_PRESETS.find(p => p.type === recommendation.recommendedPreset);
      if (preset) {
        setSelectedType(preset.type);
        setSelectedEngine(recommendation.recommendedEngine);
        toast.success('Configuración recomendada aplicada');
      }
    }
  };

  const handleGenerate = async (parentRunId?: string) => {
    setStatus('generating');
    const preset = VIEW_PRESETS.find(p => p.type === selectedType)!;

    // Check if user is overriding recommendation
    const isUserOverride = checkOverride(selectedEngine, selectedType);
    
    if (isUserOverride) {
      await logOverride(selectedEngine, selectedType);
    } else if (recommendation && recommendation.confidence !== 'low') {
      await logFollowed(selectedEngine, selectedType);
    }

    try {
      const payload: GenerateRunPayload = {
        projectId,
        type: 'location',
        phase: 'production',
        engine: selectedEngine,
        engineSelectedBy: isUserOverride ? 'user' : 'recommendation',
        engineReason: isUserOverride 
          ? 'User override of recommendation' 
          : `Recommendation: ${recommendation?.reason || 'default'}`,
        prompt: buildPrompt(preset),
        context: `Location generation: ${preset.label}`,
        params: {
          locationId: location.id,
          viewType: selectedType
        },
        parentRunId,
        presetId: selectedType,
        userOverride: isUserOverride
      };

      const result = await generateRun(payload);

      if (!result.ok) {
        setStatus('error');
        toast.error(result.error || 'Error al generar');
        return;
      }

      // Update location with new run ID
      await supabase
        .from('locations')
        .update({ current_run_id: result.runId })
        .eq('id', location.id);

      setCurrentOutput({ url: result.outputUrl!, runId: result.runId! });
      setStatus('generated');
      setIsAccepted(false);
      toast.success('Vista generada');
      refreshRecs();
      onUpdate();
    } catch (err) {
      console.error('[LocationGeneration] error:', err);
      setStatus('error');
      toast.error('Error al generar');
    }
  };

  const handleAccept = async () => {
    if (!currentOutput?.runId) return;

    const success = await updateRunStatus(currentOutput.runId, 'accepted');
    if (success) {
      await supabase
        .from('locations')
        .update({ accepted_run_id: currentOutput.runId })
        .eq('id', location.id);

      setIsAccepted(true);
      setStatus('accepted');
      toast.success('Aceptado. Esta será la vista oficial.');
      onUpdate();
    } else {
      toast.error('Error al aceptar');
    }
  };

  const handleRegenerate = async () => {
    const parentId = currentOutput?.runId || location.accepted_run_id || location.current_run_id;
    await handleGenerate(parentId || undefined);
  };

  const handleCanonSaved = async (canonAssetId: string) => {
    await supabase
      .from('locations')
      .update({ canon_asset_id: canonAssetId })
      .eq('id', location.id);

    setShowCanonModal(false);
    toast.success('Fijado como referencia oficial ⭐');
    onUpdate();
  };

  const isCanon = !!location.canon_asset_id;
  const isPro = userLevel === 'pro';

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <MapPin className="w-4 h-4" />
          Generar Localización
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

        {/* Normal mode: simplified - 3 view options only */}
        {!isPro && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Tipo de vista
            </p>
            <div className="flex gap-2 flex-wrap">
              {VIEW_PRESETS.map((preset) => (
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
                <ProjectRecommendationsBar
                  recommendation={recommendation}
                  loading={recsLoading}
                  onApply={handleApplyRecommended}
                  showEngineSelector={true}
                />

                {/* Preset Selector */}
                <PresetSelector
                  presets={VIEW_PRESETS.map(p => ({ type: p.type, label: p.label, icon: null }))}
                  selectedPreset={selectedType}
                  onSelect={(preset) => setSelectedType(preset as ViewType)}
                  orderedPresets={orderedPresets}
                  disabled={status === 'generating'}
                />

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
          altText={`${location.name} view`}
          status={status}
          isAccepted={isAccepted}
          isCanon={isCanon}
          aspectRatio="video"
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
          composedPrompt={currentOutput ? buildPrompt(VIEW_PRESETS.find(p => p.type === selectedType)!) : undefined}
          mode={userLevel}
          showCanonButton={true}
          viewTypeLabel={VIEW_PRESETS.find(p => p.type === selectedType)?.label}
        />

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
