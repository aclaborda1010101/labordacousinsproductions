/**
 * ScriptSlug Scraper v3 - Con scroll infinito
 * 
 * Uso: node scrape-scriptslug-v3.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, 'pdfs');
const METADATA_FILE = path.join(__dirname, 'scripts-metadata.json');

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

const DELAY_MS_MIN = 500;
const DELAY_MS_MAX = 800;

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function randomDelay() {
  return DELAY_MS_MIN + Math.random() * (DELAY_MS_MAX - DELAY_MS_MIN);
}

// Scroll infinito para obtener todos los scripts
async function getAllScriptsWithScroll(page, url) {
  console.log(`Fetching with infinite scroll: ${url}`);
  
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
  await page.waitForSelector('a[href*="/script/"]', { timeout: 10000 }).catch(() => {});
  
  let previousHeight = 0;
  let scrollAttempts = 0;
  const maxScrollAttempts = 50; // Safety limit
  
  while (scrollAttempts < maxScrollAttempts) {
    // Get current scroll height
    const currentHeight = await page.evaluate(() => document.body.scrollHeight);
    
    if (currentHeight === previousHeight) {
      // No new content loaded, we're done
      break;
    }
    
    // Scroll to bottom
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    
    // Wait for content to load
    await sleep(1000);
    
    previousHeight = currentHeight;
    scrollAttempts++;
    
    // Get current count
    const currentCount = await page.evaluate(() => {
      return document.querySelectorAll('a[href*="/script/"]').length;
    });
    
    console.log(`  Scroll ${scrollAttempts}: ${currentCount} links found`);
  }
  
  // Extract all unique script slugs
  const scriptLinks = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a[href*="/script/"]'));
    const slugs = links
      .map(a => {
        const match = a.getAttribute('href').match(/\/script\/([^/?]+)/);
        return match ? match[1] : null;
      })
      .filter(s => s !== null);
    
    return [...new Set(slugs)];
  });
  
  return scriptLinks;
}

// Obtener URL del PDF
async function getPdfUrl(page, slug) {
  const url = `https://www.scriptslug.com/script/${slug}`;
  
  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    
    const pdfUrl = await page.evaluate(() => {
      const pdfLinks = Array.from(document.querySelectorAll('a[href*=".pdf"]'));
      if (pdfLinks.length > 0) {
        return pdfLinks[0].getAttribute('href');
      }
      
      const allLinks = Array.from(document.querySelectorAll('a'));
      for (const link of allLinks) {
        const href = link.getAttribute('href') || '';
        if (href.includes('assets.scriptslug.com') || href.toLowerCase().includes('download')) {
          return href;
        }
      }
      
      return null;
    });
    
    return pdfUrl;
  } catch (error) {
    console.log(`  Error getting PDF URL: ${error.message}`);
    return null;
  }
}

// Descargar PDF
async function downloadPdf(pdfUrl, filename) {
  const filepath = path.join(OUTPUT_DIR, filename);
  
  if (fs.existsSync(filepath)) {
    console.log(`  ✓ Already exists: ${filename}`);
    return true;
  }
  
  try {
    const response = await fetch(pdfUrl);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const buffer = await response.arrayBuffer();
    fs.writeFileSync(filepath, Buffer.from(buffer));
    console.log(`  ✓ Downloaded: ${filename}`);
    return true;
  } catch (error) {
    console.log(`  ✗ Failed to download: ${filename} - ${error.message}`);
    return false;
  }
}

async function main() {
  console.log('=== ScriptSlug Scraper v3 (Infinite Scroll) ===\n');
  
  // Cargar metadata existente
  let metadata = {};
  if (fs.existsSync(METADATA_FILE)) {
    metadata = JSON.parse(fs.readFileSync(METADATA_FILE, 'utf8'));
    console.log(`📦 Loaded ${Object.keys(metadata).length} existing scripts from metadata\n`);
  }
  
  console.log('🚀 Launching browser...');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  
  // Categorías
  const categories = [
    { name: 'films', url: 'https://www.scriptslug.com/scripts/medium/film' },
    { name: 'series', url: 'https://www.scriptslug.com/scripts/medium/series' },
  ];
  
  const allSlugs = new Set(Object.keys(metadata));
  const initialCount = allSlugs.size;
  
  for (const cat of categories) {
    console.log(`\n=== 🎬 Scraping ${cat.name} with infinite scroll ===`);
    const slugs = await getAllScriptsWithScroll(page, cat.url);
    slugs.forEach(s => allSlugs.add(s));
    console.log(`✓ Found ${slugs.length} ${cat.name} scripts`);
  }
  
  console.log(`\n📊 Total unique scripts: ${allSlugs.size} (${allSlugs.size - initialCount} new)`);
  
  // Descargar PDFs
  let downloaded = 0;
  let failed = 0;
  let skipped = 0;
  
  for (const slug of allSlugs) {
    if (metadata[slug]?.downloaded) {
      skipped++;
      continue;
    }
    
    console.log(`\n[${downloaded + failed + 1}/${allSlugs.size}] Processing: ${slug}`);
    
    try {
      const pdfUrl = await getPdfUrl(page, slug);
      
      if (!pdfUrl) {
        console.log(`  ⚠️  No PDF found for ${slug}`);
        metadata[slug] = { slug, pdfUrl: null, downloaded: false };
        failed++;
        continue;
      }
      
      const filename = `${slug}.pdf`;
      const success = await downloadPdf(pdfUrl, filename);
      
      metadata[slug] = {
        slug,
        pdfUrl,
        filename,
        downloaded: success,
        downloadedAt: success ? new Date().toISOString() : null
      };
      
      if (success) downloaded++;
      else failed++;
      
      if ((downloaded + failed) % 10 === 0) {
        fs.writeFileSync(METADATA_FILE, JSON.stringify(metadata, null, 2));
        console.log(`  💾 Metadata saved`);
      }
      
      if (downloaded % 50 === 0 && downloaded > 0) {
        console.log(`\n📊 ═══ PROGRESO ═══`);
        console.log(`✓ ${downloaded} guiones descargados`);
        console.log(`✗ ${failed} fallos`);
        console.log(`⊘ ${skipped} ya existían`);
        console.log(`═══════════════════\n`);
      }
      
      await sleep(randomDelay());
      
    } catch (error) {
      console.log(`  ❌ Error: ${error.message}`);
      metadata[slug] = { slug, error: error.message, downloaded: false };
      failed++;
    }
  }
  
  await browser.close();
  fs.writeFileSync(METADATA_FILE, JSON.stringify(metadata, null, 2));
  
  console.log('\n\n═══════════════════════════════');
  console.log('       RESUMEN FINAL');
  console.log('═══════════════════════════════');
  console.log(`✓ Descargados:     ${downloaded}`);
  console.log(`✗ Fallos:          ${failed}`);
  console.log(`⊘ Ya existían:     ${skipped}`);
  console.log(`📦 Total metadata: ${Object.keys(metadata).length}`);
  console.log('═══════════════════════════════');
  console.log(`\n📁 PDFs: ${OUTPUT_DIR}`);
  console.log(`📄 Metadata: ${METADATA_FILE}`);
}

main().catch(console.error);
