const express = require('express');
const prisma = require('../prisma');

const router = express.Router();
const SITE_URL = 'https://www.vrcommercesolutions.com';

const STATIC_PAGES = [
  { path: '/', changefreq: 'weekly', priority: '1.0' },
  { path: '/guide.html', changefreq: 'monthly', priority: '0.7' },
  { path: '/risk-calculator.html', changefreq: 'monthly', priority: '0.6' },
  { path: '/lot-size-calculator.html', changefreq: 'monthly', priority: '0.6' },
  { path: '/xau-signal.html', changefreq: 'daily', priority: '0.6' },
  { path: '/blog', changefreq: 'weekly', priority: '0.7' },
];

router.get('/sitemap.xml', async (req, res) => {
  try {
    const posts = await prisma.blogPost.findMany({
      where: { published: true },
      select: { slug: true, publishedAt: true },
    });

    const staticEntries = STATIC_PAGES.map((p) => `
  <url>
    <loc>${SITE_URL}${p.path}</loc>
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`);

    const postEntries = posts.map((p) => `
  <url>
    <loc>${SITE_URL}/blog/${p.slug}</loc>
    <lastmod>${new Date(p.publishedAt).toISOString().slice(0, 10)}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>`);

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${staticEntries.concat(postEntries).join('')}
</urlset>
`;
    res.type('application/xml').send(xml);
  } catch (err) {
    res.status(500).send('Could not generate sitemap.');
  }
});

module.exports = router;
