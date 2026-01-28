const fs = require('fs');
const path = require('path');

const functionsDir = './supabase/functions';
const importLine = 'import { fetchChatCompletion, hasApiAccess } from "../_shared/lovable-compat.ts";';

// Get all function directories
const dirs = fs.readdirSync(functionsDir, { withFileTypes: true })
  .filter(d => d.isDirectory())
  .map(d => d.name);

let migrated = 0;
let skipped = 0;

dirs.forEach(funcName => {
  const indexPath = path.join(functionsDir, funcName, 'index.ts');
  
  if (!fs.existsSync(indexPath)) return;
  
  let content = fs.readFileSync(indexPath, 'utf8');
  
  // Skip if already migrated
  if (content.includes('lovable-compat')) {
    console.log(`SKIP (already migrated): ${funcName}`);
    skipped++;
    return;
  }
  
  // Skip if doesn't use LOVABLE_API_KEY
  if (!content.includes('LOVABLE_API_KEY')) {
    console.log(`SKIP (no LOVABLE_API_KEY): ${funcName}`);
    skipped++;
    return;
  }
  
  // Add import after first import statement
  const firstImportMatch = content.match(/^(import .+? from .+?;)/m);
  if (firstImportMatch) {
    const firstImport = firstImportMatch[1];
    content = content.replace(firstImport, firstImport + '\n' + importLine);
  }
  
  // Replace LOVABLE_API_KEY patterns - pattern 1
  content = content.replace(
    /const LOVABLE_API_KEY = Deno\.env\.get\(['"]LOVABLE_API_KEY['"]\);\s*\n\s*if \(!LOVABLE_API_KEY\) \{\s*\n?\s*throw new Error\([^)]+\);\s*\n?\s*\}/g,
    "if (!hasApiAccess()) throw new Error('No API key configured');"
  );
  
  // Replace LOVABLE_API_KEY patterns - pattern 2
  content = content.replace(
    /const LOVABLE_API_KEY = Deno\.env\.get\(['"]LOVABLE_API_KEY['"]\);\s*\n\s*if \(!LOVABLE_API_KEY\) throw new Error\([^)]+\);/g,
    "if (!hasApiAccess()) throw new Error('No API key configured');"
  );
  
  fs.writeFileSync(indexPath, content);
  console.log(`MIGRATED: ${funcName}`);
  migrated++;
});

console.log(`\nDone! Migrated: ${migrated}, Skipped: ${skipped}`);
