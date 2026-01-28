import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PDFS_DIR = path.join(__dirname, '..', '..', 'guiones');
const FILMS_DIR = path.join(PDFS_DIR, 'peliculas');
const SERIES_DIR = path.join(PDFS_DIR, 'series');

// Ensure directories exist
[PDFS_DIR, FILMS_DIR, SERIES_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const delay = ms => new Promise(r => setTimeout(r, ms));

async function scrapeScriptList(page, url, type) {
  console.log(`\n📋 Scraping ${type} list from ${url}...`);
  
  try {
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
  } catch (e) {
    console.log(`  Warning: Initial load timeout, continuing anyway...`);
  }
  
  await delay(3000);
  
  let lastCount = 0;
  let stableRounds = 0;
  const maxAttempts = 50; // Máximo 50 intentos de load more
  let attempts = 0;
  
  while (stableRounds < 5 && attempts < maxAttempts) {
    attempts++;
    
    const scripts = await page.$$('a[href*="/script/"]');
    const currentCount = scripts.length;
    console.log(`  [${attempts}] Found ${currentCount} scripts...`);
    
    if (currentCount === lastCount) {
      stableRounds++;
    } else {
      stableRounds = 0;
      lastCount = currentCount;
    }
    
    // Scroll to bottom
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await delay(2000);
    
    // Try to click any load more button
    try {
      const clicked = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const loadMore = buttons.find(b => 
          b.textContent.toLowerCase().includes('load') || 
          b.textContent.toLowerCase().includes('more') ||
          b.textContent.toLowerCase().includes('show')
        );
        if (loadMore) {
          loadMore.click();
          return true;
        }
        return false;
      });
      if (clicked) {
        console.log(`  Clicked load more button`);
        await delay(2000);
      }
    } catch (e) {
      // Ignore click errors
    }
  }
  
  // Extract all script slugs
  const slugs = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a[href*="/script/"]'));
    return [...new Set(links.map(a => {
      const match = a.href.match(/\/script\/([^\/\?]+)/);
      return match ? match[1] : null;
    }).filter(Boolean))];
  });
  
  console.log(`✅ Found ${slugs.length} ${type} scripts total`);
  return slugs;
}

async function downloadPDF(slug, destDir) {
  const pdfUrl = `https://assets.scriptslug.com/live/pdf/scripts/${slug}.pdf`;
  const filePath = path.join(destDir, `${slug}.pdf`);
  
  if (fs.existsSync(filePath)) {
    return { slug, status: 'exists' };
  }
  
  return new Promise((resolve) => {
    const file = fs.createWriteStream(filePath);
    const request = https.get(pdfUrl, (response) => {
      if (response.statusCode === 200) {
        response.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve({ slug, status: 'downloaded' });
        });
      } else {
        file.close();
        try { fs.unlinkSync(filePath); } catch(e) {}
        resolve({ slug, status: 'failed', code: response.statusCode });
      }
    });
    
    request.on('error', (err) => {
      file.close();
      try { fs.unlinkSync(filePath); } catch(e) {}
      resolve({ slug, status: 'error', error: err.message });
    });
    
    request.setTimeout(30000, () => {
      request.destroy();
      resolve({ slug, status: 'timeout' });
    });
  });
}

async function downloadAll(slugs, destDir, type) {
  console.log(`\n⬇️  Downloading ${slugs.length} ${type} PDFs to ${destDir}...`);
  
  let downloaded = 0, existed = 0, failed = 0;
  const progressFile = path.join(__dirname, `${type}-progress.json`);
  
  for (let i = 0; i < slugs.length; i++) {
    const slug = slugs[i];
    const result = await downloadPDF(slug, destDir);
    
    if (result.status === 'downloaded') downloaded++;
    else if (result.status === 'exists') existed++;
    else failed++;
    
    if ((i + 1) % 20 === 0 || i === slugs.length - 1) {
      console.log(`  [${type}] ${i + 1}/${slugs.length} - ${downloaded} new, ${existed} existed, ${failed} failed`);
      fs.writeFileSync(progressFile, JSON.stringify({ 
        total: slugs.length, 
        processed: i + 1, 
        downloaded, 
        existed, 
        failed,
        lastSlug: slug,
        timestamp: new Date().toISOString()
      }, null, 2));
    }
    
    // Rate limiting - 300ms between requests
    await delay(300);
  }
  
  return { downloaded, existed, failed };
}

async function main() {
  console.log('🚀 Starting ScriptSlug complete scraper...');
  console.log(`📁 PDFs will be saved to: ${PDFS_DIR}\n`);
  
  const browser = await puppeteer.launch({ 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });
  
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  await page.setDefaultTimeout(60000);
  
  // Load or scrape film slugs
  const filmSlugsFile = path.join(__dirname, 'film-slugs.json');
  let filmSlugs = [];
  if (fs.existsSync(filmSlugsFile)) {
    filmSlugs = JSON.parse(fs.readFileSync(filmSlugsFile, 'utf-8'));
    console.log(`📂 Loaded ${filmSlugs.length} existing film slugs`);
  } else {
    filmSlugs = await scrapeScriptList(page, 'https://www.scriptslug.com/scripts/medium/film', 'film');
    fs.writeFileSync(filmSlugsFile, JSON.stringify(filmSlugs, null, 2));
  }
  
  // Load or scrape series slugs
  const seriesSlugsFile = path.join(__dirname, 'series-slugs.json');
  let seriesSlugs = [];
  if (fs.existsSync(seriesSlugsFile)) {
    seriesSlugs = JSON.parse(fs.readFileSync(seriesSlugsFile, 'utf-8'));
    console.log(`📂 Loaded ${seriesSlugs.length} existing series slugs`);
  } else {
    try {
      seriesSlugs = await scrapeScriptList(page, 'https://www.scriptslug.com/scripts/medium/series', 'series');
      fs.writeFileSync(seriesSlugsFile, JSON.stringify(seriesSlugs, null, 2));
    } catch (error) {
      console.error(`❌ Error scraping series:`, error.message);
      console.log(`  Continuing with films only...`);
    }
  }
  
  await browser.close();
  
  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('📊 SCRIPT COUNTS:');
  console.log(`  Films:  ${filmSlugs.length}`);
  console.log(`  Series: ${seriesSlugs.length}`);
  console.log(`  TOTAL:  ${filmSlugs.length + seriesSlugs.length}`);
  console.log('='.repeat(50));
  
  // Download films
  if (filmSlugs.length > 0) {
    const filmResults = await downloadAll(filmSlugs, FILMS_DIR, 'film');
    console.log(`\n🎬 Films: ${filmResults.downloaded} new, ${filmResults.existed} existed, ${filmResults.failed} failed`);
  }
  
  // Download series
  if (seriesSlugs.length > 0) {
    const seriesResults = await downloadAll(seriesSlugs, SERIES_DIR, 'series');
    console.log(`\n📺 Series: ${seriesResults.downloaded} new, ${seriesResults.existed} existed, ${seriesResults.failed} failed`);
  }
  
  console.log('\n✅ SCRAPING COMPLETE!');
}

main().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
