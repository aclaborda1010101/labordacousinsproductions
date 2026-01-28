import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GUIONES_DIR = path.join(__dirname, '..', '..', 'guiones');
const FILMS_DIR = path.join(GUIONES_DIR, 'peliculas');
const SERIES_DIR = path.join(GUIONES_DIR, 'series');

[GUIONES_DIR, FILMS_DIR, SERIES_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const delay = ms => new Promise(r => setTimeout(r, ms));

async function downloadPDF(slug, destDir) {
  const pdfUrl = `https://assets.scriptslug.com/live/pdf/scripts/${slug}.pdf`;
  const filePath = path.join(destDir, `${slug}.pdf`);
  
  if (fs.existsSync(filePath)) {
    const stats = fs.statSync(filePath);
    if (stats.size > 1000) return { slug, status: 'exists' };
    fs.unlinkSync(filePath); // Remove empty/corrupted files
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
  console.log(`\n⬇️  Downloading ${slugs.length} ${type} to ${destDir}`);
  
  let downloaded = 0, existed = 0, failed = 0;
  const progressFile = path.join(__dirname, `${type}-download-progress.json`);
  
  for (let i = 0; i < slugs.length; i++) {
    const slug = slugs[i];
    const result = await downloadPDF(slug, destDir);
    
    if (result.status === 'downloaded') downloaded++;
    else if (result.status === 'exists') existed++;
    else failed++;
    
    if ((i + 1) % 25 === 0 || i === slugs.length - 1) {
      const pct = ((i + 1) / slugs.length * 100).toFixed(1);
      console.log(`  [${type}] ${i + 1}/${slugs.length} (${pct}%) | +${downloaded} =${existed} x${failed}`);
      fs.writeFileSync(progressFile, JSON.stringify({ 
        total: slugs.length, processed: i + 1, downloaded, existed, failed,
        timestamp: new Date().toISOString()
      }, null, 2));
    }
    
    await delay(250);
  }
  
  return { downloaded, existed, failed, total: slugs.length };
}

async function main() {
  console.log('🚀 Downloading all ScriptSlug PDFs...\n');
  
  // Load slugs
  const filmSlugs = JSON.parse(fs.readFileSync(path.join(__dirname, 'film-slugs.json'), 'utf-8'));
  const seriesSlugs = JSON.parse(fs.readFileSync(path.join(__dirname, 'series-slugs.json'), 'utf-8'));
  
  console.log(`📊 To download: ${filmSlugs.length} films + ${seriesSlugs.length} series = ${filmSlugs.length + seriesSlugs.length} total`);
  
  // Download films
  const filmResults = await downloadAll(filmSlugs, FILMS_DIR, 'films');
  
  // Download series
  const seriesResults = await downloadAll(seriesSlugs, SERIES_DIR, 'series');
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 DOWNLOAD COMPLETE:');
  console.log(`  🎬 Films:  ${filmResults.downloaded} new, ${filmResults.existed} existed, ${filmResults.failed} failed`);
  console.log(`  📺 Series: ${seriesResults.downloaded} new, ${seriesResults.existed} existed, ${seriesResults.failed} failed`);
  console.log('='.repeat(60));
  
  // Save final summary
  fs.writeFileSync(path.join(__dirname, 'download-summary.json'), JSON.stringify({
    films: filmResults,
    series: seriesResults,
    completedAt: new Date().toISOString()
  }, null, 2));
  
  console.log('\n✅ DONE!');
}

main().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
