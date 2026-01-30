/**
 * Métodos auxiliares para LC Studio Analyzer
 */

class AnalyzerHelpers {
  
  // Análisis de estructura de 3 actos
  static analyzeActStructure(scenes) {
    const totalScenes = scenes.length;
    if (totalScenes === 0) return { act1: 0, act2: 0, act3: 0 };
    
    // Aproximación estándar: 25%, 50%, 25%
    const act1End = Math.floor(totalScenes * 0.25);
    const act2End = Math.floor(totalScenes * 0.75);
    
    return {
      act1: { scenes: act1End, percentage: 25 },
      act2: { scenes: act2End - act1End, percentage: 50 },
      act3: { scenes: totalScenes - act2End, percentage: 25 },
      structure: totalScenes > 20 ? 'well-structured' : 'short-form'
    };
  }

  // Análisis de ubicaciones
  static analyzeLocations(scenes) {
    const locations = {};
    const timePatterns = { day: 0, night: 0, interior: 0, exterior: 0 };
    
    scenes.forEach(scene => {
      const content = scene.content || scene.heading || '';
      
      // Extraer ubicación
      if (content.includes('INT.')) {
        timePatterns.interior++;
      } else if (content.includes('EXT.')) {
        timePatterns.exterior++;
      }
      
      // Extraer tiempo
      if (content.includes('DAY') || content.includes('DÍA')) {
        timePatterns.day++;
      } else if (content.includes('NIGHT') || content.includes('NOCHE')) {
        timePatterns.night++;
      }
      
      // Extraer ubicación específica
      const locationMatch = content.match(/(?:INT\.|EXT\.)\s*([^-]+)/);
      if (locationMatch) {
        const location = locationMatch[1].trim();
        locations[location] = (locations[location] || 0) + 1;
      }
    });
    
    return {
      locations,
      timePatterns,
      diversity: Object.keys(locations).length,
      interiorVsExterior: timePatterns.interior / Math.max(timePatterns.exterior, 1),
      dayVsNight: timePatterns.day / Math.max(timePatterns.night, 1)
    };
  }

  // Análisis de patrones de tiempo
  static analyzeTimePatterns(scenes) {
    const patterns = {
      transitions: [],
      timeProgression: 'unknown',
      seasonality: 'none',
      timeOfDayDistribution: {}
    };
    
    scenes.forEach((scene, index) => {
      const content = scene.content || scene.heading || '';
      const timeContext = this.extractTimeContext(content);
      
      if (timeContext.timeOfDay) {
        patterns.timeOfDayDistribution[timeContext.timeOfDay] = 
          (patterns.timeOfDayDistribution[timeContext.timeOfDay] || 0) + 1;
      }
      
      if (index > 0) {
        const prevScene = scenes[index - 1];
        const prevTimeContext = this.extractTimeContext(prevScene.content || prevScene.heading || '');
        
        if (timeContext.timeOfDay !== prevTimeContext.timeOfDay) {
          patterns.transitions.push({
            from: prevTimeContext.timeOfDay,
            to: timeContext.timeOfDay,
            sceneIndex: index
          });
        }
      }
    });
    
    // Determinar progresión temporal
    if (patterns.transitions.length > 0) {
      const dayToNight = patterns.transitions.filter(t => 
        t.from === 'day' && t.to === 'night').length;
      const nightToDay = patterns.transitions.filter(t => 
        t.from === 'night' && t.to === 'day').length;
      
      if (dayToNight > nightToDay * 2) {
        patterns.timeProgression = 'linear';
      } else if (Math.abs(dayToNight - nightToDay) <= 1) {
        patterns.timeProgression = 'cyclical';
      }
    }
    
    return patterns;
  }

  static extractTimeContext(content) {
    const context = {
      timeOfDay: null,
      season: null,
      weather: null
    };
    
    const lowerContent = content.toLowerCase();
    
    // Tiempo del día
    if (lowerContent.includes('day') || lowerContent.includes('día') || 
        lowerContent.includes('mañana') || lowerContent.includes('tarde')) {
      context.timeOfDay = 'day';
    } else if (lowerContent.includes('night') || lowerContent.includes('noche') || 
               lowerContent.includes('madrugada')) {
      context.timeOfDay = 'night';
    }
    
    // Estaciones
    if (lowerContent.includes('spring') || lowerContent.includes('primavera')) {
      context.season = 'spring';
    } else if (lowerContent.includes('summer') || lowerContent.includes('verano')) {
      context.season = 'summer';
    } else if (lowerContent.includes('fall') || lowerContent.includes('autumn') || 
               lowerContent.includes('otoño')) {
      context.season = 'fall';
    } else if (lowerContent.includes('winter') || lowerContent.includes('invierno')) {
      context.season = 'winter';
    }
    
    // Clima
    if (lowerContent.includes('rain') || lowerContent.includes('lluvia')) {
      context.weather = 'rainy';
    } else if (lowerContent.includes('sun') || lowerContent.includes('sol')) {
      context.weather = 'sunny';
    } else if (lowerContent.includes('snow') || lowerContent.includes('nieve')) {
      context.weather = 'snowy';
    }
    
    return context;
  }

