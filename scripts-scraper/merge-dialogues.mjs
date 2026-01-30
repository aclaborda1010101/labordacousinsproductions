#!/usr/bin/env node
/**
 * Merge diálogos del parsed-v2 a los enriched-v6c
 * Añade texto real de diálogos a los guiones
 */

import { promises as fs } from 'fs';
import path from 'path';

async function mergeDialogues() {
  const scriptDir = path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Z]:)/, '$1');
  const v2Dir = path.join(scriptDir, 'parsed-v2');
  const v6Dir = path.join(scriptDir, 'enriched-v6c');
  const outDir = path.join(scriptDir, 'enriched-v7');
  
  await fs.mkdir(outDir, { recursive: true });
  
  // Cargar todos los parsed-v2
  const v2Files = await fs.readdir(v2Dir);
  const v2Map = {};
  
  for (const f of v2Files.filter(x => x.endsWith('.json'))) {
    const data = JSON.parse(await fs.readFile(path.join(v2Dir, f), 'utf8'));
    const slug = data.slug || f.replace('.json', '');
    v2Map[slug] = data;
  }
  
  console.log(`\n🚀 Merge de diálogos: ${Object.keys(v2Map).length} guiones con diálogos\n`);
  
  // Procesar todos los v6c
  const v6Files = await fs.readdir(v6Dir);
  let merged = 0, noDialogues = 0;
  
  for (const f of v6Files.filter(x => x.endsWith('.json'))) {
    const v6Data = JSON.parse(await fs.readFile(path.join(v6Dir, f), 'utf8'));
    const slug = v6Data.slug || f.replace('.json', '');
    
    // ¿Tenemos diálogos para este guión?
    const v2Data = v2Map[slug];
    
    if (v2Data && v2Data.scenes) {
      // Añadir diálogos
      v6Data.dialoguesData = {
        source: 'parsed-v2',
        totalDialogues: v2Data.stats?.dialogues || 0,
        scenes: v2Data.scenes.slice(0, 20).map(s => ({
          number: s.number,
          heading: s.heading,
          dialogues: s.dialogues?.slice(0, 10) || []
        }))
      };
      
      // Añadir samples de diálogos del protagonista
      const protName = v6Data.v6Analysis?.protagonist?.name?.toUpperCase();
      if (protName) {
        const protDialogues = [];
        for (const scene of v2Data.scenes) {
          for (const d of (scene.dialogues || [])) {
            if (d.character?.toUpperCase() === protName && protDialogues.length < 5) {
              protDialogues.push(d.text?.substring(0, 200));
            }
          }
        }
        v6Data.protagonistDialogues = protDialogues;
      }
      
      merged++;
    } else {
      noDialogues++;
    }
    
    // Guardar
    await fs.writeFile(path.join(outDir, f), JSON.stringify(v6Data, null, 2));
  }
  
  console.log(`📊 RESUMEN:`);
  console.log(`   ✅ Con diálogos: ${merged}`);
  console.log(`   ❌ Sin diálogos: ${noDialogues}`);
  console.log(`   📁 Guardados en: ${outDir}`);
}

mergeDialogues();
