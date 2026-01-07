import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { 
  Film, 
  Users, 
  Package, 
  Target, 
  AlertTriangle, 
  ChevronDown, 
  ChevronRight,
  Wand2,
  Check,
  FileText,
  Loader2
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

export interface SceneCard {
  scene: number;
  slugline: string;
  characters_present: string[];
  speaking_characters: string[];
  props_used: string[];
  beat_goal: string;
  conflicts: string[];
  continuity_notes: string[];
  // Extended fields after expansion
  screenplay?: string;
  qa_passed?: boolean;
  qa_warnings?: string[];
  is_expanded?: boolean;
}

interface SceneCardViewProps {
  sceneCard: SceneCard;
  projectId: string;
  onScreenplayGenerated?: (sceneNumber: number, screenplay: string) => void;
  showExpandButton?: boolean;
  compact?: boolean;
}

export function SceneCardView({ 
  sceneCard, 
  projectId, 
  onScreenplayGenerated,
  showExpandButton = true,
  compact = false
}: SceneCardViewProps) {
  const [isOpen, setIsOpen] = useState(!compact);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedScreenplay, setGeneratedScreenplay] = useState<string | null>(sceneCard.screenplay || null);
  const [qaWarnings, setQaWarnings] = useState<string[]>(sceneCard.qa_warnings || []);

  const handleGenerateScreenplay = async () => {
    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('expand-scene-card', {
        body: {
          projectId,
          sceneCard: {
            scene: sceneCard.scene,
            slugline: sceneCard.slugline,
            characters_present: sceneCard.characters_present,
            speaking_characters: sceneCard.speaking_characters,
            props_used: sceneCard.props_used,
            beat_goal: sceneCard.beat_goal,
            conflicts: sceneCard.conflicts,
            continuity_notes: sceneCard.continuity_notes,
          },
        },
      });

      if (error) throw error;

      if (data.success) {
        setGeneratedScreenplay(data.screenplay);
        setQaWarnings(data.qa?.warnings || []);
        onScreenplayGenerated?.(sceneCard.scene, data.screenplay);
        
        if (data.qa?.passed) {
          toast.success(`Escena ${sceneCard.scene} generada correctamente`);
        } else {
          toast.warning(`Escena ${sceneCard.scene} generada con ${data.qa?.warnings?.length || 0} avisos QA`);
        }
      } else {
        throw new Error(data.error || 'Error desconocido');
      }
    } catch (err) {
      console.error('Error generating screenplay:', err);
      toast.error(`Error generando escena: ${err instanceof Error ? err.message : 'Error desconocido'}`);
    } finally {
      setIsGenerating(false);
    }
  };

  // Check if slugline is valid
  const isValidSlugline = sceneCard.slugline?.match(/^(INT\.|EXT\.)/i);
  const hasDialoguePotential = sceneCard.speaking_characters?.length > 0;

  return (
    <Card className={`border ${generatedScreenplay ? 'border-green-500/30 bg-green-500/5' : 'border-border'}`}>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="py-2 px-3 cursor-pointer hover:bg-muted/50 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                {isOpen ? <ChevronDown className="h-4 w-4 flex-shrink-0" /> : <ChevronRight className="h-4 w-4 flex-shrink-0" />}
                <Badge variant="outline" className="font-mono text-xs">
                  {sceneCard.scene}
                </Badge>
                <span className={`text-xs font-mono truncate ${isValidSlugline ? 'text-foreground' : 'text-destructive'}`}>
                  {sceneCard.slugline || 'SIN SLUGLINE'}
                </span>
                {generatedScreenplay && (
                  <Badge variant="default" className="bg-green-600 text-xs flex-shrink-0">
                    <Check className="h-3 w-3 mr-1" />
                    Guion
                  </Badge>
                )}
                {!isValidSlugline && (
                  <Badge variant="destructive" className="text-xs flex-shrink-0">
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    Slugline inválido
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                {sceneCard.characters_present?.length > 0 && (
                  <Badge variant="secondary" className="text-xs">
                    <Users className="h-3 w-3 mr-1" />
                    {sceneCard.characters_present.length}
                  </Badge>
                )}
                {sceneCard.props_used?.length > 0 && (
                  <Badge variant="outline" className="text-xs">
                    <Package className="h-3 w-3 mr-1" />
                    {sceneCard.props_used.length}
                  </Badge>
                )}
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="pt-0 pb-3 px-3 space-y-3">
            {/* Beat Goal */}
            {sceneCard.beat_goal && (
              <div className="flex items-start gap-2">
                <Target className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                <p className="text-sm text-muted-foreground">{sceneCard.beat_goal}</p>
              </div>
            )}

            {/* Characters */}
            {sceneCard.characters_present?.length > 0 && (
              <div className="space-y-1">
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Users className="h-3 w-3" />
                  Personajes
                </div>
                <div className="flex flex-wrap gap-1">
                  {sceneCard.characters_present.map((char, i) => (
                    <Badge 
                      key={i} 
                      variant={sceneCard.speaking_characters?.includes(char) ? 'default' : 'secondary'}
                      className="text-xs"
                    >
                      {char}
                      {sceneCard.speaking_characters?.includes(char) && (
                        <span className="ml-1 opacity-60">🎤</span>
                      )}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Props */}
            {sceneCard.props_used?.length > 0 && (
              <div className="space-y-1">
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Package className="h-3 w-3" />
                  Props
                </div>
                <div className="flex flex-wrap gap-1">
                  {sceneCard.props_used.map((prop, i) => (
                    <Badge key={i} variant="outline" className="text-xs">
                      {prop}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Conflicts */}
            {sceneCard.conflicts?.length > 0 && (
              <div className="space-y-1">
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <AlertTriangle className="h-3 w-3" />
                  Conflictos
                </div>
                <div className="flex flex-wrap gap-1">
                  {sceneCard.conflicts.map((conflict, i) => (
                    <Badge key={i} variant="outline" className="text-xs bg-orange-500/10 border-orange-500/30">
                      {conflict}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* QA Warnings */}
            {qaWarnings.length > 0 && (
              <div className="p-2 bg-amber-500/10 border border-amber-500/30 rounded text-xs space-y-1">
                <div className="font-semibold text-amber-600 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  Avisos QA ({qaWarnings.length})
                </div>
                {qaWarnings.map((w, i) => (
                  <div key={i} className="text-muted-foreground">• {w}</div>
                ))}
              </div>
            )}

            {/* Generated Screenplay Preview */}
            {generatedScreenplay && (
              <div className="space-y-1">
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <FileText className="h-3 w-3" />
                  Guion Generado
                </div>
                <ScrollArea className="h-32 rounded border bg-muted/30 p-2">
                  <pre className="text-xs font-mono whitespace-pre-wrap">
                    {generatedScreenplay}
                  </pre>
                </ScrollArea>
              </div>
            )}

            {/* Generate Button */}
            {showExpandButton && (
              <Button
                size="sm"
                variant={generatedScreenplay ? 'outline' : 'default'}
                onClick={handleGenerateScreenplay}
                disabled={isGenerating}
                className="w-full"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Generando guion...
                  </>
                ) : generatedScreenplay ? (
                  <>
                    <Wand2 className="h-4 w-4 mr-2" />
                    Regenerar Guion
                  </>
                ) : (
                  <>
                    <Wand2 className="h-4 w-4 mr-2" />
                    Generar Guion Mínimo
                  </>
                )}
              </Button>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

// Container component for multiple scene cards
interface SceneCardsContainerProps {
  sceneCards: SceneCard[];
  projectId: string;
  onAllGenerated?: (screenplays: Map<number, string>) => void;
}

export function SceneCardsContainer({ sceneCards, projectId, onAllGenerated }: SceneCardsContainerProps) {
  const [screenplays, setScreenplays] = useState<Map<number, string>>(new Map());
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);

  const handleScreenplayGenerated = (sceneNumber: number, screenplay: string) => {
    setScreenplays(prev => {
      const updated = new Map(prev);
      updated.set(sceneNumber, screenplay);
      return updated;
    });
  };

  const generatedCount = screenplays.size;
  const totalCount = sceneCards.length;
  const completionPercent = totalCount > 0 ? Math.round((generatedCount / totalCount) * 100) : 0;

  // Count valid sluglines
  const validSluglines = sceneCards.filter(sc => sc.slugline?.match(/^(INT\.|EXT\.)/i)).length;

  return (
    <div className="space-y-4">
      {/* Stats Header */}
      <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Film className="h-4 w-4 text-primary" />
            <span className="font-medium">{totalCount} Scene Cards</span>
          </div>
          <Badge variant={validSluglines === totalCount ? 'default' : 'secondary'}>
            {validSluglines}/{totalCount} sluglines válidos
          </Badge>
          <Badge variant={generatedCount === totalCount ? 'default' : 'outline'} className={generatedCount === totalCount ? 'bg-green-600' : ''}>
            {generatedCount}/{totalCount} guiones ({completionPercent}%)
          </Badge>
        </div>
      </div>

      {/* Scene Cards List */}
      <ScrollArea className="h-[500px] pr-2">
        <div className="space-y-2">
          {sceneCards.map((card) => (
            <SceneCardView
              key={card.scene}
              sceneCard={{
                ...card,
                screenplay: screenplays.get(card.scene),
              }}
              projectId={projectId}
              onScreenplayGenerated={handleScreenplayGenerated}
              compact
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

export default SceneCardView;
