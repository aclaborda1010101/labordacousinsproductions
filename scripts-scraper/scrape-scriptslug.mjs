/**
 * ScriptSlug Scraper - Descarga todos los guiones de scriptslug.com
 * 
 * Uso: node scrape-scriptslug.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, 'pdfs');
const METADATA_FILE = path.join(__dirname, 'scripts-metadata.json');

// Crear directorio de salida
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

const DELAY_MS = 1000; // Delay entre requests para no saturar el servidor

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithRetry(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response;
    } catch (error) {
      console.log(`  Retry ${i + 1}/${retries} for ${url}: ${error.message}`);
      await sleep(2000);
    }
  }
  throw new Error(`Failed after ${retries} retries: ${url}`);
}

// Obtener lista de scripts de una página
async function getScriptsFromPage(url) {
  console.log(`Fetching: ${url}`);
  const response = await fetchWithRetry(url);
  const html = await response.text();
  
  // Extraer links de scripts usando regex
  const scriptLinks = [];
  const regex = /href="\/script\/([^"]+)"/g;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const slug = match[1];
    if (!scriptLinks.includes(slug)) {
      scriptLinks.push(slug);
    }
  }
  
  return scriptLinks;
}

// Obtener URL del PDF de una página de script
async function getPdfUrl(slug) {
  const url = `https://www.scriptslug.com/script/${slug}`;
  const response = await fetchWithRetry(url);
  const html = await response.text();
  
  // Buscar el link al PDF
  const pdfRegex = /href="(https:\/\/assets\.scriptslug\.com\/live\/pdf\/scripts\/[^"]+\.pdf[^"]*)"/;
  const match = html.match(pdfRegex);
  
  if (match) {
    return match[1];
  }
  
  // Alternativa: buscar cualquier PDF
  const altRegex = /(https:\/\/[^"]+\.pdf[^"]*)/;
  const altMatch = html.match(altRegex);
  return altMatch ? altMatch[1] : null;
}

// Descargar PDF
async function downloadPdf(pdfUrl, filename) {
  const filepath = path.join(OUTPUT_DIR, filename);
  
  if (fs.existsSync(filepath)) {
    console.log(`  Already exists: ${filename}`);
    return true;
  }
  
  try {
    const response = await fetchWithRetry(pdfUrl);
    const buffer = await response.arrayBuffer();
    fs.writeFileSync(filepath, Buffer.from(buffer));
    console.log(`  Downloaded: ${filename}`);
    return true;
  } catch (error) {
    console.log(`  Failed to download: ${filename} - ${error.message}`);
    return false;
  }
}

// Obtener todos los scripts de una categoría
async function getAllScriptsFromCategory(category, baseUrl) {
  const allSlugs = [];
  let page = 1;
  
  while (true) {
    const url = page === 1 ? baseUrl : `${baseUrl}?page=${page}`;
    const slugs = await getScriptsFromPage(url);
    
    if (slugs.length === 0) break;
    
    const newSlugs = slugs.filter(s => !allSlugs.includes(s));
    if (newSlugs.length === 0) break;
    
    allSlugs.push(...newSlugs);
    console.log(`  ${category} page ${page}: found ${newSlugs.length} scripts (total: ${allSlugs.length})`);
    
    page++;
    await sleep(DELAY_MS);
    
    // Safety limit
    if (page > 100) break;
  }
  
  return allSlugs;
}

async function main() {
  console.log('=== ScriptSlug Scraper ===\n');
  
  // Cargar metadata existente si hay
  let metadata = {};
  if (fs.existsSync(METADATA_FILE)) {
    metadata = JSON.parse(fs.readFileSync(METADATA_FILE, 'utf8'));
    console.log(`Loaded ${Object.keys(metadata).length} existing scripts from metadata\n`);
  }
  
  // Categorías a scrapear
  const categories = [
    { name: 'films', url: 'https://www.scriptslug.com/scripts/medium/film' },
    { name: 'series', url: 'https://www.scriptslug.com/scripts/medium/series' },
  ];
  
  // Obtener todos los slugs
  const allSlugs = new Set(Object.keys(metadata));
  
  for (const cat of categories) {
    console.log(`\n=== Scraping ${cat.name} ===`);
    const slugs = await getAllScriptsFromCategory(cat.name, cat.url);
    slugs.forEach(s => allSlugs.add(s));
  }
  
  console.log(`\nTotal unique scripts: ${allSlugs.size}`);
  
  // Obtener PDFs y descargar
  let downloaded = 0;
  let failed = 0;
  let skipped = 0;
  
  for (const slug of allSlugs) {
    // Skip si ya tenemos metadata
    if (metadata[slug]?.downloaded) {
      skipped++;
      continue;
    }
    
    console.log(`\nProcessing: ${slug}`);
    
    try {
      const pdfUrl = await getPdfUrl(slug);
      
      if (!pdfUrl) {
        console.log(`  No PDF found for ${slug}`);
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
      }
      
      await sleep(DELAY_MS);
      
    } catch (error) {
      console.log(`  Error: ${error.message}`);
      metadata[slug] = { slug, error: error.message, downloaded: false };
      failed++;
    }
  }
  
  // Guardar metadata final
  fs.writeFileSync(METADATA_FILE, JSON.stringify(metadata, null, 2));
  
  console.log('\n=== SUMMARY ===');
  console.log(`Downloaded: ${downloaded}`);
  console.log(`Failed: ${failed}`);
  console.log(`Skipped (already had): ${skipped}`);
  console.log(`Total in metadata: ${Object.keys(metadata).length}`);
  console.log(`\nPDFs saved to: ${OUTPUT_DIR}`);
  console.log(`Metadata saved to: ${METADATA_FILE}`);
}

main().catch(console.error);
