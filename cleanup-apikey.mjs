#!/usr/bin/env node
// Aggressive cleanup of remaining LOVABLE_API_KEY references

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const functionsPath = path.join(__dirname, 'supabase', 'functions');

function walkDir(dir, callback) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory() && file !== '_shared' && file !== 'node_modules') {
      walkDir(filePath, callback);
    } else if (file === 'index.ts') {
      const content = fs.readFileSync(filePath, 'utf8');
      if (content.includes('LOVABLE_API_KEY')) {
        callback(filePath, content);
      }
    }
  }
}

let fixed = 0;

walkDir(functionsPath, (filePath, content) => {
  const funcName = path.basename(path.dirname(filePath));
  console.log(`Processing: ${funcName}`);
  
  let modified = content;
  
  // Ensure import exists
  if (!modified.includes('lovable-compat.ts')) {
    const importMatch = modified.match(/(import[\s\S]*?from\s+['"][^'"]+['"];?\s*\n)(?!import)/);
    if (importMatch) {
      const insertPos = importMatch.index + importMatch[0].length;
      const importLine = `import { fetchChatCompletion, hasApiAccess } from "../_shared/lovable-compat.ts";\n`;
      modified = modified.slice(0, insertPos) + importLine + modified.slice(insertPos);
      console.log('  + Added import');
    }
  }
  
  // Remove all LOVABLE_API_KEY declarations and checks
  
  // Pattern 1: Full pattern with check
  modified = modified.replace(
    /\s*const\s+LOVABLE_API_KEY\s*=\s*Deno\.env\.get\s*\(\s*['"]LOVABLE_API_KEY['"]\s*\);\s*(?:\n\s*)?if\s*\(\s*!LOVABLE_API_KEY\s*\)\s*\{?[^}]*(?:throw|return)[^;]*;?\s*\}?/g,
    '\n  if (!hasApiAccess()) {\n    throw new Error(\'No API key configured\');\n  }'
  );
  
  // Pattern 2: Just declaration
  modified = modified.replace(
    /const\s+LOVABLE_API_KEY\s*=\s*Deno\.env\.get\s*\(\s*['"]LOVABLE_API_KEY['"]\s*\);?\s*\n?/g,
    ''
  );
  
  // Pattern 3: Check only (in case declaration was removed separately)
  modified = modified.replace(
    /\s*if\s*\(\s*!LOVABLE_API_KEY\s*\)\s*\{?[^}]*(?:throw|return)[^;]*;?\s*\}?\s*\n?/g,
    ''
  );
  
  // Pattern 4: Usage in fetch headers - replace with hasApiAccess check
  modified = modified.replace(
    /['"]Authorization['"]:\s*[`'"]Bearer\s*\$\{LOVABLE_API_KEY\}[`'"]/g,
    '// Authorization handled by fetchChatCompletion'
  );
  
  // Remove references to LOVABLE_API_KEY in conditions that weren't caught
  modified = modified.replace(
    /if\s*\(\s*!?LOVABLE_API_KEY\s*\)/g,
    'if (!hasApiAccess())'
  );
  
  if (modified !== content) {
    fs.writeFileSync(filePath, modified);
    console.log(`  ✓ Fixed ${funcName}`);
    fixed++;
  } else {
    console.log(`  - No changes`);
  }
});

console.log(`\nFixed ${fixed} files`);
