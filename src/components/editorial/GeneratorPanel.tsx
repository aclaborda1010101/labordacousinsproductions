/**
 * GeneratorPanel v2.0 - Broadcast Quality
 * - Scene Master Protocol (global lighting/atmosphere)
 * - Pro Controls (Lens, Aperture, Shot Size, Angle, Movement)
 * - Seed freezing for keyframe consistency
 */

import { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { 
  Sparkles, User, MapPin, BookOpen, Wand2, Info, Cpu, 
  Camera, Aperture, Move, SunMedium, Frame, Hash, ChevronDown,
  Clapperboard, Video
} from 'lucide-react';
import { selectEngine, getEngineSelectionExplanation } from '@/lib/engineSelector';
import { ENGINE_CONFIGS, type Engine, type ProjectPhase } from '@/lib/editorialTypes';
import type { AssetCharacter, AssetLocation, ProjectBible, EditorialProjectPhase } from '@/lib/editorialMVPTypes';
import { SceneContextBar, DEFAULT_SCENE_MASTER, type SceneMaster } from './SceneContextBar';

// ============================================================================
// CINEMATOGRAPHY OPTIONS
// ============================================================================

const LENS_OPTIONS = [
  { value: '16mm', label: '16mm (Ultra Wide)', description: 'Perspectivas dramáticas' },
  { value: '24mm', label: '24mm (Wide)', description: 'Ambiental, ligera distorsión' },
  { value: '35mm', label: '35mm (Reportaje)', description: 'Natural, documental' },
  { value: '50mm', label: '50mm (Ojo Humano)', description: 'Sin distorsión' },
  { value: '85mm', label: '85mm (Retrato)', description: 'Compresión favorecedora' },
  { value: '135mm', label: '135mm (Teleobjetivo)', description: 'Compresión fuerte' },
  { value: '200mm', label: '200mm (Largo Tele)', description: 'Sujetos aislados' }
];

const APERTURE_OPTIONS = [
  { value: 'f/1.4', label: 'f/1.4', description: 'Bokeh extremo' },
  { value: 'f/1.8', label: 'f/1.8', description: 'Bokeh cremoso' },
  { value: 'f/2.8', label: 'f/2.8', description: 'Cine estándar' },
  { value: 'f/4', label: 'f/4', description: 'Más profundidad' },
  { value: 'f/5.6', label: 'f/5.6', description: 'Media' },
  { value: 'f/8', label: 'f/8', description: 'Todo nítido' }
];

const SHOT_SIZE_OPTIONS = [
  { value: 'EXTREME_CLOSE_UP', label: 'Primerísimo Plano', description: 'Solo ojos/detalles' },
  { value: 'CLOSE_UP', label: 'Primer Plano', description: 'Cara completa' },
  { value: 'MEDIUM_CLOSE_UP', label: 'Plano Medio Corto', description: 'Cabeza y hombros' },
  { value: 'MEDIUM', label: 'Plano Medio', description: 'Cintura arriba' },
  { value: 'COWBOY', label: 'Plano Americano', description: 'Medio muslo arriba' },
  { value: 'FULL', label: 'Plano Entero', description: 'Cuerpo completo' },
  { value: 'WIDE', label: 'Plano General', description: 'Personaje + entorno' },
  { value: 'EXTREME_WIDE', label: 'Gran Plano General', description: 'Paisaje dominante' }
];

const CAMERA_ANGLE_OPTIONS = [
  { value: 'EYE_LEVEL', label: 'Altura de Ojos', description: 'Neutral' },
  { value: 'LOW_ANGLE', label: 'Contrapicado', description: 'Poder' },
  { value: 'HIGH_ANGLE', label: 'Picado', description: 'Vulnerabilidad' },
  { value: 'DUTCH', label: 'Holandés', description: 'Tensión' },
  { value: 'OVERHEAD', label: 'Cenital', description: 'Vista de pájaro' },
  { value: 'WORMS_EYE', label: 'Nadir', description: 'Desde suelo' }
];

const CAMERA_MOVEMENT_OPTIONS = [
  { value: 'Static', label: 'Estático', description: 'Fijo, calma' },
  { value: 'Handheld', label: 'Cámara en Mano', description: 'Documental' },
  { value: 'Dolly In', label: 'Dolly In', description: 'Acercamiento' },
  { value: 'Dolly Out', label: 'Dolly Out', description: 'Alejamiento' },
  { value: 'Pan', label: 'Paneo', description: 'Horizontal' },
  { value: 'Tracking', label: 'Travelling', description: 'Seguimiento' },
  { value: 'Crane Up', label: 'Grúa Arriba', description: 'Elevación' },
  { value: 'Crane Down', label: 'Grúa Abajo', description: 'Descenso' },
  { value: 'Steadicam', label: 'Steadicam', description: 'Flotante' }
];

const LIGHTING_OPTIONS = [
  { value: 'Natural (Soft Window)', label: 'Natural (Ventana)', description: 'Suave' },
  { value: 'Cinematic (Rembrandt)', label: 'Rembrandt', description: 'Dramático' },
  { value: 'Studio (High Key)', label: 'High Key', description: 'Todo iluminado' },
  { value: 'Studio (Low Key)', label: 'Low Key', description: 'Sombras' },
  { value: 'Neon / Cyberpunk', label: 'Neón', description: 'Colores' },
  { value: 'Hard (Direct Sun)', label: 'Sol Directo', description: 'Dura' },
  { value: 'Golden Hour', label: 'Hora Dorada', description: 'Cálida' },
  { value: 'Blue Hour', label: 'Hora Azul', description: 'Fría' }
];

// ============================================================================
// TYPES
// ============================================================================

export interface ShotSpecs {
  size: string;
  angle: string;
  lens: string;
  aperture: string;
  movement: string;
  lighting: string;
}

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
    shotSpecs?: ShotSpecs;
    sceneMaster?: SceneMaster;
    seed?: number;
  }) => Promise<void>;
  isGenerating: boolean;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function GeneratorPanel({
  characters,
  locations,
  bible,
  phase,
  onGenerate,
  isGenerating
}: GeneratorPanelProps) {
  // Basic state
  const [intent, setIntent] = useState('');
  const [context, setContext] = useState('');
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const [userEngineOverride, setUserEngineOverride] = useState<Engine | null>(null);

  // Pro Controls state
  const [showProControls, setShowProControls] = useState(false);
  const [shotSpecs, setShotSpecs] = useState<ShotSpecs>({
    size: 'MEDIUM',
    angle: 'EYE_LEVEL',
    lens: '50mm',
    aperture: 'f/2.8',
    movement: 'Static',
    lighting: 'Natural (Soft Window)'
  });

  // Scene Master state
  const [sceneMaster, setSceneMaster] = useState<SceneMaster>(DEFAULT_SCENE_MASTER);
  const [isSceneLocked, setIsSceneLocked] = useState(false);

  // Seed state
  const [freezeSeed, setFreezeSeed] = useState(false);
  const [seedValue, setSeedValue] = useState<string>('');

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

  const updateShotSpec = <K extends keyof ShotSpecs>(key: K, value: string) => {
    setShotSpecs(prev => ({ ...prev, [key]: value }));
  };

  const handleGenerate = async () => {
    if (!intent.trim()) return;
    
    const seed = freezeSeed && seedValue ? parseInt(seedValue, 10) : undefined;
    
    await onGenerate({
      intent: intent.trim(),
      context: context.trim(),
      selectedAssetIds,
      engine: engineSelection.engine,
      engineSelection,
      shotSpecs: showProControls ? shotSpecs : undefined,
      sceneMaster: isSceneLocked ? sceneMaster : undefined,
      seed
    });
  };

  const selectedCharacters = characters.filter(c => selectedAssetIds.includes(c.id));
  const selectedLocations = locations.filter(l => selectedAssetIds.includes(l.id));

  return (
    <div className="space-y-4">
      {/* Scene Master (Global Variables) */}
      <SceneContextBar
        scene={sceneMaster}
        onSceneChange={setSceneMaster}
        isLocked={isSceneLocked}
        onLockChange={setIsSceneLocked}
      />

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Panel principal */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Wand2 className="h-5 w-5" />
                    Generar
                  </CardTitle>
                  <CardDescription>
                    Describe la acción. El sistema construirá el prompt técnico.
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={showProControls}
                    onCheckedChange={setShowProControls}
                    id="pro-controls"
                  />
                  <Label htmlFor="pro-controls" className="text-sm cursor-pointer">
                    <Clapperboard className="h-4 w-4 inline mr-1" />
                    Controles Pro
                  </Label>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Intent & Context */}
              <div>
                <Label htmlFor="intent">¿Qué quieres generar? (La Acción)</Label>
                <Textarea
                  id="intent"
                  value={intent}
                  onChange={(e) => setIntent(e.target.value)}
                  placeholder="Ej: Leonardo mirando al horizonte con expresión melancólica..."
                  rows={3}
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="context">Contexto narrativo (opcional)</Label>
                <Textarea
                  id="context"
                  value={context}
                  onChange={(e) => setContext(e.target.value)}
                  placeholder="Ej: Acaba de recibir malas noticias sobre su experimento..."
                  rows={2}
                  className="mt-1"
                />
              </div>

              {/* PRO CONTROLS */}
              {showProControls && (
                <Collapsible defaultOpen>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" className="w-full justify-between p-2 h-auto">
                      <span className="flex items-center gap-2 text-sm font-medium">
                        <Camera className="h-4 w-4" />
                        Especificaciones de Cámara
                      </span>
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 p-3 bg-muted/50 rounded-lg mt-2">
                      {/* Lens */}
                      <div>
                        <Label className="text-xs flex items-center gap-1">
                          <Camera className="h-3 w-3" />
                          Lente
                        </Label>
                        <Select
                          value={shotSpecs.lens}
                          onValueChange={(v) => updateShotSpec('lens', v)}
                        >
                          <SelectTrigger className="h-8 text-xs mt-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {LENS_OPTIONS.map(opt => (
                              <SelectItem key={opt.value} value={opt.value}>
                                <div className="flex flex-col">
                                  <span>{opt.label}</span>
                                  <span className="text-xs text-muted-foreground">{opt.description}</span>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Aperture */}
                      <div>
                        <Label className="text-xs flex items-center gap-1">
                          <Aperture className="h-3 w-3" />
                          Apertura
                        </Label>
                        <Select
                          value={shotSpecs.aperture}
                          onValueChange={(v) => updateShotSpec('aperture', v)}
                        >
                          <SelectTrigger className="h-8 text-xs mt-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {APERTURE_OPTIONS.map(opt => (
                              <SelectItem key={opt.value} value={opt.value}>
                                {opt.label} - {opt.description}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Shot Size */}
                      <div>
                        <Label className="text-xs flex items-center gap-1">
                          <Frame className="h-3 w-3" />
                          Encuadre
                        </Label>
                        <Select
                          value={shotSpecs.size}
                          onValueChange={(v) => updateShotSpec('size', v)}
                        >
                          <SelectTrigger className="h-8 text-xs mt-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {SHOT_SIZE_OPTIONS.map(opt => (
                              <SelectItem key={opt.value} value={opt.value}>
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Camera Angle */}
                      <div>
                        <Label className="text-xs flex items-center gap-1">
                          <Move className="h-3 w-3" />
                          Ángulo
                        </Label>
                        <Select
                          value={shotSpecs.angle}
                          onValueChange={(v) => updateShotSpec('angle', v)}
                        >
                          <SelectTrigger className="h-8 text-xs mt-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {CAMERA_ANGLE_OPTIONS.map(opt => (
                              <SelectItem key={opt.value} value={opt.value}>
                                {opt.label} - {opt.description}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Camera Movement */}
                      <div>
                        <Label className="text-xs flex items-center gap-1">
                          <Video className="h-3 w-3" />
                          Movimiento
                        </Label>
                        <Select
                          value={shotSpecs.movement}
                          onValueChange={(v) => updateShotSpec('movement', v)}
                        >
                          <SelectTrigger className="h-8 text-xs mt-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {CAMERA_MOVEMENT_OPTIONS.map(opt => (
                              <SelectItem key={opt.value} value={opt.value}>
                                {opt.label} - {opt.description}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Lighting (legacy, overrides Scene Master if not locked) */}
                      <div>
                        <Label className="text-xs flex items-center gap-1">
                          <SunMedium className="h-3 w-3" />
                          Iluminación
                          {isSceneLocked && (
                            <Badge variant="outline" className="text-[10px] ml-1">Escena</Badge>
                          )}
                        </Label>
                        <Select
                          value={shotSpecs.lighting}
                          onValueChange={(v) => updateShotSpec('lighting', v)}
                          disabled={isSceneLocked}
                        >
                          <SelectTrigger className="h-8 text-xs mt-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {LIGHTING_OPTIONS.map(opt => (
                              <SelectItem key={opt.value} value={opt.value}>
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {/* Seed Control */}
                    <div className="flex items-center gap-4 mt-3 p-3 bg-muted/30 rounded-lg">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="freeze-seed"
                          checked={freezeSeed}
                          onCheckedChange={(checked) => setFreezeSeed(checked === true)}
                        />
                        <Label htmlFor="freeze-seed" className="text-sm cursor-pointer flex items-center gap-1">
                          <Hash className="h-3 w-3" />
                          Congelar Semilla (Seed)
                        </Label>
                      </div>
                      {freezeSeed && (
                        <Input
                          type="number"
                          value={seedValue}
                          onChange={(e) => setSeedValue(e.target.value)}
                          placeholder="Ej: 42"
                          className="w-28 h-8 text-sm"
                        />
                      )}
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger>
                            <Info className="h-4 w-4 text-muted-foreground" />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="max-w-xs text-xs">
                              Usa la misma semilla para mantener el "ruido" idéntico entre keyframes.
                              Útil para el flujo "Keyframe Sandwich".
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              )}

              {/* Engine Selector */}
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

                {/* Engine Badge */}
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
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {engineMeta?.notes}
                    </p>
                  </div>

                  <div className="text-center">
                    <div className="text-lg font-bold">
                      {Math.round(engineSelection.confidence * 100)}%
                    </div>
                    <div className="text-xs text-muted-foreground">confianza</div>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Generate Button */}
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

              {/* Prompt Preview (Pro) */}
              {showProControls && intent.trim() && (
                <div className="p-3 bg-muted/30 rounded-lg">
                  <Label className="text-xs text-muted-foreground">Vista previa del prompt técnico:</Label>
                  <p className="text-xs mt-1 font-mono break-all">
                    Raw photo, 8k uhd, {sceneMaster.film_stock}, {sceneMaster.lens_character}. 
                    {selectedCharacters.map(c => c.name).join(', ')} {intent} 
                    {selectedLocations.map(l => `in ${l.name}`).join(', ')}. 
                    Shot on {shotSpecs.lens}, {shotSpecs.aperture}, {shotSpecs.size}, {shotSpecs.angle}, 
                    {isSceneLocked ? `${sceneMaster.lighting_source}` : shotSpecs.lighting}
                    {shotSpecs.movement !== 'Static' ? `, ${shotSpecs.movement}` : ''}.
                    {freezeSeed && seedValue ? ` --seed ${seedValue}` : ''}
                  </p>
                </div>
              )}
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
    </div>
  );
}
