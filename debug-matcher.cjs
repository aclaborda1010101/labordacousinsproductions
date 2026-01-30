#!/usr/bin/env node

const fs = require('fs').promises;
const MovieScanner = require('./movie-scanner.cjs');

class DebugMatcher {
  constructor() {
    this.movieScanner = new MovieScanner();
  }

  async debugMatching() {
    console.log('🔍 DEBUG: Analizando algoritmo de matching...');
    
    // Cargar algunos scripts y películas para debug
    const scripts = await this.loadSampleScripts();
    const movies = await this.loadSampleMovies();
    
    console.log(`📄 Scripts cargados: ${scripts.length}`);
    console.log(`🎬 Películas cargadas: ${movies.length}`);
    
    // Probar matching con algunos ejemplos
    for (let i = 0; i < Math.min(3, scripts.length); i++) {
      const script = scripts[i];
      console.log(`\n📄 Analizando script: "${script.title}" (${script.year || 'sin año'})`);
      console.log(`   Nombre limpio: "${script.cleanTitle}"`);
      
      // Buscar las 5 mejores coincidencias
      const matches = await this.findBestMatches(script, movies, 5);
      
      console.log(`   Encontradas ${matches.length} coincidencias:`);
      matches.forEach((match, idx) => {
        console.log(`   ${idx + 1}. ${match.movie.filename}`);
        console.log(`      Confianza: ${(match.confidence * 100).toFixed(1)}%`);
        console.log(`      Razones: ${match.reasons.join(', ')}`);
        console.log(`      Año película: ${match.movie.year || 'N/A'}`);
      });
    }
  }

  async loadSampleScripts() {
    const scriptsDir = './scripts-scraper/parsed-v2';
    const files = await fs.readdir(scriptsDir);
    const scripts = [];
    
    for (const file of files.slice(0, 10)) { // Solo 10 para debug
      try {
        const content = await fs.readFile(`${scriptsDir}/${file}`, 'utf-8');
        const script = JSON.parse(content);
        
        scripts.push({
          ...script,
          year: this.extractYear(script.slug || file),
          cleanTitle: this.cleanScriptTitle(script.title || script.slug)
        });
      } catch (error) {
        console.warn(`Error cargando ${file}:`, error.message);
      }
    }
    
    return scripts;
  }

  async loadSampleMovies() {
    const allMovies = await this.movieScanner.scanMovies();
    
    // Filtrar y limpiar películas para debug
    return allMovies
      .filter(movie => movie.size > 100 * 1024 * 1024) // Solo archivos > 100MB
      .slice(0, 1000) // Solo 1000 para debug
      .map(movie => ({
        ...movie,
        year: this.extractYear(movie.filename),
        cleanName: this.cleanMovieName(movie.filename)
      }));
  }

