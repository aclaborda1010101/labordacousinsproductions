import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Wand2, Copy, Loader2, Sparkles, Camera, Smile, Shirt, 
  Activity, Sun, RefreshCw
} from 'lucide-react';
import { useTechnicalPrompt, Engine, PromptOptions, buildLocalPrompt } from '@/hooks/useTechnicalPrompt';

const ENGINES: { value: Engine; label: string; description: string }[] = [
  { value: 'chatgpt', label: 'ChatGPT', description: 'OpenAI - Motor por defecto para prompts' },
  { value: 'claude', label: 'Claude', description: 'Anthropic - Razonamiento avanzado' },
  { value: 'veo', label: 'Veo 3.1', description: 'Video generation - Cinemático' },
  { value: 'kling', label: 'Kling 2.0', description: 'Video generation - Rápido' },
  { value: 'flux', label: 'Flux', description: 'Imagen - Fotorealista' },
  { value: 'midjourney', label: 'Midjourney', description: 'Imagen - Artístico' },
];

const SHOT_TYPES = [
  'extreme close-up', 'close-up', 'medium close-up', 'medium shot',
  'medium full shot', 'full shot', 'wide shot', 'extreme wide shot',
  'over-the-shoulder', 'POV shot', 'two-shot', 'profile shot',
];

const EXPRESSIONS = [
  'neutral', 'happy', 'sad', 'angry', 'surprised', 'fearful',
  'disgusted', 'contemptuous', 'confident', 'thoughtful', 'determined',
  'melancholic', 'joyful', 'anxious', 'serene', 'intense',
];

const LIGHTING_STYLES = [
  'natural daylight', 'golden hour', 'blue hour', 'overcast soft',
  'dramatic side', 'rim light', 'three-point studio', 'low key noir',
  'high key bright', 'neon colored', 'candlelight warm', 'moonlight cool',
];

interface TechnicalPromptGeneratorProps {
  characterId: string;
  characterName: string;
  visualDNA?: any;
  onPromptGenerated?: (prompt: { positive: string; negative: string }) => void;
}

