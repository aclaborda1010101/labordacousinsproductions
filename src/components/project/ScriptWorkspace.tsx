/**
 * ScriptWorkspace v1 - Two clear modes: Generate from idea / Analyze existing script
 * Adapted by user level (Normal/Pro)
 */

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { useEditorialKnowledgeBase } from '@/hooks/useEditorialKnowledgeBase';
import {
  Lightbulb,
  FileText,
  Upload,
  Wand2,
  Search,
  Loader2,
  CheckCircle,
  Users,
  MapPin,
  Film,
  Settings2,
  ArrowRight,
  Sparkles,
} from 'lucide-react';

interface ScriptWorkspaceProps {
  projectId: string;
  onEntitiesExtracted?: () => void;
}

type EntryMode = 'idea' | 'existing';
type InputMethod = 'paste' | 'upload';
type WorkflowStatus = 'idle' | 'generating' | 'analyzing' | 'extracting' | 'success' | 'error';

interface ExtractionResult {
  characters: { name: string; role?: string }[];
  locations: { name: string; description?: string }[];
  scenes: { slugline: string; summary?: string }[];
}

export default function ScriptWorkspace({ projectId, onEntitiesExtracted }: ScriptWorkspaceProps) {
  const navigate = useNavigate();
  
  // User level from EKB
  const { userLevel, visibility } = useEditorialKnowledgeBase({
    projectId,
    assetType: 'character',
  });
  const isPro = userLevel === 'pro';

  // Entry mode state
  const [entryMode, setEntryMode] = useState<EntryMode | null>(null);
  const [hasExistingScript, setHasExistingScript] = useState(false);
  const [existingScriptText, setExistingScriptText] = useState('');

  // Form state
  const [ideaText, setIdeaText] = useState('');
  const [scriptText, setScriptText] = useState('');
  const [inputMethod, setInputMethod] = useState<InputMethod>('paste');
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);

  // Generation state
  const [status, setStatus] = useState<WorkflowStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [generatedScript, setGeneratedScript] = useState<string | null>(null);
  const [extractionResult, setExtractionResult] = useState<ExtractionResult | null>(null);

  // Pro mode controls
  const [selectedModel, setSelectedModel] = useState<'rapido' | 'profesional'>('rapido');
  const [extractCharacters, setExtractCharacters] = useState(true);
  const [extractLocations, setExtractLocations] = useState(true);
  const [extractScenes, setExtractScenes] = useState(true);

  // File input ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Check for existing script on mount
  useEffect(() => {
    const checkExistingScript = async () => {
      const { data } = await supabase
        .from('scripts')
        .select('id, raw_text')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data?.raw_text) {
        setHasExistingScript(true);
        setExistingScriptText(data.raw_text);
      }
    };
    checkExistingScript();
  }, [projectId]);

  // Handle file upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['text/plain', 'application/pdf'];
    if (!allowedTypes.includes(file.type) && !file.name.endsWith('.txt') && !file.name.endsWith('.pdf')) {
      toast.error('Solo se permiten archivos .txt o .pdf');
      return;
    }

    setUploadedFileName(file.name);
    
    if (file.type === 'text/plain' || file.name.endsWith('.txt')) {
      // Read text file directly
      const text = await file.text();
      setScriptText(text);
      toast.success('Archivo cargado correctamente');
    } else if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
      // For PDF, we'll need to extract text on the server
      toast.info('Procesando PDF...');
      
      // Upload to storage first, then parse
      const fileName = `${projectId}/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from('scripts')
        .upload(fileName, file);

      if (uploadError) {
        toast.error('Error al subir archivo');
        console.error(uploadError);
        return;
      }

      // Get public URL and parse
      const { data: urlData } = supabase.storage.from('scripts').getPublicUrl(fileName);
      
      try {
        const { data, error } = await supabase.functions.invoke('parse-script', {
          body: { pdfUrl: urlData.publicUrl, projectId }
        });

        if (error) throw error;
        
        if (data?.rawText) {
          setScriptText(data.rawText);
          toast.success('PDF procesado correctamente');
        }
      } catch (err) {
        console.error('PDF parse error:', err);
        toast.error('Error al procesar el PDF');
      }
    }
  };

  // Generate script from idea
  const handleGenerateScript = async () => {
    if (!ideaText.trim()) {
      toast.error('Escribe tu idea primero');
      return;
    }

    setStatus('generating');
    setProgress(10);

    try {
      // Call generate-outline-light first
      const { data: outlineData, error: outlineError } = await supabase.functions.invoke('generate-outline-light', {
        body: {
          projectId,
          idea: ideaText,
          model: selectedModel,
          format: 'short',
        }
      });

      if (outlineError) throw outlineError;
      setProgress(50);

      // Generate full script from outline
      const { data: scriptData, error: scriptError } = await supabase.functions.invoke('script-generate', {
        body: {
          projectId,
          outline: outlineData?.outline,
          idea: ideaText,
          model: selectedModel,
        }
      });

      if (scriptError) throw scriptError;
      setProgress(100);

      const rawScript = scriptData?.screenplay || scriptData?.script || '';
      setGeneratedScript(rawScript);
      
      // Save to database
      await supabase.from('scripts').insert({
        project_id: projectId,
        raw_text: rawScript,
        parsed_json: scriptData,
        status: 'draft',
      });

      setStatus('success');
      toast.success('¡Guion generado!');
    } catch (err) {
      console.error('Generation error:', err);
      setStatus('error');
      toast.error('Error al generar el guion');
    }
  };

  // Analyze existing script
  const handleAnalyzeScript = async () => {
    const textToAnalyze = scriptText.trim();
    if (!textToAnalyze) {
      toast.error('Pega o sube un guion primero');
      return;
    }

    setStatus('analyzing');
    setProgress(20);

    try {
      // Save script first
      const { data: savedScript, error: saveError } = await supabase
        .from('scripts')
        .insert({
          project_id: projectId,
          raw_text: textToAnalyze,
          status: 'draft',
        })
        .select()
        .single();

      if (saveError) throw saveError;
      setProgress(40);

      // Call script-breakdown to extract entities
      const { data: breakdownData, error: breakdownError } = await supabase.functions.invoke('script-breakdown', {
        body: {
          projectId,
          scriptId: savedScript.id,
          scriptText: textToAnalyze,
          options: {
            extractCharacters,
            extractLocations,
            extractScenes,
          }
        }
      });

      if (breakdownError) throw breakdownError;
      setProgress(80);

      setExtractionResult({
        characters: breakdownData?.characters || [],
        locations: breakdownData?.locations || [],
        scenes: breakdownData?.scenes || [],
      });

      setProgress(100);
      setStatus('success');
      toast.success('¡Guion analizado!');
    } catch (err) {
      console.error('Analysis error:', err);
      setStatus('error');
      toast.error('Error al analizar el guion');
    }
  };

  // Prepare project (extract entities from generated script)
  const handlePrepareProject = async () => {
    if (!generatedScript) return;

    setStatus('extracting');
    setProgress(20);

    try {
      const { data: breakdownData, error: breakdownError } = await supabase.functions.invoke('script-breakdown', {
        body: {
          projectId,
          scriptText: generatedScript,
          options: {
            extractCharacters: true,
            extractLocations: true,
            extractScenes: true,
          }
        }
      });

      if (breakdownError) throw breakdownError;
      setProgress(80);

      setExtractionResult({
        characters: breakdownData?.characters || [],
        locations: breakdownData?.locations || [],
        scenes: breakdownData?.scenes || [],
      });

      setProgress(100);
      setStatus('success');
      toast.success('¡Proyecto preparado!');
      
      // Navigate to characters
      setTimeout(() => {
        navigate(`/projects/${projectId}/characters`);
        onEntitiesExtracted?.();
      }, 1000);
    } catch (err) {
      console.error('Extraction error:', err);
      setStatus('error');
      toast.error('Error al preparar el proyecto');
    }
  };

  // Navigate after successful extraction
  const handleContinueToCharacters = () => {
    navigate(`/projects/${projectId}/characters`);
    onEntitiesExtracted?.();
  };

  // If script already exists, show summary
  if (hasExistingScript && !entryMode) {
    return (
      <div className="space-y-6 p-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Guion existente
            </CardTitle>
            <CardDescription>
              Ya tienes un guion guardado. Puedes continuar trabajando o empezar de nuevo.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-muted/50 rounded-lg p-4 max-h-40 overflow-y-auto">
              <pre className="text-xs whitespace-pre-wrap font-mono">
                {existingScriptText.slice(0, 500)}...
              </pre>
            </div>
            <div className="flex gap-3">
              <Button onClick={() => navigate(`/projects/${projectId}/characters`)}>
                <ArrowRight className="h-4 w-4 mr-2" />
                Continuar a Personajes
              </Button>
              <Button variant="outline" onClick={() => setHasExistingScript(false)}>
                Empezar de nuevo
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Entry mode selection
  if (!entryMode) {
    return (
      <div className="space-y-6 p-6">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold mb-2">¿Cómo quieres empezar?</h2>
          <p className="text-muted-foreground">
            Elige una opción para comenzar tu proyecto
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto">
          {/* Option 1: I have an idea */}
          <Card 
            className="cursor-pointer hover:border-primary transition-colors group"
            onClick={() => setEntryMode('idea')}
          >
            <CardHeader className="text-center pb-2">
              <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                <Lightbulb className="h-8 w-8 text-primary" />
              </div>
              <CardTitle>Tengo una idea</CardTitle>
              <CardDescription>
                Describe tu historia y generaremos el guion completo
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center">
              <Badge variant="secondary" className="gap-1">
                <Wand2 className="h-3 w-3" />
                IA genera el guion
              </Badge>
            </CardContent>
          </Card>

          {/* Option 2: I have a script */}
          <Card 
            className="cursor-pointer hover:border-primary transition-colors group"
            onClick={() => setEntryMode('existing')}
          >
            <CardHeader className="text-center pb-2">
              <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                <FileText className="h-8 w-8 text-primary" />
              </div>
              <CardTitle>Ya tengo un guion</CardTitle>
              <CardDescription>
                Sube o pega tu guion y extraeremos los elementos
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center">
              <Badge variant="secondary" className="gap-1">
                <Search className="h-3 w-3" />
                Análisis automático
              </Badge>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Mode: Generate from idea
  if (entryMode === 'idea') {
    return (
      <div className="space-y-6 p-6 max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-4">
          <Button variant="ghost" size="sm" onClick={() => setEntryMode(null)}>
            ← Volver
          </Button>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-primary" />
            Genera tu guion desde una idea
          </h2>
        </div>

        <Card>
          <CardContent className="pt-6 space-y-4">
            <div>
              <Label htmlFor="idea">Describe tu historia</Label>
              <Textarea
                id="idea"
                placeholder="Ej: Una comedia sobre un robot que quiere ser chef en un restaurante de alta cocina..."
                value={ideaText}
                onChange={(e) => setIdeaText(e.target.value)}
                rows={6}
                className="mt-2"
                disabled={status === 'generating'}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Incluye personajes, conflicto, tono y ambientación para mejores resultados
              </p>
            </div>

            {/* Pro mode: model selector */}
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
                    <div>
                      <Label>Modelo de generación</Label>
                      <Select value={selectedModel} onValueChange={(v) => setSelectedModel(v as any)}>
                        <SelectTrigger className="mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="rapido">Rápido (GPT-4o-mini)</SelectItem>
                          <SelectItem value="profesional">Profesional (GPT-4o)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            )}

            {/* Progress */}
            {status === 'generating' && (
              <div className="space-y-2">
                <Progress value={progress} />
                <p className="text-xs text-muted-foreground text-center">
                  Generando guion...
                </p>
              </div>
            )}

            {/* Generated script preview */}
            {generatedScript && status === 'success' && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-green-600">
                  <CheckCircle className="h-4 w-4" />
                  <span className="text-sm font-medium">¡Guion generado!</span>
                </div>
                <div className="bg-muted/50 rounded-lg p-4 max-h-60 overflow-y-auto">
                  <pre className="text-xs whitespace-pre-wrap font-mono">
                    {generatedScript.slice(0, 1000)}...
                  </pre>
                </div>
                <Button onClick={handlePrepareProject} className="w-full" disabled={['generating', 'analyzing', 'extracting'].includes(status)}>
                  {['generating', 'analyzing', 'extracting'].includes(status) ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Preparando proyecto...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4 mr-2" />
                      Preparar proyecto
                    </>
                  )}
                </Button>
              </div>
            )}

            {/* Action button */}
            {!generatedScript && (
              <Button 
                onClick={handleGenerateScript} 
                className="w-full" 
                disabled={!ideaText.trim() || status === 'generating'}
              >
                {status === 'generating' ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Generando...
                  </>
                ) : (
                  <>
                    <Wand2 className="h-4 w-4 mr-2" />
                    Generar guion
                  </>
                )}
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // Mode: Analyze existing script
  if (entryMode === 'existing') {
    return (
      <div className="space-y-6 p-6 max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-4">
          <Button variant="ghost" size="sm" onClick={() => setEntryMode(null)}>
            ← Volver
          </Button>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Analiza tu guion
          </h2>
        </div>

        <Card>
          <CardContent className="pt-6 space-y-4">
            {/* Input method tabs */}
            <Tabs value={inputMethod} onValueChange={(v) => setInputMethod(v as InputMethod)}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="paste">Pegar texto</TabsTrigger>
                <TabsTrigger value="upload">Subir archivo</TabsTrigger>
              </TabsList>

              <TabsContent value="paste" className="mt-4">
                <Textarea
                  placeholder="Pega aquí tu guion..."
                  value={scriptText}
                  onChange={(e) => setScriptText(e.target.value)}
                  rows={12}
                  disabled={status === 'analyzing'}
                />
              </TabsContent>

              <TabsContent value="upload" className="mt-4">
                <div 
                  className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-4" />
                  <p className="font-medium">
                    {uploadedFileName || 'Arrastra un archivo o haz clic para seleccionar'}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Formatos permitidos: .txt, .pdf
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".txt,.pdf,text/plain,application/pdf"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </div>
                {scriptText && (
                  <div className="mt-4 bg-muted/50 rounded-lg p-4 max-h-40 overflow-y-auto">
                    <pre className="text-xs whitespace-pre-wrap font-mono">
                      {scriptText.slice(0, 500)}...
                    </pre>
                  </div>
                )}
              </TabsContent>
            </Tabs>

            {/* Pro mode: extraction options */}
            {isPro && (
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="advanced" className="border-none">
                  <AccordionTrigger className="py-2 text-xs text-muted-foreground hover:no-underline">
                    <div className="flex items-center gap-2">
                      <Settings2 className="h-3 w-3" />
                      Opciones de extracción
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="space-y-3 pt-2">
                    <div className="flex items-center gap-2">
                      <Checkbox 
                        id="chars" 
                        checked={extractCharacters} 
                        onCheckedChange={(c) => setExtractCharacters(!!c)} 
                      />
                      <Label htmlFor="chars" className="flex items-center gap-1 text-sm">
                        <Users className="h-3 w-3" />
                        Extraer personajes
                      </Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox 
                        id="locs" 
                        checked={extractLocations} 
                        onCheckedChange={(c) => setExtractLocations(!!c)} 
                      />
                      <Label htmlFor="locs" className="flex items-center gap-1 text-sm">
                        <MapPin className="h-3 w-3" />
                        Extraer localizaciones
                      </Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox 
                        id="scenes" 
                        checked={extractScenes} 
                        onCheckedChange={(c) => setExtractScenes(!!c)} 
                      />
                      <Label htmlFor="scenes" className="flex items-center gap-1 text-sm">
                        <Film className="h-3 w-3" />
                        Extraer escenas
                      </Label>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            )}

            {/* Progress */}
            {status === 'analyzing' && (
              <div className="space-y-2">
                <Progress value={progress} />
                <p className="text-xs text-muted-foreground text-center">
                  Analizando guion...
                </p>
              </div>
            )}

            {/* Extraction result */}
            {extractionResult && status === 'success' && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-green-600">
                  <CheckCircle className="h-4 w-4" />
                  <span className="text-sm font-medium">¡Análisis completado!</span>
                </div>
                
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-muted/50 rounded-lg p-3 text-center">
                    <Users className="h-5 w-5 mx-auto mb-1 text-primary" />
                    <p className="text-2xl font-bold">{extractionResult.characters.length}</p>
                    <p className="text-xs text-muted-foreground">Personajes</p>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-3 text-center">
                    <MapPin className="h-5 w-5 mx-auto mb-1 text-primary" />
                    <p className="text-2xl font-bold">{extractionResult.locations.length}</p>
                    <p className="text-xs text-muted-foreground">Localizaciones</p>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-3 text-center">
                    <Film className="h-5 w-5 mx-auto mb-1 text-primary" />
                    <p className="text-2xl font-bold">{extractionResult.scenes.length}</p>
                    <p className="text-xs text-muted-foreground">Escenas</p>
                  </div>
                </div>

                <Button onClick={handleContinueToCharacters} className="w-full">
                  <ArrowRight className="h-4 w-4 mr-2" />
                  Continuar a Personajes
                </Button>
              </div>
            )}

            {/* Action button */}
            {!extractionResult && (
              <Button 
                onClick={handleAnalyzeScript} 
                className="w-full" 
                disabled={!scriptText.trim() || status === 'analyzing'}
              >
                {status === 'analyzing' ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Analizando...
                  </>
                ) : (
                  <>
                    <Search className="h-4 w-4 mr-2" />
                    Analizar guion
                  </>
                )}
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return null;
}
