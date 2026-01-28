/**
 * PDF Downloader - Descarga los PDFs de ScriptSlug
 * Uso: node download-pdfs.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PDF_DIR = path.join(__dirname, 'pdfs');
const PROGRESS_FILE = path.join(__dirname, 'download-progress.json');

// Crear directorio
if (!fs.existsSync(PDF_DIR)) {
  fs.mkdirSync(PDF_DIR, { recursive: true });
}

const DELAY_MS = 500;

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Cargar slugs
function loadSlugs() {
  const films = JSON.parse(fs.readFileSync(path.join(__dirname, 'film-slugs.json'), 'utf8'));
  const seriesFile = path.join(__dirname, 'series-slugs.json');
  const series = fs.existsSync(seriesFile) ? JSON.parse(fs.readFileSync(seriesFile, 'utf8')) : [];
  return [...new Set([...films, ...series])];
}

// Cargar progreso
function loadProgress() {
  if (fs.existsSync(PROGRESS_FILE)) {
    return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
  }
  return { downloaded: [], failed: [], lastIndex: 0 };
}

function saveProgress(progress) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

// Obtener URL del PDF
async function getPdfUrl(slug) {
  const url = `https://www.scriptslug.com/script/${slug}`;
  try {
    const response = await fetch(url);
    const html = await response.text();
    
    // Buscar link al PDF
    const match = html.match(/href="(https:\/\/assets\.scriptslug\.com\/live\/pdf\/scripts\/[^"]+\.pdf[^"]*)"/);
    return match ? match[1] : null;
  } catch (error) {
    console.log(`  Error getting PDF URL for ${slug}: ${error.message}`);
    return null;
  }
}

// Descargar PDF
async function downloadPdf(pdfUrl, filename) {
  const filepath = path.join(PDF_DIR, filename);
  
  if (fs.existsSync(filepath)) {
    return { success: true, skipped: true };
  }
  
  try {
    const response = await fetch(pdfUrl);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const buffer = await response.arrayBuffer();
    fs.writeFileSync(filepath, Buffer.from(buffer));
    return { success: true, skipped: false };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function main() {
  console.log('=== ScriptSlug PDF Downloader ===\n');
  
  const slugs = loadSlugs();
  const progress = loadProgress();
  
  console.log(`Total slugs: ${slugs.length}`);
  console.log(`Already downloaded: ${progress.downloaded.length}`);
  console.log(`Previously failed: ${progress.failed.length}`);
  console.log(`Starting from index: ${progress.lastIndex}\n`);
  
  let downloaded = 0;
  let skipped = 0;
  let failed = 0;
  
  for (let i = progress.lastIndex; i < slugs.length; i++) {
    const slug = slugs[i];
    
    // Skip if already processed
    if (progress.downloaded.includes(slug)) {
      skipped++;
      continue;
    }
    
    console.log(`[${i + 1}/${slugs.length}] Processing: ${slug}`);
    
    const pdfUrl = await getPdfUrl(slug);
    
    if (!pdfUrl) {
      console.log(`  ❌ No PDF found`);
      if (!progress.failed.includes(slug)) {
        progress.failed.push(slug);
      }
      failed++;
    } else {
      const filename = `${slug}.pdf`;
      const result = await downloadPdf(pdfUrl, filename);
      
      if (result.success) {
        if (result.skipped) {
          console.log(`  ⏭️ Already exists`);
          skipped++;
        } else {
          console.log(`  ✅ Downloaded`);
          downloaded++;
        }
        if (!progress.downloaded.includes(slug)) {
          progress.downloaded.push(slug);
        }
      } else {
        console.log(`  ❌ Download failed: ${result.error}`);
        if (!progress.failed.includes(slug)) {
          progress.failed.push(slug);
        }
        failed++;
      }
    }
    
    // Save progress every 10 items
    if ((i + 1) % 10 === 0) {
      progress.lastIndex = i + 1;
      saveProgress(progress);
      console.log(`\n--- Progress saved at ${i + 1}/${slugs.length} ---\n`);
    }
    
    await sleep(DELAY_MS);
  }
  
  // Final save
  progress.lastIndex = slugs.length;
  saveProgress(progress);
  
  console.log('\n=== SUMMARY ===');
  console.log(`Downloaded: ${downloaded}`);
  console.log(`Skipped (existed): ${skipped}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total processed: ${downloaded + skipped + failed}`);
  console.log(`\nPDFs saved to: ${PDF_DIR}`);
}

main().catch(console.error);
