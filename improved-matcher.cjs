#!/usr/bin/env node

const fs = require('fs').promises;
const MovieScanner = require('./movie-scanner.cjs');

class ImprovedMatcher {
  constructor() {
    this.movieScanner = new MovieScanner();
    this.exactMatches = [];
    this.nearMatches = [];
  }

  async findRealMatches() {
    console.log('🎯 IMPROVED MATCHER: Buscando coincidencias REALES...');
    
    const scripts = await this.loadAllScripts();
    const movies = await this.loadAllMovies();
    
    console.log(`📄 Scripts cargados: ${scripts.length}`);
    console.log(`🎬 Películas cargadas: ${movies.length}`);
    
    // Crear índices para búsqueda rápida
    const movieIndex = this.createMovieIndex(movies);
    
    let exactMatches = 0;
    let nearMatches = 0;
    let totalAnalyzed = 0;
    
    for (const script of scripts) {
      const matches = this.findExactMatches(script, movieIndex);
      
      if (matches.length > 0) {
        exactMatches++;
        console.log(`\n✅ MATCH EXACTO: "${script.title}" (${script.year || 'N/A'})`);
        matches.forEach(match => {
          console.log(`   🎬 ${match.movie.filename}`);
          console.log(`      Confianza: ${(match.confidence * 100).toFixed(1)}% | Razón: ${match.reason}`);
        });
        
        this.exactMatches.push({ script, matches });
      } else {
        // Buscar coincidencias cercanas
        const nearMatchResults = this.findNearMatches(script, movies);
        if (nearMatchResults.length > 0) {
          nearMatches++;
          console.log(`\n🔍 MATCH PARCIAL: "${script.title}"`);
          nearMatchResults.slice(0, 2).forEach(match => {
            console.log(`   🎬 ${match.movie.filename} (${(match.confidence * 100).toFixed(1)}%)`);
          });
        }
      }
      
      totalAnalyzed++;
      if (totalAnalyzed % 10 === 0) {
        console.log(`📊 Progreso: ${totalAnalyzed}/${scripts.length} | Exactos: ${exactMatches} | Parciales: ${nearMatches}`);
      }
    }
    
    console.log(`\n🎉 RESUMEN FINAL:`);
    console.log(`   ✅ Matches exactos: ${exactMatches}`);
    console.log(`   🔍 Matches parciales: ${nearMatches}`);
    console.log(`   📊 Ratio éxito: ${((exactMatches + nearMatches) / scripts.length * 100).toFixed(1)}%`);
    
    // Exportar resultados
    await this.exportResults(scripts.length);
    
    return { exactMatches: this.exactMatches, totalScripts: scripts.length };
  }

  async loadAllScripts() {
    const scriptsDir = './scripts-scraper/parsed-v2';
    const files = await fs.readdir(scriptsDir);
    const scripts = [];
    
    for (const file of files) {
      try {
        const content = await fs.readFile(`${scriptsDir}/${file}`, 'utf-8');
        const script = JSON.parse(content);
        
        scripts.push({
          ...script,
          year: this.extractYear(script.slug || file),
          cleanTitle: this.cleanScriptTitle(script.title || script.slug),
          originalTitle: script.title,
          // Generar variaciones del título
          titleVariations: this.generateTitleVariations(script.title || script.slug)
        });
      } catch (error) {
        console.warn(`Error cargando ${file}:`, error.message);
      }
    }
    
    return scripts;
  }

  async loadAllMovies() {
    const allMovies = await this.movieScanner.scanMovies();
    
    return allMovies
      .filter(movie => movie.size > 100 * 1024 * 1024) // Solo archivos > 100MB
      .map(movie => ({
        ...movie,
        year: this.extractYear(movie.filename),
        cleanName: this.cleanMovieName(movie.filename),
        originalFilename: movie.filename,
        // Generar variaciones del nombre
        nameVariations: this.generateTitleVariations(movie.filename)
      }));
  }

