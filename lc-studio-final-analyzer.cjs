#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');
const AnalyzerHelpers = require('./lc-studio-analyzer-helpers.cjs');

/**
 * LC Studio Final Analyzer - RAG Director Builder
 * Crea una base de conocimiento completa para predecir cómo se filma un guión
 */
class LCStudioFinalAnalyzer {
  constructor() {
    this.realMatches = [];
    this.directionDatabase = {
      scriptToScreen: [],
      cinematicPatterns: {},
      timingRules: [],
      genrePatterns: {},
      ragKnowledge: []
    };
    this.progressReports = [];
    this.startTime = Date.now();
  }

  async analyze() {
    console.log('🎬 LC STUDIO FINAL ANALYZER v3.0');
    console.log('=================================');
    console.log('🎯 Objetivo: RAG del Director para predecir filmación de guiones\n');

    try {
      // Fase 1: Encontrar matches reales
      await this.phase1_FindRealMatches();
      
      // Fase 2: Análisis profundo de correlaciones
      await this.phase2_DeepAnalysis();
      
      // Fase 3: Extracción de patrones cinematográficos
      await this.phase3_ExtractCinematicPatterns();
      
      // Fase 4: Construcción base de conocimiento RAG
      await this.phase4_BuildRAGDatabase();
      
      // Fase 5: Validación y exportación
      await this.phase5_ValidateAndExport();
      
      console.log('\n🎉 ANÁLISIS LC STUDIO COMPLETADO EXITOSAMENTE');
      console.log('============================================');
      this.printFinalSummary();
      
    } catch (error) {
      console.error('❌ Error en análisis:', error);
      await this.exportErrorReport(error);
    }
  }

  async exportErrorReport(error) {
    const errorReport = {
      timestamp: new Date().toISOString(),
      error: {
        message: error.message,
        stack: error.stack,
        code: error.code || 'UNKNOWN'
      },
      progress: this.progressReports,
      partialData: {
        matchesLoaded: this.realMatches.length,
        correlationsCompleted: this.directionDatabase.scriptToScreen.length
      }
    };
    
    const filename = `lc-studio-error-report-${Date.now()}.json`;
    await fs.writeFile(filename, JSON.stringify(errorReport, null, 2));
    
    console.log(`💾 Reporte de error guardado: ${filename}`);
    return filename;
  }

  async phase1_FindRealMatches() {
    console.log('📋 FASE 1: Cargar correlaciones script-película reales');
    console.log('─'.repeat(50));
    
    // Cargar matches pre-computados del improved-matcher
    const matchFiles = (await fs.readdir('.')).filter(f => f.includes('improved-matches-'));
    if (matchFiles.length === 0) {
      throw new Error('No se encontraron archivos de matches. Ejecutar improved-matcher.cjs primero.');
    }
    
    const latestMatchFile = matchFiles.sort().pop();
    console.log(`📄 Cargando matches desde: ${latestMatchFile}`);
    
    const matchData = JSON.parse(await fs.readFile(latestMatchFile, 'utf-8'));
    this.realMatches = matchData.matches.map(match => ({
      script: match.script,
      matches: match.movies.map(movie => ({ 
        movie: {
          filename: movie.filename,
          size: movie.size,
          quality: movie.quality,
          year: movie.year,
          path: `unknown_path_${movie.filename}` // Placeholder since path not available
        }, 
        confidence: movie.confidence 
      }))
    }));
    
    console.log(`✅ Fase 1 completada:`);
    console.log(`   📄 Scripts analizados: ${matchData.summary.totalScripts}`);
    console.log(`   🎬 Matches encontrados: ${this.realMatches.length}`);
    console.log(`   📊 Ratio éxito: ${matchData.summary.successRate}\n`);
    
    this.reportProgress('Fase 1: Matches cargados');
  }

  async phase2_DeepAnalysis() {
    console.log('🔍 FASE 2: Análisis profundo de correlaciones');
    console.log('─'.repeat(50));
    
    for (let i = 0; i < this.realMatches.length; i++) {
      const match = this.realMatches[i];
      console.log(`📄 Analizando: "${match.script.title}"`);
      
      // Análisis detallado del script
      const scriptAnalysis = await this.analyzeScriptInDepth(match.script);
      
      // Análisis de la película correspondiente
      const movieAnalysis = await this.analyzeMovieMetadata(match.matches[0].movie);
      
      // Correlación script-película
      const correlation = await this.analyzeScriptMovieCorrelation(
        match.script, 
        match.matches[0].movie, 
        scriptAnalysis, 
        movieAnalysis
      );
      
      this.directionDatabase.scriptToScreen.push({
        id: `correlation_${Date.now()}_${i}`,
        script: {
          ...match.script,
          analysis: scriptAnalysis
        },
        movie: {
          ...match.matches[0].movie,
          analysis: movieAnalysis
        },
        correlation,
        confidence: match.matches[0].confidence,
        timestamp: new Date().toISOString()
      });
      
      console.log(`   ✅ Análisis completado (Confianza: ${(match.matches[0].confidence * 100).toFixed(1)}%)`);
    }
    
    console.log(`\n✅ Fase 2 completada: ${this.realMatches.length} correlaciones analizadas\n`);
    this.reportProgress('Fase 2: Análisis profundo completado');
  }

