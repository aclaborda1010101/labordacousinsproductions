/**
 * ScriptSlug Full Scraper - Obtiene TODOS los guiones
 * Scrapea por letras del alfabeto: /browse/title/a, /browse/title/b, etc.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, 'pdfs');
const METADATA_FILE = path.join(__dirname, 'scripts-metadata-full.json');

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

const DELAY_MS = 600;

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
      console.log(`  Retry ${i + 1}/${retries}: ${error.message}`);
      await sleep(2000);
    }
  }
  throw new Error(`Failed: ${url}`);
}

async function getScriptsFromPage(url) {
  const response = await fetchWithRetry(url);
  const html = await response.text();
  
  const slugs = [];
  const regex = /href="\/script\/([^"]+)"/g;
  let match;
  while ((match = regex.exec(html)) !== null) {
    if (!slugs.includes(match[1])) slugs.push(match[1]);
  }
  return slugs;
}

async function getAllFromLetter(letter) {
  const slugs = [];
  let page = 1;
  
  while (true) {
    const url = `https://www.scriptslug.com/browse/title/${letter}?page=${page}`;
    console.log(`  Fetching: ${url}`);
    
    try {
      const newSlugs = await getScriptsFromPage(url);
      if (newSlugs.length === 0) break;
      
      const unique = newSlugs.filter(s => !slugs.includes(s));
      if (unique.length === 0) break;
      
      slugs.push(...unique);
      console.log(`    Found ${unique.length} new (total ${letter}: ${slugs.length})`);
      
      page++;
      await sleep(DELAY_MS);
      if (page > 50) break;
    } catch (e) {
      console.log(`    Error: ${e.message}`);
      break;
    }
  }
  
  return slugs;
}

async function getPdfUrl(slug) {
  const url = `https://www.scriptslug.com/script/${slug}`;
  const response = await fetchWithRetry(url);
  const html = await response.text();
  
  const pdfRegex = /href="(https:\/\/assets\.scriptslug\.com\/live\/pdf\/scripts\/[^"]+\.pdf[^"]*)"/;
  const match = html.match(pdfRegex);
  return match ? match[1] : null;
}

async function downloadPdf(pdfUrl, filename) {
  const filepath = path.join(OUTPUT_DIR, filename);
  if (fs.existsSync(filepath)) return 'skipped';
  
  try {
    const response = await fetchWithRetry(pdfUrl);
    const buffer = await response.arrayBuffer();
    fs.writeFileSync(filepath, Buffer.from(buffer));
    return 'downloaded';
  } catch (e) {
    return 'failed';
  }
}

async function main() {
  console.log('=== ScriptSlug FULL Scraper ===\n');
  
  let metadata = {};
  if (fs.existsSync(METADATA_FILE)) {
    metadata = JSON.parse(fs.readFileSync(METADATA_FILE, 'utf8'));
    console.log(`Loaded ${Object.keys(metadata).length} existing\n`);
  }
  
  // Alfabeto + números
  const letters = 'abcdefghijklmnopqrstuvwxyz0'.split('');
  const allSlugs = new Set(Object.keys(metadata));
  
  for (const letter of letters) {
    console.log(`\n=== Letter: ${letter.toUpperCase()} ===`);
    const slugs = await getAllFromLetter(letter);
    slugs.forEach(s => allSlugs.add(s));
    console.log(`Total unique so far: ${allSlugs.size}`);
  }
  
  console.log(`\n=== Downloading ${allSlugs.size} scripts ===\n`);
  
  let stats = { downloaded: 0, skipped: 0, failed: 0, noPdf: 0 };
  
  for (const slug of allSlugs) {
    if (metadata[slug]?.downloaded) {
      stats.skipped++;
      continue;
    }
    
    process.stdout.write(`${slug}... `);
    
    const pdfUrl = await getPdfUrl(slug);
    if (!pdfUrl) {
      console.log('no PDF');
      metadata[slug] = { slug, downloaded: false };
      stats.noPdf++;
      await sleep(DELAY_MS);
      continue;
    }
    
    const result = await downloadPdf(pdfUrl, `${slug}.pdf`);
    console.log(result);
    
    metadata[slug] = { slug, pdfUrl, downloaded: result === 'downloaded' || result === 'skipped' };
    stats[result]++;
    
    if ((stats.downloaded + stats.failed) % 20 === 0) {
      fs.writeFileSync(METADATA_FILE, JSON.stringify(metadata, null, 2));
    }
    
    await sleep(DELAY_MS);
  }
  
  fs.writeFileSync(METADATA_FILE, JSON.stringify(metadata, null, 2));
  
  console.log('\n=== DONE ===');
  console.log(`Downloaded: ${stats.downloaded}`);
  console.log(`Skipped: ${stats.skipped}`);
  console.log(`Failed: ${stats.failed}`);
  console.log(`No PDF: ${stats.noPdf}`);
  console.log(`Total: ${allSlugs.size}`);
}

main().catch(console.error);
