// Obtener todas las categorías de ScriptSlug
const response = await fetch('https://www.scriptslug.com/browse');
const html = await response.text();

// Buscar links de scripts
const regex = /href="([^"]*script[^"]*)"/gi;
const links = new Set();
let match;
while ((match = regex.exec(html)) !== null) {
  links.add(match[1]);
}

console.log('Links encontrados:');
[...links].slice(0, 50).forEach(l => console.log(l));
console.log(`\nTotal links: ${links.size}`);

// Buscar páginas de browse
const browseRegex = /href="\/browse\/([^"]+)"/g;
const browseLinks = new Set();
while ((match = browseRegex.exec(html)) !== null) {
  browseLinks.add(match[1]);
}
console.log('\nCategorías de browse:');
[...browseLinks].forEach(l => console.log(l));
