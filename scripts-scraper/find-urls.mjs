// Probar diferentes URLs de ScriptSlug
const urls = [
  'https://www.scriptslug.com/sitemap.xml',
  'https://www.scriptslug.com/scripts',
  'https://www.scriptslug.com/scripts?page=1',
  'https://www.scriptslug.com/scripts?page=2',
  'https://www.scriptslug.com/browse',
  'https://www.scriptslug.com/browse/all',
  'https://www.scriptslug.com/browse/genre/action',
  'https://www.scriptslug.com/scripts/genre/action',
  'https://www.scriptslug.com/scripts/all',
];

for (const url of urls) {
  try {
    const res = await fetch(url);
    console.log(`${res.status} - ${url}`);
    if (res.ok) {
      const text = await res.text();
      const scriptMatches = text.match(/\/script\//g);
      console.log(`    Scripts found: ${scriptMatches ? scriptMatches.length : 0}`);
    }
  } catch (e) {
    console.log(`ERR - ${url}: ${e.message}`);
  }
}
