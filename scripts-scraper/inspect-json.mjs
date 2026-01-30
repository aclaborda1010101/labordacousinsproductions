// Buscar datos JSON embebidos en ScriptSlug
const url = 'https://www.scriptslug.com/scripts/medium/film';

const response = await fetch(url);
const html = await response.text();

// Buscar script tags con JSON
console.log('=== BUSCANDO JSON EMBEBIDO ===\n');

const jsonRegex = /<script[^>]*>(.*?)<\/script>/gs;
let match;
let scriptCount = 0;

while ((match = jsonRegex.exec(html)) !== null) {
  const content = match[1].trim();
  
  // Buscar JSON que contenga "script" o "slug"
  if (content.includes('"slug"') || content.includes('"scripts"') || content.includes('__NUXT__')) {
    console.log(`\n=== SCRIPT #${scriptCount} ===`);
    console.log(content.substring(0, 1500));
    console.log('...\n');
    scriptCount++;
  }
}

// También buscar patrones tipo Next.js o Nuxt
console.log('\n=== BUSCANDO PATRONES DE FRAMEWORKS ===');
if (html.includes('__NUXT__')) console.log('✓ Detectado Nuxt.js');
if (html.includes('__NEXT_DATA__')) console.log('✓ Detectado Next.js');
if (html.includes('window.__INITIAL_STATE__')) console.log('✓ Detectado initial state');

// Buscar API endpoints
console.log('\n=== BUSCANDO POSIBLES API ENDPOINTS ===');
const apiRegex = /(https?:\/\/[^"'\s]+api[^"'\s]*)/gi;
const apis = html.match(apiRegex);
if (apis) {
  apis.slice(0, 5).forEach(api => console.log(api));
}
