#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');
const MovieScanner = require('./movie-scanner.cjs');
const AnalyzerHelpers = require('./lc-studio-analyzer-helpers.cjs');

/**
 * LC Studio Advanced Movie-Script Analyzer
 * Creates a RAG-ready Director database for script-to-screen predictions
 */
class LCStudioAnalyzer {
  constructor() {
    this.movieScanner = new MovieScanner();
    this.movies = [];
    this.scripts = [];
    this.correlations = [];
    this.patterns = [];
    this.database = {
      scriptToScreen: [],
      directionPatterns: [],
      timingAnalysis: [],
      metadata: {}
    };
    this.progressInterval = null;
  }

  async initialize() {
    console.log('🚀 INICIANDO LC STUDIO ANALYZER v2.0');
    console.log('====================================');
    
    // Cargar datos base
    await this.loadMovies();
    await this.loadJsonScripts();
    
    // Configurar reporte de progreso cada 30 min
    this.setupProgressReporting();
    
    console.log(`📊 Base de datos inicial:`);
    console.log(`   🎬 Películas: ${this.movies.length}`);
    console.log(`   📄 Guiones: ${this.scripts.length}`);
  }

  async loadMovies() {
    console.log('🎬 Cargando base de datos de películas...');
    
    // Usar el scanner existente
    this.movies = await this.movieScanner.scanMovies();
    
    // Enriquecer con metadata adicional
    this.movies = this.movies.map(movie => ({
      ...movie,
      // Extraer año del nombre si es posible
      year: this.extractYear(movie.filename),
      // Limpiar nombre para matching
      cleanName: this.cleanMovieName(movie.filename),
      // Clasificar por calidad basada en tamaño
      quality: this.classifyQuality(movie.size),
      // Extraer género del directorio si es posible
      inferredGenre: this.inferGenreFromPath(movie.path)
    }));
    
    console.log(`✅ ${this.movies.length} películas procesadas`);
  }

  async loadJsonScripts() {
    console.log('📄 Cargando guiones JSON...');
    
    const scriptsDir = './scripts-scraper';
    const parsedDirs = ['parsed-v2', 'parsed-v3', 'parsed-v4'];
    
    this.scripts = [];
    
    for (const dir of parsedDirs) {
      const fullPath = path.join(scriptsDir, dir);
      try {
        const files = await fs.readdir(fullPath);
        const jsonFiles = files.filter(f => f.endsWith('.json'));
        
        console.log(`   📁 ${dir}: ${jsonFiles.length} archivos`);
        
        for (const file of jsonFiles) {
          try {
            const content = await fs.readFile(path.join(fullPath, file), 'utf-8');
            const script = JSON.parse(content);
            
            // Enriquecer script con metadata adicional
            const enhancedScript = {
              ...script,
              sourceFile: file,
              sourceDir: dir,
              year: this.extractYear(script.slug || file),
              cleanTitle: this.cleanScriptTitle(script.title || script.slug),
              // Análisis avanzado de estructura
              structure: this.analyzeScriptStructure(script),
              // Análisis de diálogos y ritmo
              pacing: this.analyzePacing(script),
              // Extracción de elementos cinematográficos
              cinematicElements: this.extractCinematicElements(script)
            };
            
            this.scripts.push(enhancedScript);
            
          } catch (error) {
            console.warn(`   ⚠️  Error procesando ${file}:`, error.message);
          }
        }
      } catch (error) {
        console.warn(`   ⚠️  No se pudo acceder a ${fullPath}`);
      }
    }
    
    console.log(`✅ ${this.scripts.length} guiones procesados`);
  }

