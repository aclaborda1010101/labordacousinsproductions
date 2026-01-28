#!/usr/bin/env node
// Migration script to update all edge functions to use lovable-compat.ts

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const functionsPath = path.join(__dirname, 'supabase', 'functions');

// Find all functions with LOVABLE_API_KEY
const functionsWithKey = [];

function walkDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory() && file !== '_shared' && file !== 'node_modules') {
      walkDir(filePath);
    } else if (file === 'index.ts') {
      const content = fs.readFileSync(filePath, 'utf8');
      if (content.includes('LOVABLE_API_KEY')) {
        functionsWithKey.push(filePath);
      }
    }
  }
}

walkDir(functionsPath);

console.log(`Found ${functionsWithKey.length} functions to migrate`);

let migratedCount = 0;
let errorCount = 0;

for (const filePath of functionsWithKey) {
  const funcName = path.basename(path.dirname(filePath));
  console.log(`\nProcessing: ${funcName}`);
  
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    let modified = false;
    
    // 1. Add import if not present
    if (!content.includes('lovable-compat.ts')) {
      // Find the last import statement
      const importMatch = content.match(/(import[^;]+from\s+['"][^'"]+['"];?\s*\n)(?!import)/);
      if (importMatch) {
        const insertPos = importMatch.index + importMatch[0].length;
        const importLine = `import { fetchChatCompletion, hasApiAccess } from "../_shared/lovable-compat.ts";\n`;
        content = content.slice(0, insertPos) + importLine + content.slice(insertPos);
        modified = true;
        console.log('  + Added import');
      }
    }
    
    // 2. Replace API key checks - multiple patterns
    const patterns = [
      // Pattern: const LOVABLE_API_KEY = ...; if (!LOVABLE_API_KEY) { throw ... }
      {
        regex: /const\s+LOVABLE_API_KEY\s*=\s*Deno\.env\.get\s*\(\s*['"]LOVABLE_API_KEY['"]\s*\);\s*\n\s*if\s*\(\s*!LOVABLE_API_KEY\s*\)\s*\{\s*\n?\s*throw\s+new\s+Error\s*\([^)]+\);\s*\n?\s*\}/g,
        replace: "if (!hasApiAccess()) {\n    throw new Error('No API key configured');\n  }"
      },
      // Pattern: const LOVABLE_API_KEY = ...; if (!LOVABLE_API_KEY) throw ...;
      {
        regex: /const\s+LOVABLE_API_KEY\s*=\s*Deno\.env\.get\s*\(\s*['"]LOVABLE_API_KEY['"]\s*\);\s*\n?\s*if\s*\(\s*!LOVABLE_API_KEY\s*\)\s*throw\s+new\s+Error\s*\([^)]+\);/g,
        replace: "if (!hasApiAccess()) throw new Error('No API key configured');"
      },
      // Pattern: const LOVABLE_API_KEY = ...;\n\n if (!LOVABLE_API_KEY) ...
      {
        regex: /const\s+LOVABLE_API_KEY\s*=\s*Deno\.env\.get\s*\(\s*['"]LOVABLE_API_KEY['"]\s*\);\s*\n+\s*if\s*\(\s*!LOVABLE_API_KEY\s*\)\s*\{?\s*\n?\s*throw\s+new\s+Error\s*\([^)]+\);?\s*\n?\s*\}?/g,
        replace: "if (!hasApiAccess()) {\n    throw new Error('No API key configured');\n  }"
      },
    ];
    
    for (const pattern of patterns) {
      if (pattern.regex.test(content)) {
        content = content.replace(pattern.regex, pattern.replace);
        modified = true;
        console.log('  + Replaced API key check');
        break; // Only apply one pattern
      }
    }
    
    // 3. Replace remaining LOVABLE_API_KEY declarations (standalone)
    if (content.includes('const LOVABLE_API_KEY = Deno.env.get')) {
      content = content.replace(
        /const\s+LOVABLE_API_KEY\s*=\s*Deno\.env\.get\s*\(\s*['"]LOVABLE_API_KEY['"]\s*\);?\s*\n?/g,
        '// API key handled by lovable-compat\n'
      );
      modified = true;
      console.log('  + Removed standalone API key declaration');
    }
    
    // 4. Replace fetch calls to ai.gateway.lovable.dev
    // This is complex - we'll use a simpler regex approach
    const fetchPattern = /fetch\s*\(\s*['"]https:\/\/ai\.gateway\.lovable\.dev\/v1\/chat\/completions['"]\s*,\s*\{[^}]*method:\s*['"]POST['"][^}]*headers:\s*\{[^}]*\}[^}]*body:\s*JSON\.stringify\s*\((\{[\s\S]*?\})\s*\)[^}]*\}\s*\)/g;
    
    // Replace with fetchChatCompletion - this needs careful handling
    // For now, let's just remove the Authorization header and change to fetchChatCompletion
    if (content.includes("ai.gateway.lovable.dev")) {
      // More aggressive replacement
      content = content.replace(
        /fetch\s*\(\s*['"]https:\/\/ai\.gateway\.lovable\.dev\/v1\/chat\/completions['"],?\s*\{/g,
        'fetchChatCompletion({'
      );
      
      // Remove method: 'POST' as it's not needed
      content = content.replace(/,?\s*method:\s*['"]POST['"],?/g, '');
      
      // Remove headers with Authorization
      content = content.replace(/,?\s*headers:\s*\{[^}]*['"]Authorization['"][^}]*\},?/g, '');
      
      // Remove body: JSON.stringify wrapper
      content = content.replace(/body:\s*JSON\.stringify\s*\((\{[\s\S]*?\})\s*\)/g, '$1');
      
      // Remove signal if present (not supported by wrapper)
      content = content.replace(/,?\s*signal:\s*controller\.signal,?/g, '');
      content = content.replace(/,?\s*signal,?/g, '');
      
      modified = true;
      console.log('  + Replaced fetch calls (may need manual review)');
    }
    
    if (modified) {
      fs.writeFileSync(filePath, content);
      console.log(`  ✓ Saved ${funcName}`);
      migratedCount++;
    } else {
      console.log(`  - No changes needed or already migrated`);
    }
    
  } catch (err) {
    console.error(`  ✗ Error processing ${funcName}:`, err.message);
    errorCount++;
  }
}

console.log(`\n========================================`);
console.log(`Migration complete!`);
console.log(`  Migrated: ${migratedCount}`);
console.log(`  Errors: ${errorCount}`);
console.log(`  Remaining: ${functionsWithKey.length - migratedCount - errorCount}`);
console.log(`\n⚠️ Please review files with fetch calls - they may need manual adjustments.`);
