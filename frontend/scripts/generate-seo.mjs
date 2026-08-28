import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const siteUrl = (process.env.VITE_SITE_URL || '').trim().replace(/\/$/, '');
if (!siteUrl || !/^https:\/\/[^\s/$.?#].[^\s]*$/i.test(siteUrl)) {
  throw new Error('VITE_SITE_URL must be set to the real public HTTPS frontend URL before a production build.');
}

const publicDir = resolve('public');
await mkdir(publicDir, { recursive: true });

const paths = ['/', '/resources', '/docs', '/about'];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${paths.map((path) => `  <url><loc>${siteUrl}${path}</loc></url>`).join('\n')}\n</urlset>\n`;
const robots = `User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: ${siteUrl}/sitemap.xml\n`;

await writeFile(resolve(publicDir, 'sitemap.xml'), sitemap, 'utf8');
await writeFile(resolve(publicDir, 'robots.txt'), robots, 'utf8');