  analyzeScriptStructure(script) {
    const stats = script.stats || {};
    const scenes = script.scenes || [];
    
    return {
      sceneCount: stats.scenes || scenes.length,
      dialogueCount: stats.dialogues || 0,
      characterCount: stats.characters || 0,
      // Análisis de estructura de 3 actos
      actStructure: AnalyzerHelpers.analyzeActStructure(scenes),
      // Distribución de escenas por ubicación
      locationDistribution: AnalyzerHelpers.analyzeLocations(scenes),
      // Patrones de tiempo (día/noche)
      timeOfDayPatterns: AnalyzerHelpers.analyzeTimePatterns(scenes)
    };
  }

  analyzePacing(script) {
    const dialogues = script.dialogues || [];
    const scenes = script.scenes || [];
    
    return {
      avgDialogueLength: AnalyzerHelpers.calculateAvgDialogueLength(dialogues),
      sceneTransitionRate: scenes.length > 0 ? script.stats?.dialogues / scenes.length : 0,
      // Análisis de ritmo basado en longitud de escenas
      rhythmPattern: AnalyzerHelpers.analyzeRhythm(scenes),
      // Intensidad dramática por sección
      dramaticIntensity: AnalyzerHelpers.analyzeDramaticIntensity(dialogues)
    };
  }

  extractCinematicElements(script) {
    const content = script.content || '';
    const scenes = script.scenes || [];
    
    return {
      // Elementos de dirección encontrados en acotaciones
      directionNotes: AnalyzerHelpers.extractDirectionNotes(content, scenes),
      // Indicaciones de atmósfera
      atmosphere: AnalyzerHelpers.extractAtmosphere(content, scenes),
      // Referencias a iluminación
      lighting: AnalyzerHelpers.extractLighting(content, scenes),
      // Elementos de sonido
      sound: AnalyzerHelpers.extractSoundElements(content, scenes),
      // Movimiento de cámara implícito
      cameraMovement: AnalyzerHelpers.extractCameraMovement(content, scenes)
    };
  }

  async performAdvancedCorrelation() {
    console.log('🔍 Ejecutando análisis avanzado de correlaciones...');
    this.correlations = [];
    
    let processed = 0;
    const total = this.scripts.length;
    
    for (const script of this.scripts) {
      const matches = await this.findMovieMatches(script);
      
      for (const match of matches) {
        const correlation = await this.analyzeCorrelation(script, match.movie, match.confidence);
        this.correlations.push(correlation);
      }
      
      processed++;
      if (processed % 50 === 0) {
        console.log(`   📊 Progreso: ${processed}/${total} (${Math.round(processed/total*100)}%)`);
      }
    }
    
    // Ordenar por confianza
    this.correlations.sort((a, b) => b.confidence - a.confidence);
    
    console.log(`✅ ${this.correlations.length} correlaciones analizadas`);
    return this.correlations;
  }