  generateTitleVariations(title) {
    if (!title) return [];
    
    const variations = new Set();
    const baseTitle = title.toLowerCase();
    
    // Título original
    variations.add(baseTitle);
    
    // Sin artículos
    const withoutArticles = baseTitle.replace(/\b(the|la|el|las|los|a|an|le|les)\b/g, '').trim();
    if (withoutArticles) variations.add(withoutArticles);
    
    // Solo palabras principales (>3 caracteres)
    const mainWords = baseTitle.split(/\s+/).filter(word => word.length > 3);
    if (mainWords.length > 0) variations.add(mainWords.join(' '));
    
    // Sin números y años
    const withoutNumbers = baseTitle.replace(/\d+/g, '').replace(/\s+/g, ' ').trim();
    if (withoutNumbers) variations.add(withoutNumbers);
    
    // Palabras clave principales (primera palabra + última palabra si hay más de 2)
    const words = baseTitle.split(/\s+/).filter(w => w.length > 2);
    if (words.length >= 2) {
      variations.add(`${words[0]} ${words[words.length - 1]}`);
    }
    
    // Primeras 2-3 palabras
    if (words.length >= 2) {
      variations.add(words.slice(0, Math.min(3, words.length)).join(' '));
    }
    
    return Array.from(variations).filter(v => v.length > 2);
  }

  createMovieIndex(movies) {
    const index = new Map();
    
    movies.forEach(movie => {
      // Indexar por todas las variaciones del nombre
      movie.nameVariations.forEach(variation => {
        if (!index.has(variation)) {
          index.set(variation, []);
        }
        index.get(variation).push(movie);
      });
      
      // También indexar palabras individuales para búsqueda parcial
      const words = movie.cleanName.split(/\s+/).filter(w => w.length > 3);
      words.forEach(word => {
        const key = `word_${word}`;
        if (!index.has(key)) {
          index.set(key, []);
        }
        index.get(key).push(movie);
      });
    });
    
    return index;
  }

  findExactMatches(script, movieIndex) {
    const matches = [];
    const confidenceThreshold = 0.7; // Alto para matches exactos
    
    // Buscar por cada variación del título del script
    script.titleVariations.forEach(titleVar => {
      const candidateMovies = movieIndex.get(titleVar) || [];
      
      candidateMovies.forEach(movie => {
        const confidence = this.calculateExactMatchConfidence(script, movie, titleVar);
        
        if (confidence >= confidenceThreshold) {
          matches.push({
            movie,
            confidence,
            reason: `Título exacto: "${titleVar}"`,
            matchType: 'exact'
          });
        }
      });
    });
    
    // Buscar también por coincidencias de palabras clave
    const scriptWords = script.cleanTitle.split(/\s+/).filter(w => w.length > 3);
    scriptWords.forEach(word => {
      const candidateMovies = movieIndex.get(`word_${word}`) || [];
      
      candidateMovies.forEach(movie => {
        // Verificar si múltiples palabras coinciden
        const movieWords = movie.cleanName.split(/\s+/);
        const wordMatches = scriptWords.filter(sw => 
          movieWords.some(mw => mw.includes(sw) || sw.includes(mw))
        );
        
        if (wordMatches.length >= Math.min(2, scriptWords.length)) {
          const confidence = this.calculateWordMatchConfidence(script, movie, wordMatches);
          
          if (confidence >= 0.6) {
            matches.push({
              movie,
              confidence,
              reason: `Palabras clave: ${wordMatches.join(', ')}`,
              matchType: 'keyword'
            });
          }
        }
      });
    });
    
    // Remover duplicados y ordenar por confianza
    const uniqueMatches = this.removeDuplicateMatches(matches);
    return uniqueMatches.sort((a, b) => b.confidence - a.confidence).slice(0, 3);
  }

  calculateExactMatchConfidence(script, movie, matchedTitle) {
    let confidence = 0.8; // Base alta para matches de título
    
    // Bonus por año coincidente
    if (script.year && movie.year && Math.abs(script.year - movie.year) <= 1) {
      confidence += 0.15;
    } else if (script.year && movie.year && Math.abs(script.year - movie.year) <= 3) {
      confidence += 0.05;
    }
    
    // Penalización por año muy diferente
    if (script.year && movie.year && Math.abs(script.year - movie.year) > 5) {
      confidence -= 0.2;
    }
    
    // Bonus por calidad de archivo
    const quality = this.classifyQuality(movie.size);
    if (quality === 'high') confidence += 0.05;
    
    // Bonus por longitud de match
    if (matchedTitle.length > 10) confidence += 0.05;
    
    return Math.min(confidence, 1.0);
  }

