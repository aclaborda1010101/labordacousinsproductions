// Parsear sitemap de scripts de ScriptSlug
import fs from 'fs';

const response = await fetch('https://www.scriptslug.com/sitemap-scripts.xml');
const xml = await response.text();

// Extraer URLs de scripts
const regex = /<loc>(https:\/\/www\.scriptslug\.com\/script\/([^<]+))<\/loc>/g;
const scripts = [];
let match;
while ((match = regex.exec(xml)) !== null) {
  scripts.push({ url: match[1], slug: match[2] });
}

console.log(`Total scripts en sitemap-scripts.xml: ${scripts.length}`);
console.log('\nPrimeros 10:');
scripts.slice(0, 10).forEach(s => console.log(s.slug));
console.log('\nÚltimos 10:');
scripts.slice(-10).forEach(s => console.log(s.slug));

// Guardar lista completa
fs.writeFileSync('all-scripts-from-sitemap.json', JSON.stringify(scripts, null, 2));
console.log('\nGuardado en all-scripts-from-sitemap.json');
