/**
 * Pantalla: Generador con Pipeline Editorial
 */

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sparkles, User, MapPin, BookOpen, Wand2 } from 'lucide-react';
import type { 
  AssetCharacter, 
  AssetLocation, 
  ProjectBible,
  EditorialProjectPhase,
  MVP_ENGINES 
} from '@/lib/editorialMVPTypes';

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
  }) => Promise<void>;
  isGenerating: boolean;
}

const ENGINES = [
  { id: 'nano-banana', name: 'Nano Banana Pro', type: 'image' },
  { id: 'flux-ultra', name: 'FLUX Pro Ultra', type: 'image' }
];

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
  const [engine, setEngine] = useState(ENGINES[0].id);

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
      engine
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
              Describe lo que quieres crear. El sistema traducirá tu intención respetando las reglas editoriales.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="intent">¿Qué quieres generar?</Label>
              <Textarea
                id="intent"
                value={intent}
                onChange={(e) => setIntent(e.target.value)}
                placeholder="Ej: Elena sentada en el café, mirando por la ventana con expresión pensativa, luz de atardecer..."
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
                placeholder="Ej: Es el momento justo después de recibir la llamada. Todavía no sabe qué va a hacer..."
                rows={2}
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Añade contexto de la historia para enriquecer la generación.
              </p>
            </div>

            <div>
              <Label>Motor de generación</Label>
              <Select value={engine} onValueChange={setEngine}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ENGINES.map(e => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                  Generando...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Generar
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
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
