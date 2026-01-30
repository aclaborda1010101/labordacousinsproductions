// Parsear sitemap de ScriptSlug para obtener TODOS los scripts
const response = await fetch('https://www.scriptslug.com/sitemap.xml');
const xml = await response.text();

// Extraer URLs de scripts
const regex = /<loc>(https:\/\/www\.scriptslug\.com\/script\/[^<]+)<\/loc>/g;
const scripts = [];
let match;
while ((match = regex.exec(xml)) !== null) {
  scripts.push(match[1]);
}

console.log(`Total scripts en sitemap: ${scripts.length}`);
console.log('\nPrimeros 10:');
scripts.slice(0, 10).forEach(s => console.log(s));
console.log('\nÚltimos 10:');
scripts.slice(-10).forEach(s => console.log(s));

// Guardar lista completa
import fs from 'fs';
fs.writeFileSync('all-scripts-urls.json', JSON.stringify(scripts, null, 2));
console.log('\nGuardado en all-scripts-urls.json');
