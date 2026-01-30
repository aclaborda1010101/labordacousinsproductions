/**
 * ScriptSlug Scraper usando Sitemap - Descarga los 2,223 guiones
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, 'pdfs');
const METADATA_FILE = path.join(__dirname, 'scripts-metadata.json');

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

const DELAY_MS = 400;

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithRetry(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0' }
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response;
    } catch (e) {
      if (i < retries - 1) await sleep(2000);
    }
  }
  return null;
}

async function getPdfUrl(slug) {
  const url = `https://www.scriptslug.com/script/${slug}`;
  const response = await fetchWithRetry(url);
  if (!response) return null;
  
  const html = await response.text();
  const pdfRegex = /href="(https:\/\/assets\.scriptslug\.com\/live\/pdf\/scripts\/[^"]+\.pdf[^"]*)"/;
  const match = html.match(pdfRegex);
  return match ? match[1] : null;
}

async function downloadPdf(pdfUrl, filename) {
  const filepath = path.join(OUTPUT_DIR, filename);
  if (fs.existsSync(filepath)) return 'exists';
  
  const response = await fetchWithRetry(pdfUrl);
  if (!response) return 'failed';
  
  const buffer = await response.arrayBuffer();
  fs.writeFileSync(filepath, Buffer.from(buffer));
  return 'downloaded';
}

async function main() {
  console.log('=== ScriptSlug Full Scraper (Sitemap) ===\n');
  
  // Cargar metadata existente
  let metadata = {};
  if (fs.existsSync(METADATA_FILE)) {
    metadata = JSON.parse(fs.readFileSync(METADATA_FILE, 'utf8'));
  }
  
  // Obtener lista del sitemap
  console.log('Fetching sitemap...');
  const sitemapRes = await fetch('https://www.scriptslug.com/sitemap-scripts.xml');
  const xml = await sitemapRes.text();
  
  const regex = /<loc>https:\/\/www\.scriptslug\.com\/script\/([^<]+)<\/loc>/g;
  const allSlugs = [];
  let match;
  while ((match = regex.exec(xml)) !== null) {
    allSlugs.push(match[1]);
  }
  
  console.log(`Found ${allSlugs.length} scripts in sitemap\n`);
  
  let stats = { downloaded: 0, exists: 0, noPdf: 0, failed: 0 };
  
  for (let i = 0; i < allSlugs.length; i++) {
    const slug = allSlugs[i];
    
    // Skip si ya descargado
    if (metadata[slug]?.downloaded) {
      stats.exists++;
      continue;
    }
    
    // Progress cada 50
    if (i % 50 === 0) {
      console.log(`\n[${i}/${allSlugs.length}] Downloaded: ${stats.downloaded}, Exists: ${stats.exists}, NoPDF: ${stats.noPdf}`);
      fs.writeFileSync(METADATA_FILE, JSON.stringify(metadata, null, 2));
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
    
    metadata[slug] = {
      slug,
      pdfUrl,
      filename: `${slug}.pdf`,
      downloaded: result !== 'failed',
      downloadedAt: new Date().toISOString()
    };
    
    if (result === 'downloaded') stats.downloaded++;
    else if (result === 'exists') stats.exists++;
    else stats.failed++;
    
    await sleep(DELAY_MS);
  }
  
  fs.writeFileSync(METADATA_FILE, JSON.stringify(metadata, null, 2));
  
  console.log('\n\n=== FINAL STATS ===');
  console.log(`Downloaded: ${stats.downloaded}`);
  console.log(`Already existed: ${stats.exists}`);
  console.log(`No PDF available: ${stats.noPdf}`);
  console.log(`Failed: ${stats.failed}`);
  console.log(`Total processed: ${allSlugs.length}`);
}

main().catch(console.error);
