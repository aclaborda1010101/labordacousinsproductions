/**
 * Scene Context Bar - Master Scene Protocol
 * Defines global variables that MUST remain locked across all shots in a scene.
 * 4 Pillars: Lighting, Atmosphere, Optical Character, Art Direction
 */

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { 
  Sun, Cloud, Camera, Palette, Lock, Unlock, ChevronDown, Wand2, 
  Lightbulb, Wind, Film, MapPin 
} from 'lucide-react';

export interface SceneMaster {
  // Lighting Rig
  lighting_source: string;
  lighting_quality: 'Hard' | 'Soft' | 'Diffused' | 'Harsh';
  color_temperature: 'Warm (Tungsten)' | 'Neutral (Daylight)' | 'Cool (Blue)' | 'Mixed';
  contrast: 'High Key' | 'Low Key' | 'Balanced';
  // Atmosphere
  atmosphere: string;
  weather: string;
  // Optical Character
  lens_character: 'Modern Clean (Sharp)' | 'Vintage (Soft edges)' | 'Anamorphic (Oval bokeh, flares)' | 'B&W Film Grain';
  film_stock: string;
  // Art Direction
  location_anchor: string;
  palette: string;
}

interface SceneContextBarProps {
  scene: SceneMaster;
  onSceneChange: (scene: SceneMaster) => void;
  isLocked: boolean;
  onLockChange: (locked: boolean) => void;
}

const SCENE_PRESETS: Record<string, SceneMaster> = {
  'noir_night': {
    lighting_source: 'Single harsh streetlight from above, neon signs in background',
    lighting_quality: 'Hard',
    color_temperature: 'Mixed',
    contrast: 'Low Key',
    atmosphere: 'Thick fog, visible light beams, cigarette smoke',
    weather: 'Light rain, wet pavement reflections',
    lens_character: 'Vintage (Soft edges)',
    film_stock: 'Kodak Vision3 500T',
    location_anchor: 'Dark urban alley, brick walls, fire escapes',
    palette: 'Teal shadows, amber highlights, desaturated'
  },
  'golden_hour': {
    lighting_source: 'Low sun from camera left, warm backlight rim',
    lighting_quality: 'Soft',
    color_temperature: 'Warm (Tungsten)',
    contrast: 'Balanced',
    atmosphere: 'Golden dust particles, lens flares',
    weather: 'Clear sky, gentle breeze',
    lens_character: 'Anamorphic (Oval bokeh, flares)',
    film_stock: 'Kodak Portra 400',
    location_anchor: 'Open field, tall grass, distant mountains',
    palette: 'Warm orange and gold, soft greens'
  },
  'cyberpunk': {
    lighting_source: 'Multiple neon signs (pink, blue, green), holographic ads',
    lighting_quality: 'Hard',
    color_temperature: 'Cool (Blue)',
    contrast: 'High Key',
    atmosphere: 'Dense smog, neon reflections, steam vents',
    weather: 'Perpetual night, acid rain',
    lens_character: 'Anamorphic (Oval bokeh, flares)',
    film_stock: 'Digital ARRI Alexa',
    location_anchor: 'Crowded Asian market street, holographic billboards, flying cars',
    palette: 'Magenta and cyan, high saturation'
  },
  'studio_portrait': {
    lighting_source: 'Three-point lighting setup, key light at 45 degrees',
    lighting_quality: 'Soft',
    color_temperature: 'Neutral (Daylight)',
    contrast: 'Balanced',
    atmosphere: 'Clean, no particles',
    weather: 'Indoor controlled environment',
    lens_character: 'Modern Clean (Sharp)',
    film_stock: 'Digital Phase One',
    location_anchor: 'Professional studio, neutral gray backdrop',
    palette: 'Neutral tones, natural skin colors'
  }
};

