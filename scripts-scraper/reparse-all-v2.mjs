/**
 * Reparsea todos los PDFs con el parser V2 corregido
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parsePDF, extractScenes } from './parse-scripts-v2.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function reparseAll() {
  const pdfDir = path.join(__dirname, 'pdfs');
  const outputDir = path.join(__dirname, 'parsed-v2');
  
  // Crear directorio de salida
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  const files = fs.readdirSync(pdfDir).filter(f => f.endsWith('.pdf'));
  console.log(`\n🚀 Reparsing ${files.length} PDFs con parser V2\n`);
  
  const stats = {
    success: 0,
    errors: 0,
    totalScenes: 0,
    totalDialogues: 0
  };
  
  for (const file of files) {
    try {
      const pdfPath = path.join(pdfDir, file);
      const text = await parsePDF(pdfPath);
      const scenes = extractScenes(text);
      
      // Extraer título del nombre del archivo
      const slug = file.replace('.pdf', '');
      const title = slug.split('-').slice(0, -1).map(w => 
        w.charAt(0).toUpperCase() + w.slice(1)
      ).join(' ');
      
      // Calcular estadísticas de personajes
      const charStats = {};
      for (const scene of scenes) {
        for (const d of scene.dialogues) {
          if (!charStats[d.character]) {
            charStats[d.character] = { lines: 0, words: 0 };
          }
          charStats[d.character].lines++;
          charStats[d.character].words += d.text.split(/\s+/).length;
        }
      }
      
      const characters = Object.entries(charStats)
        .map(([name, s]) => ({ name, dialogueLines: s.lines, totalWords: s.words }))
        .sort((a, b) => b.dialogueLines - a.dialogueLines);
      
      const output = {
        slug,
        title,
        parsedWith: 'v2',
        parsedAt: new Date().toISOString(),
        stats: {
          scenes: scenes.length,
          dialogues: scenes.reduce((s, sc) => s + sc.dialogue_count, 0),
          characters: characters.length
        },
        characters: characters.slice(0, 50),
        scenes: scenes.map(s => ({
          number: s.scene_number,
          heading: s.heading,
          characters: s.characters,
          dialogues: s.dialogues,
          actionPreview: s.action_text.substring(0, 300)
        }))
      };
      
      fs.writeFileSync(
        path.join(outputDir, `${slug}.json`),
        JSON.stringify(output, null, 2)
      );
      
      stats.success++;
      stats.totalScenes += scenes.length;
      stats.totalDialogues += output.stats.dialogues;
      
      console.log(`✅ ${file}: ${scenes.length} escenas, ${output.stats.dialogues} diálogos`);
      
    } catch (err) {
      stats.errors++;
      console.error(`❌ ${file}: ${err.message}`);
    }
  }
  
  console.log(`\n📊 RESUMEN:`);
  console.log(`   ✅ Éxitos: ${stats.success}`);
  console.log(`   ❌ Errores: ${stats.errors}`);
  console.log(`   🎬 Total escenas: ${stats.totalScenes}`);
  console.log(`   💬 Total diálogos: ${stats.totalDialogues}`);
  console.log(`   📁 Guardados en: ${outputDir}`);
}

reparseAll();
