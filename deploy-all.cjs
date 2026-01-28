const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

process.env.SUPABASE_ACCESS_TOKEN = 'sbp_b8f7316029c690a3922251ea6be75c4d1e58c06f';

const functionsDir = './supabase/functions';
const dirs = fs.readdirSync(functionsDir, { withFileTypes: true })
  .filter(d => d.isDirectory())
  .map(d => d.name);

let deployed = 0;
let failed = 0;
let skipped = 0;
const total = dirs.length;

dirs.forEach((funcName, i) => {
  const indexPath = path.join(functionsDir, funcName, 'index.ts');
  
  if (!fs.existsSync(indexPath)) {
    console.log(`[${i+1}/${total}] SKIP (no index.ts): ${funcName}`);
    skipped++;
    return;
  }
  
  console.log(`[${i+1}/${total}] Deploying: ${funcName}...`);
  
  try {
    execSync(`npx supabase functions deploy ${funcName} --no-verify-jwt`, {
      stdio: 'pipe',
      cwd: process.cwd()
    });
    console.log(`  ✓ OK: ${funcName}`);
    deployed++;
  } catch (err) {
    console.log(`  ✗ FAILED: ${funcName}`);
    console.log(`    Error: ${err.message.split('\n')[0]}`);
    failed++;
  }
});

console.log(`\n=== DEPLOY SUMMARY ===`);
console.log(`Deployed: ${deployed}`);
console.log(`Failed: ${failed}`);
console.log(`Skipped: ${skipped}`);
