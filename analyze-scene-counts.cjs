const fs = require('fs');
const path = require('path');
const { PDFParse } = require('pdf-parse');

const GUIONES_DIR = path.join(__dirname, '..', 'guiones', 'peliculas');

// Comedias y películas variadas para análisis
const TARGET_SCRIPTS = [
  '22-jump-street-2014.pdf',
  'american-fiction-2023.pdf', 
  'american-hustle-2013.pdf',
  'barbie-2023.pdf',
  'bad-moms-2016.pdf',
  'booksmart-2019.pdf',
  'bridesmaids-2011.pdf',
  'crazy-rich-asians-2018.pdf',
  'deadpool-2016.pdf',
  'dont-look-up-2021.pdf',
  'easy-a-2010.pdf',
  'everything-everywhere-all-at-once-2022.pdf',
  'free-guy-2021.pdf',
  'game-night-2018.pdf',
  'get-out-2017.pdf',
  'glass-onion-2022.pdf',
  'good-boys-2019.pdf',
  'grandmas-boy-2006.pdf',
  'jojo-rabbit-2019.pdf',
  'knives-out-2019.pdf',
  'lady-bird-2017.pdf',
  'little-miss-sunshine-2006.pdf',
  'neighbors-2014.pdf',
  'palm-springs-2020.pdf',
  'parasite-2019.pdf',
  'promising-young-woman-2020.pdf',
  'ready-or-not-2019.pdf',
  'spy-2015.pdf',
  'superbad-2007.pdf',
  'the-big-sick-2017.pdf',
  'the-grand-budapest-hotel-2014.pdf',
  'the-hangover-2009.pdf',
  'the-heat-2013.pdf',
  'the-intouchables-2011.pdf',
  'the-nice-guys-2016.pdf',
  'the-other-guys-2010.pdf',
  'the-menu-2022.pdf',
  'thor-ragnarok-2017.pdf',
  'tropic-thunder-2008.pdf',
  'we-are-the-millers-2013.pdf',
  'what-we-do-in-the-shadows-2014.pdf',
  'wine-country-2019.pdf'
];

async function countScenes(pdfPath) {
  try {
    const dataBuffer = fs.readFileSync(pdfPath);
    const data = await pdfParse(dataBuffer);
    
    const text = data.text;
    const pages = data.numpages;
    
    // Count sluglines (scene headers): INT. or EXT.
    const sluglineRegex = /\b(INT\.|EXT\.|INT\/EXT\.|I\/E\.)\s+/gi;
    const matches = text.match(sluglineRegex) || [];
    const sceneCount = matches.length;
    
    return {
      pages,
      scenes: sceneCount,
      pagesPerScene: sceneCount > 0 ? (pages / sceneCount).toFixed(2) : 'N/A'
    };
  } catch (err) {
    return { error: err.message };
  }
}

async function main() {
  const results = [];
  
  // Check which target scripts exist
  const availableScripts = [];
  for (const script of TARGET_SCRIPTS) {
    const fullPath = path.join(GUIONES_DIR, script);
    if (fs.existsSync(fullPath)) {
      availableScripts.push(script);
    }
  }
  
  // If not enough targets, grab random PDFs
  if (availableScripts.length < 20) {
    const allPdfs = fs.readdirSync(GUIONES_DIR).filter(f => f.endsWith('.pdf'));
    for (const pdf of allPdfs.slice(0, 40)) {
      if (!availableScripts.includes(pdf)) {
        availableScripts.push(pdf);
      }
      if (availableScripts.length >= 40) break;
    }
  }
  
  console.log(`Analyzing ${availableScripts.length} scripts...\n`);
  
  for (const script of availableScripts) {
    const fullPath = path.join(GUIONES_DIR, script);
    const stats = await countScenes(fullPath);
    
    if (!stats.error) {
      results.push({
        title: script.replace('.pdf', ''),
        ...stats
      });
      console.log(`${script}: ${stats.scenes} scenes, ${stats.pages} pages (${stats.pagesPerScene} pg/scene)`);
    } else {
      console.log(`ERROR ${script}: ${stats.error}`);
    }
  }
  
  // Calculate averages
  const validResults = results.filter(r => r.scenes > 10); // Filter outliers
  const avgScenes = validResults.reduce((a, b) => a + b.scenes, 0) / validResults.length;
  const avgPages = validResults.reduce((a, b) => a + b.pages, 0) / validResults.length;
  const avgPagesPerScene = validResults.reduce((a, b) => a + parseFloat(b.pagesPerScene), 0) / validResults.length;
  
  console.log('\n========== SUMMARY ==========');
  console.log(`Scripts analyzed: ${validResults.length}`);
  console.log(`Average scenes: ${avgScenes.toFixed(1)}`);
  console.log(`Average pages: ${avgPages.toFixed(1)}`);
  console.log(`Average pages/scene: ${avgPagesPerScene.toFixed(2)}`);
  console.log(`\nFor 90 pages (~90 min): ${Math.round(90 / avgPagesPerScene)} scenes recommended`);
  
  // Save results
  fs.writeFileSync(
    path.join(__dirname, 'scene-analysis-results.json'),
    JSON.stringify({ results, summary: { avgScenes, avgPages, avgPagesPerScene } }, null, 2)
  );
}

main();
