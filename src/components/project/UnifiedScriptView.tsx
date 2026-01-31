/**
 * UnifiedScriptView - Página unificada de resultados 
 * Muestra estructura completa tanto para extracción como generación
 * Contiene: Estructura dramática, personajes, escenas, localizaciones, sinopsis, tramas
 */

import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import {
  Film,
  Users,
  MapPin,
  MessageSquare,
  BookOpen,
  Target,
  Clock,
  ChevronDown,
  ChevronUp,
  Play,
  Edit,
  FileDown,
  Share,
  Sparkles,
  Crown,
  Skull,
  UserCheck,
  Star,
  GitBranch,
  Clapperboard,
  Palette,
  RefreshCw,
  Zap
} from 'lucide-react';

interface UnifiedScriptViewProps {
  projectId: string;
  onContinueToProduction?: () => void;
}

interface AnalysisData {
  estructura_dramatica?: {
    tipo_detectado: string;
    acto_1?: { paginas: string; setup: string; inciting_incident?: { pagina: number; descripcion: string } };
    acto_2?: { paginas: string; confrontacion: string; plot_point_medio?: { pagina: number; descripcion: string } };
    acto_3?: { paginas: string; climax?: { pagina: number; descripcion: string }; resolucion: string };
  };
  personajes?: Array<{
    nombre: string;
    rol: string;
    arco_dramatico: string;
    caracterizacion: string;
    motivaciones: string;
    conflicto_interno: string;
    voz_distintiva: string;
    relaciones_clave: string[];
  }>;
  escenas?: Array<{
    numero: number;
    titulo: string;
    paginas: string;
    localizacion: string;
    funcion_dramatica: string;
    conflicto_central: string;
    estado_emocional: string;
    timing_estimado: string;
    personajes_presentes: string[];
  }>;
  localizaciones?: Array<{
    nombre: string;
    descripcion_completa: string;
    funcion_narrativa: string;
    simbolismo: string;
    mood_ambiente: string;
    frecuencia_uso: string;
    escenas_asociadas: string[];
  }>;
  analisis_dialogos?: {
    patrones_por_personaje: Record<string, string>;
    subtexto_principal: string[];
    revelaciones_clave: string[];
    beats_dramaticos: string[];
  };
  analisis_tematico?: {
    tema_central: string;
    temas_secundarios: string[];
    motifs_recurrentes: string[];
    simbolos_importantes: string[];
  };
  // For generated content
  title?: string;
  logline?: string;
  synopsis?: string;
  episodes?: any[];
}

