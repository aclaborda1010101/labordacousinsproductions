import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { toast } from 'sonner';
import { 
  FileText, 
  Wand2, 
  Loader2,
  CheckCircle,
  Film,
  Users,
  MapPin,
  Link2,
  Lightbulb,
  Stethoscope,
  Layers,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Download,
  Lock,
  Unlock,
  Package,
  Shirt,
  Sparkles,
  Volume2,
  Zap
} from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

interface ParsedScene {
  slugline: string;
  summary: string;
  characters: string[];
  location: string;
  time_of_day: string;
  dialogue_count: number;
}

interface Character {
  id: string;
  name: string;
}

interface Location {
  id: string;
  name: string;
}

interface ScriptImportProps {
  projectId: string;
  onScenesCreated?: () => void;
}

interface ScriptDoctorSuggestion {
  id: string;
  category: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  location?: string;
  issue: string;
  reason: string;
  suggestion: string;
  rewrite_snippet?: string;
}

interface BreakdownEntity {
  name: string;
  type?: string;
  role?: string;
  description?: string;
  scenes?: number[];
  scenes_count?: number;
  priority?: string;
  selected?: boolean;
}

export default function ScriptImport({ projectId, onScenesCreated }: ScriptImportProps) {
  const [activeTab, setActiveTab] = useState('import');
  const [scriptText, setScriptText] = useState('');
  const [parsing, setParsing] = useState(false);
  const [parsedScenes, setParsedScenes] = useState<ParsedScene[]>([]);
  const [importing, setImporting] = useState(false);
  const [existingCharacters, setExistingCharacters] = useState<Character[]>([]);
  const [existingLocations, setExistingLocations] = useState<Location[]>([]);
  const [linkedCharacters, setLinkedCharacters] = useState<Record<number, string[]>>({});
  const [linkedLocations, setLinkedLocations] = useState<Record<number, string | null>>({});
  const [episodesCount, setEpisodesCount] = useState(1);
  const [selectedEpisode, setSelectedEpisode] = useState('1');
  const [scriptLocked, setScriptLocked] = useState(false);
  const [currentScriptId, setCurrentScriptId] = useState<string | null>(null);

  // Generate from idea state
  const [ideaText, setIdeaText] = useState('');
  const [genre, setGenre] = useState('drama');
  const [tone, setTone] = useState('Cinematográfico realista');
  const [generating, setGenerating] = useState(false);

  // Script Doctor state
  const [analyzing, setAnalyzing] = useState(false);
  const [doctorSuggestions, setDoctorSuggestions] = useState<ScriptDoctorSuggestion[]>([]);
  const [doctorScore, setDoctorScore] = useState<number | null>(null);

  // Breakdown state
  const [breakingDown, setBreakingDown] = useState(false);
  const [breakdownCharacters, setBreakdownCharacters] = useState<BreakdownEntity[]>([]);
  const [breakdownLocations, setBreakdownLocations] = useState<BreakdownEntity[]>([]);
  const [breakdownProps, setBreakdownProps] = useState<BreakdownEntity[]>([]);
  const [breakdownWardrobe, setBreakdownWardrobe] = useState<BreakdownEntity[]>([]);
  const [breakdownVfx, setBreakdownVfx] = useState<BreakdownEntity[]>([]);
  const [breakdownSound, setBreakdownSound] = useState<BreakdownEntity[]>([]);
  const [breakdownScenes, setBreakdownScenes] = useState<any[]>([]);
  const [creatingEntities, setCreatingEntities] = useState(false);

  // Fetch existing data
  useEffect(() => {
    const fetchData = async () => {
      const [charsRes, locsRes, projectRes, scriptsRes] = await Promise.all([
        supabase.from('characters').select('id, name').eq('project_id', projectId),
        supabase.from('locations').select('id, name').eq('project_id', projectId),
        supabase.from('projects').select('episodes_count').eq('id', projectId).single(),
        supabase.from('scripts').select('id, status, raw_text').eq('project_id', projectId).order('created_at', { ascending: false }).limit(1)
      ]);
      if (charsRes.data) setExistingCharacters(charsRes.data);
      if (locsRes.data) setExistingLocations(locsRes.data);
      if (projectRes.data) setEpisodesCount(projectRes.data.episodes_count || 1);
      if (scriptsRes.data && scriptsRes.data.length > 0) {
        const script = scriptsRes.data[0];
        setCurrentScriptId(script.id);
        setScriptLocked(script.status === 'locked');
        if (script.raw_text) setScriptText(script.raw_text);
      }
    };
    fetchData();
  }, [projectId]);

  // Auto-link when scenes are parsed
  useEffect(() => {
    if (parsedScenes.length === 0) return;
    const newLinkedChars: Record<number, string[]> = {};
    const newLinkedLocs: Record<number, string | null> = {};
    parsedScenes.forEach((scene, index) => {
      const matchedCharIds: string[] = [];
      scene.characters.forEach(charName => {
        const match = existingCharacters.find(c => c.name.toLowerCase() === charName.toLowerCase());
        if (match) matchedCharIds.push(match.id);
      });
      newLinkedChars[index] = matchedCharIds;
      const locMatch = existingLocations.find(
        l => l.name.toLowerCase().includes(scene.location.toLowerCase()) ||
             scene.location.toLowerCase().includes(l.name.toLowerCase())
      );
      newLinkedLocs[index] = locMatch?.id || null;
    });
    setLinkedCharacters(newLinkedChars);
    setLinkedLocations(newLinkedLocs);
  }, [parsedScenes, existingCharacters, existingLocations]);

  // Generate script from idea
  async function generateFromIdea() {
    if (!ideaText.trim()) {
      toast.error('Escribe una idea para generar el guion');
      return;
    }
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('script-generate', {
        body: {
          idea: ideaText,
          genre,
          tone,
          format: episodesCount > 1 ? 'series' : 'film',
          episodesCount,
          episodeDurationMin: 45,
          language: 'es-ES'
        }
      });
      if (error) throw error;
      if (data?.script?.screenplay) {
        setScriptText(data.script.screenplay);
        toast.success('Guion generado correctamente');
        setActiveTab('import');
      } else {
        toast.error('No se pudo generar el guion');
      }
    } catch (err: any) {
      console.error('Error generating script:', err);
      if (err.message?.includes('429')) {
        toast.error('Rate limit alcanzado. Espera un momento.');
      } else if (err.message?.includes('402')) {
        toast.error('Créditos agotados. Añade más créditos.');
      } else {
        toast.error('Error al generar guion');
      }
    }
    setGenerating(false);
  }

  // Script Doctor analysis
  async function analyzeWithDoctor() {
    if (!scriptText.trim() || scriptText.length < 200) {
      toast.error('El guion debe tener al menos 200 caracteres');
      return;
    }
    setAnalyzing(true);
    setDoctorSuggestions([]);
    setDoctorScore(null);
    try {
      const { data, error } = await supabase.functions.invoke('script-doctor', {
        body: {
          scriptText,
          language: 'es-ES'
        }
      });
      if (error) throw error;
      if (data?.analysis) {
        setDoctorScore(data.analysis.overall_assessment?.score || null);
        setDoctorSuggestions(data.analysis.suggestions || []);
        toast.success(`Análisis completado: ${data.analysis.suggestions?.length || 0} sugerencias`);
      }
    } catch (err: any) {
      console.error('Error analyzing script:', err);
      toast.error('Error al analizar guion');
    }
    setAnalyzing(false);
  }

  // Script Breakdown
  async function runBreakdown() {
    if (!scriptText.trim() || scriptText.length < 200) {
      toast.error('El guion debe tener al menos 200 caracteres');
      return;
    }
    setBreakingDown(true);
    try {
      const { data, error } = await supabase.functions.invoke('script-breakdown', {
        body: {
          scriptText,
          projectId,
          language: 'es-ES'
        }
      });
      if (error) throw error;
      if (data?.breakdown) {
        const b = data.breakdown;
        setBreakdownCharacters((b.characters || []).map((c: any) => ({ ...c, selected: c.priority === 'P0' })));
        setBreakdownLocations((b.locations || []).map((l: any) => ({ ...l, selected: l.priority === 'P0' })));
        setBreakdownProps((b.props || []).map((p: any) => ({ ...p, selected: p.importance === 'key' })));
        setBreakdownWardrobe((b.wardrobe || []).map((w: any) => ({ ...w, selected: true })));
        setBreakdownVfx((b.vfx_sfx || []).map((v: any) => ({ ...v, selected: false })));
        setBreakdownSound((b.sound_music || []).map((s: any) => ({ ...s, selected: false })));
        setBreakdownScenes(b.scenes || []);
        toast.success(`Breakdown completado: ${b.characters?.length || 0} personajes, ${b.locations?.length || 0} localizaciones`);
        setActiveTab('breakdown');
      }
    } catch (err: any) {
      console.error('Error in breakdown:', err);
      toast.error('Error en el breakdown');
    }
    setBreakingDown(false);
  }

  // Create selected entities from breakdown
  async function createSelectedEntities() {
    setCreatingEntities(true);
    let created = { characters: 0, locations: 0, props: 0, wardrobe: 0 };
    try {
      // Create characters
      const selectedChars = breakdownCharacters.filter(c => c.selected);
      for (const char of selectedChars) {
        const { error } = await supabase.from('characters').insert({
          project_id: projectId,
          name: char.name,
          role: char.description || null,
          character_role: char.role === 'protagonist' ? 'protagonist' : char.role === 'antagonist' ? 'protagonist' : 'recurring',
          bio: char.description || null,
          arc: (char as any).arc || null
        });
        if (!error) created.characters++;
      }

      // Create locations
      const selectedLocs = breakdownLocations.filter(l => l.selected);
      for (const loc of selectedLocs) {
        const { error } = await supabase.from('locations').insert({
          project_id: projectId,
          name: loc.name,
          description: loc.description || null,
          variants: { day: true, night: true, weather: ['clear'] }
        });
        if (!error) created.locations++;
      }

      // Create props
      const selectedProps = breakdownProps.filter(p => p.selected);
      for (const prop of selectedProps) {
        const { error } = await supabase.from('props').insert({
          project_id: projectId,
          name: prop.name,
          prop_type: prop.type || 'other',
          description: prop.description || null
        });
        if (!error) created.props++;
      }

      toast.success(`Creados: ${created.characters} personajes, ${created.locations} localizaciones, ${created.props} props`);
      
      // Refresh existing entities
      const [charsRes, locsRes] = await Promise.all([
        supabase.from('characters').select('id, name').eq('project_id', projectId),
        supabase.from('locations').select('id, name').eq('project_id', projectId)
      ]);
      if (charsRes.data) setExistingCharacters(charsRes.data);
      if (locsRes.data) setExistingLocations(locsRes.data);
      
    } catch (err) {
      console.error('Error creating entities:', err);
      toast.error('Error al crear entidades');
    }
    setCreatingEntities(false);
  }

  // Lock/unlock script
  async function toggleScriptLock() {
    if (!currentScriptId) {
      // Save script first
      const { data, error } = await supabase.from('scripts').insert({
        project_id: projectId,
        raw_text: scriptText,
        status: 'locked',
        version: 1
      }).select().single();
      if (error) {
        toast.error('Error al guardar guion');
        return;
      }
      setCurrentScriptId(data.id);
      setScriptLocked(true);
      toast.success('Guion guardado y congelado');
    } else {
      const newStatus = scriptLocked ? 'draft' : 'locked';
      const { error } = await supabase.from('scripts').update({ status: newStatus }).eq('id', currentScriptId);
      if (error) {
        toast.error('Error al cambiar estado');
        return;
      }
      setScriptLocked(!scriptLocked);
      toast.success(scriptLocked ? 'Guion desbloqueado' : 'Guion congelado');
    }
  }

  // Parse script (existing)
  async function parseScript() {
    if (!scriptText.trim()) {
      toast.error('Pega tu guion primero');
      return;
    }
    setParsing(true);
    try {
      const { data, error } = await supabase.functions.invoke('parse-script', {
        body: { scriptText, projectId }
      });
      if (error) throw error;
      if (data?.scenes) {
        setParsedScenes(data.scenes);
        toast.success(`Encontradas ${data.scenes.length} escenas`);
      }
    } catch (err) {
      console.error('Parse error:', err);
      toast.error('Error al parsear guion');
    }
    setParsing(false);
  }

  // Import scenes (existing)
  async function importScenes() {
    if (parsedScenes.length === 0) return;
    setImporting(true);
    try {
      let scriptId = currentScriptId;
      if (!scriptId) {
        const { data: script, error } = await supabase.from('scripts').insert({
          project_id: projectId,
          raw_text: scriptText,
          version: 1
        }).select().single();
        if (error) throw error;
        scriptId = script.id;
        setCurrentScriptId(scriptId);
      }

      const scenesToInsert = parsedScenes.map((scene, index) => ({
        project_id: projectId,
        script_id: scriptId,
        episode_no: parseInt(selectedEpisode),
        scene_no: index + 1,
        slugline: scene.slugline,
        summary: scene.summary,
        time_of_day: scene.time_of_day,
        character_ids: linkedCharacters[index] || [],
        location_id: linkedLocations[index] || null,
      }));

      const { data: createdScenes, error } = await supabase.from('scenes').insert(scenesToInsert).select();
      if (error) throw error;

      if (createdScenes) {
        const shotsToInsert: any[] = [];
        createdScenes.forEach((scene, sceneIndex) => {
          const parsedScene = parsedScenes[sceneIndex];
          const shotCount = Math.max(2, Math.min(parsedScene.dialogue_count, 8));
          for (let i = 0; i < shotCount; i++) {
            shotsToInsert.push({
              scene_id: scene.id,
              shot_no: i + 1,
              shot_type: i === 0 ? 'wide' : i === shotCount - 1 ? 'close-up' : 'medium',
              duration_target: 3.0,
            });
          }
        });
        if (shotsToInsert.length > 0) {
          await supabase.from('shots').insert(shotsToInsert);
        }
      }

      toast.success(`Importadas ${parsedScenes.length} escenas`);
      setParsedScenes([]);
      onScenesCreated?.();
    } catch (err) {
      console.error('Import error:', err);
      toast.error('Error al importar escenas');
    }
    setImporting(false);
  }

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-500/20 text-red-600 border-red-500/30';
      case 'high': return 'bg-orange-500/20 text-orange-600 border-orange-500/30';
      case 'medium': return 'bg-yellow-500/20 text-yellow-600 border-yellow-500/30';
      default: return 'bg-blue-500/20 text-blue-600 border-blue-500/30';
    }
  };

  const toggleEntitySelection = (type: string, index: number) => {
    switch (type) {
      case 'characters':
        setBreakdownCharacters(prev => prev.map((c, i) => i === index ? { ...c, selected: !c.selected } : c));
        break;
      case 'locations':
        setBreakdownLocations(prev => prev.map((l, i) => i === index ? { ...l, selected: !l.selected } : l));
        break;
      case 'props':
        setBreakdownProps(prev => prev.map((p, i) => i === index ? { ...p, selected: !p.selected } : p));
        break;
    }
  };

  const selectAllP0 = () => {
    setBreakdownCharacters(prev => prev.map(c => ({ ...c, selected: c.priority === 'P0' })));
    setBreakdownLocations(prev => prev.map(l => ({ ...l, selected: l.priority === 'P0' })));
    setBreakdownProps(prev => prev.map(p => ({ ...p, selected: (p as any).importance === 'key' })));
  };

  const selectAll = () => {
    setBreakdownCharacters(prev => prev.map(c => ({ ...c, selected: true })));
    setBreakdownLocations(prev => prev.map(l => ({ ...l, selected: true })));
    setBreakdownProps(prev => prev.map(p => ({ ...p, selected: true })));
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Script Pipeline</h2>
          <p className="text-sm text-muted-foreground">
            Genera, analiza y desglosa tu guion para producción
          </p>
        </div>
        <div className="flex items-center gap-2">
          {scriptText.length > 0 && (
            <Button 
              variant={scriptLocked ? "default" : "outline"} 
              size="sm"
              onClick={toggleScriptLock}
            >
              {scriptLocked ? <Lock className="w-4 h-4 mr-2" /> : <Unlock className="w-4 h-4 mr-2" />}
              {scriptLocked ? 'Congelado' : 'Congelar Guion'}
            </Button>
          )}
        </div>
      </div>

      {/* Bible stats */}
      {(existingCharacters.length > 0 || existingLocations.length > 0) && (
        <div className="flex gap-4 p-3 bg-muted/30 rounded-lg">
          <div className="flex items-center gap-2 text-sm">
            <Users className="w-4 h-4 text-primary" />
            <span>{existingCharacters.length} personajes</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <MapPin className="w-4 h-4 text-primary" />
            <span>{existingLocations.length} localizaciones</span>
          </div>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="generate" className="flex items-center gap-2">
            <Lightbulb className="w-4 h-4" />
            Generar
          </TabsTrigger>
          <TabsTrigger value="import" className="flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Importar
          </TabsTrigger>
          <TabsTrigger value="doctor" className="flex items-center gap-2">
            <Stethoscope className="w-4 h-4" />
            Doctor
          </TabsTrigger>
          <TabsTrigger value="breakdown" className="flex items-center gap-2">
            <Layers className="w-4 h-4" />
            Breakdown
          </TabsTrigger>
        </TabsList>

        {/* GENERATE TAB */}
        <TabsContent value="generate" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Lightbulb className="w-5 h-5 text-amber-500" />
                Generar Guion desde Idea
              </CardTitle>
              <CardDescription>
                Describe tu idea y deja que la IA genere un guion profesional completo
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Tu idea</Label>
                <Textarea
                  placeholder="Ej: Una detective de homicidios descubre que su padre, un policía retirado, podría estar involucrado en una serie de asesinatos sin resolver de hace 20 años..."
                  value={ideaText}
                  onChange={(e) => setIdeaText(e.target.value)}
                  className="min-h-[120px]"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Género</Label>
                  <Select value={genre} onValueChange={setGenre}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="drama">Drama</SelectItem>
                      <SelectItem value="thriller">Thriller</SelectItem>
                      <SelectItem value="comedy">Comedia</SelectItem>
                      <SelectItem value="action">Acción</SelectItem>
                      <SelectItem value="horror">Terror</SelectItem>
                      <SelectItem value="sci-fi">Ciencia Ficción</SelectItem>
                      <SelectItem value="romance">Romance</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Tono</Label>
                  <Select value={tone} onValueChange={setTone}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Cinematográfico realista">Cinematográfico realista</SelectItem>
                      <SelectItem value="Oscuro y tenso">Oscuro y tenso</SelectItem>
                      <SelectItem value="Ligero y entretenido">Ligero y entretenido</SelectItem>
                      <SelectItem value="Épico y grandioso">Épico y grandioso</SelectItem>
                      <SelectItem value="Intimista y emocional">Intimista y emocional</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button variant="gold" onClick={generateFromIdea} disabled={generating || !ideaText.trim()}>
                {generating ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Generando guion...</>
                ) : (
                  <><Wand2 className="w-4 h-4 mr-2" />Generar Guion con IA</>
                )}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* IMPORT TAB */}
        <TabsContent value="import" className="space-y-4">
          <div className="space-y-2">
            <Label>Episodio</Label>
            <Select value={selectedEpisode} onValueChange={setSelectedEpisode}>
              <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Array.from({ length: episodesCount }, (_, i) => (
                  <SelectItem key={i + 1} value={String(i + 1)}>Episodio {i + 1}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Guion
                {scriptLocked && <Badge variant="secondary"><Lock className="w-3 h-3 mr-1" />Congelado</Badge>}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                placeholder="INT. CAFETERÍA - DÍA&#10;&#10;SARA (30s) espera nerviosa..."
                value={scriptText}
                onChange={(e) => setScriptText(e.target.value)}
                className="min-h-[300px] font-mono text-sm"
                disabled={scriptLocked}
              />
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">{scriptText.length} caracteres</p>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={runBreakdown} disabled={breakingDown || scriptText.length < 200}>
                    {breakingDown ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Layers className="w-4 h-4 mr-2" />}
                    Breakdown
                  </Button>
                  <Button variant="outline" onClick={analyzeWithDoctor} disabled={analyzing || scriptText.length < 200}>
                    {analyzing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Stethoscope className="w-4 h-4 mr-2" />}
                    Script Doctor
                  </Button>
                  <Button variant="gold" onClick={parseScript} disabled={parsing || !scriptText.trim()}>
                    {parsing ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Analizando...</> : <><Wand2 className="w-4 h-4 mr-2" />Parsear Escenas</>}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {parsedScenes.length > 0 && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-qc-pass" />
                    {parsedScenes.length} Escenas Detectadas
                  </CardTitle>
                  <Button variant="gold" onClick={importScenes} disabled={importing}>
                    {importing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                    Importar Escenas
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[300px]">
                  <div className="space-y-2">
                    {parsedScenes.map((scene, i) => (
                      <div key={i} className="p-3 rounded-lg border bg-card">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="outline">#{i + 1}</Badge>
                          <Badge variant={scene.time_of_day === 'night' ? 'secondary' : 'default'}>{scene.time_of_day}</Badge>
                        </div>
                        <h4 className="font-medium text-sm">{scene.slugline}</h4>
                        <p className="text-xs text-muted-foreground mt-1">{scene.summary}</p>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* DOCTOR TAB */}
        <TabsContent value="doctor" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Stethoscope className="w-5 h-5 text-blue-500" />
                    Script Doctor
                    {doctorScore !== null && (
                      <Badge variant={doctorScore >= 80 ? 'default' : doctorScore >= 60 ? 'secondary' : 'destructive'}>
                        Score: {doctorScore}/100
                      </Badge>
                    )}
                  </CardTitle>
                  <CardDescription>Análisis profesional del guion con sugerencias accionables</CardDescription>
                </div>
                <Button variant="outline" onClick={analyzeWithDoctor} disabled={analyzing || scriptText.length < 200}>
                  {analyzing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Wand2 className="w-4 h-4 mr-2" />}
                  Analizar
                </Button>
              </div>
            </CardHeader>
            {doctorSuggestions.length > 0 && (
              <CardContent>
                <ScrollArea className="h-[400px]">
                  <div className="space-y-3">
                    {doctorSuggestions.map((s, i) => (
                      <div key={i} className="p-3 rounded-lg border">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge className={getSeverityColor(s.severity)}>{s.severity}</Badge>
                          <Badge variant="outline">{s.category}</Badge>
                          {s.location && <span className="text-xs text-muted-foreground">{s.location}</span>}
                        </div>
                        <p className="font-medium text-sm">{s.issue}</p>
                        <p className="text-xs text-muted-foreground mt-1">{s.reason}</p>
                        <div className="mt-2 p-2 bg-primary/5 rounded text-sm">
                          <strong>Sugerencia:</strong> {s.suggestion}
                        </div>
                        {s.rewrite_snippet && (
                          <pre className="mt-2 p-2 bg-muted rounded text-xs overflow-x-auto">{s.rewrite_snippet}</pre>
                        )}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            )}
          </Card>
        </TabsContent>

        {/* BREAKDOWN TAB */}
        <TabsContent value="breakdown" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Layers className="w-5 h-5 text-purple-500" />
                    Breakdown de Producción
                  </CardTitle>
                  <CardDescription>Selecciona las entidades a crear en la Biblia del proyecto</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={selectAllP0}>Solo P0</Button>
                  <Button variant="outline" size="sm" onClick={selectAll}>Seleccionar Todo</Button>
                  <Button variant="gold" onClick={createSelectedEntities} disabled={creatingEntities}>
                    {creatingEntities ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Package className="w-4 h-4 mr-2" />}
                    Crear Seleccionados
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {breakdownCharacters.length === 0 && breakdownLocations.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Layers className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>Ejecuta el Breakdown en la pestaña Importar para extraer entidades</p>
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {/* Characters */}
                  <div className="space-y-2">
                    <h4 className="font-medium flex items-center gap-2">
                      <Users className="w-4 h-4" />
                      Personajes ({breakdownCharacters.filter(c => c.selected).length}/{breakdownCharacters.length})
                    </h4>
                    <ScrollArea className="h-[200px] border rounded-lg p-2">
                      {breakdownCharacters.map((char, i) => (
                        <label key={i} className="flex items-center gap-2 p-2 hover:bg-muted/50 rounded cursor-pointer">
                          <Checkbox checked={char.selected} onCheckedChange={() => toggleEntitySelection('characters', i)} />
                          <span className="flex-1">{char.name}</span>
                          {char.priority && <Badge variant="outline" className="text-xs">{char.priority}</Badge>}
                        </label>
                      ))}
                    </ScrollArea>
                  </div>

                  {/* Locations */}
                  <div className="space-y-2">
                    <h4 className="font-medium flex items-center gap-2">
                      <MapPin className="w-4 h-4" />
                      Localizaciones ({breakdownLocations.filter(l => l.selected).length}/{breakdownLocations.length})
                    </h4>
                    <ScrollArea className="h-[200px] border rounded-lg p-2">
                      {breakdownLocations.map((loc, i) => (
                        <label key={i} className="flex items-center gap-2 p-2 hover:bg-muted/50 rounded cursor-pointer">
                          <Checkbox checked={loc.selected} onCheckedChange={() => toggleEntitySelection('locations', i)} />
                          <span className="flex-1">{loc.name}</span>
                          {loc.priority && <Badge variant="outline" className="text-xs">{loc.priority}</Badge>}
                        </label>
                      ))}
                    </ScrollArea>
                  </div>

                  {/* Props */}
                  <div className="space-y-2">
                    <h4 className="font-medium flex items-center gap-2">
                      <Package className="w-4 h-4" />
                      Props ({breakdownProps.filter(p => p.selected).length}/{breakdownProps.length})
                    </h4>
                    <ScrollArea className="h-[200px] border rounded-lg p-2">
                      {breakdownProps.map((prop, i) => (
                        <label key={i} className="flex items-center gap-2 p-2 hover:bg-muted/50 rounded cursor-pointer">
                          <Checkbox checked={prop.selected} onCheckedChange={() => toggleEntitySelection('props', i)} />
                          <span className="flex-1">{prop.name}</span>
                          {(prop as any).importance && <Badge variant="outline" className="text-xs">{(prop as any).importance}</Badge>}
                        </label>
                      ))}
                    </ScrollArea>
                  </div>

                  {/* Scenes summary */}
                  <div className="space-y-2">
                    <h4 className="font-medium flex items-center gap-2">
                      <Film className="w-4 h-4" />
                      Escenas Detectadas ({breakdownScenes.length})
                    </h4>
                    <ScrollArea className="h-[200px] border rounded-lg p-2">
                      {breakdownScenes.map((scene, i) => (
                        <div key={i} className="p-2 border-b last:border-0">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">#{scene.scene_number || i + 1}</Badge>
                            <span className="text-sm truncate">{scene.slugline}</span>
                          </div>
                        </div>
                      ))}
                    </ScrollArea>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
