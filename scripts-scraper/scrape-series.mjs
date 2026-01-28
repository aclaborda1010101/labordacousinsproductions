import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const delay = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  console.log('🚀 Scraping series from ScriptSlug...\n');
  
  const browser = await puppeteer.launch({ 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    timeout: 120000
  });
  
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  await page.setDefaultTimeout(120000);
  await page.setDefaultNavigationTimeout(120000);
  
  console.log('📋 Loading series page...');
  await page.goto('https://www.scriptslug.com/scripts/medium/series', { 
    waitUntil: 'domcontentloaded', 
    timeout: 120000 
  });
  await delay(5000);
  
  let lastCount = 0;
  let stableRounds = 0;
  let slugs = [];
  
  for (let i = 1; i <= 100 && stableRounds < 5; i++) {
    // Extract current slugs
    slugs = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a[href*="/script/"]'));
      return [...new Set(links.map(a => {
        const match = a.href.match(/\/script\/([^\/\?]+)/);
        return match ? match[1] : null;
      }).filter(Boolean))];
    });
    
    console.log(`  [${i}] Found ${slugs.length} scripts`);
    
    // Save incrementally every 10 iterations
    if (i % 10 === 0) {
      fs.writeFileSync(
        path.join(__dirname, 'series-slugs-partial.json'), 
        JSON.stringify(slugs, null, 2)
      );
      console.log(`  💾 Saved checkpoint: ${slugs.length} slugs`);
    }
    
    if (slugs.length === lastCount) {
      stableRounds++;
    } else {
      stableRounds = 0;
      lastCount = slugs.length;
    }
    
    // Scroll and click load more
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await delay(1500);
    
    try {
      const clicked = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const loadMore = buttons.find(b => b.textContent.toLowerCase().includes('load'));
        if (loadMore) { loadMore.click(); return true; }
        return false;
      });
      if (clicked) await delay(2500);
    } catch (e) {}
  }
  
  await browser.close();
  
  // Save final
  const outFile = path.join(__dirname, 'series-slugs.json');
  fs.writeFileSync(outFile, JSON.stringify(slugs, null, 2));
  console.log(`\n✅ Saved ${slugs.length} series slugs to series-slugs.json`);
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
