/**
 * Series Bible Panel
 * 
 * Displays and allows editing of the generated series bible
 * Includes logline, character arcs, season structure, and episode template
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { 
  BookOpen, Users, Swords, Calendar, FileText, Sparkles, 
  Loader2, RefreshCw, Download, CheckCircle2, AlertTriangle,
  ChevronRight
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { invokeAuthedFunction } from '@/lib/invokeAuthedFunction';
import { SeriesBibleExport } from './SeriesBibleExport';

interface SeriesBiblePanelProps {
  projectId: string;
  scriptId?: string;
}

interface ArtifactRule {
  rule: string;
  source: string;
}

interface UndefinedAspect {
  aspect: string;
  safe_option: string;
  bold_option: string;
}

interface CharacterArc {
  name: string;
  role: 'protagonist' | 'recurring' | 'antagonist';
  desire: string;
  wound: string;
  mask: string;
  red_line: string;
  season_arc: string;
}

interface EpisodeSynopsis {
  number: number;
  title_suggestion: string;
  synopsis: string;
  stake_level: 'low' | 'medium' | 'high' | 'explosive';
  is_bottle: boolean;
}

interface SeriesBible {
  id: string;
  logline: string;
  premise: string;
  artifact_rules: {
    confirmed: ArtifactRule[];
    undefined: UndefinedAspect[];
  } | null;
  character_arcs: CharacterArc[] | null;
  antagonism: {
    primary_forces?: string[];
    systemic_threats?: string[];
    internal_conflicts?: string[];
  } | null;
  season_structure: {
    episode_count?: number;
    season_logline?: string;
    season_theme?: string;
    episodes?: EpisodeSynopsis[];
    season_cliffhanger?: string;
  } | null;
  episode_template: {
    teaser?: string;
    act_1_tentacion?: string;
    act_2_intervencion?: string;
    act_3_coste?: string;
    tag?: string;
  } | null;
  tone_guidelines: {
    promises?: string[];
    red_lines?: string[];
  } | null;
  status: 'draft' | 'approved' | 'archived';
  version: number;
  created_at: string;
}

const STAKE_COLORS: Record<string, string> = {
  low: 'bg-green-100 text-green-800',
  medium: 'bg-yellow-100 text-yellow-800',
  high: 'bg-orange-100 text-orange-800',
  explosive: 'bg-red-100 text-red-800'
};

export function SeriesBiblePanel({ projectId, scriptId }: SeriesBiblePanelProps) {
  const [bible, setBible] = useState<SeriesBible | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [showExport, setShowExport] = useState(false);

  useEffect(() => {
    loadBible();
  }, [projectId]);

  const loadBible = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('series_bibles')
        .select('*')
        .eq('project_id', projectId)
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      
      if (data) {
        setBible({
          id: data.id,
          logline: data.logline || '',
          premise: data.premise || '',
          artifact_rules: (data.artifact_rules as unknown as SeriesBible['artifact_rules']) || { confirmed: [], undefined: [] },
          character_arcs: (data.character_arcs as unknown as CharacterArc[]) || [],
          antagonism: (data.antagonism as unknown as SeriesBible['antagonism']) || {},
          season_structure: (data.season_structure as unknown as SeriesBible['season_structure']) || {},
          episode_template: (data.episode_template as unknown as SeriesBible['episode_template']) || {},
          tone_guidelines: (data.tone_guidelines as unknown as SeriesBible['tone_guidelines']) || { promises: [], red_lines: [] },
          status: (data.status || 'draft') as 'draft' | 'approved' | 'archived',
          version: data.version || 1,
          created_at: data.created_at || ''
        });
      }
    } catch (error) {
      console.error('Error loading bible:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const response = await invokeAuthedFunction('generate-series-bible', {
        projectId,
        scriptId,
        episodeCount: 8
      }) as { ok?: boolean; error?: string };

      if (!response.ok) {
        throw new Error(response.error || 'Error al generar la biblia');
      }

      toast.success('Biblia de serie generada correctamente');
      await loadBible();
    } catch (error) {
      console.error('Generate bible error:', error);
      toast.error('Error al generar la biblia de serie');
    } finally {
      setGenerating(false);
    }
  };

  const handleApprove = async () => {
    if (!bible) return;
    
    try {
      const { error } = await supabase
        .from('series_bibles')
        .update({ status: 'approved' })
        .eq('id', bible.id);

      if (error) throw error;
      
      setBible({ ...bible, status: 'approved' });
      toast.success('Biblia aprobada');
    } catch (error) {
      console.error('Approve error:', error);
      toast.error('Error al aprobar la biblia');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!bible) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <BookOpen className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">No hay Biblia de Serie</h3>
          <p className="text-sm text-muted-foreground text-center mb-6 max-w-md">
            Genera una biblia de serie completa a partir del guion existente. 
            Incluye arcos de personajes, estructura de temporada y motor de episodios.
          </p>
          <Button onClick={handleGenerate} disabled={generating}>
            {generating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Generando...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                Generar Biblia de Serie
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <h2 className="text-2xl font-bold">Biblia de Serie</h2>
            <Badge variant={bible.status === 'approved' ? 'default' : 'secondary'}>
              {bible.status === 'approved' ? 'Aprobada' : 'Borrador'}
            </Badge>
            <Badge variant="outline">v{bible.version}</Badge>
          </div>
          <p className="text-muted-foreground">{bible.logline}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowExport(true)}>
            <Download className="h-4 w-4 mr-2" />
            Exportar
          </Button>
          <Button variant="outline" onClick={handleGenerate} disabled={generating}>
            <RefreshCw className={`h-4 w-4 mr-2 ${generating ? 'animate-spin' : ''}`} />
            Regenerar
          </Button>
          {bible.status !== 'approved' && (
            <Button onClick={handleApprove}>
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Aprobar
            </Button>
          )}
        </div>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList>
          <TabsTrigger value="overview">Visión General</TabsTrigger>
          <TabsTrigger value="characters">Personajes</TabsTrigger>
          <TabsTrigger value="rules">Reglas del Artefacto</TabsTrigger>
          <TabsTrigger value="season">Temporada</TabsTrigger>
          <TabsTrigger value="template">Plantilla</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {/* Premise */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Premisa</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm">{bible.premise}</p>
            </CardContent>
          </Card>

          {/* Antagonism */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Swords className="h-4 w-4" />
                Fuerzas Antagonistas
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h4 className="text-sm font-medium mb-2">Fuerzas primarias</h4>
                <div className="flex flex-wrap gap-2">
                  {bible.antagonism?.primary_forces?.map((force, i) => (
                    <Badge key={i} variant="destructive">{force}</Badge>
                  ))}
                </div>
              </div>
              <div>
                <h4 className="text-sm font-medium mb-2">Amenazas sistémicas</h4>
                <div className="flex flex-wrap gap-2">
                  {bible.antagonism?.systemic_threats?.map((threat, i) => (
                    <Badge key={i} variant="outline">{threat}</Badge>
                  ))}
                </div>
              </div>
              <div>
                <h4 className="text-sm font-medium mb-2">Conflictos internos</h4>
                <div className="flex flex-wrap gap-2">
                  {bible.antagonism?.internal_conflicts?.map((conflict, i) => (
                    <Badge key={i} variant="secondary">{conflict}</Badge>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Tone Guidelines */}
          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base text-green-700">Promesas (siempre entregamos)</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {bible.tone_guidelines?.promises?.map((promise, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                      {promise}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base text-red-700">Líneas rojas (nunca hacemos)</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {bible.tone_guidelines?.red_lines?.map((line, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                      {line}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="characters">
          <div className="grid gap-4">
            {bible.character_arcs?.map((character, i) => (
              <Card key={i}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      {character.name}
                    </CardTitle>
                    <Badge variant={character.role === 'protagonist' ? 'default' : 'secondary'}>
                      {character.role}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid md:grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="font-medium text-muted-foreground">Deseo:</span>
                      <p>{character.desire}</p>
                    </div>
                    <div>
                      <span className="font-medium text-muted-foreground">Herida:</span>
                      <p>{character.wound}</p>
                    </div>
                    <div>
                      <span className="font-medium text-muted-foreground">Máscara:</span>
                      <p>{character.mask}</p>
                    </div>
                    <div>
                      <span className="font-medium text-muted-foreground">Línea roja:</span>
                      <p className="text-red-700">{character.red_line}</p>
                    </div>
                  </div>
                  <Separator />
                  <div className="text-sm">
                    <span className="font-medium text-muted-foreground">Arco de temporada:</span>
                    <p className="mt-1">{character.season_arc}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="rules">
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base text-green-700">Reglas confirmadas</CardTitle>
                <CardDescription>Extraídas del guion existente</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {bible.artifact_rules?.confirmed?.map((rule, i) => (
                    <div key={i} className="flex items-start gap-3 p-3 bg-green-50 rounded-lg">
                      <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-sm font-medium">{rule.rule}</p>
                        <p className="text-xs text-muted-foreground mt-1">Fuente: {rule.source}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base text-amber-700">Aspectos indefinidos</CardTitle>
                <CardDescription>Requieren decisión del showrunner</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {bible.artifact_rules?.undefined?.map((aspect, i) => (
                    <div key={i} className="p-4 border rounded-lg">
                      <p className="font-medium mb-3">{aspect.aspect}</p>
                      <div className="grid md:grid-cols-2 gap-3">
                        <div className="p-3 bg-blue-50 rounded border-l-4 border-blue-400">
                          <Badge className="mb-2 bg-blue-500">SAFE</Badge>
                          <p className="text-sm">{aspect.safe_option}</p>
                        </div>
                        <div className="p-3 bg-purple-50 rounded border-l-4 border-purple-400">
                          <Badge className="mb-2 bg-purple-500">BOLD</Badge>
                          <p className="text-sm">{aspect.bold_option}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="season">
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Temporada 1</CardTitle>
                <CardDescription>{bible.season_structure?.season_theme}</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm mb-4">{bible.season_structure?.season_logline}</p>
                <div className="space-y-3">
                  {bible.season_structure?.episodes?.map((ep) => (
                    <div 
                      key={ep.number}
                      className="flex items-start gap-3 p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-bold text-sm shrink-0">
                        {ep.number}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium">{ep.title_suggestion}</span>
                          <Badge className={STAKE_COLORS[ep.stake_level]}>
                            {ep.stake_level}
                          </Badge>
                          {ep.is_bottle && (
                            <Badge variant="outline">bottle</Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">{ep.synopsis}</p>
                      </div>
                      <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
                    </div>
                  ))}
                </div>
                <Separator className="my-4" />
                <div className="p-3 bg-red-50 rounded-lg border-l-4 border-red-400">
                  <p className="text-sm font-medium text-red-800">Cliffhanger de temporada:</p>
                  <p className="text-sm mt-1">{bible.season_structure?.season_cliffhanger}</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="template">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Plantilla de Episodio
              </CardTitle>
              <CardDescription>Estructura repetible para cada episodio</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="p-4 border rounded-lg">
                  <Badge className="mb-2">TEASER</Badge>
                  <p className="text-sm">{bible.episode_template?.teaser}</p>
                </div>
                <div className="p-4 border rounded-lg">
                  <Badge className="mb-2" variant="outline">ACTO 1 — Tentación</Badge>
                  <p className="text-sm">{bible.episode_template?.act_1_tentacion}</p>
                </div>
                <div className="p-4 border rounded-lg">
                  <Badge className="mb-2" variant="outline">ACTO 2 — Intervención</Badge>
                  <p className="text-sm">{bible.episode_template?.act_2_intervencion}</p>
                </div>
                <div className="p-4 border rounded-lg">
                  <Badge className="mb-2" variant="outline">ACTO 3 — Coste</Badge>
                  <p className="text-sm">{bible.episode_template?.act_3_coste}</p>
                </div>
                <div className="p-4 border rounded-lg bg-muted/50">
                  <Badge className="mb-2" variant="secondary">TAG</Badge>
                  <p className="text-sm">{bible.episode_template?.tag}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {showExport && (
        <SeriesBibleExport 
          bible={bible} 
          open={showExport} 
          onOpenChange={setShowExport} 
        />
      )}
    </div>
  );
}
