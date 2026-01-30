/**
 * ScriptSlug Scraper v2 - Con Puppeteer para páginas dinámicas
 * 
 * Uso: node scrape-scriptslug-v2.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, 'pdfs');
const METADATA_FILE = path.join(__dirname, 'scripts-metadata.json');

// Crear directorio de salida
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

// Obtener lista de scripts de una página usando Puppeteer
async function getScriptsFromPage(page, url) {
  console.log(`Fetching: ${url}`);
  
  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    
    // Esperar a que cargue el contenido
    await page.waitForSelector('a[href*="/script/"]', { timeout: 10000 }).catch(() => {});
    
    // Extraer todos los links a scripts
    const scriptLinks = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a[href*="/script/"]'));
      const slugs = links
        .map(a => {
          const match = a.getAttribute('href').match(/\/script\/([^/?]+)/);
          return match ? match[1] : null;
        })
        .filter(s => s !== null);
      
      return [...new Set(slugs)]; // Remove duplicates
    });
    
    return scriptLinks;
  } catch (error) {
    console.log(`  Error fetching page: ${error.message}`);
    return [];
  }
}

// Obtener URL del PDF de una página de script
async function getPdfUrl(page, slug) {
  const url = `https://www.scriptslug.com/script/${slug}`;
  
  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    
    // Buscar el botón/link de descarga del PDF
    const pdfUrl = await page.evaluate(() => {
      // Buscar link que contenga .pdf
      const pdfLinks = Array.from(document.querySelectorAll('a[href*=".pdf"]'));
      if (pdfLinks.length > 0) {
        return pdfLinks[0].getAttribute('href');
      }
      
      // Buscar en todos los links algo que parezca un PDF
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

// Obtener todos los scripts de una categoría con paginación
async function getAllScriptsFromCategory(page, category, baseUrl) {
  const allSlugs = [];
  let pageNum = 1;
  
  while (true) {
    const url = pageNum === 1 ? baseUrl : `${baseUrl}?page=${pageNum}`;
    const slugs = await getScriptsFromPage(page, url);
    
    if (slugs.length === 0) {
      console.log(`  No more scripts found on page ${pageNum}`);
      break;
    }
    
    const newSlugs = slugs.filter(s => !allSlugs.includes(s));
    if (newSlugs.length === 0) {
      console.log(`  No new scripts on page ${pageNum}, stopping`);
      break;
    }
    
    allSlugs.push(...newSlugs);
    console.log(`  📄 ${category} page ${pageNum}: found ${newSlugs.length} new scripts (total: ${allSlugs.length})`);
    
    pageNum++;
    await sleep(randomDelay());
    
    // Safety limit
    if (pageNum > 100) {
      console.log(`  Safety limit reached at page 100`);
      break;
    }
  }
  
  return allSlugs;
}

async function main() {
  console.log('=== ScriptSlug Scraper v2 (Puppeteer) ===\n');
  
  // Cargar metadata existente
  let metadata = {};
  if (fs.existsSync(METADATA_FILE)) {
    metadata = JSON.parse(fs.readFileSync(METADATA_FILE, 'utf8'));
    console.log(`📦 Loaded ${Object.keys(metadata).length} existing scripts from metadata\n`);
  }
  
  // Lanzar browser
  console.log('🚀 Launching browser...');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  
  // Categorías a scrapear
  const categories = [
    { name: 'films', url: 'https://www.scriptslug.com/scripts/medium/film' },
    { name: 'series', url: 'https://www.scriptslug.com/scripts/medium/series' },
  ];
  
  // Obtener todos los slugs
  const allSlugs = new Set(Object.keys(metadata));
  const initialCount = allSlugs.size;
  
  for (const cat of categories) {
    console.log(`\n=== 🎬 Scraping ${cat.name} ===`);
    const slugs = await getAllScriptsFromCategory(page, cat.name, cat.url);
    slugs.forEach(s => allSlugs.add(s));
    console.log(`✓ Found ${slugs.length} ${cat.name} scripts`);
  }
  
  console.log(`\n📊 Total unique scripts: ${allSlugs.size} (${allSlugs.size - initialCount} new)`);
  
  // Obtener PDFs y descargar
  let downloaded = 0;
  let failed = 0;
  let skipped = 0;
  
  for (const slug of allSlugs) {
    // Skip si ya descargamos este script
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
      
      // Guardar metadata cada 10 scripts
      if ((downloaded + failed) % 10 === 0) {
        fs.writeFileSync(METADATA_FILE, JSON.stringify(metadata, null, 2));
        console.log(`  💾 Metadata saved`);
      }
      
      // Reportar progreso cada 50 descargas
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
  
  // Guardar metadata final
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
