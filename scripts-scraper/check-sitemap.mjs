// Ver contenido del sitemap
const response = await fetch('https://www.scriptslug.com/sitemap.xml');
const xml = await response.text();
console.log('Sitemap content (first 5000 chars):');
console.log(xml.substring(0, 5000));
