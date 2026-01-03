/**
 * Página Principal: Sistema Editorial MVP
 */

import { useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, User, BookOpen, Shield, Wand2, Compass, Factory } from 'lucide-react';
import { useEditorialMVP } from '@/hooks/useEditorialMVP';
import { AssetsManager } from '@/components/editorial/AssetsManager';
import { BibleEditor } from '@/components/editorial/BibleEditor';
import { EditorialRulesManager } from '@/components/editorial/EditorialRulesManager';
import { GeneratorPanel } from '@/components/editorial/GeneratorPanel';
import { GenerationResult } from '@/components/editorial/GenerationResult';
import { buildRulePlan, composePrompt, validatePrompt
 } from '@/lib/editorialPipeline';
import type { GenerationRun, ValidationResult, GenerationContext } from '@/lib/editorialMVPTypes';

export default function EditorialWorkspace() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('assets');
  const [isGenerating, setIsGenerating] = useState(false);
  const [lastRun, setLastRun] = useState<GenerationRun | null>(null);
  const [lastValidation, setLastValidation] = useState<ValidationResult | null>(null);

  const {
    currentProject,
    characters,
    locations,
    bible,
    rules,
    ruleOverrides,
    isLoading,
    createCharacter,
    updateCharacter,
    deleteCharacter,
    createLocation,
    updateLocation,
    deleteLocation,
    updateBible,
    toggleRule,
    updateProjectPhase,
    saveGenerationRun,
    logTelemetry
  } = useEditorialMVP(projectId);

  const handleGenerate = useCallback(async (data: {
    intent: string;
    context: string;
    selectedAssetIds: string[];
    engine: string;
  }) => {
    if (!currentProject) return;
    setIsGenerating(true);

    try {
      // 1. Build rule plan
      const rulePlan = buildRulePlan(rules, ruleOverrides, currentProject.phase);

      // 2. Build context
      const context: GenerationContext = {
        project: currentProject,
        bible: bible || undefined,
        characters,
        locations,
        selectedAssetIds: data.selectedAssetIds,
        intent: data.intent,
        narrativeContext: data.context
      };

      // 3. Compose prompt
      const composed = composePrompt(context, rules, rulePlan);

      // 4. Validate
      const validation = validatePrompt(composed, rules, rulePlan, bible || undefined);
      setLastValidation(validation);

      // 5. Create run (sin llamar motor real en MVP)
      const run: Omit<GenerationRun, 'id' | 'createdAt'> = {
        projectId: currentProject.id,
        engine: data.engine,
        inputIntent: data.intent,
        context: data.context,
        usedAssetIds: data.selectedAssetIds,
        composedPrompt: composed.mainPrompt,
        negativePrompt: composed.negativePrompt,
        outputUrl: undefined, // Motor no conectado en MVP
        verdict: validation.verdict,
        triggeredRules: validation.triggeredRules,
        warnings: validation.warnings,
        suggestions: validation.suggestions,
        rulePlan
      };

      const runId = await saveGenerationRun(run);
      
      setLastRun({
        ...run,
        id: runId,
        createdAt: new Date().toISOString()
      });

      setActiveTab('result');
    } finally {
      setIsGenerating(false);
    }
  }, [currentProject, rules, ruleOverrides, bible, characters, locations, saveGenerationRun]);

  const handleAccept = async () => {
    if (lastRun) {
      await logTelemetry(lastRun.id, 'accept', { verdict: lastRun.verdict });
      setLastRun(null);
      setLastValidation(null);
      setActiveTab('generate');
    }
  };

  const handleRegenerate = async () => {
    if (lastRun) {
      await logTelemetry(lastRun.id, 'regenerate', {});
      setActiveTab('generate');
    }
  };

  const handleEdit = async () => {
    if (lastRun) {
      await logTelemetry(lastRun.id, 'edit', {});
      setActiveTab('generate');
    }
  };

  if (isLoading || !currentProject) {
    return (
      <div className="container py-8">
        <p className="text-muted-foreground">Cargando proyecto...</p>
      </div>
    );
  }

  return (
    <div className="container py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/editorial')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{currentProject.name}</h1>
            <div className="flex items-center gap-2 mt-1">
              <Badge 
                variant={currentProject.phase === 'exploracion' ? 'secondary' : 'default'}
                className="cursor-pointer"
                onClick={() => updateProjectPhase(
                  currentProject.phase === 'exploracion' ? 'produccion' : 'exploracion'
                )}
              >
                {currentProject.phase === 'exploracion' ? (
                  <><Compass className="h-3 w-3 mr-1" /> Exploración</>
                ) : (
                  <><Factory className="h-3 w-3 mr-1" /> Producción</>
                )}
              </Badge>
              <span className="text-xs text-muted-foreground">
                (clic para cambiar fase)
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="assets" className="flex items-center gap-2">
            <User className="h-4 w-4" /> Assets
          </TabsTrigger>
          <TabsTrigger value="bible" className="flex items-center gap-2">
            <BookOpen className="h-4 w-4" /> Biblia
          </TabsTrigger>
          <TabsTrigger value="rules" className="flex items-center gap-2">
            <Shield className="h-4 w-4" /> Reglas
          </TabsTrigger>
          <TabsTrigger value="generate" className="flex items-center gap-2">
            <Wand2 className="h-4 w-4" /> Generar
          </TabsTrigger>
          <TabsTrigger value="result" disabled={!lastRun}>
            Resultado {lastRun && '●'}
          </TabsTrigger>
        </TabsList>

        <div className="mt-6">
          <TabsContent value="assets">
            <AssetsManager
              characters={characters}
              locations={locations}
              onCreateCharacter={createCharacter}
              onUpdateCharacter={updateCharacter}
              onDeleteCharacter={deleteCharacter}
              onCreateLocation={createLocation}
              onUpdateLocation={updateLocation}
              onDeleteLocation={deleteLocation}
            />
          </TabsContent>

          <TabsContent value="bible">
            <BibleEditor bible={bible} onUpdate={updateBible} />
          </TabsContent>

          <TabsContent value="rules">
            <EditorialRulesManager
              rules={rules}
              overrides={ruleOverrides}
              phase={currentProject.phase}
              onToggleRule={toggleRule}
            />
          </TabsContent>

          <TabsContent value="generate">
            <GeneratorPanel
              characters={characters}
              locations={locations}
              bible={bible}
              phase={currentProject.phase}
              onGenerate={handleGenerate}
              isGenerating={isGenerating}
            />
          </TabsContent>

          <TabsContent value="result">
            {lastRun && lastValidation && (
              <GenerationResult
                run={lastRun}
                validation={lastValidation}
                onAccept={handleAccept}
                onRegenerate={handleRegenerate}
                onEdit={handleEdit}
                onDismiss={() => {
                  setLastRun(null);
                  setActiveTab('generate');
                }}
              />
            )}
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