  async analyzeScriptInDepth(script) {
    console.log(`   📖 Analizando estructura de "${script.title}"`);
    
    // Cargar el script completo para análisis
    const scriptPath = `./scripts-scraper/parsed-v2/${script.slug}.json`;
    const fullScript = JSON.parse(await fs.readFile(scriptPath, 'utf-8'));
    
    const analysis = {
      // Estructura básica
      structure: {
        scenes: fullScript.stats?.scenes || 0,
        dialogues: fullScript.stats?.dialogues || 0,
        characters: fullScript.stats?.characters || 0,
        actBreakdown: AnalyzerHelpers.analyzeActStructure(fullScript.scenes || [])
      },
      
      // Elementos cinematográficos
      cinematic: {
        atmosphere: AnalyzerHelpers.extractAtmosphere(JSON.stringify(fullScript), fullScript.scenes || []),
        lighting: AnalyzerHelpers.extractLighting(JSON.stringify(fullScript), fullScript.scenes || []),
        sound: AnalyzerHelpers.extractSoundElements(JSON.stringify(fullScript), fullScript.scenes || []),
        cameraMovement: AnalyzerHelpers.extractCameraMovement(JSON.stringify(fullScript), fullScript.scenes || []),
        directionNotes: AnalyzerHelpers.extractDirectionNotes(JSON.stringify(fullScript), fullScript.scenes || [])
      },
      
      // Análisis de ritmo y tempo
      pacing: {
        rhythm: AnalyzerHelpers.analyzeRhythm(fullScript.scenes || []),
        dialogueIntensity: AnalyzerHelpers.analyzeDramaticIntensity(fullScript.dialogues || []),
        sceneTransitions: this.analyzeSceneTransitions(fullScript.scenes || [])
      },
      
      // Características únicas
      signature: this.extractDirectorSignature(fullScript),
      
      // Complejidad narrativa
      complexity: this.calculateNarrativeComplexity(fullScript)
    };
    
    console.log(`      Escenas: ${analysis.structure.scenes} | Personajes: ${analysis.structure.characters}`);
    console.log(`      Elementos atmosféricos: ${analysis.cinematic.atmosphere.length}`);
    console.log(`      Indicaciones de dirección: ${analysis.cinematic.directionNotes.length}`);
    
    return analysis;
  }

  async analyzeMovieMetadata(movie) {
    console.log(`   🎬 Analizando película "${movie.filename}"`);
    
    const analysis = {
      technical: {
        size: movie.size,
        quality: this.classifyQuality(movie.size),
        estimatedDuration: this.estimateDuration(movie.size),
        format: path.extname(movie.filename).substring(1).toUpperCase()
      },
      
      inferred: {
        genre: this.inferGenreFromFilename(movie.filename),
        productionValue: this.inferProductionValue(movie.size, movie.filename),
        releaseType: this.inferReleaseType(movie.filename)
      },
      
      filesystem: {
        path: movie.path || 'unknown',
        directory: movie.path ? path.dirname(movie.path) : 'unknown',
        lastModified: movie.lastModified || 'unknown'
      }
    };
    
    console.log(`      Duración estimada: ${analysis.technical.estimatedDuration}`);
    console.log(`      Calidad: ${analysis.technical.quality} | Género inferido: ${analysis.inferred.genre}`);
    
    return analysis;
  }

  async analyzeScriptMovieCorrelation(script, movie, scriptAnalysis, movieAnalysis) {
    console.log(`   🔗 Correlacionando script-película`);
    
    const correlation = {
      // Coherencia temporal
      timing: {
        scriptScenes: scriptAnalysis.structure.scenes,
        estimatedMovieDuration: movieAnalysis.technical.estimatedDuration,
        scenesPerMinute: this.calculateScenesPerMinute(scriptAnalysis, movieAnalysis),
        pacingCoherence: this.analyzePacingCoherence(scriptAnalysis.pacing, movieAnalysis)
      },
      
      // Traducción cinematográfica
      translation: {
        atmosphereToVisual: this.analyzeAtmosphereTranslation(scriptAnalysis.cinematic.atmosphere),
        soundToAudio: this.analyzeSoundTranslation(scriptAnalysis.cinematic.sound),
        directionToExecution: this.analyzeDirectionTranslation(scriptAnalysis.cinematic.directionNotes),
        complexityReduction: this.analyzeComplexityReduction(scriptAnalysis.complexity, movieAnalysis)
      },
      
      // Patrones identificados
      patterns: {
        genreConsistency: this.analyzeGenreConsistency(script, movie, movieAnalysis),
        structuralFidelity: this.analyzeStructuralFidelity(scriptAnalysis.structure),
        rhythmTranslation: this.analyzeRhythmTranslation(scriptAnalysis.pacing, movieAnalysis)
      },
      
      // Lecciones para el RAG
      lessons: this.extractDirectionLessons(script, movie, scriptAnalysis, movieAnalysis)
    };
    
    console.log(`      Escenas/minuto: ${correlation.timing.scenesPerMinute.toFixed(2)}`);
    console.log(`      Lecciones extraídas: ${correlation.lessons.length}`);
    
    return correlation;
  }