  // Análisis de longitud promedio de diálogos
  static calculateAvgDialogueLength(dialogues) {
    if (!dialogues || dialogues.length === 0) return 0;
    
    const totalWords = dialogues.reduce((sum, dialogue) => {
      const text = dialogue.text || dialogue.content || '';
      return sum + text.split(/\s+/).length;
    }, 0);
    
    return totalWords / dialogues.length;
  }

  // Análisis de ritmo basado en escenas
  static analyzeRhythm(scenes) {
    if (!scenes || scenes.length < 3) {
      return { type: 'unknown', pattern: [], consistency: 0 };
    }
    
    const sceneLengths = scenes.map(scene => {
      const content = scene.content || '';
      return content.split(/\n/).length;
    });
    
    // Calcular variaciones
    const avgLength = sceneLengths.reduce((a, b) => a + b, 0) / sceneLengths.length;
    const variations = sceneLengths.map(length => Math.abs(length - avgLength));
    const avgVariation = variations.reduce((a, b) => a + b, 0) / variations.length;
    
    // Determinar tipo de ritmo
    let rhythmType = 'steady';
    if (avgVariation > avgLength * 0.5) {
      rhythmType = 'varied';
    } else if (avgVariation < avgLength * 0.2) {
      rhythmType = 'consistent';
    }
    
    // Detectar patrones
    const pattern = [];
    for (let i = 0; i < Math.min(sceneLengths.length - 1, 10); i++) {
      const current = sceneLengths[i];
      const next = sceneLengths[i + 1];
      
      if (next > current * 1.2) {
        pattern.push('accelerating');
      } else if (next < current * 0.8) {
        pattern.push('decelerating');
      } else {
        pattern.push('stable');
      }
    }
    
    return {
      type: rhythmType,
      avgSceneLength: avgLength,
      variation: avgVariation,
      pattern: pattern.slice(0, 5), // Primeros 5 cambios
      consistency: 1 - (avgVariation / avgLength)
    };
  }

  // Análisis de intensidad dramática
  static analyzeDramaticIntensity(dialogues) {
    if (!dialogues || dialogues.length === 0) {
      return { overall: 0, peaks: [], valleys: [] };
    }
    
    const intensityScores = dialogues.map(dialogue => {
      const text = dialogue.text || dialogue.content || '';
      const character = dialogue.character || '';
      
      let score = 0;
      
      // Marcadores de alta intensidad
      const highIntensityMarkers = [
        /[!]{2,}/g,           // Múltiples exclamaciones
        /[A-Z]{3,}/g,         // Palabras en mayúsculas
        /\bno\b/gi,           // Negaciones
        /\bmatar\b/gi,        // Violencia
        /\bamar\b/gi,         // Emociones fuertes
        /\bmuerte\b/gi,       // Temas dramáticos
      ];
      
      highIntensityMarkers.forEach(marker => {
        const matches = text.match(marker);
        if (matches) score += matches.length * 2;
      });
      
      // Longitud del texto como factor de intensidad
      score += Math.min(text.length / 100, 3);
      
      // Personajes que tienden a ser más dramáticos
      const dramaticCharacters = ['rey', 'reina', 'villano', 'antagonist'];
      if (dramaticCharacters.some(char => character.toLowerCase().includes(char))) {
        score += 1;
      }
      
      return score;
    });
    
    const overall = intensityScores.reduce((a, b) => a + b, 0) / intensityScores.length;
    const threshold = overall * 1.5;
    
    const peaks = [];
    const valleys = [];
    
    intensityScores.forEach((score, index) => {
      if (score > threshold) {
        peaks.push({ index, score, dialogue: dialogues[index] });
      } else if (score < overall * 0.5) {
        valleys.push({ index, score, dialogue: dialogues[index] });
      }
    });
    
    return {
      overall,
      peaks: peaks.slice(0, 5),      // Top 5 picos
      valleys: valleys.slice(0, 3),   // Top 3 valles
      pattern: this.identifyDramaticPattern(intensityScores)
    };
  }