export function SceneContextBar({ scene, onSceneChange, isLocked, onLockChange }: SceneContextBarProps) {
  const [isOpen, setIsOpen] = useState(true);

  const updateField = <K extends keyof SceneMaster>(key: K, value: SceneMaster[K]) => {
    if (isLocked) return;
    onSceneChange({ ...scene, [key]: value });
  };

  const applyPreset = (presetKey: string) => {
    if (isLocked) return;
    const preset = SCENE_PRESETS[presetKey];
    if (preset) {
      onSceneChange(preset);
    }
  };

  return (
    <Card className="border-2 border-dashed border-amber-500/50 bg-amber-500/5">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="p-0 h-auto">
                  <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? '' : '-rotate-90'}`} />
                </Button>
              </CollapsibleTrigger>
              <CardTitle className="text-base flex items-center gap-2">
                <Film className="h-4 w-4 text-amber-500" />
                Scene Master
              </CardTitle>
              <Badge variant={isLocked ? "default" : "outline"} className="text-xs">
                {isLocked ? (
                  <>
                    <Lock className="h-3 w-3 mr-1" />
                    Bloqueado
                  </>
                ) : (
                  <>
                    <Unlock className="h-3 w-3 mr-1" />
                    Editable
                  </>
                )}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={isLocked}
                onCheckedChange={onLockChange}
                id="scene-lock"
              />
              <Label htmlFor="scene-lock" className="text-xs text-muted-foreground cursor-pointer">
                Bloquear Escena
              </Label>
            </div>
          </div>
          <CardDescription className="text-xs">
            Variables globales que NO cambian entre planos. Define luz, atmósfera y estilo una vez.
          </CardDescription>
        </CardHeader>

        <CollapsibleContent>
          <CardContent className="space-y-4 pt-2">
            {/* Quick Presets */}
            <div className="flex flex-wrap gap-2">
              <span className="text-xs text-muted-foreground">Presets:</span>
              {Object.entries(SCENE_PRESETS).map(([key, _]) => (
                <Button
                  key={key}
                  variant="outline"
                  size="sm"
                  className="h-6 text-xs"
                  onClick={() => applyPreset(key)}
                  disabled={isLocked}
                >
                  <Wand2 className="h-3 w-3 mr-1" />
                  {key.replace('_', ' ')}
                </Button>
              ))}
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {/* PILLAR 1: LIGHTING */}
              <div className="space-y-2 p-3 rounded-lg bg-muted/50">
                <div className="flex items-center gap-1 text-sm font-medium text-amber-600 dark:text-amber-400">
                  <Lightbulb className="h-4 w-4" />
                  Iluminación
                </div>
                
                <div>
                  <Label className="text-xs">Fuente Principal</Label>
                  <Input
                    value={scene.lighting_source}
                    onChange={(e) => updateField('lighting_source', e.target.value)}
                    placeholder="Ej: Luz de luna por ventana izquierda"
                    className="h-8 text-xs"
                    disabled={isLocked}
                  />
                </div>

                <div>
                  <Label className="text-xs">Calidad</Label>
                  <Select
                    value={scene.lighting_quality}
                    onValueChange={(v) => updateField('lighting_quality', v as SceneMaster['lighting_quality'])}
                    disabled={isLocked}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Hard">Dura (sombras definidas)</SelectItem>
                      <SelectItem value="Soft">Suave (difusa)</SelectItem>
                      <SelectItem value="Diffused">Difusa (nublado)</SelectItem>
                      <SelectItem value="Harsh">Muy Dura (sol directo)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-xs">Temperatura</Label>
                  <Select
                    value={scene.color_temperature}
                    onValueChange={(v) => updateField('color_temperature', v as SceneMaster['color_temperature'])}
                    disabled={isLocked}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Warm (Tungsten)">Cálida (3200K)</SelectItem>
                      <SelectItem value="Neutral (Daylight)">Neutra (5600K)</SelectItem>
                      <SelectItem value="Cool (Blue)">Fría (7000K+)</SelectItem>
                      <SelectItem value="Mixed">Mixta</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-xs">Contraste</Label>
                  <Select
                    value={scene.contrast}
                    onValueChange={(v) => updateField('contrast', v as SceneMaster['contrast'])}
                    disabled={isLocked}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="High Key">High Key (todo iluminado)</SelectItem>
                      <SelectItem value="Low Key">Low Key (sombras)</SelectItem>
                      <SelectItem value="Balanced">Equilibrado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* PILLAR 2: ATMOSPHERE */}
              <div className="space-y-2 p-3 rounded-lg bg-muted/50">
                <div className="flex items-center gap-1 text-sm font-medium text-blue-600 dark:text-blue-400">
                  <Wind className="h-4 w-4" />
                  Atmósfera
                </div>

                <div>
                  <Label className="text-xs">Volumetría</Label>
                  <Input
                    value={scene.atmosphere}
                    onChange={(e) => updateField('atmosphere', e.target.value)}
                    placeholder="Ej: Niebla densa, rayos de luz"
                    className="h-8 text-xs"
                    disabled={isLocked}
                  />
                </div>

                <div>
                  <Label className="text-xs">Clima/Estado</Label>
                  <Input
                    value={scene.weather}
                    onChange={(e) => updateField('weather', e.target.value)}
                    placeholder="Ej: Lluvia fuerte, suelo mojado"
                    className="h-8 text-xs"
                    disabled={isLocked}
                  />
                </div>
              </div>

              {/* PILLAR 3: OPTICAL */}
              <div className="space-y-2 p-3 rounded-lg bg-muted/50">
                <div className="flex items-center gap-1 text-sm font-medium text-purple-600 dark:text-purple-400">
                  <Camera className="h-4 w-4" />
                  Óptica
                </div>

                <div>
                  <Label className="text-xs">Carácter de Lente</Label>
                  <Select
                    value={scene.lens_character}
                    onValueChange={(v) => updateField('lens_character', v as SceneMaster['lens_character'])}
                    disabled={isLocked}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Modern Clean (Sharp)">Moderno (nítido)</SelectItem>
                      <SelectItem value="Vintage (Soft edges)">Vintage (bordes suaves)</SelectItem>
                      <SelectItem value="Anamorphic (Oval bokeh, flares)">Anamórfico (bokeh oval)</SelectItem>
                      <SelectItem value="B&W Film Grain">B&N con grano</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-xs">Film Stock</Label>
                  <Input
                    value={scene.film_stock}
                    onChange={(e) => updateField('film_stock', e.target.value)}
                    placeholder="Ej: Kodak Portra 400"
                    className="h-8 text-xs"
                    disabled={isLocked}
                  />
                </div>
              </div>

              {/* PILLAR 4: ART DIRECTION */}
              <div className="space-y-2 p-3 rounded-lg bg-muted/50">
                <div className="flex items-center gap-1 text-sm font-medium text-green-600 dark:text-green-400">
                  <Palette className="h-4 w-4" />
                  Dirección Arte
                </div>

                <div>
                  <Label className="text-xs">Localización Base</Label>
                  <Input
                    value={scene.location_anchor}
                    onChange={(e) => updateField('location_anchor', e.target.value)}
                    placeholder="Ej: Callejón cyberpunk con neones"
                    className="h-8 text-xs"
                    disabled={isLocked}
                  />
                </div>

                <div>
                  <Label className="text-xs">Paleta de Color</Label>
                  <Input
                    value={scene.palette}
                    onChange={(e) => updateField('palette', e.target.value)}
                    placeholder="Ej: Teal & Orange, alto contraste"
                    className="h-8 text-xs"
                    disabled={isLocked}
                  />
                </div>
              </div>
            </div>

            {/* Summary */}
            {isLocked && (
              <div className="p-2 bg-amber-500/10 rounded-lg border border-amber-500/30">
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  <Lock className="h-3 w-3 inline mr-1" />
                  <strong>Escena Bloqueada:</strong> Todas las generaciones usarán esta configuración de luz y ambiente.
                  Los planos individuales solo variarán en lente, ángulo y encuadre.
                </p>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

// Default scene master
export const DEFAULT_SCENE_MASTER: SceneMaster = {
  lighting_source: 'Natural window light from left',
  lighting_quality: 'Soft',
  color_temperature: 'Neutral (Daylight)',
  contrast: 'Balanced',
  atmosphere: 'Clean, subtle dust particles',
  weather: 'Clear day',
  lens_character: 'Modern Clean (Sharp)',
  film_stock: 'Fujifilm Eterna 500T',
  location_anchor: 'Modern interior space',
  palette: 'Natural, balanced colors'
};
