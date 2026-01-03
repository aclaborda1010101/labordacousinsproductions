/**
 * Pantalla: Generador con Pipeline Editorial v0.2
 * - Selector de motor automático con razón visible
 * - Integración con engineSelector y editorialValidator
 */

import { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Sparkles, User, MapPin, BookOpen, Wand2, Info, Cpu } from 'lucide-react';
import { selectEngine, getEngineSelectionExplanation } from '@/lib/engineSelector';
import { ENGINE_CONFIGS, type Engine, type ProjectPhase } from '@/lib/editorialTypes';
import type { AssetCharacter, AssetLocation, ProjectBible, EditorialProjectPhase } from '@/lib/editorialMVPTypes';

interface GeneratorPanelProps {
  characters: AssetCharacter[];
  locations: AssetLocation[];
  bible: ProjectBible | null;
  phase: EditorialProjectPhase;
  onGenerate: (data: {
    intent: string;
    context: string;
    selectedAssetIds: string[];
    engine: string;
    engineSelection: ReturnType<typeof selectEngine>;
  }) => Promise<void>;
  isGenerating: boolean;
}

export function GeneratorPanel({
  characters,
  locations,
  bible,
  phase,
  onGenerate,
  isGenerating
}: GeneratorPanelProps) {
  const [intent, setIntent] = useState('');
  const [context, setContext] = useState('');
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const [userEngineOverride, setUserEngineOverride] = useState<Engine | null>(null);

  // Convertir fase del MVP a fase del selector
  const selectorPhase: ProjectPhase = phase === 'exploracion' ? 'exploration' : 'production';

  // Selección automática de motor
  const engineSelection = useMemo(
    () => selectEngine(intent, selectorPhase, userEngineOverride, context),
    [intent, selectorPhase, userEngineOverride, context]
  );

  const engineMeta = ENGINE_CONFIGS.find(e => e.id === engineSelection.engine);

  const toggleAsset = (id: string) => {
    setSelectedAssetIds(prev => 
      prev.includes(id) 
        ? prev.filter(i => i !== id)
        : [...prev, id]
    );
  };

  const handleGenerate = async () => {
    if (!intent.trim()) return;
    await onGenerate({
      intent: intent.trim(),
      context: context.trim(),
      selectedAssetIds,
      engine: engineSelection.engine,
      engineSelection
    });
  };

  const selectedCharacters = characters.filter(c => selectedAssetIds.includes(c.id));
  const selectedLocations = locations.filter(l => selectedAssetIds.includes(l.id));

  return (
    <div className="grid lg:grid-cols-3 gap-6">
      {/* Panel principal */}
      <div className="lg:col-span-2 space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wand2 className="h-5 w-5" />
              Generar
            </CardTitle>
            <CardDescription>
              Describe lo que quieres crear. El sistema seleccionará el motor óptimo y traducirá tu intención respetando las reglas editoriales.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="intent">¿Qué quieres generar?</Label>
              <Textarea
                id="intent"
                value={intent}
                onChange={(e) => setIntent(e.target.value)}
                placeholder="Ej: Retrato de Leonardo en el laboratorio, plano medio, luz fría, expresión concentrada..."
                rows={4}
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="context">Contexto narrativo (opcional)</Label>
              <Textarea
                id="context"
                value={context}
                onChange={(e) => setContext(e.target.value)}
                placeholder="Ej: Es de noche. Está nervioso. Acaba de descubrir una anomalía en los datos..."
                rows={2}
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Añade contexto de la historia para enriquecer la generación.
              </p>
            </div>

            {/* Selector de motor con explicación */}
            <div className="p-4 bg-muted/50 rounded-lg space-y-3">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2">
                  <Cpu className="h-4 w-4" />
                  Motor de generación
                </Label>
                <Select 
                  value={userEngineOverride ?? 'auto'} 
                  onValueChange={(v) => setUserEngineOverride(v === 'auto' ? null : v as Engine)}
                >
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Auto</SelectItem>
                    <SelectItem value="nano-banana">nano-banana</SelectItem>
                    <SelectItem value="flux">FLUX</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Badge de motor seleccionado */}
              <div className="flex items-center gap-3">
                <div className={`px-3 py-2 rounded-lg border ${
                  engineSelection.engine === 'flux' 
                    ? 'bg-purple-50 border-purple-200 dark:bg-purple-950/30 dark:border-purple-800' 
                    : 'bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800'
                }`}>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm">
                      {engineMeta?.name ?? engineSelection.engine}
                    </span>
                    <Badge variant="outline" className="text-xs">
                      {engineSelection.selectedBy === 'auto' ? 'Auto' : 'Manual'}
                    </Badge>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p>{engineSelection.reason}</p>
                          {engineSelection.alternativeEngine && (
                            <p className="mt-1 text-xs opacity-80">
                              Alternativa: {engineSelection.alternativeEngine} — {engineSelection.alternativeReason}
                            </p>
                          )}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {engineMeta?.notes}
                  </p>
                </div>

                {/* Confianza */}
                <div className="text-center">
                  <div className="text-lg font-bold">
                    {Math.round(engineSelection.confidence * 100)}%
                  </div>
                  <div className="text-xs text-muted-foreground">confianza</div>
                </div>
              </div>

              {/* Alternativa sugerida */}
              {engineSelection.alternativeEngine && (
                <p className="text-xs text-muted-foreground">
                  💡 Alternativa: <strong>{engineSelection.alternativeEngine}</strong> — {engineSelection.alternativeReason}
                </p>
              )}
            </div>

            <Separator />

            <Button 
              onClick={handleGenerate} 
              disabled={!intent.trim() || isGenerating}
              className="w-full"
              size="lg"
            >
              {isGenerating ? (
                <>
                  <Sparkles className="h-4 w-4 mr-2 animate-spin" />
                  Generando con {engineMeta?.name}...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Generar con {engineMeta?.name}
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Panel lateral: Assets y Bible */}
      <div className="space-y-4">
        {/* Selección de assets */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Assets a incluir</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[200px]">
              {characters.length === 0 && locations.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No hay assets definidos
                </p>
              ) : (
                <div className="space-y-2">
                  {characters.map(char => (
                    <label
                      key={char.id}
                      className="flex items-center gap-2 p-2 rounded hover:bg-muted cursor-pointer"
                    >
                      <Checkbox
                        checked={selectedAssetIds.includes(char.id)}
                        onCheckedChange={() => toggleAsset(char.id)}
                      />
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">{char.name}</span>
                    </label>
                  ))}
                  {locations.map(loc => (
                    <label
                      key={loc.id}
                      className="flex items-center gap-2 p-2 rounded hover:bg-muted cursor-pointer"
                    >
                      <Checkbox
                        checked={selectedAssetIds.includes(loc.id)}
                        onCheckedChange={() => toggleAsset(loc.id)}
                      />
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">{loc.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </ScrollArea>

            {(selectedCharacters.length > 0 || selectedLocations.length > 0) && (
              <div className="mt-3 pt-3 border-t">
                <p className="text-xs text-muted-foreground mb-2">Rasgos fijos incluidos:</p>
                <div className="flex flex-wrap gap-1">
                  {selectedCharacters.flatMap(c => c.fixedTraits).map((trait, i) => (
                    <Badge key={`c-${i}`} variant="secondary" className="text-xs">
                      {trait}
                    </Badge>
                  ))}
                  {selectedLocations.flatMap(l => l.fixedElements).map((elem, i) => (
                    <Badge key={`l-${i}`} variant="outline" className="text-xs">
                      {elem}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Bible del proyecto */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <BookOpen className="h-4 w-4" />
              Biblia del Proyecto
            </CardTitle>
          </CardHeader>
          <CardContent>
            {bible?.tone || bible?.period || bible?.rating ? (
              <div className="space-y-2 text-sm">
                {bible.tone && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tono:</span>
                    <span>{bible.tone}</span>
                  </div>
                )}
                {bible.period && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Época:</span>
                    <span>{bible.period}</span>
                  </div>
                )}
                {bible.rating && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Clasificación:</span>
                    <Badge variant="outline">{bible.rating}</Badge>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center">
                No hay parámetros definidos
              </p>
            )}
          </CardContent>
        </Card>

        {/* Indicador de fase */}
        <Card>
          <CardContent className="py-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Fase actual:</span>
              <Badge variant={phase === 'exploracion' ? 'secondary' : 'default'}>
                {phase === 'exploracion' ? 'Exploración' : 'Producción'}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {phase === 'exploracion' 
                ? 'Tolerancia alta. Reglas B como advertencia.'
                : 'Tolerancia baja. Reglas B más estrictas.'
              }
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