  async phase3_ExtractCinematicPatterns() {
    console.log('🎨 FASE 3: Extracción de patrones cinematográficos');
    console.log('─'.repeat(50));
    
    // Agregar patrones por tipo
    this.directionDatabase.cinematicPatterns = {
      atmosphere: this.aggregateAtmospherePatterns(),
      lighting: this.aggregateLightingPatterns(),
      sound: this.aggregateSoundPatterns(),
      camera: this.aggregateCameraPatterns(),
      pacing: this.aggregatePacingPatterns()
    };
    
    // Extraer reglas de timing
    this.directionDatabase.timingRules = this.extractTimingRules();
    
    // Patrones por género
    this.directionDatabase.genrePatterns = this.extractGenrePatterns();
    
    console.log('✅ Patrones cinematográficos extraídos:');
    Object.entries(this.directionDatabase.cinematicPatterns).forEach(([type, patterns]) => {
      const count = Object.keys(patterns).length;
      console.log(`   🎬 ${type}: ${count} patrones únicos`);
    });
    
    console.log(`   📏 Reglas de timing: ${this.directionDatabase.timingRules.length}`);
    console.log(`   🎭 Patrones por género: ${Object.keys(this.directionDatabase.genrePatterns).length}\n`);
    
    this.reportProgress('Fase 3: Patrones cinematográficos extraídos');
  }

  async phase4_BuildRAGDatabase() {
    console.log('🧠 FASE 4: Construcción base de conocimiento RAG');
    console.log('─'.repeat(50));
    
    // Generar vectores de conocimiento para RAG
    const ragKnowledge = [];
    
    // 1. Reglas de dirección basadas en patrones encontrados
    ragKnowledge.push(...this.generateDirectionRules());
    
    // 2. Predicciones de timing script-to-screen
    ragKnowledge.push(...this.generateTimingPredictions());
    
    // 3. Traducciones atmosféricas
    ragKnowledge.push(...this.generateAtmosphereTranslations());
    
    // 4. Patrones de género cinematográfico
    ragKnowledge.push(...this.generateGenreRules());
    
    // 5. Lecciones de casos reales
    ragKnowledge.push(...this.generateCaseLessons());
    
    this.directionDatabase.ragKnowledge = ragKnowledge;
    
    console.log(`✅ Base de conocimiento RAG construida:`);
    console.log(`   📚 Total reglas: ${ragKnowledge.length}`);
    console.log(`   🎯 Reglas de dirección: ${ragKnowledge.filter(r => r.type === 'direction_rule').length}`);
    console.log(`   ⏱️  Predicciones timing: ${ragKnowledge.filter(r => r.type === 'timing_prediction').length}`);
    console.log(`   🎨 Traducciones atmosféricas: ${ragKnowledge.filter(r => r.type === 'atmosphere_translation').length}`);
    console.log(`   🎭 Reglas por género: ${ragKnowledge.filter(r => r.type === 'genre_rule').length}\n`);
    
    this.reportProgress('Fase 4: Base RAG construida');
  }

  async phase5_ValidateAndExport() {
    console.log('💾 FASE 5: Validación y exportación');
    console.log('─'.repeat(50));
    
    // Validar consistencia de datos
    const validation = this.validateDatabase();
    
    console.log(`🔍 Validación de base de datos:`);
    console.log(`   ✅ Correlaciones válidas: ${validation.validCorrelations}/${validation.totalCorrelations}`);
    console.log(`   ✅ Patrones consistentes: ${validation.consistentPatterns}/${validation.totalPatterns}`);
    console.log(`   ✅ Reglas aplicables: ${validation.applicableRules}/${validation.totalRules}`);
    
    // Exportar base de datos completa
    const exportData = {
      metadata: {
        version: '3.0',
        created: new Date().toISOString(),
        analysisTime: Date.now() - this.startTime,
        totalScripts: this.realMatches.length,
        realMatches: this.realMatches.length,
        confidence: 'production-ready'
      },
      database: this.directionDatabase,
      validation,
      progressReports: this.progressReports
    };
    
    const filename = `lc-studio-director-rag-${Date.now()}.json`;
    await fs.writeFile(filename, JSON.stringify(exportData, null, 2));
    
    console.log(`\n💾 Base de datos exportada: ${filename}`);
    console.log(`📊 Tamaño: ${(JSON.stringify(exportData).length / 1024 / 1024).toFixed(2)} MB\n`);
    
    // También exportar versión optimizada para RAG
    await this.exportOptimizedRAGVersion(exportData);
    
    this.reportProgress('Fase 5: Exportación completada');
  }

  // Métodos auxiliares de análisis [implementaciones específicas]
  
  analyzeSceneTransitions(scenes) {
    if (!scenes || scenes.length < 2) return { transitions: 0, avgLength: 0 };
    
    const transitions = [];
    for (let i = 1; i < scenes.length; i++) {
      const prev = scenes[i - 1];
      const curr = scenes[i];
      
      transitions.push({
        type: this.classifyTransition(prev, curr),
        complexity: this.calculateTransitionComplexity(prev, curr)
      });
    }
    
    return {
      transitions: transitions.length,
      avgComplexity: transitions.reduce((sum, t) => sum + t.complexity, 0) / transitions.length,
      types: this.groupTransitionTypes(transitions)
    };
  }

