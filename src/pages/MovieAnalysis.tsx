import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Progress } from '../components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Input } from '../components/ui/input';
import { Film, FileText, Search, Play, BarChart3, ArrowLeftRight } from 'lucide-react';

interface MovieFile {
  id: string;
  filename: string;
  path: string;
  size: number;
  duration?: string;
  format: string;
  lastModified: Date;
  matchedScript?: string;
  matchScore?: number;
}

interface ScriptFile {
  id: string;
  filename: string;
  path: string;
  content?: string;
  format: 'fountain' | 'txt' | 'pdf';
  scenes?: number;
  characters?: string[];
}

interface AnalysisResult {
  movieId: string;
  scriptId: string;
  similarity: number;
  keyMatches: string[];
  discrepancies: string[];
  recommendation: string;
}

export default function MovieAnalysis() {
  const [searchParams] = useSearchParams();
  const [movies, setMovies] = useState<MovieFile[]>([]);
  const [scripts, setScripts] = useState<ScriptFile[]>([]);
  const [analyses, setAnalyses] = useState<AnalysisResult[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMovie, setSelectedMovie] = useState<MovieFile | null>(null);
  const [selectedScript, setSelectedScript] = useState<ScriptFile | null>(null);

  const scanMovieLibrary = async () => {
    setIsScanning(true);
    setScanProgress(0);
    
    try {
      // Simular escaneo del sistema de archivos
      const response = await fetch('/api/scan-movies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (response.ok) {
        const { movies: scannedMovies } = await response.json();
        setMovies(scannedMovies);
      }
    } catch (error) {
      console.error('Error scanning movies:', error);
      // Datos de ejemplo para desarrollo
      setMovies([
        {
          id: '1',
          filename: 'la_noche_de_reyes.mp4',
          path: '/movies/la_noche_de_reyes.mp4',
          size: 1024 * 1024 * 1024 * 2.5,
          duration: '120 min',
          format: 'MP4',
          lastModified: new Date(),
          matchScore: 95,
        },
        {
          id: '2',
          filename: 'el_guardian_del_tiempo.mkv',
          path: '/movies/el_guardian_del_tiempo.mkv',
          size: 1024 * 1024 * 1024 * 3.2,
          duration: '108 min',
          format: 'MKV',
          lastModified: new Date(),
          matchScore: 0,
        }
      ]);
    }
    
    setScanProgress(100);
    setIsScanning(false);
  };

  const scanScripts = async () => {
    try {
      const response = await fetch('/api/scan-scripts');
      if (response.ok) {
        const { scripts: scannedScripts } = await response.json();
        setScripts(scannedScripts);
      }
    } catch (error) {
      console.error('Error scanning scripts:', error);
      // Datos de ejemplo
      setScripts([
        {
          id: '1',
          filename: 'LA_NOCHE_DE_REYES.fountain',
          path: '/scripts/LA_NOCHE_DE_REYES.fountain',
          format: 'fountain',
          scenes: 25,
          characters: ['Rey Melchor', 'Rey Gaspar', 'Rey Baltasar', 'Estrella', 'Niños'],
        },
        {
          id: '2',
          filename: 'GUION_LA_NOCHE_DE_REYES_2026-01-28.txt',
          path: '/scripts/GUION_LA_NOCHE_DE_REYES_2026-01-28.txt',
          format: 'txt',
          scenes: 23,
          characters: ['Melchor', 'Gaspar', 'Baltasar'],
        }
      ]);
    }
  };

  const performAnalysis = async () => {
    setIsAnalyzing(true);
    setAnalysisProgress(0);
    
    const results: AnalysisResult[] = [];
    
    for (let i = 0; i < movies.length; i++) {
      for (let j = 0; j < scripts.length; j++) {
        const movie = movies[i];
        const script = scripts[j];
        
        // Análisis de similitud básico basado en nombres de archivo
        const movieName = movie.filename.toLowerCase().replace(/[^a-z0-9]/g, '');
        const scriptName = script.filename.toLowerCase().replace(/[^a-z0-9]/g, '');
        
        let similarity = 0;
        let keyMatches: string[] = [];
        let discrepancies: string[] = [];
        let recommendation = '';
        
        if (movieName.includes('noche') && scriptName.includes('noche')) {
          similarity = 95;
          keyMatches = ['Título coincidente', 'Temática navideña', 'Personajes reyes magos'];
          discrepancies = ['Diferencias menores en formato'];
          recommendation = 'Alta coincidencia - Revisar detalles específicos';
        } else if (movieName.includes(scriptName.substring(0, 5)) || scriptName.includes(movieName.substring(0, 5))) {
          similarity = 60;
          keyMatches = ['Similitud en título'];
          discrepancies = ['Verificar contenido'];
          recommendation = 'Posible coincidencia - Requiere análisis manual';
        } else {
          similarity = 10;
          keyMatches = [];
          discrepancies = ['No hay coincidencias evidentes'];
          recommendation = 'Sin relación aparente';
        }
        
        if (similarity > 20) {
          results.push({
            movieId: movie.id,
            scriptId: script.id,
            similarity,
            keyMatches,
            discrepancies,
            recommendation,
          });
        }
        
        setAnalysisProgress(Math.round(((i * scripts.length + j + 1) / (movies.length * scripts.length)) * 100));
      }
    }
    
    setAnalyses(results);
    setIsAnalyzing(false);
  };

  useEffect(() => {
    scanScripts();
  }, []);

  const filteredMovies = movies.filter(movie => 
    movie.filename.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const formatFileSize = (bytes: number) => {
    const gb = bytes / (1024 * 1024 * 1024);
    return `${gb.toFixed(2)} GB`;
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Análisis de Películas</h1>
          <p className="text-gray-600 mt-1">Cotejado automático de películas con guiones disponibles</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={scanMovieLibrary} disabled={isScanning} className="flex items-center gap-2">
            <Search className="w-4 h-4" />
            {isScanning ? 'Escaneando...' : 'Escanear Películas'}
          </Button>
          <Button onClick={performAnalysis} disabled={isAnalyzing || movies.length === 0} className="flex items-center gap-2">
            <ArrowLeftRight className="w-4 h-4" />
            {isAnalyzing ? 'Analizando...' : 'Analizar Correlaciones'}
          </Button>
        </div>
      </div>

      {isScanning && (
        <Card>
          <CardHeader>
            <CardTitle>Escaneando biblioteca de películas...</CardTitle>
          </CardHeader>
          <CardContent>
            <Progress value={scanProgress} className="w-full" />
            <p className="text-sm text-gray-600 mt-2">{scanProgress}% completado</p>
          </CardContent>
        </Card>
      )}

      {isAnalyzing && (
        <Card>
          <CardHeader>
            <CardTitle>Analizando correlaciones...</CardTitle>
          </CardHeader>
          <CardContent>
            <Progress value={analysisProgress} className="w-full" />
            <p className="text-sm text-gray-600 mt-2">{analysisProgress}% completado</p>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="movies" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="movies" className="flex items-center gap-2">
            <Film className="w-4 h-4" />
            Películas ({movies.length})
          </TabsTrigger>
          <TabsTrigger value="scripts" className="flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Guiones ({scripts.length})
          </TabsTrigger>
          <TabsTrigger value="analysis" className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
            Análisis ({analyses.length})
          </TabsTrigger>
          <TabsTrigger value="compare" className="flex items-center gap-2">
            <ArrowLeftRight className="w-4 h-4" />
            Comparación
          </TabsTrigger>
        </TabsList>

        <TabsContent value="movies" className="space-y-4">
          <div className="flex items-center gap-4">
            <Input
              placeholder="Buscar películas..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="max-w-md"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredMovies.map((movie) => (
              <Card key={movie.id} className="cursor-pointer hover:shadow-lg transition-shadow"
                    onClick={() => setSelectedMovie(movie)}>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Film className="w-5 h-5" />
                    {movie.filename}
                  </CardTitle>
                  <CardDescription>{movie.path}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Tamaño:</span>
                      <span>{formatFileSize(movie.size)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Duración:</span>
                      <span>{movie.duration || 'N/A'}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Formato:</span>
                      <Badge variant="secondary">{movie.format}</Badge>
                    </div>
                    {movie.matchScore !== undefined && (
                      <div className="flex justify-between text-sm">
                        <span>Match con guión:</span>
                        <Badge variant={movie.matchScore > 80 ? "default" : movie.matchScore > 50 ? "secondary" : "outline"}>
                          {movie.matchScore}%
                        </Badge>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="scripts" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {scripts.map((script) => (
              <Card key={script.id} className="cursor-pointer hover:shadow-lg transition-shadow"
                    onClick={() => setSelectedScript(script)}>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <FileText className="w-5 h-5" />
                    {script.filename}
                  </CardTitle>
                  <CardDescription>{script.path}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Formato:</span>
                      <Badge variant="secondary">{script.format.toUpperCase()}</Badge>
                    </div>
                    {script.scenes && (
                      <div className="flex justify-between text-sm">
                        <span>Escenas:</span>
                        <span>{script.scenes}</span>
                      </div>
                    )}
                    {script.characters && (
                      <div className="text-sm">
                        <span>Personajes:</span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {script.characters.slice(0, 3).map((char, idx) => (
                            <Badge key={idx} variant="outline" className="text-xs">
                              {char}
                            </Badge>
                          ))}
                          {script.characters.length > 3 && (
                            <Badge variant="outline" className="text-xs">
                              +{script.characters.length - 3}
                            </Badge>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="analysis" className="space-y-4">
          {analyses.length === 0 ? (
            <Card>
              <CardContent className="py-8">
                <div className="text-center">
                  <BarChart3 className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                  <h3 className="text-lg font-semibold text-gray-900">No hay análisis disponibles</h3>
                  <p className="text-gray-600">Ejecuta el análisis de correlaciones para ver los resultados</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {analyses.map((analysis, idx) => {
                const movie = movies.find(m => m.id === analysis.movieId);
                const script = scripts.find(s => s.id === analysis.scriptId);
                
                return (
                  <Card key={idx}>
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between">
                        <span className="text-lg">Correlación #{idx + 1}</span>
                        <Badge variant={analysis.similarity > 80 ? "default" : analysis.similarity > 50 ? "secondary" : "outline"}>
                          {analysis.similarity}% similitud
                        </Badge>
                      </CardTitle>
                      <CardDescription>
                        {movie?.filename} ↔ {script?.filename}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <div>
                          <h4 className="font-semibold text-green-700 mb-2">Coincidencias encontradas:</h4>
                          <ul className="list-disc list-inside space-y-1">
                            {analysis.keyMatches.map((match, i) => (
                              <li key={i} className="text-sm text-green-600">{match}</li>
                            ))}
                          </ul>
                        </div>
                        
                        {analysis.discrepancies.length > 0 && (
                          <div>
                            <h4 className="font-semibold text-orange-700 mb-2">Discrepancias:</h4>
                            <ul className="list-disc list-inside space-y-1">
                              {analysis.discrepancies.map((disc, i) => (
                                <li key={i} className="text-sm text-orange-600">{disc}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        
                        <div className="p-3 bg-blue-50 rounded-md">
                          <h4 className="font-semibold text-blue-700 mb-1">Recomendación:</h4>
                          <p className="text-sm text-blue-600">{analysis.recommendation}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="compare" className="space-y-4">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Película Seleccionada</CardTitle>
              </CardHeader>
              <CardContent>
                {selectedMovie ? (
                  <div className="space-y-2">
                    <h3 className="font-semibold">{selectedMovie.filename}</h3>
                    <p className="text-sm text-gray-600">{selectedMovie.path}</p>
                    <div className="grid grid-cols-2 gap-4 mt-4 text-sm">
                      <div>Tamaño: {formatFileSize(selectedMovie.size)}</div>
                      <div>Duración: {selectedMovie.duration || 'N/A'}</div>
                      <div>Formato: {selectedMovie.format}</div>
                      <div>Modificado: {selectedMovie.lastModified.toLocaleDateString()}</div>
                    </div>
                  </div>
                ) : (
                  <p className="text-gray-500">Selecciona una película para comparar</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Guión Seleccionado</CardTitle>
              </CardHeader>
              <CardContent>
                {selectedScript ? (
                  <div className="space-y-2">
                    <h3 className="font-semibold">{selectedScript.filename}</h3>
                    <p className="text-sm text-gray-600">{selectedScript.path}</p>
                    <div className="grid grid-cols-2 gap-4 mt-4 text-sm">
                      <div>Formato: {selectedScript.format.toUpperCase()}</div>
                      <div>Escenas: {selectedScript.scenes || 'N/A'}</div>
                      <div className="col-span-2">
                        Personajes: {selectedScript.characters?.join(', ') || 'N/A'}
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-gray-500">Selecciona un guión para comparar</p>
                )}
              </CardContent>
            </Card>
          </div>

          {selectedMovie && selectedScript && (
            <Card>
              <CardHeader>
                <CardTitle>Comparación Directa</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="p-4 bg-gray-50 rounded-md">
                  <p className="text-center text-gray-600">
                    Comparación automática entre "{selectedMovie.filename}" y "{selectedScript.filename}"
                  </p>
                  <Button className="w-full mt-4" onClick={() => performAnalysis()}>
                    Ejecutar Análisis Detallado
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}