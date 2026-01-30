// Quick inspector para ver la estructura HTML de ScriptSlug
const url = 'https://www.scriptslug.com/scripts/medium/film';

const response = await fetch(url);
const html = await response.text();

// Mostrar un snippet del HTML para ver la estructura
console.log('=== HTML SNIPPET (primeros 3000 chars) ===\n');
console.log(html.substring(0, 3000));

console.log('\n\n=== BUSCANDO LINKS A /script/ ===\n');
const scriptRegex = /href="\/script\/([^"]+)"/g;
let match;
let count = 0;
while ((match = scriptRegex.exec(html)) !== null && count < 10) {
  console.log(`Found: /script/${match[1]}`);
  count++;
}

console.log(`\nTotal matches: ${(html.match(scriptRegex) || []).length}`);