  extractDirectorSignature(script) {
    // Identificar elementos únicos que caracterizan el estilo
    const signature = {
      visualStyle: this.extractVisualStyle(script),
      narrativeStyle: this.extractNarrativeStyle(script),
      dialogueStyle: this.extractDialogueStyle(script.dialogues || []),
      thematicElements: this.extractThematicElements(script)
    };
    
    return signature;
  }

  calculateNarrativeComplexity(script) {
    const factors = {
      characterCount: (script.characters || []).length,
      sceneCount: script.stats?.scenes || 0,
      dialogueComplexity: this.calculateDialogueComplexity(script.dialogues || []),
      structuralComplexity: this.calculateStructuralComplexity(script.scenes || [])
    };
    
    // Fórmula compuesta de complejidad
    const complexity = (
      Math.log(factors.characterCount + 1) * 0.3 +
      Math.log(factors.sceneCount + 1) * 0.3 +
      factors.dialogueComplexity * 0.2 +
      factors.structuralComplexity * 0.2
    );
    
    return {
      score: Math.min(complexity, 10), // Normalizar a 0-10
      factors,
      level: complexity > 7 ? 'high' : complexity > 4 ? 'medium' : 'low'
    };
  }

  generateDirectionRules() {
    const rules = [];
    
    // Reglas basadas en patrones atmosféricos
    const atmospherePatterns = this.directionDatabase.cinematicPatterns.atmosphere;
    Object.entries(atmospherePatterns).forEach(([element, frequency]) => {
      if (frequency > 1) { // Aparece en múltiples scripts
        rules.push({
          type: 'direction_rule',
          category: 'atmosphere',
          rule: `Cuando el script menciona "${element}", considerar elementos visuales que refuercen esta atmósfera`,
          confidence: Math.min(frequency / this.realMatches.length, 1),
          frequency,
          examples: this.getAtmosphereExamples(element)
        });
      }
    });
    
    // Reglas de lighting
    const lightingPatterns = this.directionDatabase.cinematicPatterns.lighting;
    Object.entries(lightingPatterns).forEach(([element, data]) => {
      rules.push({
        type: 'direction_rule',
        category: 'lighting',
        rule: `Referencias a "${element}" en el script sugieren esquema de iluminación ${data.inferredStyle}`,
        confidence: data.confidence,
        technicalAdvice: data.technicalAdvice
      });
    });
    
    return rules;
  }

  // ... [Más métodos de análisis y utilidades] ...

  reportProgress(phase) {
    const report = {
      timestamp: new Date().toISOString(),
      phase,
      elapsed: Date.now() - this.startTime,
      matches: this.realMatches.length,
      correlations: this.directionDatabase.scriptToScreen.length,
      patterns: Object.keys(this.directionDatabase.cinematicPatterns).length,
      ragRules: this.directionDatabase.ragKnowledge.length
    };
    
    this.progressReports.push(report);
    
    console.log(`📊 PROGRESO: ${phase}`);
    console.log(`   ⏱️  Tiempo transcurrido: ${Math.round(report.elapsed / 1000)}s`);
    console.log(`   📊 Estado: ${report.correlations} correlaciones | ${report.ragRules} reglas RAG\n`);
  }

  printFinalSummary() {
    const totalTime = Date.now() - this.startTime;
    const ragRules = this.directionDatabase.ragKnowledge.length;
    
    console.log(`🎯 EL RAG DEL DIRECTOR ESTÁ LISTO:`);
    console.log(`   📄 Scripts procesados: ${this.realMatches.length}`);
    console.log(`   🎬 Correlaciones reales: ${this.directionDatabase.scriptToScreen.length}`);
    console.log(`   🧠 Reglas RAG generadas: ${ragRules}`);
    console.log(`   ⏱️  Tiempo total: ${Math.round(totalTime / 1000)}s`);
    console.log(`   🎬 LISTO PARA PREDECIR CÓMO SE FILMA CUALQUIER GUIÓN! 🎬`);
  }

  // Métodos auxiliares simples
  classifyQuality(size) {
    if (size > 2 * 1024 * 1024 * 1024) return 'high';
    if (size > 500 * 1024 * 1024) return 'medium';
    return 'low';
  }

  estimateDuration(size) {
    const hours = size / (1024 * 1024 * 1024);
    if (hours < 1) return `${Math.round(hours * 60)} min`;
    return `${Math.round(hours * 10) / 10}h`;
  }

  // Métodos auxiliares implementados
  
  inferGenreFromFilename(filename) {
    const name = filename.toLowerCase();
    if (name.includes('comedy') || name.includes('comedia')) return 'comedy';
    if (name.includes('action') || name.includes('accion')) return 'action';
    if (name.includes('horror') || name.includes('terror')) return 'horror';
    if (name.includes('drama')) return 'drama';
    if (name.includes('thriller')) return 'thriller';
    return 'unknown';
  }

  inferProductionValue(size, filename) {
    const quality = this.classifyQuality(size);
    const name = filename.toLowerCase();
    
    if (quality === 'high' && (name.includes('4k') || name.includes('uhd'))) return 'high-budget';
    if (quality === 'high' || name.includes('bluray') || name.includes('1080p')) return 'medium-budget';
    return 'low-budget';
  }