  static identifyDramaticPattern(intensityScores) {
    if (intensityScores.length < 5) return 'insufficient_data';
    
    const segments = this.divideIntoSegments(intensityScores, 5);
    const segmentAverages = segments.map(segment => 
      segment.reduce((a, b) => a + b, 0) / segment.length
    );
    
    // Identificar patrón dramático
    const firstHalf = segmentAverages.slice(0, Math.floor(segmentAverages.length / 2));
    const secondHalf = segmentAverages.slice(Math.floor(segmentAverages.length / 2));
    
    const firstHalfAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const secondHalfAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
    
    if (secondHalfAvg > firstHalfAvg * 1.3) {
      return 'escalating'; // Intensidad creciente
    } else if (firstHalfAvg > secondHalfAvg * 1.3) {
      return 'descending'; // Intensidad decreciente
    } else {
      return 'steady'; // Intensidad estable
    }
  }

  static divideIntoSegments(array, numSegments) {
    const segmentSize = Math.ceil(array.length / numSegments);
    const segments = [];
    
    for (let i = 0; i < array.length; i += segmentSize) {
      segments.push(array.slice(i, i + segmentSize));
    }
    
    return segments;
  }

  // Extracción de notas de dirección
  static extractDirectionNotes(content, scenes) {
    const directionNotes = [];
    const patterns = [
      /\([^)]*\)/g,                    // Paréntesis (acotaciones)
      /\[[^\]]*\]/g,                   // Corchetes 
      /FADE IN|FADE OUT|CUT TO/gi,     // Transiciones
      /CLOSE UP|WIDE SHOT|MEDIUM SHOT/gi, // Planos
      /CAMERA/gi,                      // Referencias de cámara
      /MUSIC|SOUND|SFX/gi             // Sonido
    ];
    
    patterns.forEach(pattern => {
      const matches = content.match(pattern);
      if (matches) {
        matches.forEach(match => {
          directionNotes.push({
            type: this.classifyDirectionNote(match),
            content: match.trim(),
            frequency: (content.match(new RegExp(match.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')) || []).length
          });
        });
      }
    });
    
    return directionNotes.slice(0, 20); // Limitar a 20 más relevantes
  }

  static classifyDirectionNote(note) {
    const lowerNote = note.toLowerCase();
    
    if (lowerNote.includes('camera') || lowerNote.includes('shot') || lowerNote.includes('close') || lowerNote.includes('wide')) {
      return 'camera';
    } else if (lowerNote.includes('fade') || lowerNote.includes('cut') || lowerNote.includes('dissolve')) {
      return 'transition';
    } else if (lowerNote.includes('music') || lowerNote.includes('sound') || lowerNote.includes('sfx')) {
      return 'audio';
    } else if (lowerNote.includes('light') || lowerNote.includes('dark') || lowerNote.includes('shadow')) {
      return 'lighting';
    } else {
      return 'action';
    }
  }

  // Extracción de elementos de atmósfera
  static extractAtmosphere(content, scenes) {
    const atmosphereElements = [];
    const patterns = {
      mood: /\b(tensa?|dark|bright|mysterious|romantic|dramatic|comic|sad|happy|melanchol[íi]c[ao]?|alegre|triste|dramátic[ao]?|misterios[ao]?)\b/gi,
      setting: /\b(castle|palace|forest|city|countryside|beach|mountain|desert|castillo|palacio|bosque|ciudad|campo|playa|montaña|desierto)\b/gi,
      weather: /\b(rain|sun|storm|snow|fog|wind|lluvia|sol|tormenta|nieve|niebla|viento)\b/gi,
      emotion: /\b(fear|love|hate|anger|joy|sadness|hope|despair|miedo|amor|odio|ira|alegría|tristeza|esperanza|desesperación)\b/gi
    };
    
    Object.entries(patterns).forEach(([category, pattern]) => {
      const matches = content.match(pattern);
      if (matches) {
        matches.forEach(match => {
          atmosphereElements.push({
            category,
            element: match.toLowerCase(),
            frequency: (content.match(new RegExp(match.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')) || []).length
          });
        });
      }
    });
    
    // Eliminar duplicados y ordenar por frecuencia
    const uniqueElements = atmosphereElements.reduce((acc, elem) => {
      const key = `${elem.category}-${elem.element}`;
      if (!acc[key]) {
        acc[key] = elem;
      } else {
        acc[key].frequency += elem.frequency;
      }
      return acc;
    }, {});
    
    return Object.values(uniqueElements)
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 15);
  }

  // Extracción de elementos de iluminación
  static extractLighting(content, scenes) {
    const lightingElements = [];
    const patterns = [
      /\b(bright|dark|dim|shadow|light|sunlight|moonlight|candlelight|fire|brilliant?|oscur[ao]?|tenue|sombra|luz|sol|luna|vela|fuego)\b/gi,
      /\b(dawn|dusk|twilight|midnight|noon|amanecer|atardecer|crepúsculo|medianoche|mediodía)\b/gi,
      /\b(spotlight|lamp|torch|lantern|reflector|lámpara|antorcha|linterna)\b/gi
    ];
    
    patterns.forEach(pattern => {
      const matches = content.match(pattern);
      if (matches) {
        matches.forEach(match => {
          lightingElements.push({
            type: this.classifyLightingType(match),
            description: match.toLowerCase(),
            frequency: (content.match(new RegExp(match.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')) || []).length
          });
        });
      }
    });
    
    return lightingElements
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 10);
  }

  static classifyLightingType(lightElement) {
    const element = lightElement.toLowerCase();
    
    if (element.includes('sun') || element.includes('sol') || element.includes('bright') || element.includes('brilliant')) {
      return 'natural-bright';
    } else if (element.includes('moon') || element.includes('luna') || element.includes('twilight') || element.includes('crepúsculo')) {
      return 'natural-dim';
    } else if (element.includes('fire') || element.includes('fuego') || element.includes('candle') || element.includes('vela')) {
      return 'flame';
    } else if (element.includes('dark') || element.includes('shadow') || element.includes('oscur') || element.includes('sombra')) {
      return 'dark';
    } else {
      return 'artificial';
    }
  }

  // Extracción de elementos de sonido
  static extractSoundElements(content, scenes) {
    const soundElements = [];
    const patterns = [
      /\b(music|song|melody|sound|noise|silence|whisper|shout|scream|música|canción|melodía|sonido|ruido|silencio|susurro|grito)\b/gi,
      /\b(wind|rain|thunder|ocean|river|stream|forest|viento|lluvia|trueno|océano|río|arroyo|bosque)\b/gi,
      /\b(footsteps|door|bell|clock|phone|car|pasos|puerta|campana|reloj|teléfono|coche)\b/gi
    ];
    
    patterns.forEach(pattern => {
      const matches = content.match(pattern);
      if (matches) {
        matches.forEach(match => {
          soundElements.push({
            category: this.classifySoundElement(match),
            description: match.toLowerCase(),
            frequency: (content.match(new RegExp(match.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')) || []).length
          });
        });
      }
    });
    
    return soundElements
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 12);
  }

  static classifySoundElement(soundElement) {
    const element = soundElement.toLowerCase();
    
    if (element.includes('music') || element.includes('song') || element.includes('melody') || 
        element.includes('música') || element.includes('canción') || element.includes('melodía')) {
      return 'music';
    } else if (element.includes('wind') || element.includes('rain') || element.includes('thunder') ||
               element.includes('viento') || element.includes('lluvia') || element.includes('trueno')) {
      return 'natural';
    } else if (element.includes('whisper') || element.includes('shout') || element.includes('scream') ||
               element.includes('susurro') || element.includes('grito')) {
      return 'vocal';
    } else {
      return 'ambient';
    }
  }

  // Extracción de movimiento de cámara
  static extractCameraMovement(content, scenes) {
    const cameraMovements = [];
    const patterns = [
      /\b(pan|tilt|zoom|dolly|track|crane|handheld|steadycam|close.?up|wide.?shot|medium.?shot)\b/gi,
      /\b(follows?|moves?|swings?|turns?|focuses?|sigue|mueve|gira|enfoca)\b/gi,
      /\b(cut.?to|fade.?to|dissolve.?to|corte|fundido)\b/gi
    ];
    
    patterns.forEach(pattern => {
      const matches = content.match(pattern);
      if (matches) {
        matches.forEach(match => {
          cameraMovements.push({
            type: this.classifyCameraMovement(match),
            description: match.toLowerCase(),
            frequency: (content.match(new RegExp(match.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')) || []).length
          });
        });
      }
    });
    
    return cameraMovements
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 10);
  }

  static classifyCameraMovement(movement) {
    const move = movement.toLowerCase();
    
    if (move.includes('pan') || move.includes('tilt') || move.includes('swings') || move.includes('gira')) {
      return 'rotation';
    } else if (move.includes('zoom') || move.includes('close') || move.includes('wide')) {
      return 'zoom';
    } else if (move.includes('dolly') || move.includes('track') || move.includes('follows') || move.includes('sigue')) {
      return 'tracking';
    } else if (move.includes('cut') || move.includes('fade') || move.includes('dissolve') || move.includes('corte')) {
      return 'transition';
    } else {
      return 'movement';
    }
  }
}

module.exports = AnalyzerHelpers;