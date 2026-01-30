#!/usr/bin/env node
/**
 * V7 FINAL - Combina lo mejor de V6c y parsed-v2
 * Prioriza datos de parsed-v2 cuando están disponibles
 */

import { promises as fs } from 'fs';
import path from 'path';

const FALSE_POSITIVES = new Set([
  'FINAL', 'SHOOTING', 'SCRIPT', 'DRAFT', 'PRODUCTION', 'REVISED',
  'CONTINUED', 'CONT', 'CUT TO', 'FADE IN', 'FADE OUT',
  'INT', 'EXT', 'INTERIOR', 'EXTERIOR', 'CONTINUOUS',
  'CASTLE', 'HOUSE', 'ROOM', 'OFFICE', 'STREET', 'CAR', 'APARTMENT',
  'CASA', 'SANTA MARTA', 'SISTINE', 'CHAPEL', 'VATICAN', 'PAPAL',
  'SISTINE CHAPEL', 'APARTMENT BLOCK', 'CONCLAVE', 'BASILICA',
  'VOICE', 'MAN', 'WOMAN', 'CROWD', 'GROUP', 'PEOPLE'
]);

function isValid(name) {
  if (!name || name.length < 2 || name.length > 30) return false;
  const n = name.toUpperCase().trim();
  if (FALSE_POSITIVES.has(n)) return false;
  if (!/[AEIOU]/.test(n)) return false;
  if (/SCRIPT|DRAFT|SHOOTING|REVISED|PRODUCTION|BLOCK|CHAPEL|MARTA/.test(n)) return false;
  return true;
}

async function createV7() {
  const scriptDir = path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Z]:)/, '$1');
  const v2Dir = path.join(scriptDir, 'parsed-v2');
  const v6Dir = path.join(scriptDir, 'enriched-v6c');
  const outDir = path.join(scriptDir, 'enriched-v7');
  
  await fs.mkdir(outDir, { recursive: true });
  
  // Cargar parsed-v2
  const v2Files = new Set((await fs.readdir(v2Dir)).filter(f => f.endsWith('.json')));
  
  console.log(`\n🚀 Creando V7 FINAL\n`);
  console.log(`   Guiones con parsed-v2: ${v2Files.size}`);
  
  const v6Files = await fs.readdir(v6Dir);
  let fromV2 = 0, fromV6 = 0, total = 0;
  
  for (const f of v6Files.filter(x => x.endsWith('.json'))) {
    total++;
    let output;
    
    // ¿Tenemos parsed-v2 para este guión?
    if (v2Files.has(f)) {
      const v2Data = JSON.parse(await fs.readFile(path.join(v2Dir, f), 'utf8'));
      const v6Data = JSON.parse(await fs.readFile(path.join(v6Dir, f), 'utf8'));
      
      // Usar personajes de v2 (mejor parseados)
      const chars = (v2Data.characters || []).filter(c => isValid(c.name));
      
      // Calcular protagonista
      let protagonist = null;
      if (chars.length > 0) {
        const sorted = chars.sort((a, b) => (b.dialogueLines || 0) - (a.dialogueLines || 0));
        const winner = sorted[0];
        const second = sorted[1];
        
        const isEnsemble = sorted.length >= 3 && 
          (sorted[0].dialogueLines - sorted[2].dialogueLines) < sorted[0].dialogueLines * 0.3;
        
        protagonist = {
          name: winner.name,
          dialogueLines: winner.dialogueLines,
          confidence: isEnsemble ? 0.5 : (second ? Math.min(1, 0.6 + (winner.dialogueLines - second.dialogueLines) / winner.dialogueLines) : 1),
          isEnsemble,
          source: 'parsed-v2'
        };
      }
      
      output = {
        ...v6Data,
        characters: chars.slice(0, 40),
        v7Analysis: {
          version: '7.0',
          source: 'parsed-v2',
          protagonist,
          totalDialogues: v2Data.stats?.dialogues || 0,
          scenes: (v2Data.scenes || []).slice(0, 20).map(s => ({
            number: s.number,
            heading: s.heading,
            dialogueCount: s.dialogues?.length || 0,
            dialogues: (s.dialogues || []).slice(0, 5)
          }))
        }
      };
      
      fromV2++;
    } else {
      // Usar V6c tal cual
      const v6Data = JSON.parse(await fs.readFile(path.join(v6Dir, f), 'utf8'));
      output = {
        ...v6Data,
        v7Analysis: {
          version: '7.0',
          source: 'v6c',
          protagonist: v6Data.v6Analysis?.protagonist
        }
      };
      fromV6++;
    }
    
    await fs.writeFile(path.join(outDir, f), JSON.stringify(output, null, 2));
    
    if (total % 100 === 0) console.log(`   ✓ ${total}`);
  }
  
  console.log(`\n📊 V7 RESUMEN:`);
  console.log(`   Desde parsed-v2: ${fromV2} (datos mejorados)`);
  console.log(`   Desde V6c:       ${fromV6}`);
  console.log(`   Total:           ${total}`);
}

createV7();