  calculateWordMatchConfidence(script, movie, wordMatches) {
    const scriptWords = script.cleanTitle.split(/\s+/).filter(w => w.length > 3);
    const movieWords = movie.cleanName.split(/\s+/).filter(w => w.length > 3);
    
    // Ratio de palabras coincidentes
    const wordRatio = wordMatches.length / Math.max(scriptWords.length, movieWords.length);
    let confidence = wordRatio * 0.7;
    
    // Bonus por año
    if (script.year && movie.year && Math.abs(script.year - movie.year) <= 2) {
      confidence += 0.2;
    }
    
    // Bonus si las palabras coincidentes son significativas
    const significantMatches = wordMatches.filter(word => word.length > 5);
    confidence += significantMatches.length * 0.05;
    
    return Math.min(confidence, 0.95);
  }

  findNearMatches(script, movies) {
    const matches = [];
    const maxCandidates = 1000; // Limitar para performance
    
    movies.slice(0, maxCandidates).forEach(movie => {
      const confidence = this.calculateFlexibleSimilarity(script, movie);
      
      if (confidence > 0.4) { // Umbral más bajo para matches parciales
        matches.push({
          movie,
          confidence,
          reason: 'Similitud parcial'
        });
      }
    });
    
    return matches.sort((a, b) => b.confidence - a.confidence).slice(0, 5);
  }

  calculateFlexibleSimilarity(script, movie) {
    let similarity = 0;
    
    // Similitud entre variaciones de títulos
    let maxTitleSim = 0;
    script.titleVariations.forEach(scriptVar => {
      movie.nameVariations.forEach(movieVar => {
        const sim = this.jaccardSimilarity(scriptVar, movieVar);
        maxTitleSim = Math.max(maxTitleSim, sim);
      });
    });
    
    similarity += maxTitleSim * 0.6;
    
    // Similitud de palabras clave
    const scriptWords = new Set(script.cleanTitle.split(/\s+/).filter(w => w.length > 3));
    const movieWords = new Set(movie.cleanName.split(/\s+/).filter(w => w.length > 3));
    
    const intersection = [...scriptWords].filter(word => 
      [...movieWords].some(mw => mw.includes(word) || word.includes(mw))
    );
    
    const union = new Set([...scriptWords, ...movieWords]);
    const wordSimilarity = intersection.length / union.size;
    
    similarity += wordSimilarity * 0.3;
    
    // Bonus por año
    if (script.year && movie.year && Math.abs(script.year - movie.year) <= 2) {
      similarity += 0.1;
    }
    
    return similarity;
  }

  jaccardSimilarity(str1, str2) {
    const words1 = new Set(str1.split(/\s+/));
    const words2 = new Set(str2.split(/\s+/));
    
    const intersection = [...words1].filter(word => words2.has(word));
    const union = new Set([...words1, ...words2]);
    
    return intersection.length / union.size;
  }

  removeDuplicateMatches(matches) {
    const seen = new Set();
    return matches.filter(match => {
      const key = match.movie.path;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  async exportResults(totalScripts) {
    const results = {
      timestamp: new Date().toISOString(),
      analysis: 'improved_matching',
      summary: {
        totalScripts,
        exactMatches: this.exactMatches.length,
        successRate: (this.exactMatches.length / totalScripts * 100).toFixed(1) + '%'
      },
      matches: this.exactMatches.map(match => ({
        script: {
          title: match.script.originalTitle,
          slug: match.script.slug,
          year: match.script.year,
          scenes: match.script.stats?.scenes || 0
        },
        movies: match.matches.map(m => ({
          filename: m.movie.originalFilename,
          confidence: m.confidence,
          reason: m.reason,
          year: m.movie.year,
          size: m.movie.size,
          quality: this.classifyQuality(m.movie.size)
        }))
      }))
    };
    
    const filename = `improved-matches-${Date.now()}.json`;
    await fs.writeFile(filename, JSON.stringify(results, null, 2));
    
    console.log(`\n💾 Resultados exportados: ${filename}`);
    return filename;
  }

  // Métodos auxiliares
  extractYear(text) {
    const match = text.match(/(\d{4})/);
    return match ? parseInt(match[1]) : null;
  }

  cleanMovieName(filename) {
    return filename
      .toLowerCase()
      .replace(/\.(mp4|mkv|avi|mov|m4v|wmv|flv|webm|ts|mts|m2ts|3gp|ogv|divx)$/i, '')
      .replace(/[\[\]()]/g, ' ')
      .replace(/\d{4}/g, '') // Remover años por separado
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
    if (size > 2 * 1024 * 1024 * 1024) return 'high';
    if (size > 500 * 1024 * 1024) return 'medium';
    return 'low';
  }
}

// Ejecutar análisis mejorado
const matcher = new ImprovedMatcher();
matcher.findRealMatches().catch(console.error);