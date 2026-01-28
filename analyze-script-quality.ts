/**
 * Script Quality Analyzer
 * Checks all scenes against industry standards
 */

import { readFileSync } from 'fs';

const FORBIDDEN_PHRASES = [
  "algo cambia", "todo cambia", "se da cuenta", "la tensión aumenta",
  "empiezan a", "surge un conflicto", "nada volverá a ser igual",
  "algo en su interior", "una determinación", "siente que",
  "por primera vez", "de repente", "sin saber por qué",
  "suspira internamente", "piensa que", "nota que"
];

const FORBIDDEN_PATTERNS = [
  /suspira\s+(internamente|para sí)/gi,
  /piensa\s+(en|que|sobre)/gi,
  /siente\s+(una|que|como)/gi,
  /nota\s+(que|como|una)/gi,
  /algo\s+(parece|ha cambiado|es)\s+diferente/gi
];

interface SceneAnalysis {
  number: number;
  slugline: string;
  wordCount: number;
  dialogueCount: number;
  issues: string[];
  quality: 'GOOD' | 'WARNING' | 'ERROR';
}

function analyzeScene(sceneText: string, sceneNumber: number): SceneAnalysis {
  const issues: string[] = [];
  
  // Extract slugline
  const sluglineMatch = sceneText.match(/^(INT\.|EXT\.|INT\.\/EXT\.).+$/m);
  const slugline = sluglineMatch ? sluglineMatch[0] : 'NO SLUGLINE';
  
  // Word count
  const wordCount = sceneText.split(/\s+/).length;
  
  // Dialogue count (lines that are character names in caps followed by dialogue)
  const dialogueMatches = sceneText.match(/^[A-ZÁÉÍÓÚÑ]+(\s+\([^)]+\))?\s*$/gm) || [];
  const dialogueCount = dialogueMatches.length;
  
  // Check word count
  if (wordCount > 350) {
    issues.push(`Demasiado larga: ${wordCount} palabras (máx 350)`);
  } else if (wordCount > 250) {
    issues.push(`Un poco larga: ${wordCount} palabras (recomendado <250)`);
  }
  if (wordCount < 50) {
    issues.push(`Muy corta: ${wordCount} palabras (mín 80)`);
  }
  
  // Check slugline
  if (!sluglineMatch) {
    issues.push('Falta slugline (INT./EXT.)');
  }
  
  // Check forbidden phrases
  for (const phrase of FORBIDDEN_PHRASES) {
    if (sceneText.toLowerCase().includes(phrase.toLowerCase())) {
      issues.push(`Frase prohibida: "${phrase}"`);
    }
  }
  
  // Check forbidden patterns
  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(sceneText)) {
      issues.push(`Patrón prohibido: ${pattern.source}`);
    }
  }
  
  // Check for internal thoughts
  if (/\(para sí mismo\)/i.test(sceneText)) {
    issues.push('Evitar "(para sí mismo)" - show don\'t tell');
  }
  
  // Determine quality
  let quality: 'GOOD' | 'WARNING' | 'ERROR' = 'GOOD';
  if (issues.some(i => i.includes('prohibida') || i.includes('prohibido') || i.includes('Falta slugline'))) {
    quality = 'ERROR';
  } else if (issues.length > 0) {
    quality = 'WARNING';
  }
  
  return {
    number: sceneNumber,
    slugline,
    wordCount,
    dialogueCount,
    issues,
    quality
  };
}