export function TechnicalPromptGenerator({
  characterId,
  characterName,
  visualDNA,
  onPromptGenerated,
}: TechnicalPromptGeneratorProps) {
  const { generating, generatePrompt, copyToClipboard } = useTechnicalPrompt();
  const [engine, setEngine] = useState<Engine>('chatgpt');
  const [options, setOptions] = useState<PromptOptions>({
    shotType: '',
    expression: '',
    outfit: '',
    action: '',
    lighting: '',
  });
  const [generatedPrompt, setGeneratedPrompt] = useState<{ positive: string; negative: string } | null>(null);
  const [useLocalGeneration, setUseLocalGeneration] = useState(!!visualDNA);

  const handleGenerate = async () => {
    if (useLocalGeneration && visualDNA) {
      const prompt = buildLocalPrompt(visualDNA, engine, options);
      setGeneratedPrompt(prompt);
      onPromptGenerated?.(prompt);
    } else {
      const prompt = await generatePrompt(characterId, engine, options);
      if (prompt) {
        setGeneratedPrompt(prompt);
        onPromptGenerated?.(prompt);
      }
    }
  };

  const handleCopy = (type: 'positive' | 'negative' | 'both') => {
    if (!generatedPrompt) return;
    if (type === 'both') {
      copyToClipboard(`${generatedPrompt.positive}\n\nNegative: ${generatedPrompt.negative}`);
    } else {
      copyToClipboard(generatedPrompt[type]);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wand2 className="w-5 h-5 text-primary" />
          <div>
            <h3 className="font-semibold">Technical Prompt Generator</h3>
            <p className="text-xs text-muted-foreground">
              Genera prompts optimizados para {characterName}
            </p>
          </div>
        </div>
        <Badge variant="outline" className="text-xs">
          Fase 2
        </Badge>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Configuration */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Configuración</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Engine Selection */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Motor de generación</Label>
              <Select value={engine} onValueChange={(v) => setEngine(v as Engine)}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ENGINES.map(e => (
                    <SelectItem key={e.value} value={e.value}>
                      <div className="flex flex-col">
                        <span className="font-medium">{e.label}</span>
                        <span className="text-xs text-muted-foreground">{e.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Shot Type */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground flex items-center gap-1">
                <Camera className="w-3 h-3" /> Tipo de plano
              </Label>
              <Select 
                value={options.shotType || ''} 
                onValueChange={(v) => setOptions(p => ({ ...p, shotType: v }))}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Seleccionar..." />
                </SelectTrigger>
                <SelectContent>
                  {SHOT_TYPES.map(s => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Expression */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground flex items-center gap-1">
                <Smile className="w-3 h-3" /> Expresión
              </Label>
              <Select 
                value={options.expression || ''} 
                onValueChange={(v) => setOptions(p => ({ ...p, expression: v }))}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Seleccionar..." />
                </SelectTrigger>
                <SelectContent>
                  {EXPRESSIONS.map(e => (
                    <SelectItem key={e} value={e}>{e}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Outfit */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground flex items-center gap-1">
                <Shirt className="w-3 h-3" /> Vestuario
              </Label>
              <Input
                value={options.outfit || ''}
                onChange={(e) => setOptions(p => ({ ...p, outfit: e.target.value }))}
                placeholder="Ej: black suit, casual jeans and t-shirt..."
                className="h-9"
              />
            </div>

            {/* Action */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground flex items-center gap-1">
                <Activity className="w-3 h-3" /> Acción
              </Label>
              <Input
                value={options.action || ''}
                onChange={(e) => setOptions(p => ({ ...p, action: e.target.value }))}
                placeholder="Ej: walking, sitting, looking at camera..."
                className="h-9"
              />
            </div>

            {/* Lighting */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground flex items-center gap-1">
                <Sun className="w-3 h-3" /> Iluminación
              </Label>
              <Select 
                value={options.lighting || ''} 
                onValueChange={(v) => setOptions(p => ({ ...p, lighting: v }))}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Seleccionar..." />
                </SelectTrigger>
                <SelectContent>
                  {LIGHTING_STYLES.map(l => (
                    <SelectItem key={l} value={l}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Generate Button */}
            <Button
              variant="gold"
              className="w-full"
              onClick={handleGenerate}
              disabled={generating}
            >
              {generating ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Sparkles className="w-4 h-4 mr-2" />
              )}
              Generar Prompt
            </Button>
          </CardContent>
        </Card>

        {/* Generated Prompt */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center justify-between">
              Prompt Generado
              {generatedPrompt && (
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleCopy('both')}
                  >
                    <Copy className="w-3 h-3 mr-1" />
                    Copiar
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleGenerate}
                  >
                    <RefreshCw className="w-3 h-3" />
                  </Button>
                </div>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {generatedPrompt ? (
              <Tabs defaultValue="positive" className="w-full">
                <TabsList className="w-full">
                  <TabsTrigger value="positive" className="flex-1">
                    Positivo
                  </TabsTrigger>
                  <TabsTrigger value="negative" className="flex-1">
                    Negativo
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="positive" className="mt-3">
                  <div className="relative">
                    <Textarea
                      value={generatedPrompt.positive}
                      readOnly
                      rows={10}
                      className="text-sm font-mono resize-none"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="absolute top-2 right-2"
                      onClick={() => handleCopy('positive')}
                    >
                      <Copy className="w-3 h-3" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    {generatedPrompt.positive.length} caracteres
                  </p>
                </TabsContent>
                <TabsContent value="negative" className="mt-3">
                  <div className="relative">
                    <Textarea
                      value={generatedPrompt.negative}
                      readOnly
                      rows={6}
                      className="text-sm font-mono resize-none"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="absolute top-2 right-2"
                      onClick={() => handleCopy('negative')}
                    >
                      <Copy className="w-3 h-3" />
                    </Button>
                  </div>
                </TabsContent>
              </Tabs>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Wand2 className="w-10 h-10 text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground">
                  Configura las opciones y genera un prompt técnico
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  El prompt se basará en el Visual DNA del personaje
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default TechnicalPromptGenerator;
