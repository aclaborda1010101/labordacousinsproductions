#!/usr/bin/env node
// Final aggressive cleanup of ALL LOVABLE_API_KEY references

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
      callback(filePath);
    }
  }
}

let fixed = 0;

walkDir(functionsPath, (filePath) => {
  const funcName = path.basename(path.dirname(filePath));
  let content = fs.readFileSync(filePath, 'utf8');
  
  if (!content.includes('LOVABLE_API_KEY')) {
    return;
  }
  
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
  
  // Remove all patterns of LOVABLE_API_KEY
  const replacements = [
    // Pattern: const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')!;
    [/const\s+lovableApiKey\s*=\s*Deno\.env\.get\s*\(\s*['"]LOVABLE_API_KEY['"]\s*\)\s*!?\s*;?\s*\n?/g, ''],
    
    // Pattern: LOVABLE_API_KEY! in headers
    [/LOVABLE_API_KEY\s*!/g, 'LOVABLE_API_KEY'],
    
    // Pattern: Authorization Bearer with LOVABLE_API_KEY variable
    [/'Authorization':\s*`Bearer\s+\$\{LOVABLE_API_KEY\}`/g, "// Authorization: handled by fetchChatCompletion"],
    [/"Authorization":\s*`Bearer\s+\$\{LOVABLE_API_KEY\}`/g, "// Authorization: handled by fetchChatCompletion"],
    
    // Pattern: Authorization Bearer with lovableApiKey variable
    [/'Authorization':\s*`Bearer\s+\$\{lovableApiKey\}`/g, "// Authorization: handled by fetchChatCompletion"],
    [/"Authorization":\s*`Bearer\s+\$\{lovableApiKey\}`/g, "// Authorization: handled by fetchChatCompletion"],
    
    // Pattern: Authorization Bearer with apiKey variable
    [/'Authorization':\s*`Bearer\s+\$\{apiKey\}`/g, "// Authorization: handled by fetchChatCompletion"],
    [/"Authorization":\s*`Bearer\s+\$\{apiKey\}`/g, "// Authorization: handled by fetchChatCompletion"],
    
    // Pattern: headers: { 'Authorization': ... } block
    [/,?\s*headers:\s*\{\s*['"]Authorization['"]:\s*[^}]+\}/g, ''],
    
    // Pattern: const LOVABLE_API_KEY = ...
    [/const\s+LOVABLE_API_KEY\s*=\s*Deno\.env\.get\s*\(\s*['"]LOVABLE_API_KEY['"]\s*\)\s*;?\s*\n?/g, ''],
    
    // Pattern: if (!LOVABLE_API_KEY) ...
    [/if\s*\(\s*!LOVABLE_API_KEY\s*\)\s*\{[^}]*\}/g, "if (!hasApiAccess()) {\n    throw new Error('No API key configured');\n  }"],
    [/if\s*\(\s*!LOVABLE_API_KEY\s*\)\s*throw[^;]*;/g, "if (!hasApiAccess()) throw new Error('No API key configured');"],
    [/if\s*\(\s*!lovableApiKey\s*\)\s*\{[^}]*\}/g, "if (!hasApiAccess()) {\n    throw new Error('No API key configured');\n  }"],
    
    // Pattern: apiKey: LOVABLE_API_KEY
    [/apiKey:\s*LOVABLE_API_KEY/g, '// apiKey: handled by fetchChatCompletion'],
    [/apiKey:\s*lovableApiKey/g, '// apiKey: handled by fetchChatCompletion'],
    
    // Pattern: method: 'POST' (after fetchChatCompletion conversion)
    [/,?\s*method:\s*['"]POST['"]\s*,?/g, ''],
    
    // Pattern: remaining LOVABLE_API_KEY references with different checks  
    [/!LOVABLE_API_KEY/g, '!hasApiAccess()'],
    [/!lovableApiKey/g, '!hasApiAccess()'],
    
    // Clean up double/triple newlines
    [/\n{3,}/g, '\n\n'],
    
    // Clean up trailing commas before closing braces
    [/,(\s*\})/g, '$1'],
  ];
  
  for (const [pattern, replacement] of replacements) {
    modified = modified.replace(pattern, replacement);
  }
  
  // Final check - if still has LOVABLE_API_KEY, just comment it out
  if (modified.includes('LOVABLE_API_KEY')) {
    modified = modified.replace(/^(.*LOVABLE_API_KEY.*)$/gm, '// MIGRATED: $1');
    console.log('  ! Some LOVABLE_API_KEY refs commented out for review');
  }
  
  if (modified !== content) {
    fs.writeFileSync(filePath, modified);
    console.log(`  ✓ Fixed ${funcName}`);
    fixed++;
  }
});

console.log(`\nFixed ${fixed} files`);

// Final verification
let remaining = 0;
walkDir(functionsPath, (filePath) => {
  const content = fs.readFileSync(filePath, 'utf8');
  if (content.includes('LOVABLE_API_KEY') && !content.includes('// MIGRATED:')) {
    remaining++;
    console.log(`⚠️ Still has LOVABLE_API_KEY: ${path.basename(path.dirname(filePath))}`);
  }
});

console.log(`\nRemaining files with LOVABLE_API_KEY: ${remaining}`);