function analyzeFullScript(scriptPath: string) {
  console.log("═".repeat(70));
  console.log("   ANÁLISIS DE CALIDAD - LA NOCHE DE REYES");
  console.log("═".repeat(70) + "\n");
  
  const content = readFileSync(scriptPath, 'utf-8');
  
  // Split into scenes (numbered)
  const sceneRegex = /\*?\*?(\d+)\.\s+(INT\.|EXT\.)/g;
  const scenes: string[] = [];
  let lastIndex = 0;
  let match;
  const matches: {index: number, num: number}[] = [];
  
  while ((match = sceneRegex.exec(content)) !== null) {
    matches.push({ index: match.index, num: parseInt(match[1]) });
  }
  
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index;
    const end = i < matches.length - 1 ? matches[i + 1].index : content.length;
    scenes.push(content.slice(start, end));
  }
  
  console.log(`📊 Escenas encontradas: ${scenes.length}\n`);
  
  const analyses: SceneAnalysis[] = [];
  let goodCount = 0;
  let warningCount = 0;
  let errorCount = 0;
  
  for (let i = 0; i < scenes.length; i++) {
    const analysis = analyzeScene(scenes[i], i + 1);
    analyses.push(analysis);
    
    if (analysis.quality === 'GOOD') goodCount++;
    else if (analysis.quality === 'WARNING') warningCount++;
    else errorCount++;
  }
  
  // Print summary by act
  console.log("ACTO 1 (Escenas 1-14):");
  console.log("-".repeat(50));
  analyses.slice(0, 14).forEach(a => {
    const icon = a.quality === 'GOOD' ? '✅' : a.quality === 'WARNING' ? '⚠️' : '❌';
    console.log(`${icon} Escena ${a.number}: ${a.wordCount} palabras ${a.issues.length > 0 ? '| ' + a.issues[0] : ''}`);
  });
  
  console.log("\nACTO 2 (Escenas 15-39):");
  console.log("-".repeat(50));
  analyses.slice(14, 39).forEach(a => {
    const icon = a.quality === 'GOOD' ? '✅' : a.quality === 'WARNING' ? '⚠️' : '❌';
    console.log(`${icon} Escena ${a.number}: ${a.wordCount} palabras ${a.issues.length > 0 ? '| ' + a.issues[0] : ''}`);
  });
  
  console.log("\nACTO 3 (Escenas 40-50):");
  console.log("-".repeat(50));
  analyses.slice(39).forEach(a => {
    const icon = a.quality === 'GOOD' ? '✅' : a.quality === 'WARNING' ? '⚠️' : '❌';
    console.log(`${icon} Escena ${a.number}: ${a.wordCount} palabras ${a.issues.length > 0 ? '| ' + a.issues[0] : ''}`);
  });
  
  // Global stats
  const totalWords = analyses.reduce((sum, a) => sum + a.wordCount, 0);
  const avgWords = Math.round(totalWords / analyses.length);
  
  console.log("\n" + "═".repeat(70));
  console.log("📊 RESUMEN GLOBAL:");
  console.log("═".repeat(70));
  console.log(`   Escenas totales: ${analyses.length}`);
  console.log(`   ✅ Buenas: ${goodCount} (${Math.round(goodCount/analyses.length*100)}%)`);
  console.log(`   ⚠️ Warnings: ${warningCount} (${Math.round(warningCount/analyses.length*100)}%)`);
  console.log(`   ❌ Errores: ${errorCount} (${Math.round(errorCount/analyses.length*100)}%)`);
  console.log(`   Palabras totales: ${totalWords}`);
  console.log(`   Promedio por escena: ${avgWords} palabras`);
  console.log(`   Páginas estimadas: ${Math.round(totalWords / 180)}`);
  console.log(`   Duración estimada: ${Math.round(analyses.length * 1.8)} minutos`);
  console.log("═".repeat(70));
  
  // List all errors
  const allErrors = analyses.filter(a => a.quality === 'ERROR');
  if (allErrors.length > 0) {
    console.log("\n❌ ESCENAS CON ERRORES (requieren corrección):");
    allErrors.forEach(a => {
      console.log(`\n   Escena ${a.number}:`);
      a.issues.forEach(i => console.log(`   - ${i}`));
    });
  }
  
  // Quality score
  const score = Math.round((goodCount / analyses.length) * 100);
  console.log("\n" + "═".repeat(70));
  console.log(`🎯 PUNTUACIÓN DE CALIDAD: ${score}/100`);
  if (score >= 80) console.log("   ✅ APROBADO - Listo para revisión humana");
  else if (score >= 60) console.log("   ⚠️ ACEPTABLE - Necesita pulido");
  else console.log("   ❌ INSUFICIENTE - Requiere regeneración");
  console.log("═".repeat(70));
}

// Run analysis
analyzeFullScript('GUION_LA_NOCHE_DE_REYES_2026-01-28.txt');