export default function UnifiedScriptView({ projectId, onContinueToProduction }: UnifiedScriptViewProps) {
  const [analysisData, setAnalysisData] = useState<AnalysisData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openSections, setOpenSections] = useState({
    estructura: true,
    personajes: true,
    escenas: false,
    localizaciones: false,
    dialogos: false,
    temas: false
  });
  const navigate = useNavigate();

  useEffect(() => {
    loadAnalysisData();
  }, [projectId]);

  const loadAnalysisData = async () => {
    try {
      setLoading(true);
      
      // Try to get script analysis first (from extraction)
      const { data: scriptData } = await supabase
        .from('scripts')
        .select('parsed_json, raw_text')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (scriptData?.parsed_json) {
        setAnalysisData(scriptData.parsed_json as AnalysisData);
        return;
      }

      // If no script analysis, try generated outline data
      const { data: projectData } = await supabase
        .from('projects')
        .select('*')
        .eq('id', projectId)
        .single();

      if (projectData) {
        // Look for generated outline or episodes
        const { data: outlineData } = await supabase
          .from('scripts')
          .select('*')
          .eq('project_id', projectId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (outlineData?.parsed_json) {
          setAnalysisData(outlineData.parsed_json as AnalysisData);
        } else {
          setError('No hay datos de análisis disponibles');
        }
      }

    } catch (err) {
      console.error('Error loading analysis:', err);
      setError('Error cargando análisis del guión');
    } finally {
      setLoading(false);
    }
  };

  const toggleSection = (section: keyof typeof openSections) => {
    setOpenSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const getStructureTypeLabel = (tipo: string) => {
    switch (tipo) {
      case '3_actos': return 'Tres Actos Clásico';
      case '4_actos': return 'Cuatro Actos';
      case '5_actos': return 'Cinco Actos';
      case 'save_the_cat': return 'Save the Cat (8 beats)';
      default: return tipo;
    }
  };

  const getRoleIcon = (rol: string) => {
    switch (rol.toLowerCase()) {
      case 'protagonista': return <Crown className="h-4 w-4 text-yellow-500" />;
      case 'antagonista': return <Skull className="h-4 w-4 text-red-500" />;
      case 'mentor': return <UserCheck className="h-4 w-4 text-blue-500" />;
      case 'aliado': return <Star className="h-4 w-4 text-green-500" />;
      case 'guardian': return <GitBranch className="h-4 w-4 text-purple-500" />;
      default: return <Users className="h-4 w-4 text-gray-500" />;
    }
  };

  const getFrequencyColor = (freq: string) => {
    switch (freq.toLowerCase()) {
      case 'alta': return 'bg-red-100 text-red-800';
      case 'media': return 'bg-yellow-100 text-yellow-800';
      case 'baja': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-blue-500" />
          <p>Cargando análisis del guión...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="mx-4 my-8">
        <CardContent className="pt-6">
          <div className="text-center text-gray-500">
            <Film className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>{error}</p>
            <Button onClick={loadAnalysisData} variant="outline" className="mt-4">
              <RefreshCw className="h-4 w-4 mr-2" />
              Recargar
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!analysisData) {
    return (
      <Card className="mx-4 my-8">
        <CardContent className="pt-6">
          <div className="text-center text-gray-500">
            <Film className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No hay análisis disponible para este proyecto</p>
            <div className="mt-4">
              <Button 
                onClick={() => navigate(`/projects/${projectId}/script`)}
                variant="outline"
              >
                Volver a Análisis
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl space-y-8">
      {/* Header con título y acciones */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            {analysisData.title || 'Análisis del Guión'}
          </h1>
          {analysisData.logline && (
            <p className="text-lg text-gray-600 mt-2">{analysisData.logline}</p>
          )}
        </div>
        <div className="flex gap-3">
          <Button onClick={() => navigate(`/projects/${projectId}/scenes`)}>
            <Clapperboard className="h-4 w-4 mr-2" />
            Continuar a Producción
          </Button>
          <Button variant="outline">
            <FileDown className="h-4 w-4 mr-2" />
            Exportar PDF
          </Button>
        </div>
      </div>

      {/* Sinopsis si existe */}
      {analysisData.synopsis && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5" />
              Sinopsis
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-700 leading-relaxed">{analysisData.synopsis}</p>
          </CardContent>
        </Card>
      )}

      {/* Tabs principales */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Visión General</TabsTrigger>
          <TabsTrigger value="narrative">Narrativa</TabsTrigger>
          <TabsTrigger value="production">Producción</TabsTrigger>
          <TabsTrigger value="themes">Temas</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {/* Estructura Dramática */}
          {analysisData.estructura_dramatica && (
            <Card>
              <Collapsible 
                open={openSections.estructura} 
                onOpenChange={() => toggleSection('estructura')}
              >
                <CollapsibleTrigger asChild>
                  <CardHeader className="cursor-pointer hover:bg-gray-50">
                    <CardTitle className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Film className="h-5 w-5" />
                        Estructura Dramática
                        <Badge variant="secondary">
                          {getStructureTypeLabel(analysisData.estructura_dramatica.tipo_detectado)}
                        </Badge>
                      </div>
                      {openSections.estructura ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </CardTitle>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="space-y-6">
                    {/* Actos */}
                    <div className="grid gap-6 md:grid-cols-3">
                      {/* Acto 1 */}
                      {analysisData.estructura_dramatica.acto_1 && (
                        <div className="space-y-3">
                          <h4 className="font-semibold text-lg">Acto I - Setup</h4>
                          <Badge variant="outline">{analysisData.estructura_dramatica.acto_1.paginas}</Badge>
                          <p className="text-sm text-gray-600">{analysisData.estructura_dramatica.acto_1.setup}</p>
                          {analysisData.estructura_dramatica.acto_1.inciting_incident && (
                            <div className="bg-blue-50 p-3 rounded">
                              <h5 className="font-medium text-blue-900">Inciting Incident</h5>
                              <p className="text-sm text-blue-700">
                                Página {analysisData.estructura_dramatica.acto_1.inciting_incident.pagina}: {analysisData.estructura_dramatica.acto_1.inciting_incident.descripcion}
                              </p>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Acto 2 */}
                      {analysisData.estructura_dramatica.acto_2 && (
                        <div className="space-y-3">
                          <h4 className="font-semibold text-lg">Acto II - Confrontación</h4>
                          <Badge variant="outline">{analysisData.estructura_dramatica.acto_2.paginas}</Badge>
                          <p className="text-sm text-gray-600">{analysisData.estructura_dramatica.acto_2.confrontacion}</p>
                          {analysisData.estructura_dramatica.acto_2.plot_point_medio && (
                            <div className="bg-yellow-50 p-3 rounded">
                              <h5 className="font-medium text-yellow-900">Midpoint</h5>
                              <p className="text-sm text-yellow-700">
                                Página {analysisData.estructura_dramatica.acto_2.plot_point_medio.pagina}: {analysisData.estructura_dramatica.acto_2.plot_point_medio.descripcion}
                              </p>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Acto 3 */}
                      {analysisData.estructura_dramatica.acto_3 && (
                        <div className="space-y-3">
                          <h4 className="font-semibold text-lg">Acto III - Resolución</h4>
                          <Badge variant="outline">{analysisData.estructura_dramatica.acto_3.paginas}</Badge>
                          <p className="text-sm text-gray-600">{analysisData.estructura_dramatica.acto_3.resolucion}</p>
                          {analysisData.estructura_dramatica.acto_3.climax && (
                            <div className="bg-red-50 p-3 rounded">
                              <h5 className="font-medium text-red-900">Climax</h5>
                              <p className="text-sm text-red-700">
                                Página {analysisData.estructura_dramatica.acto_3.climax.pagina}: {analysisData.estructura_dramatica.acto_3.climax.descripcion}
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </CollapsibleContent>
              </Collapsible>
            </Card>
          )}

          {/* Personajes */}
          {analysisData.personajes && analysisData.personajes.length > 0 && (
            <Card>
              <Collapsible 
                open={openSections.personajes} 
                onOpenChange={() => toggleSection('personajes')}
              >
                <CollapsibleTrigger asChild>
                  <CardHeader className="cursor-pointer hover:bg-gray-50">
                    <CardTitle className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Users className="h-5 w-5" />
                        Personajes ({analysisData.personajes.length})
                      </div>
                      {openSections.personajes ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </CardTitle>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent>
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                      {analysisData.personajes.map((personaje, index) => (
                        <div key={index} className="border rounded-lg p-4 space-y-3">
                          <div className="flex items-center gap-2">
                            {getRoleIcon(personaje.rol)}
                            <h4 className="font-semibold">{personaje.nombre}</h4>
                            <Badge variant="outline" className="text-xs">
                              {personaje.rol}
                            </Badge>
                          </div>
                          
                          <div className="space-y-2 text-sm">
                            <div>
                              <span className="font-medium text-gray-700">Caracterización:</span>
                              <p className="text-gray-600">{personaje.caracterizacion}</p>
                            </div>
                            
                            <div>
                              <span className="font-medium text-gray-700">Arco dramático:</span>
                              <p className="text-gray-600">{personaje.arco_dramatico}</p>
                            </div>
                            
                            <div>
                              <span className="font-medium text-gray-700">Motivaciones:</span>
                              <p className="text-gray-600">{personaje.motivaciones}</p>
                            </div>

                            {personaje.conflicto_interno && (
                              <div>
                                <span className="font-medium text-gray-700">Conflicto interno:</span>
                                <p className="text-gray-600">{personaje.conflicto_interno}</p>
                              </div>
                            )}

                            {personaje.voz_distintiva && (
                              <div>
                                <span className="font-medium text-gray-700">Voz distintiva:</span>
                                <p className="text-gray-600">{personaje.voz_distintiva}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </CollapsibleContent>
              </Collapsible>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="narrative" className="space-y-6">
          {/* Escenas */}
          {analysisData.escenas && analysisData.escenas.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clapperboard className="h-5 w-5" />
                  Escenas ({analysisData.escenas.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[500px]">
                  <div className="space-y-4">
                    {analysisData.escenas.map((escena, index) => (
                      <div key={index} className="border rounded-lg p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <h4 className="font-semibold">
                            Escena {escena.numero}: {escena.titulo}
                          </h4>
                          <div className="flex gap-2">
                            <Badge variant="outline">{escena.paginas}</Badge>
                            <Badge variant="secondary">{escena.timing_estimado}</Badge>
                          </div>
                        </div>
                        
                        <div className="grid gap-3 md:grid-cols-2">
                          <div>
                            <span className="font-medium text-gray-700">Localización:</span>
                            <p className="text-gray-600">{escena.localizacion}</p>
                          </div>
                          
                          <div>
                            <span className="font-medium text-gray-700">Estado emocional:</span>
                            <p className="text-gray-600">{escena.estado_emocional}</p>
                          </div>
                          
                          <div className="md:col-span-2">
                            <span className="font-medium text-gray-700">Función dramática:</span>
                            <p className="text-gray-600">{escena.funcion_dramatica}</p>
                          </div>
                          
                          <div className="md:col-span-2">
                            <span className="font-medium text-gray-700">Conflicto central:</span>
                            <p className="text-gray-600">{escena.conflicto_central}</p>
                          </div>

                          {escena.personajes_presentes && escena.personajes_presentes.length > 0 && (
                            <div className="md:col-span-2">
                              <span className="font-medium text-gray-700">Personajes:</span>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {escena.personajes_presentes.map((personaje, pIndex) => (
                                  <Badge key={pIndex} variant="outline" className="text-xs">
                                    {personaje}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="production" className="space-y-6">
          {/* Localizaciones */}
          {analysisData.localizaciones && analysisData.localizaciones.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="h-5 w-5" />
                  Localizaciones ({analysisData.localizaciones.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2">
                  {analysisData.localizaciones.map((loc, index) => (
                    <div key={index} className="border rounded-lg p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="font-semibold">{loc.nombre}</h4>
                        <Badge className={getFrequencyColor(loc.frecuencia_uso)}>
                          {loc.frecuencia_uso}
                        </Badge>
                      </div>
                      
                      <div className="space-y-2 text-sm">
                        <div>
                          <span className="font-medium text-gray-700">Descripción:</span>
                          <p className="text-gray-600">{loc.descripcion_completa}</p>
                        </div>
                        
                        <div>
                          <span className="font-medium text-gray-700">Función narrativa:</span>
                          <p className="text-gray-600">{loc.funcion_narrativa}</p>
                        </div>

                        {loc.simbolismo && (
                          <div>
                            <span className="font-medium text-gray-700">Simbolismo:</span>
                            <p className="text-gray-600">{loc.simbolismo}</p>
                          </div>
                        )}

                        <div>
                          <span className="font-medium text-gray-700">Ambiente:</span>
                          <p className="text-gray-600">{loc.mood_ambiente}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Análisis de Diálogos */}
          {analysisData.analisis_dialogos && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" />
                  Análisis de Diálogos
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {analysisData.analisis_dialogos.subtexto_principal && (
                  <div>
                    <h4 className="font-semibold mb-2">Subtexto Principal</h4>
                    <div className="space-y-1">
                      {analysisData.analisis_dialogos.subtexto_principal.map((subtexto, index) => (
                        <p key={index} className="text-gray-600 text-sm">• {subtexto}</p>
                      ))}
                    </div>
                  </div>
                )}

                {analysisData.analisis_dialogos.revelaciones_clave && (
                  <div>
                    <h4 className="font-semibold mb-2">Revelaciones Clave</h4>
                    <div className="space-y-1">
                      {analysisData.analisis_dialogos.revelaciones_clave.map((revelacion, index) => (
                        <p key={index} className="text-gray-600 text-sm">• {revelacion}</p>
                      ))}
                    </div>
                  </div>
                )}

                {analysisData.analisis_dialogos.beats_dramaticos && (
                  <div>
                    <h4 className="font-semibold mb-2">Beats Dramáticos</h4>
                    <div className="space-y-1">
                      {analysisData.analisis_dialogos.beats_dramaticos.map((beat, index) => (
                        <p key={index} className="text-gray-600 text-sm">• {beat}</p>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="themes" className="space-y-6">
          {/* Análisis Temático */}
          {analysisData.analisis_tematico && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="h-5 w-5" />
                  Análisis Temático
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {analysisData.analisis_tematico.tema_central && (
                  <div>
                    <h4 className="font-semibold text-lg mb-2">Tema Central</h4>
                    <p className="text-gray-700 bg-blue-50 p-4 rounded-lg">
                      {analysisData.analisis_tematico.tema_central}
                    </p>
                  </div>
                )}

                <div className="grid gap-6 md:grid-cols-2">
                  {analysisData.analisis_tematico.temas_secundarios && (
                    <div>
                      <h4 className="font-semibold mb-3">Temas Secundarios</h4>
                      <div className="space-y-2">
                        {analysisData.analisis_tematico.temas_secundarios.map((tema, index) => (
                          <div key={index} className="bg-gray-50 p-3 rounded">
                            <p className="text-gray-700 text-sm">{tema}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {analysisData.analisis_tematico.motifs_recurrentes && (
                    <div>
                      <h4 className="font-semibold mb-3">Motifs Recurrentes</h4>
                      <div className="flex flex-wrap gap-2">
                        {analysisData.analisis_tematico.motifs_recurrentes.map((motif, index) => (
                          <Badge key={index} variant="secondary">
                            {motif}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {analysisData.analisis_tematico.simbolos_importantes && (
                    <div className="md:col-span-2">
                      <h4 className="font-semibold mb-3">Símbolos Importantes</h4>
                      <div className="flex flex-wrap gap-2">
                        {analysisData.analisis_tematico.simbolos_importantes.map((simbolo, index) => (
                          <Badge key={index} variant="outline">
                            <Sparkles className="h-3 w-3 mr-1" />
                            {simbolo}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Actions bar */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-600">
              Análisis completo listo para producción
            </div>
            <div className="flex gap-3">
              <Button variant="outline">
                <Edit className="h-4 w-4 mr-2" />
                Editar Análisis
              </Button>
              <Button onClick={() => navigate(`/projects/${projectId}/scenes`)}>
                <Play className="h-4 w-4 mr-2" />
                Iniciar Producción
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}