  async findBestMatches(script, movies, limit = 5) {
    const matches = [];
    
    for (const movie of movies) {
      const confidence = this.calculateMatchConfidence(script, movie);
      const reasons = this.getMatchReasons(script, movie, confidence);
      
      if (confidence > 0.1) { // Umbral más bajo para debug
        matches.push({
          movie,
          confidence,
          reasons
        });
      }
    }
    
    return matches
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, limit);
  }

  calculateMatchConfidence(script, movie) {
    let confidence = 0;
    
    // Debug: mostrar cálculos paso a paso para el primer match
    const isFirst = !this.debugShown;
    if (isFirst) {
      console.log(`\n🔍 DEBUG DETALLADO para "${script.title}" vs "${movie.filename}"`);
      this.debugShown = true;
    }
    
    // Coincidencia de título (peso alto)
    const titleSimilarity = this.calculateStringSimilarity(script.cleanTitle, movie.cleanName);
    const titlePoints = titleSimilarity * 0.4;
    confidence += titlePoints;
    
    if (isFirst) {
      console.log(`   📝 Similitud título: ${(titleSimilarity * 100).toFixed(1)}% = ${titlePoints.toFixed(3)} puntos`);
      console.log(`      Script: "${script.cleanTitle}"`);
      console.log(`      Película: "${movie.cleanName}"`);
    }
    
    // Coincidencia de año (peso medio)
    let yearPoints = 0;
    if (script.year && movie.year) {
      const yearDiff = Math.abs(script.year - movie.year);
      if (yearDiff <= 2) {
        yearPoints = 0.25 * (1 - yearDiff / 3); // Reducir puntos por diferencia
        confidence += yearPoints;
      }
      
      if (isFirst) {
        console.log(`   📅 Coincidencia año: ${script.year} vs ${movie.year} (diff: ${yearDiff}) = ${yearPoints.toFixed(3)} puntos`);
      }
    } else {
      if (isFirst) {
        console.log(`   📅 Sin información de año disponible`);
      }
    }
    
    // Análisis de duración vs estructura del script
    const durationMatch = this.analyzeDurationMatch(script, movie);
    const durationPoints = durationMatch * 0.2;
    confidence += durationPoints;
    
    if (isFirst) {
      console.log(`   ⏱️  Coherencia duración: ${(durationMatch * 100).toFixed(1)}% = ${durationPoints.toFixed(3)} puntos`);
    }
    
    // Calidad del archivo (preferir archivos grandes)
    let qualityPoints = 0;
    const quality = this.classifyQuality(movie.size);
    if (quality === 'high') qualityPoints = 0.1;
    else if (quality === 'medium') qualityPoints = 0.05;
    confidence += qualityPoints;
    
    if (isFirst) {
      console.log(`   💎 Calidad archivo: ${quality} = ${qualityPoints.toFixed(3)} puntos`);
      console.log(`   🎯 CONFIANZA TOTAL: ${(confidence * 100).toFixed(1)}%`);
    }
    
    return Math.min(confidence, 1.0);
  }

  getMatchReasons(script, movie, confidence) {
    const reasons = [];
    
    const titleSim = this.calculateStringSimilarity(script.cleanTitle, movie.cleanName);
    if (titleSim > 0.5) reasons.push(`Título muy similar (${Math.round(titleSim * 100)}%)`);
    else if (titleSim > 0.3) reasons.push(`Título similar (${Math.round(titleSim * 100)}%)`);
    else if (titleSim > 0.1) reasons.push(`Título parcialmente similar (${Math.round(titleSim * 100)}%)`);
    
    if (script.year && movie.year) {
      const diff = Math.abs(script.year - movie.year);
      if (diff <= 1) reasons.push(`Año exacto (${script.year})`);
      else if (diff <= 3) reasons.push(`Año cercano (${script.year}/${movie.year})`);
    }
    
    const quality = this.classifyQuality(movie.size);
    if (quality === 'high') reasons.push('Alta calidad');
    
    if (confidence > 0.5) reasons.push('Alta confianza general');
    
    return reasons.length > 0 ? reasons : ['Sin coincidencias claras'];
  }

  analyzeDurationMatch(script, movie) {
    const scriptScenes = script.stats?.scenes || 0;
    const estimatedScriptDuration = scriptScenes * 2; // min
    const movieDurationMinutes = movie.size / (50 * 1024 * 1024); // min
    
    if (movieDurationMinutes === 0 || estimatedScriptDuration === 0) return 0;
    
    const ratio = Math.min(estimatedScriptDuration, movieDurationMinutes) / 
                 Math.max(estimatedScriptDuration, movieDurationMinutes);
    
    return ratio;
  }

  calculateStringSimilarity(str1, str2) {
    if (!str1 || !str2) return 0;
    
    // Convertir a minúsculas para comparación
    const s1 = str1.toLowerCase();
    const s2 = str2.toLowerCase();
    
    // Verificar coincidencias exactas de palabras
    const words1 = s1.split(/\s+/).filter(w => w.length > 2);
    const words2 = s2.split(/\s+/).filter(w => w.length > 2);
    
    let wordMatches = 0;
    words1.forEach(word => {
      if (words2.some(w => w.includes(word) || word.includes(w))) {
        wordMatches++;
      }
    });
    
    const wordSimilarity = wordMatches / Math.max(words1.length, words2.length, 1);
    
    // También calcular similitud de caracteres usando Levenshtein
    const charSimilarity = this.levenshteinSimilarity(s1, s2);
    
    // Combinar ambos métodos
    return Math.max(wordSimilarity * 0.7, charSimilarity * 0.3);
  }

  levenshteinSimilarity(str1, str2) {
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

  classifyQuality(size) {
    if (size > 2 * 1024 * 1024 * 1024) return 'high';    // > 2GB
    if (size > 500 * 1024 * 1024) return 'medium';       // > 500MB
    return 'low';                                         // < 500MB
  }
}

// Ejecutar debug
const matcher = new DebugMatcher();
matcher.debugMatching().catch(console.error);