  async findMovieMatches(script) {
    const matches = [];
    const scriptTitle = script.cleanTitle;
    const scriptYear = script.year;
    
    for (const movie of this.movies) {
      const confidence = this.calculateMatchConfidence(script, movie);
      
      if (confidence > 30) { // Umbral mínimo de confianza
        matches.push({
          movie,
          confidence,
          matchReasons: this.getMatchReasons(script, movie, confidence)
        });
      }
    }
    
    // Ordenar por confianza y retornar top 3
    return matches
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 3);
  }

  calculateMatchConfidence(script, movie) {
    let confidence = 0;
    const factors = [];
    
    // Coincidencia de título (peso alto)
    const titleSimilarity = this.calculateStringSimilarity(script.cleanTitle, movie.cleanName);
    confidence += titleSimilarity * 0.4;
    if (titleSimilarity > 0.3) factors.push(`Título similar (${Math.round(titleSimilarity * 100)}%)`);
    
    // Coincidencia de año (peso medio)
    if (script.year && movie.year && Math.abs(script.year - movie.year) <= 2) {
      confidence += 0.25;
      factors.push(`Año coincidente (${script.year}/${movie.year})`);
    }
    
    // Análisis de duración vs estructura del script
    const durationMatch = this.analyzeDurationMatch(script, movie);
    confidence += durationMatch * 0.2;
    if (durationMatch > 0.1) factors.push(`Duración coherente`);
    
    // Calidad del archivo (preferir archivos grandes)
    if (movie.quality === 'high') confidence += 0.1;
    if (movie.quality === 'medium') confidence += 0.05;
    
    // Género inferido
    if (movie.inferredGenre && this.matchesGenre(script, movie.inferredGenre)) {
      confidence += 0.05;
      factors.push(`Género compatible (${movie.inferredGenre})`);
    }
    
    return Math.min(confidence, 1.0);
  }

  async analyzeCorrelation(script, movie, confidence) {
    return {
      id: `correlation_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      script: {
        id: script.slug,
        title: script.title,
        year: script.year,
        scenes: script.structure?.sceneCount || 0,
        characters: script.structure?.characterCount || 0
      },
      movie: {
        id: movie.id,
        filename: movie.filename,
        path: movie.path,
        size: movie.size,
        year: movie.year,
        quality: movie.quality
      },
      confidence,
      analysis: {
        // Análisis de timing script vs película
        timing: await this.analyzeTimingCorrelation(script, movie),
        // Extracción de patrones de dirección
        patterns: await this.extractDirectionPatterns(script, movie),
        // Análisis de coherencia estructural
        structure: this.analyzeStructuralCoherence(script, movie)
      },
      timestamp: new Date().toISOString()
    };
  }

  async extractDirectionPatterns(script, movie) {
    const patterns = {
      atmosphere: [],
      lighting: [],
      rhythm: [],
      cameraWork: [],
      soundDesign: []
    };
    
    // Analizar elementos cinematográficos del script
    const cinematic = script.cinematicElements;
    
    if (cinematic?.atmosphere?.length > 0) {
      patterns.atmosphere = cinematic.atmosphere.map(atm => ({
        description: atm,
        context: 'script_indication',
        frequency: this.calculateElementFrequency(atm, script)
      }));
    }
    
    if (cinematic?.lighting?.length > 0) {
      patterns.lighting = cinematic.lighting.map(light => ({
        type: light,
        context: 'script_indication',
        scenes: this.findScenesWithElement(light, script)
      }));
    }
    
    // Análizar patrones de ritmo basados en estructura
    if (script.pacing) {
      patterns.rhythm = [
        {
          avgSceneLength: script.pacing.sceneTransitionRate,
          dialogueIntensity: script.pacing.avgDialogueLength,
          rhythmType: this.classifyRhythm(script.pacing)
        }
      ];
    }
    
    return patterns;
  }

  async createScriptToScreenDatabase() {
    console.log('🗄️  Creando base de datos Script-to-Screen...');
    
    this.database = {
      metadata: {
        created: new Date().toISOString(),
        version: '2.0',
        totalMovies: this.movies.length,
        totalScripts: this.scripts.length,
        totalCorrelations: this.correlations.length,
        highConfidenceMatches: this.correlations.filter(c => c.confidence > 0.7).length
      },
      
      // Correlaciones principales
      scriptToScreen: this.correlations.map(corr => ({
        ...corr,
        // Vectores para RAG
        scriptVector: this.generateScriptVector(corr.script),
        movieVector: this.generateMovieVector(corr.movie),
        // Patrones extraídos
        directionPatterns: corr.analysis.patterns,
        // Lecciones aprendidas
        directionLessons: this.generateDirectionLessons(corr)
      })),
      
      // Patrones de dirección agregados
      directionPatterns: this.aggregateDirectionPatterns(),
      
      // Análisis de timing
      timingAnalysis: this.aggregateTimingAnalysis(),
      
      // Base de conocimiento para RAG
      ragKnowledge: this.buildRAGKnowledge()
    };
    
    // Exportar base de datos
    const filename = `lc-studio-database-${Date.now()}.json`;
    await fs.writeFile(filename, JSON.stringify(this.database, null, 2));
    
    console.log(`✅ Base de datos creada: ${filename}`);
    console.log(`   📊 Correlaciones de alta confianza: ${this.database.metadata.highConfidenceMatches}`);
    
    return filename;
  }

  buildRAGKnowledge() {
    const knowledge = [];
    
    // Extraer patrones de dirección por género
    const genrePatterns = this.extractGenreDirectionPatterns();
    knowledge.push(...genrePatterns);
    
    // Extraer reglas de timing script-to-screen
    const timingRules = this.extractTimingRules();
    knowledge.push(...timingRules);
    
    // Extraer patrones de atmósfera y iluminación
    const atmospherePatterns = this.extractAtmospherePatterns();
    knowledge.push(...atmospherePatterns);
    
    return knowledge;
  }

  setupProgressReporting() {
    let reportCount = 1;
    
    this.progressInterval = setInterval(() => {
      this.reportProgress(reportCount++);
    }, 30 * 60 * 1000); // 30 minutos
    
    // Reporte inicial inmediato
    setTimeout(() => this.reportProgress(0), 5000);
  }

  reportProgress(reportNumber) {
    const progress = {
      timestamp: new Date().toISOString(),
      report: reportNumber,
      status: {
        moviesLoaded: this.movies.length,
        scriptsLoaded: this.scripts.length,
        correlationsAnalyzed: this.correlations.length,
        highConfidenceMatches: this.correlations.filter(c => c.confidence > 0.7).length,
        databaseReady: !!this.database.metadata
      },
      nextSteps: this.getNextSteps()
    };
    
    console.log(`\n📊 REPORTE DE PROGRESO #${reportNumber} - ${new Date().toLocaleTimeString()}`);
    console.log('================================================');
    console.log(`🎬 Películas cargadas: ${progress.status.moviesLoaded}`);
    console.log(`📄 Guiones procesados: ${progress.status.scriptsLoaded}`);
    console.log(`🔍 Correlaciones analizadas: ${progress.status.correlationsAnalyzed}`);
    console.log(`✅ Matches de alta confianza: ${progress.status.highConfidenceMatches}`);
    console.log(`🗄️  Base de datos: ${progress.status.databaseReady ? 'Lista' : 'En proceso'}`);
    
    if (progress.nextSteps.length > 0) {
      console.log(`\n🎯 Próximos pasos:`);
      progress.nextSteps.forEach((step, i) => {
        console.log(`   ${i + 1}. ${step}`);
      });
    }
    
    console.log('================================================\n');
  }

  getNextSteps() {
    const steps = [];
    
    if (this.scripts.length === 0) {
      steps.push('Completar carga de guiones JSON');
    }
    
    if (this.correlations.length === 0) {
      steps.push('Ejecutar análisis de correlaciones');
    } else if (this.correlations.length < this.scripts.length * 0.1) {
      steps.push('Continuar análisis de correlaciones');
    }
    
    if (!this.database.metadata) {
      steps.push('Generar base de datos Script-to-Screen');
    }
    
    const highConfidence = this.correlations.filter(c => c.confidence > 0.7).length;
    if (highConfidence < 100) {
      steps.push(`Mejorar algoritmo de matching (${highConfidence} matches fuertes)`);
    }
    
    if (steps.length === 0) {
      steps.push('Optimizar patrones de dirección para RAG');
      steps.push('Validar base de conocimiento con casos reales');
    }
    
    return steps;
  }

  // Métodos auxiliares de análisis
  extractYear(text) {
    const match = text.match(/(\d{4})/);
    return match ? parseInt(match[1]) : null;
  }

  cleanMovieName(filename) {
    return filename
      .toLowerCase()
      .replace(/\.(mp4|mkv|avi|mov|m4v|wmv|flv|webm|ts|mts|m2ts|3gp|ogv|divx)$/i, '')
      .replace(/[\[\]()]/g, '')
      .replace(/\d{4}/g, '') // Remover años
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  cleanScriptTitle(title) {
    if (!title) return '';
    return title
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  calculateStringSimilarity(str1, str2) {
    if (!str1 || !str2) return 0;
    
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 1.0;
    
    const distance = this.levenshteinDistance(longer, shorter);
    return (longer.length - distance) / longer.length;
  }

  levenshteinDistance(str1, str2) {
    const matrix = [];
    
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    
    return matrix[str2.length][str1.length];
  }

  classifyQuality(size) {
    if (size > 2 * 1024 * 1024 * 1024) return 'high';    // > 2GB
    if (size > 500 * 1024 * 1024) return 'medium';       // > 500MB
    return 'low';                                         // < 500MB
  }

  inferGenreFromPath(filepath) {
    const path = filepath.toLowerCase();
    
    if (path.includes('dibujos') || path.includes('animated') || path.includes('cartoon')) return 'animation';
    if (path.includes('terror') || path.includes('horror')) return 'horror';
    if (path.includes('comedia') || path.includes('comedy')) return 'comedy';
    if (path.includes('drama')) return 'drama';
    if (path.includes('accion') || path.includes('action')) return 'action';
    if (path.includes('aventura') || path.includes('adventure')) return 'adventure';
    
    return 'unknown';
  }

  analyzeDurationMatch(script, movie) {
    // Estimar duración del script vs duración del video
    const scriptScenes = script.structure?.sceneCount || 0;
    const estimatedScriptDuration = scriptScenes * 2; // Aprox 2 min por escena
    
    // Convertir tamaño de archivo a duración estimada (muy aproximada)
    const movieDurationMinutes = movie.size / (50 * 1024 * 1024); // ~50MB por minuto
    
    if (movieDurationMinutes === 0) return 0;
    
    const ratio = Math.min(estimatedScriptDuration, movieDurationMinutes) / 
                 Math.max(estimatedScriptDuration, movieDurationMinutes);
    
    return ratio;
  }

  matchesGenre(script, genre) {
    // Análisis básico de género basado en contenido del script
    const title = (script.title || '').toLowerCase();
    const characters = script.characters || [];
    
    switch(genre) {
      case 'comedy':
        return title.includes('comedy') || title.includes('comedia') || 
               characters.some(c => c.name && c.name.toLowerCase().includes('bufón'));
      case 'drama':
        return characters.length > 5; // Los dramas tienden a tener más personajes
      case 'horror':
        return title.includes('horror') || title.includes('terror');
      case 'animation':
        return characters.some(c => c.name && 
               ['animal', 'robot', 'fantasy'].some(word => c.name.toLowerCase().includes(word)));
      default:
        return false;
    }
  }

  getMatchReasons(script, movie, confidence) {
    const reasons = [];
    
    const titleSim = this.calculateStringSimilarity(script.cleanTitle, movie.cleanName);
    if (titleSim > 0.5) reasons.push(`Título muy similar (${Math.round(titleSim * 100)}%)`);
    else if (titleSim > 0.3) reasons.push(`Título similar (${Math.round(titleSim * 100)}%)`);
    
    if (script.year && movie.year && Math.abs(script.year - movie.year) <= 1) {
      reasons.push(`Año exacto (${script.year})`);
    } else if (script.year && movie.year && Math.abs(script.year - movie.year) <= 3) {
      reasons.push(`Año cercano (${script.year}/${movie.year})`);
    }
    
    if (movie.quality === 'high') reasons.push('Alta calidad de archivo');
    if (confidence > 0.8) reasons.push('Match de muy alta confianza');
    
    return reasons;
  }

  async analyzeTimingCorrelation(script, movie) {
    const scriptDuration = (script.structure?.sceneCount || 0) * 2; // min
    const movieDuration = movie.size / (50 * 1024 * 1024); // min aproximado
    
    return {
      scriptEstimatedDuration: scriptDuration,
      movieEstimatedDuration: movieDuration,
      durationRatio: movieDuration > 0 ? scriptDuration / movieDuration : 0,
      coherence: this.analyzeDurationMatch(script, movie),
      pacing: {
        scenesPerMinute: scriptDuration > 0 ? (script.structure?.sceneCount || 0) / scriptDuration : 0,
        dialogueIntensity: script.pacing?.avgDialogueLength || 0,
        rhythmType: script.pacing?.rhythmPattern?.type || 'unknown'
      }
    };
  }

  analyzeStructuralCoherence(script, movie) {
    const structure = script.structure || {};
    
    return {
      sceneCount: structure.sceneCount || 0,
      actStructure: structure.actStructure || null,
      locationDiversity: structure.locationDistribution?.diversity || 0,
      characterDevelopment: (script.characters || []).length,
      coherenceScore: this.calculateStructuralCoherence(script, movie),
      complexityLevel: this.calculateComplexityLevel(script)
    };
  }

  calculateStructuralCoherence(script, movie) {
    let score = 0;
    
    // Coherencia basada en duración
    score += this.analyzeDurationMatch(script, movie) * 0.4;
    
    // Coherencia basada en estructura
    const scenes = script.structure?.sceneCount || 0;
    if (scenes > 10 && scenes < 200) score += 0.3; // Estructura normal
    
    // Coherencia basada en calidad del archivo
    if (movie.quality === 'high') score += 0.2;
    if (movie.quality === 'medium') score += 0.1;
    
    // Coherencia basada en completitud del script
    if ((script.characters || []).length > 0) score += 0.1;
    
    return Math.min(score, 1.0);
  }

  calculateComplexityLevel(script) {
    const characters = (script.characters || []).length;
    const scenes = script.structure?.sceneCount || 0;
    const locations = script.structure?.locationDistribution?.diversity || 0;
    
    let complexity = 0;
    
    if (characters > 10) complexity += 2;
    else if (characters > 5) complexity += 1;
    
    if (scenes > 100) complexity += 2;
    else if (scenes > 50) complexity += 1;
    
    if (locations > 10) complexity += 2;
    else if (locations > 5) complexity += 1;
    
    if (complexity >= 5) return 'high';
    if (complexity >= 3) return 'medium';
    return 'low';
  }

  calculateElementFrequency(element, script) {
    const content = script.content || JSON.stringify(script);
    const regex = new RegExp(element.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    const matches = content.match(regex);
    return matches ? matches.length : 0;
  }

  findScenesWithElement(element, script) {
    const scenes = script.scenes || [];
    const foundScenes = [];
    
    scenes.forEach((scene, index) => {
      const sceneContent = scene.content || scene.heading || '';
      if (sceneContent.toLowerCase().includes(element.toLowerCase())) {
        foundScenes.push({
          index,
          heading: scene.heading || `Escena ${index + 1}`,
          snippet: sceneContent.substring(0, 100) + '...'
        });
      }
    });
    
    return foundScenes.slice(0, 5);
  }

  classifyRhythm(pacing) {
    if (!pacing || !pacing.rhythmPattern) return 'unknown';
    
    const pattern = pacing.rhythmPattern;
    const consistency = pattern.consistency || 0;
    
    if (consistency > 0.8) return 'steady';
    if (consistency > 0.5) return 'varied';
    return 'chaotic';
  }

  generateScriptVector(script) {
    // Generar vector de características para RAG
    return {
      sceneCount: script.scenes || 0,
      characterCount: script.characters || 0,
      year: script.year || 0,
      complexity: ['low', 'medium', 'high'].indexOf(this.calculateComplexityLevel({ structure: { sceneCount: script.scenes }, characters: Array(script.characters).fill({}) })),
      genre: script.inferredGenre || 'unknown',
      structure: script.structure || {}
    };
  }

  generateMovieVector(movie) {
    return {
      size: movie.size || 0,
      quality: ['low', 'medium', 'high'].indexOf(movie.quality || 'low'),
      year: movie.year || 0,
      format: movie.format || 'unknown',
      genre: movie.inferredGenre || 'unknown'
    };
  }

  generateDirectionLessons(correlation) {
    const lessons = [];
    
    if (correlation.confidence > 0.8) {
      lessons.push({
        type: 'high_confidence_match',
        lesson: `Script '${correlation.script.title}' tiene alta correlación con película. Patrones de dirección aplicables.`,
        applicability: 'high',
        patterns: correlation.analysis.patterns
      });
    }
    
    if (correlation.analysis.timing?.coherence > 0.7) {
      lessons.push({
        type: 'timing_coherence',
        lesson: 'Duración estimada del script coincide con película final. Timing predictions confiables.',
        applicability: 'medium',
        data: correlation.analysis.timing
      });
    }
    
    if (correlation.analysis.patterns?.rhythm?.length > 0) {
      lessons.push({
        type: 'rhythm_pattern',
        lesson: 'Patrones de ritmo identificados en script se reflejan en estructura final.',
        applicability: 'high',
        rhythmData: correlation.analysis.patterns.rhythm
      });
    }
    
    return lessons;
  }

  aggregateDirectionPatterns() {
    const aggregated = {
      atmosphere: {},
      lighting: {},
      rhythm: {},
      cameraWork: {},
      soundDesign: {}
    };
    
    this.correlations.forEach(corr => {
      if (corr.confidence > 0.6) { // Solo correlaciones confiables
        const patterns = corr.analysis.patterns || {};
        
        Object.keys(aggregated).forEach(patternType => {
          const patternData = patterns[patternType] || [];
          patternData.forEach(pattern => {
            const key = pattern.description || pattern.type || 'unknown';
            aggregated[patternType][key] = (aggregated[patternType][key] || 0) + 1;
          });
        });
      }
    });
    
    return aggregated;
  }

  aggregateTimingAnalysis() {
    const timingData = this.correlations
      .filter(corr => corr.confidence > 0.6)
      .map(corr => corr.analysis.timing)
      .filter(timing => timing);
    
    if (timingData.length === 0) return {};
    
    const avgScriptDuration = timingData.reduce((sum, t) => sum + (t.scriptEstimatedDuration || 0), 0) / timingData.length;
    const avgMovieDuration = timingData.reduce((sum, t) => sum + (t.movieEstimatedDuration || 0), 0) / timingData.length;
    const avgRatio = timingData.reduce((sum, t) => sum + (t.durationRatio || 0), 0) / timingData.length;
    
    return {
      averageScriptDuration: avgScriptDuration,
      averageMovieDuration: avgMovieDuration,
      averageDurationRatio: avgRatio,
      samples: timingData.length,
      coherentMatches: timingData.filter(t => t.coherence > 0.7).length
    };
  }

  extractGenreDirectionPatterns() {
    const patterns = [];
    const genres = ['drama', 'comedy', 'action', 'horror', 'animation'];
    
    genres.forEach(genre => {
      const genreCorrelations = this.correlations.filter(corr => 
        corr.movie.genre === genre && corr.confidence > 0.7
      );
      
      if (genreCorrelations.length > 0) {
        const commonPatterns = this.findCommonPatterns(genreCorrelations);
        patterns.push({
          genre,
          patterns: commonPatterns,
          samples: genreCorrelations.length,
          confidence: 'high'
        });
      }
    });
    
    return patterns;
  }

  findCommonPatterns(correlations) {
    const patternCounts = {};
    
    correlations.forEach(corr => {
      const patterns = corr.analysis.patterns || {};
      
      Object.values(patterns).flat().forEach(pattern => {
        const key = pattern.description || pattern.type || 'unknown';
        patternCounts[key] = (patternCounts[key] || 0) + 1;
      });
    });
    
    // Retornar patrones que aparecen en al menos 30% de las correlaciones
    const threshold = correlations.length * 0.3;
    return Object.entries(patternCounts)
      .filter(([pattern, count]) => count >= threshold)
      .map(([pattern, count]) => ({ pattern, frequency: count / correlations.length }))
      .sort((a, b) => b.frequency - a.frequency);
  }

  extractTimingRules() {
    const rules = [];
    const timingData = this.correlations
      .filter(corr => corr.confidence > 0.7 && corr.analysis.timing)
      .map(corr => corr.analysis.timing);
    
    if (timingData.length > 0) {
      const avgRatio = timingData.reduce((sum, t) => sum + (t.durationRatio || 0), 0) / timingData.length;
      
      rules.push({
        rule: 'script_to_movie_duration_ratio',
        description: `Scripts típicamente resultan en películas con ratio ${avgRatio.toFixed(2)}:1`,
        confidence: timingData.filter(t => Math.abs(t.durationRatio - avgRatio) < 0.3).length / timingData.length,
        applicability: 'timing_prediction'
      });
      
      const fastPacedScripts = timingData.filter(t => t.pacing?.scenesPerMinute > 0.5).length;
      if (fastPacedScripts > timingData.length * 0.3) {
        rules.push({
          rule: 'fast_paced_scripts',
          description: 'Scripts con >0.5 escenas/minuto tienden a mantener ritmo rápido en pantalla',
          confidence: fastPacedScripts / timingData.length,
          applicability: 'pacing_prediction'
        });
      }
    }
    
    return rules;
  }

  extractAtmospherePatterns() {
    const patterns = [];
    const atmosphereData = [];
    
    this.correlations.forEach(corr => {
      if (corr.confidence > 0.6 && corr.analysis.patterns?.atmosphere) {
        atmosphereData.push(...corr.analysis.patterns.atmosphere);
      }
    });
    
    // Agrupar por tipo de atmósfera
    const atmosphereTypes = {};
    atmosphereData.forEach(atm => {
      const type = atm.category || 'general';
      if (!atmosphereTypes[type]) atmosphereTypes[type] = [];
      atmosphereTypes[type].push(atm);
    });
    
    Object.entries(atmosphereTypes).forEach(([type, data]) => {
      if (data.length > 2) { // Al menos 3 ejemplos
        patterns.push({
          atmosphereType: type,
          commonElements: this.getTopElements(data, 5),
          frequency: data.length,
          applicability: 'atmosphere_design'
        });
      }
    });
    
    return patterns;
  }

  getTopElements(data, limit = 5) {
    const elementCounts = {};
    
    data.forEach(item => {
      const key = item.element || item.description || 'unknown';
      elementCounts[key] = (elementCounts[key] || 0) + (item.frequency || 1);
    });
    
    return Object.entries(elementCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, limit)
      .map(([element, count]) => ({ element, count }));
  }

  async run() {
    try {
      await this.initialize();
      await this.performAdvancedCorrelation();
      await this.createScriptToScreenDatabase();
      
      console.log('\n🎉 ANÁLISIS LC STUDIO COMPLETADO');
      console.log('=================================');
      console.log(`📊 Resumen final:`);
      console.log(`   🎬 ${this.movies.length} películas analizadas`);
      console.log(`   📄 ${this.scripts.length} guiones procesados`);
      console.log(`   🔍 ${this.correlations.length} correlaciones encontradas`);
      console.log(`   ✅ ${this.correlations.filter(c => c.confidence > 0.7).length} matches de alta confianza`);
      console.log(`\n🎯 RAG del Director: ¡LISTO PARA PREDECIR CÓMO SE FILMA UN GUIÓN!`);
      
    } catch (error) {
      console.error('❌ Error en análisis:', error.message);
      console.error(error.stack);
    } finally {
      if (this.progressInterval) {
        clearInterval(this.progressInterval);
      }
    }
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  const analyzer = new LCStudioAnalyzer();
  analyzer.run();
}

module.exports = LCStudioAnalyzer;