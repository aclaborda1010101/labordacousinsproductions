#!/usr/bin/env node
const fs = require('fs').promises;
const path = require('path');

// Configuración de directorios a escanear
const MOVIE_DIRECTORIES = [
  '/Volumes', // macOS external drives
  '/Users/jarvismini/Movies',
  '/Users/jarvismini/Desktop',
  '/Users/jarvismini/Downloads',
  process.env.HOME + '/Movies',
  process.env.HOME + '/Desktop', 
  process.env.HOME + '/Downloads'
];

const SCRIPT_DIRECTORIES = [
  './lc-studio-real/',
  process.env.HOME + '/Scripts',
  process.env.HOME + '/Guiones'
];

// Extensiones de video soportadas
const VIDEO_EXTENSIONS = [
  '.mp4', '.mkv', '.avi', '.mov', '.m4v', '.wmv', '.flv', 
  '.webm', '.ts', '.mts', '.m2ts', '.3gp', '.ogv', '.divx'
];

// Extensiones de guiones soportadas  
const SCRIPT_EXTENSIONS = [
  '.fountain', '.txt', '.pdf', '.md', '.final', '.celtx'
];

class MovieScanner {
  constructor() {
    this.movies = [];
    this.scripts = [];
    this.scanProgress = 0;
  }

