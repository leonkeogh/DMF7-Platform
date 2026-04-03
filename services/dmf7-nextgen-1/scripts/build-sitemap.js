const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://dmf7.ai';
const ROOT_DIR = '/var/www/dmf7';
const GENERATED_DIR = path.join(ROOT_DIR, 'generated');
const SITEMAP_PATH = path.join(ROOT_DIR, 'sitemap.xml');
const ROBOTS_PATH = path.join(ROOT_DIR, 'robots.txt');

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      out.push(full);
    }
  }
  return out;
}

function toUrl(filePath) {
  const rel = path.relative(ROOT_DIR, filePath).replace(/\\/g, '/');
  return `${BASE_URL}/${rel}`;
}

const files = walk(GENERATED_DIR);

const urls = files.map(file => {
  const stat = fs.statSync(file);
  return `  <url>
    <loc>${toUrl(file)}</loc>
    <lastmod>${stat.mtime.toISOString()}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>`;
}).join('\n');

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;

fs.writeFileSync(SITEMAP_PATH, sitemap);

const robots = `User-agent: *
Allow: /

Sitemap: ${BASE_URL}/sitemap.xml
`;

fs.writeFileSync(ROBOTS_PATH, robots);

console.log(`sitemap: ${SITEMAP_PATH}`);
console.log(`robots: ${ROBOTS_PATH}`);
console.log(`urls: ${files.length}`);
