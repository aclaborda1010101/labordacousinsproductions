import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GUIONES_DIR = path.join(__dirname, '..', '..', 'guiones');
const FILMS_DIR = path.join(GUIONES_DIR, 'peliculas');
const SERIES_DIR = path.join(GUIONES_DIR, 'series');

[GUIONES_DIR, FILMS_DIR, SERIES_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const delay = ms => new Promise(r => setTimeout(r, ms));

function downloadPDF(slug, destDir) {
  return new Promise((resolve) => {
    const pdfUrl = `https://assets.scriptslug.com/live/pdf/scripts/${slug}.pdf`;
    const filePath = path.join(destDir, `${slug}.pdf`);
    
    // Skip if exists and is valid
    if (fs.existsSync(filePath)) {
      try {
        const stats = fs.statSync(filePath);
        if (stats.size > 5000) {
          return resolve({ slug, status: 'exists' });
        }
        fs.unlinkSync(filePath);
      } catch(e) {}
    }
    
    const file = fs.createWriteStream(filePath);
    
    const request = https.get(pdfUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 60000
    }, (response) => {
      if (response.statusCode === 200) {
        response.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve({ slug, status: 'downloaded' });
        });
        file.on('error', () => {
          file.close();
          try { fs.unlinkSync(filePath); } catch(e) {}
          resolve({ slug, status: 'write-error' });
        });
      } else if (response.statusCode === 302 || response.statusCode === 301) {
        file.close();
        try { fs.unlinkSync(filePath); } catch(e) {}
        resolve({ slug, status: 'redirect', code: response.statusCode });
      } else {
        file.close();
        try { fs.unlinkSync(filePath); } catch(e) {}
        resolve({ slug, status: 'http-error', code: response.statusCode });
      }
    });
    
    request.on('error', (err) => {
      file.close();
      try { fs.unlinkSync(filePath); } catch(e) {}
      resolve({ slug, status: 'network-error', error: err.code || err.message });
    });
    
    request.on('timeout', () => {
      request.destroy();
      file.close();
      try { fs.unlinkSync(filePath); } catch(e) {}
      resolve({ slug, status: 'timeout' });
    });
  });
}

async function downloadBatch(slugs, destDir, type, startIdx = 0) {
  console.log(`\n⬇️  [${type}] ${slugs.length} files → ${path.basename(destDir)}/`);
  
  let downloaded = 0, existed = 0, failed = 0;
  const failures = [];
  
  for (let i = startIdx; i < slugs.length; i++) {
    const slug = slugs[i];
    
    try {
      const result = await downloadPDF(slug, destDir);
      
      if (result.status === 'downloaded') {
        downloaded++;
      } else if (result.status === 'exists') {
        existed++;
      } else {
        failed++;
        failures.push({ slug, ...result });
      }
    } catch (err) {
      failed++;
      failures.push({ slug, status: 'exception', error: err.message });
    }
    
    // Progress every 50
    if ((i + 1) % 50 === 0 || i === slugs.length - 1) {
      const pct = ((i + 1) / slugs.length * 100).toFixed(1);
      console.log(`  ${i + 1}/${slugs.length} (${pct}%) | ✓${downloaded} ≡${existed} ✗${failed}`);
      
      // Save progress
      fs.writeFileSync(path.join(__dirname, `${type}-progress.json`), JSON.stringify({
        total: slugs.length,
        processed: i + 1,
        downloaded, existed, failed,
        lastSlug: slug,
        failures: failures.slice(-10),
        timestamp: new Date().toISOString()
      }, null, 2));
    }
    
    // Rate limiting
    await delay(400);
  }
  
  return { downloaded, existed, failed, total: slugs.length, failures };
}

async function main() {
  console.log('🎬 ScriptSlug PDF Downloader');
  console.log('============================\n');
  
  // Load slugs
  const filmSlugs = JSON.parse(fs.readFileSync(path.join(__dirname, 'film-slugs.json'), 'utf-8'));
  const seriesSlugs = JSON.parse(fs.readFileSync(path.join(__dirname, 'series-slugs.json'), 'utf-8'));
  
  console.log(`📊 Total: ${filmSlugs.length} films + ${seriesSlugs.length} series = ${filmSlugs.length + seriesSlugs.length}`);
  
  // Download films
  console.log('\n🎬 FILMS');
  const filmResults = await downloadBatch(filmSlugs, FILMS_DIR, 'films');
  
  // Download series  
  console.log('\n📺 SERIES');
  const seriesResults = await downloadBatch(seriesSlugs, SERIES_DIR, 'series');
  
  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('✅ COMPLETE:');
  console.log(`  🎬 Films:  ✓${filmResults.downloaded} ≡${filmResults.existed} ✗${filmResults.failed}`);
  console.log(`  📺 Series: ✓${seriesResults.downloaded} ≡${seriesResults.existed} ✗${seriesResults.failed}`);
  
  const totalNew = filmResults.downloaded + seriesResults.downloaded;
  const totalExisted = filmResults.existed + seriesResults.existed;
  console.log(`  📚 TOTAL:  ✓${totalNew} new ≡${totalExisted} existed`);
  console.log('='.repeat(50));
  
  // Save summary
  fs.writeFileSync(path.join(__dirname, 'download-summary.json'), JSON.stringify({
    films: filmResults,
    series: seriesResults,
    completedAt: new Date().toISOString()
  }, null, 2));
}

main().catch(err => {
  console.error('❌ Fatal:', err.message);
  process.exit(1);
});