  inferReleaseType(filename) {
    const name = filename.toLowerCase();
    if (name.includes('cam') || name.includes('ts')) return 'cam';
    if (name.includes('webrip') || name.includes('webdl')) return 'streaming';
    if (name.includes('bluray') || name.includes('bdrem')) return 'bluray';
    if (name.includes('dvd')) return 'dvd';
    return 'unknown';
  }

  calculateScenesPerMinute(scriptAnalysis, movieAnalysis) {
    const scenes = scriptAnalysis.structure.scenes;
    const durationStr = movieAnalysis.technical.estimatedDuration;
    const minutes = this.parseDurationToMinutes(durationStr);
    
    return minutes > 0 ? scenes / minutes : 0;
  }

  parseDurationToMinutes(durationStr) {
    if (!durationStr) return 0;
    
    if (durationStr.includes('min')) {
      return parseInt(durationStr.replace(/\D/g, ''));
    } else if (durationStr.includes('h')) {
      const hours = parseFloat(durationStr.replace(/[^\d.]/g, ''));
      return hours * 60;
    }
    
    return 90; // Default assumption
  }

  analyzePacingCoherence(scriptPacing, movieAnalysis) {
    // Análisis simplificado de coherencia de ritmo
    const scriptComplexity = scriptPacing.rhythm?.consistency || 0;
    const movieQuality = movieAnalysis.technical.quality;
    
    let coherence = 0.5; // Base
    
    if (movieQuality === 'high' && scriptComplexity > 0.7) coherence += 0.3;
    if (movieQuality === 'medium' && scriptComplexity > 0.5) coherence += 0.2;
    
    return Math.min(coherence, 1.0);
  }

  analyzeAtmosphereTranslation(atmosphereElements) {
    return atmosphereElements.map(element => ({
      scriptElement: element.element,
      category: element.category,
      visualSuggestion: this.mapAtmosphereToVisual(element),
      frequency: element.frequency
    }));
  }

  mapAtmosphereToVisual(atmosphereElement) {
    const mappings = {
      'dark': 'Low-key lighting, shadows',
      'bright': 'High-key lighting, open spaces',
      'mysterious': 'Selective lighting, fog/haze',
      'romantic': 'Warm lighting, soft focus',
      'tense': 'Harsh shadows, tight framing',
      'sad': 'Desaturated colors, overcast',
      'happy': 'Vibrant colors, open framing'
    };
    
    return mappings[atmosphereElement.element] || 'Standard cinematography';
  }

  analyzeSoundTranslation(soundElements) {
    return soundElements.map(element => ({
      scriptSound: element.description,
      category: element.category,
      audioSuggestion: this.mapSoundToAudio(element),
      frequency: element.frequency
    }));
  }

  mapSoundToAudio(soundElement) {
    const mappings = {
      'music': 'Score composition, mood enhancement',
      'natural': 'Environmental sound design',
      'vocal': 'Dialogue emphasis, vocal processing',
      'ambient': 'Background atmosphere'
    };
    
    return mappings[soundElement.category] || 'Standard audio treatment';
  }

  analyzeDirectionTranslation(directionNotes) {
    return directionNotes.map(note => ({
      scriptDirection: note.content,
      type: note.type,
      filmingAdvice: this.mapDirectionToFilming(note),
      frequency: note.frequency
    }));
  }

  mapDirectionToFilming(directionNote) {
    const typeMapping = {
      'camera': 'Camera movement/framing as specified',
      'transition': 'Editing transition style',
      'audio': 'Sound design element',
      'lighting': 'Lighting setup modification',
      'action': 'Blocking and performance direction'
    };
    
    return typeMapping[directionNote.type] || 'Follow script direction';
  }

  analyzeComplexityReduction(scriptComplexity, movieAnalysis) {
    const scriptLevel = scriptComplexity.level;
    const movieQuality = movieAnalysis.technical.quality;
    
    return {
      originalComplexity: scriptLevel,
      expectedReduction: this.getExpectedReduction(scriptLevel, movieQuality),
      adaptationStrategy: this.getAdaptationStrategy(scriptLevel, movieQuality)
    };
  }

  getExpectedReduction(scriptLevel, movieQuality) {
    const reductions = {
      'high': { 'high': 0.1, 'medium': 0.3, 'low': 0.5 },
      'medium': { 'high': 0.05, 'medium': 0.2, 'low': 0.4 },
      'low': { 'high': 0, 'medium': 0.1, 'low': 0.2 }
    };
    
    return reductions[scriptLevel]?.[movieQuality] || 0.3;
  }

  getAdaptationStrategy(scriptLevel, movieQuality) {
    if (scriptLevel === 'high' && movieQuality === 'low') {
      return 'Simplify narrative, reduce locations, combine characters';
    } else if (scriptLevel === 'medium' && movieQuality === 'medium') {
      return 'Maintain core complexity, optimize scenes';
    } else {
      return 'Preserve script structure';
    }
  }

