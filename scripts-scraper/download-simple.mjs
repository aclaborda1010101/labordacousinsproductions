import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILMS_DIR = 'C:/Users/aclab/clawd/guiones/peliculas';
const SERIES_DIR = 'C:/Users/aclab/clawd/guiones/series';

// Ensure dirs
[FILMS_DIR, SERIES_DIR].forEach(d => { try { fs.mkdirSync(d, { recursive: true }); } catch(e) {} });

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function downloadOne(slug, dir) {
  const file = path.join(dir, `${slug}.pdf`);
  
  // Skip if exists
  try {
    if (fs.existsSync(file) && fs.statSync(file).size > 5000) return 'skip';
  } catch(e) {}
  
  return new Promise(resolve => {
    try {
      const out = fs.createWriteStream(file);
      const req = https.get(`https://assets.scriptslug.com/live/pdf/scripts/${slug}.pdf`, {
        timeout: 45000,
        headers: { 'User-Agent': 'Mozilla/5.0' }
      }, res => {
        if (res.statusCode === 200) {
          res.pipe(out);
          out.on('finish', () => { out.close(); resolve('ok'); });
          out.on('error', () => { out.close(); resolve('err'); });
        } else {
          out.close();
          try { fs.unlinkSync(file); } catch(e) {}
          resolve('fail');
        }
      });
      req.on('error', () => { try { out.close(); fs.unlinkSync(file); } catch(e) {} resolve('err'); });
      req.on('timeout', () => { req.destroy(); resolve('timeout'); });
    } catch(e) {
      resolve('exception');
    }
  });
}

async function main() {
  process.on('uncaughtException', err => console.error('Uncaught:', err.message));
  process.on('unhandledRejection', err => console.error('Unhandled:', err));
  
  const films = JSON.parse(fs.readFileSync(path.join(__dirname, 'film-slugs.json')));
  const series = JSON.parse(fs.readFileSync(path.join(__dirname, 'series-slugs.json')));
  
  console.log(`📊 ${films.length} films + ${series.length} series = ${films.length + series.length} total\n`);
  
  let ok = 0, skip = 0, fail = 0;
  
  // Films
  console.log('🎬 FILMS:');
  for (let i = 0; i < films.length; i++) {
    try {
      const r = await downloadOne(films[i], FILMS_DIR);
      if (r === 'ok') ok++;
      else if (r === 'skip') skip++;
      else fail++;
      
      if ((i+1) % 100 === 0) console.log(`  ${i+1}/${films.length} | +${ok} =${skip} x${fail}`);
    } catch(e) {
      fail++;
    }
    await sleep(350);
  }
  console.log(`  DONE: ${films.length} | +${ok} =${skip} x${fail}`);
  
  // Series
  ok = 0; skip = 0; fail = 0;
  console.log('\n📺 SERIES:');
  for (let i = 0; i < series.length; i++) {
    try {
      const r = await downloadOne(series[i], SERIES_DIR);
      if (r === 'ok') ok++;
      else if (r === 'skip') skip++;
      else fail++;
      
      if ((i+1) % 100 === 0) console.log(`  ${i+1}/${series.length} | +${ok} =${skip} x${fail}`);
    } catch(e) {
      fail++;
    }
    await sleep(350);
  }
  console.log(`  DONE: ${series.length} | +${ok} =${skip} x${fail}`);
  
  console.log('\n✅ COMPLETE');
}

main();