  async scanDirectory(dirPath, extensions, maxDepth = 3, currentDepth = 0) {
    const results = [];
    
    try {
      if (currentDepth > maxDepth) return results;
      
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          // Recursivo en subdirectorios
          const subResults = await this.scanDirectory(fullPath, extensions, maxDepth, currentDepth + 1);
          results.push(...subResults);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          
          if (extensions.includes(ext)) {
            try {
              const stats = await fs.stat(fullPath);
              results.push({
                filename: entry.name,
                path: fullPath,
                size: stats.size,
                lastModified: stats.mtime,
                extension: ext,
                directory: dirPath
              });
            } catch (err) {
              console.warn(`Error reading file stats: ${fullPath}`, err.message);
            }
          }
        }
      }
    } catch (error) {
      console.warn(`Error scanning directory: ${dirPath}`, error.message);
    }
    
    return results;
  }

  async scanMovies() {
    console.log('🎬 Iniciando escaneo de películas...');
    this.movies = [];
    
    for (const dir of MOVIE_DIRECTORIES) {
      try {
        await fs.access(dir);
        console.log(`📁 Escaneando: ${dir}`);
        
        const movies = await this.scanDirectory(dir, VIDEO_EXTENSIONS, 4);
        this.movies.push(...movies);
        
        console.log(`   └─ Encontradas: ${movies.length} películas`);
      } catch (error) {
        // Directorio no existe, continuar
      }
    }
    
    // Procesar metadata adicional
    this.movies = this.movies.map((movie, index) => ({
      id: `movie_${index + 1}`,
      filename: movie.filename,
      path: movie.path,
      size: movie.size,
      format: movie.extension.substring(1).toUpperCase(),
      lastModified: movie.lastModified,
      directory: movie.directory,
      // Estimación de duración basada en tamaño (muy aproximada)
      estimatedDuration: this.estimateDuration(movie.size),
    }));
    
    console.log(`✅ Escaneo completado: ${this.movies.length} películas encontradas`);
    return this.movies;
  }

  async scanScripts() {
    console.log('📄 Iniciando escaneo de guiones...');
    this.scripts = [];
    
    for (const dir of SCRIPT_DIRECTORIES) {
      try {
        await fs.access(dir);
        console.log(`📁 Escaneando: ${dir}`);
        
        const scripts = await this.scanDirectory(dir, SCRIPT_EXTENSIONS, 3);
        this.scripts.push(...scripts);
        
        console.log(`   └─ Encontrados: ${scripts.length} guiones`);
      } catch (error) {
        // Directorio no existe, continuar
      }
    }
    
    // Procesar metadata de guiones
    this.scripts = await Promise.all(
      this.scripts.map(async (script, index) => {
        const metadata = await this.analyzeScript(script);
        return {
          id: `script_${index + 1}`,
          filename: script.filename,
          path: script.path,
          format: this.getScriptFormat(script.extension),
          lastModified: script.lastModified,
          ...metadata
        };
      })
    );
    
    console.log(`✅ Escaneo completado: ${this.scripts.length} guiones encontrados`);
    return this.scripts;
  }

  async analyzeScript(script) {
    try {
      // Solo analizar archivos de texto por ahora
      if (['.txt', '.fountain', '.md'].includes(script.extension)) {
        const content = await fs.readFile(script.path, 'utf-8');
        
        // Análisis básico del contenido
        const lines = content.split('\n');
        const scenes = this.countScenes(content);
        const characters = this.extractCharacters(content, script.extension);
        
        return {
          content: content.substring(0, 500) + '...', // Preview
          lines: lines.length,
          scenes,
          characters: characters.slice(0, 10), // Top 10 characters
          wordCount: content.split(/\s+/).length
        };
      }
    } catch (error) {
      console.warn(`Error analyzing script: ${script.path}`, error.message);
    }
    
    return {
      content: null,
      lines: 0,
      scenes: 0,
      characters: [],
      wordCount: 0
    };
  }

  countScenes(content) {
    // Detectar escenas en diferentes formatos
    const fountainScenes = (content.match(/^(INT\.|EXT\.)/gm) || []).length;
    const basicScenes = (content.match(/ESCENA|SCENE|ESC\./gi) || []).length;
    const fadeScenes = (content.match(/FADE IN|FADE OUT/gi) || []).length;
    
    return Math.max(fountainScenes, basicScenes, fadeScenes);
  }

  extractCharacters(content, extension) {
    const characters = new Set();
    
    if (extension === '.fountain') {
      // Formato Fountain - personajes en mayúsculas al inicio de línea
      const matches = content.match(/^[A-ZÁÉÍÓÚÑ\s]{2,}$/gm) || [];
      matches.forEach(match => {
        const char = match.trim();
        if (char.length > 2 && char.length < 30) {
          characters.add(char);
        }
      });
    } else {
      // Buscar patrones comunes de nombres de personajes
      const namePatterns = [
        /([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+):/g,
        /\b([A-ZÁÉÍÓÚÑ]{2,})\b/g,
        /(Rey|Reina|Príncipe|Princesa)\s+([A-Za-záéíóúñ]+)/gi,
        /(Sr\.|Sra\.|Don|Doña)\s+([A-Za-záéíóúñ]+)/gi
      ];
      
      namePatterns.forEach(pattern => {
        const matches = content.matchAll(pattern);
        for (const match of matches) {
          const char = match[1] || match[2];
          if (char && char.length > 2 && char.length < 30) {
            characters.add(char.trim());
          }
        }
      });
    }
    
    return Array.from(characters).slice(0, 15);
  }

  getScriptFormat(extension) {
    const formatMap = {
      '.fountain': 'fountain',
      '.txt': 'txt', 
      '.pdf': 'pdf',
      '.md': 'markdown',
      '.final': 'finaldraft',
      '.celtx': 'celtx'
    };
    return formatMap[extension] || 'unknown';
  }

  estimateDuration(sizeBytes) {
    // Estimación muy aproximada: ~1GB por hora para video de calidad media
    const hours = sizeBytes / (1024 * 1024 * 1024);
    if (hours < 1) return `${Math.round(hours * 60)} min`;
    return `${Math.round(hours * 10) / 10}h`;
  }

  async performCorrelationAnalysis() {
    console.log('🔍 Iniciando análisis de correlaciones...');
    const correlations = [];
    
    for (const movie of this.movies) {
      for (const script of this.scripts) {
        const correlation = this.calculateCorrelation(movie, script);
        if (correlation.similarity > 20) {
          correlations.push(correlation);
        }
      }
    }
    
    // Ordenar por similitud
    correlations.sort((a, b) => b.similarity - a.similarity);
    
    console.log(`✅ Análisis completado: ${correlations.length} correlaciones encontradas`);
    return correlations;
  }

  calculateCorrelation(movie, script) {
    const movieName = movie.filename.toLowerCase().replace(/[^a-z0-9\s]/g, '');
    const scriptName = script.filename.toLowerCase().replace(/[^a-z0-9\s]/g, '');
    
    let similarity = 0;
    const keyMatches = [];
    const discrepancies = [];
    
    // Análisis de similitud básico
    const movieWords = movieName.split(/\s+/);
    const scriptWords = scriptName.split(/\s+/);
    
    // Coincidencias exactas de palabras
    let wordMatches = 0;
    movieWords.forEach(word => {
      if (word.length > 2 && scriptWords.includes(word)) {
        wordMatches++;
        keyMatches.push(`Palabra común: "${word}"`);
      }
    });
    
    similarity += (wordMatches / Math.max(movieWords.length, scriptWords.length)) * 80;
    
    // Análisis de personajes si disponible
    if (script.characters && script.characters.length > 0) {
      const movieHasCharacters = script.characters.some(char => 
        movieName.includes(char.toLowerCase())
      );
      if (movieHasCharacters) {
        similarity += 15;
        keyMatches.push('Personajes coincidentes encontrados');
      }
    }
    
    // Verificación de formato y calidad
    if (movie.size < 100 * 1024 * 1024) { // < 100MB
      discrepancies.push('Archivo de video muy pequeño');
    }
    
    if (script.scenes === 0) {
      discrepancies.push('Guión sin estructura de escenas detectada');
    }
    
    // Recomendación
    let recommendation = '';
    if (similarity > 80) {
      recommendation = 'Correlación muy alta - Revisar detalles específicos';
    } else if (similarity > 50) {
      recommendation = 'Correlación moderada - Verificar contenido manualmente';
    } else if (similarity > 20) {
      recommendation = 'Correlación baja - Posible relación indirecta';
    } else {
      recommendation = 'Sin correlación aparente';
    }
    
    return {
      movieId: movie.id,
      scriptId: script.id,
      movieName: movie.filename,
      scriptName: script.filename,
      similarity: Math.round(similarity),
      keyMatches,
      discrepancies,
      recommendation
    };
  }

  async exportResults() {
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    const results = {
      timestamp,
      movies: this.movies,
      scripts: this.scripts,
      correlations: await this.performCorrelationAnalysis()
    };
    
    const filename = `movie-analysis-${timestamp}.json`;
    await fs.writeFile(filename, JSON.stringify(results, null, 2));
    
    console.log(`📊 Resultados exportados a: ${filename}`);
    return filename;
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  const scanner = new MovieScanner();
  
  async function main() {
    console.log('🚀 INICIANDO ANÁLISIS DE PELÍCULAS LC STUDIO');
    console.log('============================================');
    
    await scanner.scanMovies();
    console.log();
    await scanner.scanScripts();
    console.log();
    
    const correlations = await scanner.performCorrelationAnalysis();
    console.log();
    
    if (correlations.length > 0) {
      console.log('🎯 TOP 5 CORRELACIONES:');
      correlations.slice(0, 5).forEach((corr, idx) => {
        console.log(`${idx + 1}. ${corr.movieName} ↔ ${corr.scriptName} (${corr.similarity}%)`);
      });
    }
    
    console.log();
    await scanner.exportResults();
    console.log('\n✅ Análisis completado exitosamente');
  }
  
  main().catch(console.error);
}

module.exports = MovieScanner;