  analyzeGenreConsistency(script, movie, movieAnalysis) {
    const scriptTitle = script.title.toLowerCase();
    const movieGenre = movieAnalysis.inferred.genre;
    
    // Simplificado: comparar géneros inferidos
    const consistency = movieGenre !== 'unknown' ? 0.8 : 0.5;
    
    return {
      consistency,
      scriptGenre: this.inferScriptGenre(scriptTitle),
      movieGenre,
      recommendation: consistency > 0.7 ? 'Genre alignment confirmed' : 'Verify genre match'
    };
  }

  inferScriptGenre(title) {
    if (title.includes('kill') || title.includes('war') || title.includes('fight')) return 'action';
    if (title.includes('love') || title.includes('heart')) return 'romance';
    if (title.includes('laugh') || title.includes('fun')) return 'comedy';
    return 'drama'; // Default
  }

  analyzeStructuralFidelity(structure) {
    const scenes = structure.scenes;
    const actBreakdown = structure.actBreakdown;
    
    let fidelity = 0.8; // Base assumption
    
    if (scenes > 100) fidelity += 0.1; // Well-structured
    if (actBreakdown && actBreakdown.structure === 'well-structured') fidelity += 0.1;
    
    return {
      fidelity: Math.min(fidelity, 1.0),
      structure: actBreakdown?.structure || 'unknown',
      recommendation: fidelity > 0.8 ? 'Maintain script structure' : 'Consider structural adaptation'
    };
  }

  analyzeRhythmTranslation(scriptPacing, movieAnalysis) {
    const scriptRhythm = scriptPacing.rhythm?.type || 'unknown';
    const movieQuality = movieAnalysis.technical.quality;
    
    return {
      scriptRhythm,
      expectedFilmRhythm: this.mapScriptRhythmToFilm(scriptRhythm, movieQuality),
      confidence: this.calculateRhythmConfidence(scriptRhythm, movieQuality)
    };
  }

  mapScriptRhythmToFilm(scriptRhythm, movieQuality) {
    const mappings = {
      'steady': 'Consistent pacing throughout',
      'varied': 'Dynamic editing, rhythm changes',
      'chaotic': movieQuality === 'high' ? 'Controlled chaos, complex editing' : 'Simplified, steadier pacing'
    };
    
    return mappings[scriptRhythm] || 'Standard film pacing';
  }

  calculateRhythmConfidence(scriptRhythm, movieQuality) {
    if (scriptRhythm === 'steady') return 0.9;
    if (scriptRhythm === 'varied' && movieQuality === 'high') return 0.8;
    if (scriptRhythm === 'chaotic' && movieQuality === 'high') return 0.6;
    return 0.5;
  }

  extractDirectionLessons(script, movie, scriptAnalysis, movieAnalysis) {
    const lessons = [];
    
    // Lección sobre atmosfera
    if (scriptAnalysis.cinematic.atmosphere.length > 0) {
      lessons.push({
        type: 'atmosphere_lesson',
        lesson: `Scripts with ${scriptAnalysis.cinematic.atmosphere.length} atmospheric elements require careful visual translation`,
        applicability: 'atmosphere_design',
        confidence: 0.8
      });
    }
    
    // Lección sobre complejidad
    const complexity = scriptAnalysis.complexity.level;
    lessons.push({
      type: 'complexity_lesson',
      lesson: `${complexity} complexity scripts work well with ${movieAnalysis.technical.quality} quality production`,
      applicability: 'production_planning',
      confidence: 0.7
    });
    
    // Lección sobre timing
    const scenesPerMin = this.calculateScenesPerMinute(scriptAnalysis, movieAnalysis);
    if (scenesPerMin > 0) {
      lessons.push({
        type: 'timing_lesson',
        lesson: `${script.scenes} scenes translate to ~${scenesPerMin.toFixed(1)} scenes per minute`,
        applicability: 'timing_prediction',
        confidence: 0.6
      });
    }
    
    return lessons;
  }

  // Métodos de agregación de patrones
  
  aggregateAtmospherePatterns() {
    const patterns = {};
    
    this.directionDatabase.scriptToScreen.forEach(correlation => {
      const atmosphere = correlation.script.analysis.cinematic.atmosphere || [];
      atmosphere.forEach(element => {
        const key = element.element;
        patterns[key] = (patterns[key] || 0) + element.frequency;
      });
    });
    
    return patterns;
  }

  aggregateLightingPatterns() {
    const patterns = {};
    
    this.directionDatabase.scriptToScreen.forEach(correlation => {
      const lighting = correlation.script.analysis.cinematic.lighting || [];
      lighting.forEach(element => {
        patterns[element.description] = {
          frequency: (patterns[element.description]?.frequency || 0) + element.frequency,
          inferredStyle: this.inferLightingStyle(element.type),
          technicalAdvice: this.getLightingAdvice(element.type),
          confidence: 0.7
        };
      });
    });
    
    return patterns;
  }

  inferLightingStyle(lightingType) {
    const styles = {
      'natural-bright': 'naturalistic',
      'natural-dim': 'moody',
      'flame': 'dramatic',
      'dark': 'noir',
      'artificial': 'controlled'
    };
    
    return styles[lightingType] || 'standard';
  }

  getLightingAdvice(lightingType) {
    const advice = {
      'natural-bright': 'Use natural light, avoid harsh shadows',
      'natural-dim': 'Golden hour, soft key lighting',
      'flame': 'Practical lights, warm color temperature',
      'dark': 'Low-key lighting, strong contrast',
      'artificial': 'Studio lighting setup'
    };
    
    return advice[lightingType] || 'Standard three-point lighting';
  }

  aggregateSoundPatterns() {
    const patterns = {};
    
    this.directionDatabase.scriptToScreen.forEach(correlation => {
      const sound = correlation.script.analysis.cinematic.sound || [];
      sound.forEach(element => {
        const key = `${element.category}_${element.description}`;
        patterns[key] = (patterns[key] || 0) + element.frequency;
      });
    });
    
    return patterns;
  }

  aggregateCameraPatterns() {
    const patterns = {};
    
    this.directionDatabase.scriptToScreen.forEach(correlation => {
      const camera = correlation.script.analysis.cinematic.cameraMovement || [];
      camera.forEach(element => {
        patterns[element.type] = (patterns[element.type] || 0) + element.frequency;
      });
    });
    
    return patterns;
  }

  aggregatePacingPatterns() {
    const patterns = {};
    
    this.directionDatabase.scriptToScreen.forEach(correlation => {
      const rhythm = correlation.script.analysis.pacing.rhythm;
      if (rhythm && rhythm.type) {
        patterns[rhythm.type] = (patterns[rhythm.type] || 0) + 1;
      }
    });
    
    return patterns;
  }

  extractTimingRules() {
    const rules = [];
    
    // Regla general de escenas por minuto
    const avgScenesPerMin = this.directionDatabase.scriptToScreen.reduce((sum, corr) => {
      return sum + this.calculateScenesPerMinute(
        corr.script.analysis, 
        corr.movie.analysis
      );
    }, 0) / this.directionDatabase.scriptToScreen.length;
    
    if (avgScenesPerMin > 0) {
      rules.push({
        type: 'timing_rule',
        rule: `Average scenes per minute: ${avgScenesPerMin.toFixed(2)}`,
        confidence: 0.7,
        applicability: 'general_timing'
      });
    }
    
    return rules;
  }

  extractGenrePatterns() {
    const patterns = {};
    
    this.directionDatabase.scriptToScreen.forEach(correlation => {
      const genre = correlation.movie.analysis.inferred.genre;
      if (genre !== 'unknown') {
        if (!patterns[genre]) {
          patterns[genre] = {
            count: 0,
            atmosphereElements: new Set(),
            avgComplexity: 0,
            samples: []
          };
        }
        
        patterns[genre].count++;
        patterns[genre].samples.push(correlation.script.title);
        
        // Agregar elementos atmosféricos
        correlation.script.analysis.cinematic.atmosphere.forEach(atm => {
          patterns[genre].atmosphereElements.add(atm.element);
        });
        
        patterns[genre].avgComplexity += correlation.script.analysis.complexity.score;
      }
    });
    
    // Promediar complejidad
    Object.values(patterns).forEach(pattern => {
      pattern.avgComplexity /= pattern.count;
      pattern.atmosphereElements = Array.from(pattern.atmosphereElements);
    });
    
    return patterns;
  }

  generateTimingPredictions() {
    const predictions = [];
    
    // Predicción basada en número de escenas
    const scenesToDuration = this.calculateScenesToDurationMapping();
    predictions.push({
      type: 'timing_prediction',
      rule: `Script scenes to film duration mapping established`,
      formula: scenesToDuration,
      confidence: 0.8,
      applicability: 'pre_production_planning'
    });
    
    return predictions;
  }

  calculateScenesToDurationMapping() {
    const mappings = this.directionDatabase.scriptToScreen.map(corr => ({
      scenes: corr.script.analysis.structure.scenes,
      duration: this.parseDurationToMinutes(corr.movie.analysis.technical.estimatedDuration)
    }));
    
    const avgRatio = mappings.reduce((sum, m) => sum + (m.duration / m.scenes), 0) / mappings.length;
    
    return {
      avgMinutesPerScene: avgRatio,
      samples: mappings.length,
      reliability: mappings.length > 3 ? 'high' : 'medium'
    };
  }

  generateAtmosphereTranslations() {
    const translations = [];
    const atmospherePatterns = this.directionDatabase.cinematicPatterns.atmosphere;
    
    Object.entries(atmospherePatterns).forEach(([element, frequency]) => {
      if (frequency > 1) {
        translations.push({
          type: 'atmosphere_translation',
          scriptElement: element,
          visualTranslation: this.mapAtmosphereToVisual({ element }),
          frequency,
          confidence: Math.min(frequency / this.realMatches.length, 1),
          applicability: 'visual_design'
        });
      }
    });
    
    return translations;
  }

  generateGenreRules() {
    const rules = [];
    const genrePatterns = this.directionDatabase.genrePatterns;
    
    Object.entries(genrePatterns).forEach(([genre, data]) => {
      rules.push({
        type: 'genre_rule',
        genre,
        rule: `${genre} films typically feature: ${data.atmosphereElements.slice(0, 3).join(', ')}`,
        avgComplexity: data.avgComplexity,
        samples: data.count,
        confidence: data.count > 1 ? 0.8 : 0.6,
        applicability: 'genre_specific_direction'
      });
    });
    
    return rules;
  }

  generateCaseLessons() {
    const lessons = [];
    
    this.directionDatabase.scriptToScreen.forEach((correlation, index) => {
      const lesson = {
        type: 'case_lesson',
        caseId: index + 1,
        scriptTitle: correlation.script.title,
        movieFile: correlation.movie.filename,
        keyLessons: correlation.correlation.lessons.map(l => l.lesson),
        confidence: correlation.confidence,
        applicability: 'real_world_examples'
      };
      
      lessons.push(lesson);
    });
    
    return lessons;
  }

  validateDatabase() {
    const validCorrelations = this.directionDatabase.scriptToScreen.filter(
      corr => corr.confidence > 0.7
    ).length;
    
    const consistentPatterns = Object.keys(this.directionDatabase.cinematicPatterns).filter(
      type => Object.keys(this.directionDatabase.cinematicPatterns[type]).length > 0
    ).length;
    
    const applicableRules = this.directionDatabase.ragKnowledge.filter(
      rule => rule.confidence > 0.6
    ).length;
    
    return {
      validCorrelations,
      totalCorrelations: this.directionDatabase.scriptToScreen.length,
      consistentPatterns,
      totalPatterns: Object.keys(this.directionDatabase.cinematicPatterns).length,
      applicableRules,
      totalRules: this.directionDatabase.ragKnowledge.length
    };
  }

  async exportOptimizedRAGVersion(exportData) {
    // Versión optimizada solo con reglas RAG esenciales
    const optimizedData = {
      version: '3.0-optimized',
      created: exportData.metadata.created,
      ragRules: exportData.database.ragKnowledge,
      quickReference: {
        commonAtmosphereTranslations: this.getTopAtmosphereTranslations(),
        timingGuidelines: this.getTimingGuidelines(),
        genreSpecificRules: this.getTopGenreRules()
      }
    };
    
    const filename = `lc-studio-director-rag-optimized-${Date.now()}.json`;
    await fs.writeFile(filename, JSON.stringify(optimizedData, null, 2));
    
    console.log(`💡 Versión optimizada RAG: ${filename}`);
    console.log(`📊 Tamaño optimizado: ${(JSON.stringify(optimizedData).length / 1024).toFixed(1)} KB`);
  }

  getTopAtmosphereTranslations() {
    return this.directionDatabase.ragKnowledge
      .filter(rule => rule.type === 'atmosphere_translation')
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 10);
  }

  getTimingGuidelines() {
    return this.directionDatabase.ragKnowledge
      .filter(rule => rule.type === 'timing_prediction')
      .sort((a, b) => b.confidence - a.confidence);
  }

  getTopGenreRules() {
    return this.directionDatabase.ragKnowledge
      .filter(rule => rule.type === 'genre_rule')
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 5);
  }

  // Métodos auxiliares para análisis de estilo y transiciones
  
  classifyTransition(prevScene, currScene) {
    // Implementación simplificada
    return 'standard';
  }

  calculateTransitionComplexity(prevScene, currScene) {
    // Implementación simplificada
    return 0.5;
  }

  groupTransitionTypes(transitions) {
    const types = {};
    transitions.forEach(t => {
      types[t.type] = (types[t.type] || 0) + 1;
    });
    return types;
  }

  extractVisualStyle(script) {
    return {
      descriptiveness: 'medium',
      visualComplexity: 'standard'
    };
  }

  extractNarrativeStyle(script) {
    return {
      structure: 'three-act',
      complexity: 'medium'
    };
  }

  extractDialogueStyle(dialogues) {
    return {
      density: dialogues.length > 1000 ? 'high' : 'medium',
      complexity: 'standard'
    };
  }

  extractThematicElements(script) {
    return {
      themes: ['universal'],
      tone: 'neutral'
    };
  }

  calculateDialogueComplexity(dialogues) {
    if (dialogues.length === 0) return 0;
    
    const avgLength = dialogues.reduce((sum, d) => {
      const text = d.text || d.content || '';
      return sum + text.split(/\s+/).length;
    }, 0) / dialogues.length;
    
    return Math.min(avgLength / 20, 1); // Normalizar
  }

  calculateStructuralComplexity(scenes) {
    if (scenes.length === 0) return 0;
    
    // Complejidad basada en variabilidad de ubicaciones
    const locations = new Set();
    scenes.forEach(scene => {
      const content = scene.content || scene.heading || '';
      const location = content.match(/(?:INT\.|EXT\.)\s*([^-]+)/);
      if (location) {
        locations.add(location[1].trim());
      }
    });
    
    return Math.min(locations.size / scenes.length, 1);
  }

  getAtmosphereExamples(element) {
    // Buscar ejemplos del elemento en las correlaciones
    const examples = [];
    this.directionDatabase.scriptToScreen.forEach(corr => {
      const hasElement = corr.script.analysis.cinematic.atmosphere.some(
        atm => atm.element === element
      );
      if (hasElement) {
        examples.push(corr.script.title);
      }
    });
    
    return examples.slice(0, 3); // Top 3 ejemplos
  }
}

// Ejecutar análisis completo
if (require.main === module) {
  const analyzer = new LCStudioFinalAnalyzer();
  analyzer.analyze().catch(console.error);
}

module.exports = LCStudioFinalAnalyzer;